/**
 * lib/exploraciones/guia.ts — la guía de la PRÓXIMA reunión y las sesiones que planea el vendedor. PURO.
 *
 * Pedido de Elías (2026-10-01), tras tres sesiones con HubSpot y con el equipo: Ventas llega a la
 * exploración sin prepararse y termina vendiendo licencias en vez de diagnosticar. Lo que necesita
 * es llegar sabiendo qué preguntar, cómo profundizar y cómo manejar las objeciones. Por eso:
 *
 *   - Ya no hay «Reunión 1» y «Reunión 2» fijas: el vendedor agrega las sesiones que necesite, y la
 *     guía es siempre la de la PRÓXIMA.
 *   - La guía apunta a lo que todavía falta: las tarjetas vacías del resumen (el marco de
 *     calificación) y hasta 4 dimensiones sin evidencia (`enfoqueDeLaGuia`). El código elige cuáles;
 *     el agente escribe las preguntas, tres repreguntas por cada una (la siguiente pregunta lógica:
 *     ir al dolor real y cuantificarlo) y las objeciones adaptadas a la empresa.
 *   - Sin la guía del agente igual hay guía: las preguntas de base de cada tarjeta, la pregunta de
 *     cada dimensión (sale de la escala, nunca de este archivo) y las objeciones de base.
 *
 * La guía es material de preparación, no un dato del cliente: vive en la mitad del agente
 * (`propuesta.guia`), se muestra directo, sin «usar», y NUNCA llega a la propuesta ni al handoff.
 *
 * La exploración son sus SESIONES (etapa A, 2026-10-09): una reunión es de la exploración solo si es la
 * de una sesión (`reunionDeLaSesion`: la elegida, la de su evento del calendario o, sin evento, la del
 * mismo día). En un prospecto, cada reunión con la empresa entra sola como sesión (se calcula al leer,
 * sin escribirse: `pestanasDeSesiones` con `automaticas`) y se saca con `contenido.fuera`. En un cliente
 * o un proyecto nada entra solo: se agrega con «+ Agregar sesión». Lo que no es sesión no es pestaña, no
 * se lee y su lectura no llega a los documentos (`lecturasDeLaExploracion`).
 */
import { LETRAS, type Letra } from "@/lib/escala/documento/tipos";
import { CASILLAS_DEL_RESUMEN, type ClaveDeCasilla } from "./casillas";
import { definicionEnElMarco, esTarjeta, MARCO_DE_VENTA, type ClaveDeMarco, type Marco } from "./marco";
import type { EscalaDelLienzo } from "./escala-del-lienzo";
import { aFecha, hoyEnCostaRica } from "./fechas";
import { coincideConElEvento, HORAS_ESPERANDO_LA_TRANSCRIPCION, mismaReunion } from "./lectura";
import type { SaberDelCliente } from "./lo-que-ya-sabemos";
import { planDeLaGuia, preguntaDeRespaldo, REPREGUNTAS_DEL_PASO, repiteLoSabido, type PasoDeLaPregunta, type PreguntaPlaneada } from "./plan-de-la-guia";
import { sinCitaAdelante, type AjustesDeLaGuia, type OrigenDelAjuste } from "./ajustes-de-la-guia";
import { esTemaDeEquipo, leerTemaDeEquipo, nombreDelTemaDeEquipo, type ClaveDeEquipo } from "./equipos";

// ── Las sesiones ──────────────────────────────────────────────────────────────

/** De dónde viene una reunión: Google Meet, HubSpot (el notetaker) o sumada a mano. */
export type OrigenDeReunion = "meet" | "hubspot" | "documento";

/**
 * Qué pasó con una sesión cuya reunión no dejó qué leer (rediseño de las sesiones, 2026-10-07): se
 * hizo por otro canal (teléfono, WhatsApp: lo que se anota en «En vivo» es lo que lee el agente), se
 * cortó y hay que reagendarla (lo que tenía preparado pasa a la próxima), o no se hizo (sale de la
 * cuenta de sesiones; la reunión sigue en Meet).
 */
export const RESULTADOS_DE_LA_SESION = ["otroCanal", "cortada", "noSeHizo"] as const;
export type ResultadoDeLaSesion = (typeof RESULTADOS_DE_LA_SESION)[number];

/**
 * El evento del calendario al que se unió una sesión antes de que ocurra (etapa A, 2026-10-09). Cuando
 * la reunión ocurre, la sesión se liga a su fila de Meet (`gmeet_<id>` o `googleEventId`) o, si no, a la
 * reunión de la empresa que empieza a menos de dos horas. Si la mueven en el calendario, la sesión toma
 * la fecha nueva; si la cancelan, la sesión y su guía siguen (lib/exploraciones/calendario.ts).
 */
export interface EventoDeLaSesion {
  /** El id de la instancia en Google Calendar (en una serie, el de esa fecha). */
  id: string;
  /** El calendario donde se leyó (el correo de quien la unió): ahí se vuelve a mirar. */
  calendario: string;
  /** ISO. */
  inicio: string;
  /** ISO. */
  fin?: string;
  /** Cómo se llama en el calendario: el título de la sesión mientras nadie le ponga otro. */
  titulo?: string;
  /** Es la instancia de una serie: se usa solo esa fecha. */
  serie?: true;
  /** La cancelaron en el calendario. */
  cancelada?: true;
  /** Cuándo se miró por última vez en el calendario (ISO). */
  revisadoEn?: string;
}

/** Una sesión que planea el vendedor. La fecha es `AAAA-MM-DD`; sin fecha, todavía no se agendó. */
export interface SesionPlaneada {
  id: string;
  titulo?: string;
  /** El día (en Costa Rica). Con `evento`, es el día de `evento.inicio`. */
  fecha?: string;
  /** La marcó hecha el vendedor. Una con fecha pasada también cuenta como hecha. */
  hecha?: boolean;
  /**
   * La reunión de esta sesión, elegida a mano. Sin ella, la de su evento o la del mismo día
   * (`reunionDeLaSesion`). Pedido de Elías (2026-10-03): «por fecha, y se corrige a mano».
   * `inicio` (ISO): la hora de una reunión de HubSpot, la guarda el servidor al unirla. Con ella se sabe si
   * todavía no ocurre y, cuando ocurre y queda grabada en Meet, se liga su gemela de Meet (la de HubSpot
   * deja de listarse: la misma reunión cuenta una vez).
   */
  reunion?: { id: string; origen: OrigenDeReunion; inicio?: string };
  /** El evento del calendario al que se unió (puede ser una reunión que todavía no ocurre). */
  evento?: EventoDeLaSesion;
  /** Lo que quedó de una sesión anterior para explorar en esta (lo que se dijo y nadie siguió). */
  explorar?: string[];
  /** De qué sesión viene cada punto de `explorar` (su id): la guía dice «Quedó abierto en la sesión N». */
  explorarDe?: Record<string, string>;
  /**
   * A qué apunta cada punto de `explorar`, si se sabe al llevarlo (una pregunta planeada que no se
   * hizo: su tarjeta o su dimensión). La guía lo muestra con esa letra o ese número, no con un «¿».
   */
  explorarPara?: Record<string, string>;
  /** El objetivo de la sesión, confirmado por el vendedor (lo sugiere el agente con la guía). */
  objetivo?: string;
  /**
   * K11 (2026-10-28): el objetivo lo escribió (o lo reescribió) una persona; no es el que sugirió el agente y se usó tal
   * cual. Solo así cuenta para sugerir el equipo de la sesión (equipos.ts › `sugerirEquipoDeLaSesion`).
   */
  objetivoPropio?: boolean;
  /** El objetivo que sugirió el agente y el vendedor descartó: no se vuelve a ofrecer el mismo. */
  objetivoDescartado?: string;
  /** Qué pasó con ella, cuando su reunión no dejó qué leer. */
  resultado?: ResultadoDeLaSesion;
  /** Al marcarla cortada: a qué apuntaba lo que tenía preparado (tarjetas y dimensiones). Pasa a la próxima. */
  pasaron?: string[];
  /** Las preguntas que el vendedor marcó hechas durante la reunión (a qué apuntan: `metas`, `1.3`). */
  hechas?: string[];
  /**
   * Lo que el vendedor decidió sobre la guía de esta sesión (2026-10-18, ajustes-de-la-guia.ts): sus preguntas, las de
   * la guía que reescribió o sacó. Vive acá (lo de las personas) y no en la guía: sobrevive a «Actualizar la guía».
   */
  ajustesDeLaGuia?: AjustesDeLaGuia;
  /**
   * Con qué equipo del cliente es la sesión (2026-10-23, equipos.ts): la guía pregunta como se le pregunta a ese equipo y
   * por las dimensiones de su área. Sin él, la sesión es con la empresa entera. Lo elige una persona (Nexus lo sugiere).
   */
  equipo?: ClaveDeEquipo;
  /**
   * K5 (2026-10-27, asociar.ts): cuándo Nexus unió SOLO esta sesión a su reunión (sin duda: el job `exploraciones-asociar`).
   * La pantalla lo dice («Nexus la unió») para que se pueda deshacer. Sin esto, la unió una persona.
   */
  asociadaSola?: string;
}

/** Hasta cuántas sesiones tiene una exploración (subió de 12 a 20 en la etapa A: ahora se materializan más). */
export const MAX_SESIONES = 20;

/** El id de una sesión nueva (`s-` y letras y números, como el esquema): lo usan el servidor y la pantalla. */
export const nuevoIdDeSesion = (): string => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
/** Cuántos puntos se llevan a una sesión: más no entran en una reunión. */
export const MAX_PARA_EXPLORAR = 10;

/** Qué texto dejó una reunión de Meet: su transcripción, solo las notas de Gemini o nada (todavía). */
export type TextoDeLaReunion = "transcripcion" | "notas" | "nada";

/** Una reunión de la exploración, leída o no: lo que se liga a una sesión. */
export interface ReunionDeLaExploracion {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  origen: OrigenDeReunion;
  leida: boolean;
  /**
   * La transcripción casi no tiene conversación (se cortó, o el notetaker grabó solo el saludo): no
   * hay qué leer. `minutos` es dónde termina, si la transcripción lo dice.
   */
  corta?: { minutos: number | null };
  /** El id del evento del calendario (`googleEventId`), para ligarla a la sesión que se unió a ese evento. */
  eventoId?: string;
  /** Solo en las de Meet: qué texto dejó. Sin el dato (las de HubSpot y lo sumado a mano), tiene texto. */
  texto?: TextoDeLaReunion;
  /**
   * En un cliente o un proyecto: se leyó o se eligió ANTES de la etapa A y no es la reunión de ninguna
   * sesión. No es de la exploración: va a «Fuera de la exploración» y vuelve a ser sesión con un clic.
   */
  legado?: true;
  /**
   * Solo estuvo gente de Smarteam. No se liga sola a una sesión (por la fecha ni por la cercanía a un
   * evento): lo dicho entre el equipo no es palabra del cliente. Se puede unir eligiéndola a mano.
   */
  puertasAdentro?: true;
}

