import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { jsonError, withAuth } from "@/lib/api";

const createSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres"),
  name: z.string().trim().min(2).optional(),
  role: z.enum(["admin", "operador"]).default("operador"),
});

const updateSchema = z.object({
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  name: z.string().trim().min(2).optional(),
  role: z.enum(["admin", "operador"]).optional(),
  active: z.boolean().optional(),
});

function serializeUser(user: {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: Date;
}) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    active: user.active,
    createdAt: user.createdAt.toISOString(),
  };
}

export async function GET(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q")?.trim() ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? 15)));

  const where = q
    ? {
        OR: [
          { email: { contains: q } },
          { name: { contains: q } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.adminUser.count({ where }),
    prisma.adminUser.findMany({
      where,
      orderBy: { createdAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        active: true,
        createdAt: true,
      },
    }),
  ]);

  return NextResponse.json({ total, page, pageSize, users: users.map(serializeUser) });
}

export async function POST(request: Request) {
  const { session, error } = await withAuth();
  if (error) return error;

  const me = await prisma.adminUser.findUnique({ where: { id: session!.userId } });
  if (!me || me.role !== "admin") {
    return jsonError("Solo administradores pueden crear usuarios", 403);
  }

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const email = parsed.data.email.trim().toLowerCase();
  const exists = await prisma.adminUser.findUnique({ where: { email } });
  if (exists) return jsonError("Ya existe un usuario con ese correo");

  const passwordHash = await bcrypt.hash(parsed.data.password, 10);
  const user = await prisma.adminUser.create({
    data: {
      email,
      name: parsed.data.name ?? "",
      role: parsed.data.role,
      passwordHash,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return NextResponse.json(serializeUser(user), { status: 201 });
}

export async function PUT(request: Request) {
  const { session, error } = await withAuth();
  if (error) return error;

  const me = await prisma.adminUser.findUnique({ where: { id: session!.userId } });
  if (!me || me.role !== "admin") {
    return jsonError("Solo administradores pueden editar usuarios", 403);
  }

  const body = (await request.json().catch(() => null)) as {
    id?: string;
  } | null;
  if (!body?.id) return jsonError("Falta id de usuario");

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError(parsed.error.issues[0]?.message ?? "Datos inválidos");
  }

  const existing = await prisma.adminUser.findUnique({ where: { id: body.id } });
  if (!existing) return jsonError("Usuario no encontrado", 404);

  if (parsed.data.email && parsed.data.email !== existing.email) {
    const clash = await prisma.adminUser.findUnique({
      where: { email: parsed.data.email.trim().toLowerCase() },
    });
    if (clash) return jsonError("Ya existe un usuario con ese correo");
  }

  const data: {
    email?: string;
    name?: string;
    role?: string;
    active?: boolean;
    passwordHash?: string;
  } = {};

  if (parsed.data.email) data.email = parsed.data.email.trim().toLowerCase();
  if (parsed.data.name !== undefined) data.name = parsed.data.name;
  if (parsed.data.role) data.role = parsed.data.role;
  if (parsed.data.active !== undefined) data.active = parsed.data.active;
  if (parsed.data.password) {
    data.passwordHash = await bcrypt.hash(parsed.data.password, 10);
  }

  const user = await prisma.adminUser.update({
    where: { id: body.id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
    },
  });

  return NextResponse.json(serializeUser(user));
}

export async function DELETE(request: Request) {
  const { session, error } = await withAuth();
  if (error) return error;

  const me = await prisma.adminUser.findUnique({ where: { id: session!.userId } });
  if (!me || me.role !== "admin") {
    return jsonError("Solo administradores pueden eliminar usuarios", 403);
  }

  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonError("Falta id de usuario");
  if (id === session!.userId) return jsonError("No puede eliminar su propio usuario");

  const total = await prisma.adminUser.count({ where: { active: true } });
  const target = await prisma.adminUser.findUnique({ where: { id } });
  if (!target) return jsonError("Usuario no encontrado", 404);
  if (total <= 1 && target.active) {
    return jsonError("Debe existir al menos un administrador activo");
  }

  await prisma.adminUser.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
