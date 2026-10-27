/**
 * /api/projects/[projectId]/estado-del-documento — borrador y presentado (2026-10-02; la aprobación se quitó el 2026-10-28).
 *
 * Hoy solo el DIAGNÓSTICO tiene estado. Las reglas: lib/canvas/estado-del-documento.ts.
 *
 *   GET  ?canvasId=…                              → el estado, la versión, el historial y lo que
 *                                                   hoy impide presentarlo
 *   POST { canvasId, accion: "presentar" }         → exige contenido (lo que falta revisar es aviso)
 *   POST { canvasId, accion: "reabrir", motivo }
 *
 * Escribir pide lo mismo que generar el diagnóstico (acceso al proyecto + diagnostico.generate).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardContextoDelDocumento } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { canvasOf } from "@/lib/pieces/canvas-query";
import { guardarVersionDelDiagnostico } from "@/lib/exploraciones/versiones-de-la-escala";
import {
  estadoDelDocumento,
  presentarDocumento,
  reabrirDocumento,
} from "@/lib/canvas/estado-del-documento-servidor";

type Params = { params: Promise<{ projectId: string }> };

const SQL = "scripts/sql/2026-10-02-estado-del-documento.sql";
const esquemaAtrasado = () =>
  NextResponse.json({ error: `Falta aplicar la migración del estado del documento (${SQL}).`, esquemaAtrasado: true }, { status: 503 });

/** El canvas tiene que ser el diagnóstico de ESTE proyecto: la única pieza con estado, por ahora. */
async function diagnosticoDelProyecto(projectId: string, canvasId: string): Promise<boolean> {
  const c = await prisma.projectCanvas.findFirst({ where: { id: canvasId, projectId, ...canvasOf("diagnosis") }, select: { id: true } });
  return !!c;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  const canvasId = req.nextUrl.searchParams.get("canvasId") ?? "";
  try {
    if (!canvasId || !(await diagnosticoDelProyecto(projectId, canvasId))) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }
    const estado = await estadoDelDocumento(canvasId);
    if (!estado) return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    return NextResponse.json(estado);
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}

const PedidoSchema = z.discriminatedUnion("accion", [
  z.object({ canvasId: z.string().min(1).max(64), accion: z.literal("presentar") }),
  z.object({ canvasId: z.string().min(1).max(64), accion: z.literal("reabrir"), motivo: z.string().max(1000) }),
]);

export async function POST(req: NextRequest, { params }: Params) {
  const { projectId } = await params;
  const guard = await guardContextoDelDocumento(projectId, "diagnostico");
  if (guard instanceof NextResponse) return guard;
  const parsed = PedidoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const p = parsed.data;
  const por = guard.teamMember.email ?? null;

  try {
    if (!(await diagnosticoDelProyecto(projectId, p.canvasId))) {
      return NextResponse.json({ error: "Documento no encontrado." }, { status: 404 });
    }
    const r = p.accion === "presentar" ? await presentarDocumento(p.canvasId, por) : await reabrirDocumento(p.canvasId, p.motivo, por);
    if (!r.ok) return NextResponse.json({ error: r.error, motivos: r.motivos ?? [] }, { status: r.status });
    /* Ficha B (2026-10-17): presentar el diagnóstico deja la foto de la escala de la exploración del proyecto, con el
       ciclo abierto si es un servicio recurrente (lib/exploraciones/versiones-de-la-escala.ts). Nunca frena la respuesta. */
    if (p.accion === "presentar") {
      void guardarVersionDelDiagnostico(projectId, por).catch((e) => console.error("[estado-del-documento] la escala no guardó su versión", e));
    }
    return NextResponse.json(r.estado);
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}
