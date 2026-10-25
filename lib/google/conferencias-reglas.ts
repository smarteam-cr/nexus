/**
 * lib/google/conferencias-reglas.ts — las reglas de U3 (2026-10-25), PURAS: qué conferencia de Meet es de qué reunión,
 * si la reunión ocurrió, quiénes entraron y cuánto, y el texto que se arma con las frases. Las usa
 * lib/google/conferencias.ts (la revisión) y lib/google/meet-enrichment.ts (la lectura).
 *
 * ── QUÉ CONFERENCIA ES DE QUÉ REUNIÓN ────────────────────────────────────────
 * El código de Meet es el del ESPACIO, no el de la reunión: una serie semanal usa el mismo código cada semana, una misma
 * reunión puede tener dos conferencias (alguien salió y volvió: U2 midió dos a 3 minutos en «Custom Agent en HubSpot»), y
 * una CSE puede usar la misma sala para varias llamadas, con eventos o sin ellos. Por eso hay dos preguntas distintas:
 *
 * 1. **¿De qué reunión es esta conferencia?** (para «ocurrió», la hora y quién del equipo entró). Cada reunión con el
 *    código la reclama: fuerte si empieza en su hora (o hasta 10 minutos antes), débil si cae en sus márgenes (30 minutos
 *    antes, 20 después del fin). Es de la que la reclama más fuerte; si dos la reclaman igual, cuenta para las dos. Si la
 *    reunión no tiene ninguna, la más cercana a menos de 12 horas que nadie reclame y no le quede más cerca a otra
 *    reunión con el código (canceladas incluidas): una conferencia LEJANA, el evento que se movió («Cemaco | Data Hub»:
 *    evento a las 3, conferencia de 8:58 a 9:46). Una vigente no compite con las canceladas, y una cancelada no se lleva
 *    lo que reclama una vigente (la que la reemplazó).
 *
 * 2. **¿Su texto es, sin duda, el de esta reunión?** (para copiar las frases, los Docs y la gente de fuera). Solo si
 *    todas sus conferencias son suyas con reclamo fuerte y de nadie más, y no hay otra conferencia del mismo código a
 *    menos de una hora que no reclame ninguna reunión (una llamada aparte por la sala fija, con otro cliente). Con
 *    cualquier duda (una lejana, una compartida, una en los márgenes, una vecina suelta) se toma solo lo de la pregunta
 *    1, y el texto sale del Doc del evento, como antes de U3. Es la mecánica de «una reunión con el texto de otra»
 *    (KNOWN-ERRORS, primera entrada): ante la duda, nada. Por eso el cliente que entra 15 minutos tarde cuenta para
 *    «ocurrió» pero su conversación no se copia de Meet.
 *
 * ── SI OCURRIÓ ─────────────────────────────────────────────────────────────────
 * Ocurrió si entraron dos personas o más, o si hay frases. Una conferencia con 0 o 1 participantes no es una reunión
 * (SMATAGRO: conferencias de 15 minutos exactos, sin nadie), pero eso no se cierra hasta 6 horas después del fin: la CSE
 * que esperó sola a las 9:00 y el cliente que entró a las 9:45 por el mismo enlace son la misma reunión. Sin
 * conferencias: «no ocurrió» solo si la organizó una cuenta del equipo (ve todas las de su espacio); si la organizó alguien de fuera, «sin acceso» (un invitado solo ve las
 * conferencias en las que entró alguien del equipo: medido en U2). Se espera 6 horas desde el fin del evento antes de
 * decir que no hubo conferencia.
 */
import { MAX_TRANSCRIPT_CHARS, MIN_TRANSCRIPT_CHARS } from "./doc-parse";

