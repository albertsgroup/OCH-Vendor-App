export function getCurrentWeekStart(): string {
  const now = new Date()
  const day = now.getDay() // 0=Sun, 1=Mon...
  const diff = day === 0 ? -6 : 1 - day // roll back to Monday
  const monday = new Date(now)
  monday.setDate(now.getDate() + diff)
  return monday.toISOString().split('T')[0]
}

export function getWeekEnd(weekStart: string): string {
  const date = new Date(weekStart + 'T00:00:00')
  date.setDate(date.getDate() + 6)
  return date.toISOString().split('T')[0]
}

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

export function formatWeekRange(weekStart: string): string {
  const [y, m, d] = weekStart.split('-').map(Number)
  const end = new Date(y, m - 1, d + 6)
  const startStr = `${MONTHS[m - 1]} ${d}`
  const endStr = `${MONTHS[end.getMonth()]} ${end.getDate()}, ${end.getFullYear()}`
  return `${startStr} – ${endStr}`
}

export function getPreviousWeeks(count: number): string[] {
  const weeks: string[] = []
  const currentStart = getCurrentWeekStart()
  for (let i = 0; i < count; i++) {
    const date = new Date(currentStart + 'T00:00:00')
    date.setDate(date.getDate() - i * 7)
    weeks.push(date.toISOString().split('T')[0])
  }
  return weeks
}
