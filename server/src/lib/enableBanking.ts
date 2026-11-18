import { SignJWT } from "jose";
import { createPrivateKey } from "node:crypto";

const BASE = "https://api.enablebanking.com";

export interface EbCredentials {
  appId: string;
  privateKey: string;
}

/** Accepts a PEM pasted with mangled line breaks, literal "\\n", or extra spaces and rebuilds a valid one. */
export function normalizePem(raw: string) {
  const text = raw.replace(/\\n/g, "\n").trim();
  const m = text.match(/-----BEGIN ([A-Z ]+)-----([\s\S]*?)-----END \1-----/);
  if (!m) throw new Error("That doesn't look like a PEM key. It must start with -----BEGIN PRIVATE KEY-----");
  const type = m[1] ?? "";
  if (!type.includes("PRIVATE KEY")) throw new Error(`You pasted a "${type}", but the private key is needed`);
  if (type.includes("ENCRYPTED")) throw new Error("Password-protected keys are not supported; use an unencrypted key");
  const body = (m[2] ?? "").replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g) ?? [];
  return `-----BEGIN ${type}-----\n${lines.join("\n")}\n-----END ${type}-----\n`;
}

async function appToken(c: EbCredentials) {
  const now = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: "RS256", typ: "JWT", kid: c.appId })
    .setIssuer("enablebanking.com")
    .setAudience("api.enablebanking.com")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(createPrivateKey(normalizePem(c.privateKey)));
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
