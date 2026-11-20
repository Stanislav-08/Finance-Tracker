import { Router } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middleware/auth.middleware.js";
import prisma from "../lib/prisma.js";

// Pocket money / cash spending: just a log of expenses, no balance, separate from accounts.
const router = Router();
router.use(requireAuth);
router.param("userId", (req, res, next, value) => {
  if ((req as AuthenticatedRequest).userId !== value) return res.status(403).json({ error: "Forbidden" });
  next();
});

router.get("/:userId", async (req, res) => {
  try {
    const items = await prisma.$queryRaw`SELECT "id", "amount"::float8 AS "amount", "categoryId", "note", "date"
      FROM "PocketExpense" WHERE "userId" = ${req.params.userId} ORDER BY "date" DESC, "createdAt" DESC LIMIT 2000`;
    res.json({ items });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to load pocket spending" }); }
});

router.post("/:userId", async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    if (!(amount > 0) || !req.body.date) return res.status(400).json({ error: "positive amount and date required" });
    const date = new Date(req.body.date);
    const categoryId = req.body.categoryId || null;
    const note = req.body.note ? String(req.body.note).slice(0, 200) : null;
    await prisma.$executeRaw`INSERT INTO "PocketExpense" ("userId","amount","categoryId","note","date")
      VALUES (${req.params.userId}, ${amount}, ${categoryId}, ${note}, ${date})`;
    res.status(201).json({ success: true });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to save" }); }
});

router.delete("/:userId/:id", async (req, res) => {
  try {
    const n = await prisma.$executeRaw`DELETE FROM "PocketExpense" WHERE "id" = ${req.params.id} AND "userId" = ${req.params.userId}`;
    n ? res.json({ success: true }) : res.status(404).json({ error: "Not found" });
  } catch (e) { console.error(e); res.status(500).json({ error: "Failed to delete" }); }
});

export default router;
