import { SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";

const BASE = "https://api.enablebanking.com";

async function appToken() {
  const appId = process.env.ENABLE_BANKING_APP_ID;
  const pem = process.env.ENABLE_BANKING_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!appId || !pem) throw new Error("Enable Banking is not configured");
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(createPrivateKey(pem));
}

export async function eb<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const options: RequestInit = {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await appToken()}`, "Content-Type": "application/json" },
  };
  if (init.body) options.body = JSON.stringify(init.body);
  const res = await fetch(BASE + path, options);
  if (!res.ok) throw new Error(`Enable Banking ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
