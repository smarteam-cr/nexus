import "server-only";

/**
 * lib/clients/ficha-propuesta.ts — la IA PROPONE cambios a la ficha del cliente; el CSE confirma.
 *
 * Tres puertas, un solo agente:
 *   1. Al generarse un HANDOFF (analyze/route.ts): la venta ya trae dolor, stakeholders, motivación,
 *      expectativas y resultados → la ficha arranca casi llena.
 *   2. Con cada SESIÓN procesada (sessions/post-process.ts), igual que el avance del cronograma: lee
 *      la reunión y propone solo lo NUEVO.
 *   3. El botón «Actualizar con IA» de la ficha: handoffs + encuestas + últimas sesiones, para los
 *      clientes que ya existían antes de esto.
 *
 * Todo cae en `ficha.propuesta` y ACUMULA (fusionarPropuesta). Nada toca lo confirmado ni HubSpot:
 * eso solo pasa cuando el CSE aprieta «Confirmar» (app/api/clients/[id]/ficha).
 *
 * Nunca lanza desde las puertas automáticas: devuelve el estado. Una ficha que no se actualiza no
 * puede tumbar ni el handoff ni el post-proceso de una sesión.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { prisma } from "@/lib/db/prisma";
import { loadHandoffContext } from "@/lib/canvas/load-canvas-context";
import { loadCuestionarioContext } from "@/lib/cuestionario/contexto";
import { getClientSessions } from "@/lib/sessions/project-sources";
import { fetchTranscriptContent } from "@/lib/sessions/transcript";
import { proyectoClasificableWhere } from "@/lib/projects/scope";
import { fusionarPropuesta, leerFicha } from "./ficha";
import { MODELO_FICHA_AMPLIO, MODELO_FICHA_SESION, leerRespuesta, pedidoDeFicha, type Fuente } from "./ficha-pedido";

export { MODELO_FICHA_AMPLIO, MODELO_FICHA_SESION, type Fuente };

/** Las secciones del handoff que alimentan la ficha. La ficha es interna: la motivación entra. */
const HANDOFF_KEYS = [
  "resultados_cliente",
  "dolor_principal",
  "expectativas",
  "stakeholders_handoff",
  "motivacion_decision",
  "alcance_contratado",
] as const;

const MAX_TRANSCRIPT_SESION = 30_000;
const MAX_POR_SESION_EN_LOTE = 4_000;
const SESIONES_EN_LOTE = 8;

export type ResultadoDePropuesta =
  | { status: "ok"; cambiados: number }
  | { status: "sin_fuentes" }
  | { status: "error"; error: string };

function fechaCorta(d: Date): string {
  return d.toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "America/Costa_Rica" });
}

/**
 * El núcleo: una llamada a Claude con la ficha vigente + las fuentes, y la fusión en la propuesta.
 * Relee la ficha justo antes de escribir: mientras corría la IA, el CSE pudo haber confirmado.
 */
export async function proponerCambiosALaFicha(opts: {
  clientId: string;
  fuentes: readonly Fuente[];
  origen: string;
  modelo: string;
  triggeredByEmail?: string | null;
  projectId?: string | null;
}): Promise<ResultadoDePropuesta> {
  const fuentes = opts.fuentes.filter((f) => f.texto.trim());
  if (!fuentes.length) return { status: "sin_fuentes" };

  const client = await prisma.client.findUnique({
    where: { id: opts.clientId },
    select: { name: true, industry: true, ficha: true },
  });
  if (!client) return { status: "error", error: "Cliente no encontrado" };

  // Todo el equipo, también los dados de baja: una consultora que ya no está sigue apareciendo en
  // las reuniones viejas, y es justo la que el modelo confunde con gente del cliente.
  const equipo = (await prisma.teamMember.findMany({ select: { name: true } })).map((t) => t.name);
  const pedido = pedidoDeFicha({
    cliente: client,
    ficha: leerFicha(client.ficha),
    fuentes,
    modelo: opts.modelo,
    equipoSmarteam: equipo,
  });

  let respuesta: Anthropic.Messages.Message;
  try {
    respuesta = await conContextoDeIA(
      {
        agentSlug: "ficha-del-cliente",
        clientId: opts.clientId,
        projectId: opts.projectId ?? null,
        triggeredByEmail: opts.triggeredByEmail ?? null,
        origen: `clients/ficha-propuesta:${opts.origen}`,
      },
      () => getAnthropic().messages.create(pedido),
    );
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }

  const nuevos = leerRespuesta(respuesta, fuentes, equipo);
  if (!nuevos.length) return { status: "ok", cambiados: 0 };

  // Releer y escribir juntos: lo que el CSE confirmó mientras corría la IA es la nueva base.
  const cambiados = await prisma.$transaction(async (tx) => {
    const fila = await tx.client.findUnique({ where: { id: opts.clientId }, select: { ficha: true } });
    const r = fusionarPropuesta(leerFicha(fila?.ficha), nuevos, opts.origen);
    if (r.cambiados.length) {
      await tx.client.update({ where: { id: opts.clientId }, data: { ficha: r.ficha as object } });
    }
    return r.cambiados.length;
  });
  return { status: "ok", cambiados };
}

