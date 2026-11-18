import { useCallback, useEffect, useState } from "react";
import { getBankCredentials, removeBankCredentials, saveBankCredentials, getBankConnections, getBanks, startBankConnect, syncBanks } from "../services/accountService";

export default function BankPage() {
  const [country, setCountry] = useState("BG");
  const [banks, setBanks] = useState<{ name: string; country: string }[]>([]);
  const [bank, setBank] = useState("");
  const [conns, setConns] = useState<any[]>([]);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [appId, setAppId] = useState("");
  const [key, setKey] = useState("");

  const loadCreds = useCallback(() => getBankCredentials().then((c) => setConfigured(c.configured)).catch((e) => setMsg(e.message)), []);
  useEffect(() => { loadCreds(); }, [loadCreds]);

  async function saveCreds(e: React.FormEvent) {
    e.preventDefault();
    try { setBusy(true); setMsg(""); await saveBankCredentials(appId.trim(), key.trim()); setKey(""); await loadCreds(); }
    catch (err: any) { setMsg(err.message); } finally { setBusy(false); }
  }

  const loadConns = useCallback(() => getBankConnections().then(setConns).catch((e) => setMsg(e.message)), []);
  useEffect(() => { loadConns(); }, [loadConns]);
  useEffect(() => {
    if (!configured) return;
    setBank(""); setBanks([]);
    getBanks(country).then((b) => { setBanks(b); setBank(b[0]?.name ?? ""); }).catch((e) => setMsg(e.message));
  }, [country, configured]);

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

  if (configured === false) return (
    <div>
      <h1>Bank sync (optional)</h1>
      <form className="card auth-form" onSubmit={saveCreds} style={{ maxWidth: 720 }}>
        <p>The app works fully without this. To import balances and transactions automatically, connect <b>your own</b> free Enable Banking project:</p>
        <ol>
          <li>Create an account at enablebanking.com and open the Control Panel.</li>
          <li>Register an application (production, or sandbox to test). Set the redirect URL to <code>{window.location.origin}/bank/callback</code>.</li>
          <li>In production restricted mode, click <b>Link accounts</b> and log in to your bank.</li>
          <li>Paste the Application ID and the private key (.pem contents) below. The key is stored encrypted and only used to fetch your own data.</li>
        </ol>
        <div className="form-group"><label>Application ID</label><input value={appId} onChange={(e) => setAppId(e.target.value)} required /></div>
        <div className="form-group"><label>Private key (.pem)</label><textarea rows={6} value={key} onChange={(e) => setKey(e.target.value)} required style={{ width: "100%", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }} /></div>
        <button className="auth-button" disabled={busy}>Save credentials</button>
        <button className="btn-ghost" style={{ marginTop: 16 }} onClick={async () => { if (confirm("Remove your Enable Banking credentials?")) { await removeBankCredentials(); setConfigured(false); } }}>Remove my bank credentials</button>
      {msg && <p className="auth-message">{msg}</p>}
      </form>
    </div>
  );
  if (configured === null) return <p>Loading…</p>;

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
