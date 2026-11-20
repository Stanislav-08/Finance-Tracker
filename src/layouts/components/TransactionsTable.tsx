import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { deleteTransaction, getAccounts, getCategories, getTransactions } from "../../services/accountService";
import "./TransactionsTable.css";

const EMOJI: Record<string, string> = {
  cat_salary: "💼", cat_freelance: "💻", cat_investments: "📈", cat_gifts_in: "🎁", cat_other_income: "💰",
  cat_groceries: "🛒", cat_rent: "🏠", cat_transport: "🚗", cat_dining: "🍽️", cat_shopping: "🛍️",
  cat_entertainment: "🎬", cat_health: "🩺", cat_education: "🎓", cat_travel: "✈️", cat_subscriptions: "💳", cat_other_expense: "🧾",
};

const hue = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const money = (n: number, currency: string) => {
  try { return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n); }
  catch { return `${currency} ${n.toFixed(2)}`; }
};

export default function TransactionsTable({ full = false }: { full?: boolean }) {
  const [txs, setTxs] = useState<any[]>([]);
  const [cats, setCats] = useState<Record<string, string>>({});
  const [accs, setAccs] = useState<Record<string, { name: string; currency: string }>>({});
  const [uid, setUid] = useState("");
  const [q, setQ] = useState("");
  const [typeF, setTypeF] = useState("all");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      setUid(user.id);
      const [t, c, a] = await Promise.all([getTransactions(user.id), getCategories(user.id), getAccounts(user.id)]);
      setTxs(t);
      setCats(Object.fromEntries(c.map((x) => [x.id, x.name])));
      setAccs(Object.fromEntries(a.map((x) => [x.id, { name: x.name, currency: x.currency }])));
    } catch (e) { console.error(e); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const list = txs.filter((t) =>
      (typeF === "all" || t.type === typeF) &&
      `${t.merchant ?? ""} ${t.description ?? ""} ${cats[t.categoryId] ?? ""}`.toLowerCase().includes(q.toLowerCase()));
    return full ? list : list.slice(0, 6);
  }, [txs, q, typeF, cats, full]);

  async function remove(id: string) {
    if (!confirm("Delete this transaction? The account balance will be adjusted.")) return;
    await deleteTransaction(uid, id);
    load();
  }

  function exportCsv() {
    const rows = [["Date", "Type", "Category", "Account", "Merchant", "Description", "Amount"],
      ...shown.map((t) => [t.date.slice(0, 10), t.type, cats[t.categoryId] ?? "", accs[t.accountId]?.name ?? "", t.merchant ?? "", t.description ?? "", Number(t.amount).toFixed(2)])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "transactions.csv";
    a.click();
  }

  if (loading) return <div className="empty-state"><p>Loading transactions…</p></div>;

  return (
    <div className="transactions-list">
      {full && (
        <div className="toolbar">
          <input placeholder="Search merchant, description, category…" value={q} onChange={(e) => setQ(e.target.value)} />
          <select value={typeF} onChange={(e) => setTypeF(e.target.value)}>
            <option value="all">All</option><option value="income">Income</option><option value="expense">Expenses</option>
          </select>
          <button className="btn-ghost" onClick={exportCsv}>Export CSV</button>
        </div>
      )}

      {shown.length === 0 ? (
        <div className="empty-state"><p>No transactions yet.</p></div>
      ) : (
        <div className="tx-list">
          {shown.map((t) => {
            const income = t.type === "income";
            const name: string = t.merchant || t.description || "Unknown";
            const acc = accs[t.accountId];
            return (
              <div key={t.id} className={`tx-row${full ? " tx-full" : ""}`}>
                <div className="tx-main">
                  <span className="tx-avatar" style={{ background: `hsl(${hue(name)} 65% 46%)` }}>{name.charAt(0).toUpperCase()}</span>
                  <div className="tx-text">
                    <div className="tx-title">
                      {income && t.merchant ? <><span className="tx-muted">Received from </span>{name}</> : name}
                    </div>
                    <div className="tx-sub">{new Date(t.date).toLocaleDateString()}</div>
                  </div>
                </div>
                <div className="tx-cat">
                  {t.categoryId ? <><span>{EMOJI[t.categoryId] ?? "🏷️"}</span> {cats[t.categoryId] ?? "Category"}</> : <span className="tx-muted">—</span>}
                </div>
                <div className="tx-acc">
                  {acc ? <><span className="tx-acc-badge">{acc.name.charAt(0).toUpperCase()}</span> {acc.name}</> : <span className="tx-muted">—</span>}
                </div>
                <div className={`tx-amount ${income ? "income" : "expense"}`}>
                  {income ? "+" : "−"}{money(Number(t.amount), acc?.currency ?? "EUR")}
                </div>
                {full && <button className="btn-danger tx-del" onClick={() => remove(t.id)} aria-label="Delete transaction">✕</button>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
