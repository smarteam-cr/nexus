/**
 * lib/exploraciones/historia-de-las-sesiones.ts — LO QUE DEJÓ CADA SESIÓN DE LA EXPLORACIÓN, en texto, para el agente que
 * arma la guía y para el asistente («Mejorar con el asistente», el chat de Nexus abierto desde la guía). PURO.
 *
 * Caso de CEMACO (2026-10-20, Liliana Moreno): el asistente propuso preguntar cuántas personas coordinan con las cinco
 * agencias —se respondió la víspera— y no tomó lo que Marco pidió para la sesión siguiente (las volumetrías de cada canal:
 * cuántos leads llegan y cuántos se convierten). El chat no recibía ninguna sesión, y el agente recibía el resumen de las
 * tres últimas, sin lo que se cubrió, sin los acuerdos de cada reunión y sin el objetivo de la próxima. Acá va todo eso,
 * una vez, con topes: lo que se lee de la base lo trae `acuerdosDeLasReuniones` (./historia-de-las-sesiones-server.ts).
 *
 * Solo lo de la exploración (DECISIONS «La exploración son sus sesiones»): las lecturas de sus sesiones
 * (`lecturasDeLaExploracion`) y lo que escribió quien la lleva en cada una. Lo demás de la cuenta llega por la memoria.
 */
import type { CoberturaDeLaPregunta, LecturaDeReunion } from "./contenido";
import { lecturasDeLaExploracion, type SesionPlaneada } from "./guia";
import { claveDeNotaDeSesion } from "./notas-de-sesion";
import { diaConAnio } from "./fechas";
import { EQUIPOS, type ClaveDeEquipo } from "./equipos";
// La sesión de una lectura (por su reunión, su evento o el día): vive aparte porque también la usa el plan de la guía.
import { sesionDeLaLectura } from "./sesion-de-la-lectura";

/** Los acuerdos y las decisiones de la minuta de una reunión (la minuta la escribe la IA; `revisada` = la confirmó el CSE). */
export interface AcuerdosDeLaReunion {
  acuerdos: string[];
  decisiones: string[];
  revisada: boolean;
}

export const TOPES_DE_LA_HISTORIA = {
  /** Las sesiones más recientes con algo que decir. */
  sesiones: 10,
  resumen: 900,
  /** Por sesión: las preguntas respondidas y las que no salieron. */
  preguntas: 8,
  pregunta: 240,
  /** Por sesión: los acuerdos y las decisiones de su minuta. */
  acuerdos: 8,
  acuerdo: 280,
  nota: 900,
  /** El bloque entero de las sesiones que ya pasaron. */
  total: 14_000,
} as const;

/** Una sesión que ya pasó, con lo que dejó. */
export interface SesionDeLaHistoria {
  /** La clave de la lectura (`meet:<id>`, `hubspot:<id>`, `documento:<id>`), o null si solo hay notas. */
  clave: string | null;
  /** Todas sus lecturas: la misma reunión por Meet y por HubSpot va en una sola entrada. */
  claves: string[];
  fecha: string | null;
  titulo: string;
  /**
   * K11 (2026-10-28): con qué equipo del cliente fue (el de su sesión). null = con la empresa entera, o nadie lo eligió.
   * La guía contrasta lo que dijo cada equipo: sin esto, el agente adivinaba quién lo había dicho.
   */
  equipo: ClaveDeEquipo | null;
  texto: string;
  /** Los acuerdos y las decisiones de su minuta, enteros (para encontrar lo pedido para la próxima). */
  acuerdos: string[];
}

export interface HistoriaDeLasSesiones {
  /** De la más vieja a la más nueva. */
  sesiones: SesionDeLaHistoria[];
  /** La próxima sesión: lo que escribió quien la lleva. */
  proxima: {
    objetivo: string | null;
    explorar: string[];
    notas: string | null;
    /** Lo que la última reunión acordó para la próxima («la sesión del día siguiente se enfocará en…»), con de dónde sale. */
    acordado: { de: string; lineas: string[] } | null;
  };
  /** Los ids de las reuniones de Meet que van acá: la memoria del proyecto no las repite (`yaLeidas`). */
  reuniones: string[];
}

