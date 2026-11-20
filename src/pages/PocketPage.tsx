import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, BarChart, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { supabase } from "../lib/supabase";
import { addPocket, deletePocket, getCategories, getPocket, type CategoryItem, type PocketItem } from "../services/accountService";
import { EMOJI } from "../layouts/components/TransactionsTable";
import { fmtPct, pctClass } from "../lib/stats";
import { fmtDate, todayISO } from "../lib/prefs";

const COLORS = ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#06b6d4", "#a855f7", "#ec4899", "#84cc16"];
const DAY = 864e5;
const eur = (n: number) => `€${n.toFixed(2)}`;
const today = todayISO;

export default function PocketPage() {
  const [uid, setUid] = useState("");
  const [items, setItems] = useState<PocketItem[]>([]);
  const [cats, setCats] = useState<CategoryItem[]>([]);
  const [f, setF] = useState({ amount: "", categoryId: "", note: "", date: today() });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUid(user.id);
    const [i, c] = await Promise.all([getPocket(user.id), getCategories(user.id)]);
    setItems(i);
    setCats(c.filter((x) => x.type === "expense"));
  }, []);
  useEffect(() => { load().catch((e) => setMsg(e.message)); }, [load]);

  const names = useMemo(() => Object.fromEntries(cats.map((c) => [c.id, c.name])), [cats]);

  const stats = useMemo(() => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
    const samePoint = Math.min(prevStart + (now.getTime() - monthStart), monthStart);
    const sum = (a: number, b: number) => items.filter((i) => { const t = new Date(i.date).getTime(); return t >= a && t < b; }).reduce((x, i) => x + i.amount, 0);

    const total = sum(monthStart, Infinity);
    const prev = sum(prevStart, samePoint);
    const change = prev > 0 ? Math.round(((total - prev) / prev) * 100) : 0;

    const byCat: Record<string, number> = {};
    items.filter((i) => new Date(i.date).getTime() >= monthStart).forEach((i) => { const k = i.categoryId ?? "other"; byCat[k] = (byCat[k] ?? 0) + i.amount; });
    const cat = Object.entries(byCat).map(([id, value]) => ({ id, name: names[id] ?? "Other", value })).sort((a, b) => b.value - a.value);

    const daily = Array.from({ length: 30 }, (_, k) => {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (29 - k)).getTime();
      return { day: new Date(d).getDate(), amount: sum(d, d + DAY) };
    });
    return { total, change, avg: total / now.getDate(), cat, daily };
  }, [items, names]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true); setMsg("");
      await addPocket(uid, { amount: Number(f.amount), date: f.date, ...(f.categoryId ? { categoryId: f.categoryId } : {}), ...(f.note ? { note: f.note } : {}) });
      setF({ ...f, amount: "", note: "" });
      await load();
    } catch (err: any) { setMsg(err.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <h1>Pocket money</h1>
      <p style={{ color: "var(--muted)", marginTop: -8 }}>Log what you spend in cash or small purchases. There's no balance to keep up, just track the spending.</p>

      <form className="card toolbar" onSubmit={add}>
        <input type="number" min="0.01" step="0.01" placeholder="Amount (€)" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <select value={f.categoryId} onChange={(e) => setF({ ...f, categoryId: e.target.value })}>
          <option value="">Other</option>
          {cats.map((c) => <option key={c.id} value={c.id}>{EMOJI[c.id] ?? "🏷️"} {c.name}</option>)}
        </select>
        <input placeholder="Note (optional)" value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} />
        <input type="date" value={f.date} max={today()} onChange={(e) => setF({ ...f, date: e.target.value })} required />
        <button className="btn" disabled={busy || !uid}>Add</button>
      </form>
      {msg && <p className="auth-message">{msg}</p>}

      <div className="row info-row" style={{ marginTop: 16 }}>
        <div className="widget"><h2 className="card-title">Spent this month</h2><p className="card-value expense">{eur(stats.total)}</p>
          <div className="card-box"><div className={`percentage-box ${pctClass(stats.change)}`}><span>{fmtPct(stats.change)}</span></div><span>vs same time last month</span></div></div>
        <div className="widget"><h2 className="card-title">Daily average</h2><p className="card-value">{eur(stats.avg)}</p><div className="card-box">this month so far</div></div>
        <div className="widget"><h2 className="card-title">Top category</h2>
          <p className="card-value">{stats.cat[0] ? `${EMOJI[stats.cat[0].id] ?? "📦"} ${stats.cat[0].name}` : "—"}</p>
          <div className="card-box">{stats.cat[0] ? eur(stats.cat[0].value) : "No spending yet"}</div></div>
      </div>

      <div className="grid" style={{ marginBottom: 16 }}>
        <div className="card" style={{ gridColumn: "span 7" }}>
          <h3>Last 30 days</h3>
          <div className="chart-box"><div className="chart-fill"><ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.daily}><XAxis dataKey="day" /><YAxis /><Tooltip formatter={(v) => eur(Number(v))} /><Bar dataKey="amount" fill="#ef4444" /></BarChart>
          </ResponsiveContainer></div></div>
        </div>
        <div className="card" style={{ gridColumn: "span 5" }}>
          <h3>By category (this month)</h3>
          {stats.cat.length === 0 ? <div className="empty-state"><p>No spending this month.</p></div> : (
            <div className="chart-box"><div className="chart-fill"><ResponsiveContainer width="100%" height="100%">
              <PieChart><Pie data={stats.cat} dataKey="value" nameKey="name" outerRadius="80%">{stats.cat.map((d, i) => <Cell key={d.id} fill={COLORS[i % COLORS.length] ?? "#6366f1"} />)}</Pie><Tooltip formatter={(v) => eur(Number(v))} /></PieChart>
            </ResponsiveContainer></div></div>
          )}
        </div>
      </div>

      <div className="card">
        <h3>Recent spending</h3>
        {items.length === 0 ? <div className="empty-state"><p>Nothing logged yet.</p></div> : (
          <table>
            <thead><tr><th>Date</th><th>Category</th><th>Note</th><th>Amount</th><th /></tr></thead>
            <tbody>{items.slice(0, 30).map((i) => (
              <tr key={i.id}>
                <td>{fmtDate(i.date)}</td>
                <td>{i.categoryId ? `${EMOJI[i.categoryId] ?? "🏷️"} ${names[i.categoryId] ?? ""}` : "📦 Other"}</td>
                <td>{i.note ?? ""}</td>
                <td className="expense">−{eur(i.amount)}</td>
                <td><button className="btn-danger" onClick={async () => { await deletePocket(uid, i.id); load(); }} aria-label="Delete">✕</button></td>
              </tr>))}</tbody>
          </table>
        )}
      </div>
    </div>
  );
}
