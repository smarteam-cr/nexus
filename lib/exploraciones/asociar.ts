/**
 * lib/exploraciones/asociar.ts — QUÉ REUNIÓN ES LA DE CADA SESIÓN PLANEADA, sin que nadie la busque (K5 del roadmap,
 * 2026-10-27). PURO.
 *
 * Hasta acá, en un cliente o un proyecto solo entraba a la exploración la reunión que alguien unía a mano («+ Agregar
 * sesión»), y en un prospecto la reunión entraba sola pero como una pestaña aparte, sin unirse a la sesión planeada para
 * ella («Sesión 2 · Marketing» quedaba vacía al lado de la reunión de marketing). Ahora Nexus mira las reuniones recientes
 * de la empresa y, cuando una calza con una sesión planeada, pregunta arriba del lienzo «¿Es la sesión 2 con Marketing?».
 *
 * SOLO SIN DUDA se asocia sola (la escribe el job `exploraciones-asociar`, asociar-server.ts). Sin duda es todo esto a la
 * vez: calza con UNA sola sesión libre y esa sesión con UNA sola reunión; el título dice exploración, diagnóstico o el
 * nombre (o el equipo) de la sesión; estuvo alguien de un dominio registrado de la empresa; la empresa no tuvo reuniones
 * con Customer Success en las últimas semanas (una de seguimiento de CS se parece a una de exploración); y la reunión no
 * es ya la sesión de OTRA exploración de la empresa. Con cualquier duda, la pregunta, con sus dudas a la vista.
 *
 * ⛔ Nunca cruza clientes: las reuniones candidatas llegan YA del chokepoint (lib/sessions/project-sources.ts ›
 * getClientSessions, por `resolvedClientId`). Acá no se decide de quién es una reunión: solo cuál sesión de la exploración
 * es. No hay matching reunión→cliente (eso vive en lib/sessions/categorize.ts).
 */
import { EQUIPOS, equiposQueNombra, type ClaveDeEquipo } from "./equipos";
import { invitadosDelEvento } from "./agendadas";
import { claveDeReunion, nombreDeLaPestana, type PestanaDeSesion } from "./guia";
import { hoyEnCostaRica } from "./fechas";

/** Hasta cuántos días atrás se mira una reunión para sugerirla. */
export const DIAS_PARA_SUGERIR = 21;
/** Cuántos días atrás cuentan las reuniones con Customer Success para dudar. */
export const DIAS_DE_CUSTOMER_SUCCESS = 28;
/** Hasta cuántos días de distancia una fecha planeada «calza» con la de la reunión. */
export const DIAS_DE_HOLGURA = 3;
/** Cuántas preguntas se muestran a la vez arriba del lienzo. */
export const MAX_SUGERENCIAS_A_LA_VISTA = 3;

/** Una reunión de la empresa que ya ocurrió (del chokepoint). */
export interface ReunionCandidata {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  participantes: readonly string[];
}

/**
 * Por qué calza. Medido el 2026-10-27 en producción (solo lectura, 38 exploraciones vivas): «es la única sesión que espera»
 * sin nada más proponía reuniones quincenales de Customer Success y aterrizajes como sesiones; se sacó. Calza solo por el
 * título (el equipo, el nombre de la sesión o «exploración / diagnóstico») o por la fecha planeada.
 */
export type SenalDeAsociacion = "equipo" | "titulo" | "fecha" | "exploracion";

export interface SugerenciaDeAsociacion {
  reunion: { id: string; titulo: string; fecha: string };
  /** La sesión planeada con que calza; null = ninguna planeada, pero el título dice exploración: «¿Es una sesión?». */
  sesion: { id: string; numero: number } | null;
  /** «¿Es la sesión 2 con Marketing?». */
  pregunta: string;
  /** Por qué Nexus cree que es, en una línea. */
  porque: string;
  senales: SenalDeAsociacion[];
  /** Sin duda: el job la asocia sola. */
  sola: boolean;
  /** Por qué no se asocia sola (vacío si `sola`). */
  dudas: string[];
}