/** La clave de una reunión (`meet:<id>`, `hubspot:<id>`, `documento:<id>`): la de `lecturas` y la de `contenido.fuera`. */
export function claveDeReunion(r: { origen: string; id: string }): string {
  return `${r.origen}:${r.id}`;
}

/** Hasta cuántos caracteres se mira una transcripción para saber si tiene conversación. */
export const LARGO_DE_UNA_TRANSCRIPCION_CORTA = 3000;
/** Menos de esto dicho por personas (sin el notetaker) no alcanza para leer nada. */
const CONVERSACION_MINIMA = 400;

/**
 * ¿La transcripción casi no tiene conversación? (CreditForce, 2 oct: «Esta reunión está siendo
 * grabada. — Sí. Ok.» y «La transcripción finalizó después de 00:06:26»). Cuenta lo que dicen las
 * personas, sin el notetaker ni el texto fijo de Meet. null = tiene conversación.
 */
export function transcripcionCorta(transcript: string): { minutos: number | null } | null {
  if (transcript.length >= LARGO_DE_UNA_TRANSCRIPCION_CORTA) return null;
  const dicho = transcript
    .split("\n")
    .map((l) => /^([^:\n]{2,60}):\s+(.+)$/.exec(l.trim()))
    .filter((m): m is RegExpExecArray => !!m && !/notetaker|transcripci[oó]n/i.test(m[1]))
    .reduce((n, m) => n + m[2].trim().length, 0);
  if (dicho >= CONVERSACION_MINIMA) return null;
  const fin = /finaliz[oó] despu[eé]s de (\d{1,2}):(\d{2}):(\d{2})/i.exec(transcript);
  return { minutos: fin ? Number(fin[1]) * 60 + Number(fin[2]) + (Number(fin[3]) >= 30 ? 1 : 0) : null };
}

/** El día de Costa Rica (`AAAA-MM-DD`) de una fecha ISO; una de solo día es ese día (no la medianoche UTC). */
function diaDe(iso: string): string {
  return hoyEnCostaRica(aFecha(iso));
}

/** Cómo se ligó una sesión con su reunión: la eligió una persona, es la de su evento del calendario, o es la del mismo día. */
export type ComoSeLigo = "elegida" | "evento" | "fecha";

export interface ReunionLigada {
  reunion: ReunionDeLaExploracion;
  como: ComoSeLigo;
}

/**
 * La gemela de Meet de una reunión de HubSpot elegida a mano: cuando la reunión también quedó grabada en
 * Meet, la de HubSpot deja de listarse (cuenta una vez, la de Meet) y la sesión no puede quedarse sin
 * reunión. Con la hora que guardó el servidor, la de Meet que empieza a menos de dos horas; sin ella (una
 * unida antes de que se guardara), la única de Meet de ese día. Nunca una de puertas adentro.
 */
function gemelaDeMeet(s: SesionPlaneada, reuniones: readonly ReunionDeLaExploracion[]): ReunionDeLaExploracion | undefined {
  if (s.reunion?.origen !== "hubspot") return undefined;
  const deMeet = reuniones.filter((x) => x.origen === "meet" && !x.puertasAdentro);
  const inicio = s.reunion.inicio;
  if (inicio) return deMeet.find((x) => mismaReunion(x.fecha, inicio));
  if (!s.fecha) return undefined;
  const delDia = deMeet.filter((x) => diaDe(x.fecha) === s.fecha);
  return delDia.length === 1 ? delDia[0] : undefined;
}

/**
 * La reunión de una sesión, en este orden: la elegida a mano (`reunion`; si es de HubSpot y quedó grabada
 * en Meet, su gemela de Meet); la de su evento del calendario (`evento`: la fila de Meet de ese evento o,
 * si no está, una de la empresa que empieza a menos de dos horas, salvo que la hayan cancelado); y, sin
 * evento, la del mismo día. Una sesión con evento NO cae a la del mismo día: el evento dice cuál es.
 * Lo que se liga solo (por el evento o por la fecha) nunca es lo que alguien sacó de la exploración
 * (`fuera`) ni una reunión de puertas adentro. Lo sumado a mano se liga por la fecha solo si ese día no
 * le queda ninguna reunión (la minuta de una sesión que no quedó grabada); si no, va a «Fuentes manuales».
 */
export function reunionDeLaSesion(
  s: SesionPlaneada,
  reuniones: readonly ReunionDeLaExploracion[],
  fuera: ReadonlySet<string> = new Set(),
): ReunionLigada | null {
  if (s.reunion) {
    const r = reuniones.find((x) => x.id === s.reunion?.id && x.origen === s.reunion?.origen) ?? gemelaDeMeet(s, reuniones);
    return r ? { reunion: r, como: "elegida" } : null;
  }
  const libres = reuniones.filter((x) => x.origen !== "documento" && !x.puertasAdentro && !fuera.has(claveDeReunion(x)));
  const evento = s.evento;
  if (evento) {
    const r =
      reuniones.find((x) => x.origen === "meet" && coincideConElEvento(evento.id, x)) ??
      (evento.cancelada ? undefined : libres.find((x) => mismaReunion(x.fecha, evento.inicio)));
    return r ? { reunion: r, como: "evento" } : null;
  }
  if (!s.fecha) return null;
  const r = libres.find((x) => diaDe(x.fecha) === s.fecha) ?? reuniones.find((x) => x.origen === "documento" && diaDe(x.fecha) === s.fecha);
  return r ? { reunion: r, como: "fecha" } : null;
}

/**
 * Liga cada sesión con su reunión: primero las elegidas a mano y después, entre las que nadie eligió, las
 * de su evento o del mismo día (dos sesiones no se quedan con la misma reunión). Devuelve, por índice de
 * sesión, su reunión, y las claves de las reuniones que ya son de alguna sesión.
 */
function ligarSesiones(
  sesiones: readonly SesionPlaneada[],
  reuniones: readonly ReunionDeLaExploracion[],
  fuera: ReadonlySet<string>,
): { ligadas: Map<number, ReunionLigada>; usadas: Set<string> } {
  const ligadas = new Map<number, ReunionLigada>();
  const usadas = new Set<string>();
  sesiones.forEach((s, i) => {
    if (!s.reunion) return;
    const l = reunionDeLaSesion(s, reuniones, fuera);
    if (l) {
      ligadas.set(i, l);
      usadas.add(claveDeReunion(l.reunion));
    }
  });
  sesiones.forEach((s, i) => {
    if (s.reunion) return;
    const l = reunionDeLaSesion(
      s,
      reuniones.filter((r) => !usadas.has(claveDeReunion(r))),
      fuera,
    );
    if (l) {
      ligadas.set(i, l);
      usadas.add(claveDeReunion(l.reunion));
    }
  });
  return { ligadas, usadas };
}

/**
 * La guía con que se planeó una reunión: la guardada para su sesión o la viva, solo si se armó ANTES
 * de la reunión (`fechaDeLaReunion`, ISO). Una armada después no planeó nada: comparar la reunión
 * contra ella (o contra lo que falta hoy) le cuenta como «no se preguntó» algo que nadie llevó. Era lo
 * que pasaba con la primera reunión de CreditForce (28 sep), leída contra una guía del 1 oct.
 */
export function guiaDeAntesDeLaReunion(
  propuesta: { guia: GuiaDeLaSesion | null; guias: Record<string, GuiaDeLaSesion> },
  sesionId: string | null,
  fechaDeLaReunion: string,
): GuiaDeLaSesion | null {
  const antes = (g: GuiaDeLaSesion | null | undefined) => (g && g.en < fechaDeLaReunion ? g : null);
  return antes(sesionId ? propuesta.guias[sesionId] : null) ?? antes(propuesta.guia);
}

/**
 * Una pestaña de Exploración: una sesión planeada o, en un prospecto, una reunión que entró sola como
 * sesión (sin escribirse: `sesion` es null hasta que alguien le escribe algo).
 */
export interface PestanaDeSesion {
  /** El id de la sesión, o `r-<origen>-<id>` para una sesión automática de un prospecto. */
  clave: string;
  numero: number;
  sesion: SesionPlaneada | null;
  reunion: ReunionDeLaExploracion | null;
  fecha: string | null;
  hecha: boolean;
  /** El vendedor dijo que no se hizo: no cuenta como sesión (no lleva número) y se pinta apagada. */
  noSeHizo?: boolean;
  /** Cómo se ligó su reunión (la pantalla dice «ligada por fecha · cambiar» cuando es por fecha). */
  ligadaPor?: ComoSeLigo;
}

/** Cómo se nombra una pestaña: «Sesión 3», o «No se hizo» si no cuenta. */
export function nombreDeLaPestana(p: Pick<PestanaDeSesion, "numero" | "noSeHizo">): string {
  return p.noSeHizo ? "No se hizo" : `Sesión ${p.numero}`;
}

/** Hasta cuántas letras lleva el título de una sesión (el esquema de `SesionPlaneada.titulo`). */
export const MAX_TITULO_DE_LA_SESION = 120;

/**
 * El título de una sesión (Elías, 2026-10-08: «que tomen el nombre de la sesión de calendar y se les
 * pueda cambiar el nombre»): el que le puso el vendedor o, si no, el de su reunión, que es el del evento
 * del calendario (en Meet o en HubSpot). null = ni uno ni otro: se llama «Sesión N».
 */
export function tituloDeLaSesion(p: Pick<PestanaDeSesion, "sesion" | "reunion">): string | null {
  return p.sesion?.titulo?.trim() || p.reunion?.titulo?.trim() || p.sesion?.evento?.titulo?.trim() || null;
}

/**
 * El título que se guarda al renombrar: vacío o igual al del calendario no se guarda (`undefined`), así
 * la sesión sigue el nombre de su reunión si cambia.
 */
