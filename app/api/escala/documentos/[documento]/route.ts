/**
 * GET /api/escala/documentos/[documento]?version= — descarga un documento de la escala TAL CUAL
 * se publicó en Nexus (escala, especificacion o manual), con su nombre de archivo fijo.
 *
 * Es para llevar la escala a otros chats o sistemas: Nexus es la fuente, así que se baja de acá y
 * no de una carpeta de descargas. Interno, como toda la sección.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { esDocumentoDeLaEscala } from "@/lib/escala/documento/documentos";
import { leerDocumentoPublicado } from "@/lib/escala/documento/vigente";

export async function GET(req: NextRequest, { params }: { params: Promise<{ documento: string }> }) {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const { documento } = await params;
  if (!esDocumentoDeLaEscala(documento)) {
    return NextResponse.json({ error: "No existe ese documento de la escala." }, { status: 404 });
  }
  const version = req.nextUrl.searchParams.get("version");
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    return NextResponse.json({ error: "Versión inválida." }, { status: 400 });
  }
  const doc = await leerDocumentoPublicado(documento, version);
  if (!doc) {
    return NextResponse.json({ error: "Ese documento todavía no está publicado en Nexus." }, { status: 404 });
  }
  return new NextResponse(doc.texto, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${doc.archivo}"`,
      "Cache-Control": "no-store",
    },
  });
}
