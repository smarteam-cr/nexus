/**
 * GET/PATCH/POST /api/projects/[projectId]/guia-exploracion — la GUÍA VIEJA de la exploración del CSE.
 *
 * Desde el 2026-10-07 la exploración de un proyecto es la de la preventa (lib/exploraciones con `marco = "cs"`), y la
 * pantalla de la guía vieja (components/guia-exploracion) ya no existe. Memoria de la cuenta, etapa 0 (2026-10-10):
 *
 * GET: la vista de solo lectura, mientras el respaldo exista. `scripts/migrar-guia-de-exploracion.ts` lee
 * lib/guia-exploracion, no esta ruta; la ruta y el módulo se retiran juntos después de correrlo con `--apply`.
 * PATCH y POST: RETIRADOS, responden 410. El POST lanzaba el agente de la guía vieja y cobraba sin pantalla que lo
 * pidiera; el PATCH escribía una guía que nadie iba a volver a ver.
 */
import { NextRequest, NextResponse } from "next/server";
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { vistaDeLaGuia } from "@/lib/guia-exploracion/servidor";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await vistaDeLaGuia(projectId));
}

const RETIRADA = "La guía vieja de la exploración se retiró: ahora la exploración del proyecto son sus sesiones. Recarga la página.";

export async function PATCH(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ error: RETIRADA }, { status: 410 });
}

export async function POST(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json({ error: RETIRADA }, { status: 410 });
}