/** Dos lecturas a menos de esto son la misma reunión (Meet y HubSpot; el mismo criterio que lectura.ts › `mismaReunion`). */
const MISMA_REUNION_MS = 2 * 3_600_000;

const recortar = (t: string, n: number) => {
  const s = t.replace(/\s+/g, " ").trim();
  return s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
};

/** Lo que escribió quien llevó la sesión: su nota y lo que anotó que respondió el cliente a cada pregunta. */
function notasDeLaSesion(notas: Readonly<Record<string, string>>, sesionId: string): string | null {
  const base = claveDeNotaDeSesion(sesionId);
  const partes = Object.entries(notas)
    .filter(([k, v]) => (k === base || k.startsWith(`${base}:`)) && v.trim())
    .map(([k, v]) => (k === base ? v.trim() : `(sobre ${k.slice(base.length + 1)}) ${v.trim()}`));
  return partes.length ? recortar(partes.join(" · "), TOPES_DE_LA_HISTORIA.nota) : null;
}

function lineasDeCobertura(cobertura: readonly CoberturaDeLaPregunta[]): string[] {
  const T = TOPES_DE_LA_HISTORIA;
  const si = cobertura.filter((c) => c.respondida).slice(0, T.preguntas);
  const no = cobertura.filter((c) => !c.respondida).slice(0, T.preguntas);
  return [
    ...si.map((c) => `- Ya respondido: «${recortar(c.pregunta, T.pregunta)}»${c.detalle ? ` → ${recortar(c.detalle, T.pregunta)}` : ""}`),
    ...no.map((c) => `- Se llevó y no salió: «${recortar(c.pregunta, T.pregunta)}»`),
  ];
}

function lineasDeAcuerdos(a: AcuerdosDeLaReunion | undefined): string[] {
  if (!a) return [];
  const T = TOPES_DE_LA_HISTORIA;
  const marca = a.revisada ? "minuta revisada" : "minuta en borrador";
  return [...a.acuerdos.map((x) => `- Acuerdo (${marca}): ${recortar(x, T.acuerdo)}`), ...a.decisiones.map((x) => `- Decisión (${marca}): ${recortar(x, T.acuerdo)}`)].slice(
    0,
    T.acuerdos,
  );
}

/**
 * La historia de la exploración: cada sesión que ya dejó algo (lo que leyó el agente, lo que se cubrió, los acuerdos de
 * su minuta y las notas de quien la llevó) y lo que escribió quien lleva la próxima. `acuerdos` va por clave de lectura.
 */
