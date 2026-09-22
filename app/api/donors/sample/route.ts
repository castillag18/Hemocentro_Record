import { NextResponse } from "next/server";
import { withAuth } from "@/lib/api";

const SAMPLE = `nombre,cedula,grupo_sanguineo,ultima_donacion,telefono,email,canal
Carlos Mendoza,0923456781,O+,2026-05-20,3001234567,carlos.m@email.com,ambos
María López,1712345678,A-,2026-05-18,3107654321,m.lopez@email.com,email
`;

export async function GET() {
  const { error } = await withAuth();
  if (error) return error;

  return new NextResponse(SAMPLE, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plantilla-donantes-hemocentro.csv"',
    },
  });
}
