/**
 * lib/exploraciones/lectura.ts — qué reuniones son de la exploración, cuáles le faltan leer al agente y
 * cuándo lee solo. PURO.
 *
 * Desde la etapa A (2026-10-09, «la exploración son sus sesiones») una reunión es de la exploración SOLO
 * si es la de una de sus sesiones:
 *   · en un PROSPECTO, cada reunión con la empresa entra sola como sesión (`candidataAutomatica`), menos
 *     las de puertas adentro, las instancias de una serie y las que alguien sacó (`contenido.fuera`);
 *   · en un CLIENTE (la preventa de un cliente o la exploración de un proyecto) nada entra solo: cuenta
 *     la reunión que alguien unió a una sesión (elegida, su evento del calendario o, sin evento, la del
 *     mismo día).
 *
 * Dos fuentes de reuniones: las de Meet (con su transcripción o sus notas de Gemini, en la base) y las
 * de HubSpot (el notetaker deja su resumen en la reunión). De Meet se sabe cuándo llega la
 * transcripción, así que el agente la lee SOLO (lib/sessions/post-process.ts lo dispara,
 * `exploracionesQueLeenLaReunion` decide en cuáles): en un cliente, solo la que se unió a una sesión de
 * forma explícita. De HubSpot no hay aviso: el lienzo las mira al abrirse (reuniones-de-hubspot.ts).
 */
import { esReunionDePuertasAdentro } from "@/lib/sessions/candidatas-internas";
import type { LoLeidoDeHubspot } from "./lo-leido";

export interface ReunionSinLeer {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  /** De dónde viene: una reunión de Meet, una de HubSpot o algo que el vendedor sumó a mano. */
  origen: "meet" | "hubspot" | "documento";
}

/** Hasta cuántos días después de la reunión el agente la lee solo. Más vieja, ya no es noticia. */
export const DIAS_PARA_LEER_SOLA = 14;

/** Cuánto antes del alta cuenta una reunión de Meet como «sin leer» (las de antes, preparar las vio). */
export const DIAS_ANTES_DEL_ALTA = 30;

const DIA = 24 * 60 * 60 * 1000;

/** ¿HubSpot dice que la reunión no ocurrió? Se canceló, se reagendó o el cliente no se presentó. */
export const reunionQueNoOcurrio = (r: string | undefined) => r === "cancelada" || r === "reagendada" || r === "no_se_presento";

/** Cuántas reuniones de HubSpot que ya pasaron suma cada lectura de HubSpot a la foto (las más recientes). */
export const HECHAS_POR_LECTURA = 12;

/**
 * Desde cuándo cuenta una reunión en la preventa (Elías, 2026-10-08). Desde un mes antes del alta,
 * todas. Las de antes, solo en un PROSPECTO y si estuvo alguien de Ventas: en un prospecto son la
 * historia de la venta (Polaris empezó con HubSpot en julio y la preventa se abrió en octubre); en una
 * empresa que ya es cliente son las capacitaciones y los kickoffs de lo que ya compró (Cicadex y Grupo
 * Servica llegaron a mostrar 16 y 22 de esas como sesiones).
 */
export interface CorteDeLaPreventa {
  /** Un mes antes del alta (ms). */
  desde: number;
  esProspecto: boolean;
  /** Los correos que cuentan como Ventas (lib/handoff/sales-presence.ts), en minúscula. */
  ventas: ReadonlySet<string>;
}

/** El de una exploración de proyecto: todas sus reuniones cuentan. */
export const SIN_CORTE: CorteDeLaPreventa = { desde: 0, esProspecto: false, ventas: new Set() };

/** ¿Estuvo alguien de Ventas? (los correos de la gente de Smarteam que estuvo en la reunión). */
export function conVentas(correos: readonly string[] | undefined, ventas: ReadonlySet<string>): boolean {
  return (correos ?? []).some((c) => ventas.has(c.trim().toLowerCase()));
}

/** ¿La reunión de esa fecha (ms) cuenta en la preventa? `correos`: quiénes de Smarteam estuvieron. */
export function cuentaEnLaPreventa(fecha: number, correos: readonly string[] | undefined, corte: CorteDeLaPreventa): boolean {
  if (!Number.isFinite(fecha)) return false;
  return fecha >= corte.desde || (corte.esProspecto && conVentas(correos, corte.ventas));
}

