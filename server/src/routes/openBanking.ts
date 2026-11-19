import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { eb, normalizePem, type EbCredentials } from "../lib/enableBanking.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import prisma from "../lib/prisma.js";

const router = Router();
router.use(requireAuth);
const uid = (req: any) => (req as AuthenticatedRequest).userId as string;
const fail = (res: any, e: unknown) => {
  console.error(e);
  if (e instanceof Error && e.message.includes("Enable Banking 429")) {
    return res.status(429).json({ error: "Your bank limits how often data can be refreshed. Please try again later." });
  }
  res.status(500).json({ error: e instanceof Error ? e.message : "Open banking error" });
};

// Priority: the user's own saved credentials, then the app's built-in (server env) connection
// if this user is allowed to use it (BANK_SHARED_USERS = comma-separated user IDs, or "*" for everyone).
function sharedFor(userId: string) {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const privateKey = process.env.ENABLE_BANKING_PRIVATE_KEY;
  const allowed = (process.env.BANK_SHARED_USERS ?? "").split(",").map((x) => x.trim());
  if (!appId || !privateKey || !(allowed.includes("*") || allowed.includes(userId))) return null;
  return { appId, privateKey };
}

async function creds(userId: string) {
  const r = await prisma.$queryRaw<{ appId: string; privateKey: string }[]>`SELECT "appId","privateKey" FROM "BankCredential" WHERE "userId" = ${userId}`;
  const row = r[0];
  if (row) return { appId: row.appId, privateKey: decrypt(row.privateKey) };
  const shared = sharedFor(userId);
  if (shared) return shared;
  throw new Error("Add your Enable Banking credentials first");
}

router.get("/credentials", async (req, res) => {
  try {
    const r = await prisma.$queryRaw<{ appId: string }[]>`SELECT "appId" FROM "BankCredential" WHERE "userId" = ${uid(req)}`;
    const own = r[0]?.appId;
    const shared = sharedFor(uid(req));
    res.json({
      configured: Boolean(own || shared),
      source: own ? "own" : shared ? "shared" : null,
      appId: own ?? shared?.appId ?? null,
    });
  } catch (e) { fail(res, e); }
});

router.put("/credentials", async (req, res) => {
  try {
    const appId = String(req.body.appId ?? "").trim();
    const rawKey = String(req.body.privateKey ?? "").trim();
    if (!appId || !rawKey) return res.status(400).json({ error: "appId and privateKey required" });
    let privateKey: string;
    try { privateKey = normalizePem(rawKey); }
    catch (e) { return res.status(400).json({ error: e instanceof Error ? e.message : "Invalid private key" }); }
    try { await eb(c0(appId, privateKey), "/aspsps?country=FI"); }
    catch (e) { return res.status(400).json({ error: `Credentials rejected: ${e instanceof Error ? e.message : e}` }); }
    const enc = encrypt(privateKey);
    await prisma.$executeRaw`INSERT INTO "BankCredential" ("userId","appId","privateKey") VALUES (${uid(req)}, ${appId}, ${enc})
      ON CONFLICT ("userId") DO UPDATE SET "appId" = ${appId}, "privateKey" = ${enc}`;
    res.json({ configured: true, appId });
  } catch (e) { fail(res, e); }
});

router.delete("/credentials", async (req, res) => {
  try {
    await prisma.$executeRaw`DELETE FROM "BankCredential" WHERE "userId" = ${uid(req)}`;
    res.json({ configured: false });
  } catch (e) { fail(res, e); }
});

const c0 = (appId: string, privateKey: string) => ({ appId, privateKey });

/** Bank data goes into the user's main account (the one flagged isMain). Created if missing. */
async function mainAccountId(userId: string) {
  const r = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Account" WHERE "userId" = ${userId} AND "isMain" = true LIMIT 1`;
  if (r[0]) return r[0].id;
  const acc = await prisma.account.create({ data: { userId, name: "Main account", currency: "EUR", balance: 0 } });
  await prisma.$executeRaw`UPDATE "Account" SET "isMain" = true WHERE "id" = ${acc.id}`;
  return acc.id;
}

// 1. List banks for a country
router.get("/banks", async (req, res) => {
  try {
    const c = await creds(uid(req));
    const country = String(req.query.country || "BG").toUpperCase();
    const data = await eb<{ aspsps: { name: string; country: string }[] }>(c, `/aspsps?country=${country}`);
    res.json({ banks: data.aspsps.map((b) => ({ name: b.name, country: b.country })) });
  } catch (e) { fail(res, e); }
});

