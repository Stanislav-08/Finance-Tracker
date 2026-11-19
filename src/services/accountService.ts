import { supabase } from "../lib/supabase";

const API_URL = import.meta.env.VITE_API_URL;

async function authHeaders(): Promise<Record<string, string>> {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    throw new Error("You must be logged in.");
  }

  return {
    Authorization: `Bearer ${session.access_token}`,
    "Content-Type": "application/json",
  };
}

async function request<T>(
  path: string,
  errorMessage: string,
  init: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    ...init,
    headers: { ...(await authHeaders()), ...(init.headers ?? {}) },
  });

  if (!response.ok) {
    let detail = "";
    try {
      detail = (await response.json()).error ?? "";
    } catch {
      /* response had no JSON body */
    }
    throw new Error(`${errorMessage} (HTTP ${response.status})${detail ? ": " + detail : ""}`);
  }

  return response.json();
}

export async function getTotalBalance(userId: string) {
  const data = await request<{ totalBalance: number }>(
    `/api/accounts/balance/${userId}`,
    "Failed to fetch total balance"
  );
  return data.totalBalance;
}

export async function getTotalSavings(userId: string) {
  const data = await request<{ totalSavings: number }>(
    `/api/accounts/savings/${userId}`,
    "Failed to fetch total savings"
  );
  return data.totalSavings;
}

export async function getMonthlyContribution(userId: string) {
  const data = await request<{ monthlyContribution: number }>(
    `/api/accounts/monthly-contribution/${userId}`,
    "Failed to fetch monthly contribution"
  );
  return data.monthlyContribution;
}

export async function updateMonthlyContribution(
  userId: string,
  amount: number
) {
  const data = await request<{ monthlyContribution: number }>(
    `/api/accounts/monthly-contribution/${userId}`,
    "Failed to update monthly contribution",
    { method: "PUT", body: JSON.stringify({ amount }) }
  );
  return data.monthlyContribution;
}

export async function getTransactions(userId: string) {
  const data = await request<{ transactions: any[] }>(
    `/api/accounts/transactions/${userId}`,
    "Failed to fetch transactions"
  );
  return data.transactions;
}

export async function getSavingsGoals(userId: string) {
  const data = await request<{ savingsGoals: any[] }>(
    `/api/accounts/savings-goals/${userId}`,
    "Failed to fetch savings goals"
  );
  return data.savingsGoals;
}

export async function createSavingsGoal(
  userId: string,
  name: string,
  categoryId: string,
  target: number,
  deadline: string
) {
  const data = await request<{ savingsGoal: any }>(
    `/api/accounts/savings-goals/${userId}`,
    "Failed to create savings goal",
    {
      method: "POST",
      body: JSON.stringify({ name, categoryId, target, deadline }),
    }
  );
  return data.savingsGoal;
}

export interface AccountItem {
  id: string;
  name: string;
  currency: string;
  balance: number | string;
}

export interface CategoryItem {
  id: string;
  name: string;
  type: "income" | "expense";
}

export async function getAccounts(userId: string) {
  const data = await request<{ accounts: AccountItem[] }>(
    `/api/accounts/accounts/${userId}`,
    "Failed to fetch accounts"
  );
  return data.accounts;
}

export async function getCategories(userId: string) {
  const data = await request<{ categories: CategoryItem[] }>(
    `/api/accounts/categories/${userId}`,
    "Failed to fetch categories"
  );
  return data.categories;
}

export async function createTransaction(
  userId: string,
  payload: {
    accountId: string;
    categoryId?: string;
    amount: number;
    type: "income" | "expense";
    merchant?: string;
    description?: string;
    date: string;
  }
) {
  const data = await request<{ transaction: any }>(
    `/api/accounts/transactions/${userId}`,
    "Failed to create transaction",
    { method: "POST", body: JSON.stringify(payload) }
  );
  return data.transaction;
}

export async function getBudgets(userId: string, month: number, year: number) {
  const d = await request<{ budgets: any[] }>(
    `/api/accounts/budgets/${userId}?month=${month}&year=${year}`, "Failed to fetch budgets");
  return d.budgets;
}

export async function saveBudget(userId: string, categoryId: string, month: number, year: number, amount: number) {
  await request(`/api/accounts/budgets/${userId}`, "Failed to save budget",
    { method: "PUT", body: JSON.stringify({ categoryId, month, year, amount }) });
}

export async function depositToGoal(userId: string, goalId: string, amount: number) {
  await request(`/api/accounts/savings-goals/${userId}/${goalId}/deposit`, "Failed to deposit",
    { method: "POST", body: JSON.stringify({ amount }) });
}

export async function createAccount(userId: string, name: string, currency: string) {
  await request(`/api/accounts/accounts/${userId}`, "Failed to create account",
    { method: "POST", body: JSON.stringify({ name, currency }) });
}

export async function deleteTransaction(userId: string, id: string) {
  await request(`/api/accounts/transactions/${userId}/${id}`, "Failed to delete transaction", { method: "DELETE" });
}

export async function getSubscriptions(userId: string) {
  return (await request<{ subscriptions: any[] }>(`/api/accounts/subscriptions/${userId}`, "Failed to fetch subscriptions")).subscriptions;
}

export async function createSubscription(userId: string, body: { name: string; amount: number; billingCycle: string; nextPaymentDate: string; status?: string }) {
  await request(`/api/accounts/subscriptions/${userId}`, "Failed to create subscription", { method: "POST", body: JSON.stringify(body) });
}

export async function deleteSubscription(userId: string, id: string) {
  await request(`/api/accounts/subscriptions/${userId}/${id}`, "Failed to delete subscription", { method: "DELETE" });
}

export const getBanks = async (country: string) =>
  (await request<{ banks: { name: string; country: string }[] }>(`/api/open-banking/banks?country=${country}`, "Failed to load banks")).banks;

export const startBankConnect = async (bank: string, country: string, state: string) =>
  (await request<{ url: string }>("/api/open-banking/connect", "Failed to start bank connection",
    { method: "POST", body: JSON.stringify({ bank, country, state }) })).url;

export const finishBankSession = (code: string, bank: string, country: string, target: "main" | "new") =>
  request<{ connected: number }>("/api/open-banking/session", "Failed to finish bank connection",
    { method: "POST", body: JSON.stringify({ code, bank, country, target }) });

export const getBankConnections = async () =>
  (await request<{ connections: any[] }>("/api/open-banking/connections", "Failed to load connections")).connections;

export const syncBanks = () =>
  request<{ imported: number; results: { name: string; status: string; imported: number; message?: string }[] }>("/api/open-banking/sync", "Failed to sync", { method: "POST", body: "{}" });

export const getBankCredentials = () =>
  request<{ configured: boolean; source: "own" | "shared" | null; appId: string | null }>("/api/open-banking/credentials", "Failed to load credentials");

export const saveBankCredentials = (appId: string, privateKey: string) =>
  request("/api/open-banking/credentials", "Failed to save credentials", { method: "PUT", body: JSON.stringify({ appId, privateKey }) });

export const removeBankCredentials = () =>
  request("/api/open-banking/credentials", "Failed to remove credentials", { method: "DELETE" });

export const setAccountBalance = (userId: string, accountId: string, balance: number) =>
  request(`/api/accounts/accounts/${userId}/${accountId}/balance`, "Failed to update balance", { method: "PUT", body: JSON.stringify({ balance }) });

export const transfer = (userId: string, fromId: string, toId: string, amount: number) =>
  request(`/api/accounts/transfers/${userId}`, "Failed to transfer", { method: "POST", body: JSON.stringify({ fromId, toId, amount }) });
