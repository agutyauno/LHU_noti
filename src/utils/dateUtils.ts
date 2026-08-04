export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function formatDisplayDate(dateStr: string): string {
  // Converts YYYY-MM-DD to DD/MM/YYYY
  const [year, month, day] = dateStr.split('-');
  if (!year || !month || !day) return dateStr;
  return `${day}/${month}/${year}`;
}

export function getTodayString(): string {
  return formatDate(new Date());
}

export function getTomorrowString(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return formatDate(tomorrow);
}

export function getDayOfWeekName(dateStr: string): string {
  const date = new Date(dateStr);
  const dayIndex = date.getDay(); // 0 is Sunday, 1 is Monday...
  const days = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
  return days[dayIndex] || 'Thứ ?';
}

export function getSessionOfDay(timeStartStr: string): string {
  // e.g. "2026-03-03T07:30:00"
  try {
    const time = new Date(timeStartStr);
    const hours = time.getHours();
    if (hours < 12) return 'Sáng';
    if (hours < 18) return 'Chiều';
    return 'Tối';
  } catch {
    return 'Ngày';
  }
}

export function formatTimeString(isoString: string): string {
  // Converts "2026-03-03T07:30:00" to "07:30"
  try {
    const date = new Date(isoString);
    if (isNaN(date.getTime())) {
      const parts = isoString.split('T');
      if (parts[1]) return parts[1].substring(0, 5);
      return isoString;
    }
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  } catch {
    return isoString;
  }
}

export function getCurrentWeekDays(refDate: Date = new Date()): string[] {
  const dayOfWeek = refDate.getDay();
  // Calculate distance to Monday (1)
  const diffToMonday = refDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const monday = new Date(refDate);
  monday.setDate(diffToMonday);

  const weekDays: string[] = [];
  for (let i = 0; i < 7; i++) {
    const day = new Date(monday);
    day.setDate(monday.getDate() + i);
    weekDays.push(formatDate(day));
  }
  return weekDays;
}
