export interface DetectedSub {
  name: string;
  amount: number;
  billingCycle: "monthly" | "yearly";
  nextPaymentDate: string; // YYYY-MM-DD
  charges: number;
}

const DAY = 864e5;
const median = (a: number[]) => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] ?? 0;

/** Finds recurring monthly/yearly expenses: same merchant, similar amount, regular spacing. */
export function detectRecurring(
  txs: { amount: number | string; type: string; merchant?: string | null; description?: string | null; date: string }[],
  existingNames: string[]
): DetectedSub[] {
  const groups = new Map<string, { name: string; t: number; amount: number }[]>();
  for (const x of txs) {
    if (x.type !== "expense") continue;
    const name = (x.merchant || (x.description ?? "").slice(0, 30)).trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const list = groups.get(key) ?? [];
    list.push({ name, t: new Date(x.date).getTime(), amount: Number(x.amount) });
    groups.set(key, list);
  }

  const known = existingNames.map((n) => n.toLowerCase());
  const out: DetectedSub[] = [];

  for (const [key, list] of groups) {
    if (known.some((k) => k.includes(key) || key.includes(k))) continue;
    list.sort((a, b) => a.t - b.t);
    if (list.length < 2) continue;

    const gaps = list.slice(1).map((c, i) => (c.t - (list[i]?.t ?? c.t)) / DAY);
    const gap = median(gaps);
    const cycle = gap >= 27 && gap <= 34 ? "monthly" : gap >= 355 && gap <= 375 ? "yearly" : null;
    if (!cycle) continue;
    if (cycle === "monthly" && list.length < 3) continue;

    const tol = cycle === "monthly" ? 4 : 12;
    if (gaps.filter((g) => Math.abs(g - gap) <= tol).length / gaps.length < 0.7) continue;

    const amt = median(list.map((c) => c.amount));
    if (list.filter((c) => Math.abs(c.amount - amt) <= amt * 0.15).length / list.length < 0.7) continue;

    const last = list[list.length - 1];
    if (!last) continue;
    const next = new Date(last.t);
    const step = () => (cycle === "monthly" ? next.setMonth(next.getMonth() + 1) : next.setFullYear(next.getFullYear() + 1));
    step();
    // Last charge much older than one cycle: probably cancelled, don't suggest it.
    if (Date.now() - last.t > (cycle === "monthly" ? 50 : 400) * DAY) continue;
    while (next.getTime() < Date.now()) step();

    out.push({ name: last.name, amount: last.amount, billingCycle: cycle, nextPaymentDate: next.toISOString().slice(0, 10), charges: list.length });
  }
  return out.sort((a, b) => b.amount - a.amount);
}
