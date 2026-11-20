import { useEffect, useState } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./lib/supabase";
import { initTheme, usePrefs } from "./lib/prefs";
import { clearCache, prefetchAll } from "./services/accountService";
import AppLayout from "./layouts/AppLayout";
import AuthPage from "./pages/AuthPage";
import DashboardPage from "./pages/DashboardPage";
import TransactionsPage from "./pages/TransactionsPage";
import WalletPage from "./pages/WalletPage";
import GoalsPage from "./pages/GoalsPage";
import BudgetPage from "./pages/BudgetPage";
import SubscriptionsPage from "./pages/SubscriptionsPage";
import AnalyticsPage from "./pages/AnalyticsPage";
import PocketPage from "./pages/PocketPage";
import BankPage from "./pages/BankPage";
import BankCallbackPage from "./pages/BankCallbackPage";
import SettingsPage from "./pages/SettingsPage";
import AddGoalPage from "./pages/AddGoalPage";
import AllGoalsPage from "./pages/AllGoalsPage";

initTheme();

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [ready, setReady] = useState(false);
  const prefs = usePrefs();
  const userId = session?.user.id;

  // Load all data once after login, so pages open instantly and fully populated.
  useEffect(() => {
    if (!userId) { setReady(false); return; }
    let cancelled = false;
    prefetchAll(userId).finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [userId]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) clearCache();
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (loading || (session && !ready)) return <div className="page-loader"><div className="spinner" /></div>;

  return (
    <BrowserRouter>
      <Routes key={`${prefs.date}-${prefs.time}`}>
        {!session ? <Route path="*" element={<AuthPage />} /> : (
          <Route element={<AppLayout />}>
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/transactions" element={<TransactionsPage />} />
            <Route path="/wallet" element={<WalletPage />} />
            <Route path="/goals" element={<GoalsPage />} />
            <Route path="/goals/add" element={<AddGoalPage />} />
            <Route path="/goals/all" element={<AllGoalsPage />} />
            <Route path="/budget" element={<BudgetPage />} />
            <Route path="/subscriptions" element={<SubscriptionsPage />} />
            <Route path="/analytics" element={<AnalyticsPage />} />
            <Route path="/pocket" element={<PocketPage />} />
            <Route path="/bank" element={<BankPage />} />
            <Route path="/bank/callback" element={<BankCallbackPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="*" element={<Navigate to="/dashboard" replace />} />
          </Route>
        )}
      </Routes>
    </BrowserRouter>
  );
}
