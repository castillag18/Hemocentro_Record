import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({
      ok: true,
      database: "connected",
      url: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        database: "disconnected",
        error: error instanceof Error ? error.message : "Error de base de datos",
        hint: "Inicie MySQL (Docker: npm run db:up && npm run db:setup) y verifique DATABASE_URL en .env",
      },
      { status: 503 },
    );
  }
}
