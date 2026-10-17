/**
 * lib/mi-dia/inicio.ts — el inicio («Para ti») de cada equipo (ficha D, 2026-10-17; diseño «Para ti · Ventas y CSE»).
 * PURO y client-safe.
 *
 *   · qué inicio ve cada persona (`varianteDelInicio`, del registro de equipos);
 *   · la agenda como Google Calendar: dónde cae cada reunión en la cuadrícula y en qué columna si se pisan;
 *   · el hueco libre que Nexus sugiere para avanzar algo;
 *   · «Tu día, según Nexus»: dos o tres frases armadas con los datos, sin IA (cada dato es el de su lugar).
 */
import { equipoDeRol } from "@/lib/equipos/registro";
import { HORA_FIN_DE_LA_AGENDA, HORA_INICIO_DE_LA_AGENDA, MINUTOS_DE_UN_HUECO } from "./constantes";

export type VarianteDelInicio = "ventas" | "cse" | "csl" | "dev" | "marketing" | "general";

/**
 * El inicio de cada persona. Lo dice su equipo (lib/equipos/registro.ts); la CSL ve toda la cartera. Dirección no es
 * un equipo: si vende (tiene negocios o una meta), el de Ventas; si lidera Customer Success, el de la CSL; si no, el
 * general.
 */
export function varianteDelInicio(o: { rol: string; frentes: readonly string[]; tieneVentas: boolean }): VarianteDelInicio {
  if (o.rol === "CSL") return "csl";
  const equipo = equipoDeRol(o.rol);
  if (equipo) return equipo.paraTi.inicio;
  if (o.tieneVentas) return "ventas";
  if (o.frentes.includes("LIDERAR_CS")) return "csl";
  return "general";
}

// ── La cuadrícula ────────────────────────────────────────────────────────────────────────────

const HORA_CR_MS = 6 * 3_600_000;

/** Los minutos desde la medianoche de Costa Rica de un instante, y su día. */
export function minutoDelDia(iso: string): { dia: string; minuto: number } {
  const d = new Date(Date.parse(iso) - HORA_CR_MS);
  return { dia: d.toISOString().slice(0, 10), minuto: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

export interface EventoParaLaGrilla {
  id: string;
  inicio: string;
  fin: string | null;
}

export interface EventoEnLaGrilla {
  id: string;
  /** Minutos desde el inicio de la grilla. */
  arriba: number;
  /** Minutos de alto (como mínimo 20, para que se pueda tocar). */
  alto: number;
  /** 0 = el primero; con reuniones que se pisan, cada una en su columna. */
  columna: number;
  columnas: number;
}

export interface Grilla {
  /** La primera y la última hora que se pintan. */
  desdeHora: number;
  hastaHora: number;
  eventos: EventoEnLaGrilla[];
}

const MIN_ALTO = 20;

/**
 * Dónde cae cada reunión de UN día. La grilla va de 8:00 a 18:00 y se estira si hay reuniones antes o después. Las que
 * se pisan se reparten en columnas, como en Google Calendar.
 */
export function grillaDelDia(eventos: readonly EventoParaLaGrilla[], dia: string): Grilla {
  const delDia = eventos
    .map((e) => {
      const a = minutoDelDia(e.inicio);
      if (a.dia !== dia) return null;
      const finMs = e.fin ? Date.parse(e.fin) : Date.parse(e.inicio) + 30 * 60_000;
      const duracion = Math.max(15, Math.round((finMs - Date.parse(e.inicio)) / 60_000));
      return { id: e.id, desde: a.minuto, hasta: Math.min(24 * 60, a.minuto + duracion) };
    })
    .filter((x): x is { id: string; desde: number; hasta: number } => !!x)
    .sort((a, b) => a.desde - b.desde || b.hasta - a.hasta);

  const desdeHora = Math.min(HORA_INICIO_DE_LA_AGENDA, ...delDia.map((e) => Math.floor(e.desde / 60)));
  const hastaHora = Math.max(HORA_FIN_DE_LA_AGENDA, ...delDia.map((e) => Math.ceil(e.hasta / 60)));
  const base = desdeHora * 60;

  // Grupos de reuniones que se pisan; dentro de cada grupo, la primera columna libre.
  const salida: EventoEnLaGrilla[] = [];
  let grupo: { id: string; desde: number; hasta: number; columna: number }[] = [];
  let finDelGrupo = -1;
  const cerrar = () => {
    const columnas = Math.max(1, ...grupo.map((g) => g.columna + 1));
    for (const g of grupo) {
      salida.push({ id: g.id, arriba: g.desde - base, alto: Math.max(MIN_ALTO, g.hasta - g.desde), columna: g.columna, columnas });
    }
    grupo = [];
  };
  for (const e of delDia) {
    if (grupo.length && e.desde >= finDelGrupo) cerrar();
    const ocupadas = new Set(grupo.filter((g) => g.hasta > e.desde).map((g) => g.columna));
    let columna = 0;
    while (ocupadas.has(columna)) columna++;
    grupo.push({ ...e, columna });
    finDelGrupo = Math.max(finDelGrupo, e.hasta);
  }
  if (grupo.length) cerrar();
  return { desdeHora, hastaHora, eventos: salida };
}

/** La línea de «ahora», en minutos desde el inicio de la grilla. null = no es hoy o está fuera de la grilla. */
export function lineaDeAhora(grilla: Pick<Grilla, "desdeHora" | "hastaHora">, dia: string, ahora: Date): number | null {
  const a = minutoDelDia(ahora.toISOString());
  if (a.dia !== dia) return null;
  const m = a.minuto - grilla.desdeHora * 60;
  return m < 0 || m > (grilla.hastaHora - grilla.desdeHora) * 60 ? null : m;
}

/**
 * El primer hueco libre de hoy, de al menos una hora, entre ahora (redondeado al cuarto de hora siguiente) y el fin del
 * día de trabajo. null = no hay. Las reuniones son de UN día; las que ya terminaron no importan.
 */
export function huecoLibre(eventos: readonly EventoParaLaGrilla[], dia: string, ahora: Date): { inicio: string; fin: string } | null {
  const hoy = minutoDelDia(ahora.toISOString());
  if (hoy.dia !== dia) return null;
  const desde = Math.max(HORA_INICIO_DE_LA_AGENDA * 60, Math.ceil(hoy.minuto / 15) * 15);
  const hasta = HORA_FIN_DE_LA_AGENDA * 60;
  const ocupado = eventos
    .map((e) => {
      const a = minutoDelDia(e.inicio);
      const finMs = e.fin ? Date.parse(e.fin) : Date.parse(e.inicio) + 30 * 60_000;
      return a.dia === dia ? { desde: a.minuto, hasta: a.minuto + Math.round((finMs - Date.parse(e.inicio)) / 60_000) } : null;
    })
    .filter((x): x is { desde: number; hasta: number } => !!x)
    .sort((a, b) => a.desde - b.desde);
  let cursor = desde;
  for (const o of [...ocupado, { desde: hasta, hasta }]) {
    if (o.desde - cursor >= MINUTOS_DE_UN_HUECO && cursor < hasta) {
      const fin = Math.min(o.desde, hasta);
      if (fin - cursor >= MINUTOS_DE_UN_HUECO) return { inicio: instante(dia, cursor), fin: instante(dia, fin) };
    }
    cursor = Math.max(cursor, o.hasta);
  }
  return null;
}

/** El instante UTC de un minuto del día en Costa Rica. */
export function instante(dia: string, minuto: number): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + HORA_CR_MS + minuto * 60_000).toISOString();
}

