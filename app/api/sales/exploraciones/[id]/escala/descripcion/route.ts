/**
 * /api/sales/exploraciones/[id]/escala/descripcion — la descripción de cada equipo bajo «Resultado general» de la escala
 * que ve el cliente (lib/exploraciones/descripcion-de-la-escala.ts, 2026-11-08). En la cuenta y en la preventa; la
 * exploración de un proyecto no se comparte (409).
 *
 *   GET                                → { areas: [{ areaId, nombre, conAlgo, descripcion: { texto, origen, guardada, vigente } }] }
 *                                        lo que sale HOY en la página del cliente, área por área, y de dónde salió.
 *   POST { areaId?: string }           → regenera con el agente (todas las áreas de la página, o una). Responde cuando
 *                                        termina (unos 10-20 s) con lo mismo que GET + `descartadas` (lo que escribió y no
 *                                        pasó las reglas: sigue la de antes). Pisa lo escrito a mano: es a pedido.
 *   PUT  { areaId, texto: string|null } → la escribe a mano. null o vacío: borra la guardada y sale la de respaldo.
 * Leer pide leer la exploración; regenerar y editar, poder cambiarla (lib/exploraciones/guardia.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { TOPE_DE_LA_DESCRIPCION_A_MANO } from "@/lib/exploraciones/descripcion-de-la-escala";
import { descripcionesDeLaEscala, generarDescripcionesDeLaEscala, type ResultadoDeLaDescripcion } from "@/lib/exploraciones/descripcion-de-la-escala-server";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { aplicarCambios, escalaParaExplorar, leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

const ID_AREA = z.string().regex(/^\d+$/).max(4);
const Regenerar = z.object({ areaId: ID_AREA.nullish() });
const Escribir = z.object({ areaId: ID_AREA, texto: z.string().max(TOPE_DE_LA_DESCRIPCION_A_MANO).nullable() });

function responder(r: ResultadoDeLaDescripcion) {
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status });
  return NextResponse.json({ areas: r.areas, descartadas: r.descartadas, segundos: r.segundos });
}

async function cuerpo(req: NextRequest): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  return responder(await descripcionesDeLaEscala(id));
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  const b = Regenerar.safeParse(await cuerpo(req));
  if (!b.success) return cuerpoInvalido(b.error);
  return responder(await generarDescripcionesDeLaEscala({ exploracionId: id, email: guard.email, areaId: b.data.areaId ?? null }));
}

export async function PUT(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;
  const b = Escribir.safeParse(await cuerpo(req));
  if (!b.success) return cuerpoInvalido(b.error);

  // Primero se comprueba que la exploración se pueda compartir y que el área salga en la página.
  const hoy = await descripcionesDeLaEscala(id);
  if (!hoy.ok) return responder(hoy);
  if (!hoy.areas.some((a) => a.areaId === b.data.areaId)) return NextResponse.json({ error: "Ese equipo no sale en la página del cliente." }, { status: 409 });

  const [lectura, vig] = await Promise.all([leerExploracion(id), escalaParaExplorar()]);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa exploración no existe." }, { status: 404 });
  if (vig.estado !== "ok") return NextResponse.json({ error: "La escala no está publicada en Nexus." }, { status: 503 });
  // No sube la versión (un texto por área: gana el último), así que la versión que se pasa no puede chocar.
  const r = await aplicarCambios(id, lectura.fila.version, [{ op: "descripcionDeLaEscala", areaId: b.data.areaId, texto: b.data.texto }], vig.general, { quienPide: guard.email });
  if (r.estado === "no-existe") return NextResponse.json({ error: "Esa exploración no existe." }, { status: 404 });
  if (r.estado === "invalido") return NextResponse.json({ error: r.error }, { status: 409 });
  if (r.estado === "conflicto") return NextResponse.json({ error: "La exploración cambió mientras guardabas: vuelve a intentarlo." }, { status: 409 });
  return responder(await descripcionesDeLaEscala(id));
}
