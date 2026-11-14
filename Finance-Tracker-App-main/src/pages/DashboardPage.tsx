import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { getTransactions } from "../services/accountService";
import MoneyFlowChart from "../layouts/components/MoneyFlowChart";
import Header from "../layouts/components/Header";
import "./DashboardPage.css";
import TransactionsTable from "../layouts/components/TransactionsTable.tsx";
import "../layouts/components/ScrollbarStyle.css";
import TotalBalance from "../layouts/components/widgets/TotalBalance.tsx";
import Income from "../layouts/components/widgets/Income.tsx";
import Expenses from "../layouts/components/widgets/Expenses.tsx";
import TotalSavings from "../layouts/components/widgets/TotalSavings.tsx";

function DashboardPage() {
  const [txs, setTxs] = useState<any[]>([]);
  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => user && getTransactions(user.id)).then((t) => t && setTxs(t)).catch(console.error);
  }, []);

  return (
    <div className="dashboard-page">
      <Header />
      <div className="grid dashboard-grid">
        <div className="g-stat"><TotalBalance /></div>
        <div className="g-stat"><Income /></div>
        <div className="g-stat"><Expenses /></div>
        <div className="g-stat"><TotalSavings /></div>

        <div className="g-wide card">
          <h3>Money flow</h3>
          <MoneyFlowChart transactions={txs} />
        </div>
        <div className="g-side card">
          <h3>Budget</h3>
          <div className="empty-state">
            <p>No budgets set yet.</p>
            <Link to="/budget" className="btn">Set a budget</Link>
          </div>
        </div>

        <div className="g-wide card">
          <h3>Transactions</h3>
          <TransactionsTable />
        </div>
        <div className="g-side card">
          <h3>Saving goals</h3>
          <div className="empty-state">
            <p>Track what you're saving for.</p>
            <Link to="/goals" className="btn">View goals</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
export default DashboardPage;