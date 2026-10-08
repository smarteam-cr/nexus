/**
 * GET /api/escala/borrador/md — el `.md` del borrador, generado desde sus datos, para bajarlo y
 * editarlo. Se vuelve a subir con /api/escala/borrador/importar. Solo los super admin.
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { puedeEditarLaEscala } from "@/lib/escala/datos/reglas";
import { SOLO_SUPER_ADMIN } from "@/lib/escala/datos/respuestas";
import { markdownDelBorrador } from "@/lib/escala/datos/servidor";

export async function GET() {
  const ctx = await guardInternalUser();
  if (ctx instanceof NextResponse) return ctx;
  if (!puedeEditarLaEscala(ctx.role)) return NextResponse.json({ error: SOLO_SUPER_ADMIN }, { status: 403 });
  const md = await markdownDelBorrador();
  if (!md) return NextResponse.json({ error: "No hay ningún borrador abierto." }, { status: 404 });
  return new NextResponse(md.texto, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="escala_rendimiento_smarteam-${md.version}-borrador.md"`,
      "Cache-Control": "no-store",
    },
  });
}