/** Cuánto antes del inicio del evento puede empezar una conferencia que es suya. */
export const MARGEN_ANTES_MS = 30 * 60_000;
/** Cuánto después del fin del evento puede empezar una conferencia que es suya (el cliente que entra tarde). */
export const MARGEN_DESPUES_MS = 20 * 60_000;
export const VENTANA_LEJANA_MS = 12 * 3_600_000;
/** Cuánto se espera desde el fin del evento antes de decir que no hubo conferencia. */
export const ESPERA_SIN_CONFERENCIA_MS = 6 * 3_600_000;
/** Cuánto se espera a que Google genere la transcripción y las notas antes de cerrar igual. */
export const ESPERA_DE_ARCHIVOS_MS = 48 * 3_600_000;
/** Prefijo del `correo` de quien entró y Meet no da su correo (de otra organización, anónimo o por teléfono). */
export const PREFIJO_SIN_CORREO = "meet:";

export type EstadoDeConferencia = "OCURRIO" | "NO_OCURRIO" | "SIN_ACCESO";

export interface ReunionEnElTiempo {
  id: string;
  inicio: Date;
  /** Minutos del evento. */
  duracion: number;
  /** El evento se canceló en el calendario (`canceladaEn`). */
  cancelada?: boolean;
}

/** Desde cuánto antes del inicio una conferencia puede traer el texto de la reunión (la gente que entra temprano). */
export const MARGEN_TEXTO_ANTES_MS = 10 * 60_000;
/** Otra conferencia del mismo código a menos de esto, que no es de otra reunión, deja la reunión sin texto de Meet. */
export const VECINDARIO_MS = 60 * 60_000;

export interface Conferencia {
  nombre: string;
  inicio: Date;
  fin: Date | null;
}

/** Qué tanto reclama una reunión una conferencia: fuerte si empieza en su hora (o 10 minutos antes), débil en los márgenes. */
function reclamo(r: ReunionEnElTiempo, t: number): "fuerte" | "debil" | null {
  const ini = r.inicio.getTime();
  const fin = ini + Math.max(0, r.duracion) * 60_000;
  if (t >= ini - MARGEN_TEXTO_ANTES_MS && t < fin) return "fuerte";
  if (t >= ini - MARGEN_ANTES_MS && t <= fin + MARGEN_DESPUES_MS) return "debil";
  return null;
}

/**
 * Las conferencias de esa reunión y si su texto es sin duda el de la reunión (ver el encabezado, preguntas 1 y 2).
 * `hermanas` = las otras reuniones con el mismo código, canceladas incluidas (con `cancelada`).
 *
 * Cada reunión RECLAMA una conferencia: fuerte si empieza en su hora (o hasta 10 minutos antes), débil si cae en sus
 * márgenes (30 minutos antes, 20 después del fin). Es de esta reunión si la reclama y ninguna otra la reclama más fuerte.
 * Si otra la reclama igual (dos reuniones seguidas, alguien que entra un minuto antes de la siguiente), cuenta para las
 * dos pero ninguna copia su texto. Una vigente no compite con canceladas; una cancelada no se lleva lo que reclama una
 * vigente (la que la reemplazó).
 */
