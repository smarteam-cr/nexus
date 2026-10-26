/**
 * POST /api/sales/exploraciones/[id]/sesiones
 *   body: { tipo: "agendada" | "pasada" | "sinReunion", evento?, sessionId?, origen?, titulo?, fecha?, sesionId?, paraSesionId? }
 *
 * «+ Agregar sesión» de la exploración (etapa A, 2026-10-09: la exploración son sus sesiones):
 *   · agendada: una reunión que todavía no ocurre. Del calendario de Google (`evento: { id, calendario,
 *     serie? }`, de tu calendario o del de quien lleva la exploración): se relee en Google (no se confía en
 *     lo que manda la pantalla) y la sesión se une a su evento. De la agenda de HubSpot (`origen: "hubspot"`,
 *     `sessionId` = el id de la reunión en HubSpot): la sesión se une a esa reunión.
 *   · pasada: una reunión que ya ocurrió (`sessionId`, de Meet por defecto). Una de la empresa entra; una
 *     sin dueño se ADOPTA (pasa a ser de la empresa en todo Nexus); una de otro cliente se rechaza. Entra
 *     también sin transcripción: con solo notas se lee, y sin nada la sesión espera la minuta. También una de
 *     HubSpot que ya pasó (`origen: "hubspot"`) y algo sumado a mano de esta exploración (`origen: "documento"`).
 *     Lo que puede fallar sin depender de la reunión (el tope de sesiones, la sesión a unir) se mira ANTES de
 *     adoptar: adoptar le cambia el dueño en todo Nexus y no se deshace sola.
 *   · sinReunion: una sesión sin reunión todavía (`titulo`, `fecha`).
 * Con `paraSesionId`, en vez de agregar una sesión nueva se une esa (cambia su reunión). Agregar no
 * reemplaza la lista: si otra persona (o el agente) cambió la exploración entretanto, se aplica sobre lo
 * último. Pide poder cambiar la exploración (lib/exploraciones/guardia.ts).
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { eventoParaUnir, olvidarAgendadas } from "@/lib/exploraciones/calendario";
import type { EstadoDeExploracion, Operacion } from "@/lib/exploraciones/contenido";
import { ID_DE_REUNION } from "@/lib/exploraciones/esquemas";
import { aFecha, hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { MAX_SESIONES, nuevoIdDeSesion, type SesionPlaneada } from "@/lib/exploraciones/guia";
import { listarDocumentos } from "@/lib/exploraciones/documentos";
import { leerLoLeido } from "@/lib/exploraciones/lo-leido";
import { aplicarCambios, escalaParaExplorar, estadoDesdeFila, leerExploracion, paraLaPantalla, type FilaDeExploracion } from "@/lib/exploraciones/servidor";
import { prisma } from "@/lib/db/prisma";
import { prepararReunionParaElCliente } from "@/lib/sessions/agregar-sesion";

type Ctx = { params: Promise<{ id: string }> };

const ID_DE_SESION = z.string().regex(/^s-[a-z0-9]{1,24}$/);

const Cuerpo = z.object({
  tipo: z.enum(["agendada", "pasada", "sinReunion"]),
  evento: z
    .object({
      id: z.string().regex(/^[A-Za-z0-9_]{1,200}$/),
      calendario: z.string().email().max(200),
      serie: z.boolean().optional(),
    })
    .optional(),
  sessionId: ID_DE_REUNION.optional(),
  origen: z.enum(["meet", "hubspot", "documento"]).optional(),
  titulo: z.string().trim().max(120).optional(),
  fecha: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  sesionId: ID_DE_SESION.optional(),
  paraSesionId: ID_DE_SESION.optional(),
});

type CuerpoDeAgregar = z.infer<typeof Cuerpo>;

/** Lo que une la sesión a su reunión (o nada, si es una sesión sin reunión). */
type Union = Pick<SesionPlaneada, "reunion" | "evento" | "fecha" | "titulo">;