export function historiaDeLasSesiones(o: {
  lecturas: Readonly<Record<string, LecturaDeReunion>>;
  sesiones: readonly SesionPlaneada[];
  automaticas: boolean;
  fuera: readonly string[];
  notas: Readonly<Record<string, string>>;
  acuerdos?: Readonly<Record<string, AcuerdosDeLaReunion>>;
  proximaId: string | null;
}): HistoriaDeLasSesiones {
  const T = TOPES_DE_LA_HISTORIA;
  const delaExploracion = lecturasDeLaExploracion(o.lecturas, o.sesiones, { automaticas: o.automaticas, fuera: o.fuera });
  const usadas = new Set<string>();
  type Entrada = { claves: string[]; fecha: string | null; titulo: string; equipo: ClaveDeEquipo | null; lineas: string[]; acuerdos: string[] };
  const entradas: Entrada[] = [];

  for (const [clave, l] of Object.entries(delaExploracion)) {
    const s = sesionDeLaLectura(clave, l, o.sesiones);
    if (s) usadas.add(s.id);
    const lineas = [
      recortar(l.resumen ?? "", T.resumen),
      ...(l.objetivo ? [`- Su objetivo era: ${recortar(l.objetivo, T.pregunta)}`] : []),
      ...lineasDeCobertura(l.cobertura ?? []),
      ...lineasDeAcuerdos(o.acuerdos?.[clave]),
    ];
    const notas = s ? notasDeLaSesion(o.notas, s.id) : null;
    if (notas) lineas.push(`- Lo que anotó quien la llevó: ${notas}`);
    const a = o.acuerdos?.[clave];
    entradas.push({
      claves: [clave],
      fecha: l.fecha ?? null,
      titulo: l.titulo ?? l.etiqueta,
      equipo: s?.equipo ?? null,
      lineas: lineas.filter(Boolean),
      acuerdos: a ? [...a.acuerdos, ...a.decisiones] : [],
    });
  }
  // Una sesión que ya pasó sin lectura (sin grabación, o cortada) cuenta si quien la llevó escribió algo.
  for (const s of o.sesiones) {
    if (usadas.has(s.id) || s.id === o.proximaId) continue;
    const notas = notasDeLaSesion(o.notas, s.id);
    if (!notas) continue;
    entradas.push({
      claves: [],
      fecha: s.fecha ?? null,
      titulo: s.titulo ?? s.evento?.titulo ?? "Sesión sin reunión",
      equipo: s.equipo ?? null,
      lineas: [`- Lo que anotó quien la llevó: ${notas}`],
      acuerdos: [],
    });
  }

  entradas.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
  /* La misma reunión puede llegar por Meet y por HubSpot (en un prospecto, a menos de dos horas: lectura.ts ›
     `mismaReunion`), y las dos lecturas traen lo mismo cubierto: va UNA entrada, sin líneas repetidas. */
  const juntas: Entrada[] = [];
  for (const e of entradas) {
    const prev = juntas[juntas.length - 1];
    if (prev && prev.claves.length && e.claves.length && prev.fecha && e.fecha && Math.abs(Date.parse(prev.fecha) - Date.parse(e.fecha)) < MISMA_REUNION_MS) {
      prev.claves.push(...e.claves);
      prev.equipo ??= e.equipo;
      prev.lineas = [...new Set([...prev.lineas, ...e.lineas])];
      prev.acuerdos = [...new Set([...prev.acuerdos, ...e.acuerdos])];
      continue;
    }
    juntas.push({ ...e, claves: [...e.claves], lineas: [...e.lineas], acuerdos: [...e.acuerdos] });
  }
  const salida: SesionDeLaHistoria[] = juntas.map((e) => ({
    clave: e.claves[0] ?? null,
    claves: e.claves,
    fecha: e.fecha,
    titulo: e.titulo,
    equipo: e.equipo,
    texto: e.lineas.join("\n"),
    acuerdos: e.acuerdos,
  }));
  // Las más nuevas pesan más: si no entran todas, se van las más viejas.
  let sesiones = salida.slice(-T.sesiones);
  while (sesiones.length > 1 && sesiones.reduce((n, x) => n + x.texto.length + x.titulo.length + 60, 0) > T.total) sesiones = sesiones.slice(1);

  const proxima = o.sesiones.find((s) => s.id === o.proximaId);
  return {
    sesiones,
    proxima: {
      objetivo: proxima?.objetivo?.trim() || null,
      explorar: (proxima?.explorar ?? []).map((t) => recortar(t, T.pregunta)),
      notas: proxima ? notasDeLaSesion(o.notas, proxima.id) : null,
      acordado: acordadoParaLaProxima(sesiones, proxima?.fecha ?? null),
    },
    reuniones: sesiones.flatMap((x) => x.claves.filter((k) => k.startsWith("meet:")).map((k) => k.slice("meet:".length))),
  };
}

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «la próxima sesión», «la reunión del día siguiente», «mañana», «el día siguiente». */
const HABLA_DE_LA_PROXIMA =
  /\b(?:pr[oó]xim[ao]s?|siguiente)\s+(?:sesi[oó]n|reuni[oó]n|encuentro)|\b(?:sesi[oó]n|reuni[oó]n)\s+(?:del\s+)?(?:d[ií]a\s+)?siguiente|\bma[ñn]ana\b|\bd[ií]a\s+siguiente\b/i;

