/**
 * /api/projects/[projectId]/presentaciones/[documento] — cuándo se le presenta este documento al cliente (2026-10-14).
 * `documento` = kickoff · diagnostico · planificacion · entrega. Las reglas: lib/presentaciones/reglas.ts.
 *
 *   GET                                        → el estado, a quién se le pregunta y si tú respondes
 *   POST { accion: "fecha", fecha }            → la fecha planeada (AAAA-MM-DD, hoy o después)
 *   POST { accion: "sin-fecha" }               → «Todavía no sé» (se vuelve a preguntar en una semana)
 *   POST { accion: "presentado", fecha }       → «Ya lo presenté» (hoy o antes); pregunta cuánto tomó, si está activa
 *   POST { accion: "listo", fecha }            → solo el diagnóstico: terminado; avisa al vendedor de la empresa
 *   POST { accion: "usar-propuesta" }          → solo el diagnóstico: la fecha que leyó Nexus en una reunión
 *   POST { accion: "descartar-propuesta" }     → no se vuelve a proponer
 *   POST { accion: "ahora-no" }                → la tarjeta no vuelve a salir sola por unas horas
 *
 * Ver pide acceso al proyecto. Responder, además, ser de Customer Success: el encargado del proyecto, quien generó el
 * documento o la CSL (403 si no). Cada respuesta es una fila nueva: queda quién respondió y cuándo.
 */
import { NextResponse } from "next/server";
import { z } from "zod";
import { guardAccessToProject } from "@/lib/auth/api-guards";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { esFecha } from "@/lib/canvas/presentacion-del-diagnostico";
import { esDocumento } from "@/lib/presentaciones/reglas";
import {
  ErrorDePresentacion,
  presentacionesDisponible,
  responderPresentacion,
  SQL_DE_PRESENTACIONES,
  vistaDeLaPresentacion,
} from "@/lib/presentaciones/servidor";

type Params = { params: Promise<{ projectId: string; documento: string }> };

const esquemaAtrasado = () =>
  NextResponse.json(
    { error: `La fecha de presentación todavía no está disponible: falta aplicar ${SQL_DE_PRESENTACIONES}.`, esquemaAtrasado: true },
    { status: 503 },
  );

export async function GET(_req: Request, { params }: Params) {
  const { projectId, documento } = await params;
  if (!esDocumento(documento)) return NextResponse.json({ error: "Ese documento no se presenta." }, { status: 404 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  if (!presentacionesDisponible()) return esquemaAtrasado();
  const tm = guard.user.teamMember;
  try {
    const vista = await vistaDeLaPresentacion(projectId, documento, { email: tm?.email ?? guard.user.email, rol: tm?.roleEnum ?? null });
    if (!vista) return NextResponse.json({ error: "Este proyecto no tiene ese documento." }, { status: 404 });
    return NextResponse.json({ vista });
  } catch (e) {
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}

const Fecha = z.string().refine(esFecha, "Fecha inválida.");
const PedidoSchema = z.discriminatedUnion("accion", [
  z.object({ accion: z.literal("fecha"), fecha: Fecha }),
  z.object({ accion: z.literal("presentado"), fecha: Fecha }),
  z.object({ accion: z.literal("listo"), fecha: Fecha }),
  z.object({ accion: z.literal("sin-fecha") }),
  z.object({ accion: z.literal("usar-propuesta") }),
  z.object({ accion: z.literal("descartar-propuesta") }),
  z.object({ accion: z.literal("ahora-no") }),
]);

export async function POST(req: Request, { params }: Params) {
  const { projectId, documento } = await params;
  if (!esDocumento(documento)) return NextResponse.json({ error: "Ese documento no se presenta." }, { status: 404 });
  const guard = await guardAccessToProject(projectId);
  if (guard instanceof NextResponse) return guard;
  if (!presentacionesDisponible()) return esquemaAtrasado();
  const parsed = PedidoSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  const tm = guard.user.teamMember;
  try {
    const r = await responderPresentacion(projectId, documento, parsed.data, { email: tm?.email ?? guard.user.email, rol: tm?.roleEnum ?? null });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof ErrorDePresentacion) return NextResponse.json({ error: e.message }, { status: e.status });
    if (esquemaDesactualizado(e)) return esquemaAtrasado();
    throw e;
  }
}