export function conferenciasDeLaReunion<C extends Conferencia>(
  reunion: ReunionEnElTiempo,
  hermanas: readonly ReunionEnElTiempo[],
  conferencias: readonly C[],
): { conferencias: C[]; textoConfiable: boolean } {
  const ini = reunion.inicio.getTime();
  const fin = ini + Math.max(0, reunion.duracion) * 60_000;
  const otras = hermanas.filter((h) => h.id !== reunion.id);
  const vigentes = otras.filter((h) => !h.cancelada);
  const rivales = reunion.cancelada ? otras : vigentes;
  const peso = (x: "fuerte" | "debil" | null) => (x === "fuerte" ? 2 : x === "debil" ? 1 : 0);

  const suyas: C[] = [];
  let enDuda = false;
  const deOtraReunion = new Set<C>();
  for (const c of conferencias) {
    const t = c.inicio.getTime();
    const mio = peso(reclamo(reunion, t));
    const deRivales = Math.max(0, ...rivales.map((h) => peso(reclamo(h, t))));
    if (deRivales > 0) deOtraReunion.add(c);
    if (mio === 0) continue;
    if (reunion.cancelada && vigentes.some((h) => reclamo(h, t) !== null)) continue;
    if (deRivales > mio) continue;
    if (deRivales === mio || mio === 1) enDuda = true;
    suyas.push(c);
  }
  if (suyas.length > 0) {
    suyas.sort(porInicio);
    // Otra conferencia del mismo código cerca que no es de otra reunión: una llamada aparte por la sala fija.
    const vecinaSuelta = conferencias.some((c) => {
      if (suyas.includes(c) || deOtraReunion.has(c)) return false;
      const t = c.inicio.getTime();
      return t >= ini - VECINDARIO_MS && t <= fin + VECINDARIO_MS;
    });
    return { conferencias: suyas, textoConfiable: !enDuda && !vecinaSuelta };
  }
  // La lejana: la más cercana a menos de 12 horas que nadie reclama y no le queda más cerca a otra reunión (canceladas
  // incluidas). Su texto nunca se copia.
  const masCercaDeOtra = (c: C) => {
    const d = Math.abs(c.inicio.getTime() - ini);
    return otras.some((h) => Math.abs(c.inicio.getTime() - h.inicio.getTime()) <= d);
  };
  const lejana = conferencias
    .filter((c) => Math.abs(c.inicio.getTime() - ini) <= VENTANA_LEJANA_MS && !masCercaDeOtra(c) && !deOtraReunion.has(c))
    .sort((a, b) => Math.abs(a.inicio.getTime() - ini) - Math.abs(b.inicio.getTime() - ini))[0];
  return { conferencias: lejana ? [lejana] : [], textoConfiable: false };
}

/** ¿Hay alguna conferencia a menos de 12 horas de la reunión? (si un invitado no ve ninguna, se le pregunta a otro). */
export function hayConferenciaCerca(reunion: ReunionEnElTiempo, conferencias: readonly Conferencia[]): boolean {
  const ini = reunion.inicio.getTime();
  const fin = ini + Math.max(0, reunion.duracion) * 60_000;
  return conferencias.some((c) => c.inicio.getTime() >= ini - VENTANA_LEJANA_MS && c.inicio.getTime() <= fin + VENTANA_LEJANA_MS);
}

// ── A quién preguntarle ───────────────────────────────────────────────────────

export interface BusquedaDeConferencias<C extends Conferencia> {
  /** La cuenta con la que se leyó, o null si ninguna leyó. */
  cuenta: string | null;
  conferencias: C[];
  /** La que respondió es la que organizó la reunión: ve todas las de su espacio, así que lo que no ve no pasó. */
  leyoLaOrganizadora: boolean;
  /** Había a quién preguntarle y ninguna cuenta pudo leer la API (el permiso quitado, una cuenta sin licencia). */
  sinCuentaQueLea: boolean;
}

/**
 * Le pregunta a la API como cada cuenta, en orden (la organizadora primero, si es del equipo; después los invitados del
 * equipo). La organizadora decide sola. Un invitado solo ve las conferencias en las que entró alguien del equipo (U2):
 * si no ve ninguna cerca de la reunión, se le pregunta al siguiente. Un error de cuenta (401, 403, 404) pasa al
 * siguiente; cualquier otro error sube.
 */
export async function buscarConferencias<C extends Conferencia>(
  reunion: ReunionEnElTiempo,
  orden: readonly string[],
  organizadora: string | null,
  listar: (cuenta: string) => Promise<C[]>,
  esErrorDeCuenta: (e: unknown) => boolean,
): Promise<BusquedaDeConferencias<C>> {
  let ultimaQueLeyo: { cuenta: string; conferencias: C[] } | null = null;
  for (const cuenta of orden) {
    let conferencias: C[];
    try {
      conferencias = await listar(cuenta);
    } catch (e) {
      if (esErrorDeCuenta(e)) continue;
      throw e;
    }
    if (cuenta === organizadora) return { cuenta, conferencias, leyoLaOrganizadora: true, sinCuentaQueLea: false };
    if (hayConferenciaCerca(reunion, conferencias)) return { cuenta, conferencias, leyoLaOrganizadora: false, sinCuentaQueLea: false };
    ultimaQueLeyo ??= { cuenta, conferencias };
  }
  if (ultimaQueLeyo) return { ...ultimaQueLeyo, leyoLaOrganizadora: false, sinCuentaQueLea: false };
  return { cuenta: null, conferencias: [], leyoLaOrganizadora: false, sinCuentaQueLea: orden.length > 0 };
}