export function tituloAGuardar(escrito: string, delCalendario: string | null | undefined): string | undefined {
  const t = escrito.trim().replace(/\s+/g, " ").slice(0, MAX_TITULO_DE_LA_SESION);
  if (!t || t === (delCalendario ?? "").trim()) return undefined;
  return t;
}

/**
 * Cómo se arman las pestañas: `automaticas` (un prospecto: cada reunión con la empresa que no está en
 * una sesión entra sola como sesión) y `fuera` (las claves `origen:id` que alguien sacó de la
 * exploración). Sin opciones, nada entra solo (un cliente o un proyecto).
 */
export interface OpcionesDeLasPestanas {
  automaticas: boolean;
  fuera: ReadonlySet<string>;
}

const SIN_AUTOMATICAS: OpcionesDeLasPestanas = { automaticas: false, fuera: new Set() };

/** Las opciones de las pestañas desde lo que trae la pantalla (`automaticas` y `contenido.fuera`). */
export function opcionesDeLasPestanas(automaticas: boolean, fuera: readonly string[]): OpcionesDeLasPestanas {
  return { automaticas, fuera: new Set(fuera) };
}

/**
 * Las pestañas, en orden de fecha: las sesiones (con su reunión) y, solo en un prospecto, las reuniones
 * que entraron solas como sesión (las que no están en una sesión, ni en `fuera`, ni son lo sumado a mano,
 * que va a «Fuentes manuales»). En un cliente o un proyecto una reunión que no está en una sesión no es
 * pestaña (Noelito: ninguna «Sesión N» fantasma). Las sin fecha van al final, en el orden en que se
 * agregaron.
 */
export function pestanasDeSesiones(
  sesiones: readonly SesionPlaneada[],
  reuniones: readonly ReunionDeLaExploracion[],
  hoy: string,
  o: OpcionesDeLasPestanas = SIN_AUTOMATICAS,
): PestanaDeSesion[] {
  const { ligadas, usadas } = ligarSesiones(sesiones, reuniones, o.fuera);
  const sueltas = o.automaticas
    ? reuniones.filter((r) => !usadas.has(claveDeReunion(r)) && r.origen !== "documento" && !r.legado && !o.fuera.has(claveDeReunion(r)))
    : [];
  const todas = [
    ...sesiones.map((s, i) => {
      const l = ligadas.get(i) ?? null;
      const r = l?.reunion ?? null;
      return {
        clave: s.id,
        sesion: s,
        reunion: r,
        fecha: s.fecha ?? (r ? diaDe(r.fecha) : null),
        hecha: sesionHecha(s, hoy) || !!r,
        orden: i,
        ligadaPor: l?.como,
      };
    }),
    ...sueltas.map((r, i) => ({
      clave: `r-${r.origen}-${r.id}`,
      sesion: null,
      reunion: r,
      fecha: diaDe(r.fecha),
      hecha: true,
      orden: sesiones.length + i,
      ligadaPor: undefined as ComoSeLigo | undefined,
    })),
  ];
  todas.sort((a, b) => (a.fecha && b.fecha ? a.fecha.localeCompare(b.fecha) || a.orden - b.orden : a.fecha ? -1 : b.fecha ? 1 : a.orden - b.orden));
  // La que no se hizo no lleva número: las demás se cuentan sin ella.
  let n = 0;
  return todas.map((p) => {
    const noSeHizo = p.sesion?.resultado === "noSeHizo";
    if (!noSeHizo) n++;
    return {
      clave: p.clave,
      sesion: p.sesion,
      reunion: p.reunion,
      fecha: p.fecha,
      hecha: p.hecha,
      numero: noSeHizo ? 0 : n,
      ...(noSeHizo ? { noSeHizo: true } : {}),
      ...(p.ligadaPor ? { ligadaPor: p.ligadaPor } : {}),
    };
  });
}

/**
 * «Fuera de la exploración»: lo que alguna vez fue de la exploración y no es la reunión de ninguna sesión.
 * En un prospecto, lo que alguien sacó (`fuera`); en un cliente o un proyecto, lo que se leyó o se eligió
 * antes de la etapa A (`legado`). No es una lista general de reuniones: las demás las tiene la memoria.
 * La más nueva primero.
 */
export function reunionesFueraDeLaExploracion(
  sesiones: readonly SesionPlaneada[],
  reuniones: readonly ReunionDeLaExploracion[],
  o: OpcionesDeLasPestanas,
): ReunionDeLaExploracion[] {
  const { usadas } = ligarSesiones(sesiones, reuniones, o.fuera);
  return reuniones
    .filter((r) => !usadas.has(claveDeReunion(r)) && r.origen !== "documento")
    .filter((r) => (o.automaticas ? o.fuera.has(claveDeReunion(r)) : !!r.legado))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}

/**
 * Las claves de las reuniones que son de alguna sesión: la ligada a cada una (con las reuniones que se
 * conocen) y, aunque no esté en la lista, la que la sesión nombra (la elegida, o la fila de Meet de su
 * evento). Lo usan los documentos y la guía para leer solo lo de las sesiones.
 */
export function clavesDeLasSesiones(sesiones: readonly SesionPlaneada[], reuniones: readonly ReunionDeLaExploracion[]): Set<string> {
  const { usadas } = ligarSesiones(sesiones, reuniones, new Set());
  for (const s of sesiones) {
    if (s.reunion) usadas.add(claveDeReunion(s.reunion));
    else if (s.evento) usadas.add(`meet:gmeet_${s.evento.id}`);
  }
  return usadas;
}

/**
 * Lo que el agente leyó de cada reunión, solo de las que son de la exploración (decisión del 2026-10-08:
 * no se borra nada, se deja de leer). En un prospecto, todo menos lo que alguien sacó; en un cliente o un
 * proyecto, las de sus sesiones (`clavesDeLasSesiones`, con las fechas que guarda cada lectura para la
 * ligadura por fecha). Lo sumado a mano siempre cuenta: son las fuentes manuales de la exploración.
 */
export function lecturasDeLaExploracion<L extends { etiqueta: string; fecha?: string; titulo?: string }>(
  lecturas: Readonly<Record<string, L>>,
  sesiones: readonly SesionPlaneada[],
  o: { automaticas: boolean; fuera: readonly string[] },
): Record<string, L> {
  const fuera = new Set(o.fuera);
  const entradas = Object.entries(lecturas);
  if (o.automaticas) return Object.fromEntries(entradas.filter(([k]) => !fuera.has(k)));
  const reuniones: ReunionDeLaExploracion[] = entradas.flatMap(([k, l]) => {
    const i = k.indexOf(":");
    const origen = k.slice(0, i);
    if ((origen !== "meet" && origen !== "hubspot" && origen !== "documento") || !l.fecha) return [];
    return [{ id: k.slice(i + 1), titulo: l.titulo ?? l.etiqueta, fecha: l.fecha, origen, leida: true }];
  });
  const claves = clavesDeLasSesiones(sesiones, reuniones);
  return Object.fromEntries(entradas.filter(([k]) => k.startsWith("documento:") || claves.has(k)));
}

// ── En qué está la reunión de una sesión (etapa A) ────────────────────────────

/**
 * En qué está la reunión de una sesión, para decirlo sin mentir sobre la lectura sola (los estados del
 * tablero Sesion.dc.html, más `corta`, `soloNotasSinLeer` y `noSeHizo`).
 */
export type EstadoDeLaReunion =
  | "sinReunion"
  | "agendada"
  | "esperando"
  | "sinTexto"
  | "cancelada"
  | "corta"
  | "sinLeer"
  | "soloNotasSinLeer"
  | "leida"
  | "noSeHizo";

const HORA = 60 * 60 * 1000;

export function estadoDeLaReunionDeLaSesion(p: Pick<PestanaDeSesion, "sesion" | "reunion">, ahora: Date = new Date()): EstadoDeLaReunion {
  if (p.sesion?.resultado === "noSeHizo") return "noSeHizo";
  const r = p.reunion;
  const espera = (iso: string | undefined) => !!iso && ahora.getTime() - Date.parse(iso) < HORAS_ESPERANDO_LA_TRANSCRIPCION * HORA;
  if (r) {
    if (r.corta) return "corta";
    if (r.leida) return "leida";
    if (r.texto === "nada") return espera(p.sesion?.evento?.fin ?? r.fecha) ? "esperando" : "sinTexto";
    if (r.texto === "notas") return "soloNotasSinLeer";
    return "sinLeer";
  }
  const e = p.sesion?.evento;
  if (!e) {
    /* Unida a una reunión de HubSpot que todavía no está en la lista: la agendada (HubSpot da la agenda
       hacia adelante y la lista solo trae las que ya pasaron) o una que pasó y todavía no llegó. */
    const h = p.sesion?.reunion;
    if (h?.origen !== "hubspot") return "sinReunion";
    const inicio = h.inicio ?? (p.sesion?.fecha ? `${p.sesion.fecha}T23:59:59.999-06:00` : null);
    if (!inicio || Number.isNaN(Date.parse(inicio))) return "sinReunion";
    if (Date.parse(inicio) > ahora.getTime()) return "agendada";
    return h.inicio && espera(h.inicio) ? "esperando" : "sinTexto";
  }
  if (e.cancelada) return "cancelada";
  if (Date.parse(e.inicio) > ahora.getTime()) return "agendada";
  return espera(e.fin ?? e.inicio) ? "esperando" : "sinTexto";
}

/**
 * Lo primero que falta en las sesiones, en una frase (va antes que lo demás en «Qué sigue»): en un
 * cliente o un proyecto sin ninguna, agregar la primera (la exploración arranca vacía: Noelito, Cemaco);
 * una sesión que ya pasó sin reunión; una con solo notas de Gemini que nadie leyó. null = nada.
 */
export function avisoDeLasSesiones(
  pestanas: readonly PestanaDeSesion[],
  o: { automaticas: boolean; hoy: string; ahora?: Date },
): string | null {
  if (!o.automaticas && pestanas.length === 0) return "Agrega la primera sesión: una agendada, una que ya pasó o una sin reunión todavía.";
  const ahora = o.ahora ?? new Date();
  const conSesion = pestanas.filter((p) => p.sesion && !p.noSeHizo && !p.sesion.resultado);
  const sinReunion = conSesion.find((p) => estadoDeLaReunionDeLaSesion(p, ahora) === "sinReunion" && !!p.fecha && p.fecha < o.hoy);
  if (sinReunion) return `La sesión ${sinReunion.numero} ya pasó y no tiene reunión: únela o di qué pasó.`;
  const soloNotas = pestanas.find((p) => !p.noSeHizo && estadoDeLaReunionDeLaSesion(p, ahora) === "soloNotasSinLeer");
  if (soloNotas) return `La sesión ${soloNotas.numero} tiene solo notas de Gemini: léela.`;
  return null;
}

