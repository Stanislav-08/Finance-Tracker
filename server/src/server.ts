import "dotenv/config";
import express from "express";
import cors from "cors";
import accountRoutes from "./routes/accountRoutes.js";
import bankingRouter from "./routes/banking.js";
import pocketRouter from "./routes/pocketRoutes.js";
import openBankingRouter, { syncAllUsers } from "./routes/openBanking.js";

const app = express();

const PORT = Number(process.env.PORT) || 5000;

app.use(
  cors({
    origin: (process.env.CLIENT_ORIGIN ?? "http://localhost:5173")
      .split(",")
      .map((o) => o.trim().replace(/\/+$/, "")),
    allowedHeaders: ["Content-Type", "Authorization"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  }),
);

app.use(express.json());
app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
  });
});

app.use("/api/banking", bankingRouter);
app.use("/api/open-banking", openBankingRouter);
app.use("/api/pocket", pocketRouter);

// Vercel Cron (twice a day, see vercel.json). Vercel sends "Authorization: Bearer $CRON_SECRET".
app.get("/api/cron/sync", async (req, res) => {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  try {
    res.json(await syncAllUsers());
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Cron sync failed" });
  }
});

app.use("/api/accounts", accountRoutes);

if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;