export interface EntradaDeAsociar {
  pestanas: readonly PestanaDeSesion[];
  candidatas: readonly ReunionCandidata[];
  /** Las claves `meet:<id>` que alguien sacó de la exploración o dijo que no son una sesión. */
  fuera: ReadonlySet<string>;
  descartadas: ReadonlySet<string>;
  /** Los dominios de Smarteam (las categorías internas). */
  internos: ReadonlySet<string>;
  /** Los dominios registrados de la empresa (`Client.emailDomains`). */
  dominiosDeLaEmpresa: readonly string[];
  /** Los correos del equipo de Customer Success (CSE y CSL activos). */
  customerSuccess: ReadonlySet<string>;
  /** Las reuniones de Meet que ya son la sesión de OTRA exploración de la misma empresa. */
  enOtraExploracion: ReadonlySet<string>;
  ahora: number;
}

const DIA = 24 * 60 * 60 * 1000;

const sinTildes = (t: string) =>
  t
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");

/** El título dice que es una sesión de exploración. */
const DE_EXPLORACION = /\b(exploracion|diagnostico|descubrimiento|discovery|levantamiento|sesion de trabajo|entendimiento)\b/;

export function tituloDeExploracion(titulo: string): boolean {
  return DE_EXPLORACION.test(sinTildes(titulo));
}

/** Palabras que no distinguen un título de otro. */
const VACIAS = new Set([
  "sesion", "sesiones", "reunion", "reuniones", "llamada", "smarteam", "hubspot", "con", "para", "del", "las", "los", "una", "uno",
  "por", "que", "and", "the", "meet", "equipo", "seguimiento", "revision", "semana", "cliente",
]);

const palabras = (t: string) =>
  sinTildes(t)
    .split(/[^a-z0-9ñ]+/)
    .filter((p) => p.length >= 4 && !VACIAS.has(p));

/** ¿El título de la reunión trae TODAS las palabras que distinguen el título de la sesión? (con al menos una) */
export function tituloCalza(deLaSesion: string, deLaReunion: string): boolean {
  const sesion = [...new Set(palabras(deLaSesion))];
  if (!sesion.length) return false;
  const reunion = new Set(palabras(deLaReunion));
  return sesion.every((p) => reunion.has(p));
}

const dominioDe = (c: string) => c.split("@")[1]?.trim().toLowerCase() ?? "";

/** El nombre de la sesión en la pregunta: «la sesión 2 con Marketing», «la sesión 3 («Tecnología y datos»)». */
export function nombreEnLaPregunta(p: Pick<PestanaDeSesion, "numero" | "noSeHizo" | "sesion">): string {
  const base = nombreDeLaPestana(p).toLowerCase().replace(/^sesión/, "la sesión");
  const equipo = p.sesion?.equipo;
  if (equipo) return `${base} con ${EQUIPOS[equipo].nombre}`;
  const titulo = p.sesion?.titulo?.trim();
  return titulo ? `${base} («${titulo}»)` : base;
}

interface Calce {
  pestana: PestanaDeSesion;
  senales: SenalDeAsociacion[];
  fuerza: number;
}

/**
 * Las sesiones planeadas que esperan su reunión: sin reunión, sin un resultado, sin un evento del calendario vivo y sin que
 * alguien la marcara hecha sin reunión (esa ya se dio por cerrada así).
 */
export function sesionesLibres(pestanas: readonly PestanaDeSesion[]): PestanaDeSesion[] {
  return pestanas.filter((p) => {
    const s = p.sesion;
    if (!s || p.reunion || p.noSeHizo || s.resultado || s.reunion || s.hecha) return false;
    // Unida a un evento que sigue en pie: su reunión llega por el evento (guia.ts › reunionDeLaSesion).
    return !(s.evento && !s.evento.cancelada);
  });
}

