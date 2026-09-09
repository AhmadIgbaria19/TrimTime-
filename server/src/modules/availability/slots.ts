export type TimeRange = {
  start: number;
  end: number;
};

export function timeToMinutes(value: string) {
  const [hours, minutes] = value.split(":").map(Number);
  return hours * 60 + minutes;
}

export function minutesToTime(total: number) {
  const hours = Math.floor(total / 60);
  const minutes = total % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function mergeRanges(ranges: TimeRange[]) {
  const sorted = [...ranges].filter((range) => range.end > range.start).sort((a, b) => a.start - b.start);
  const merged: TimeRange[] = [];

  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.start > last.end) {
      merged.push({ ...range });
    } else {
      last.end = Math.max(last.end, range.end);
    }
  }

  return merged;
}

export function subtractBusy(work: TimeRange[], busy: TimeRange[]) {
  const open = mergeRanges(work);
  const blocked = mergeRanges(busy);
  const free: TimeRange[] = [];

  for (const window of open) {
    let cursor = window.start;
    const overlaps = blocked.filter((item) => item.start < window.end && item.end > window.start);

    for (const item of overlaps) {
      const cutStart = Math.max(item.start, window.start);
      const cutEnd = Math.min(item.end, window.end);
      if (cutStart > cursor) {
        free.push({ start: cursor, end: cutStart });
      }
      cursor = Math.max(cursor, cutEnd);
    }

    if (cursor < window.end) {
      free.push({ start: cursor, end: window.end });
    }
  }

  return free;
}

export function generateSlotStarts(free: TimeRange[], durationMinutes: number) {
  if (durationMinutes <= 0) {
    return [];
  }

  const starts: number[] = [];
  for (const range of free) {
    for (let start = range.start; start + durationMinutes <= range.end; start += durationMinutes) {
      starts.push(start);
    }
  }
  return starts;
}

export function availableLocalTimes(work: TimeRange[], busy: TimeRange[], durationMinutes: number) {
  return generateSlotStarts(subtractBusy(work, busy), durationMinutes).map(minutesToTime);
}
