export function formatDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}

export function parseDate(dateStr: string): Date | null {
  if (!/^\d{8}$/.test(dateStr)) {
    return null;
  }

  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(4, 6), 10) - 1;
  const day = parseInt(dateStr.slice(6, 8), 10);

  if (isNaN(year) || isNaN(month) || isNaN(day)) {
    return null;
  }

  return new Date(year, month, day);
}

export function extractMonth(dateStr: string): string {
  if (dateStr.length < 6) {
    return '';
  }
  return dateStr.slice(0, 6);
}

export function formatMonthDisplay(month: string): string {
  if (month.length !== 6) {
    return month;
  }
  const year = month.slice(0, 4);
  const mon = month.slice(4, 6);
  return `${year}-${mon}`;
}

export function getDefaultOpenDate(): string {
  return formatDate(new Date());
}
