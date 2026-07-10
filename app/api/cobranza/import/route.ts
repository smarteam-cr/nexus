/**
 * /api/cobranza/import — importador CSV (AccountSource "sheet", puerto 1).
 *   POST → FormData {file}: parsea el CSV (papaparse), crea el batch BORRADOR con
 *          el mapeo SUGERIDO (heurística de headers, editable en el wizard) + una
 *          ImportacionFila por fila cruda. Cap 5 MB (413).
 *   GET  → lista de batches (para reabrir un import a medias desde el wizard).
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import type { Prisma } from "@prisma/client";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sugerirMapeo } from "@/lib/cobranza/import-core";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  const batches = await prisma.importacionCobranza.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      archivoNombre: true,
      estado: true,
      totalFilas: true,
      createdAt: true,
      resumen: true,
    },
  });
  return NextResponse.json({ batches });
}

export async function POST(req: NextRequest) {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ error: "Se esperaba FormData con el archivo CSV." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No se envió ningún archivo." }, { status: 400 });
  }
  if (file.size > MAX_CSV_BYTES) {
    return NextResponse.json({ error: "El archivo supera el máximo de 5 MB." }, { status: 413 });
  }

  const parsed = Papa.parse<Record<string, unknown>>(await file.text(), {
    header: true,
    skipEmptyLines: "greedy",
  });
  const headers = (parsed.meta.fields ?? []).filter((h) => h && h.trim() !== "");
  if (headers.length === 0) {
    return NextResponse.json(
      { error: "El CSV no tiene encabezados reconocibles en la primera línea." },
      { status: 400 },
    );
  }
  if (parsed.data.length === 0) {
    return NextResponse.json({ error: "El CSV no tiene filas de datos." }, { status: 400 });
  }

  const batch = await prisma.importacionCobranza.create({
    data: {
      archivoNombre: file.name || "import.csv",
      mapeo: sugerirMapeo(headers) as Prisma.InputJsonValue,
      columnas: headers,
      totalFilas: parsed.data.length,
      creadoPor: guard.user.email,
      filas: {
        createMany: {
          data: parsed.data.map((raw, i) => ({
            numFila: i + 1, // 1-based en el CSV
            raw: raw as Prisma.InputJsonValue,
          })),
        },
      },
    },
    include: {
      filas: {
        orderBy: { numFila: "asc" },
        select: { id: true, numFila: true, raw: true, estado: true },
      },
    },
  });

  return NextResponse.json({ batch }, { status: 201 });
}