function calces(r: ReunionCandidata, libres: readonly PestanaDeSesion[]): Calce[] {
  const equiposDeLaReunion = equiposQueNombra(r.titulo);
  const deExploracion = tituloDeExploracion(r.titulo);
  const diaDeLaReunion = hoyEnCostaRica(new Date(r.fecha));
  const out: Calce[] = [];
  for (const p of libres) {
    const s = p.sesion!;
    const senales: SenalDeAsociacion[] = [];
    let fuerza = 0;
    if (s.equipo && equiposDeLaReunion.length === 1 && equiposDeLaReunion[0] === (s.equipo as ClaveDeEquipo)) {
      senales.push("equipo");
      fuerza += 2;
    }
    if (s.titulo?.trim() && tituloCalza(s.titulo, r.titulo)) {
      senales.push("titulo");
      fuerza += 2;
    }
    if (s.fecha && Math.abs(Date.parse(`${s.fecha}T12:00:00-06:00`) - Date.parse(`${diaDeLaReunion}T12:00:00-06:00`)) <= DIAS_DE_HOLGURA * DIA) {
      senales.push("fecha");
      fuerza += 1;
    }
    const generica = !s.equipo && !s.titulo?.trim() && !s.fecha;
    if (generica && deExploracion) {
      senales.push("exploracion");
      fuerza += 1;
    }
    // Una sesión de un equipo no calza con una reunión que nombra a OTRO equipo, aunque la fecha se acerque.
    if (s.equipo && equiposDeLaReunion.length > 0 && !equiposDeLaReunion.includes(s.equipo)) continue;
    if (fuerza > 0) out.push({ pestana: p, senales, fuerza });
  }
  return out.sort((a, b) => b.fuerza - a.fuerza || a.pestana.numero - b.pestana.numero);
}

const POR_QUE: Record<SenalDeAsociacion, string> = {
  equipo: "el título nombra al mismo equipo",
  titulo: "el título calza con el de la sesión",
  fecha: "la fecha está cerca de la planeada",
  exploracion: "el título dice que es una exploración",
};

/**
 * Las preguntas (y las asociaciones sin duda) de una exploración. Una reunión, a lo más una pregunta: la de la sesión con
 * que mejor calza. La más reciente primero.
 */
