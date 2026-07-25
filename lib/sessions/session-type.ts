/**
 * lib/sessions/session-type.ts — QUÉ FUE cada reunión. PURO (sin Prisma, client-safe).
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * Nexus no tenía ningún concepto de tipo de reunión. Lo que había era el título,
 * consultado con string-matching desde CUATRO lugares distintos y con tres criterios
 * que se parecían pero no eran el mismo. Medido contra la base: de las 2.090 sesiones
 * con transcripción, el título identifica 43 (2 %). Todo lo demás —la mayoría del
 * material que Nexus tiene sobre sus clientes— era, para el sistema, indistinguible.
 *
 * Eso alcanzaba mientras un proyecto se leía por lo que se escribía EN Nexus. Deja de
 * alcanzar cuando hay que reconstruir un proyecto que ya venía andando: ahí la única
 * fuente abundante son las sesiones, y no se puede leer una historia sin saber si cada
 * reunión fue el arranque, un descubrimiento, un avance o una capacitación.
 *
 * ── LA CASCADA (de barato a caro; el primero que decide, gana) ────────────────
 *   0. Bloqueo humano  — si una persona lo corrigió, no se vuelve a tocar. Nunca.
 *   1. Título          — lo único que alguien escribió CON INTENCIÓN.
 *   2. Participantes   — quién estaba en la sala (Ventas vs entrega vs solo internos).
 *   3. Minuta          — el resumen ya destilado, cuando existe.
 *   4. IA              — solo si los tres anteriores no supieron, y solo colgada del
 *                        agente post-sesión que YA corre (costo marginal cero).
 *
 * ── POR QUÉ LA CONFIANZA SALE DE LA FUENTE Y NO DEL MODELO ───────────────────
 * Es tentador pedirle al modelo un número de confianza y usarlo de umbral. No se hace,
 * y no es una preferencia estética: la confianza auto-reportada por modelos cerrados
 * está mal calibrada al punto de ser casi indistinguible del azar. Un 0,9 y un 0,5 del
 * modelo dicen lo mismo. La FUENTE, en cambio, es un hecho verificable con un modo de
 * falla que se puede enumerar y auditar. Por eso `CONFIDENCE_BY_SOURCE` es una tabla
 * que una persona lee, y el modelo queda reducido a lo que sí hace bien: leer y citar.
 *
 * ── null NO ES "otra" ────────────────────────────────────────────────────────
 * `null` = nunca se clasificó (entra a la cola). `"otra"` = se clasificó y no se pudo
 * determinar (no se reintenta gratis). Sin esa distinción, cada corrida volvería a
 * procesar para siempre las mismas sesiones ambiguas.
 */

// ── Vocabulario ──────────────────────────────────────────────────────────────

/**
 * Ocho tipos, elegidos por lo que hace falta para reconstruir un proyecto:
 * cuándo arrancó (kickoff, handoff), en qué anda (avance, capacitacion, entrega),
 * de dónde viene (descubrimiento) y qué es ruido (interna).
 *
 * Deliberadamente chico: cada tipo que se agrega multiplica los bordes ambiguos, y un
 * vocabulario que no se puede clasificar con consistencia no sirve para leer historia.
 */
export const SESSION_TYPES = [
  "kickoff",
  "handoff",
  "descubrimiento",
  "avance",
  "capacitacion",
  "entrega",
  "interna",
  "otra",
] as const;

export type SessionType = (typeof SESSION_TYPES)[number];

/** Rótulo en español para la UI. Total sobre SESSION_TYPES (hay test que lo exige). */
export const SESSION_TYPE_LABEL: Record<SessionType, string> = {
  kickoff: "Kick Off",
  handoff: "Handoff",
  descubrimiento: "Descubrimiento",
  avance: "Avance",
  capacitacion: "Capacitación",
  entrega: "Entrega",
  interna: "Interna",
  otra: "Sin determinar",
};

/** De qué escalón de la cascada salió la lectura. Se persiste; la confianza no. */
export type SessionTypeSource = "manual" | "titulo" | "participantes" | "minuta" | "ia";

export type SessionTypeConfidence = "confirmada" | "alta" | "media" | "baja";

/**
 * La tabla que reemplaza al número del modelo. Total sobre SessionTypeSource.
 * `ia` nunca llega a "alta": es la única fuente sin un hecho verificable detrás.
 */