/**
 * Las reuniones de HubSpot que YA PASARON, se hicieron y dejaron qué leer (el resumen o las notas del
 * grabador de HubSpot), las que cuentan según el corte (Elías, 2026-10-07: «debería ser como reunión de
 * forma automática»). Antes la foto solo guardaba las AGENDADAS: una reunión que ya había pasado la
 * primera vez que se miró HubSpot —la del 28 sep de CreditForce, grabada con HubSpot y sin
 * transcripción en Meet— nunca aparecía como reunión, aunque el agente la leyera.
 */
export function reunionesHechasDeHubspot(
  material: readonly { id: string; tipo: string; ts: number; titulo: string; texto: string; resultado?: string; internos?: readonly string[] }[],
  o: { corte: CorteDeLaPreventa; ahora: Date },
): { id: string; titulo: string; inicio: string; conVentas?: true }[] {
  return material
    .filter((a) => a.tipo === "MEETING" && a.ts > 0 && cuentaEnLaPreventa(a.ts, a.internos, o.corte) && a.ts <= o.ahora.getTime() && a.texto.trim() && !reunionQueNoOcurrio(a.resultado))
    .sort((a, b) => b.ts - a.ts)
    .slice(0, HECHAS_POR_LECTURA)
    .map((a) => ({ id: a.id, titulo: a.titulo || "Reunión", inicio: new Date(a.ts).toISOString(), ...(conVentas(a.internos, o.corte.ventas) ? { conVentas: true as const } : {}) }));
}

/**
 * Las reuniones de HubSpot que el agente tiene que leer solo, como las de Meet: ya pasaron, son de
 * después del alta, de hace a lo sumo `DIAS_PARA_LEER_SOLA` días, y nadie las leyó. `soloConVentas`: en
 * la preventa de una empresa que ya es cliente (2026-10-08), solo las que tuvieron a alguien de Ventas;
 * sin eso, cada reunión de un proyecto en curso dispararía una corrida.
 *
 * Desde la etapa A (2026-10-09): `ligadas` (la preventa de un cliente) deja solo las unidas a una sesión
 * —reemplaza a `soloConVentas`: en un cliente nada entra ni se lee solo si no es la reunión de una sesión,
 * y una sesión unida no depende de la fecha del alta—; `fuera` (un prospecto) saca las que alguien sacó de
 * la exploración (`hubspot:<id>`).
 */
export function hechasParaLeerSolas(
  hechas: readonly { id: string; inicio: string; conVentas?: boolean }[],
  o: { creadaEn: Date; leidas: readonly string[]; ahora: Date; soloConVentas?: boolean; ligadas?: ReadonlySet<string>; fuera?: ReadonlySet<string> },
): string[] {
  return hechas
    .filter((h) => !o.soloConVentas || h.conVentas)
    .filter((h) => !o.ligadas || o.ligadas.has(h.id))
    .filter((h) => !o.fuera || !o.fuera.has(`hubspot:${h.id}`))
    .filter((h) =>
      debeLeerSola({ fechaDeLaReunion: new Date(h.inicio), creadaEn: o.ligadas ? new Date(0) : o.creadaEn, sesionId: h.id, leidas: o.leidas, ahora: o.ahora }),
    )
    .map((h) => h.id);
}

// ── Qué reuniones son de la exploración (etapa A, 2026-10-09) ─────────────────

/** Cuánto se espera la transcripción de una reunión que ya ocurrió antes de decir «terminó sin transcripción ni notas». */
export const HORAS_ESPERANDO_LA_TRANSCRIPCION = 6;

/**
 * ¿Es una instancia de una serie? Google arma el id de cada fecha de un evento que se repite con
 * `_AAAAMMDD` (todo el día) o `_AAAAMMDDTHHMMSSZ` al final. Sirve con el id del evento y con el de la
 * fila de Meet (`gmeet_<id del evento>`). Las de una serie no entran solas a la exploración de un
 * prospecto: una reunión semanal de seguimiento no es una sesión de exploración. Se agregan a mano.
 */
export function esInstanciaDeUnaSerie(eventId: string | null | undefined): boolean {
  return !!eventId && /_\d{8}(T\d{6}Z)?$/.test(eventId);
}

/** El prefijo de la fila de Meet de un evento (lib/google/meet-sync-cambios.ts › `idDeSesion`). */
const PREFIJO_DE_MEET = "gmeet_";

