/**
 * lib/mi-dia/inicio.ts — el inicio («Para ti») de cada equipo (ficha D, 2026-10-17; diseño «Para ti · Ventas y CSE»).
 * PURO y client-safe.
 *
 *   · qué inicio ve cada persona (`varianteDelInicio`, del registro de equipos);
 *   · la agenda como Google Calendar: dónde cae cada reunión en la cuadrícula y en qué columna si se pisan;
 *   · el hueco libre de hoy y la primera hora libre para «Agendar», siempre en horario laboral;
 *   · «Tu día, según Nexus»: dos o tres frases armadas con los datos, sin IA (cada dato es el de su lugar).
 */
import { equipoDeRol } from "@/lib/equipos/registro";
import {
  HORA_DEL_ALMUERZO,
  HORA_FIN_DE_LA_AGENDA,
  HORA_FIN_LABORAL,
  HORA_INICIO_DE_LA_AGENDA,
  HORA_INICIO_LABORAL,
  MAX_BLOQUES_POR_ESPACIO,
  MINUTOS_DE_UN_HUECO,
  MINUTOS_DEL_ALMUERZO,
} from "./constantes";

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

/**
 * Las reuniones de un día sacadas de la agenda de su semana, con el mismo corte de día que la grilla (`minutoDelDia`):
 * así «Para ti» no vuelve a leer el calendario de hoy cuando ya tiene la semana en pantalla (2026-10-18).
 */
export function reunionesDelDia<T extends { inicio: string }>(reuniones: readonly T[], dia: string): T[] {
  return reuniones.filter((r) => minutoDelDia(r.inicio).dia === dia);
}

export interface EventoParaLaGrilla {
  id: string;
  inicio: string;
  fin: string | null;
  /** Para reconocer el almuerzo que la persona marcó (`esAlmuerzo`). Sin título, no es el almuerzo. */
  titulo?: string | null;
}

/**
 * Lo que ocupa el tiempo en una agenda leída (2026-10-19): las reuniones y los eventos propios («Tenis», «Cita Médica»),
 * salvo lo que la persona marcó «disponible». Es lo que no pisa un espacio libre ni una hora que sugiere Nexus. Antes
 * eran solo las reuniones, y Nexus sugería espacio libre encima de los eventos sin invitados.
 */
export function ocupadoDeLaAgenda(a: {
  reuniones: readonly { id: string; inicio: string; fin: string | null; titulo: string; ocupa?: boolean }[];
  propios?: readonly { id: string; inicio: string; fin: string | null; titulo: string; ocupa: boolean }[];
}): EventoParaLaGrilla[] {
  return [...a.reuniones, ...(a.propios ?? [])]
    .filter((e) => e.ocupa !== false)
    .map((e) => ({ id: e.id, inicio: e.inicio, fin: e.fin, titulo: e.titulo }))
    .sort((x, y) => x.inicio.localeCompare(y.inicio));
}

/** ¿Es el almuerzo que la persona marcó en su calendario? */
export const esAlmuerzo = (titulo: string | null | undefined): boolean => /\b(almuerzo|almorzar|lunch|comida)\b/i.test(titulo ?? "");

/**
 * El almuerzo de un día, para lo que sugiere Nexus: si la persona tiene un evento de almuerzo ese día, ya está en lo
 * ocupado y no se agrega nada; si no, de 12:00 a 13:00 (lib/mi-dia/constantes.ts). Devuelve el rato, en minutos del día.
 */
