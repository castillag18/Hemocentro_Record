import { NextResponse } from "next/server";
import { requireAdminApiAuth, requireApiAuth } from "./auth";
import {
  DB_SCHEMA_OUT_OF_SYNC_MESSAGE,
  DB_UNAVAILABLE_MESSAGE,
  isDatabaseUnavailable,
  isSchemaOutOfSync,
} from "./db-errors";
import { Prisma } from "@prisma/client";
import { checkRateLimit, rateLimitResponse } from "./rate-limit";

export async function withAuth() {
  const { session, unauthorized } = await requireApiAuth();
  if (unauthorized) {
    return {
      session: null,
      error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  return { session, error: null };
}

export async function withAdminAuth() {
  const { session, unauthorized, forbidden } = await requireAdminApiAuth();
  if (unauthorized) {
    return {
      session: null,
      error: NextResponse.json({ error: "No autorizado" }, { status: 401 }),
    };
  }
  if (forbidden) {
    return {
      session: null,
      error: NextResponse.json(
        { error: "Acceso reservado a administradores" },
        { status: 403 },
      ),
    };
  }
  return { session, error: null };
}

export async function withApiGuards(request: Request) {
  const rate = await checkRateLimit(request);
  if (!rate.allowed) {
    return { rateError: rateLimitResponse(rate), session: null, error: null as null };
  }
  const auth = await withAuth();
  return { rateError: null, ...auth };
}

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function jsonDbUnavailable() {
  return NextResponse.json(
    {
      error: DB_UNAVAILABLE_MESSAGE,
      code: "database_unavailable",
      hint: "Docker: npm run db:up && npm run db:setup — Local: ajuste DATABASE_URL en .env",
    },
    { status: 503 },
  );
}

export function jsonSchemaOutOfSync(column?: string) {
  return NextResponse.json(
    {
      error: DB_SCHEMA_OUT_OF_SYNC_MESSAGE,
      code: "schema_out_of_sync",
      column,
      hint: "npm run db:push && npm run dev:fresh",
    },
    { status: 503 },
  );
}

export function handlePrismaRouteError(error: unknown) {
  if (isSchemaOutOfSync(error)) {
    const column =
      error instanceof Prisma.PrismaClientKnownRequestError
        ? String(error.meta?.column ?? "")
        : undefined;
    return jsonSchemaOutOfSync(column || undefined);
  }
  if (isDatabaseUnavailable(error)) return jsonDbUnavailable();
  throw error;
}