/** ¿Esta reunión es la de ese evento del calendario? Por su `googleEventId` o por su id `gmeet_<evento>`. */
export function coincideConElEvento(eventoId: string, r: { id: string; eventoId?: string | null }): boolean {
  return (!!r.eventoId && r.eventoId === eventoId) || r.id === `${PREFIJO_DE_MEET}${eventoId}`;
}

/**
 * ¿La sesión tiene esta reunión de Meet unida de forma EXPLÍCITA? Elegida a mano (`reunion`) o por su
 * evento del calendario (`evento`). La ligadura por fecha no cuenta: es una adivinanza, y la lectura sola
 * cuesta (se hace solo con lo que unió una persona).
 */
export function sesionUnidaALaReunion(
  s: { reunion?: { id: string; origen: string; inicio?: string }; evento?: { id: string } },
  r: { id: string; eventoId?: string | null; fecha?: Date | string },
): boolean {
  if (s.reunion) {
    if (s.reunion.origen === "meet") return s.reunion.id === r.id;
    /* La gemela de Meet de una reunión de HubSpot unida a mano: la que empieza a menos de dos horas de la
       hora que guardó el servidor (guia.ts › `gemelaDeMeet`). Sin esa hora no se adivina. */
    if (s.reunion.origen !== "hubspot" || !s.reunion.inicio || !r.fecha) return false;
    const fecha = typeof r.fecha === "string" ? r.fecha : r.fecha.toISOString();
    return !Number.isNaN(Date.parse(fecha)) && mismaReunion(fecha, s.reunion.inicio);
  }
  return !!s.evento && coincideConElEvento(s.evento.id, r);
}

/** Lo que hace falta de una reunión de Meet para saber si entra sola a la exploración de un prospecto. */
export interface ReunionCandidata {
  id: string;
  /** ms. */
  date: number;
  /** Quiénes estuvieron (con el organizador). */
  participants: readonly string[];
  /** El id del evento del calendario, si se sabe (si no, se mira el id de la fila). */
  eventoId?: string | null;
}

/**
 * ¿La reunión entra SOLA como sesión de la exploración? Solo en un PROSPECTO (`corte.esProspecto`): que
 * cuente según el corte de la preventa, que no sea de puertas adentro (todos de Smarteam), que no sea la
 * instancia de una serie y que nadie la haya sacado (`fuera`, con claves `meet:<id>`). En un cliente nada
 * entra solo.
 */
export function candidataAutomatica(
  r: ReunionCandidata,
  o: { corte: CorteDeLaPreventa; internos: ReadonlySet<string>; fuera: ReadonlySet<string> },
): boolean {
  if (!o.corte.esProspecto) return false;
  if (!cuentaEnLaPreventa(r.date, r.participants, o.corte)) return false;
  if (o.fuera.has(`meet:${r.id}`)) return false;
  if (esReunionDePuertasAdentro({ participants: [...r.participants] }, o.internos)) return false;
  if (esInstanciaDeUnaSerie(r.eventoId ?? r.id)) return false;
  return true;
}

/** Lo que hace falta de una exploración para decidir si lee sola una reunión que acaba de llegar. */
export interface ExploracionParaLeerSola {
  id: string;
  /** La exploración de un proyecto (Customer Success). */
  delProyecto: boolean;
  /** La empresa es un prospecto (solo importa en la preventa). */
  esProspecto: boolean;
  creadaEn: Date;
  sesiones: readonly { reunion?: { id: string; origen: string; inicio?: string }; evento?: { id: string } }[];
  /** `contenido.fuera`: claves `origen:id`. */
  fuera: readonly string[];
  /** Las reuniones de Meet que el agente ya leyó con su transcripción (`propuesta.leidas.sesiones`). */
  leidas: readonly string[];
  /** La preventa se sigue vendiendo (agente.ts › `seVendeTodavia`). No se mira en un proyecto. */
  seVende: boolean;
}