export function almuerzoSupuesto(eventos: readonly EventoParaLaGrilla[], dia: string): { desde: number; hasta: number } | null {
  if (eventos.some((e) => esAlmuerzo(e.titulo) && minutoDelDia(e.inicio).dia === dia)) return null;
  return { desde: HORA_DEL_ALMUERZO * 60, hasta: HORA_DEL_ALMUERZO * 60 + MINUTOS_DEL_ALMUERZO };
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

/** ¿Es un día de trabajo? De lunes a viernes (`AAAA-MM-DD`). */
export function esDiaLaboral(dia: string): boolean {
  const d = new Date(`${dia}T00:00:00Z`).getUTCDay();
  return d >= 1 && d <= 5;
}

/**
 * El primer hueco de un día, de al menos `minimo` minutos, desde el minuto `desde` y dentro del horario laboral (8:00 a
 * 17:00, de lunes a viernes), sin pisar el almuerzo (`almuerzoSupuesto`). null = no hay. Las reuniones de otros días no
 * importan.
 */
function huecoDelDia(eventos: readonly EventoParaLaGrilla[], dia: string, desdeMinuto: number, minimo: number): { desde: number; hasta: number } | null {
  if (!esDiaLaboral(dia)) return null;
  const desde = Math.max(HORA_INICIO_LABORAL * 60, desdeMinuto);
  const hasta = HORA_FIN_LABORAL * 60;
  const ocupado = eventos
    .map((e) => {
      const a = minutoDelDia(e.inicio);
      const finMs = e.fin ? Date.parse(e.fin) : Date.parse(e.inicio) + 30 * 60_000;
      return a.dia === dia ? { desde: a.minuto, hasta: a.minuto + Math.round((finMs - Date.parse(e.inicio)) / 60_000) } : null;
    })
    .filter((x): x is { desde: number; hasta: number } => !!x);
  const almuerzo = almuerzoSupuesto(eventos, dia);
  if (almuerzo) ocupado.push(almuerzo);
  ocupado.sort((a, b) => a.desde - b.desde);
  let cursor = desde;
  for (const o of [...ocupado, { desde: hasta, hasta }]) {
    if (cursor >= hasta) break;
    const fin = Math.min(o.desde, hasta);
    if (fin - cursor >= minimo) return { desde: cursor, hasta: fin };
    cursor = Math.max(cursor, o.hasta);
  }
  return null;
}

/** «Ahora» redondeado al cuarto de hora siguiente, en minutos del día. */
const cuartoSiguiente = (minuto: number) => Math.ceil(minuto / 15) * 15;

/**
 * El primer hueco libre de hoy, de al menos una hora, entre ahora (redondeado al cuarto de hora siguiente) y el fin del
 * día de trabajo (17:00). Nunca en sábado ni domingo. null = no hay. Las reuniones son de UN día; las que ya terminaron
 * no importan.
 */
export function huecoLibre(eventos: readonly EventoParaLaGrilla[], dia: string, ahora: Date): { inicio: string; fin: string } | null {
  const hoy = minutoDelDia(ahora.toISOString());
  if (hoy.dia !== dia) return null;
  const h = huecoDelDia(eventos, dia, cuartoSiguiente(hoy.minuto), MINUTOS_DE_UN_HUECO);
  return h ? { inicio: instante(dia, h.desde), fin: instante(dia, h.hasta) } : null;
}

/** Cuántos huecos libres de hoy se pintan, como mucho. */
export const MAX_HUECOS_DEL_DIA = 4;

/**
 * Todos los huecos libres de hoy de al menos una hora, en horario laboral, desde ahora (al cuarto siguiente). Como
 * mucho `MAX_HUECOS_DEL_DIA`. El primero es el de `huecoLibre`.
 */
export function huecosLibres(eventos: readonly EventoParaLaGrilla[], dia: string, ahora: Date): { inicio: string; fin: string }[] {
  const hoy = minutoDelDia(ahora.toISOString());
  if (hoy.dia !== dia) return [];
  const out: { inicio: string; fin: string }[] = [];
  let desde = cuartoSiguiente(hoy.minuto);
  while (out.length < MAX_HUECOS_DEL_DIA) {
    const h = huecoDelDia(eventos, dia, desde, MINUTOS_DE_UN_HUECO);
    if (!h) break;
    out.push({ inicio: instante(dia, h.desde), fin: instante(dia, h.hasta) });
    desde = h.hasta;
  }
  return out;
}

/** Cuántos espacios libres se pintan, como mucho, en un día que todavía no llegó (hoy van `MAX_HUECOS_DEL_DIA`). */
export const MAX_ESPACIOS_OTRO_DIA = 2;

/**
 * Los espacios libres de los días que se ven en la agenda (2026-10-19, prueba 8): los de hoy desde ahora, y los de los
 * días que vienen desde las 8:00, de al menos una hora y en horario laboral. Un día que ya pasó no tiene. Sin esto, el
 * espacio libre solo existía hoy: un fin de semana (la agenda muestra la semana que viene) no había ninguno que tocar.
 */
export function espaciosLibres(eventos: readonly EventoParaLaGrilla[], dias: readonly string[], hoyISO: string, ahora: Date): { inicio: string; fin: string }[] {
  const out: { inicio: string; fin: string }[] = [];
  for (const dia of dias) {
    if (dia < hoyISO) continue;
    if (dia === hoyISO) {
      out.push(...huecosLibres(eventos, dia, ahora));
      continue;
    }
    let desde = HORA_INICIO_LABORAL * 60;
    for (let n = 0; n < MAX_ESPACIOS_OTRO_DIA; n++) {
      const h = huecoDelDia(eventos, dia, desde, MINUTOS_DE_UN_HUECO);
      if (!h) break;
      out.push({ inicio: instante(dia, h.desde), fin: instante(dia, h.hasta) });
      desde = h.hasta;
    }
  }
  return out;
}

// ── Con qué avanzar en un hueco ──────────────────────────────────────────────────────────────

/** Una tarea tuya abierta que puede ir a un hueco. Fechas `AAAA-MM-DD`. */
export interface TareaParaUnHueco {
  id: string;
  numero: number;
  titulo: string;
  prioridad: string;
  venceEl: string | null;
  semana: string | null;
  /** null = sin estimar: cabe en cualquier hueco y se agenda una hora. */
  minutosEstimados: number | null;
  clientId: string | null;
  empresa: string | null;
}

export interface ConQueAvanzar {
  tarea: TareaParaUnHueco;
  /** Cuánto dura el bloque que se propone (lo estimado, o una hora; nunca más que el hueco). */
  minutos: number;
  /** Por qué es esa: «vencida», «vence hoy», «prioridad alta», «de esta semana». */
  porque: string;
}

const PESO_DE_PRIORIDAD: Record<string, number> = { alta: 0, media: 1, baja: 2 };

/** Lo más importante primero: lo vencido, lo que vence hoy, la prioridad, lo que vence antes y lo más viejo. */
export function ordenarParaAvanzar(tareas: readonly TareaParaUnHueco[], hoyISO: string): TareaParaUnHueco[] {
  const grado = (t: TareaParaUnHueco) => (t.venceEl && t.venceEl < hoyISO ? 0 : t.venceEl === hoyISO ? 1 : 2);
  return [...tareas].sort(
    (a, b) =>
      grado(a) - grado(b) ||
      (PESO_DE_PRIORIDAD[a.prioridad] ?? 1) - (PESO_DE_PRIORIDAD[b.prioridad] ?? 1) ||
      (a.venceEl ?? "9999").localeCompare(b.venceEl ?? "9999") ||
      (a.semana ?? "9999").localeCompare(b.semana ?? "9999") ||
      a.numero - b.numero,
  );
}

export function porqueAvanzar(t: TareaParaUnHueco, hoyISO: string): string {
  if (t.venceEl && t.venceEl < hoyISO) return "está vencida";
  if (t.venceEl === hoyISO) return "vence hoy";
  if (t.prioridad === "alta") return "es de prioridad alta";
  if (t.venceEl) return "es la que vence antes";
  return "es de tu semana";
}

/**
 * Con qué avanzar en cada hueco: a cada uno (en orden de hora) la tarea más importante que todavía no se sugirió y que
 * CABE (lo estimado no pasa del hueco; sin estimar, cabe). Sin IA: el orden es el de `ordenarParaAvanzar`. Devuelve
 * por el inicio del hueco; un hueco sin tarea que quepa no tiene entrada.
 */
export function conQueAvanzar(
  tareas: readonly TareaParaUnHueco[],
  huecos: readonly { inicio: string; fin: string }[],
  hoyISO: string,
): Map<string, ConQueAvanzar> {
  const out = new Map<string, ConQueAvanzar>();
  const libres = ordenarParaAvanzar(tareas, hoyISO);
  const usadas = new Set<string>();
  for (const h of [...huecos].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const largo = Math.round((Date.parse(h.fin) - Date.parse(h.inicio)) / 60_000);
    const t = libres.find((x) => !usadas.has(x.id) && (x.minutosEstimados == null || x.minutosEstimados <= largo));
    if (!t) continue;
    usadas.add(t.id);
    out.set(h.inicio, { tarea: t, minutos: Math.min(largo, t.minutosEstimados ?? MINUTOS_DE_UN_HUECO), porque: porqueAvanzar(t, hoyISO) });
  }
  return out;
}

/** Un bloque que Nexus sugiere en la agenda: del tamaño de la tarea, dentro de un espacio libre. */
export interface BloqueSugerido {
  /** El bloque que se pinta. */
  inicio: string;
  fin: string;
  /** El espacio libre entero donde cae (para el panel: «Tienes libre de … a …»). */
  espacio: { inicio: string; fin: string };
  /** La tarea; null = ninguna cabe: el bloque es la primera hora del espacio, «Espacio libre». */
  avanzar: ConQueAvanzar | null;
}

/**
 * Los bloques que sugiere Nexus en los espacios libres (2026-10-19): en cada espacio, en orden de hora, la tarea más
 * importante que todavía no se sugirió y cabe en lo que queda, en un bloque de SU tamaño (lo estimado o una hora), una
 * detrás de otra y como mucho `MAX_BLOQUES_POR_ESPACIO`. Nunca el espacio entero como un solo bloque: Elías vio «Avanza
 * T-100 · Libre 12:00–16:00», cuatro horas para una tarea de una. Un espacio donde no cabe ninguna tarea se pinta como
 * «Espacio libre» en su primera hora.
 */
export function bloquesSugeridos(
  tareas: readonly TareaParaUnHueco[],
  espacios: readonly { inicio: string; fin: string }[],
  hoyISO: string,
  o: { maxPorEspacio?: number } = {},
): BloqueSugerido[] {
  const max = o.maxPorEspacio ?? MAX_BLOQUES_POR_ESPACIO;
  const libres = ordenarParaAvanzar(tareas, hoyISO);
  const usadas = new Set<string>();
  const out: BloqueSugerido[] = [];
  for (const h of [...espacios].sort((a, b) => a.inicio.localeCompare(b.inicio))) {
    const espacio = { inicio: h.inicio, fin: h.fin };
    const fin = Date.parse(h.fin);
    let cursor = Date.parse(h.inicio);
    let puestos = 0;
    while (puestos < max) {
      const queda = Math.round((fin - cursor) / 60_000);
      const minutosDe = (t: TareaParaUnHueco) => t.minutosEstimados ?? Math.min(MINUTOS_DE_UN_HUECO, queda);
      const t = libres.find((x) => !usadas.has(x.id) && minutosDe(x) > 0 && minutosDe(x) <= queda);
      if (!t) break;
      usadas.add(t.id);
      const minutos = minutosDe(t);
      out.push({
        inicio: new Date(cursor).toISOString(),
        fin: new Date(cursor + minutos * 60_000).toISOString(),
        espacio,
        avanzar: { tarea: t, minutos, porque: porqueAvanzar(t, hoyISO) },
      });
      cursor += minutos * 60_000;
      puestos++;
    }
    if (puestos === 0) {
      const minutos = Math.min(MINUTOS_DE_UN_HUECO, Math.round((fin - cursor) / 60_000));
      out.push({ inicio: h.inicio, fin: new Date(Date.parse(h.inicio) + minutos * 60_000).toISOString(), espacio, avanzar: null });
    }
  }
  return out;
}

/** Cuántos días hacia adelante busca Nexus un hueco para «Agendar» o «+ Crear evento». */
export const DIAS_PARA_BUSCAR_UN_HUECO = 14;

/**
 * La primera hora libre en horario laboral para un evento de `minutos`: hoy desde ahora (al cuarto siguiente) y, si no
 * hay, los días de trabajo que siguen desde las 8:00. Las reuniones que se pasan son las que se conocen (la agenda
 * cargada y los borradores); un día que no está cargado se toma libre. El evento dura `minutos`, no el hueco entero.
 */
export function primerHuecoLaboral(
  eventos: readonly EventoParaLaGrilla[],
  ahora: Date,
  o: { minutos?: number; dias?: number } = {},
): { inicio: string; fin: string } {
  const minutos = o.minutos ?? MINUTOS_DE_UN_HUECO;
  const hoy = minutoDelDia(ahora.toISOString());
  for (let i = 0; i < (o.dias ?? DIAS_PARA_BUSCAR_UN_HUECO); i++) {
    const dia = sumarDiasISO(hoy.dia, i);
    const h = huecoDelDia(eventos, dia, i === 0 ? cuartoSiguiente(hoy.minuto) : 0, minutos);
    if (h) return { inicio: instante(dia, h.desde), fin: instante(dia, h.desde + minutos) };
  }
  // Sin lugar en dos semanas (no pasa con una agenda real): el próximo día de trabajo a las 8:00.
  let dia = sumarDiasISO(hoy.dia, 1);
  while (!esDiaLaboral(dia)) dia = sumarDiasISO(dia, 1);
  return { inicio: instante(dia, HORA_INICIO_LABORAL * 60), fin: instante(dia, HORA_INICIO_LABORAL * 60 + minutos) };
}

const sumarDiasISO = (dia: string, n: number) => new Date(Date.parse(`${dia}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

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
      { t: d.cuentasSinAccion.length === 1 ? " no tiene siguiente paso: ni tarea con fecha ni reunión." : " no tienen siguiente paso: ni tarea con fecha ni reunión." },
    ]);
  } else if (d.delAgente > 0) {
    frases.push([{ t: "Nexus dejó " }, { t: d.delAgente === 1 ? "1 cosa" : `${d.delAgente} cosas`, fuerte: true }, { t: " para que decidas." }]);
  }
  if (d.hueco && frases.length < 3) frases.push([{ t: `Tienes libre desde las ${d.hueco.hora}.` }]);
  return frases.slice(0, 3);
}

const sinPuntoFinal = (t: string) => t.trim().replace(/[.\s]+$/, "");
