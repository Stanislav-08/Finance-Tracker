import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { createAccount, getAccounts, setAccountBalance, transfer, type AccountItem } from "../services/accountService";

export default function WalletPage() {
  const [accounts, setAccounts] = useState<AccountItem[]>([]);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [t, setT] = useState({ from: "", to: "", amount: "" });
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUid(user.id);
    setAccounts(await getAccounts(user.id));
  }, []);
  useEffect(() => { load().catch(console.error); }, [load]);

  const run = async (fn: () => Promise<unknown>) => {
    setMsg("");
    try { await fn(); await load(); } catch (e: any) { setMsg(e.message); }
  };

  return (
    <div>
      <h1>Wallet</h1>
      <div className="grid" style={{ marginBottom: 16 }}>
        {accounts.map((a) => (
          <div key={a.id} className="card" style={{ gridColumn: "span 4" }}>
            <h3>{a.name}</h3>
            <p className="card-value">{a.currency} {Number(a.balance).toFixed(2)}</p>
            <button className="btn-ghost" onClick={() => {
              const v = prompt("Set balance to:", String(Number(a.balance)));
              if (v !== null && Number.isFinite(Number(v))) run(() => setAccountBalance(uid, a.id, Number(v)));
            }}>Adjust balance</button>
          </div>
        ))}
      </div>
      <div className="grid">
        <form className="card toolbar" style={{ gridColumn: "span 6" }} onSubmit={(e) => { e.preventDefault(); run(() => createAccount(uid, name.trim(), "EUR")); setName(""); }}>
          <h3 style={{ width: "100%" }}>New account</h3>
          <input placeholder="Account name" value={name} onChange={(e) => setName(e.target.value)} required />
          <button className="btn" type="submit">Add</button>
        </form>
        <form className="card toolbar" style={{ gridColumn: "span 6" }} onSubmit={(e) => { e.preventDefault(); run(() => transfer(uid, t.from, t.to, Number(t.amount))); setT({ ...t, amount: "" }); }}>
          <h3 style={{ width: "100%" }}>Transfer between accounts</h3>
          <select value={t.from} onChange={(e) => setT({ ...t, from: e.target.value })} required>
            <option value="">From…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <select value={t.to} onChange={(e) => setT({ ...t, to: e.target.value })} required>
            <option value="">To…</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          <input type="number" min="0.01" step="0.01" placeholder="Amount" value={t.amount} onChange={(e) => setT({ ...t, amount: e.target.value })} required />
          <button className="btn" type="submit">Transfer</button>
        </form>
      </div>
      {msg && <p className="auth-message">{msg}</p>}
    </div>
  );
}
