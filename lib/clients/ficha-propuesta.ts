import "server-only";

/**
 * lib/clients/ficha-propuesta.ts — la IA PROPONE cambios a la ficha del cliente; el CSE confirma.
 *
 * Tres puertas, un solo agente:
 *   1. Al generarse un HANDOFF (analyze/route.ts): la venta ya trae dolor, stakeholders, motivación,
 *      expectativas y resultados → la ficha arranca casi llena.
 *   2. Con cada SESIÓN procesada (sessions/post-process.ts), igual que el avance del cronograma: lee
 *      la reunión y propone solo lo NUEVO. Con la lectura de hechos prendida (`SEGUIMIENTO_HECHOS`,
 *      memoria de la cuenta, etapa 6) ya no relee la reunión: propone desde sus hechos
 *      (`proponerFichaDesdeHechos`). `proponerFichaDesdeSesion` queda para el camino sin hechos.
 *   3. El botón «Actualizar con IA» de la ficha: handoffs + encuestas + últimas sesiones, para los
 *      clientes que ya existían antes de esto.
 *   4. Lo que el CSE anota como «lo que averiguaste» en las sesiones de exploración
 *      (lib/guia-exploracion/a-la-ficha.ts): la exploración ya no guarda lo que se sabe del
 *      cliente, lo manda acá (2026-10-05).
 *   6. Lo de la PREVENTA, sin IA (2026-10-10, lib/exploraciones/a-la-ficha.ts): lo que propone al preparar y lo que se
 *      confirma en el lienzo, con origen «Preventa» (la puerta 5 es lo que cambia en HubSpot, ficha-desde-hubspot).
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
import { getSessionCategories } from "@/lib/cache/session-categories";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { DOMINIO_PROPIO } from "@/lib/sessions/dominio-propio";
import { esReunionDePuertasAdentro, type SesionParaOfrecer } from "@/lib/sessions/candidatas-internas";
import { camposDeLaReunion, etiquetaDeSesion, fusionarPropuesta, leerFicha, quitarDeLaPropuesta, type ClaveDeFicha, type FichaGuardada } from "./ficha";
import { MODELO_FICHA_AMPLIO, MODELO_FICHA_SESION, leerRespuesta, pedidoDeFicha, type Fuente } from "./ficha-pedido";

export { MODELO_FICHA_AMPLIO, MODELO_FICHA_SESION, type Fuente };
/** La etiqueta de una reunión como fuente de la ficha: la tarjeta «Lo que dejó esta reunión» la busca (lib/clients/ficha.ts). */
export { etiquetaDeSesion };

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

/**
 * ¿Esta reunión fue PUERTAS ADENTRO (solo el equipo)? La ficha describe al cliente con lo que dijeron sus fuentes, y lo
 * propuesto lo lee también el handoff (lib/memoria, alcance `sin-lo-interno`), que escribe lo que ven el kickoff y el
 * cuestionario: lo que el equipo habló entre sí no puede entrar como si lo hubiera dicho el cliente (2026-10-10). Una
 * reunión sin participantes registrados no se sabe con quién fue: no cuenta como puertas adentro (como antes).
 */
async function reunionDePuertasAdentro(): Promise<(s: SesionParaOfrecer) => boolean> {
  let propios: Set<string>;
  try {
    propios = new Set([DOMINIO_PROPIO, ...buildInternalDomainsSet(await getSessionCategories())]);
  } catch {
    propios = new Set([DOMINIO_PROPIO]);
  }
  return (s) => esReunionDePuertasAdentro(s, propios);
}

