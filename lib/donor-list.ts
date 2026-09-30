import type { Prisma } from "@prisma/client";
import { prisma } from "./prisma";
import { normalizePhone } from "./whatsapp";

export type DonorListQuery = {
  q?: string;
  bloodType?: string;
  page: number;
  pageSize: number;
};

export type DonorListRow = {
  id: string;
  name: string;
  documentId: string;
  bloodType: string;
  gender: string | null;
  donationType: string;
  birthDate: Date | null;
  lastDonationDate: Date;
  phone: string | null;
  email: string | null;
  preferredChannel: string;
  active: boolean;
  accepted: boolean;
  whatsappChatId: string | null;
  createdAt: Date;
  updatedAt: Date;
};

const listSelect = {
  id: true,
  name: true,
  documentId: true,
  bloodType: true,
  gender: true,
  donationType: true,
  birthDate: true,
  lastDonationDate: true,
  phone: true,
  email: true,
  preferredChannel: true,
  active: true,
  accepted: true,
  whatsappChatId: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DonorSelect;

function buildDonorSearchWhereWithoutFulltext(q: string, bloodType: string): Prisma.DonorWhereInput {
  const and: Prisma.DonorWhereInput[] = [];
  if (bloodType) and.push({ bloodType });
  const trimmed = q.trim();
  if (!trimmed) return and.length ? { AND: and } : {};
  if (trimmed.length < 2) return { AND: [...and, { id: { in: [] } }] };

  const or: Prisma.DonorWhereInput[] = [];
  const docDigits = trimmed.replace(/\D/g, "");
  if (docDigits.length >= 4) {
    or.push({ documentId: trimmed });
    or.push({ documentId: { startsWith: docDigits } });
  }
  or.push({ name: { startsWith: trimmed } });
  and.push({ OR: or });
  return { AND: and };
}

/** Condiciones de búsqueda index-friendly (evita OR con contains en 4 columnas). */
export function buildDonorSearchWhere(q: string, bloodType: string): Prisma.DonorWhereInput {
  const and: Prisma.DonorWhereInput[] = [];
  if (bloodType) and.push({ bloodType });

  const trimmed = q.trim();
  if (!trimmed) return and.length ? { AND: and } : {};
  if (trimmed.length < 2) return { AND: [...and, { id: { in: [] } }] };

  const or: Prisma.DonorWhereInput[] = [];
  const docDigits = trimmed.replace(/\D/g, "");

  if (docDigits.length >= 4) {
    or.push({ documentId: trimmed });
    or.push({ documentId: { startsWith: docDigits } });
  }

  if (trimmed.includes("@")) {
    or.push({ email: { startsWith: trimmed } });
    or.push({ email: { contains: trimmed } });
  } else {
    const phone = normalizePhone(trimmed);
    if (phone && phone.length >= 8) {
      or.push({ phone: { endsWith: phone.slice(-10) } });
      or.push({ phone: { contains: phone.slice(-10) } });
    }

    or.push({ name: { startsWith: trimmed } });
    const ftQuery = trimmed
      .split(/\s+/)
      .filter((w) => w.length >= 2)
      .map((w) => `${w}*`)
      .join(" ");
    if (ftQuery) {
      or.push({ name: { search: ftQuery } });
      or.push({ documentId: { search: ftQuery } });
    }
  }

  if (!or.length) or.push({ name: { startsWith: trimmed } });

  and.push({ OR: or });
  return { AND: and };
}

export async function listDonorsPaginated(options: DonorListQuery): Promise<{
  donors: DonorListRow[];
  page: number;
  pageSize: number;
  total: number;
  hasMore: boolean;
  totalExact: boolean;
}> {
  const page = Math.max(1, options.page);
  const pageSize = Math.min(100, Math.max(10, options.pageSize));
  const q = options.q?.trim() ?? "";
  const bloodType = options.bloodType?.trim() ?? "";
  const where = buildDonorSearchWhere(q, bloodType);
  const skip = (page - 1) * pageSize;
  const take = pageSize + 1;

  let donors: DonorListRow[];
  try {
    donors = await prisma.donor.findMany({
      where,
      orderBy: { name: "asc" },
      skip,
      take,
      select: listSelect,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!/fulltext|FULLTEXT|search/i.test(msg) || !q.trim()) throw err;
    const fallbackWhere = buildDonorSearchWhereWithoutFulltext(q, bloodType);
    donors = await prisma.donor.findMany({
      where: fallbackWhere,
      orderBy: { name: "asc" },
      skip,
      take,
      select: listSelect,
    });
  }

  const hasMore = donors.length > pageSize;
  const pageDonors = donors.slice(0, pageSize);

  const searching = q.length >= 2 || Boolean(bloodType);
  let total: number;
  let totalExact: boolean;

  if (!searching) {
    total = await prisma.donor.count();
    totalExact = true;
  } else if (hasMore) {
    total = skip + pageSize + 1;
    totalExact = false;
  } else {
    total = skip + pageDonors.length;
    totalExact = true;
  }

  return {
    donors: pageDonors,
    page,
    pageSize,
    total,
    hasMore,
    totalExact,
  };
}
