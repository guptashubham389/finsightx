export type SpendRow = { date: string; amount: number; direction: "debit" | "credit"; payee: string; sourceKey: string; kind?: "spent" | "upcoming"; note?: string };
export function salaryCycle(date: string, today: string) {
  const day = Number(date.slice(8));
  const now = new Date(today + "T00:00:00Z");
  const payday = (offset: number) => { const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + offset, 1)); const last = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate(); start.setUTCDate(Math.min(day, last)); return start.toISOString().slice(0, 10); };
  const current = payday(0);
  const start = current <= today ? current : payday(-1);
  const end = current <= today ? payday(1) : current;
  return { start, end, days: Math.round((Date.parse(end) - Date.parse(today)) / 86400000) };
}
export function spending(salary: {amount: number; date: string}, rows: SpendRow[], today: string) {
  const cycle = salaryCycle(salary.date, today);
  const included = rows.filter(r => r.date >= cycle.start && r.date < cycle.end && r.direction === "debit");
  // Gmail wins when an identical manual entry is later imported.
  const unique = included.filter(r => !r.sourceKey.startsWith("manual:") || !included.some(g => !g.sourceKey.startsWith("manual:") && g.date === r.date && g.amount === r.amount && g.payee.trim().toLowerCase() === r.payee.trim().toLowerCase()));
  const spent = unique.filter(r => r.date <= today && r.kind !== "upcoming").reduce((a,r) => a+r.amount,0);
  const upcoming = unique.filter(r => r.kind === "upcoming" || r.date > today).reduce((a,r) => a+r.amount,0);
  const available = salary.amount - spent - upcoming;
  return { ...cycle, spent, upcoming, available, daily: available / cycle.days, rows: unique };
}
