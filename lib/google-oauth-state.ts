import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";

type PendingOAuth = {
  mode: "login" | "calendar";
  expiresAt: number;
};

const pending = new Map<string, PendingOAuth>();
const TTL_MS = 10 * 60 * 1000;
const STORE_PATH = path.join(process.cwd(), "data", ".oauth-pending.json");

function readStore(): Record<string, PendingOAuth> {
  try {
    const raw = fs.readFileSync(STORE_PATH, "utf8");
    return JSON.parse(raw) as Record<string, PendingOAuth>;
  } catch {
    return {};
  }
}

function writeStore(data: Record<string, PendingOAuth>) {
  fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
  fs.writeFileSync(STORE_PATH, JSON.stringify(data));
}

function pruneStore(data: Record<string, PendingOAuth>) {
  const now = Date.now();
  for (const [key, value] of Object.entries(data)) {
    if (value.expiresAt < now) delete data[key];
  }
  return data;
}

export function createOAuthState(mode: "login" | "calendar") {
  const state = randomBytes(24).toString("hex");
  const entry = { mode, expiresAt: Date.now() + TTL_MS };
  pending.set(state, entry);
  const store = pruneStore(readStore());
  store[state] = entry;
  writeStore(store);
  return state;
}

export function consumeOAuthState(state: string) {
  const fromMemory = pending.get(state);
  pending.delete(state);

  const store = pruneStore(readStore());
  const fromDisk = store[state];
  delete store[state];
  writeStore(store);

  const entry = fromMemory ?? fromDisk ?? null;
  if (!entry || entry.expiresAt < Date.now()) return null;
  return entry;
}
