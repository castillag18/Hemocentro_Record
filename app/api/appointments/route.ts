import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { withAuth } from "@/lib/api";

export async function GET(request: Request) {
  const { error } = await withAuth();
  if (error) return error;

  const { searchParams } = new URL(request.url);
  const upcoming = searchParams.get("upcoming") !== "0";
  const page = Math.max(1, Number(searchParams.get("page") ?? 1));
  const pageSize = Math.min(50, Math.max(5, Number(searchParams.get("pageSize") ?? 20)));

  const where = upcoming
    ? { scheduledAt: { gte: new Date() }, status: "confirmada" }
    : {};

  const [total, appointments] = await Promise.all([
    prisma.appointment.count({ where }),
    prisma.appointment.findMany({
      where,
      include: {
        donor: {
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            bloodType: true,
            donationType: true,
          },
        },
      },
      orderBy: { scheduledAt: "asc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  return NextResponse.json({
    total,
    page,
    pageSize,
    appointments: appointments.map((item) => ({
      ...item,
      scheduledAt: item.scheduledAt.toISOString(),
      createdAt: item.createdAt.toISOString(),
    })),
  });
}
