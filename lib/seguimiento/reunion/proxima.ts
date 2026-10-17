/**
 * lib/seguimiento/reunion/proxima.ts — la PRÓXIMA REUNIÓN sugerida después de una reunión con un cliente, y el enlace
 * para agendarla en Google Calendar. PURO. Ficha G (2026-10-17).
 *
 * Nexus no escribe en el calendario ni invita a nadie: arma el evento por enlace, con todo lleno, y la persona lo
 * revisa y lo guarda (Google manda la invitación). Después dice «Ya la agendé» o «No hace falta».
 *
 *   · El título y el objetivo: los que cambió la persona; si no, los que escribió el agente con el correo de
 *     seguimiento (`proximaDelAgente`); si no, uno de Nexus («Seguimiento de la reunión del 15 oct…»). El objetivo va
 *     en la invitación: lo lee el cliente.
 *   · Cuándo: la misma hora (en Costa Rica) una semana después; si eso ya pasó, el próximo día hábil desde mañana. Nunca
 *     sábado ni domingo.
 *   · Cuánto dura: lo que duró esta, redondeado a 30, 45, 60 o 90 minutos (45 si no se sabe).
 *   · A quién se invita: los que estuvieron (del cliente y del equipo), sin salas, grabadores ni correos de sistema.
 * Las horas se manejan en Costa Rica, UTC-6 sin horario de verano, a mano: el servidor y el navegador dicen lo mismo.
 */
import { diaCortoCR } from "./agenda";

export const MAX_TITULO_DE_LA_PROXIMA = 100;
export const MAX_OBJETIVO_DE_LA_PROXIMA = 1000;
export const DURACIONES = [30, 45, 60, 90] as const;
const MAX_INVITADOS = 20;
const CR_MS = 6 * 3_600_000;

export type DeDondeLaProxima = "persona" | "agente" | "nexus";
export type EstadoDeLaProxima = "pendiente" | "agendada" | "descartada";

export interface ProximaSugerida {
  titulo: string;
  objetivo: string;
  /** ISO (UTC). */
  inicio: string;
  duracionMin: number;
  invitados: string[];
  /** De dónde salen el título y el objetivo. */
  deDonde: DeDondeLaProxima;
  estado: EstadoDeLaProxima;
  /** Quién dijo «Ya la agendé» o «No hace falta», y cuándo. */
  decidida: { porNombre: string | null; en: string } | null;
  enlace: string;
}

export interface GuardadoDeLaProxima {
  titulo: string | null;
  objetivo: string | null;
  inicio: string | null;
  duracionMin: number | null;
  estado: string | null;
  /** Quién la tocó por última vez (una persona). null = solo el agente. */
  porEmail: string | null;
  porNombre: string | null;
  en: string | null;
}

const NO_ES_UNA_PERSONA = /no-?reply|notetaker|fireflies|otter\.ai|read\.ai|calendar-notification|@resource\.calendar\.google\.com|@group\.calendar\.google\.com|@resource\.|@group\./i;
const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Los invitados de la próxima: los que estuvieron, sin salas, grabadores ni repetidos. */
export function invitadosDeLaProxima(participantes: readonly string[]): string[] {
  const vistos = new Set<string>();
  for (const p of participantes) {
    const e = p.trim().toLowerCase();
    if (CORREO.test(e) && !NO_ES_UNA_PERSONA.test(e)) vistos.add(e);
  }
  return [...vistos].slice(0, MAX_INVITADOS);
}

/** La duración sugerida: la de esta reunión, redondeada a la opción más cercana. */
export function duracionSugerida(min: number): number {
  if (!(min > 0)) return 45;
  return DURACIONES.reduce((mejor, d) => (Math.abs(d - min) < Math.abs(mejor - min) ? d : mejor), 45 as number);
}

/** ¿Sábado o domingo en Costa Rica? */
function esFinDeSemanaCR(ms: number): boolean {
  const dia = new Date(ms - CR_MS).getUTCDay();
  return dia === 0 || dia === 6;
}

/** Corre al lunes si cae en fin de semana (misma hora). */
function aDiaHabil(ms: number): number {
  let t = ms;
  while (esFinDeSemanaCR(t)) t += 24 * 3_600_000;
  return t;
}

/**
 * Cuándo se sugiere: una semana después, a la misma hora. Si eso ya pasó (una reunión vieja), mañana a esa hora o el
 * próximo día hábil.
 */
export function inicioSugerido(fechaDeLaReunion: string, ahora: Date): string {
  const inicio = Date.parse(fechaDeLaReunion);
  const enUnaSemana = aDiaHabil(inicio + 7 * 24 * 3_600_000);
  if (enUnaSemana > ahora.getTime() + 3_600_000) return new Date(enUnaSemana).toISOString();
  // La hora de la reunión, en Costa Rica, puesta en el día de mañana.
  const h = new Date(inicio - CR_MS);
  const hoyCR = new Date(ahora.getTime() - CR_MS);
  const manana = Date.UTC(hoyCR.getUTCFullYear(), hoyCR.getUTCMonth(), hoyCR.getUTCDate() + 1, h.getUTCHours(), h.getUTCMinutes()) + CR_MS;
  return new Date(aDiaHabil(manana)).toISOString();
}