const porInicio = (a: { inicio: Date }, b: { inicio: Date }) => a.inicio.getTime() - b.inicio.getTime();

export interface DecisionDeConferencia {
  /** null = todavía no se puede decir. */
  estado: EstadoDeConferencia | null;
  /**
   * Ya no queda nada que esperar de Meet para esta reunión. Nunca antes de que pase el margen de después del fin (puede
   * abrirse otra conferencia suya), ni con una conferencia en curso, ni con la transcripción o las notas sin generar.
   * Es también cuándo se copian las frases: una sola vez, enteras (copiarlas a medias, entre «salió» y «volvió», dejaba
   * una transcripción cortada que después pasaba por propia).
   */
  cerrar: boolean;
}

export function decidirConferencia(e: {
  /** La organizó una cuenta del equipo que se pudo impersonar (ve todas las conferencias de su espacio). */
  organizadorDelEquipo: boolean;
  conferencias: readonly Conferencia[];
  participantesDistintos: number;
  hayFrases: boolean;
  /** Estados de las transcripciones y de las notas (STARTED, ENDED, FILE_GENERATED). */
  archivos: readonly string[];
  finDelEvento: Date;
  ahora: Date;
}): DecisionDeConferencia {
  const desdeElFin = e.ahora.getTime() - e.finDelEvento.getTime();
  if (e.conferencias.length === 0) {
    if (desdeElFin < ESPERA_SIN_CONFERENCIA_MS) return { estado: null, cerrar: false };
    return { estado: e.organizadorDelEquipo ? "NO_OCURRIO" : "SIN_ACCESO", cerrar: true };
  }
  const enCurso = e.conferencias.some((c) => c.fin === null);
  const ocurrio = e.participantesDistintos >= 2 || e.hayFrases;
  if (enCurso || desdeElFin < MARGEN_DESPUES_MS) return { estado: ocurrio ? "OCURRIO" : null, cerrar: false };
  // Vacía o con una sola persona: no ocurrió, pero se sigue mirando hasta 6 horas después del fin (el cliente que entra
  // tarde por el mismo enlace abre otra conferencia).
  if (!ocurrio) return { estado: "NO_OCURRIO", cerrar: desdeElFin >= ESPERA_SIN_CONFERENCIA_MS };
  const archivosListos = e.archivos.every((a) => a === "FILE_GENERATED");
  return { estado: "OCURRIO", cerrar: archivosListos || desdeElFin >= ESPERA_DE_ARCHIVOS_MS };
}

/**
 * Lo que se copia de las conferencias de una reunión (ver el encabezado, pregunta 2, y `DecisionDeConferencia.cerrar`):
 * con el texto en duda, solo «ocurrió», la hora y quién del equipo entró.
 */
export function queSeCopia(e: { textoConfiable: boolean; cerrar: boolean }): { frases: boolean; docs: boolean; deFuera: boolean } {
  return { frases: e.textoConfiable && e.cerrar, docs: e.textoConfiable, deFuera: e.textoConfiable };
}

/**
 * Ninguna cuenta del equipo pudo leer las conferencias de una reunión. Si el permiso de Meet está bien (otra reunión de
 * la corrida se leyó, o lo confirmó una prueba con la cuenta de administración), es una cuenta rota (sin licencia de
 * Meet): pasadas 48 horas del fin, la reunión se cierra «sin acceso». Con el permiso quitado no se cierra nada.
 */
export function cerrarSinCuenta(e: { permisoBien: boolean; finDelEvento: Date; ahora: Date }): boolean {
  return e.permisoBien && e.ahora.getTime() - e.finDelEvento.getTime() >= ESPERA_DE_ARCHIVOS_MS;
}

// ── La asistencia ─────────────────────────────────────────────────────────────