/**
 * En qué exploraciones lee el agente SOLO una reunión de Meet que acaba de llegar (la dispara el
 * post-proceso: agente.ts › `leerReunionNueva`). Devuelve sus ids, en el orden recibido.
 *   · Una exploración de PROYECTO, o la preventa de un CLIENTE: solo si la reunión está unida de forma
 *     explícita a una de sus sesiones (`sesionUnidaALaReunion`), de hace a lo sumo `DIAS_PARA_LEER_SOLA`
 *     días y sin leer. La fecha del alta no limita a una sesión unida. La preventa, además, mientras se vende.
 *   · La preventa de un PROSPECTO: la regla de siempre (de después del alta, reciente, sin leer, mientras
 *     se vende) más que no esté en `fuera`, que no sea de puertas adentro y que no sea de una serie. Una
 *     reunión unida a una sesión se lee aunque sea de antes del alta.
 */
export function exploracionesQueLeenLaReunion(
  exps: readonly ExploracionParaLeerSola[],
  r: { id: string; eventoId?: string | null; fecha: Date; participants: readonly string[] },
  o: { ahora: Date; internos: ReadonlySet<string> },
): string[] {
  const interna = esReunionDePuertasAdentro({ participants: [...r.participants] }, o.internos);
  return exps
    .filter((e) => {
      // La gemela de una de HubSpot se liga por la hora: una de puertas adentro a esa hora no es ella.
      const unida = e.sesiones.some((s) => sesionUnidaALaReunion(s, r) && !(s.reunion?.origen === "hubspot" && interna));
      const reciente = (creadaEn: Date) => debeLeerSola({ fechaDeLaReunion: r.fecha, creadaEn, sesionId: r.id, leidas: e.leidas, ahora: o.ahora });
      if (e.delProyecto) return unida && reciente(new Date(0));
      if (!e.seVende) return false;
      if (unida) return reciente(new Date(0));
      if (!e.esProspecto) return false;
      if (e.fuera.includes(`meet:${r.id}`)) return false;
      if (interna) return false;
      if (esInstanciaDeUnaSerie(r.eventoId ?? r.id)) return false;
      return reciente(e.creadaEn);
    })
    .map((e) => e.id);
}

/**
 * El texto de las notas de Gemini de una reunión (Meet guarda su resumen en `summary`: `overview` como
 * texto o lista, `sections` con título y contenido, y `action_items`). "" si no hay. Lo lee el agente
 * cuando la reunión todavía no tiene transcripción (lib/sessions/transcript.ts tiene la misma forma).
 */
export function textoDeLasNotasDeGemini(summary: unknown): string {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) return "";
  const s = summary as { overview?: unknown; sections?: unknown; action_items?: unknown };
  const comoTexto = (v: unknown): string =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && !!x.trim()).join("\n") : typeof v === "string" ? v : "";
  const partes: string[] = [];
  const resumen = comoTexto(s.overview).trim();
  if (resumen) partes.push(resumen);
  if (Array.isArray(s.sections)) {
    for (const sec of s.sections) {
      if (!sec || typeof sec !== "object") continue;
      const t = (sec as { title?: unknown }).title;
      const c = (sec as { content?: unknown }).content;
      if (typeof c === "string" && c.trim()) partes.push(typeof t === "string" && t.trim() ? `${t.trim()}:\n${c.trim()}` : c.trim());
    }
  }
  const compromisos = comoTexto(s.action_items).trim();
  if (compromisos) partes.push(`Próximos pasos:\n${compromisos}`);
  return partes.join("\n\n");
}

/**
 * ¿La preparación tiene que seguir leyendo? Sí si quedó sin leer una reunión de Meet con conversación
 * (una que casi no la tuvo, `corta`, no: pregunta qué pasó) o algo que el vendedor sumó a mano. Las de
 * HubSpot no cuentan: su actividad ya la miró la preparación, y las que pasaron se avisan «sin leer».
 */
export function hayQueLeerAlPreparar(reuniones: readonly { origen: string; leida: boolean; corta?: unknown; legado?: boolean; texto?: string }[]): boolean {
  // Lo de antes que no es sesión (`legado`) y una reunión sin transcripción ni notas no cuentan (etapa A).
  return reuniones.some((r) => !r.leida && !r.legado && ((r.origen === "meet" && !r.corta && r.texto !== "nada") || r.origen === "documento"));
}

/**
 * ¿El agente lee sola esta reunión de Meet? Solo si es de DESPUÉS del alta (las de antes las miró al
 * preparar y quedan avisadas como «sin leer»), tiene a lo sumo 14 días y todavía no se leyó.
 */