/**
 * Lo que dice cada estado, con las palabras del tablero (la pantalla puede sumar la fecha y las acciones).
 * `aviso`: se pinta en ámbar (falta algo).
 */
export const TEXTO_DEL_ESTADO_DE_LA_REUNION: Record<EstadoDeLaReunion, { titulo: string; detalle: string; aviso: boolean }> = {
  sinReunion: { titulo: "Sin reunión del calendario", detalle: "Asocia una reunión. La guía se puede preparar igual.", aviso: false },
  agendada: {
    titulo: "Unida a una reunión del calendario",
    detalle: "Cuando ocurra, Nexus espera su transcripción y la lee sola. Si la mueven en el calendario, la sesión toma la fecha nueva.",
    aviso: false,
  },
  esperando: { titulo: "Esperando la transcripción", detalle: "Meet puede tardar hasta una hora en dejarla. Nexus la lee cuando llegue.", aviso: false },
  sinTexto: { titulo: "Terminó sin transcripción ni notas de Gemini", detalle: "Suma la minuta o dile qué pasó con ella.", aviso: true },
  cancelada: { titulo: "La reunión se canceló en el calendario", detalle: "La sesión y su guía siguen. Asocia otra reunión.", aviso: true },
  corta: { titulo: "Casi no tuvo conversación", detalle: "Dile qué pasó con ella.", aviso: true },
  sinLeer: { titulo: "Sin leer", detalle: "El agente todavía no la leyó.", aviso: true },
  soloNotasSinLeer: { titulo: "Solo notas de Gemini, sin leer", detalle: "Léela. Cuando llegue la transcripción, se vuelve a leer.", aviso: true },
  leida: { titulo: "Leída por el agente", detalle: "", aviso: false },
  noSeHizo: { titulo: "No se hizo", detalle: "No cuenta como sesión.", aviso: false },
};

/**
 * En qué está una sesión, para decirlo en pantalla (2026-10-06, pedido de Elías: «se debe especificar
 * si una sesión ya ocurrió o no»). Ocurrió: tiene su reunión, la marcó el vendedor o su fecha pasó.
 * Próxima: la que se prepara ahora. Más adelante: una planeada después de la próxima.
 */
export type EstadoDeLaSesion = "ocurrio" | "proxima" | "despues";

export const ETIQUETA_DEL_ESTADO: Record<EstadoDeLaSesion, string> = {
  ocurrio: "Ya ocurrió",
  proxima: "Próxima",
  despues: "Todavía no ocurre",
};

export function estadoDeLaSesion(p: Pick<PestanaDeSesion, "clave" | "hecha">, claveDeLaProxima: string): EstadoDeLaSesion {
  if (p.hecha) return "ocurrio";
  return p.clave === claveDeLaProxima ? "proxima" : "despues";
}

/** ¿Ya pasó? La marcó el vendedor, o su fecha es anterior a hoy. */
export function sesionHecha(s: SesionPlaneada, hoy: string): boolean {
  return !!s.hecha || (!!s.fecha && s.fecha < hoy);
}

/**
 * La próxima reunión: la primera sesión que no pasó (las con fecha primero; una unida a un evento del
 * calendario, con su hora) o, si no hay, la agendada en HubSpot. Su número cuenta las SESIONES que ya
 * pasaron (etapa A: antes contaba también las lecturas del agente, e inflaba el número). En un prospecto,
 * las sesiones que entraron solas y ya pasaron se pasan en `pasadasSinSesion` (no son `SesionPlaneada`).
 * Un número suelto en `o` es el conteo de lecturas de antes: se ignora (@deprecated, lo pasan pantallas
 * que todavía no se actualizaron).
 */
export function proximaReunion(
  sesiones: readonly SesionPlaneada[],
  agenda: readonly { titulo: string; inicio: string }[],
  hoy: string,
  o: number | { pasadasSinSesion?: number } = {},
): {
  numero: number;
  titulo: string | null;
  /** El día (`AAAA-MM-DD`, en Costa Rica) o, en la agenda de HubSpot, el ISO. */
  fecha: string | null;
  /** La hora, si la sesión está unida a un evento del calendario que no se canceló (ISO). */
  inicio?: string | null;
  desde: "sesion" | "hubspot" | null;
  sesionId: string | null;
} {
  const sinSesion = typeof o === "object" ? Math.max(0, o.pasadasSinSesion ?? 0) : 0;
  const hechas = sesiones.filter((s) => sesionHecha(s, hoy) && s.resultado !== "noSeHizo").length + sinSesion;
  const pendientes = sesiones
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => !sesionHecha(s, hoy))
    .sort((a, b) => (a.s.fecha && b.s.fecha ? a.s.fecha.localeCompare(b.s.fecha) : a.s.fecha ? -1 : b.s.fecha ? 1 : a.i - b.i));
  const numero = hechas + 1;
  if (pendientes[0]) {
    const s = pendientes[0].s;
    const inicio = s.evento && !s.evento.cancelada ? s.evento.inicio : null;
    return { numero, titulo: s.titulo ?? s.evento?.titulo ?? null, fecha: s.fecha ?? inicio, inicio, desde: "sesion", sesionId: s.id };
  }
  if (agenda[0]) return { numero, titulo: agenda[0].titulo, fecha: agenda[0].inicio, desde: "hubspot", sesionId: null };
  return { numero, titulo: null, fecha: null, desde: null, sesionId: null };
}

// ── Qué cubre la guía ─────────────────────────────────────────────────────────

/** Hasta cuántas dimensiones apunta la guía: las que más importan, no las ocho. */
export const MAX_DIMENSIONES_EN_FOCO = 4;
/** Hasta cuántas tarjetas vacías pregunta una reunión. */
export const MAX_TARJETAS_EN_LA_GUIA = 5;
/**
 * Cuántas preguntas tenía la guía sin el plan, entre tarjetas y dimensiones. Con el plan tiene 5
 * (plan-de-la-guia.ts › `MAX_PREGUNTAS_DE_LA_GUIA`): la preventa desde el 2026-10-18 y un proyecto desde el 2026-10-19.
 * Queda para mostrar una guía de un proyecto armada antes del plan.
 */
export const MAX_PREGUNTAS_POR_REUNION = 8;

/**
 * En qué orden se preguntan las tarjetas vacías: primero adónde quiere llegar, qué lo frena y qué le
 * cuesta no actuar; el presupuesto al final (hablar de plata antes de la meta es vender antes de
 * diagnosticar).
 */
export const PRIORIDAD_DE_LAS_TARJETAS = MARCO_DE_VENTA.prioridad as readonly (typeof CASILLAS_DEL_RESUMEN)[number][];

/**
 * Las tarjetas que siguen vacías, en el orden en que conviene preguntarlas. Las del marco de la
 * exploración (lib/exploraciones/marco.ts): las ocho de la venta, o las tres de la estrategia (Customer Success).
 */
