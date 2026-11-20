import { NavLink } from "react-router-dom";
import { resolvedTheme, setPrefs, usePrefs } from "../../lib/prefs";
import { supabase } from "../../lib/supabase";
import "./Sidebar.css";

const links = [
  ["/dashboard", "Dashboard", "dashboard"], ["/transactions", "Transactions", "transactions"],
  ["/wallet", "Wallet", "wallet"], ["/pocket", "Pocket money", "transactions"], ["/goals", "Goals", "goals"], ["/budget", "Budget", "budget"],
  ["/bank", "Bank sync", "wallet"], ["/subscriptions", "Subscriptions", "calendar"], ["/analytics", "Analytics", "analytics"], ["/settings", "Settings", "settings"],
];

export default function Sidebar() {
  usePrefs();
  const theme = resolvedTheme();
  const toggle = () => setPrefs({ theme: theme === "dark" ? "light" : "dark" });
  return (
    <aside className="sidebar">
      <div className="sidebar-logo"><h2>Finance Tracker</h2></div>
      <nav className="sidebar-nav">
        {links.map(([to, label, icon]) => (
          <NavLink key={to} to={to} className={({ isActive }) => (isActive ? "nav-item active" : "nav-item")}>
            <img src={`/icons/${icon}-icon.svg`} alt="" className="item-icon" width="22" height="22" />{label}
          </NavLink>
        ))}
      </nav>
      <button className="theme-button" onClick={toggle}>{theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}</button>
      <button className="logout-button" onClick={() => supabase.auth.signOut()}>Log out</button>
    </aside>
  );
}
