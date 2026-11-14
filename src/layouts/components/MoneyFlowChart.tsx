import { Bar, BarChart, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { monthlySeries, type Tx } from "../../lib/stats";

export default function MoneyFlowChart({ transactions }: { transactions: Tx[] }) {
  return (
    <div className="chart-box"><div className="chart-fill">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={monthlySeries(transactions)}>
          <XAxis dataKey="month" /><YAxis /><Tooltip /><Legend />
          <Bar dataKey="income" fill="#22c55e" /><Bar dataKey="expense" fill="#ef4444" />
        </BarChart>
      </ResponsiveContainer>
    </div></div>
  );
}