export interface ParticipanteVisto {
  /** `conferenceRecords/{id}/participants/{id}`. */
  nombre: string;
  mostrado: string;
  /** `users/{id}`, o null si entró anónimo o por teléfono. */
  usuario: string | null;
  primeraEntrada: Date | null;
  ultimaSalida: Date | null;
  /** Sus sesiones (entró, salió, volvió). Vacío = no se pidieron o no hay: se usa primera entrada y última salida. */
  sesiones: readonly { inicio: Date | null; fin: Date | null }[];
}

/**
 * ¿Es un grabador y no una persona? Entran a la conferencia como un participante más (medido el 2026-10-25: «Smarteam's
 * Notetaker», anónimo, en la de Camosa), y contados como persona harían pasar por ocurrida una reunión de uno solo.
 * Solo los que entran SIN cuenta de Google: una persona con su cuenta nunca es un grabador.
 */
export function esGrabador(p: Pick<ParticipanteVisto, "mostrado" | "usuario">): boolean {
  return p.usuario === null && /note\s*-?\s*taker|notetaker|fireflies|otter\.?ai|read\.ai|tl;?dv|fathom|grabador|recorder|\bbot\b/i.test(p.mostrado);
}

export interface Asistencia {
  correo: string;
  nombre: string;
  idEnMeet: string;
  esDelEquipo: boolean;
  entro: Date | null;
  salio: Date | null;
  minutos: number | null;
}

/**
 * Una fila por persona (sin los grabadores, `esGrabador`): la misma persona en dos conferencias de la reunión (salió y
 * volvió) se junta. Los del equipo
 * con su correo (el directorio traduce `users/{id}`); los demás con `meet:` + su id de Google (o el del participante si
 * entró anónimo): Meet no da su correo.
 */
export function asistenciaDeLaReunion(vistos: readonly ParticipanteVisto[], correoDeUsuario: ReadonlyMap<string, string>): Asistencia[] {
  const porClave = new Map<string, Asistencia & { ms: number }>();
  for (const p of vistos) {
    if (esGrabador(p)) continue;
    const correoInterno = p.usuario ? correoDeUsuario.get(p.usuario) : undefined;
    const idEnMeet = p.usuario ?? p.nombre;
    const correo = correoInterno ?? `${PREFIJO_SIN_CORREO}${idEnMeet}`;
    const ms = p.sesiones.reduce((s, x) => s + (x.inicio && x.fin ? Math.max(0, x.fin.getTime() - x.inicio.getTime()) : 0), 0);
    const msSinSesiones = p.primeraEntrada && p.ultimaSalida ? Math.max(0, p.ultimaSalida.getTime() - p.primeraEntrada.getTime()) : 0;
    const ya = porClave.get(correo);
    const minimo = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a < b ? a : b);
    const maximo = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);
    if (!ya) {
      porClave.set(correo, {
        correo,
        nombre: p.mostrado,
        idEnMeet,
        esDelEquipo: !!correoInterno,
        entro: p.primeraEntrada,
        salio: p.ultimaSalida,
        minutos: null,
        ms: p.sesiones.length > 0 ? ms : msSinSesiones,
      });
      continue;
    }
    ya.entro = minimo(ya.entro, p.primeraEntrada);
    ya.salio = maximo(ya.salio, p.ultimaSalida);
    ya.ms += p.sesiones.length > 0 ? ms : msSinSesiones;
  }
  return [...porClave.values()].map(({ ms, ...a }) => ({ ...a, minutos: a.entro ? Math.round(ms / 60_000) : null }));
}

// ── Las frases ────────────────────────────────────────────────────────────────

export interface FraseVista {
  participante: string;
  inicio: Date;
  fin: Date | null;
  texto: string;
  idioma: string | null;
}

export interface FraseParaGuardar {
  orden: number;
  hablante: string;
  correo: string | null;
  inicio: Date;
  fin: Date | null;
  texto: string;
  idioma: string | null;
}

/**
 * Las frases de todas las transcripciones de la reunión, en orden y sin repetir: una conferencia puede tener dos
 * transcripciones con las mismas frases (U2: 421 y 421).
 */