const error = (status: number, mensaje: string) => NextResponse.json({ error: mensaje }, { status });

/** Qué une la sesión, según lo que se eligió. Las escrituras de pertenencia (adoptar) pasan acá, en el servidor. */
async function unionPedida(c: CuerpoDeAgregar, fila: FilaDeExploracion, email: string | null): Promise<{ ok: true; union: Union } | { ok: false; status: number; error: string }> {
  const diaDe = (iso: string) => hoyEnCostaRica(aFecha(iso));
  if (c.tipo === "sinReunion") {
    return { ok: true, union: { ...(c.titulo ? { titulo: c.titulo } : {}), ...(c.fecha ? { fecha: c.fecha } : {}) } };
  }
  if (c.tipo === "agendada") {
    if (c.origen === "hubspot") {
      if (!c.sessionId || fila.projectId) return { ok: false, status: 400, error: "Falta la reunión de HubSpot." };
      const a = leerLoLeido(fila.test).agenda.find((x) => x.id === c.sessionId);
      if (!a) return { ok: false, status: 404, error: "Esa reunión ya no está en la agenda de HubSpot." };
      return { ok: true, union: { reunion: { origen: "hubspot", id: a.id, inicio: a.inicio }, fecha: diaDe(a.inicio), ...(a.titulo ? { titulo: a.titulo.slice(0, 120) } : {}) } };
    }
    if (!c.evento) return { ok: false, status: 400, error: "Falta la reunión del calendario." };
    const permitidos = new Set([email, fila.responsableEmail].filter((x): x is string => !!x).map((x) => x.toLowerCase()));
    const calendario = c.evento.calendario.toLowerCase();
    if (!permitidos.has(calendario)) return { ok: false, status: 403, error: "Solo se puede unir una reunión de tu calendario o del de quien lleva la exploración." };
    const e = await eventoParaUnir(calendario, c.evento.id, { serie: c.evento.serie, clientId: fila.clientId });
    if (!e.ok) return e;
    return { ok: true, union: { evento: e.evento, fecha: diaDe(e.evento.inicio) } };
  }
  // Una que ya pasó.
  if (!c.sessionId) return { ok: false, status: 400, error: "Falta la reunión." };
  if (c.origen === "hubspot") {
    if (fila.projectId) return { ok: false, status: 400, error: "La exploración de un proyecto no lee HubSpot." };
    const deLaAgenda = leerLoLeido(fila.test).agenda.find((x) => x.id === c.sessionId);
    const leida = estadoDesdeFila(fila).propuesta.lecturas[`hubspot:${c.sessionId}`];
    const inicio = deLaAgenda?.inicio ?? leida?.fecha;
    if (!inicio) return { ok: false, status: 404, error: "Esa reunión de HubSpot no es de esta empresa." };
    return { ok: true, union: { reunion: { origen: "hubspot", id: c.sessionId, inicio }, fecha: diaDe(inicio) } };
  }
  if (c.origen === "documento") {
    const d = (await listarDocumentos(fila.id)).find((x) => x.id === c.sessionId);
    if (!d) return { ok: false, status: 404, error: "Eso que se sumó a mano no es de esta exploración." };
    return { ok: true, union: { reunion: { origen: "documento", id: d.id }, fecha: diaDe(d.fecha ?? d.creadoEn) } };
  }
  const prep = await prepararReunionParaElCliente({ sessionId: c.sessionId, clientId: fila.clientId, actorEmail: email, exigir: "nada" });
  if (!prep.ok) return prep;
  const s = await prisma.firefliesSession.findUnique({ where: { id: c.sessionId }, select: { date: true } });
  if (!s) return { ok: false, status: 404, error: "Esa reunión no existe." };
  return { ok: true, union: { reunion: { origen: "meet", id: c.sessionId }, fecha: diaDe(s.date.toISOString()) } };
}

