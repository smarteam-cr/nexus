/**
 * lib/exploraciones/como-llego.ts — CÓMO LLEGÓ EL PROSPECTO y la primera sesión que abre la puerta (K2 del roadmap,
 * 2026-10-27). PURO y client-safe.
 *
 * Feedback de Ventas (23 oct): un prospecto que llega en frío o referido no hizo el test ni pidió un diagnóstico. Su
 * primera sesión no puede ser la guía de siempre: es para ABRIR LA PUERTA. 10 minutos para presentar a Smarteam con su
 * position statement, 35 para que el cliente cuente lo que le pasa, y unas 3 preguntas al final. Desde la segunda, la
 * guía de siempre (por equipo o de la empresa).
 *
 * «Cómo llegó» lo PROPONE Nexus desde HubSpot (la propiedad «fuente-de-lead» del contacto, el test que dejó su nota, y
 * el origen del tráfico) y lo CONFIRMA una persona: sin confirmar no se guarda ni cambia la guía. La propuesta nunca
 * dice «referido» por el origen web «REFERRALS» (eso es otro sitio que enlazó al nuestro, no una persona).
 *
 * El position statement de Smarteam todavía no está escrito (K3 espera a Marco). El lugar ya existe
 * (`PerfilDeLaEmpresa.positionStatement`, lib/smarteam/perfil.ts): mientras esté vacío, la presentación usa la
 * propuesta de valor del perfil, y si tampoco hay, lo dice. Nunca se inventa.
 */
import type { PerfilDeLaEmpresa } from "@/lib/smarteam/perfil";

export const VIAS_DE_LLEGADA = ["test", "frio", "referido", "evento", "web"] as const;
export type ViaDeLlegada = (typeof VIAS_DE_LLEGADA)[number];

export const NOMBRE_DE_LA_VIA: Readonly<Record<ViaDeLlegada, string>> = {
  test: "Por el test",
  frio: "En frío",
  referido: "Referido",
  evento: "Por un evento",
  web: "Por la web o un anuncio",
};

/** Lo que se guarda en la exploración (`contenido.comoLlego`), confirmado por una persona. */
export interface ComoLlego {
  via: ViaDeLlegada;
  /** Solo con «referido»: quién lo refirió, como lo escribió quien lleva la preventa. */
  referidoPor?: string;
  /** Cuándo se confirmó (ISO). */
  en: string;
}

export const MAX_REFERIDO_POR = 120;

export function esViaDeLlegada(x: unknown): x is ViaDeLlegada {
  return typeof x === "string" && (VIAS_DE_LLEGADA as readonly string[]).includes(x);
}

/** Lo que hace falta de un contacto de HubSpot para proponer cómo llegó. */
export interface ContactoParaLaLlegada {
  nombre: string;
  /** Hizo el test de marketing (lo terminó o lo empezó). */
  hizoElTest: boolean;
  rastro: {
    /** `fuente_de_lead` («Diagnóstico de rendimiento», «Referidos», «Prospección Linkedin»…). */
    fuenteDeLead?: string | null;
    /** `hs_analytics_source` (ORGANIC_SEARCH, OFFLINE…). */
    fuente: string | null;
    fuenteDetalle: string | null;
  };
}

export interface LlegadaPropuesta {
  via: ViaDeLlegada;
  /** Por qué lo propone Nexus, en palabras de la pantalla. */
  porque: string;
}

const sinTildes = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .trim();

/** La propiedad «fuente-de-lead» de HubSpot (sus opciones del 2026-10-27), en una vía. null = no dice. */
export function viaDeLaFuenteDeLead(valor: string | null | undefined): ViaDeLlegada | null {
  const v = sinTildes(valor ?? "");
  if (!v) return null;
  if (v.startsWith("diagnostico")) return "test";
  if (v.startsWith("referid")) return "referido";
  if (v === "abm" || v.includes("prospeccion")) return "frio";
  if (v.includes("evento") || v.includes("webinar")) return "evento";
  if (v.includes("ads") || v.includes("form")) return "web";
  return null;
}

/** El origen del tráfico de HubSpot (`hs_analytics_source`) que se lee como «llegó por la web». */
const FUENTES_DE_LA_WEB = new Set(["ORGANIC_SEARCH", "PAID_SEARCH", "EMAIL_MARKETING", "SOCIAL_MEDIA", "PAID_SOCIAL", "REFERRALS", "DIRECT_TRAFFIC", "OTHER_CAMPAIGNS", "AI_REFERRALS"]);

/**
 * Lo que Nexus propone, en este orden (de lo más claro a lo menos): el test (un contacto lo hizo, o su nota llegó a la
 * preventa); la «fuente-de-lead» de un contacto; el origen del tráfico (la web, o «cargado a mano» = en frío). null =
 * HubSpot no dice nada: la persona lo elige.
 */