export function debeLeerSola(o: { fechaDeLaReunion: Date; creadaEn: Date; sesionId: string; leidas: readonly string[]; ahora: Date }): boolean {
  const t = o.fechaDeLaReunion.getTime();
  if (Number.isNaN(t) || t > o.ahora.getTime()) return false;
  if (t < o.creadaEn.getTime()) return false;
  if (o.ahora.getTime() - t > DIAS_PARA_LEER_SOLA * DIA) return false;
  return !o.leidas.includes(o.sesionId);
}

type Agenda = LoLeidoDeHubspot["agenda"];

/** Cuántas reuniones que ya pasaron conserva la foto de una lectura a la otra (las más recientes). */
export const PASADAS_QUE_CONSERVA_LA_FOTO = 30;

/**
 * La agenda de la foto NUEVA (Elías, 2026-10-05: «una reunión de HubSpot sin resumen se sigue avisando
 * como pendiente de leer»). HubSpot da como agenda solo las reuniones futuras; las que ya pasaron
 * estaban en la foto anterior y se CONSERVAN, leídas o no: las que no se leyeron se siguen avisando
 * «sin leer» (el notetaker todavía no dejó su resumen, o nadie apretó «Leer») y las leídas se listan
 * como leídas. Antes la foto nueva reemplazaba a la anterior y «Volver a preparar» las borraba sin
 * haberlas leído. Las que HubSpot dice que no ocurrieron (se canceló, se reagendó, no se presentó) no
 * se conservan: no hay nada que leer.
 */
export function agendaRenovada(o: { anterior: Agenda; nueva: Agenda; noOcurrieron?: readonly string[]; ahora: Date }): Agenda {
  const porFecha = (a: { inicio: string }, b: { inicio: string }) => a.inicio.localeCompare(b.inicio);
  const enLaNueva = new Set(o.nueva.map((a) => a.id));
  const noOcurrieron = new Set(o.noOcurrieron ?? []);
  const pasadas = o.anterior
    .filter((a) => Date.parse(a.inicio) <= o.ahora.getTime() && !enLaNueva.has(a.id) && !noOcurrieron.has(a.id))
    .sort(porFecha)
    .slice(-PASADAS_QUE_CONSERVA_LA_FOTO);
  return [...pasadas, ...o.nueva].sort(porFecha);
}

/** ¿Dos reuniones empiezan a menos de dos horas? Entonces son la misma, vista desde Meet y desde HubSpot. */
export function mismaReunion(a: string, b: string): boolean {
  return Math.abs(Date.parse(a) - Date.parse(b)) < 2 * 60 * 60 * 1000;
}

/**
 * Las reuniones de HubSpot que estaban en la agenda y ya pasaron, LEÍDAS O NO (cada una dice si el
 * agente ya leyó lo que dejó el notetaker). Si la misma reunión también está en Meet (empieza a menos
 * de dos horas de una de Meet), cuenta una vez: la de Meet, que trae la transcripción.
 */
export function reunionesDeHubspotQueYaPasaron(
  agenda: Agenda,
  leidasDeHubspot: readonly string[],
  deMeet: readonly { fecha: string }[],
  ahora: Date,
): (ReunionSinLeer & { origen: "hubspot"; leida: boolean })[] {
  const leidas = new Set(leidasDeHubspot);
  return agenda
    .filter((a) => Date.parse(a.inicio) <= ahora.getTime())
    .filter((a) => !deMeet.some((m) => mismaReunion(m.fecha, a.inicio)))
    .map((a) => ({ id: a.id, titulo: a.titulo, fecha: a.inicio, origen: "hubspot" as const, leida: leidas.has(a.id) }));
}

/**
 * Las reuniones de HubSpot que el agente leyó sin que estuvieran en la agenda (ya habían pasado la
 * primera vez que miró HubSpot): salen de su lectura, que guarda la fecha y el título. Sin esto, la
 * primera reunión de CreditForce (28 sep, solo en HubSpot: Meet no tiene su transcripción) no aparecía
 * en Exploración y la «Sesión 1» era la llamada de 6 minutos del 2 oct. Una que ya se lista (por la
 * agenda) o que también está en Meet, con su transcripción, cuenta una vez. Solo desde `desde` (un mes
 * antes del alta, como las de Meet): el 2026-10-08 Cicadex y Grupo Servica, que ya eran clientes,
 * tenían leídas como sesiones de la preventa las capacitaciones de 2023 y 2024.
 */