export type ResultadoDePropuesta =
  /** `campos`: los campos de la ficha que quedaron con una propuesta nueva (vacío = nada nuevo). */
  | { status: "ok"; cambiados: number; campos: ClaveDeFicha[] }
  | { status: "sin_fuentes" }
  | { status: "error"; error: string };

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
  if (!nuevos.length) return { status: "ok", cambiados: 0, campos: [] };

  // Releer y escribir juntos: lo que el CSE confirmó mientras corría la IA es la nueva base.
  const campos = await prisma.$transaction(async (tx) => {
    const fila = await tx.client.findUnique({ where: { id: opts.clientId }, select: { ficha: true } });
    const r = fusionarPropuesta(leerFicha(fila?.ficha), nuevos, opts.origen);
    if (r.cambiados.length) {
      await tx.client.update({ where: { id: opts.clientId }, data: { ficha: r.ficha as object } });
    }
    return r.cambiados;
  });
  return { status: "ok", cambiados: campos.length, campos };
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
    const s = await prisma.firefliesSession.findUnique({
      where: { id: sessionId },
      select: { title: true, date: true, participants: true, organizerEmail: true },
    });
    if (!s) return { status: "error", error: "Sesión no encontrada" };
    if ((await reunionDePuertasAdentro())(s)) return { status: "sin_fuentes" };
    const texto = (await fetchTranscriptContent(sessionId, s.title ?? "", { maxChars: MAX_TRANSCRIPT_SESION })) ?? "";
    return await proponerCambiosALaFicha({
      clientId,
      projectId,
      fuentes: [{ id: "S1", etiqueta: etiquetaDeSesion(s), texto }],
      origen: "Sesiones",
      modelo: MODELO_FICHA_SESION,
    });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Puerta 2 bis: los HECHOS de cada sesión (memoria de la cuenta, etapa 6) ───────────────────

/** Cómo se presenta cada tipo de hecho a la IA de la ficha: el campo al que suele ir. */
const CAMPO_SUGERIDO: Readonly<Record<string, string>> = {
  cuenta: "De la cuenta",
  persona: "Persona del cliente",
};

/** Un hecho que va a la ficha: su tipo, la frase y la cita literal ya verificada contra la reunión. */
export interface HechoParaLaFicha {
  tipo: string;
  frase: string;
  cita: string;
}

/**
 * La ficha desde los HECHOS de una reunión (DECISIONS «Hechos, enrutador y novedades»): la misma llamada a Haiku que
 * `proponerFichaDesdeSesion`, pero sobre unas viñetas cortas (la frase y su cita) en vez de releer 30.000 caracteres de
 * la reunión. Se descartó escribir directo con `fusionarPropuesta`: el modelo de la ficha integra el valor COMPLETO del
 * campo y evita viñetas repetidas. La etiqueta es la de la sesión (`etiquetaDeSesion`): la tarjeta «Lo que dejó esta
 * reunión» la encuentra igual. Lo llama SOLO el escritor de los hechos (lib/seguimiento/hechos-server.ts), con los que
 * el enrutador mandó a la ficha (ya sin una reunión de puertas adentro ni la gente de Smarteam). Nunca lanza.
 */
