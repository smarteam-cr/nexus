/**
 * POST /api/feedback/captura — la captura de pantalla de un reporte, directo del navegador a Supabase.
 *
 * Va al almacén PRIVADO de documentos (no al público): una captura puede mostrar datos de un cliente o
 * de Finanzas. Solo la ven quien reportó y quien revisa, con un enlace firmado que vence. Flujo de dos
 * pasos de `lib/storage/subida-directa.ts`: `preparar` da el permiso y arma el path (nunca lo elige el
 * navegador); `confirmar` revisa lo que llegó de verdad y devuelve el path para el reporte.
 */
import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { leerCuerpo, sinTablas } from "@/lib/feedback/http";
import { esPathDeCaptura } from "@/lib/feedback/mutations";
import { pedirPermisoDeSubida, validarDeclarado, validarSubido } from "@/lib/storage/subida-directa";

const REGLAS = {
  mimes: ["image/jpeg", "image/png", "image/webp"],
  maxBytes: 4 * 1024 * 1024,
  etiquetaMax: "4 MB",
  tipos: "JPG, PNG o WebP",
} as const;

const EXT: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

export async function POST(req: NextRequest) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const faltan = sinTablas();
  if (faltan) return faltan;

  const body = await leerCuerpo(req);
  if (body instanceof NextResponse) return body;
  const b = (body ?? {}) as Record<string, unknown>;

  if (b.accion === "preparar") {
    const v = validarDeclarado(b, REGLAS);
    if (!v.ok) return NextResponse.json({ error: v.error }, { status: v.status });
    const permiso = await pedirPermisoDeSubida("documentos", `feedback/${randomUUID()}.${EXT[v.tipo] ?? "jpg"}`);
    if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ signedUrl: permiso.signedUrl, path: permiso.path });
  }
  if (b.accion !== "confirmar") return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  if (typeof b.path !== "string" || !esPathDeCaptura(b.path)) {
    return NextResponse.json({ error: "Esa subida no es de este lugar." }, { status: 400 });
  }
  const r = await validarSubido("documentos", b.path, REGLAS);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ path: b.path });
}