/** «15:00» de un instante, en Costa Rica. */
export function horaCR(iso: string): string {
  return new Date(Date.parse(iso) - HORA_CR_MS).toISOString().slice(11, 16).replace(/^0/, "");
}

// ── «Tu día, según Nexus» ────────────────────────────────────────────────────────────────────

/** Un pedazo de frase; `fuerte` va en negrita. */
export interface PedazoDeFrase {
  t: string;
  fuerte?: boolean;
}

export interface DatosParaElResumen {
  /** La próxima reunión con un cliente de hoy (todavía no empezó). */
  proxima: { hora: string; titulo: string; empresa: string } | null;
  /** Lo primero de «Lo que importa hoy». */
  primero: { titulo: string } | null;
  /** Cuántas cosas dejó un agente para que la persona decida. */
  delAgente: number;
  /** Las cuentas que esa persona lleva y no tienen acción o reunión. */
  cuentasSinAccion: string[];
  /** El hueco libre de hoy. */
  hueco: { hora: string } | null;
}

const listar = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Las frases de «Tu día, según Nexus». Vacío = nada que decir (no se muestra la franja). */
export function resumenDelDia(d: DatosParaElResumen): PedazoDeFrase[][] {
  const frases: PedazoDeFrase[][] = [];
  if (d.proxima) {
    frases.push([{ t: `A las ${d.proxima.hora} tienes «${d.proxima.titulo}» con ` }, { t: d.proxima.empresa, fuerte: true }, { t: "." }]);
  }
  if (d.primero) frases.push([{ t: "Lo primero de tu lista: " }, { t: sinPuntoFinal(d.primero.titulo), fuerte: true }, { t: "." }]);
  if (d.cuentasSinAccion.length) {
    const nombres = d.cuentasSinAccion.slice(0, 3);
    const mas = d.cuentasSinAccion.length - nombres.length;
    frases.push([
      { t: listar(mas > 0 ? [...nombres, `${mas} más`] : nombres), fuerte: true },
      { t: d.cuentasSinAccion.length === 1 ? " no tiene su acción o su reunión de la semana." : " no tienen su acción o su reunión de la semana." },
    ]);
  } else if (d.delAgente > 0) {
    frases.push([{ t: "Nexus dejó " }, { t: d.delAgente === 1 ? "1 cosa" : `${d.delAgente} cosas`, fuerte: true }, { t: " para que decidas." }]);
  }
  if (d.hueco && frases.length < 3) frases.push([{ t: `Tienes un hueco libre a las ${d.hueco.hora} para avanzar.` }]);
  return frases.slice(0, 3);
}

const sinPuntoFinal = (t: string) => t.trim().replace(/[.\s]+$/, "");
