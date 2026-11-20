import { useEffect, useState } from "react";
import {
  getTotalBalance,
  getTotalSavings,
  getMonthlyContribution,
  getTransactions,
} from "../services/accountService";
import { supabase } from "../lib/supabase";

interface Transaction {
  id: string;
  amount: number | string;
  type: string;
  merchant: string | null;
  description: string | null;
  date: string;
}

export function useDashboardData() {
  const [totalBalance, setTotalBalance] = useState(0);
  const [totalSavings, setTotalSavings] = useState(0);
  const [monthlyContribution, setMonthlyContribution] = useState(0);
  const [income, setIncome] = useState(0);
  const [expenses, setExpenses] = useState(0);
  const [incomeChange, setIncomeChange] = useState(0);
  const [expenseChange, setExpenseChange] = useState(0);
  const [balanceChange, setBalanceChange] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadDashboardData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) return;

        const [
          balance,
          savings,
          contribution,
          transactions,
        ] = await Promise.all([
          getTotalBalance(user.id),
          getTotalSavings(user.id),
          getMonthlyContribution(user.id),
          getTransactions(user.id),
        ]);

        setTotalBalance(Number(balance));
        setTotalSavings(Number(savings));
        setMonthlyContribution(Number(contribution));

        const now = new Date();
        const startThis = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const startPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();
        const sum = (type: string, from: number, to: number) =>
          transactions
            .filter((x: Transaction) => {
              const t = new Date(x.date).getTime();
              return x.type === type && t >= from && t < to;
            })
            .reduce((acc: number, x: Transaction) => acc + Number(x.amount), 0);
        // No data last month (previous = 0) -> leave 0%.
        const pct = (cur: number, prev: number) => (prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0);

        const incomeNow = sum("income", startThis, Infinity);
        const expenseNow = sum("expense", startThis, Infinity);
        setIncome(incomeNow);
        setExpenses(expenseNow);
        // Compare like with like: this month so far vs the same stretch of last month
        // (otherwise a half-finished month always looks like a big drop).
        const samePoint = Math.min(startPrev + (now.getTime() - startThis), startThis);
        setIncomeChange(pct(incomeNow, sum("income", startPrev, samePoint)));
        setExpenseChange(pct(expenseNow, sum("expense", startPrev, samePoint)));

        // Balance at the end of last month = balance now minus this month's net movement.
        const hasHistory = transactions.some((x: Transaction) => new Date(x.date).getTime() < startThis);
        const bal = Number(balance);
        const prevBal = bal - (incomeNow - expenseNow);
        setBalanceChange(hasHistory && prevBal !== 0 ? Math.round(((bal - prevBal) / Math.abs(prevBal)) * 100) : 0);
      } catch (error) {
        console.error(
          "Failed to load dashboard data:",
          error
        );
      } finally {
        setLoading(false);
      }
    }

    loadDashboardData();
  }, []);

  return {
    totalBalance,
    totalSavings,
    monthlyContribution,
    income,
    expenses,
    incomeChange,
    expenseChange,
    balanceChange,
    loading,
  };
}