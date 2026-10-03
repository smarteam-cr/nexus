/**
 * GET/PATCH/POST /api/projects/[projectId]/guia-exploracion — la guía de exploración del CSE.
 *
 * GET: la vista (lo confirmado, lo que propone el agente, la escala armada y el estado de la corrida).
 * PATCH: `{ version, operaciones }` sobre lo CONFIRMADO (409 si otra pestaña ya lo cambió).
 * POST: `{ modo: "preparar" | "leer" }` lanza el agente fuera del request (la pantalla sigue por el GET).
 *
 * Editar y lanzar el agente pide lo mismo que el cronograma (dueño del cliente o handoff en cualquier
 * cliente). La lógica vive en lib/guia-exploracion/.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject, guardProjectHandoffAccess } from "@/lib/auth/api-guards";
import { lanzarCorrida } from "@/lib/guia-exploracion/agente";
import type { OperacionDeGuia } from "@/lib/guia-exploracion/contenido";
import { ErrorDeGuia, aplicarCambios, vistaDeLaGuia } from "@/lib/guia-exploracion/servidor";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await vistaDeLaGuia(projectId));
}

const NOMBRES_DE_OPERACION = [
  "usar",
  "descartar",
  "agregarDato",
  "agregarResultado",
  "agregarHallazgo",
  "agregarPersona",
  "agregarSesion",
  "agregarPregunta",
  "editar",
  "quitar",
  "marcarPregunta",
  "confirmarNivel",
] as const;

/* La forma fina de cada operación la valida `aplicarOperaciones` (tolera tipos raros y contesta en
   español). Acá: que sea una lista acotada de objetos con un `op` conocido y sin campos enormes. */
const Operacion = z
  .object({ op: z.enum(NOMBRES_DE_OPERACION) })
  .catchall(z.union([z.string().max(4000), z.number(), z.boolean(), z.null(), z.array(z.unknown()).max(50), z.record(z.string(), z.unknown())]));

const Cambios = z.strictObject({
  version: z.number().int().min(0),
  operaciones: z.array(Operacion).min(1).max(30),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;
  const parsed = Cambios.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  try {
    await aplicarCambios(projectId, parsed.data.version, parsed.data.operaciones as unknown as OperacionDeGuia[]);
    return NextResponse.json(await vistaDeLaGuia(projectId));
  } catch (e) {
    if (e instanceof ErrorDeGuia) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}

const Lanzar = z.strictObject({ modo: z.enum(["preparar", "leer"]) });

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardProjectHandoffAccess(projectId);
  if (guard instanceof NextResponse) return guard;
  const parsed = Lanzar.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Solicitud inválida" }, { status: 400 });
  try {
    await lanzarCorrida(projectId, parsed.data.modo);
    return NextResponse.json(await vistaDeLaGuia(projectId));
  } catch (e) {
    if (e instanceof ErrorDeGuia) return NextResponse.json({ error: e.message }, { status: e.status });
    throw e;
  }
}