export async function proponerFichaDesdeHechos(o: {
  clientId: string;
  reunion: { title: string | null; date: Date };
  hechos: readonly HechoParaLaFicha[];
  projectId?: string | null;
  triggeredByEmail?: string | null;
}): Promise<ResultadoDePropuesta> {
  try {
    const lineas = o.hechos
      .filter((h) => h.frase.trim() && h.cita.trim())
      .map((h) => `- [${CAMPO_SUGERIDO[h.tipo] ?? h.tipo}] ${h.frase.trim()} — «${h.cita.trim()}»`);
    if (!lineas.length) return { status: "sin_fuentes" };
    const texto = `Hechos verificados de la reunión, cada uno con la frase literal que lo respalda:\n${lineas.join("\n")}`;
    return await proponerCambiosALaFicha({
      clientId: o.clientId,
      projectId: o.projectId ?? null,
      fuentes: [{ id: "S1", etiqueta: etiquetaDeSesion(o.reunion), texto }],
      origen: "Sesiones",
      modelo: MODELO_FICHA_SESION,
      triggeredByEmail: o.triggeredByEmail ?? null,
    });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * La reunión dejó de ser de este cliente (cambió de dueño, memoria de la cuenta, etapa 6): los campos propuestos que
 * salieron de ella se sacan de la propuesta de su ficha (lo de otra empresa no puede quedar propuesto como de esta). Un
 * campo que juntaba esa reunión con otras también sale: la próxima reunión lo vuelve a proponer. Lo confirmado no se
 * toca (eso ya lo decidió una persona). Relee y escribe juntos. Devuelve los campos que salieron; lanza si falla.
 */
export async function retirarDeLaFichaLoDeLaReunion(clientId: string, reunion: { title: string | null; date: Date }): Promise<ClaveDeFicha[]> {
  return prisma.$transaction(async (tx) => {
    const fila = await tx.client.findUnique({ where: { id: clientId }, select: { ficha: true } });
    if (!fila) return [];
    const ficha = leerFicha(fila.ficha);
    const claves = camposDeLaReunion(ficha, reunion);
    if (claves.length) await tx.client.update({ where: { id: clientId }, data: { ficha: quitarDeLaPropuesta(ficha, claves) as object } });
    return claves;
  });
}

// ── Puerta 4: lo averiguado en las sesiones de exploración ───────────────────────────────────

/**
 * Lo que el CSE anotó como «lo que averiguaste» en una o varias preguntas de las sesiones. Una sola
 * llamada por guardado (con todas las preguntas que cambiaron), con el modelo barato: son frases
 * cortas escritas por una persona. La etiqueta nombra la sesión: es lo que el CSE ve debajo de la
 * sugerencia en Información del cliente.
 */
export async function proponerFichaDesdeLoAveriguado(opts: {
  clientId: string;
  /** null = la preventa (todavía no hay proyecto). */
  projectId: string | null;
  sesiones: ReadonlyArray<{ titulo: string; preguntas: ReadonlyArray<{ pregunta: string; respuesta: string }> }>;
  triggeredByEmail?: string | null;
}): Promise<ResultadoDePropuesta> {
  try {
    const fuentes: Fuente[] = opts.sesiones
      .filter((s) => s.preguntas.length)
      .map((s, i) => ({
        id: `X${i + 1}`,
        etiqueta: `Exploración · ${s.titulo || "sesión sin título"} · lo que averiguó el CSE`,
        texto: s.preguntas.map((p) => `Pregunta: ${p.pregunta}\nLo que averiguó el CSE: ${p.respuesta}`).join("\n\n"),
      }));
    return await proponerCambiosALaFicha({
      clientId: opts.clientId,
      projectId: opts.projectId,
      fuentes,
      origen: "Exploración",
      modelo: MODELO_FICHA_SESION,
      triggeredByEmail: opts.triggeredByEmail ?? null,
    });
  } catch (e) {
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Puerta 6: lo de la preventa, sin IA ──────────────────────────────────────────────────────

/**
 * Una propuesta a la ficha SIN IA: `armar` dice qué va a cada campo a partir de la ficha vigente (la preventa, por
 * lib/exploraciones/a-la-ficha.ts, suma lo nuevo a lo que ya tenía). Relee y escribe juntos, igual que la puerta con IA:
 * lo que el CSE confirmó mientras tanto es la base. Nunca lanza.
 */
export async function proponerALaFichaSinIA(opts: {
  clientId: string;
  origen: string;
  /** `interno`: el campo trae algo interno aunque vaya al cliente (lib/clients/ficha.ts › `internoPorCampo`). */
  armar: (ficha: FichaGuardada) => ReadonlyArray<{ clave: string; valor: string; fuentes: readonly string[]; interno?: boolean }>;
}): Promise<ResultadoDePropuesta> {
  try {
    const campos = await prisma.$transaction(async (tx) => {
      const fila = await tx.client.findUnique({ where: { id: opts.clientId }, select: { ficha: true } });
      if (!fila) return null;
      const ficha = leerFicha(fila.ficha);
      const nuevos = opts.armar(ficha);
      if (!nuevos.length) return [];
      const r = fusionarPropuesta(ficha, nuevos, opts.origen);
      if (r.cambiados.length) await tx.client.update({ where: { id: opts.clientId }, data: { ficha: r.ficha as object } });
      return r.cambiados;
    });
    if (campos === null) return { status: "error", error: "Cliente no encontrado" };
    return { status: "ok", cambiados: campos.length, campos };
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
  // getClientSessions ya corta en «hoy»: la agenda futura vive en la misma tabla y no aporta nada. Las de puertas
  // adentro no entran (`reunionDePuertasAdentro`): se piden de más para seguir leyendo SESIONES_EN_LOTE con el cliente.
  const [todas, esPuertasAdentro] = await Promise.all([
    getClientSessions(clientId, { take: SESIONES_EN_LOTE * 2 }),
    reunionDePuertasAdentro(),
  ]);
  const sesiones = todas.filter((s) => !esPuertasAdentro(s)).slice(0, SESIONES_EN_LOTE);
  let n = 0;
  for (const s of sesiones) {
    const texto = await fetchTranscriptContent(s.id, s.title, { maxChars: MAX_POR_SESION_EN_LOTE }).catch(() => null);
    if (texto?.trim()) {
      fuentes.push({ id: `S${++n}`, etiqueta: etiquetaDeSesion({ title: s.title, date: new Date(s.date) }), texto });
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
