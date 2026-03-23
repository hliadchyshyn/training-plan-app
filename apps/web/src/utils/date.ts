/** Format date as "23.03.26" */
export function formatDate(date: string | Date): string {
  const d = new Date(date)
  const day = d.getDate().toString().padStart(2, '0')
  const month = (d.getMonth() + 1).toString().padStart(2, '0')
  const year = d.getFullYear().toString().slice(2)
  return `${day}.${month}.${year}`
}

/** Format a week range as "21-28.03.26" (or "28.03-03.04.26" if crosses month) */
export function formatWeekRange(weekStart: string | Date): string {
  const start = new Date(weekStart)
  const end = new Date(start)
  end.setDate(start.getDate() + 6)

  const sd = start.getDate().toString().padStart(2, '0')
  const sm = (start.getMonth() + 1).toString().padStart(2, '0')
  const ed = end.getDate().toString().padStart(2, '0')
  const em = (end.getMonth() + 1).toString().padStart(2, '0')
  const year = end.getFullYear().toString().slice(2)

  if (sm === em) {
    return `${sd}-${ed}.${em}.${year}`
  }
  return `${sd}.${sm}-${ed}.${em}.${year}`
}