/** Las operaciones, armadas sobre lo último de la exploración (así se pueden volver a armar después de un 409). */
function operaciones(estado: EstadoDeExploracion, c: CuerpoDeAgregar, union: Union, sesionId: string): { ok: true; ops: Operacion[] } | { ok: false; error: string } {
  const claves = [union.reunion ? `${union.reunion.origen}:${union.reunion.id}` : null, union.evento ? `meet:gmeet_${union.evento.id}` : null].filter(
    (k): k is string => !!k,
  );
  // Lo que se une deja de estar «Fuera de la exploración».
  const sacarDeFuera: Operacion[] = claves.some((k) => estado.contenido.fuera.includes(k)) ? [{ op: "fuera", claves, fuera: false }] : [];
  if (!c.paraSesionId) return { ok: true, ops: [{ op: "agregarSesion", sesion: { id: sesionId, ...union } }, ...sacarDeFuera] };
  const actual = estado.contenido.sesiones.find((s) => s.id === c.paraSesionId);
  if (!actual) return { ok: false, error: "Esa sesión ya no está." };
  // `asociadaSola` (K5): una persona la vuelve a unir, así que ya no es «la unió Nexus».
  const { reunion: _r, evento: _e, asociadaSola: _a, ...resto } = actual;
  void _r;
  void _e;
  void _a;
  const unida: SesionPlaneada = {
    ...resto,
    ...(union.reunion ? { reunion: union.reunion } : {}),
    ...(union.evento ? { evento: union.evento } : {}),
    ...(union.fecha ? { fecha: union.fecha } : {}),
    ...(union.titulo && !resto.titulo ? { titulo: union.titulo } : {}),
  };
  return { ok: true, ops: [{ op: "sesiones", sesiones: estado.contenido.sesiones.map((s) => (s.id === unida.id ? unida : s)) }, ...sacarDeFuera] };
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return error(400, "JSON inválido");
  }
  const cuerpo = Cuerpo.safeParse(raw);
  if (!cuerpo.success) return cuerpoInvalido(cuerpo.error);
  const c = cuerpo.data;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return error(404, "Esa exploración no existe.");
  if (lectura.fila.archivadaEn) return error(409, "La exploración está archivada: ya no se puede cambiar.");
  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") return error(503, "La escala no está publicada en Nexus.");

  /* Antes de unir (y, en una de Meet sin dueño, de adoptarla): lo que haría fallar el agregado. Si fallara
     después, la reunión quedaría adoptada por la empresa sin ser una sesión. */
  const antes = estadoDesdeFila(lectura.fila);
  if (c.paraSesionId && !antes.contenido.sesiones.some((s) => s.id === c.paraSesionId)) return error(404, "Esa sesión ya no está.");
  if (!c.paraSesionId && antes.contenido.sesiones.length >= MAX_SESIONES) return error(400, `Ya hay ${MAX_SESIONES} sesiones: quita una antes de agregar otra.`);

  const u = await unionPedida(c, lectura.fila, guard.email);
  if (!u.ok) return error(u.status, u.error);
  const sesionId = c.paraSesionId ?? c.sesionId ?? nuevoIdDeSesion();

  let fila = lectura.fila;
  for (let intento = 0; intento < 2; intento++) {
    const o = operaciones(estadoDesdeFila(fila), c, u.union, sesionId);
    if (!o.ok) return error(404, o.error);
    const r = await aplicarCambios(id, fila.version, o.ops, escala.general, { eventosDeConfianza: true });
    switch (r.estado) {
      case "ok":
        olvidarAgendadas(id);
        return NextResponse.json({ ok: true, sesionId, exploracion: paraLaPantalla(r.fila) });
      case "no-existe":
        return error(404, "Esa exploración no existe.");
      case "invalido":
        return error(400, r.error);
      case "conflicto":
        fila = r.fila;
        continue;
    }
  }
  return error(409, "La exploración cambió mientras tanto: vuelve a intentarlo.");
}
