export function localDateString(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

export function formatDuration(seconds: number, compact = false) {
  if (seconds < 60) return "小于 1 分钟";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (compact) {
    if (hours === 0) return `${minutes}m`;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (hours === 0) return `${minutes} 分钟`;
  return minutes ? `${hours} 小时 ${String(minutes).padStart(2, "0")} 分钟` : `${hours} 小时`;
}

export function dateLabel(date: string) {
  const value = new Date(`${date}T12:00:00`);
  return `${value.getMonth() + 1} 月 ${value.getDate()} 日`;
}

export function rangeLabel(start: string, end: string) {
  const startDate = new Date(`${start}T12:00:00`);
  const endDate = new Date(`${end}T12:00:00`);
  if (startDate.getFullYear() === endDate.getFullYear()) {
    return `${startDate.getMonth() + 1} 月 ${startDate.getDate()} 日 - ${endDate.getMonth() + 1} 月 ${endDate.getDate()} 日`;
  }
  return `${start} - ${end}`;
}

export function shiftDate(date: string, days: number) {
  const value = new Date(`${date}T12:00:00`);
  value.setDate(value.getDate() + days);
  return localDateString(value);
}

export function initials(name: string) {
  const latin = name.match(/[A-Za-z0-9]/g)?.slice(0, 2).join("");
  return (latin || name.slice(0, 1)).toUpperCase();
}
