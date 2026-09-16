#!/usr/bin/env bash
# Run on GitHub Actions (ubuntu). Sends trimtime-deploy <sha> via SSM.
# Prints the migration diff against the live SHA when that commit is in git.
set -euo pipefail

INSTANCE_ID="${1:?usage: ssm-deploy.sh <instance-id> <git-sha>}"
NEW_SHA="${2:?usage: ssm-deploy.sh <instance-id> <git-sha>}"
REGION="${AWS_REGION:?AWS_REGION is required}"

wait_invocation() {
  local command_id="$1"
  local status="Pending"
  local i
  for i in $(seq 1 120); do
    status="$(aws ssm get-command-invocation \
      --region "$REGION" \
      --command-id "$command_id" \
      --instance-id "$INSTANCE_ID" \
      --query "Status" \
      --output text 2>/dev/null || true)"
    case "$status" in
      Success)
        return 0
        ;;
      Failed|Cancelled|TimedOut|Cancelling)
        aws ssm get-command-invocation \
          --region "$REGION" \
          --command-id "$command_id" \
          --instance-id "$INSTANCE_ID" \
          --query "{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}" \
          --output text || true
        echo "SSM command $command_id ended with $status" >&2
        return 1
        ;;
    esac
    sleep 5
  done
  echo "Timed out waiting for SSM command $command_id (last status: $status)" >&2
  return 1
}

send() {
  local comment="$1"
  local command="$2"
  local params
  params="$(jq -n --arg command "$command" '{commands:[$command]}')"
  aws ssm send-command \
    --region "$REGION" \
    --instance-ids "$INSTANCE_ID" \
    --document-name "AWS-RunShellScript" \
    --comment "$comment" \
    --timeout-seconds 900 \
    --parameters "$params" \
    --query "Command.CommandId" \
    --output text
}

LIVE_CMD="$(send "trimtime-read-live-sha" "cat /etc/trimtime/image-sha 2>/dev/null || true")"
wait_invocation "$LIVE_CMD"
LIVE_SHA="$(aws ssm get-command-invocation \
  --region "$REGION" \
  --command-id "$LIVE_CMD" \
  --instance-id "$INSTANCE_ID" \
  --query "StandardOutputContent" \
  --output text | tr -d '[:space:]')"

echo "Live SHA: ${LIVE_SHA:-<none>}"
echo "New SHA:  $NEW_SHA"

if [[ -n "$LIVE_SHA" && "$LIVE_SHA" != "$NEW_SHA" ]]; then
  if git cat-file -e "${LIVE_SHA}^{commit}" 2>/dev/null; then
    echo "Migration diff ($LIVE_SHA..$NEW_SHA):"
    git diff "$LIVE_SHA" "$NEW_SHA" -- server/src/db/migrations || true
    echo "Image rollback does not undo SQL. See docs/aws-design.md §7."
  else
    echo "Live SHA is not in this clone; skipped git diff of migrations."
  fi
fi

DEPLOY_CMD="$(send "trimtime-deploy $NEW_SHA" "sudo /usr/local/sbin/trimtime-deploy $NEW_SHA")"
wait_invocation "$DEPLOY_CMD"
aws ssm get-command-invocation \
  --region "$REGION" \
  --command-id "$DEPLOY_CMD" \
  --instance-id "$INSTANCE_ID" \
  --query "{Status:Status,Stdout:StandardOutputContent,Stderr:StandardErrorContent}" \
  --output text
echo "Deployed $NEW_SHA"
