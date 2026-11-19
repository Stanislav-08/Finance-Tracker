import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { detectRecurring } from "../lib/recurring";
import { createSubscription, deleteSubscription, getSubscriptions, getTransactions } from "../services/accountService";

// A trial counts until its end date (stored as the next payment date); after that it is a normal subscription.
const isTrial = (s: any) => s.status === "trial" && new Date(s.nextPaymentDate).getTime() > Date.now();
const daysLeft = (s: any) => Math.max(0, Math.ceil((new Date(s.nextPaymentDate).getTime() - Date.now()) / 864e5));

export default function SubscriptionsPage() {
  const [subs, setSubs] = useState<any[]>([]);
  const [uid, setUid] = useState("");
  const [txs, setTxs] = useState<any[]>([]);
  const [f, setF] = useState({ name: "", amount: "", billingCycle: "monthly", nextPaymentDate: new Date().toISOString().slice(0, 10), trial: false });

  const load = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    setUid(user.id);
    const [sub, t] = await Promise.all([getSubscriptions(user.id), getTransactions(user.id)]);
    setSubs(sub);
    setTxs(t);
  }, []);
  useEffect(() => { load().catch(console.error); }, [load]);

  const detected = useMemo(() => detectRecurring(txs, subs.map((x) => x.name)), [txs, subs]);

  const monthly = subs.filter((s) => !isTrial(s)).reduce((a, s) => a + (s.billingCycle === "yearly" ? Number(s.amount) / 12 : Number(s.amount)), 0);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    await createSubscription(uid, { name: f.name, amount: Number(f.amount), billingCycle: f.billingCycle, nextPaymentDate: f.nextPaymentDate, status: f.trial ? "trial" : "active" });
    setF({ ...f, name: "", amount: "", trial: false });
    load();
  }

  return (
    <div>
      <h1>Subscriptions</h1>
      <div className="row info-row">
        <div className="widget"><h2 className="card-title">Monthly cost</h2><p className="card-value">€{monthly.toFixed(2)}</p></div>
        <div className="widget"><h2 className="card-title">Yearly cost</h2><p className="card-value">€{(monthly * 12).toFixed(2)}</p></div>
      </div>
      <form className="card toolbar" onSubmit={add}>
        <input placeholder="Name (e.g. Netflix)" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required />
        <input type="number" min="0.01" step="0.01" placeholder="Amount" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} required />
        <select value={f.billingCycle} onChange={(e) => setF({ ...f, billingCycle: e.target.value })}><option value="monthly">Monthly</option><option value="yearly">Yearly</option></select>
        <input type="date" value={f.nextPaymentDate} onChange={(e) => setF({ ...f, nextPaymentDate: e.target.value })} required />
        <label style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <input type="checkbox" style={{ width: "auto", flex: "none", minWidth: 0 }} checked={f.trial} onChange={(e) => setF({ ...f, trial: e.target.checked })} /> Free trial
        </label>
        <button className="btn" type="submit">Add</button>
        {f.trial && <small style={{ width: "100%", color: "var(--muted)" }}>Enter the price you'll pay after the trial. The date is when the trial ends and the first payment is charged.</small>}
      </form>
      {detected.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3>Detected from your transactions</h3>
          <p style={{ color: "var(--muted)", marginTop: 0 }}>These look like recurring payments (same merchant, similar amount, regular timing).</p>
          <table>
            <thead><tr><th>Name</th><th>Cycle</th><th>Charges seen</th><th>Next payment</th><th>Amount</th><th /></tr></thead>
            <tbody>{detected.map((d) => (
              <tr key={d.name}><td>{d.name}</td><td>{d.billingCycle}</td><td>{d.charges}</td>
                <td>{new Date(d.nextPaymentDate).toLocaleDateString()}</td><td>€{d.amount.toFixed(2)}</td>
                <td><button className="btn" onClick={async () => { await createSubscription(uid, { name: d.name, amount: d.amount, billingCycle: d.billingCycle, nextPaymentDate: d.nextPaymentDate }); load(); }}>Track</button></td></tr>
            ))}</tbody>
          </table>
        </div>
      )}
      <div className="card">
        {subs.length === 0 ? <p>No subscriptions yet.</p> : (
          <table><thead><tr><th>Name</th><th>Cycle</th><th>Next payment</th><th>Amount</th><th /></tr></thead>
            <tbody>{subs.map((s) => (
              <tr key={s.id}>
                <td>{s.name}{isTrial(s) && <span className="percentage-box" style={{ marginLeft: 8 }}>Free trial</span>}</td>
                <td>{s.billingCycle}</td>
                <td>{new Date(s.nextPaymentDate).toLocaleDateString()}
                  {isTrial(s) && <small style={{ marginLeft: 6, color: daysLeft(s) <= 3 ? "var(--red)" : "var(--muted)" }}>(trial ends in {daysLeft(s)} d)</small>}</td>
                <td>€{Number(s.amount).toFixed(2)}</td>
                <td><button className="btn-danger" onClick={async () => { await deleteSubscription(uid, s.id); load(); }}>Remove</button></td></tr>
            ))}</tbody></table>
        )}
      </div>
    </div>
  );
}
