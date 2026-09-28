import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";
import { SESSION_COOKIE } from "./constants";
import { prisma } from "./prisma";

export type SessionPayload = {
  userId: string;
  email: string;
};

export type SessionUser = SessionPayload & {
  role: string;
  name: string;
};

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("AUTH_SECRET no está configurado");
  }
  return new TextEncoder().encode(secret);
}

export async function createSessionToken(payload: SessionPayload) {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(getSecret());
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== "string" || typeof payload.email !== "string") {
      return null;
    }
    return { userId: payload.userId, email: payload.email };
  } catch {
    return null;
  }
}

async function loadSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const payload = await verifySessionToken(token);
  if (!payload) return null;

  const user = await prisma.adminUser.findUnique({
    where: { id: payload.userId },
    select: { role: true, name: true, active: true, email: true },
  });
  if (!user?.active) return null;
  return { userId: payload.userId, email: user.email, role: user.role, name: user.name };
}

export async function getSession(): Promise<SessionPayload | null> {
  const user = await loadSessionUser();
  if (!user) return null;
  return { userId: user.userId, email: user.email };
}

export async function getSessionUser(): Promise<SessionUser | null> {
  return loadSessionUser();
}

export async function requireApiAuth() {
  const session = await getSession();
  if (!session) {
    return { session: null as SessionPayload | null, unauthorized: true as const };
  }
  return { session, unauthorized: false as const };
}

export async function requireAdminApiAuth() {
  const session = await getSessionUser();
  if (!session) {
    return { session: null as SessionUser | null, unauthorized: true as const, forbidden: false as const };
  }
  if (session.role !== "admin") {
    return { session: null, unauthorized: false as const, forbidden: true as const };
  }
  return { session, unauthorized: false as const, forbidden: false as const };
}

export async function loginWithCredentials(email: string, password: string) {
  const user = await prisma.adminUser.findUnique({
    where: { email: email.trim().toLowerCase() },
  });
  if (!user || !user.active) return null;
  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) return null;
  return { userId: user.id, email: user.email };
}