export function reunionesLeidasDeHubspot(
  lecturas: Readonly<Record<string, { fecha?: string; titulo?: string; etiqueta: string }>>,
  yaEstan: readonly { id: string; origen: string }[],
  deMeet: readonly { fecha: string }[],
  desde: number,
): (ReunionSinLeer & { origen: "hubspot"; leida: true })[] {
  return Object.entries(lecturas).flatMap(([clave, l]) => {
    if (!clave.startsWith("hubspot:") || !l.fecha || Number.isNaN(Date.parse(l.fecha))) return [];
    if (Date.parse(l.fecha) < desde) return [];
    const id = clave.slice("hubspot:".length);
    if (yaEstan.some((r) => r.origen === "hubspot" && r.id === id)) return [];
    if (deMeet.some((m) => mismaReunion(m.fecha, l.fecha!))) return [];
    return [{ id, titulo: l.titulo ?? l.etiqueta, fecha: l.fecha, origen: "hubspot" as const, leida: true as const }];
  });
}

/**
 * La actividad de HubSpot que lee «Leer»: la que no se leyó, desde un mes antes del alta, como las
 * reuniones de Meet; de antes, solo una reunión que cuenta según el corte (la de un prospecto con
 * alguien de Ventas). Lo demás de antes lo mira «Preparar» como contexto, sin marcarlo. Sin el corte, la
 * primera lectura de una empresa que ya era cliente leía sus 25 actividades más recientes aunque fueran
 * de 2023 (Grupo Servica, 2026-10-08), y cada reunión leída se volvía una sesión de la preventa.
 */
export function actividadQueSeLee<T extends { id: string; ts: number; tipo?: string; internos?: readonly string[] }>(
  material: readonly T[],
  o: { yaLeidas: ReadonlySet<string>; corte: CorteDeLaPreventa },
): T[] {
  return material.filter((a) => !o.yaLeidas.has(a.id) && (a.tipo === "MEETING" ? cuentaEnLaPreventa(a.ts, a.internos, o.corte) : a.ts >= o.corte.desde));
}

/**
 * Las reuniones de HubSpot que ya pasaron, para «Una que ya pasó» del selector de la preventa: las de la
 * agenda que ya pasaron y las que el agente leyó sin que estuvieran en la agenda. Sin esto, en la preventa
 * de un cliente una reunión grabada solo en HubSpot (la del 28 sep de CreditForce) no se podía agregar
 * como sesión. La más nueva primero; cada una dice si el agente ya la leyó.
 */
export function reunionesDeHubspotParaElegir(
  agenda: Agenda,
  lecturas: Readonly<Record<string, { fecha?: string; titulo?: string; etiqueta: string }>>,
  leidasDeHubspot: readonly string[],
  ahora: Date,
): { id: string; titulo: string; inicio: string; leida: boolean }[] {
  const leidas = new Set(leidasDeHubspot);
  const deLaAgenda = agenda
    .filter((a) => Date.parse(a.inicio) <= ahora.getTime())
    .map((a) => ({ id: a.id, titulo: a.titulo, inicio: a.inicio, leida: leidas.has(a.id) || !!lecturas[`hubspot:${a.id}`] }));
  const yaEstan = new Set(deLaAgenda.map((a) => a.id));
  const sinAgenda = Object.entries(lecturas).flatMap(([clave, l]) => {
    if (!clave.startsWith("hubspot:") || !l.fecha || Number.isNaN(Date.parse(l.fecha)) || Date.parse(l.fecha) > ahora.getTime()) return [];
    const id = clave.slice("hubspot:".length);
    if (yaEstan.has(id)) return [];
    return [{ id, titulo: l.titulo ?? l.etiqueta, inicio: l.fecha, leida: true }];
  });
  return [...deLaAgenda, ...sinAgenda].sort((a, b) => b.inicio.localeCompare(a.inicio));
}

/** Las de HubSpot que ya pasaron y el agente todavía no leyó: se avisan «sin leer». */
export function agendadasQueYaPasaron(
  agenda: Agenda,
  leidasDeHubspot: readonly string[],
  deMeet: readonly { fecha: string }[],
  ahora: Date,
): ReunionSinLeer[] {
  return reunionesDeHubspotQueYaPasaron(agenda, leidasDeHubspot, deMeet, ahora)
    .filter((r) => !r.leida)
    .map((r) => ({ id: r.id, titulo: r.titulo, fecha: r.fecha, origen: r.origen }));
}
