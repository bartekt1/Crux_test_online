// Unix timestamps from synced firmware are > 1.5 billion (after year 2017).
// Boot-relative fallback timestamps are tiny (< ~1 million = 11 days from boot).
// When real: show actual session start; when boot-relative: show sync date.
export function sessionDisplayDate(startTimestamp: number, syncedAt: Date): Date {
  return startTimestamp > 1_500_000_000 ? new Date(startTimestamp * 1000) : syncedAt
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m ${s}s`
  return `${s}s`
}

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  }).format(date)
}

// Elapsed seconds → "m:ss" label for chart x-axis
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${String(s).padStart(2, '0')}`
}