/**
 * Lo que la ÚLTIMA sesión con minuta acordó para la siguiente: los acuerdos que hablan de la próxima sesión o reunión,
 * del día siguiente, de mañana o del día de la próxima («20-oct», «20 de octubre»). En CEMACO, el 19 oct: «La sesión del
 * día siguiente (20-oct) se enfocará en analizar cada canal de marketing y sus volumetrías». Es lo que alguien pidió
 * explorar: el asistente y la guía lo ponen primero.
 */
export function acordadoParaLaProxima(sesiones: readonly SesionDeLaHistoria[], fechaDeLaProxima: string | null): HistoriaDeLasSesiones["proxima"]["acordado"] {
  const ultima = [...sesiones].reverse().find((s) => s.acuerdos.length);
  if (!ultima) return null;
  const dia = fechaDeLaProxima ? Number(fechaDeLaProxima.slice(8, 10)) : NaN;
  const mes = fechaDeLaProxima ? MESES[Number(fechaDeLaProxima.slice(5, 7)) - 1] : undefined;
  const delDia = Number.isFinite(dia) && mes ? new RegExp(`\\b0?${dia}\\s*(?:-|/|de)?\\s*${mes}`, "i") : null;
  const lineas = ultima.acuerdos.filter((a) => HABLA_DE_LA_PROXIMA.test(a) || (delDia?.test(a) ?? false)).slice(0, TOPES_DE_LA_HISTORIA.acuerdos);
  if (!lineas.length) return null;
  return { de: `«${ultima.titulo}»${ultima.fecha ? ` del ${diaConAnio(ultima.fecha)}` : ""}`, lineas: lineas.map((x) => recortar(x, TOPES_DE_LA_HISTORIA.acuerdo)) };
}

/** Cuántas sesiones se saltaron por el tope, para decirlo y no fingir que es todo. */
function cuantasAfuera(h: HistoriaDeLasSesiones, total?: number): number {
  return total && total > h.sesiones.length ? total - h.sesiones.length : 0;
}

/** «con Marketing» o «con la empresa entera (sin equipo elegido)»: con quién fue cada sesión, en la línea de su título. */
export function conQuienFueLaSesion(equipo: ClaveDeEquipo | null): string {
  return equipo ? `con ${EQUIPOS[equipo].nombre}` : "con la empresa entera (sin equipo elegido)";
}

/**
 * Las sesiones que ya pasaron, en texto. «Ya respondido» no se vuelve a preguntar; «se llevó y no salió» sigue abierto.
 * Cada una dice con qué equipo fue (K11): el contraste entre equipos sale de ahí, no se deduce. Vacío si no hay ninguna.
 */
export function textoDeLasSesiones(h: HistoriaDeLasSesiones, o: { totalDeSesiones?: number } = {}): string {
  if (!h.sesiones.length) return "";
  const afuera = cuantasAfuera(h, o.totalDeSesiones);
  return [
    ...h.sesiones.map((s) => `### ${s.fecha ? diaConAnio(s.fecha) : "sin fecha"} · «${s.titulo}» · ${conQuienFueLaSesion(s.equipo)}\n${s.texto}`),
    ...(afuera ? [`(${afuera} sesiones más viejas no entran acá.)`] : []),
  ].join("\n\n");
}

/** Lo que escribió quien lleva la próxima sesión. Vacío si no escribió nada. */
export function textoDeLaProxima(p: HistoriaDeLasSesiones["proxima"], o: { conExplorar: boolean }): string {
  const l: string[] = [];
  if (p.acordado) {
    l.push(
      `Lo que se acordó para ella en ${p.acordado.de} (alguien lo pidió: va primero; si ninguna pregunta de la guía lo pregunta tal cual, falta):`,
      ...p.acordado.lineas.map((t) => `- ${t}`),
    );
  }
  if (p.objetivo) l.push(`Su objetivo (lo escribió quien la lleva; las preguntas lo sirven): «${p.objetivo}»`);
  if (o.conExplorar && p.explorar.length) l.push("Lo que se llevó para explorar en ella:", ...p.explorar.map((t) => `- ${t}`));
  if (p.notas) l.push(`Lo que anotó para ella: ${p.notas}`);
  return l.join("\n");
}
