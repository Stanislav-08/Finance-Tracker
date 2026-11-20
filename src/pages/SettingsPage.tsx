import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import {
  getMonthlyContribution,
  updateMonthlyContribution,
} from "../services/accountService";
import { setPrefs, usePrefs, type DatePref, type ThemePref, type TimePref } from "../lib/prefs";
import "./SettingsPage.css";

function SettingsPage() {
  const prefs = usePrefs();
  const [amount, setAmount] = useState("0");
  const [message, setMessage] = useState("");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      try {
        setAmount(String(await getMonthlyContribution(user.id)));
      } catch (e) {
        console.error(e);
      }
    }
    load();
  }, []);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await updateMonthlyContribution(user.id, Number(amount));
      setMessage("Saved.");
    } catch (e) {
      console.error(e);
      setMessage("Failed to save.");
    }
  }

  return (
    <div className="settings-page">
      <h1>Settings</h1>
      <div className="card auth-form" style={{ maxWidth: 420, marginBottom: 20 }}>
        <h3>Preferences</h3>
        <div className="form-group"><label>Theme</label>
          <select value={prefs.theme} onChange={(e) => setPrefs({ theme: e.target.value as ThemePref })}>
            <option value="system">Same as my browser/device (default)</option><option value="light">Light</option><option value="dark">Dark</option>
          </select></div>
        <div className="form-group"><label>Date format</label>
          <select value={prefs.date} onChange={(e) => setPrefs({ date: e.target.value as DatePref })}>
            <option value="system">Same as my device (default)</option><option value="DMY">DD/MM/YYYY</option><option value="MDY">MM/DD/YYYY</option><option value="ISO">YYYY-MM-DD</option>
          </select></div>
        <div className="form-group"><label>Time format</label>
          <select value={prefs.time} onChange={(e) => setPrefs({ time: e.target.value as TimePref })}>
            <option value="system">Same as my device (default)</option><option value="h12">12-hour (AM/PM)</option><option value="h24">24-hour</option>
          </select></div>
        <small style={{ color: "var(--muted)" }}>Saved on this device only.</small>
      </div>
      <form className="auth-form" onSubmit={save} style={{ maxWidth: 420 }}>
        <div className="form-group">
          <label htmlFor="mc">Monthly savings contribution (€)</label>
          <input id="mc" type="number" min="0" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </div>
        <button className="auth-button" type="submit">Save</button>
        {message && <p className="auth-message">{message}</p>}
      </form>
    </div>
  );
}

export default SettingsPage;
