import "./Widgets.css"
import { fmtPct } from "../../../lib/stats";
import { useDashboardData } from "../../../hooks/useDashboardData";

function Expenses() {
    const { expenses, expenseChange } = useDashboardData();

  return (
  <div className="expenses widget">
            <h2 className="card-title">
              Expenses
            </h2>

            <p className="card-value expense">
              €{expenses.toFixed(2)}
            </p>

            <div className="card-box">
              <div className="percentage-box down">
                <span className="card-percentage">
                  {fmtPct(expenseChange)}
                </span>
              </div>

              <span className="card-text">
                vs last month
              </span>
            </div>
  </div>
  );
}

export default Expenses;