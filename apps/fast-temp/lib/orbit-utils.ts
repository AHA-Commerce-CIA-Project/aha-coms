export function getCurrentPeriod(frequency: string): string {
  const now = new Date();

  if (frequency === 'daily') {
    return now.toISOString().split('T')[0]; // "2026-04-09"
  }

  if (frequency === 'weekly') {
    // ISO week number
    const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`; // "2026-W15"
  }

  if (frequency === 'monthly') {
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`; // "2026-04"
  }

  return now.toISOString().split('T')[0];
}

export function getPeriodLabel(frequency: string, period: string): string {
  if (frequency === 'daily') {
    const d = new Date(period + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (frequency === 'weekly') {
    return `Week ${period.split('-W')[1]}, ${period.split('-W')[0]}`;
  }
  if (frequency === 'monthly') {
    const [year, month] = period.split('-');
    const d = new Date(parseInt(year), parseInt(month) - 1);
    return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  }
  return period;
}
