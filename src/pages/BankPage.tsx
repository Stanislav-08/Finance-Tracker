import { useCallback, useEffect, useState } from "react";
import { getBankConnections, getBanks, startBankConnect, syncBanks } from "../services/accountService";

export default function BankPage() {
  const [country, setCountry] = useState("BG");
  const [banks, setBanks] = useState<{ name: string; country: string }[]>([]);
  const [bank, setBank] = useState("");
  const [conns, setConns] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);

  const loadConns = useCallback(() => getBankConnections().then(setConns).catch((e) => setMsg(e.message)), []);
  useEffect(() => { loadConns(); }, [loadConns]);
  useEffect(() => {
    setBank(""); setBanks([]);
    getBanks(country).then((b) => { setBanks(b); setBank(b[0]?.name ?? ""); }).catch((e) => setMsg(e.message));
  }, [country]);

  async function connect() {
    try {
      setBusy(true);
      const state = crypto.randomUUID();
      sessionStorage.setItem("bank_flow", JSON.stringify({ state, bank, country }));
      window.location.href = await startBankConnect(bank, country, state);
    } catch (e: any) { setMsg(e.message); setBusy(false); }
  }

  async function sync() {
    try { setBusy(true); setMsg("Syncing…"); const r = await syncBanks(); setMsg(`Done. ${r.imported} new transactions imported.`); loadConns(); }
    catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  return (
    <div>
      <h1>Bank sync</h1>
      <div className="card toolbar">
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          {["BG","DE","FR","ES","IT","NL","AT","FI","SE","PL","RO","GR"].map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={bank} onChange={(e) => setBank(e.target.value)} style={{ flex: 1 }}>
          {banks.map((b) => <option key={b.name}>{b.name}</option>)}
        </select>
        <button className="btn" onClick={connect} disabled={!bank || busy}>Connect bank</button>
      </div>
      <div className="card" style={{ marginTop: 16 }}>
        <div className="goal-header"><h3>Connected accounts</h3>
          <button className="btn" onClick={sync} disabled={busy || !conns.length}>Sync now</button></div>
        {conns.length === 0 ? <div className="empty-state"><p>No bank connected yet.</p></div> : (
          <table><thead><tr><th>Account</th><th>Balance</th><th>Last synced</th></tr></thead>
            <tbody>{conns.map((c) => (
              <tr key={c.id}><td>{c.name}</td><td>{c.currency} {Number(c.balance).toFixed(2)}</td>
                <td>{c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : "never"}</td></tr>))}</tbody></table>)}
      </div>
      {msg && <p className="auth-message">{msg}</p>}
    </div>
  );
}