export function sugerirAsociaciones(o: EntradaDeAsociar): SugerenciaDeAsociacion[] {
  const libres = sesionesLibres(o.pestanas);
  // Lo que ya es de una sesión planeada (en un prospecto, las que entraron solas sin sesión SÍ se pueden sugerir).
  const usadas = new Set(o.pestanas.flatMap((p) => (p.sesion && p.reunion ? [claveDeReunion(p.reunion)] : [])));
  const registrados = new Set(o.dominiosDeLaEmpresa.map((d) => d.trim().toLowerCase()).filter(Boolean));
  const desde = o.ahora - DIAS_PARA_SUGERIR * DIA;

  const deAfuera = (r: ReunionCandidata) => invitadosDelEvento({ attendees: r.participantes.map((email) => ({ email })) }).filter((c) => !o.internos.has(dominioDe(c)));
  const candidatas = o.candidatas.filter((r) => {
    const k = `meet:${r.id}`;
    const t = Date.parse(r.fecha);
    return t >= desde && t <= o.ahora && !usadas.has(k) && !o.fuera.has(k) && !o.descartadas.has(k) && deAfuera(r).length > 0;
  });

  // Las reuniones con Customer Success de las últimas semanas que NO son de la exploración: una así hace dudar.
  const desdeCs = o.ahora - DIAS_DE_CUSTOMER_SUCCESS * DIA;
  const conCustomerSuccess = o.candidatas.some(
    (r) =>
      Date.parse(r.fecha) >= desdeCs &&
      !usadas.has(`meet:${r.id}`) &&
      !tituloDeExploracion(r.titulo) &&
      r.participantes.some((c) => o.customerSuccess.has(c.trim().toLowerCase())),
  );

  const porReunion = new Map(candidatas.map((r) => [r.id, calces(r, libres)]));
  // Cuántas reuniones calzan con cada sesión: dos reuniones para la misma sesión es duda.
  const reunionesPorSesion = new Map<string, number>();
  for (const lista of porReunion.values()) for (const c of lista) reunionesPorSesion.set(c.pestana.clave, (reunionesPorSesion.get(c.pestana.clave) ?? 0) + 1);

  const out: SugerenciaDeAsociacion[] = [];
  const sesionesTomadas = new Set<string>();
  for (const r of [...candidatas].sort((a, b) => b.fecha.localeCompare(a.fecha))) {
    // Las dudas se cuentan con TODAS las sesiones que calzan: una ya tomada por otra reunión sigue siendo una duda.
    const todasLasQueCalzan = porReunion.get(r.id) ?? [];
    const lista = todasLasQueCalzan.filter((c) => !sesionesTomadas.has(c.pestana.clave));
    const mejor = lista[0];
    const reunion = { id: r.id, titulo: r.titulo, fecha: r.fecha };
    if (!mejor) {
      // Ninguna sesión planeada calza, pero el título dice exploración: «¿Es una sesión de la exploración?».
      if (tituloDeExploracion(r.titulo)) {
        out.push({
          reunion,
          sesion: null,
          pregunta: "¿Es una sesión de la exploración?",
          porque: "El título dice que es una exploración y ninguna sesión planeada la espera.",
          senales: ["exploracion"],
          sola: false,
          dudas: ["No hay una sesión planeada para ella: agregarla es tu decisión."],
        });
      }
      continue;
    }
    sesionesTomadas.add(mejor.pestana.clave);
    const dudas: string[] = [];
    if (todasLasQueCalzan.length > 1) dudas.push("Calza con más de una sesión planeada.");
    if ((reunionesPorSesion.get(mejor.pestana.clave) ?? 0) > 1) dudas.push("Otra reunión reciente también calza con esa sesión.");
    if (!(mejor.senales.includes("equipo") || mejor.senales.includes("titulo") || tituloDeExploracion(r.titulo))) {
      dudas.push("El título no dice exploración ni el nombre de la sesión.");
    }
    if (!r.participantes.some((c) => registrados.has(dominioDe(c.trim().toLowerCase())))) dudas.push("No estuvo nadie de un dominio registrado de la empresa.");
    if (conCustomerSuccess) dudas.push("La empresa tuvo reuniones con Customer Success en las últimas semanas.");
    if (o.enOtraExploracion.has(r.id)) dudas.push("Ya es una sesión de otra exploración de la empresa.");
    const nombre = nombreEnLaPregunta(mejor.pestana);
    const porque = mejor.senales.map((s) => POR_QUE[s]);
    out.push({
      reunion,
      sesion: { id: mejor.pestana.sesion!.id, numero: mejor.pestana.numero },
      pregunta: `¿Es ${nombre}?`,
      porque: `${porque[0].charAt(0).toUpperCase()}${porque[0].slice(1)}${porque.length > 1 ? ` y ${porque.slice(1).join(" y ")}` : ""}.`,
      senales: mejor.senales,
      sola: dudas.length === 0,
      dudas,
    });
  }
  return out;
}

/** La huella de lo que muestra el lienzo: si cambia, el lienzo se vuelve a leer solo (K5 etapa 3). */
export function huellaDelLienzo(o: { version: number; actualizadaEn: string; reuniones: readonly { origen: string; id: string; leida?: boolean; texto?: string }[] }): string {
  const reuniones = o.reuniones
    .map((r) => `${claveDeReunion(r)}${r.leida ? "+" : ""}${r.texto ? `/${r.texto}` : ""}`)
    .sort()
    .join(",");
  return `${o.version}|${o.actualizadaEn}|${reuniones}`;
}