export const CONFIDENCE_BY_SOURCE: Record<SessionTypeSource, SessionTypeConfidence> = {
  manual: "confirmada",
  titulo: "alta",
  participantes: "media",
  minuta: "media",
  ia: "media",
};

// ── Reglas de título ─────────────────────────────────────────────────────────

/**
 * Una regla por palabra clave, con su ROL HISTÓRICO en el filtro del handoff.
 *
 * Este campo `handoff` es lo que hace posible unificar las listas duplicadas sin
 * cambiar el comportamiento de nada. El feeding del handoff es lógica de negocio
 * afinada en producción (la última vez, hace tres días): si al unificar se colara una
 * palabra nueva en esas listas, cambiaría en silencio qué material alimenta los
 * handoffs de los 103 proyectos. Con el rol explícito, una palabra nueva nace con
 * `handoff: null` — tipifica la sesión y NO toca el handoff — y hay un test que
 * compara las listas derivadas contra las literales de hoy.
 */
export interface TitleRule {
  /** Qué tipo de reunión declara esta palabra. */
  type: SessionType;
  /** Palabra ya normalizada: minúscula y sin acentos. */
  kw: string;
  /**
   * Rol en las listas del handoff. `null` = palabra NUEVA, no entra a esas listas.
   * Cambiar esto de `null` a otra cosa CAMBIA qué alimenta los handoffs.
   */
  handoff: "exclude" | "include" | null;
  /**
   * Además genera un filtro de base de datos para buscar kickoffs.
   * ⚠ Exige ASCII puro: el `contains` de Postgres vía Prisma ignora mayúsculas pero
   * NO acentos, así que una palabra acentuada acá devolvería cero filas en silencio.
   */
  dbFilter?: true;
}

/**
 * ORDEN = PRECEDENCIA. El primero que matchea gana, y las de entrega/CS van ARRIBA
 * a propósito: es exactamente la semántica que el handoff ya tenía ("excluir gana
 * sobre incluir"), y es la que hace que "Review de kickoff" se lea como un avance y
 * no como el arranque del proyecto. No se re-litiga acá: se conserva.
 */
export const TITLE_RULES: TitleRule[] = [
  // ── Entrega / CS: ganan sobre todo lo demás ──
  { type: "capacitacion", kw: "capacitacion", handoff: "exclude" },
  { type: "capacitacion", kw: "training", handoff: "exclude" },
  { type: "avance", kw: "implementacion", handoff: "exclude" },
  { type: "avance", kw: "implementation", handoff: "exclude" },
  { type: "avance", kw: "adopcion", handoff: "exclude" },
  { type: "avance", kw: "adoption", handoff: "exclude" },
  { type: "avance", kw: "review", handoff: "exclude" },
  { type: "avance", kw: "revision", handoff: "exclude" },
  { type: "avance", kw: "retro", handoff: "exclude" },
  { type: "avance", kw: "retrospectiva", handoff: "exclude" },
  { type: "avance", kw: "sesion semanal", handoff: "exclude" },
  { type: "avance", kw: "weekly", handoff: "exclude" },
  { type: "avance", kw: "stand up", handoff: "exclude" },
  { type: "avance", kw: "standup", handoff: "exclude" },
  { type: "avance", kw: "qbr", handoff: "exclude" },
  { type: "avance", kw: "business review", handoff: "exclude" },

  // ── Arranque: las que SÍ alimentan el handoff ──
  { type: "handoff", kw: "hand off", handoff: "include" },
  { type: "handoff", kw: "handoff", handoff: "include" },
  { type: "handoff", kw: "hand-off", handoff: "include" },
  { type: "handoff", kw: "traspaso", handoff: "include" },
  { type: "kickoff", kw: "kickoff", handoff: "include", dbFilter: true },
  { type: "kickoff", kw: "kick-off", handoff: "include", dbFilter: true },
  { type: "kickoff", kw: "kick off", handoff: "include", dbFilter: true },

  // ── Palabras NUEVAS: tipifican, pero NO tocan el handoff (handoff: null) ──
  { type: "entrega", kw: "entrega final", handoff: null },
  { type: "entrega", kw: "cierre de proyecto", handoff: null },
  { type: "entrega", kw: "salida a produccion", handoff: null },
  { type: "entrega", kw: "go live", handoff: null },
  { type: "entrega", kw: "golive", handoff: null },
  { type: "capacitacion", kw: "onboarding", handoff: null },
  { type: "capacitacion", kw: "enablement", handoff: null },
  { type: "descubrimiento", kw: "levantamiento", handoff: null },
  { type: "descubrimiento", kw: "descubrimiento", handoff: null },
  { type: "descubrimiento", kw: "discovery", handoff: null },
  { type: "descubrimiento", kw: "demo", handoff: null },
  { type: "descubrimiento", kw: "propuesta", handoff: null },
  { type: "descubrimiento", kw: "diagnostico", handoff: null },
];

