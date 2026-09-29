/**
 * /api/cobranza/import — importador CSV (AccountSource "sheet", puerto 1).
 *   POST → `{accion:"preparar"}` da el permiso para subir DIRECTO a Supabase; `{accion:"confirmar"}`
 *          baja el archivo, lo borra del bucket y parsea el CSV (papaparse), crea el batch BORRADOR con
 *          el mapeo SUGERIDO (heurística de headers, editable en el wizard) + una
 *          ImportacionFila por fila cruda. Cap 5 MB (413).
 *          Un .xlsx es el LIBRO DE ALEX (etapa 11): no se mapea, se lee por pestañas y secciones y
 *          queda como lote para compararlo contra Nexus (lib/cobranza/libro-alex-server.ts). Nada entra
 *          a cuentas ni a cobros.
 *   GET  → lista de batches (para reabrir un import a medias desde el wizard), con su `fuente`.
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN).
 */
import { NextRequest, NextResponse } from "next/server";
import Papa from "papaparse";
import type { Prisma } from "@prisma/client";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { sugerirMapeo } from "@/lib/cobranza/import-core";
import { LibroError, crearLoteDelLibro } from "@/lib/cobranza/libro-alex-server";
import {
  borrarSubido,
  descargarSubido,
  nombreSeguro,
  pedirPermisoDeSubida,
  validarDeclarado,
  validarSubido,
} from "@/lib/storage/subida-directa";

const MAX_CSV_BYTES = 5 * 1024 * 1024; // 5 MB
const CARPETA = "imports/cobranza";
/* Los navegadores declaran un CSV de muchas formas (Windows lo llama «vnd.ms-excel», algunos lo dejan
   vacío y Storage lo guarda como octet-stream). El que decide es la extensión, como antes. */
const REGLAS_DEL_IMPORT = {
  mimes: [
    "text/csv",
    "text/plain",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/octet-stream",
    "",
  ],
  maxBytes: MAX_CSV_BYTES,
  etiquetaMax: "5 MB",
  tipos: "CSV o .xlsx",
} as const;

export async function GET() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;

  const batches = await prisma.importacionCobranza.findMany({
    orderBy: { createdAt: "desc" },
    take: 20,
    select: {
      id: true,
      archivoNombre: true,
      fuente: true,
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

  // El archivo va del navegador DIRECTO a Supabase (el nginx del VPS corta en 1 MB): `preparar` da
  // el permiso; `confirmar` lo baja, lo BORRA del bucket (el import nunca guardó el archivo: solo las
  // filas) y sigue como siempre. Ver lib/storage/subida-directa.ts.
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }
  const nombreDeclarado = typeof body.nombre === "string" ? body.nombre.slice(0, 200) : "";
  if (!/\.(csv|xlsx)$/i.test(nombreDeclarado)) {
    return NextResponse.json({ error: "Subí el CSV del sheet de Finanzas o el libro de Alex en .xlsx." }, { status: 415 });
  }

  if (body.accion === "preparar") {
    const v = validarDeclarado(body, REGLAS_DEL_IMPORT);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
    const permiso = await pedirPermisoDeSubida("documentos", `${CARPETA}/${Date.now()}_${nombreSeguro(v.nombre)}`);
    if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ signedUrl: permiso.signedUrl, path: permiso.path });
  }
  if (body.accion !== "confirmar") return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });

  const path = typeof body.path === "string" ? body.path : "";
  if (!path.startsWith(`${CARPETA}/`) || path.includes("..") || path.slice(CARPETA.length + 1).includes("/")) {
    return NextResponse.json({ error: "Esa subida no es de este lugar." }, { status: 400 });
  }
  const real = await validarSubido("documentos", path, REGLAS_DEL_IMPORT);
  if (!real.ok) return NextResponse.json({ error: real.error }, { status: real.status });
  const buffer = await descargarSubido("documentos", path);
  await borrarSubido("documentos", path);
  if (!buffer) return NextResponse.json({ error: "No se pudo leer el archivo subido. Vuelve a intentarlo." }, { status: 502 });
  const file = { name: nombreDeclarado, arrayBuffer: async () => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer, text: async () => buffer.toString("utf8") };

  if (/\.xlsx$/i.test(file.name)) {
    try {
      const libro = await crearLoteDelLibro({ nombre: file.name, datos: await file.arrayBuffer() }, guard.user.email);
      return NextResponse.json({ libro }, { status: 201 });
    } catch (e) {
      if (e instanceof LibroError) return NextResponse.json({ error: e.message }, { status: e.status });
      throw e;
    }
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
