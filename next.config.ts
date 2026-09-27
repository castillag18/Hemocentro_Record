import type { NextConfig } from "next";

/** Hostnames permitidos para acceder al dev server desde la red (VM / LAN). */
function allowedDevOrigins(): string[] {
  const hosts = new Set<string>(["localhost", "127.0.0.1", "192.168.1.112"]);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (appUrl) {
    try {
      hosts.add(new URL(appUrl).hostname);
    } catch {
      /* ignore invalid URL */
    }
  }
  const extra = process.env.ALLOWED_DEV_ORIGINS?.split(",")
    .map((h) => h.trim())
    .filter(Boolean);
  if (extra) for (const h of extra) hosts.add(h);
  return [...hosts];
}

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "xlsx", "nodemailer", "googleapis"],
  allowedDevOrigins: allowedDevOrigins(),
};

export default nextConfig;