// 2. Start authorization -> returns the bank login URL
router.post("/connect", async (req, res) => {
  try {
    const c = await creds(uid(req));
    const { bank, country, state } = req.body;
    if (!bank || !country || !state) return res.status(400).json({ error: "bank, country, state required" });
    const base = (process.env.CLIENT_ORIGIN ?? "http://localhost:5173").split(",")[0]?.trim().replace(/\/+$/, "") ?? "http://localhost:5173";
    const data = await eb<{ url: string }>(c, "/auth", {
      method: "POST",
      body: {
        access: { balances: true, transactions: true, valid_until: new Date(Date.now() + 85 * 864e5).toISOString() },
        aspsp: { name: bank, country },
        state,
        redirect_url: `${base}/bank/callback`,
        psu_type: "personal",
      },
    });
    res.json({ url: data.url });
  } catch (e) { fail(res, e); }
});

// 3. Finish authorization: exchange code, store accounts as local accounts
router.post("/session", async (req, res) => {
  try {
    const userId = uid(req);
    const c = await creds(userId);
    const { code, bank, country, target } = req.body;
    if (!code) return res.status(400).json({ error: "code required" });
    const s = await eb<{ session_id: string; aspsp?: { name: string; country: string }; accounts: any[] }>(c, "/sessions", {
      method: "POST", body: { code },
    });
    // target "main": feed the main account (default). target "new": create a separate account per bank account.
    const mainId = target === "new" ? null : await mainAccountId(userId);
    for (const a of s.accounts) {
      const accountUid = a.uid;
      if (!accountUid) continue;
      const iban: string = a.account_id?.iban ?? a.account_id?.other?.identification ?? "";
      const bankName = s.aspsp?.name ?? bank ?? "Bank";
      const label = `${bankName}${iban ? " …" + iban.slice(-4) : ""}`;
      const exists = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "BankConnection" WHERE "accountUid" = ${accountUid} AND "userId" = ${userId}`;
      if (exists.length) continue;
      let accountId: string | null = mainId;
      if (!accountId) {
        const acc = await prisma.account.create({ data: { userId, name: label, currency: a.currency || "EUR", balance: 0 } });
        accountId = acc.id;
      }
      await prisma.$executeRaw`INSERT INTO "BankConnection" ("userId","aspspName","country","sessionId","accountUid","accountId","label")
        VALUES (${userId}, ${bankName}, ${s.aspsp?.country ?? country ?? ""}, ${s.session_id}, ${accountUid}, ${accountId}, ${label})`;
    }
    res.json({ connected: s.accounts.length });
  } catch (e) { fail(res, e); }
});

router.get("/connections", async (req, res) => {
  try {
    const connections = await prisma.$queryRaw`SELECT c."id", c."aspspName", c."lastSyncedAt", COALESCE(c."label", a."name") AS "name", c."balance", a."currency"
      FROM "BankConnection" c JOIN "Account" a ON a."id" = c."accountId" WHERE c."userId" = ${uid(req)} ORDER BY c."createdAt"`;
    res.json({ connections });
  } catch (e) { fail(res, e); }
});

// 4. Sync balances + transactions for all connected accounts
export interface ConnResult {
  name: string;
  status: "ok" | "limit" | "rate_limited" | "error";
  imported: number;
  message?: string;
}

const MANUAL_PER_DAY = 2; // the other 2 of a typical 4-per-day bank quota are kept for the automated syncs

async function syncConnection(
  c: EbCredentials, userId: string,
  conn: { accountUid: string; accountId: string; bankBalance: unknown },
  psu: Record<string, string>
) {
  const bal = await eb<{ balances: any[] }>(c, `/accounts/${conn.accountUid}/balances`, { headers: psu });
  const pick = ["CLBD", "ITBD", "XPCD", "CLAV", "ITAV"].map((t) => bal.balances.find((b) => b.balance_type === t)).find(Boolean) ?? bal.balances[0];
  if (pick) {
    // Several bank accounts feed one main account, so apply only the CHANGE since the last sync.
    const next = Number(pick.balance_amount.amount);
    const delta = next - Number(conn.bankBalance ?? 0);
    await prisma.account.update({ where: { id: conn.accountId }, data: { balance: { increment: delta } } });
    await prisma.$executeRaw`UPDATE "BankConnection" SET "balance" = ${next} WHERE "accountUid" = ${conn.accountUid} AND "userId" = ${userId}`;
  }

  const rows: any[] = [];
  let key: string | undefined;
  for (let page = 0; page < 5; page++) {
    const t = await eb<{ transactions: any[]; continuation_key?: string }>(
      c, `/accounts/${conn.accountUid}/transactions${key ? `?continuation_key=${encodeURIComponent(key)}` : ""}`, { headers: psu });
    for (const x of t.transactions) {
      if (x.status && x.status !== "BOOK") continue;
      const income = x.credit_debit_indicator === "CRDT";
      const d = x.booking_date || x.value_date || x.transaction_date;
      const ext = x.entry_reference || x.transaction_id || `${d}|${x.transaction_amount.amount}|${x.remittance_information?.[0] ?? ""}`;
      rows.push({
        ext, amount: Math.abs(Number(x.transaction_amount.amount)), type: income ? "income" : "expense",
        merchant: (income ? x.debtor?.name : x.creditor?.name) ?? null,
        descr: (x.remittance_information ?? []).join(" ") || null, d: d ? `${d}T00:00:00` : null,
      });
    }
    key = t.continuation_key;
    if (!key) break;
  }
  let imported = 0;
  const valid = rows.filter((r) => r.d);
  if (valid.length) {
    const n = await prisma.$executeRaw`INSERT INTO "Transaction" ("userId","accountId","amount","type","merchant","description","date","externalId")
      SELECT ${userId}, ${conn.accountId}, x.amount, x.type, x.merchant, x.descr, x.d::timestamp, x.ext
      FROM jsonb_to_recordset(${JSON.stringify(valid)}::jsonb) AS x(ext text, amount numeric, type text, merchant text, descr text, d text)
      ON CONFLICT ("accountId","externalId") DO NOTHING`;
    imported = Number(n);
  }
  await prisma.$executeRaw`UPDATE "BankConnection" SET "lastSyncedAt" = now() WHERE "accountUid" = ${conn.accountUid} AND "userId" = ${userId}`;
  return imported;
}

/** Syncs every connection of one user. A bank that is over its limit is skipped, not fatal. */
export async function syncUser(userId: string, mode: "manual" | "auto", psu: Record<string, string> = {}) {
  const c = await creds(userId);
  const conns = await prisma.$queryRaw<{ accountUid: string; accountId: string; name: string; bankBalance: unknown }[]>`SELECT c."accountUid", c."accountId", COALESCE(c."label", a."name") AS "name", c."balance" AS "bankBalance"
    FROM "BankConnection" c JOIN "Account" a ON a."id" = c."accountId" WHERE c."userId" = ${userId}`;
  const results: ConnResult[] = [];
  for (const conn of conns) {
    if (mode === "manual") {
      const used = await prisma.$queryRaw<{ n: bigint }[]>`SELECT count(*) AS n FROM "BankSyncLog"
        WHERE "accountUid" = ${conn.accountUid} AND "kind" = 'manual' AND "createdAt" > now() - interval '24 hours'`;
      if (Number(used[0]?.n ?? 0) >= MANUAL_PER_DAY) {
        results.push({ name: conn.name, status: "limit", imported: 0,
          message: `Manual sync limit reached (${MANUAL_PER_DAY} per day). It will update again on the next automated sync.` });
        continue;
      }
    }
    try {
      const imported = await syncConnection(c, userId, conn, psu);
      await prisma.$executeRaw`INSERT INTO "BankSyncLog" ("userId","accountUid","kind") VALUES (${userId}, ${conn.accountUid}, ${mode})`;
      results.push({ name: conn.name, status: "ok", imported });
    } catch (e) {
      const m = e instanceof Error ? e.message : "Unknown error";
      results.push(m.includes("Enable Banking 429")
        ? { name: conn.name, status: "rate_limited", imported: 0, message: "Your bank's refresh limit is reached. It will work again on the next automated sync." }
        : { name: conn.name, status: "error", imported: 0, message: m.slice(0, 200) });
    }
  }
  return results;
}

/** Called by the Vercel cron job: syncs every user that has bank connections. */
export async function syncAllUsers() {
  const users = await prisma.$queryRaw<{ userId: string }[]>`SELECT DISTINCT "userId" FROM "BankConnection"`;
  let ok = 0, skipped = 0;
  for (const u of users) {
    try {
      const r = await syncUser(u.userId, "auto");
      ok += r.filter((x) => x.status === "ok").length;
      skipped += r.filter((x) => x.status !== "ok").length;
    } catch (e) { console.error("cron sync failed for a user", e); skipped++; }
  }
  return { users: users.length, ok, skipped };
}

router.post("/sync", async (req, res) => {
  try {
    // The user is present and pressing the button: tell the bank (PSD2 "PSU present").
    const ip = String(req.headers["x-forwarded-for"] ?? req.socket.remoteAddress ?? "").split(",")[0]?.trim() ?? "";
    const psu: Record<string, string> = {};
    if (ip) psu["PSU-IP-Address"] = ip;
    const ua = req.headers["user-agent"];
    if (ua) psu["PSU-User-Agent"] = String(ua);
    const results = await syncUser(uid(req), "manual", psu);
    res.json({ results, imported: results.reduce((a, r) => a + r.imported, 0) });
  } catch (e) { fail(res, e); }
});

export default router;
