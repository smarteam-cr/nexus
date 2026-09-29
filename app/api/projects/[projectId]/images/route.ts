/**
 * POST /api/projects/[projectId]/images — imagen del canvas Kickoff (portada del hero) → { url }.
 *
 * Espejo de `app/api/business-cases/[id]/images/route.ts`, con el guard del proyecto.
 * Bucket PÚBLICO `public-assets` (la landing externa renderiza <img> sin auth desde el
 * snapshot congelado — una signed URL de 1h se vencería). Path con UUID criptográfico
 * (`kickoff-images/{projectId}/{uuid}.{ext}`): inadivinable, sin upsert de path fijo.
 *
 * SIN SVG a propósito: el bucket es público y un SVG puede llevar <script>. Desde que la imagen
 * sube directo a Supabase (2026-09-28, ver lib/storage/subida-directa.ts), el filtro real es el
 * `confirmar`: lo que no sea PNG/JPG/WebP se BORRA ahí y no se devuelve URL.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { confirmarImagen, prepararImagen } from "@/lib/storage/subida-de-imagen";

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  }
  const carpeta = `kickoff-images/${projectId}`;
  if (body.accion === "preparar") {
    const permiso = await prepararImagen(carpeta, body);
    if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ signedUrl: permiso.signedUrl, path: permiso.path });
  }
  if (body.accion !== "confirmar") return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  const r = await confirmarImagen(carpeta, body.path);
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ url: r.url });
}
