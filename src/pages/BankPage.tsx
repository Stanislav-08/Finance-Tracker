import { useCallback, useEffect, useState } from "react";
import {
  getBankConnections, getBankCredentials, getBanks, removeBankCredentials,
  saveBankCredentials, startBankConnect, syncBanks,
} from "../services/accountService";

const COUNTRIES = ["BG", "DE", "FR", "ES", "IT", "NL", "AT", "FI", "SE", "PL", "RO", "GR"];

export default function BankPage() {
  const [country, setCountry] = useState("BG");
  const [banks, setBanks] = useState<{ name: string; country: string }[]>([]);
  const [bank, setBank] = useState("");
  const [conns, setConns] = useState<any[] | null>(null);
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [source, setSource] = useState<"own" | "shared" | null>(null);
  const [editing, setEditing] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [appId, setAppId] = useState("");
  const [key, setKey] = useState("");

  const loadCreds = useCallback(
    () => getBankCredentials().then((c) => { setConfigured(c.configured); setSource(c.source); }).catch((e) => setMsg(e.message)),
    []
  );
  const loadConns = useCallback(
    () => getBankConnections().then(setConns).catch((e) => { setConns([]); setMsg(e.message); }),
    []
  );
  useEffect(() => { loadCreds(); loadConns(); }, [loadCreds, loadConns]);

  const needsBanks = configured && !editing && (conns?.length === 0 || showAdd);
  useEffect(() => {
    if (!needsBanks) return;
    setBank(""); setBanks([]);
    getBanks(country).then((b) => { setBanks(b); setBank(b[0]?.name ?? ""); }).catch((e) => setMsg(e.message));
  }, [country, needsBanks]);

  async function saveCreds(e: React.FormEvent) {
    e.preventDefault();
    try {
      setBusy(true); setMsg("");
      await saveBankCredentials(appId.trim(), key.trim());
      setKey(""); setEditing(false); await loadCreds();
    } catch (err: any) { setMsg(err.message); } finally { setBusy(false); }
  }

  async function connect() {
    try {
      setBusy(true);
      const state = crypto.randomUUID();
      sessionStorage.setItem("bank_flow", JSON.stringify({ state, bank, country }));
      window.location.href = await startBankConnect(bank, country, state);
    } catch (e: any) { setMsg(e.message); setBusy(false); }
  }

  async function sync() {
    try {
      setBusy(true); setMsg("Syncing…");
      const r = await syncBanks();
      setMsg(r.results.map((x) => x.status === "ok"
        ? `${x.name}: ${x.imported} new transactions`
        : `${x.name}: ${x.message ?? "skipped"}`).join("\n"));
      loadConns();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  if (configured === null || conns === null) return <p>Loading…</p>;

  if (!configured || editing) return (
    <div>
      <h1>Bank sync (optional)</h1>
      <form className="card auth-form" onSubmit={saveCreds} style={{ maxWidth: 720 }}>
        <p>The app works fully without this. To import balances and transactions automatically, connect <b>your own</b> free Enable Banking project:</p>
        <ol>
          <li>Create an account at enablebanking.com and open the Control Panel.</li>
          <li>Register an application (production, or sandbox to test). Set the redirect URL to <code>{window.location.origin}/bank/callback</code>.</li>
          <li>For production, click <b>Activate by linking accounts</b> once. This only activates your app. Your bank still has to be authorized from this app (next step).</li>
          <li>Paste the Application ID and the private key (.pem contents) below. The key is stored encrypted and only used to fetch your own data.</li>
        </ol>
        <div className="form-group"><label>Application ID</label><input value={appId} onChange={(e) => setAppId(e.target.value)} required /></div>
        <div className="form-group"><label>Private key (.pem)</label>
          <textarea rows={6} value={key} onChange={(e) => setKey(e.target.value)} required style={{ width: "100%", background: "var(--bg)", color: "var(--text)", border: "1px solid var(--border)", borderRadius: 10, padding: 10 }} /></div>
        <button className="auth-button" disabled={busy}>Save credentials</button>
        {configured && <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>Cancel</button>}
        {msg && <p className="auth-message">{msg}</p>}
      </form>
    </div>
  );

  const connectCard = (
    <div className="card" style={{ marginBottom: 16 }}>
      <h3>{conns.length ? "Add another bank" : "Connect your bank"}</h3>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>You'll be redirected to Enable Banking and your bank to approve read-only access.</p>
      <div className="toolbar">
        <select value={country} onChange={(e) => setCountry(e.target.value)}>
          {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
        </select>
        <select value={bank} onChange={(e) => setBank(e.target.value)} style={{ flex: 1 }}>
          {banks.map((b) => <option key={b.name}>{b.name}</option>)}
        </select>
        <button className="btn" onClick={connect} disabled={!bank || busy}>Connect bank</button>
      </div>
    </div>
  );

  return (
    <div>
      <h1>Bank sync</h1>

      {conns.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="goal-header">
            <h3>Connected accounts</h3>
            <div className="toolbar" style={{ margin: 0 }}>
              <button className="btn" onClick={sync} disabled={busy}>Sync now</button>
              {!showAdd && <button className="btn-ghost" onClick={() => setShowAdd(true)}>Add another bank</button>}
            </div>
          </div>
          <table>
            <thead><tr><th>Account</th><th>Balance</th><th>Last synced</th></tr></thead>
            <tbody>
              {conns.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.currency} {Number(c.balance).toFixed(2)}</td>
                  <td>{c.lastSyncedAt ? new Date(c.lastSyncedAt).toLocaleString() : "never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(conns.length === 0 || showAdd) && connectCard}

      {source === "own" ? (
        <button className="btn-ghost" onClick={async () => {
          if (confirm("Remove your Enable Banking credentials?")) { await removeBankCredentials(); await loadCreds(); }
        }}>Remove my bank credentials</button>
      ) : (
        <p style={{ color: "var(--muted)" }}>Using this app's built-in bank connection.{" "}
          <button className="btn-ghost" onClick={() => setEditing(true)}>Use my own credentials instead</button></p>
      )}
      {msg && <p className="auth-message" style={{ whiteSpace: "pre-line" }}>{msg}</p>}
    </div>
  );
}