export function frasesParaGuardar(
  frases: readonly FraseVista[],
  hablanteDe: ReadonlyMap<string, { mostrado: string; correo: string | null }>,
): FraseParaGuardar[] {
  const vistas = new Set<string>();
  const unicas: FraseVista[] = [];
  for (const f of frases) {
    const clave = `${f.participante}|${f.inicio.getTime()}|${f.texto}`;
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    unicas.push(f);
  }
  unicas.sort(porInicio);
  return unicas.map((f, i) => {
    const h = hablanteDe.get(f.participante);
    return { orden: i + 1, hablante: h?.mostrado ?? "Sin nombre", correo: h?.correo ?? null, inicio: f.inicio, fin: f.fin, texto: f.texto, idioma: f.idioma };
  });
}

const hhmmss = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(Math.floor(s / 3600))}:${p(Math.floor((s % 3600) / 60))}:${p(s % 60)}`;
};

/** Una marca de tiempo cada tanto, como en la transcripción de Gemini: al cambiar de hablante, si pasó un minuto. */
const MARCA_CADA_MS = 60_000;

/**
 * El texto de la reunión armado con sus frases, con la forma de la transcripción de Gemini: encabezado
 * «<título> - Transcripción» (lo que lib/sessions/texto-de-otra-reunion.ts reconoce como propio), marcas de tiempo
 * desde el inicio de la conferencia y una línea «Nombre: lo que dijo» por turno. null si no hay frases.
 */
export function textoDeLasFrases(titulo: string, frases: readonly { hablante: string; inicio: Date; texto: string }[]): string | null {
  if (frases.length === 0) return null;
  const origen = frases[0].inicio.getTime();
  const lineas: string[] = [`${titulo.trim()} - Transcripción`];
  let ultimaMarca = -Infinity;
  let turno: { hablante: string; partes: string[] } | null = null;
  const cerrar = () => {
    if (turno) lineas.push(`${turno.hablante}: ${turno.partes.join(" ")}`);
    turno = null;
  };
  for (const f of frases) {
    const t = f.inicio.getTime();
    if (turno && turno.hablante === f.hablante) {
      turno.partes.push(f.texto);
      continue;
    }
    cerrar();
    if (t - ultimaMarca >= MARCA_CADA_MS) {
      lineas.push(hhmmss(t - origen));
      ultimaMarca = t;
    }
    turno = { hablante: f.hablante.replace(/:/g, " ").trim() || "Sin nombre", partes: [f.texto] };
  }
  cerrar();
  return lineas.join("\n").slice(0, MAX_TRANSCRIPT_CHARS);
}

/** Lo que ya tiene guardado la reunión como transcripción. */
export type TranscripcionGuardada = "vacia" | "propia" | "ajena";

/** Las palabras que distinguen una conversación (sin tildes, de 5 letras o más). */
function palabrasDe(texto: string): Set<string> {
  return new Set(
    texto
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .split(/[^a-z0-9ñ]+/)
      .filter((w) => w.length >= 5),
  );
}

/**
 * ¿Dos textos son la misma conversación? La transcripción del Doc y la de las frases de Meet dicen lo mismo con otra
 * forma: comparten casi todas sus palabras. Una de otro día de la misma serie (mismo título, mismo encabezado) comparte
 * pocas. Más de la mitad de las palabras del más corto = la misma.
 */
export function mismaConversacion(a: string, b: string): boolean {
  const pa = palabrasDe(a);
  const pb = palabrasDe(b);
  const menor = Math.min(pa.size, pb.size);
  if (menor === 0) return false;
  let comunes = 0;
  for (const w of pa) if (pb.has(w)) comunes++;
  return comunes / menor > 0.5;
}

/**
 * Qué es la transcripción guardada, con las frases de esta conferencia a la vista. «Propia» por el encabezado no alcanza:
 * en una serie con el mismo título, la de otro día también lo es. Con las frases enteras, una propia que no es la misma
 * conversación es de otra reunión.
 */
export function transcripcionGuardada(e: { largo: number; propiaPorEncabezado: boolean; texto: string | null; textoFrases: string | null }): TranscripcionGuardada {
  if (e.largo < MIN_TRANSCRIPT_CHARS) return "vacia";
  if (!e.propiaPorEncabezado) return "ajena";
  if (e.texto && e.textoFrases && e.textoFrases.length >= MIN_TRANSCRIPT_CHARS && !mismaConversacion(e.texto, e.textoFrases)) return "ajena";
  return "propia";
}

/**
 * ¿El texto armado con las frases reemplaza a la transcripción? Las frases son la primera fuente (el orden: las frases,
 * el Doc de la transcripción, el Doc de las notas, el Drive), pero lo que ya tiene una reunión no se toca sin una regla
 * clara: entra si no había transcripción, o si la que hay es de otra reunión (su encabezado nombra otra, o no es de una
 * reunión). Una transcripción propia se queda: es la misma conversación, y cambiarla rehace la lectura.
 */
export function usarLasFrases(textoFrases: string | null, guardada: TranscripcionGuardada): boolean {
  if (!textoFrases || textoFrases.trim().length < MIN_TRANSCRIPT_CHARS) return false;
  return guardada !== "propia";
}

/**
 * ¿La reunión vuelve a la cola de lectura (`enrichedAt` en null, como cuando aparece un Doc nuevo en el evento)? Cuando
 * llegaron frases nuevas y la transcripción guardada está vacía o es de otra reunión, o cuando Meet dice por primera vez
 * cuál es su Doc y la reunión no tiene ni texto ni notas. Solo se decide al copiar: si nada cambia, no se vuelve a pedir.
 */
export function vuelveALeerse(e: { guardada: TranscripcionGuardada; frasesNuevas: boolean; docNuevo: boolean; tieneNotas: boolean }): boolean {
  if (e.guardada === "propia") return false;
  if (e.frasesNuevas) return true;
  return e.docNuevo && e.guardada === "vacia" && !e.tieneNotas;
}

/** Lo leído del Doc, como lo ve esta regla (la misma forma que `LecturaDoc`, lib/google/enrich-retry.ts). */
export type Leida =
  | { ok: true; transcript: string | null; summary: { overview: string } | null; diagnostico: { tabsVistos: string[]; motivo: string } | null }
  | { ok: false; error: string; status: number | null };

/**
 * La lectura con las frases, o null si las frases no cambian nada. `guardada` = la transcripción que ya tiene la reunión
 * (`transcripcionGuardada`); `textoGuardado`, su texto; `hayNotasGuardadas`, si ya tenía notas.
 *   · vacía o de otra reunión → el texto de las frases, con las notas del Doc. Si el Doc no trae notas, quedan sin notas
 *     y se resumen (con otra reunión, las notas guardadas salieron del mismo documento ajeno: no se conservan);
 *   · vacía, el Doc falló y la reunión ya tenía notas → null: sigue siendo un fallo y se reintenta, así las notas de
 *     Gemini no se reemplazan por un resumen de Claude;
 *   · propia y el Doc se leyó → se queda la guardada aunque el Doc traiga otra versión: es la misma conversación, y
 *     cambiarla rehace la lectura;
 *   · propia y el Doc falló → null: sigue siendo un fallo y las notas se reintentan.
 */
export function lecturaConFrases(e: {
  textoFrases: string | null;
  guardada: TranscripcionGuardada;
  leida: Leida;
  textoGuardado: string | null;
  hayNotasGuardadas: boolean;
}): Leida | null {
  if (!e.textoFrases) return null;
  const tabsVistos = e.leida.ok ? (e.leida.diagnostico?.tabsVistos ?? []) : [];
  if (usarLasFrases(e.textoFrases, e.guardada)) {
    if (!e.leida.ok && e.guardada === "vacia" && e.hayNotasGuardadas) return null;
    return { ok: true, transcript: e.textoFrases, summary: e.leida.ok ? e.leida.summary : null, diagnostico: { tabsVistos, motivo: "frases_de_meet" } };
  }
  if (e.guardada !== "propia" || !e.leida.ok || !e.textoGuardado) return null;
  return { ok: true, transcript: e.textoGuardado, summary: e.leida.summary, diagnostico: e.leida.diagnostico };
}