export function huecosDelResumen(casillas: Partial<Record<ClaveDeCasilla, unknown>>, marco: Marco = MARCO_DE_VENTA): ClaveDeCasilla[] {
  return marco.prioridad.filter((clave) => {
    const v = casillas[clave];
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
}

/** Lo mínimo que la guía necesita saber de dónde parece estar cada dimensión. */
export interface PosicionParaLaGuia {
  nivel: Letra;
  clase: "evidencia" | "hipotesis";
}

/**
 * Las dimensiones en foco de la próxima reunión, hasta 4 en total: las de las áreas en juego que
 * todavía no tienen evidencia. Primero las que el vendedor marcó para explorar a fondo; después las
 * más bajas (sin dato cuenta como la más baja: hay que preguntarla), la base operativa antes que la
 * producción, y en el orden de las áreas.
 */
export function enfoqueDeLaGuia(
  escala: EscalaDelLienzo,
  areas: readonly string[],
  posiciones: Readonly<Record<string, PosicionParaLaGuia | undefined>>,
  aExplorar: Readonly<Record<string, unknown>>,
  max = MAX_DIMENSIONES_EN_FOCO,
): string[] {
  const candidatas: { id: string; marcada: boolean; nivel: number; capa: number; orden: number }[] = [];
  let orden = 0;
  for (const areaId of areas) {
    const area = escala.areas.find((a) => a.id === areaId);
    if (!area) continue;
    for (const d of area.dimensiones) {
      orden++;
      if (!d.aplica) continue;
      const p = posiciones[d.id];
      /* Lo que ya tiene evidencia no se vuelve a preguntar, SALVO que alguien lo haya llevado a la próxima sesión (ficha
         B, 2026-10-17: «Qué explorar» sugiere confirmar una dimensión que cambió de nivel, aunque tenga evidencia). */
      if (p?.clase === "evidencia" && !(d.id in aExplorar)) continue;
      candidatas.push({ id: d.id, marcada: d.id in aExplorar, nivel: p ? LETRAS.indexOf(p.nivel) : -1, capa: d.capa === "base" ? 0 : 1, orden });
    }
  }
  return candidatas
    .sort((a, b) => Number(b.marcada) - Number(a.marcada) || a.nivel - b.nivel || a.capa - b.capa || a.orden - b.orden)
    .slice(0, max)
    .map((c) => c.id);
}

/**
 * Lo que la guía de la preventa sabe del cliente para armar su plan (plan-de-la-guia.ts): lo que ya respondió, lo que
 * ya se preguntó en sesiones anteriores, cuántos puntos se llevó el vendedor y lo que pasó de una sesión cortada.
 */
export interface ContextoDelPlan {
  saber: SaberDelCliente;
  yaPreguntado?: ReadonlyMap<string, ReadonlySet<PasoDeLaPregunta>>;
  llevados?: number;
  pasaron?: readonly string[];
  /** El marco con que se armó lo que ya se sabe: en un proyecto, sin el test. */
  marco?: ClaveDeMarco;
  /** El equipo del cliente de la sesión (equipos.ts): la guía es la de ese equipo. */
  equipo?: ClaveDeEquipo;
  /** La conversación se puso técnica: entra una pregunta de sistemas y datos. */
  tecnica?: boolean;
  /** K2 (2026-10-27, como-llego.ts): la primera sesión de un prospecto en frío o referido; abre la puerta, sin diagnóstico. */
  abrirLaPuerta?: boolean;
}

/**
 * Qué cubre la próxima reunión. Con lo que ya se sabe (`contexto`), lo decide el plan (plan-de-la-guia.ts): unas 5
 * preguntas que parten de lo que el cliente ya respondió, cada una en su paso; en un PROYECTO, con su estrategia
 * (2026-10-19). Sin ese contexto (una guía de un proyecto armada antes del plan), las tarjetas vacías y, con lo que
 * queda hasta 8 preguntas, las dimensiones sin evidencia (5 en un proyecto). Lo usan la pantalla y el pedido al agente:
 * tienen que decir lo mismo.
 */
export function focoDeLaGuia(
  casillas: Partial<Record<ClaveDeCasilla, unknown>>,
  escala: EscalaDelLienzo,
  areas: readonly string[],
  posiciones: Readonly<Record<string, PosicionParaLaGuia | undefined>>,
  aExplorar: Readonly<Record<string, unknown>>,
  marco: Marco = MARCO_DE_VENTA,
  contexto?: ContextoDelPlan,
): { huecos: ClaveDeCasilla[]; enfoque: string[]; lentes: string[]; plan: PreguntaPlaneada[] | null } {
  if (contexto) {
    const plan = planDeLaGuia({ ...contexto, casillas, escala, areas, posiciones, aExplorar, marco: marco.clave });
    return {
      huecos: plan.filter((p) => p.tipo === "tarjeta").map((p) => p.para as ClaveDeCasilla),
      enfoque: plan.filter((p) => p.tipo === "dimension").map((p) => p.para),
      lentes: plan.filter((p) => p.tipo === "equipo").map((p) => p.para),
      plan,
    };
  }
  const huecos = huecosDelResumen(casillas, marco).slice(0, marco.maxTarjetas);
  const enfoque = enfoqueDeLaGuia(escala, areas, posiciones, aExplorar, Math.min(marco.maxDimensiones, MAX_PREGUNTAS_POR_REUNION - huecos.length));
  return { huecos, enfoque, lentes: [], plan: null };
}

// ── Lo de base: lo que la guía muestra aunque el agente no la haya armado ─────

/** La pregunta de base de cada tarjeta de la venta (en lenguaje llano, tuteando al cliente). Las de cada marco, en marco.ts. */
export const PREGUNTA_DE_BASE = MARCO_DE_VENTA.preguntaDeBase as Readonly<Record<(typeof CASILLAS_DEL_RESUMEN)[number], string>>;

/** Para conectar cuando la empresa no hizo el test y todavía no se habló: preguntas de conexión. */
export const CONEXION_DE_BASE: readonly string[] = [
  "¿Cómo llegaron a hablar con nosotros? ¿Qué te hizo buscarnos ahora?",
  "Cuéntame cómo funciona hoy tu equipo: ¿cómo consiguen clientes y cómo los atienden?",
  "Si en seis meses esto estuviera resuelto, ¿qué sería distinto?",
];

/** Las objeciones típicas de una exploración, con LAER: escuchar, reconocer, explorar y responder. */
export const TIPOS_DE_OBJECION = ["precio", "herramienta", "momento", "propuesta"] as const;
export type TipoDeObjecion = (typeof TIPOS_DE_OBJECION)[number];
export const OBJECION: Record<TipoDeObjecion, string> = {
  precio: "«Está muy caro»",
  herramienta: "«Ya tenemos una herramienta»",
  momento: "«No es el momento»",
  propuesta: "«Mándame la propuesta»",
};

export const PASOS_LAER = [
  { clave: "escuchar", nombre: "Escuchar" },
  { clave: "reconocer", nombre: "Reconocer" },
  { clave: "explorar", nombre: "Explorar" },
  { clave: "responder", nombre: "Responder" },
] as const;
export type PasoLaer = (typeof PASOS_LAER)[number]["clave"];

export type Objecion = { tipo: TipoDeObjecion } & Record<PasoLaer, string>;

export const OBJECIONES_DE_BASE: readonly Objecion[] = [
  {
    tipo: "precio",
    escuchar: "Deja que termine. No defiendas el precio todavía.",
    reconocer: "Tiene sentido cuidar la inversión.",
    explorar: "¿Caro comparado con qué? ¿Cuánto les cuesta hoy no resolverlo?",
    responder: "Vuelve a su meta en cifras: lo que cuesta quedarse como está contra lo que cuesta resolverlo.",
  },
  {
    tipo: "herramienta",
    escuchar: "Pregunta cuál y desde cuándo la usan.",
    reconocer: "Qué bueno que ya tengan algo andando.",
    explorar: "¿Qué tanto la usa el equipo? ¿Qué no les resuelve hoy?",
    responder: "No se trata de cambiar de herramienta, sino de que funcione lo que ya pagan para llegar a su meta.",
  },
  {
    tipo: "momento",
    escuchar: "Pregunta qué está pasando ahora en la empresa.",
    reconocer: "Entiendo que hay prioridades que mandan.",
    explorar: "¿Qué tendría que pasar para que sí lo fuera? ¿Qué pasa si esperan seis meses?",
    responder: "Acuerda una fecha concreta para retomarlo, atada a su meta.",
  },
  {
    tipo: "propuesta",
    escuchar: "No la mandes todavía: pregunta para qué la quiere.",
    reconocer: "Claro, es normal querer verlo por escrito.",
    explorar: "¿Qué tendría que traer para que tenga sentido? ¿Quién más la va a leer?",
    responder: "Una propuesta sin su meta en cifras se compara solo por precio: propón revisarla juntos en una reunión corta.",
  },
];

/** La señal de poca apertura, y qué hacer con ella. */
export const POCA_APERTURA_DE_BASE =
  "Si no te deja explorar (responde corto, pide el precio de una vez, no quiere hablar de su operación): o se descarta, o se le vende un caso concreto para el resultado que pide, sin diagnóstico.";

export const CIERRE_DE_BASE = "Resume lo que entendiste, pregunta si falta algo y agenda ahí mismo la próxima reunión, con fecha y con quien decide.";

// ── La guía que arma el agente ────────────────────────────────────────────────

/** Una pregunta de la guía: a qué apunta (una tarjeta del resumen o una dimensión), y tres repreguntas. */
export interface PreguntaDeLaGuia {
  /** La clave de una tarjeta del resumen o el id de una dimensión (`1.7`). */
  para: string;
  pregunta: string;
  repreguntas: string[];
  /** El punto de una sesión anterior que esta pregunta retoma (el texto de `explorar`), si retoma uno. */
  abierto?: string;
  /** El paso de la siguiente pregunta lógica que pregunta (plan-de-la-guia.ts). Sin él, una guía de antes del 2026-10-18. */
  paso?: PasoDeLaPregunta;
  /** K8 (2026-10-26): qué investiga, la hipótesis o el vacío, en una frase. Lo lee quien lleva la sesión. */
  investiga?: string;
  /** K8: qué pedirle al cliente que muestre para comprobarlo (un reporte, un registro, una pantalla). */
  pideVer?: string;
}

export interface GuiaDeLaSesion {
  en: string;
  corridaId: string | null;
  /** Las tarjetas vacías y las dimensiones en foco con que se armó: si cambian, la guía quedó vieja. */
  huecos: string[];
  enfoque: string[];
  /** El equipo del cliente para el que se armó (2026-10-23): si la sesión cambia de equipo, la guía quedó vieja. */
  equipo?: ClaveDeEquipo;
  /** Los temas del equipo que pregunta (`marketing.medicion`, o `empresa.sistemas`), como `huecos` y `enfoque`. */
  lentes?: string[];
  /** El objetivo de la sesión, en una frase: lo sugiere el agente y lo confirma el vendedor. */
  objetivo?: string | null;
  /**
   * Dónde va cada punto que el vendedor se llevó (su texto → la tarjeta o la dimensión a la que
   * apunta), según el agente: con eso la guía lo muestra con su letra o su número aunque ninguna
   * pregunta lo retome (Elías, 2026-10-07: «pensé que aparecían solo las letras… o el número»).
   */
  ubicaciones?: Record<string, string>;
  /**
   * Retos típicos de su industria, sacados de la investigación en internet, cada uno con la pregunta
   * para confirmar si le pasa (Elías, 2026-10-07: «que deje bien claro que son preliminares, y solo
   * se usen para armar preguntas»). Son hipótesis: no van al Resumen, van a la preparación de la reunión.
   */
  retosDeLaIndustria?: RetoDeLaIndustria[];
  /**
   * Solo en un proyecto (Customer Success): las preguntas sobre LO QUE SE VENDIÓ, una por pieza del
   * alcance (Elías, 2026-10-07: «la guía solo pregunta por la escala y la estrategia; debe tomar mucho
   * más en cuenta lo que aparece en lo vendido»). Quién lo va a usar, cómo trabaja hoy, qué datos toca
   * y qué tiene que pasar para que el cliente diga que funcionó.
   */
  loVendido?: PreguntaDeLoVendido[];
  /**
   * K8 (2026-10-26): en una sesión con la empresa entera, sin sesiones por equipo todavía, las que conviene agendar
   * después, cada una con su porqué. Las sugiere el agente; las agenda una persona.
   */
  sesionesSugeridas?: { equipo: ClaveDeEquipo; porque: string }[];
  /** Cómo abrir la conversación, desde algo de la empresa. */
  apertura: string[];
  /** La escala explicada en simple: solo cuando no hizo el test y todavía no se habló. */
  escalaEnSimple: string | null;
  preguntas: PreguntaDeLaGuia[];
  objeciones: Objecion[];
  pocaApertura: string | null;
  cierre: string | null;
}

/** Una pregunta sobre una pieza de lo vendido. `id` sale del tema (`idDeLoVendido`): estable entre guías. */
export interface PreguntaDeLoVendido {
  id: string;
  /** La pieza del alcance, en pocas palabras («Integración con el ERP», «Sales Hub»). */
  tema: string;
  pregunta: string;
  repreguntas: string[];
}

export const MAX_PREGUNTAS_DE_LO_VENDIDO = 5;

/** El id de una pregunta de lo vendido: `vendido:` y una huella de su tema (con él se guardan su casilla y su nota). */
export function idDeLoVendido(tema: string): string {
  const t = tema.trim().toLowerCase();
  let h = 5381;
  for (let i = 0; i < t.length; i++) h = ((h << 5) + h + t.charCodeAt(i)) >>> 0;
  return `vendido:${h.toString(36)}`;
}

/** Un reto típico de su industria (hipótesis) y la pregunta para confirmarlo. */
export interface RetoDeLaIndustria {
  reto: string;
  pregunta: string;
}

export const MAX_RETOS_DE_LA_INDUSTRIA = 3;

export const REPREGUNTAS_POR_PREGUNTA = 3;
export const MAX_PREGUNTAS_EN_LA_GUIA = 12;

/** Qué cambió desde que se armó la guía. null = está al día. */
export interface CambiosDesdeLaGuia {
  /** Tarjetas que estaban vacías al armarla y ya se respondieron: la guía las sigue preguntando. */
  respondidas: string[];
  /** Tarjetas que hoy faltan y la guía no pregunta con lo suyo (entraron después). */
  nuevas: string[];
  /** Cambiaron las dimensiones de la escala que conviene preguntar. */
  dimensiones: boolean;
  /** Puntos que el vendedor se llevó y la guía todavía no ubica (se llevaron después de armarla). */
  llevados: number;
  /** La guía de un proyecto se armó antes del plan (plan-de-la-guia.ts › `guiaDeAntesDelPlan`): no parte de lo que ya se sabe. */
  antesDelPlan?: boolean;
  /** La sesión cambió de equipo del cliente (o lo tiene y la guía es de la empresa entera): `ahora` es el de hoy. */
  equipo?: { antes: ClaveDeEquipo | null; ahora: ClaveDeEquipo | null };
  /**
   * Temas que la guía pregunta y una reunión leída DESPUÉS de armarla dio por respondidos (2026-10-23). La guía no se
   * mueve sola (sus retoques van por «tema:paso»): se avisa, y «Actualizar la guía» los pasa al paso siguiente.
   */
  leidoDespues?: string[];
}

/** Lo que mira `cambiosDesdeLaGuia` además de los temas de hoy. */
export interface OpcionesDeLosCambios {
  antesDelPlan?: boolean;
  /** El equipo de la sesión hoy (sin él, no se mira). */
  equipo?: ClaveDeEquipo | null;
  /**
   * ¿Este tema todavía falta? Una tarjeta que dejó el plan porque entraron otros temas (el tope de 5) no está
   * respondida: sin esto se decía «ya se respondió Quién decide» sin que nadie lo respondiera. Sin él, como antes.
   */
  sigueFaltando?: (para: string) => boolean;
  /** Los temas de la guía que una reunión leída después de armarla dio por respondidos (`pasosRespondidos` con `desde`). */
  leidoDespues?: readonly string[];
}

/**
 * Qué cambió desde que se armó la guía: lo que ya se respondió, lo que entró, las dimensiones, lo que el vendedor se
 * llevó de otra sesión después, el equipo del cliente de la sesión y lo que respondió una reunión leída después. Con
 * esto la pantalla dice POR QUÉ actualizarla, en vez de un «la guía es de antes de lo último que se supo» (Elías,
 * 2026-10-07: «no hay claridad de qué hace»).
 */
export function cambiosDesdeLaGuia(
  guia: Pick<GuiaDeLaSesion, "huecos" | "enfoque"> & Partial<Pick<GuiaDeLaSesion, "preguntas" | "ubicaciones" | "equipo">>,
  huecos: readonly string[],
  enfoque: readonly string[],
  llevados: readonly string[] = [],
  opciones: OpcionesDeLosCambios = {},
): CambiosDesdeLaGuia | null {
  const respondidas = guia.huecos.filter((h) => !huecos.includes(h) && !opciones.sigueFaltando?.(h));
  const nuevas = huecos.filter((h) => !guia.huecos.includes(h));
  const dimensiones = guia.enfoque.length !== enfoque.length || [...guia.enfoque].sort().join() !== [...enfoque].sort().join();
  const ubicados = new Set([...(guia.preguntas ?? []).flatMap((p) => (p.abierto ? [p.abierto] : [])), ...Object.keys(guia.ubicaciones ?? {})]);
  const sinUbicar = llevados.filter((t) => !ubicados.has(t)).length;
  const antesDelPlan = !!opciones.antesDelPlan;
  const equipo = opciones.equipo !== undefined && (guia.equipo ?? null) !== opciones.equipo ? { antes: guia.equipo ?? null, ahora: opciones.equipo } : null;
  const leidoDespues = [...new Set(opciones.leidoDespues ?? [])];
  if (!respondidas.length && !nuevas.length && !dimensiones && !sinUbicar && !antesDelPlan && !equipo && !leidoDespues.length) return null;
  return {
    respondidas,
    nuevas,
    dimensiones,
    llevados: sinUbicar,
    ...(antesDelPlan ? { antesDelPlan } : {}),
    ...(equipo ? { equipo } : {}),
    ...(leidoDespues.length ? { leidoDespues } : {}),
  };
}

/** ¿La guía se armó con otras tarjetas vacías, otras dimensiones en foco, sin lo que se llevó después o con otro equipo? */
export function guiaVieja(
  guia: Pick<GuiaDeLaSesion, "huecos" | "enfoque"> & Partial<Pick<GuiaDeLaSesion, "preguntas" | "ubicaciones" | "equipo">>,
  huecos: readonly string[],
  enfoque: readonly string[],
  llevados: readonly string[] = [],
  opciones: OpcionesDeLosCambios = {},
): boolean {
  return cambiosDesdeLaGuia(guia, huecos, enfoque, llevados, opciones) !== null;
}

// ── Lo que se muestra ─────────────────────────────────────────────────────────

/**
 * Cuánto dura una sesión de exploración, y en qué minutos se abre, se pregunta, se le cuenta y se cierra. Una hora
 * (2026-10-23, Marco: «la sesión dura una hora y el cliente no solo quiere responder: también espera que le hablen y lo
 * entusiasmen»). Antes eran 45 minutos sin un momento para contarle nada.
 */
export const DURACION_DE_LA_SESION = 60;
export const TRAMOS_DE_LA_SESION = { abrir: [0, 5], preguntar: [5, 40], contar: [40, 50], cerrar: [50, 60] } as const;

/**
 * De dónde viene lo que se pregunta hoy (rediseño de las sesiones, 2026-10-07: «que la información
 * de las sesiones pasadas afecte la planificación de las futuras»): quedó abierto en una sesión
 * anterior y el vendedor lo marcó para llevar, o pasó de una sesión que se cortó.
 */
export interface Procedencia {
  tipo: "abierto" | "paso";
  numero: number;
}

export function textoDeLaProcedencia(p: Procedencia): string {
  return p.tipo === "abierto" ? `Quedó abierto en la sesión ${p.numero}` : `Pasó de la sesión ${p.numero}`;
}

/**
 * K7 (2026-10-26): la pregunta que valida lo que marcó en el test, cuando el agente no escribió una (o la guía es de antes).
 * La de respaldo de siempre daba por cierto lo marcado («¿Cuánto les ha costado esto…?»): el caso de Distribuidora Larce.
 */
export function preguntaQueValida(marcado: string): string {
  // Corta para leerla en voz alta (25 palabras como mucho, sugerencias-del-asistente.ts): la primera frase de lo marcado,
  // en 10 palabras, sin terminar en un conector.
  const palabras = (marcado.trim().split(/[:;,.(]/)[0] ?? "").split(/\s+/).filter(Boolean).slice(0, 10);
  while (palabras.length > 3 && /^(y|o|con|de|del|en|que|a|al|la|el|los|las|un|una|por|para|sin)$/i.test(palabras[palabras.length - 1])) palabras.pop();
  const t = palabras.join(" ");
  const inicio = /^\p{Lu}\p{Ll}/u.test(t) ? t.charAt(0).toLowerCase() + t.slice(1) : t;
  return `En el diagnóstico marcaste que ${inicio}; ¿cómo se ve eso en el día a día?`;
}

export interface PreguntaParaMostrar {
  /**
   * A qué apunta: una tarjeta, una dimensión, para un punto llevado que ninguna pregunta retoma `abierto:<n>`, y para una
   * pregunta que sumó el vendedor `propia:<id>`.
   */
  para: string;
  /** `equipo`: un tema de un equipo del cliente (`marketing.medicion`) o la pregunta de sistemas de la empresa. */
  tipo: "tarjeta" | "dimension" | "equipo" | "vendido" | "abierto" | "propia";
  pregunta: string;
  /** Para una pregunta de lo vendido: la pieza del alcance a la que apunta. */
  tema?: string;
  repreguntas: string[];
  /** Para un punto llevado: lo que se dijo (la pregunta va en `pregunta`). */
  contexto?: string;
  procedencia?: Procedencia;
  /**
   * Para un punto llevado que ninguna pregunta retoma: la tarjeta o la dimensión a la que apunta, si
   * se sabe (al llevarlo, o porque el agente lo ubicó al armar la guía). Sin esto se muestra aparte.
   */
  apunta?: { tipo: "tarjeta" | "dimension" | "equipo"; para: string };
  /** El paso que pregunta (solo en la guía de la preventa con plan). */
  paso?: PasoDeLaPregunta;
  /** Lo que ya dijo el cliente y de donde parte la pregunta (va en el ⓘ, no en la pregunta). */
  motivo?: { texto: string; de: string };
  /** Quién la escribió, si no es la guía: una propia («tuya», «asistente») o una de la guía cambiada. */
  marca?: OrigenDelAjuste;
  /** Es una pregunta de la guía que el vendedor cambió: se puede devolver a la de la guía. */
  cambiada?: boolean;
  /** K8: qué investiga y qué pedirle que muestre (lo escribe el agente; lo lee quien lleva la sesión). */
  investiga?: string;
  pideVer?: string;
  /** K7: parte solo de lo que marcó en el test: la pregunta lo valida. */
  aValidar?: boolean;
  /** El lugar que le dio la persona al arrastrarla (ajustes-de-la-guia.ts › `orden`): manda en `ordenDeLaConversacion`. */
  posicion?: number;
}

/** De qué lado está una pregunta: el marco, la escala, el equipo, lo vendido o ninguno (un punto llevado sin ubicar). */
export function ladoDeLaPregunta(p: Pick<PreguntaParaMostrar, "tipo" | "apunta">): "tarjeta" | "dimension" | "equipo" | "vendido" | null {
  return p.tipo === "abierto" || p.tipo === "propia" ? (p.apunta?.tipo ?? null) : p.tipo;
}

/** El tema de una pregunta (`metas`, `1.7`) o null si no tiene uno: un punto llevado sin ubicar o una propia sin tema. */
export function temaDeLaPregunta(p: Pick<PreguntaParaMostrar, "tipo" | "para" | "apunta">): string | null {
  return p.tipo === "abierto" || p.tipo === "propia" ? (p.apunta?.para ?? null) : p.para;
}

/**
 * Lo que se llevó a una sesión, partido en lo que se dijo y la pregunta para cerrarlo. El agente lo
 * escribe en un solo texto, «… Qué preguntar: ¿…?»; sin esa marca, todo es lo que se dijo.
 */
export function separarPregunta(t: string): { dicho: string; pregunta: string | null } {
  const m = /\s*qu[eé] preguntar\s*:\s*/i.exec(t);
  if (!m) return { dicho: t.trim(), pregunta: null };
  return { dicho: t.slice(0, m.index).trim(), pregunta: t.slice(m.index + m[0].length).trim() || null };
}

/**
 * De dónde viene lo que se pregunta en una sesión: de qué sesión quedó abierto cada punto llevado
 * (por su texto) y de qué sesión cortada pasó cada tarjeta o dimensión (por a qué apunta). Las
 * sesiones son las de antes de esta, en orden; la última que dice algo gana.
 */
export function procedenciasDeLaSesion(
  activa: Pick<PestanaDeSesion, "clave" | "sesion">,
  pestanas: readonly PestanaDeSesion[],
): { abiertos: Map<string, number>; pasaron: Map<string, number>; apuntan: Map<string, string> } {
  const idx = pestanas.findIndex((p) => p.clave === activa.clave);
  const antes = (idx < 0 ? pestanas : pestanas.slice(0, idx)).filter((p) => !p.noSeHizo);
  const abiertos = new Map<string, number>();
  // Sin el dato guardado (lo llevado antes del 2026-10-07), viene de la última que se hizo y dejó qué leer.
  const conConversacion = (p: PestanaDeSesion) => p.hecha && !p.sesion?.resultado && !p.reunion?.corta;
  const anteriorHecha = [...antes].reverse().find(conConversacion) ?? [...antes].reverse().find((p) => p.hecha);
  for (const t of activa.sesion?.explorar ?? []) {
    const de = activa.sesion?.explorarDe?.[t];
    const origen = de ? pestanas.find((p) => p.sesion?.id === de) : null;
    const numero = origen && !origen.noSeHizo ? origen.numero : anteriorHecha?.numero;
    if (numero) abiertos.set(t, numero);
  }
  const pasaron = new Map<string, number>();
  for (const p of antes) {
    if (p.sesion?.resultado !== "cortada") continue;
    for (const para of p.sesion.pasaron ?? []) pasaron.set(para, p.numero);
  }
  const apuntan = new Map(Object.entries(activa.sesion?.explorarPara ?? {}).filter(([t]) => abiertos.has(t)));
  return { abiertos, pasaron, apuntan };
}

/**
 * Las preguntas de la próxima reunión: las de la guía del agente que todavía apuntan a algo que
 * falta y, para lo que la guía no cubre, la pregunta de base (la de la tarjeta, o la de la
 * dimensión en la escala). Primero las tarjetas, después las dimensiones.
 */
export function preguntasParaMostrar(
  guia: (Pick<GuiaDeLaSesion, "preguntas" | "ubicaciones" | "loVendido"> & Partial<Pick<GuiaDeLaSesion, "lentes">>) | null,
  huecos: readonly string[],
  enfoque: readonly string[],
  escala: EscalaDelLienzo,
  procedencias: { abiertos: ReadonlyMap<string, number>; pasaron: ReadonlyMap<string, number>; apuntan?: ReadonlyMap<string, string> } = {
    abiertos: new Map(),
    pasaron: new Map(),
  },
  marco: Marco = MARCO_DE_VENTA,
  /**
   * El plan de la guía de la preventa (focoDeLaGuia con contexto) y lo que ya se sabe. Con él, las preguntas van en
   * el orden del plan, cada una en su paso; la del agente que repite lo que el cliente ya contó (o es de una guía de
   * antes y pregunta otro paso) se cambia por la de respaldo, armada con las palabras del cliente.
   */
  conPlan?: { plan: readonly PreguntaPlaneada[]; saber: SaberDelCliente },
): PreguntaParaMostrar[] {
  const preguntaDeLaDimension = (id: string) => escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === id)?.pregunta ?? null;
  const nombreDelTemaParaMostrar = (para: string) =>
    esTarjeta(para)
      ? definicionEnElMarco(para, marco).etiqueta
      : (nombreDelTemaDeEquipo(para, { conEquipo: false }) ?? escala.areas.flatMap((a) => a.dimensiones).find((d) => d.id === para)?.nombre ?? para);
  const ladoDelPara = (para: string | undefined): PreguntaParaMostrar["apunta"] => {
    if (!para) return undefined;
    if (esTarjeta(para)) return { tipo: "tarjeta", para };
    if (esTemaDeEquipo(para)) return { tipo: "equipo", para };
    return escala.areas.some((a) => a.dimensiones.some((d) => d.id === para)) ? { tipo: "dimension", para } : undefined;
  };
  const out: PreguntaParaMostrar[] = [];
  const retomados = new Set<string>();
  const armar = (para: string, tipo: "tarjeta" | "dimension" | "equipo", base: string | null, repreguntasDeBase: readonly string[] = []) => {
    const delAgente = guia?.preguntas.filter((p) => p.para === para) ?? [];
    const pasoDe = procedencias.pasaron.get(para);
    if (delAgente.length) {
      for (const p of delAgente) {
        const abierto = p.abierto && procedencias.abiertos.has(p.abierto) ? p.abierto : null;
        if (abierto) retomados.add(abierto);
        const procedencia: Procedencia | undefined = abierto
          ? { tipo: "abierto", numero: procedencias.abiertos.get(abierto)! }
          : pasoDe
            ? { tipo: "paso", numero: pasoDe }
            : undefined;
        out.push({
          para,
          tipo,
          pregunta: sinCitaAdelante(p.pregunta),
          repreguntas: p.repreguntas,
          ...(procedencia ? { procedencia } : {}),
          ...(p.investiga ? { investiga: p.investiga } : {}),
          ...(p.pideVer ? { pideVer: p.pideVer } : {}),
        });
      }
    } else if (base) {
      out.push({ para, tipo, pregunta: base, repreguntas: [...repreguntasDeBase], ...(pasoDe ? { procedencia: { tipo: "paso" as const, numero: pasoDe } } : {}) });
    }
  };
  if (conPlan) {
    for (const pl of conPlan.plan) {
      const delEquipo = pl.tipo === "equipo" ? leerTemaDeEquipo(pl.para) : null;
      const base =
        (pl.tipo === "tarjeta" ? marco.preguntaDeBase[pl.para as ClaveDeCasilla] : delEquipo ? delEquipo.definicion.pregunta : preguntaDeLaDimension(pl.para)) ?? "";
      // La del agente vale si es del paso que toca; una de antes del plan (sin paso), si no repite lo que ya dijo.
      const delAgente = guia?.preguntas.find((p) => p.para === pl.para && (p.paso ? p.paso === pl.paso : !repiteLoSabido(p.pregunta, pl, conPlan.saber)));
      const abierto = delAgente?.abierto && procedencias.abiertos.has(delAgente.abierto) ? delAgente.abierto : null;
      if (abierto) retomados.add(abierto);
      const pasoDe = procedencias.pasaron.get(pl.para);
      const procedencia: Procedencia | undefined = abierto
        ? { tipo: "abierto", numero: procedencias.abiertos.get(abierto)! }
        : pasoDe
          ? { tipo: "paso", numero: pasoDe }
          : undefined;
      // Sin la cita adelante (validación 69): lo que dijo el cliente va en el ⓘ, con su fuente. La que valida lo que marcó en
      // el test (K7) la dice a propósito.
      const aValidar = marco.clave !== "cs" && pl.motivo?.origen === "test";
      const escrita = delAgente
        ? aValidar
          ? delAgente.pregunta
          : sinCitaAdelante(delAgente.pregunta)
        : aValidar && pl.motivo
          ? preguntaQueValida(pl.motivo.texto)
          : preguntaDeRespaldo(pl, base);
      if (!escrita) continue;
      /* Dos temas en el mismo paso sin pregunta del agente dan la misma de respaldo («¿Cómo te gustaría que funcione…?»
         dos veces, CEMACO 23 oct): la segunda nombra su tema, así no se lee repetida. */
      const pregunta = out.some((o) => o.pregunta === escrita) ? `Y sobre ${nombreDelTemaParaMostrar(pl.para).toLowerCase()}: ${escrita.charAt(0) === "¿" ? "¿" + escrita.charAt(1).toLowerCase() + escrita.slice(2) : escrita}` : escrita;
      out.push({
        para: pl.para,
        tipo: pl.tipo,
        pregunta,
        // La de respaldo también lleva repreguntas: las del paso (validación 104), o las del tema de un equipo.
        repreguntas: delAgente?.repreguntas.length ? delAgente.repreguntas : [...(delEquipo?.definicion.repreguntas ?? REPREGUNTAS_DEL_PASO[pl.paso])],
        paso: pl.paso,
        ...(pl.motivo ? { motivo: { texto: pl.motivo.texto, de: pl.motivo.de } } : {}),
        ...(procedencia ? { procedencia } : {}),
        ...(delAgente?.investiga ? { investiga: delAgente.investiga } : {}),
        ...(delAgente?.pideVer ? { pideVer: delAgente.pideVer } : {}),
        ...(aValidar ? { aValidar: true } : {}),
      });
    }
  } else {
    for (const h of huecos) armar(h, "tarjeta", marco.preguntaDeBase[h as ClaveDeCasilla] ?? null);
    for (const d of enfoque) armar(d, "dimension", preguntaDeLaDimension(d));
    // Los temas del equipo con que se armó la guía (2026-10-23): así la lectura de la reunión sabe que se planearon.
    for (const l of guia?.lentes ?? []) {
      const t = leerTemaDeEquipo(l);
      if (t) armar(l, "equipo", t.definicion.pregunta, t.definicion.repreguntas);
    }
  }
  // Lo vendido (solo en un proyecto): una pregunta por pieza del alcance, como la escribió el agente.
  for (const v of guia?.loVendido ?? []) out.push({ para: v.id, tipo: "vendido", pregunta: sinCitaAdelante(v.pregunta), repreguntas: v.repreguntas, tema: v.tema });
  // Lo llevado que ninguna pregunta retoma va igual, como su propia pregunta: no se pierde.
  for (const [t, numero] of procedencias.abiertos) {
    if (retomados.has(t)) continue;
    const { dicho, pregunta } = separarPregunta(t);
    const apunta = ladoDelPara(guia?.ubicaciones?.[t] ?? procedencias.apuntan?.get(t));
    out.push({
      para: paraDeUnAbierto(t),
      tipo: "abierto",
      pregunta: pregunta ?? dicho,
      repreguntas: [],
      ...(pregunta && dicho ? { contexto: dicho } : {}),
      procedencia: { tipo: "abierto", numero },
      ...(apunta ? { apunta } : {}),
    });
  }
  return out;
}

/**
 * A qué apunta un punto llevado que ninguna pregunta retoma: `abierto:` y una huella corta de su texto,
 * estable aunque cambien los demás (con ella se guardan su casilla «hecha» y su nota de «En vivo»).
 */
export function paraDeUnAbierto(texto: string): string {
  let h = 5381;
  for (let i = 0; i < texto.length; i++) h = ((h << 5) + h + texto.charCodeAt(i)) >>> 0;
  return `abierto:${h.toString(36)}`;
}

/** Cómo abrir cuando el agente todavía no armó la guía. */
export const APERTURA_DE_BASE = "Recuerda por qué se reúnen, confirma cuánto tiempo tienen y pregunta qué le gustaría llevarse de la reunión.";

/**
 * El orden de la conversación («En orden»): primero lo que viene de antes (lo que quedó abierto y lo
 * que pasó de una sesión cortada), después el resto alternando la venta y la escala para que no se
 * sienta un cuestionario, y el presupuesto al final (hablar de plata antes de la meta es vender antes
 * de diagnosticar).
 */
export function ordenDeLaConversacion(preguntas: readonly PreguntaParaMostrar[]): PreguntaParaMostrar[] {
  const natural = ordenNatural(preguntas);
  /* El orden que eligió la persona arrastrando (2026-10-20, ajustes-de-la-guia.ts › `orden`, que `aplicarAjustes` deja en
     `posicion`) manda: así numeran igual la pantalla, «En vivo», el agente que lee la reunión y el chat. Lo que no tiene
     lugar (una pregunta que llegó después de ordenar) va al final, en su orden de siempre. */
  if (!natural.some((p) => p.posicion !== undefined)) return natural;
  const conLugar = natural.filter((p) => p.posicion !== undefined).sort((a, b) => a.posicion! - b.posicion!);
  return [...conLugar, ...natural.filter((p) => p.posicion === undefined)];
}

function ordenNatural(preguntas: readonly PreguntaParaMostrar[]): PreguntaParaMostrar[] {
  const alFinal = (p: PreguntaParaMostrar) => p.para === "presupuesto";
  // Con plan (la preventa, desde el 2026-10-18), el orden ya es el de la conversación: lo de antes, los dolores, lo que falta.
  if (preguntas.some((p) => p.paso)) {
    const medio = preguntas.filter((p) => !alFinal(p));
    const deAntes = (p: PreguntaParaMostrar) => !!p.procedencia || p.tipo === "abierto";
    return [...medio.filter(deAntes), ...medio.filter((p) => !deAntes(p)), ...preguntas.filter(alFinal)];
  }
  const intercalar = (lista: readonly PreguntaParaMostrar[]) => {
    const tarjetas = lista.filter((p) => p.tipo === "tarjeta");
    const dimensiones = lista.filter((p) => p.tipo === "dimension");
    const vendido = lista.filter((p) => p.tipo === "vendido");
    // Los temas de un equipo van en su orden, después de lo llevado: son la conversación de esa sesión.
    const out: PreguntaParaMostrar[] = [...lista.filter((p) => p.tipo === "abierto"), ...lista.filter((p) => p.tipo === "equipo")];
    for (let i = 0; i < Math.max(tarjetas.length, dimensiones.length, vendido.length); i++) {
      if (tarjetas[i]) out.push(tarjetas[i]);
      if (vendido[i]) out.push(vendido[i]);
      if (dimensiones[i]) out.push(dimensiones[i]);
    }
    // Las que sumó el vendedor, al final de su grupo.
    return [...out, ...lista.filter((p) => p.tipo === "propia")];
  };
  const medio = preguntas.filter((p) => !alFinal(p));
  return [...intercalar(medio.filter((p) => p.procedencia)), ...intercalar(medio.filter((p) => !p.procedencia)), ...preguntas.filter(alFinal)];
}

// ── Lo que traes de las sesiones anteriores ───────────────────────────────────

export interface LineaDeLoQueTraes {
  texto: string;
  /** Qué cambia hoy por eso («van primero en la guía»). */
  consecuencia: string;
}

export interface LoQueTraesDeUnaSesion {
  clave: string;
  numero: number;
  fecha: string | null;
  /** «ya ocurrió», «se cortó», «por otro canal». */
  estado: string;
  /** La sesión no dejó qué leer: el estado se pinta en ámbar. */
  aviso: boolean;
  lineas: LineaDeLoQueTraes[];
}

/** «a, b y c». */
function enLista(xs: readonly string[]): string {
  return xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

/**
 * Lo que las sesiones anteriores le dejan a esta (2026-10-07): lo que el vendedor se llevó, lo que
 * pasó de una sesión cortada y la alerta técnica de una reunión. Cada línea dice qué cambia hoy por
 * eso. Solo las sesiones que dejan algo; `nombreDe` da el nombre de una tarjeta o dimensión.
 */
export function loQueTraes(
  activa: Pick<PestanaDeSesion, "clave" | "sesion">,
  pestanas: readonly PestanaDeSesion[],
  o: { nombreDe: (para: string) => string; tecnica: { reunion: string; temas: string[]; vista?: boolean } | null },
): LoQueTraesDeUnaSesion[] {
  const idx = pestanas.findIndex((p) => p.clave === activa.clave);
  const antes = (idx < 0 ? pestanas : pestanas.slice(0, idx)).filter((p) => p.hecha && !p.noSeHizo);
  const { abiertos } = procedenciasDeLaSesion(activa, pestanas);
  const out: LoQueTraesDeUnaSesion[] = [];
  for (const p of antes) {
    const lineas: LineaDeLoQueTraes[] = [];
    const llevados = [...abiertos].filter(([, n]) => n === p.numero).map(([t]) => t);
    if (llevados.length) {
      const preguntas = llevados.map((t) => {
        const { dicho, pregunta } = separarPregunta(t);
        return (pregunta ?? dicho).replace(/^¿/, "").replace(/\?$/, "").replace(/^\p{Lu}/u, (c) => c.toLowerCase());
      });
      lineas.push({
        texto: `Te llevaste ${llevados.length === 1 ? "1 pregunta" : `${llevados.length} preguntas`}: ${enLista(preguntas)}.`,
        consecuencia: llevados.length === 1 ? "va primero en la guía." : "van primero en la guía.",
      });
    }
    const resultado = p.sesion?.resultado;
    if (resultado === "cortada") {
      const pasaron = (p.sesion?.pasaron ?? []).map((x) => o.nombreDe(x).toLowerCase());
      lineas.push({
        texto: pasaron.length ? `Se cortó y no dejó qué leer. Lo que tenía preparado, ${enLista(pasaron)}, quedó sin preguntar.` : "Se cortó y no dejó qué leer.",
        consecuencia: pasaron.length ? "pasó a esta sesión." : "lo que falta sigue en la guía.",
      });
    } else if (resultado === "otroCanal") {
      lineas.push({ texto: "Se hizo por otro canal.", consecuencia: "el agente lee tus notas de «En vivo» como tu contexto." });
    }
    const t = o.tecnica;
    if (t && !t.vista && p.reunion && t.reunion.includes(p.reunion.titulo)) {
      lineas.push({
        texto: `Se puso técnica${t.temas.length ? `: ${enLista(t.temas.map((x) => x.toLowerCase()))}` : ""}.`,
        consecuencia: "«Con quién» pide sumar a alguien técnico.",
      });
    }
    if (!lineas.length) continue;
    out.push({
      clave: p.clave,
      numero: p.numero,
      fecha: p.fecha,
      estado: resultado === "cortada" ? "se cortó" : resultado === "otroCanal" ? "por otro canal" : "ya ocurrió",
      aviso: resultado === "cortada",
      lineas,
    });
  }
  return out;
}

/**
 * K11 (2026-10-28): con qué equipo del cliente fue cada reunión que se lee (por su fuente: S1, H2, M1), el de la sesión
 * a la que la liga la PANTALLA (`pestanasDeSesiones`, que recibe acá): así la lectura y la cabecera de la sesión hablan
 * de la misma reunión. Cuenta la reunión que muestra la pestaña y la que eligió la persona (una de HubSpot cuya gemela
 * de Meet es la que se ve). Una reunión que no es de ninguna pestaña hereda el equipo solo si es la otra cara de la misma
 * reunión (Meet y HubSpot a menos de dos horas) y hay una sola así: nunca de otra sesión del mismo día. Sin equipo, no va.
 */
export function equiposDeLasReuniones(
  reuniones: readonly { fuente: string; clave: string; origen: string; fecha: string }[],
  pestanas: readonly PestanaDeSesion[],
): Record<string, ClaveDeEquipo> {
  const porClave = new Map<string, ClaveDeEquipo>();
  const deUnaPestana = new Set<string>();
  const caras: { origen: string; fecha: string; equipo: ClaveDeEquipo }[] = [];
  for (const p of pestanas) {
    const claves = [p.reunion ? claveDeReunion(p.reunion) : null, p.sesion?.reunion ? claveDeReunion(p.sesion.reunion) : null].filter((k): k is string => !!k);
    for (const k of claves) deUnaPestana.add(k);
    const equipo = p.sesion?.equipo;
    if (!equipo) continue;
    for (const k of claves) porClave.set(k, equipo);
    if (p.reunion) caras.push({ origen: p.reunion.origen, fecha: p.reunion.fecha, equipo });
  }
  const out: Record<string, ClaveDeEquipo> = {};
  const deReunion = (o: string) => o === "meet" || o === "hubspot";
  for (const r of reuniones) {
    const equipo = porClave.get(r.clave);
    if (equipo) {
      out[r.fuente] = equipo;
      continue;
    }
    if (deUnaPestana.has(r.clave) || !deReunion(r.origen)) continue;
    const gemelas = caras.filter((c) => deReunion(c.origen) && c.origen !== r.origen && mismaReunion(c.fecha, r.fecha));
    if (gemelas.length === 1) out[r.fuente] = gemelas[0].equipo;
  }
  return out;
}