/** Insensitive a mayúsculas y acentos. Misma normalización que el handoff usa hoy. */
export function normalizeTitle(t: string): string {
  return (t || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

// ── Las cuatro listas duplicadas, ahora DERIVADAS de una sola tabla ───────────

/** Títulos de entrega/CS que nunca alimentan el handoff. Congelada por test. */
export const HANDOFF_EXCLUDE_TITLE_KEYWORDS: string[] = TITLE_RULES.filter(
  (r) => r.handoff === "exclude",
).map((r) => r.kw);

/** Títulos que sí alimentan el handoff. Congelada por test. */
export const HANDOFF_INCLUDE_TITLE_KEYWORDS: string[] = TITLE_RULES.filter(
  (r) => r.handoff === "include",
).map((r) => r.kw);

/**
 * Filtros de Prisma para buscar la sesión de Kick Off.
 * ⚠ Los consume además el motor de etapas, que está congelado por decisión
 * (`docs/DECISIONS.md`): ampliar esta lista mueve la etapa inferida de toda la
 * cartera. Por eso hay un test que la compara contra las tres entradas de siempre.
 */
export function kickoffTitleFilters(): Array<{
  title: { contains: string; mode: "insensitive" };
}> {
  return TITLE_RULES.filter((r) => r.dbFilter).map((r) => ({
    title: { contains: r.kw, mode: "insensitive" as const },
  }));
}

/**
 * Pre-filtro barato de "¿el título menciona un kickoff?".
 *
 * Se mantiene LOOSE a propósito: quien lo usa (el re-anclaje del cronograma al ingerir
 * una sesión) lo hace como puerta de entrada barata, y la verificación de verdad ocurre
 * después. Cambiarlo por la cascada completa lo ANGOSTARÍA —"Kickoff + review" se lee
 * como avance— y dejaría de re-anclar en títulos mixtos, que es justo cuando hace falta.
 */
export function titleMentionsKickoff(title: string): boolean {
  return /kick[\s-]?off/i.test(title || "");
}

// ── La cascada ───────────────────────────────────────────────────────────────

export interface SessionTypeSignals {
  title: string;
  /** Correos de los participantes (internos y externos). */
  participants: string[];
  organizerEmail?: string | null;
  /** Correos internos del equipo, en minúscula. Lo de afuera es cliente. */
  internalEmails: Set<string>;
  /** Internos de Ventas (subconjunto de internalEmails). */
  salesEmails: Set<string>;
  /** Internos de entrega — CSE y desarrollo (subconjunto de internalEmails). */
  deliveryEmails: Set<string>;
  /** Resumen ya destilado de la minuta, si existe. NUNCA el transcript crudo. */
  minuteSummary?: string | null;
  /** Marcado por una persona: si está, gana sobre todo. */
  reviewedType?: SessionType | null;
  /** Propuesta del agente post-sesión. Entra como UNA señal más, no como veredicto. */
  aiProposal?: { type: string | null; quote?: string | null } | null;
}

export interface SessionTypeResolution {
  type: SessionType;
  /** null solo cuando ningún escalón supo (type === "otra"). */
  source: SessionTypeSource | null;
  confidence: SessionTypeConfidence;
  /** Qué disparó la decisión, para el tooltip: la palabra, la regla o la cita. */
  evidence: string | null;
  /** Qué dijo cada escalón. Para el log del backfill; no se persiste. */
  trace: Array<{ rung: SessionTypeSource; type: SessionType | null; why: string }>;
}

/**
 * Frases de ALTA precisión sobre el resumen de la minuta. Cortas y genéricas no sirven:
 * una sesión de avance menciona "kickoff" todo el tiempo. Por eso se busca la frase
 * completa y solo sobre el resumen, nunca sobre el transcript.
 */
const MINUTE_PHRASES: Array<{ type: SessionType; phrase: string }> = [
  { type: "capacitacion", phrase: "se capacito" },
  { type: "capacitacion", phrase: "capacitacion al equipo" },
  { type: "entrega", phrase: "se entrego" },
  { type: "entrega", phrase: "entrega final" },
  { type: "entrega", phrase: "salida a produccion" },
  { type: "kickoff", phrase: "arranque del proyecto" },
  { type: "kickoff", phrase: "inicio del proyecto" },
];

function asSessionType(v: string | null | undefined): SessionType | null {
  if (!v) return null;
  return (SESSION_TYPES as readonly string[]).includes(v) ? (v as SessionType) : null;
}

/** Arma el resultado con la confianza que le corresponde a la fuente. */
function resolved(
  type: SessionType,
  source: SessionTypeSource,
  evidence: string | null,
  trace: SessionTypeResolution["trace"],
): SessionTypeResolution {
  return { type, source, confidence: CONFIDENCE_BY_SOURCE[source], evidence, trace };
}

/**
 * Decide qué fue una reunión. Determinista: mismas señales ⇒ mismo resultado.
 */
export function resolveSessionType(signals: SessionTypeSignals): SessionTypeResolution {
  const trace: SessionTypeResolution["trace"] = [];

  // ── 0. Bloqueo humano ──
  const humano = asSessionType(signals.reviewedType);
  if (humano) {
    trace.push({ rung: "manual", type: humano, why: "corregido por una persona" });
    return resolved(humano, "manual", "corregido a mano", trace);
  }

  // ── 1. Título ──
  const t = normalizeTitle(signals.title);
  const regla = TITLE_RULES.find((r) => t.includes(r.kw));
  if (regla) {
    trace.push({ rung: "titulo", type: regla.type, why: `título dice «${regla.kw}»` });
    return resolved(regla.type, "titulo", `título dice «${regla.kw}»`, trace);
  }
  trace.push({ rung: "titulo", type: null, why: "título neutro" });

  // ── 2. Participantes ──
  const todos = signals.organizerEmail
    ? [...signals.participants, signals.organizerEmail]
    : signals.participants;
  const enMinuscula = todos.map((p) => p.toLowerCase());
  const hayExterno = enMinuscula.some((p) => !signals.internalEmails.has(p));
  const hayVentas = enMinuscula.some((p) => signals.salesEmails.has(p));
  const hayEntrega = enMinuscula.some((p) => signals.deliveryEmails.has(p));

  if (!hayExterno && enMinuscula.length > 0) {
    trace.push({ rung: "participantes", type: "interna", why: "sin nadie del cliente" });
    return resolved("interna", "participantes", "sin nadie del cliente en la sala", trace);
  }
  if (hayVentas && !hayEntrega) {
    trace.push({ rung: "participantes", type: "descubrimiento", why: "Ventas sin entrega" });
    return resolved("descubrimiento", "participantes", "Ventas en la sala, sin entrega", trace);
  }
  if (hayEntrega && !hayVentas && hayExterno) {
    trace.push({ rung: "participantes", type: "avance", why: "entrega con el cliente" });
    return resolved("avance", "participantes", "equipo de entrega con el cliente", trace);
  }
  // Ventas + entrega + cliente con título neutro es, literalmente, la forma de un
  // handoff o un kickoff. Adivinar acá cambiaría qué alimenta el handoff, así que
  // se deja pasar al escalón siguiente a propósito.
  trace.push({ rung: "participantes", type: null, why: "sala ambigua (Ventas y entrega)" });

  // ── 3. Minuta ──
  if (signals.minuteSummary) {
    const resumen = normalizeTitle(signals.minuteSummary);
    const frase = MINUTE_PHRASES.find((p) => resumen.includes(p.phrase));
    if (frase) {
      trace.push({ rung: "minuta", type: frase.type, why: `la minuta dice «${frase.phrase}»` });
      return resolved(frase.type, "minuta", `la minuta dice «${frase.phrase}»`, trace);
    }
    trace.push({ rung: "minuta", type: null, why: "la minuta no lo dice" });
  }

  // ── 4. IA (propuesta del post-sesión, si vino) ──
  const propuesta = asSessionType(signals.aiProposal?.type);
  if (propuesta) {
    const cita = signals.aiProposal?.quote?.trim() || null;
    trace.push({ rung: "ia", type: propuesta, why: cita ? `cita: «${cita}»` : "sin cita" });
    return resolved(propuesta, "ia", cita, trace);
  }

  return { type: "otra", source: null, confidence: "baja", evidence: null, trace };
}
