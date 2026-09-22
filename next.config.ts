import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["@prisma/client", "xlsx", "nodemailer", "googleapis"],
};

export default nextConfig;
