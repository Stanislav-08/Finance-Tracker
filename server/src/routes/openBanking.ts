import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import { eb, normalizePem } from "../lib/enableBanking.js";
import { decrypt, encrypt } from "../lib/crypto.js";
import prisma from "../lib/prisma.js";

const router = Router();
router.use(requireAuth);
const uid = (req: any) => (req as AuthenticatedRequest).userId as string;
const fail = (res: any, e: unknown) => {
  console.error(e);
  res.status(500).json({ error: e instanceof Error ? e.message : "Open banking error" });
};

async function creds(userId: string) {
  const r = await prisma.$queryRaw<{ appId: string; privateKey: string }[]>`SELECT "appId","privateKey" FROM "BankCredential" WHERE "userId" = ${userId}`;
  const row = r[0];
  if (!row) throw new Error("Add your Enable Banking credentials first");
  return { appId: row.appId, privateKey: decrypt(row.privateKey) };
}

router.get("/credentials", async (req, res) => {
  try {
    const r = await prisma.$queryRaw<{ appId: string }[]>`SELECT "appId" FROM "BankCredential" WHERE "userId" = ${uid(req)}`;
    res.json({ configured: r.length > 0, appId: r[0]?.appId ?? null });
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
    const { code, bank, country } = req.body;
    if (!code) return res.status(400).json({ error: "code required" });
    const s = await eb<{ session_id: string; aspsp?: { name: string; country: string }; accounts: any[] }>(c, "/sessions", {
      method: "POST", body: { code },
    });
    for (const a of s.accounts) {
      const accountUid = a.uid;
      if (!accountUid) continue;
      const iban: string = a.account_id?.iban ?? a.account_id?.other?.identification ?? "";
      const bankName = s.aspsp?.name ?? bank ?? "Bank";
      const name = `${bankName}${iban ? " …" + iban.slice(-4) : ""}`;
      const exists = await prisma.$queryRaw<{ id: string }[]>`SELECT "id" FROM "BankConnection" WHERE "accountUid" = ${accountUid} AND "userId" = ${userId}`;
      if (exists.length) continue;
      const acc = await prisma.account.create({ data: { userId, name, currency: a.currency || "EUR", balance: 0 } });
      await prisma.$executeRaw`INSERT INTO "BankConnection" ("userId","aspspName","country","sessionId","accountUid","accountId")
        VALUES (${userId}, ${bankName}, ${s.aspsp?.country ?? country ?? ""}, ${s.session_id}, ${accountUid}, ${acc.id})`;
    }
    res.json({ connected: s.accounts.length });
  } catch (e) { fail(res, e); }
});

router.get("/connections", async (req, res) => {
  try {
    const connections = await prisma.$queryRaw`SELECT c."id", c."aspspName", c."lastSyncedAt", a."name", a."balance", a."currency"
      FROM "BankConnection" c JOIN "Account" a ON a."id" = c."accountId" WHERE c."userId" = ${uid(req)} ORDER BY c."createdAt"`;
    res.json({ connections });
  } catch (e) { fail(res, e); }
});

// 4. Sync balances + transactions for all connected accounts
router.post("/sync", async (req, res) => {
  try {
    const userId = uid(req);
    const c = await creds(userId);
    const conns = await prisma.$queryRaw<{ accountUid: string; accountId: string }[]>`SELECT "accountUid","accountId" FROM "BankConnection" WHERE "userId" = ${userId}`;
    let imported = 0;
    for (const conn of conns) {
      const bal = await eb<{ balances: any[] }>(c, `/accounts/${conn.accountUid}/balances`);
      const pick = ["CLBD", "ITBD", "XPCD", "CLAV", "ITAV"].map((t) => bal.balances.find((b) => b.balance_type === t)).find(Boolean) ?? bal.balances[0];
      if (pick) await prisma.account.update({ where: { id: conn.accountId }, data: { balance: Number(pick.balance_amount.amount) } });

      const rows: any[] = [];
      let key: string | undefined;
      for (let page = 0; page < 5; page++) {
        const t = await eb<{ transactions: any[]; continuation_key?: string }>(c, 
          `/accounts/${conn.accountUid}/transactions${key ? `?continuation_key=${encodeURIComponent(key)}` : ""}`);
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
      const valid = rows.filter((r) => r.d);
      if (valid.length) {
        const n = await prisma.$executeRaw`INSERT INTO "Transaction" ("userId","accountId","amount","type","merchant","description","date","externalId")
          SELECT ${userId}, ${conn.accountId}, x.amount, x.type, x.merchant, x.descr, x.d::timestamp, x.ext
          FROM jsonb_to_recordset(${JSON.stringify(valid)}::jsonb) AS x(ext text, amount numeric, type text, merchant text, descr text, d text)
          ON CONFLICT ("accountId","externalId") DO NOTHING`;
        imported += Number(n);
      }
      await prisma.$executeRaw`UPDATE "BankConnection" SET "lastSyncedAt" = now() WHERE "accountUid" = ${conn.accountUid} AND "userId" = ${userId}`;
    }
    res.json({ imported });
  } catch (e) { fail(res, e); }
});

export default router;