export function llegadaPropuesta(o: { contactos: readonly ContactoParaLaLlegada[]; conTest: boolean }): LlegadaPropuesta | null {
  const delTest = o.contactos.find((c) => c.hizoElTest);
  if (o.conTest || delTest) {
    return { via: "test", porque: delTest ? `${delTest.nombre} hizo el test en línea.` : "Hizo el test en línea (su resultado llegó a la preventa)." };
  }
  for (const c of o.contactos) {
    const via = viaDeLaFuenteDeLead(c.rastro.fuenteDeLead);
    if (via) return { via, porque: `En HubSpot, la fuente del lead de ${c.nombre} dice «${c.rastro.fuenteDeLead}».` };
  }
  for (const c of o.contactos) {
    const f = c.rastro.fuente;
    if (f && FUENTES_DE_LA_WEB.has(f)) return { via: "web", porque: `${c.nombre} llegó por la web según HubSpot.` };
  }
  for (const c of o.contactos) {
    if (c.rastro.fuente === "OFFLINE") {
      return { via: "frio", porque: `${c.nombre} lo cargó el equipo en HubSpot (no llegó por la web ni por el test): confirma si fue en frío, referido o por un evento.` };
    }
  }
  return null;
}

/** ¿La vía pide abrir la puerta? En frío o referido: no pidió nada todavía. */
export function viaQueAbreLaPuerta(via: ViaDeLlegada | null | undefined): boolean {
  return via === "frio" || via === "referido";
}

/** Lo que hace falta de la exploración para saber si la sesión abre la puerta. */
export interface EntradaDeAbrirLaPuerta {
  contenido: { comoLlego?: ComoLlego; sesiones: readonly { id: string; fecha?: string; hecha?: boolean; reunion?: unknown; resultado?: string }[] };
  propuesta: { lecturas: Readonly<Record<string, unknown>> };
}

/**
 * ¿Esta sesión es la primera de un prospecto que llegó en frío o referido? Sí, si la persona lo confirmó así, ninguna
 * reunión se leyó todavía, ninguna OTRA sesión está hecha, unida a su reunión o con un resultado, y es la PRIMERA de las
 * que esperan (la de fecha más temprana; sin fechas, la primera agregada): la sesión 2 de Marketing ya trae la guía de
 * su equipo. Sin sesión planeada todavía (`sesionId` null), solo si no hay ninguna. Solo la preventa: en un proyecto el
 * cliente ya compró.
 */
export function abreLaPuerta(e: EntradaDeAbrirLaPuerta, sesionId: string | null, o: { marco?: string } = {}): boolean {
  if (o.marco === "cs") return false;
  if (!viaQueAbreLaPuerta(e.contenido.comoLlego?.via)) return false;
  if (Object.keys(e.propuesta.lecturas).length > 0) return false;
  const sesiones = e.contenido.sesiones;
  if (sesiones.some((s) => s.id !== sesionId && (s.hecha || !!s.reunion || !!s.resultado))) return false;
  if (sesionId === null) return sesiones.length === 0;
  const primera = sesiones
    .map((s, i) => ({ s, i }))
    .sort((a, b) => (a.s.fecha ?? "9999-12-31").localeCompare(b.s.fecha ?? "9999-12-31") || a.i - b.i)[0]?.s;
  return primera?.id === sesionId;
}

/** Los tramos de la primera sesión que abre la puerta (en minutos de una hora). */
export const TRAMOS_DE_ABRIR_LA_PUERTA = { presentar: [0, 10], escuchar: [10, 45], preguntar: [45, 60] } as const;

/** Cuántas preguntas lleva la primera sesión en frío. */
export const PREGUNTAS_DE_ABRIR_LA_PUERTA = 3;

/** Cómo presentar a Smarteam, sin inventar: el position statement, o la propuesta de valor mientras no exista. */
export function presentacionDeSmarteam(perfil: Pick<PerfilDeLaEmpresa, "positionStatement" | "propuestaDeValor"> | null): {
  texto: string | null;
  de: "positionStatement" | "propuestaDeValor" | null;
} {
  const ps = perfil?.positionStatement?.trim();
  if (ps) return { texto: ps, de: "positionStatement" };
  const pv = perfil?.propuestaDeValor?.trim();
  if (pv) return { texto: pv, de: "propuestaDeValor" };
  return { texto: null, de: null };
}

/** El bloque del pedido de la guía para la primera sesión que abre la puerta. */
export function bloqueDeAbrirLaPuerta(c: ComoLlego): string {
  const quien = c.via === "referido" ? `referido${c.referidoPor ? ` por ${c.referidoPor}` : ""}` : "en frío";
  return [
    `=== LA PRIMERA SESIÓN ABRE LA PUERTA (el prospecto llegó ${quien}: no hizo el test ni pidió un diagnóstico) ===`,
    `- ${TRAMOS_DE_ABRIR_LA_PUERTA.presentar[0]}–${TRAMOS_DE_ABRIR_LA_PUERTA.presentar[1]} min: el vendedor presenta a Smarteam con lo que dice el bloque SMARTEAM (si no hay, sin inventar nada: quién es y qué hace). La «apertura» va a eso${c.via === "referido" && c.referidoPor ? `, y nombra a quien lo refirió` : ""}.`,
    `- ${TRAMOS_DE_ABRIR_LA_PUERTA.escuchar[0]}–${TRAMOS_DE_ABRIR_LA_PUERTA.escuchar[1]} min: el cliente cuenta lo que le pasa. Escuchar, no diagnosticar: nada de escala, niveles ni presupuesto.`,
    `- ${TRAMOS_DE_ABRIR_LA_PUERTA.preguntar[0]}–${TRAMOS_DE_ABRIR_LA_PUERTA.preguntar[1]} min: unas ${PREGUNTAS_DE_ABRIR_LA_PUERTA} preguntas abiertas (las de «para»), y acordar la segunda sesión. Desde la segunda va la guía de siempre.`,
  ].join("\n");
}