// ── Puerta 1: el handoff ─────────────────────────────────────────────────────────────────────

export async function proponerFichaDesdeHandoff(projectId: string): Promise<ResultadoDePropuesta> {
  try {
    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true, clientId: true } });
    if (!project?.clientId) return { status: "error", error: "Proyecto sin cliente" };
    const texto = await loadHandoffContext(projectId, { onlyConfirmed: false, includeKeys: HANDOFF_KEYS });
    return await proponerCambiosALaFicha({
      clientId: project.clientId,
      projectId,
      fuentes: [{ id: "H1", etiqueta: `Handoff de «${project.name}»`, texto }],
      origen: "Handoff",
      modelo: MODELO_FICHA_AMPLIO,
    });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Puerta 2: cada sesión ────────────────────────────────────────────────────────────────────

export async function proponerFichaDesdeSesion(
  sessionId: string,
  clientId: string,
  projectId?: string | null,
): Promise<ResultadoDePropuesta> {
  try {
    const s = await prisma.firefliesSession.findUnique({ where: { id: sessionId }, select: { title: true, date: true } });
    if (!s) return { status: "error", error: "Sesión no encontrada" };
    const texto = (await fetchTranscriptContent(sessionId, s.title ?? "", { maxChars: MAX_TRANSCRIPT_SESION })) ?? "";
    return await proponerCambiosALaFicha({
      clientId,
      projectId,
      fuentes: [{ id: "S1", etiqueta: `Sesión «${s.title ?? "sin título"}» del ${fechaCorta(s.date)}`, texto }],
      origen: "Sesiones",
      modelo: MODELO_FICHA_SESION,
    });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Puerta 3: «Actualizar con IA» ────────────────────────────────────────────────────────────

/** Handoffs y encuestas de los proyectos del cliente + sus últimas sesiones ya ocurridas. */
export async function fuentesDelCliente(clientId: string): Promise<Fuente[]> {
  const proyectos = await prisma.project.findMany({
    where: proyectoClasificableWhere({ clientId }),
    orderBy: { createdAt: "desc" },
    take: 4,
    select: { id: true, name: true },
  });
  const fuentes: Fuente[] = [];
  let h = 0;
  let e = 0;
  for (const p of proyectos) {
    const [handoff, encuesta] = await Promise.all([
      loadHandoffContext(p.id, { onlyConfirmed: false, includeKeys: HANDOFF_KEYS }).catch(() => ""),
      loadCuestionarioContext(p.id).catch(() => ""),
    ]);
    if (handoff.trim()) fuentes.push({ id: `H${++h}`, etiqueta: `Handoff de «${p.name}»`, texto: handoff });
    if (encuesta.trim()) fuentes.push({ id: `E${++e}`, etiqueta: `Encuesta de «${p.name}»`, texto: encuesta.slice(0, 15_000) });
  }
  // getClientSessions ya corta en «hoy»: la agenda futura vive en la misma tabla y no aporta nada.
  const sesiones = await getClientSessions(clientId, { take: SESIONES_EN_LOTE });
  let n = 0;
  for (const s of sesiones) {
    const texto = await fetchTranscriptContent(s.id, s.title, { maxChars: MAX_POR_SESION_EN_LOTE }).catch(() => null);
    if (texto?.trim()) {
      fuentes.push({ id: `S${++n}`, etiqueta: `Sesión «${s.title}» del ${fechaCorta(new Date(s.date))}`, texto });
    }
  }
  return fuentes;
}

export async function actualizarFichaConIA(clientId: string, triggeredByEmail: string): Promise<ResultadoDePropuesta> {
  try {
    const fuentes = await fuentesDelCliente(clientId);
    return await proponerCambiosALaFicha({
      clientId,
      fuentes,
      origen: "Actualizar con IA",
      modelo: MODELO_FICHA_AMPLIO,
      triggeredByEmail,
    });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
