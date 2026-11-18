import { SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";

const BASE = "https://api.enablebanking.com";

export interface EbCredentials {
  appId: string;
  privateKey: string;
}

async function appToken(c: EbCredentials) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: c.appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(createPrivateKey(c.privateKey.replace(/\\n/g, "\n")));
}

export async function eb<T>(
  c: EbCredentials,
  path: string,
  init: { method?: string; body?: unknown } = {}
): Promise<T> {
  const options: RequestInit = {
    method: init.method ?? "GET",
    headers: { Authorization: `Bearer ${await appToken(c)}`, "Content-Type": "application/json" },
  };
  if (init.body) options.body = JSON.stringify(init.body);
  const res = await fetch(BASE + path, options);
  if (!res.ok) throw new Error(`Enable Banking ${res.status}: ${await res.text()}`);
  return res.json() as Promise<T>;
}
