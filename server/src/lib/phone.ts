const LOCAL_DIGITS = /^0[2-9]\d{7,8}$/;
const E164 = /^\+972[2-9]\d{7,8}$/;

export function normalizePhone(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const compact = trimmed.replace(/[\s\-().]/g, "");
  let candidate = compact;

  if (candidate.startsWith("00")) {
    candidate = `+${candidate.slice(2)}`;
  } else if (candidate.startsWith("972")) {
    candidate = `+${candidate}`;
  } else if (LOCAL_DIGITS.test(candidate)) {
    candidate = `+972${candidate.slice(1)}`;
  }

  return E164.test(candidate) ? candidate : null;
}