/** «2026-10-22T09:30» en hora de Costa Rica, para un `<input type="datetime-local">`. */
export function aHoraLocalCR(iso: string): string {
  const d = new Date(Date.parse(iso) - CR_MS);
  const dos = (n: number) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${dos(d.getUTCMonth() + 1)}-${dos(d.getUTCDate())}T${dos(d.getUTCHours())}:${dos(d.getUTCMinutes())}`;
}

/** Lo de un `<input type="datetime-local">` (hora de Costa Rica) a ISO. null si no es una fecha. */
export function deHoraLocalCR(local: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local.trim());
  if (!m) return null;
  const ms = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) + CR_MS;
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** `20261022T153000Z`: el formato de fechas del enlace de Google Calendar. */
function enFormatoDeGoogle(ms: number): string {
  return new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

/**
 * El evento de Google Calendar armado por enlace, con todo lleno: título, fecha y hora, duración, el objetivo como
 * descripción y los invitados. La persona lo revisa y lo guarda en SU calendario. Nada interno va en la descripción:
 * la leen todos los invitados.
 */
export function enlaceParaAgendar(o: { titulo: string; objetivo: string; inicio: string; duracionMin: number; invitados: readonly string[] }): string {
  const ini = Date.parse(o.inicio);
  const q = new URLSearchParams({ action: "TEMPLATE", text: o.titulo });
  if (Number.isFinite(ini)) q.set("dates", `${enFormatoDeGoogle(ini)}/${enFormatoDeGoogle(ini + Math.max(15, o.duracionMin) * 60_000)}`);
  if (o.objetivo.trim()) q.set("details", o.objetivo.trim());
  q.set("ctz", "America/Costa_Rica");
  const invitados = o.invitados.filter((x) => CORREO.test(x));
  if (invitados.length) q.set("add", invitados.join(","));
  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/** Lo que el agente del correo sugirió como próxima reunión (`proximaReunion` de su herramienta), saneado. */
export function proximaDelAgente(entrada: Record<string, unknown> | null | undefined): { titulo: string; objetivo: string } | null {
  const p = entrada?.proximaReunion;
  if (!p || typeof p !== "object" || Array.isArray(p)) return null;
  const x = p as Record<string, unknown>;
  const titulo = typeof x.titulo === "string" ? x.titulo.trim().slice(0, MAX_TITULO_DE_LA_PROXIMA) : "";
  const objetivo = typeof x.objetivo === "string" ? x.objetivo.trim().slice(0, MAX_OBJETIVO_DE_LA_PROXIMA) : "";
  return objetivo ? { titulo, objetivo } : null;
}

/**
 * La próxima reunión que el correo confirma: la que la persona ya agendó desde la página, si su día no pasó. Sin ella,
 * el correo propone una (lo dice el pedido).
 */
export function proximaAgendadaParaElCorreo(g: GuardadoDeLaProxima | null, hoy: string): { titulo: string | null; fecha: string } | null {
  if (!g || g.estado !== "agendada" || !g.inicio || g.inicio.slice(0, 10) < hoy) return null;
  return { titulo: g.titulo?.trim() || null, fecha: g.inicio };
}

/** El título y el objetivo de Nexus, sin el agente: no dice nada interno (va en la invitación). */
export function proximaDeNexus(reunion: { titulo: string; fecha: string }, empresa: string): { titulo: string; objetivo: string } {
  return {
    titulo: `Seguimiento · ${empresa}`.slice(0, MAX_TITULO_DE_LA_PROXIMA),
    objetivo: `Seguimiento de la reunión del ${diaCortoCR(reunion.fecha)} («${reunion.titulo.trim()}»): revisar cómo avanzaron los próximos pasos y lo que quedó pendiente.`.slice(
      0,
      MAX_OBJETIVO_DE_LA_PROXIMA,
    ),
  };
}

export function sugerirProxima(o: {
  reunion: { titulo: string; fecha: string; duracionMin: number; participantes: readonly string[] };
  empresa: string;
  guardado: GuardadoDeLaProxima | null;
  ahora: Date;
}): ProximaSugerida {
  const g = o.guardado;
  const nexus = proximaDeNexus(o.reunion, o.empresa);
  const tituloGuardado = g?.titulo?.trim() || null;
  const objetivoGuardado = g?.objetivo?.trim() || null;
  const deDonde: DeDondeLaProxima = objetivoGuardado ? (g?.porEmail ? "persona" : "agente") : "nexus";
  const inicio = g?.inicio && Number.isFinite(Date.parse(g.inicio)) ? new Date(g.inicio).toISOString() : inicioSugerido(o.reunion.fecha, o.ahora);
  const duracionMin = g?.duracionMin && g.duracionMin >= 15 ? g.duracionMin : duracionSugerida(o.reunion.duracionMin);
  const titulo = tituloGuardado ?? nexus.titulo;
  const objetivo = objetivoGuardado ?? nexus.objetivo;
  const invitados = invitadosDeLaProxima(o.reunion.participantes);
  const estado: EstadoDeLaProxima = g?.estado === "agendada" || g?.estado === "descartada" ? g.estado : "pendiente";
  return {
    titulo,
    objetivo,
    inicio,
    duracionMin,
    invitados,
    deDonde,
    estado,
    decidida: estado !== "pendiente" && g?.en ? { porNombre: g.porNombre, en: g.en } : null,
    enlace: enlaceParaAgendar({ titulo, objetivo, inicio, duracionMin, invitados }),
  };
}

/** «mié 22 oct, 9:30» en hora de Costa Rica. */
export function fechaYHoraCR(iso: string): string {
  const d = new Date(Date.parse(iso) - CR_MS);
  const dias = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
  return `${dias[d.getUTCDay()]} ${diaCortoCR(iso)}, ${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}
