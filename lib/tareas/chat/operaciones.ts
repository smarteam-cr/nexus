/**
 * lib/tareas/chat/operaciones.ts — lo que el chat de tareas puede acordar: una lista CERRADA (docs/tareas-plan.md
 * §6.4). PURO y CLIENT-SAFE: lo usan el turno, la ruta que aplica y la pantalla.
 *
 * Dos formas de la misma operación:
 *   - la que escribe el modelo, con etiquetas que valen en ESE turno (M# personas, C# clientes, H# proyectos de
 *     HubSpot, R# proyectos de tareas, E# espacios), T-# (estable) y refs propias («onb1»);
 *   - la que se GUARDA en el acuerdo: con ids (correos, clientId, projectId, id del proyecto), la fecha ya calculada y
 *     un `origen` fijo. Si entre dos turnos cambia la lista de clientes, un pendiente no cambia de cliente.
 * `prepararOperacionesDeTareas` pasa de una a la otra contra la FOTO de quien pide (lo que ve, lo que puede hacer) y
 * rechaza con un motivo que vuelve al modelo una vez. Nada de esto escribe: aplicar es de lib/tareas/mutaciones.ts.
 */
import { voseoEnProsa } from "@/lib/ui/voseo-formas";
import { EQUIPOS } from "../equipos";
import { nacePropuesta, PRIORIDADES, type Prioridad } from "../estados";
import { CLAVES_DE_VENCIMIENTO, venceDesdeClave, type ClaveDeVencimiento } from "../fechas";
import { esCandidataClara, huellaDeTexto, masParecidas, normalizar as normalizarTexto } from "../texto";
import { hoyEnCostaRica, lunesDeFecha, lunesDeHoy, primeraSemanaSinRevisar, sumarSemanas } from "../semana";
import { fechaDelDiaHabil } from "./plan";
import { limpiarContexto } from "../contexto-de-tarea";

/* ── Los nombres ─────────────────────────────────────────────────────────────────────────────────────────────── */

export const OPERACIONES_DE_TAREAS = [
  "tarea.crear",
  "tarea.editar",
  "tarea.asignar",
  "tarea.mover-semana",
  "tarea.depender",
  "proyecto.crear",
  "proyecto.editar",
] as const;
export type NombreDeOperacion = (typeof OPERACIONES_DE_TAREAS)[number];

/** Los «cuándo» que entiende el chat (más una fecha `AAAA-MM-DD` que la persona haya escrito). */
export const CUANDOS = [...CLAVES_DE_VENCIMIENTO, "fin_de_mes", "sin_semana", "mas_adelante"] as const;

export const CAMPOS_DE_TAREA = ["titulo", "prioridad", "vence", "minutos", "notas", "etiquetas", "cliente", "proyecto", "seccion"] as const;
export type CampoDeTarea = (typeof CAMPOS_DE_TAREA)[number];

export const CAMPOS_DE_PROYECTO = ["nombre", "vence", "responsable", "secciones", "estado"] as const;
export type CampoDeProyecto = (typeof CAMPOS_DE_PROYECTO)[number];

export const ESTADOS_DE_PROYECTO_DEL_CHAT = ["activo", "en_pausa", "terminado"] as const;

/** Topes de un acuerdo. */
export const MAX_OPERACIONES_DEL_CHAT = 40;
export const MAX_TAREAS_DE_UN_PLAN = 30;
export const LARGO_DEL_TITULO_DEL_CHAT = 60;

/* ── La forma guardada ───────────────────────────────────────────────────────────────────────────────────────── */

export type ParaQuienDelChat = { tipo: "yo" } | { tipo: "persona"; email: string } | { tipo: "equipo"; clave: string } | { tipo: "nadie" };
export type RefATarea = { numero: number } | { ref: string };
export type RefAProyecto = { id: string } | { ref: string };

/** Cuándo, ya calculado: la semana (lunes) y la fecha límite, si hay. `null` en las dos = «Más adelante». */
export interface CuandoCalculado {
  semana: string | null;
  vence: string | null;
}

export type OperacionDeTareas =
  | {
      op: "tarea.crear";
      /** Fijo desde el turno en que se acordó: hace que aplicar dos veces no duplique. */
      origen?: string;
      ref?: string;
      titulo: string;
      para: ParaQuienDelChat;
      modo: "proponer" | "asignar";
      /** La persona pidió «asígnale» y no puede: queda como propuesta, y la línea lo dice. */
      pidioAsignar?: boolean;
      cuando?: CuandoCalculado;
      /** Un día hábil del plan, contado desde el inicio de su proyecto (la fecha la calcula el código). */
      dia?: number;
      minutos?: number;
      prioridad?: Prioridad;
      clientId?: string;
      projectId?: string;
      proyecto?: RefAProyecto;
      seccion?: string;
      despuesDe?: RefATarea[];
      etiquetas?: string[];
      /** Lo escribe el modelo: para qué es, para quién y qué se espera (lib/tareas/contexto-de-tarea.ts). */
      contexto?: string;
      /**
       * La reunión de la que salió lo que el modelo leyó en ese turno (el chip). La pone el SERVIDOR al sellar, nunca el
       * modelo: ata la tarea a esa reunión para que su contexto se vea con la regla de la cita.
       */
      sesion?: string;
      notas?: string;
      privada?: boolean;
    }
  | { op: "tarea.editar"; tarea: RefATarea; campo: CampoDeTarea; valor: string | number | string[] | null }
  | { op: "tarea.asignar"; tarea: RefATarea; para: ParaQuienDelChat; modo: "proponer" | "asignar"; pidioAsignar?: boolean }
  | { op: "tarea.mover-semana"; tarea: RefATarea; cuando: CuandoCalculado }
  | { op: "tarea.depender"; tarea: RefATarea; despuesDe: RefATarea[] }
  | {
      op: "proyecto.crear";
      origen?: string;
      ref: string;
      nombre: string;
      espacioId: string;
      clientId?: string;
      projectId?: string;
      inicia?: string;
      vence?: string;
      responsableEmail?: string;
      secciones?: string[];
    }
  | { op: "proyecto.editar"; proyecto: RefAProyecto; campo: CampoDeProyecto; valor: string | string[] | null };

/* ── La foto: lo que ve y puede quien pide (la arma el servidor; acá solo se lee) ─────────────────────────────── */

export interface PersonaDeLaFoto {
  email: string;
  nombre: string;
  equipo: string;
  equipoNombre: string;
}

export interface TareaDeLaFoto {
  id: string;
  numero: number;
  titulo: string;
  estado: string;
  responsableEmail: string | null;
  equipo: string | null;
  semana: string | null;
  clientId: string | null;
  proyectoId: string | null;
  abierta: boolean;
  acciones: { editar: boolean; reasignar: boolean; tomar: boolean; moverDeSemana: boolean; cambiarPrivada: boolean };
}

export interface ProyectoDeLaFoto {
  id: string;
  nombre: string;
  estado: string;
  clientId: string | null;
  projectId: string | null;
  espacioTipo: string;
  /** Los miembros de su espacio, si es libre (entre ellos se asigna directo). */
  miembrosDelEspacio: readonly string[];
  administra: boolean;
  iniciaEl: string | null;
}

export interface FotoDeTareas {
  ahora: Date;
  yo: PersonaDeLaFoto & { lidera: readonly string[]; esSuperAdmin: boolean };
  /** Etiqueta → dato, para lo que el modelo vio en ESTE turno. */
  personas: ReadonlyMap<string, PersonaDeLaFoto>;
  clientes: ReadonlyMap<string, { id: string; nombre: string }>;
  proyectosHubspot: ReadonlyMap<string, { id: string; nombre: string; clientId: string }>;
  proyectos: ReadonlyMap<string, ProyectoDeLaFoto>;
  espacios: ReadonlyMap<string, { id: string; nombre: string; puedeCrear: boolean }>;
  /** Por id: todo lo que ve quien pide (no solo lo etiquetado), para revalidar lo pendiente. */
  personasPorEmail: ReadonlyMap<string, PersonaDeLaFoto>;
  clientesVisibles: ReadonlySet<string>;
  nombresDeClientes: ReadonlyMap<string, string>;
  proyectosHubspotPorId: ReadonlyMap<string, { nombre: string; clientId: string }>;
  proyectosPorId: ReadonlyMap<string, ProyectoDeLaFoto>;
  espaciosPorId: ReadonlyMap<string, { nombre: string; puedeCrear: boolean }>;
  /** Las T-# nombradas en el turno (más las abiertas de quien pide), con lo que puede hacer con cada una. */
  tareas: ReadonlyMap<number, TareaDeLaFoto>;
  /** Equipos con líder (a esos se les puede pedir). */
  equiposConLider: ReadonlySet<string>;
  /** Las semanas que quien pide ya revisó (lo suyo no cae ahí). */
  semanasRevisadas: ReadonlySet<string>;
}

/* ── Utilidades ──────────────────────────────────────────────────────────────────────────────────────────────── */

const esTexto = (v: unknown): v is string => typeof v === "string" && v.trim().length > 0;
const esRef = (v: unknown): v is string => typeof v === "string" && /^[a-z][a-z0-9_-]{0,23}$/i.test(v.trim()) && !/^[MCHRE]\d+$/.test(v.trim());

function finDeMes(fecha: string): string {
  const [a, m] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const sinTildes = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** ¿La persona escribió esa fecha? Como `AAAA-MM-DD`, `d/m` o «15 de octubre». */
export function fechaDichaEnElMensaje(fecha: string, mensaje: string): boolean {
  const [, m, d] = fecha.split("-").map(Number);
  const t = sinTildes(mensaje);
  if (t.includes(fecha)) return true;
  if (new RegExp(`(^|[^\\d])0?${d}/0?${m}([^\\d]|$)`).test(t)) return true;
  const mes = MESES[m - 1];
  return new RegExp(`(^|[^\\d])0?${d}\\s+de\\s+${mes}`).test(t) || (mes === "septiembre" && new RegExp(`(^|[^\\d])0?${d}\\s+de\\s+setiembre`).test(t));
}

/**
 * El «cuándo» del modelo, calculado desde hoy (hora de Costa Rica). `null` si no se entiende. Un día de la semana
 * es el próximo con ese nombre; «esta semana» y «la próxima» no ponen fecha límite.
 */
export function calcularCuando(cuando: unknown, ahora: Date): CuandoCalculado | null {
  if (typeof cuando !== "string") return null;
  const c = cuando.trim();
  const hoy = lunesDeHoy(ahora);
  if (c === "sin_semana" || c === "mas_adelante") return { semana: null, vence: null };
  if (c === "esta_semana") return { semana: hoy, vence: null };
  if (c === "proxima_semana") return { semana: sumarSemanas(hoy, 1), vence: null };
  if (c === "fin_de_mes") {
    const vence = finDeMes(hoyEnCostaRica(ahora));
    return { semana: lunesDeFecha(vence), vence };
  }
  if ((CLAVES_DE_VENCIMIENTO as readonly string[]).includes(c)) {
    const vence = venceDesdeClave(c as ClaveDeVencimiento, ahora);
    return vence ? { semana: lunesDeFecha(vence), vence } : null;
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(c) && !Number.isNaN(Date.parse(`${c}T00:00:00Z`))) return { semana: lunesDeFecha(c), vence: c };
  return null;
}

/* ── De lo que escribió el modelo a lo que se guarda ─────────────────────────────────────────────────────────── */

export interface RechazoDeTareas {
  indice: number;
  operacion: unknown;
  motivo: string;
}

export interface PreparadasDeTareas {
  aceptadas: OperacionDeTareas[];
  rechazadas: RechazoDeTareas[];
}

/** Un proyecto nuevo del lote: cuándo empieza y de quién es (sus tareas no pueden ser de otro cliente). */
export interface ProyectoDelLote {
  inicia: string | null;
  clientId?: string | null;
  projectId?: string | null;
}

/** Lo que el lote de este turno puede referenciar además de la foto: las refs de lo pendiente. */
export interface RefsConocidas {
  proyectos: ReadonlyMap<string, ProyectoDelLote>;
  tareas: ReadonlySet<string>;
  /** Las tareas nuevas que van dentro de un proyecto nuevo (un plan): no se asignan ni se mueven hasta activarlo. */
  tareasDePlan?: ReadonlySet<string>;
}

export const SIN_REFS: RefsConocidas = { proyectos: new Map(), tareas: new Set(), tareasDePlan: new Set() };

type Lote = { proyectos: ReadonlyMap<string, ProyectoDelLote>; tareas: ReadonlySet<string>; tareasDePlan: ReadonlySet<string> };

class Rechazo extends Error {}
const rechazar = (motivo: string): never => {
  throw new Rechazo(motivo);
};

/** Las T-# que nombra un lote crudo (para que el servidor las cargue en la foto antes de validar). */
export function numerosNombrados(crudas: readonly unknown[]): number[] {
  const nums = new Set<number>();
  const visitar = (v: unknown) => {
    if (typeof v === "string") {
      const m = /^T-?(\d{1,7})$/i.exec(v.trim());
      if (m) nums.add(Number(m[1]));
    } else if (typeof v === "number" && Number.isInteger(v) && v > 0) nums.add(v);
  };
  for (const o of crudas) {
    if (!o || typeof o !== "object") continue;
    const x = o as Record<string, unknown>;
    visitar(x.tarea);
    if (Array.isArray(x.despuesDe)) x.despuesDe.forEach(visitar);
  }
  return [...nums];
}

/**
 * Prueba en seco lo que el modelo propuso en este turno y lo normaliza a ids. `mensaje` es lo que escribió la
 * persona en ESTE turno: una fecha exacta solo vale si está ahí. Las refs nuevas conviven con las de lo pendiente.
 */
export function prepararOperacionesDeTareas(foto: FotoDeTareas, crudas: readonly unknown[], mensaje: string, conocidas: RefsConocidas = SIN_REFS): PreparadasDeTareas {
  const aceptadas: OperacionDeTareas[] = [];
  const rechazadas: RechazoDeTareas[] = [];
  // Las refs del lote: primero los proyectos (una tarea puede nombrar uno que se crea más abajo).
  const proyectosDelLote = new Map<string, ProyectoDelLote>(conocidas.proyectos);
  const tareasDelLote = new Set<string>(conocidas.tareas);
  const tareasDePlan = new Set<string>(conocidas.tareasDePlan ?? []);
  for (const o of crudas) {
    if (!o || typeof o !== "object") continue;
    const x = o as Record<string, unknown>;
    if (x.op === "proyecto.crear" && esRef(x.ref)) {
      const inicia = calcularCuando(x.inicia, foto.ahora);
      let ch: { clientId?: string; projectId?: string } = {};
      try {
        ch = clienteYProyectoHubspot(foto, x.cliente, x.proyectoHubspot);
      } catch (e) {
        if (!(e instanceof Rechazo)) throw e; // ese proyecto se rechaza abajo, con su motivo
      }
      proyectosDelLote.set(x.ref.trim(), { inicia: inicia?.vence ?? inicia?.semana ?? null, clientId: ch.clientId ?? null, projectId: ch.projectId ?? null });
    }
  }
  for (const o of crudas) {
    if (!o || typeof o !== "object") continue;
    const x = o as Record<string, unknown>;
    if (x.op !== "tarea.crear" || !esRef(x.ref)) continue;
    tareasDelLote.add(x.ref.trim());
    const pr = typeof x.proyecto === "string" ? x.proyecto.trim() : "";
    if (pr && !foto.proyectos.has(pr) && proyectosDelLote.has(pr)) tareasDePlan.add(x.ref.trim());
  }
  const lote: Lote = { proyectos: proyectosDelLote, tareas: tareasDelLote, tareasDePlan };

  crudas.slice(0, MAX_OPERACIONES_DEL_CHAT).forEach((o, indice) => {
    try {
      aceptadas.push(normalizar(foto, o, mensaje, lote));
    } catch (e) {
      if (!(e instanceof Rechazo)) throw e;
      rechazadas.push({ indice, operacion: o, motivo: e.message });
    }
  });
  crudas.slice(MAX_OPERACIONES_DEL_CHAT).forEach((o, i) => rechazadas.push({ indice: MAX_OPERACIONES_DEL_CHAT + i, operacion: o, motivo: `como mucho ${MAX_OPERACIONES_DEL_CHAT} cambios por acuerdo` }));

  // Un plan: como mucho 30 tareas por proyecto nuevo.
  const porProyecto = new Map<string, number>();
  for (const a of aceptadas) if (a.op === "tarea.crear" && a.proyecto && "ref" in a.proyecto) porProyecto.set(a.proyecto.ref, (porProyecto.get(a.proyecto.ref) ?? 0) + 1);
  for (const [ref, n] of porProyecto) {
    if (n <= MAX_TAREAS_DE_UN_PLAN) continue;
    let sobran = n - MAX_TAREAS_DE_UN_PLAN;
    for (let i = aceptadas.length - 1; i >= 0 && sobran > 0; i--) {
      const a = aceptadas[i];
      if (a.op === "tarea.crear" && a.proyecto && "ref" in a.proyecto && a.proyecto.ref === ref) {
        rechazadas.push({ indice: -1, operacion: a, motivo: `un plan tiene como mucho ${MAX_TAREAS_DE_UN_PLAN} tareas` });
        aceptadas.splice(i, 1);
        sobran--;
      }
    }
  }
  // Lo que nombra una ref que no quedó (su creación se rechazó o salió por el tope), también cae, en cadena.
  const externas = { tareas: new Set(conocidas.tareas), proyectos: new Set(conocidas.proyectos.keys()) };
  const { vivas, colgadas } = soltarColgadas(aceptadas, externas);
  for (const o of colgadas) rechazadas.push({ indice: -1, operacion: o, motivo: "depende de algo que no quedó en el acuerdo" });
  return { aceptadas: vivas, rechazadas };
}

/** Las refs que NOMBRA una operación (no las que crea). */
function refsQueNombra(o: OperacionDeTareas): { tareas: string[]; proyectos: string[] } {
  const tareas: string[] = [];
  const proyectos: string[] = [];
  const t = (r: RefATarea | undefined) => r && "ref" in r && tareas.push(r.ref);
  const p = (r: RefAProyecto | undefined) => r && "ref" in r && proyectos.push(r.ref);
  if (o.op === "tarea.crear") {
    p(o.proyecto);
    o.despuesDe?.forEach(t);
  } else if (o.op === "tarea.depender") {
    t(o.tarea);
    o.despuesDe.forEach(t);
  } else if (o.op === "tarea.editar" || o.op === "tarea.asignar" || o.op === "tarea.mover-semana") t(o.tarea);
  else if (o.op === "proyecto.editar") p(o.proyecto);
  return { tareas, proyectos };
}

/**
 * Lo que queda colgando: una operación que nombra una ref que ninguna operación viva crea (ni lo pendiente, `externas`).
 * En cadena: si cae una tarea nueva, cae lo que la espera.
 */
export function soltarColgadas(
  ops: readonly OperacionDeTareas[],
  externas: { tareas: ReadonlySet<string>; proyectos: ReadonlySet<string> } = { tareas: new Set(), proyectos: new Set() },
): { vivas: OperacionDeTareas[]; colgadas: OperacionDeTareas[] } {
  let vivas = [...ops];
  const colgadas: OperacionDeTareas[] = [];
  for (let cambio = true; cambio; ) {
    cambio = false;
    const tareas = new Set(externas.tareas);
    const proyectos = new Set(externas.proyectos);
    for (const o of vivas) {
      if (o.op === "tarea.crear" && o.ref) tareas.add(o.ref);
      if (o.op === "proyecto.crear") proyectos.add(o.ref);
    }
    const siguen: OperacionDeTareas[] = [];
    for (const o of vivas) {
      const n = refsQueNombra(o);
      if (n.tareas.some((r) => !tareas.has(r)) || n.proyectos.some((r) => !proyectos.has(r))) {
        colgadas.push(o);
        cambio = true;
      } else siguen.push(o);
    }
    vivas = siguen;
  }
  return { vivas, colgadas };
}

function persona(foto: FotoDeTareas, v: unknown): PersonaDeLaFoto {
  if (typeof v !== "string") return rechazar("falta a quién");
  const p = foto.personas.get(v.trim());
  return p ?? rechazar(`${v} no es una persona de la lista (usa una M#)`);
}

function paraQuien(foto: FotoDeTareas, v: unknown, enProyecto: boolean): ParaQuienDelChat {
  if (v === undefined || v === null || v === "yo") return { tipo: "yo" };
  if (typeof v !== "string") return rechazar("«para» tiene que ser yo, una M#, equipo:<clave> o nadie");
  const s = v.trim();
  if (s === "nadie") return enProyecto ? { tipo: "nadie" } : rechazar("«nadie» solo vale dentro de un proyecto");
  if (s.startsWith("equipo:")) {
    const clave = s.slice("equipo:".length);
    if (!EQUIPOS.some((e) => e.clave === clave)) return rechazar(`no hay un equipo «${clave}»`);
    if (!foto.equiposConLider.has(clave)) return rechazar(`el equipo «${clave}» no tiene líder: pídeselo a una persona`);
    return { tipo: "equipo", clave };
  }
  const p = persona(foto, s);
  return p.email === foto.yo.email ? { tipo: "yo" } : { tipo: "persona", email: p.email };
}

function refATarea(foto: FotoDeTareas, v: unknown, tareasDelLote: ReadonlySet<string>): RefATarea {
  if (typeof v === "number" && Number.isInteger(v)) v = `T-${v}`;
  if (typeof v !== "string") return rechazar("falta la tarea (T-# o la ref de una tarea nueva)");
  const s = v.trim();
  const m = /^T-?(\d{1,7})$/i.exec(s);
  if (m) {
    const n = Number(m[1]);
    if (!foto.tareas.has(n)) return rechazar(`T-${n} no existe o no la ves`);
    return { numero: n };
  }
  if (tareasDelLote.has(s)) return { ref: s };
  return rechazar(`«${s}» no es una T-# ni la ref de una tarea nueva`);
}

function refAProyecto(foto: FotoDeTareas, v: unknown, proyectosDelLote: ReadonlyMap<string, unknown>): RefAProyecto {
  if (typeof v !== "string") return rechazar("falta el proyecto (R# o la ref de uno nuevo)");
  const s = v.trim();
  const r = foto.proyectos.get(s);
  if (r) return { id: r.id };
  if (proyectosDelLote.has(s)) return { ref: s };
  return rechazar(`«${s}» no es un proyecto de la lista ni uno nuevo`);
}

function titulo(v: unknown, largo = LARGO_DEL_TITULO_DEL_CHAT): string {
  if (!esTexto(v)) return rechazar("falta el título");
  const t = v.replace(/\s+/g, " ").trim();
  if (t.length > largo) return rechazar(`el título pasa de ${largo} caracteres: acórtalo`);
  if (voseoEnProsa(t).length) return rechazar(`el título está en voseo («${voseoEnProsa(t)[0]}»): escríbelo en tuteo`);
  return t;
}

function cuandoNuevo(foto: FotoDeTareas, v: unknown, mensaje: string): CuandoCalculado {
  const c = calcularCuando(v, foto.ahora);
  if (!c) return rechazar(`no entiendo «${String(v)}» como cuándo: usa ${CUANDOS.join(" · ")} o una fecha que haya escrito la persona`);
  if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.trim()) && !fechaDichaEnElMensaje(v.trim(), mensaje)) {
    return rechazar(`la fecha ${v} no la dijo la persona: usa un «cuándo» de la lista`);
  }
  return c;
}

function clienteYProyectoHubspot(foto: FotoDeTareas, cliente: unknown, hub: unknown): { clientId?: string; projectId?: string } {
  let clientId: string | undefined;
  let projectId: string | undefined;
  if (cliente !== undefined && cliente !== null) {
    if (typeof cliente !== "string") return rechazar("el cliente va como C#");
    clientId = foto.clientes.get(cliente.trim())?.id ?? clientePorNombre(foto, cliente.trim());
  }
  if (hub !== undefined && hub !== null) {
    if (typeof hub !== "string") return rechazar("el proyecto de HubSpot va como H#");
    const h = foto.proyectosHubspot.get(hub.trim());
    if (!h) return rechazar(`${hub} no es un proyecto de HubSpot de la lista (usa una H#)`);
    if (clientId && clientId !== h.clientId) return rechazar(`${hub} es de otro cliente que ${String(cliente)}`);
    projectId = h.id;
    clientId = h.clientId;
  }
  return { ...(clientId ? { clientId } : {}), ...(projectId ? { projectId } : {}) };
}

/**
 * Un cliente que no está en la lista se resuelve por su nombre EXACTO dentro de lo que ve quien pide (§6.3). Si el
 * nombre es de varias empresas, el rechazo nombra las candidatas; una empresa que no ve no se nombra nunca.
 */
function clientePorNombre(foto: FotoDeTareas, dicho: string): string {
  const buscado = normalizarTexto(dicho);
  if (/^C\d+$/.test(dicho) || !buscado) return rechazar(`${dicho} no es un cliente de la lista (usa una C#)`);
  const ids = [...foto.clientesVisibles].filter((id) => normalizarTexto(foto.nombresDeClientes.get(id) ?? "") === buscado);
  if (ids.length === 1) return ids[0];
  if (ids.length > 1) {
    const nombres = ids.slice(0, 5).map((id) => `«${foto.nombresDeClientes.get(id)}»`).join(", ");
    return rechazar(`«${dicho}» es el nombre de varias empresas (${nombres}): pregunta cuál`);
  }
  return rechazar(`«${dicho}» no es una empresa que vea la persona: pregunta cuál, o usa una C# de la lista`);
}

/** ¿Puede asignar directo? Lo tuyo, si lideras su equipo, o si los dos están en el espacio libre del proyecto. */
function puedeAsignar(foto: FotoDeTareas, email: string, equipo: string | null, proyecto: ProyectoDeLaFoto | null): boolean {
  return !nacePropuesta(foto.yo.email, email, {
    equipoDelResponsable: equipo,
    creadorLideraEseEquipo: !!equipo && (foto.yo.lidera.includes(equipo) || foto.yo.esSuperAdmin),
    ambosEnElEspacioLibre: !!proyecto && proyecto.espacioTipo === "libre" && proyecto.miembrosDelEspacio.includes(email) && proyecto.miembrosDelEspacio.includes(foto.yo.email),
  });
}

function etiquetas(v: unknown): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v)) return rechazar("las etiquetas van en una lista");
  return [...new Set(v.filter(esTexto).map((e) => e.trim().replace(/^#/, "").slice(0, 30)))].slice(0, 5);
}

function minutos(v: unknown): number | undefined {
  if (v === undefined || v === null) return undefined;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 5 || n > 2_400) return rechazar("los minutos van de 5 a 2.400");
  return Math.round(n);
}

function normalizar(foto: FotoDeTareas, o: unknown, mensaje: string, lote: Lote): OperacionDeTareas {
  if (!o || typeof o !== "object") return rechazar("no es una operación");
  const x = o as Record<string, unknown>;
  switch (x.op) {
    case "tarea.crear": {
      const proyecto = x.proyecto !== undefined && x.proyecto !== null ? refAProyecto(foto, x.proyecto, lote.proyectos) : undefined;
      const delLote = proyecto && "ref" in proyecto ? lote.proyectos.get(proyecto.ref) : undefined;
      const existente = proyecto && "id" in proyecto ? (foto.proyectosPorId.get(proyecto.id) ?? null) : null;
      if (existente?.estado === "propuesta") return rechazar(`«${existente.nombre}» es un borrador: se activa desde su página, y ahí se le suman tareas`);
      const para = paraQuien(foto, x.para, !!proyecto);
      const equipo = para.tipo === "persona" ? (foto.personasPorEmail.get(para.email)?.equipo ?? null) : para.tipo === "equipo" ? para.clave : foto.yo.equipo;
      const pideAsignar = x.modo === "asignar";
      const asigna = para.tipo === "persona" && pideAsignar && puedeAsignar(foto, para.email, equipo, existente);
      let dia: number | undefined;
      let cuando: CuandoCalculado | undefined;
      if (x.dia !== undefined && x.dia !== null) {
        const d = Number(x.dia);
        if (!Number.isInteger(d) || d < 1 || d > 260) return rechazar("«dia» es un día hábil del plan, de 1 a 260");
        const inicia = delLote?.inicia ?? existente?.iniciaEl ?? null;
        if (!proyecto || !inicia) return rechazar("«dia» solo vale dentro de un proyecto con fecha de inicio");
        dia = d;
        const vence = fechaDelDiaHabil(inicia, d);
        cuando = { semana: lunesDeFecha(vence), vence };
      } else if (x.cuando !== undefined && x.cuando !== null) {
        cuando = cuandoNuevo(foto, x.cuando, mensaje);
      }
      const ch = clienteYProyectoHubspot(foto, x.cliente, x.proyectoHubspot);
      if (existente?.clientId && ch.clientId && ch.clientId !== existente.clientId) return rechazar("el proyecto es de otro cliente");
      if (delLote?.clientId && ch.clientId && ch.clientId !== delLote.clientId) return rechazar("el proyecto nuevo es de otro cliente: sus tareas van con el cliente del proyecto");
      if (delLote?.projectId && ch.projectId && ch.projectId !== delLote.projectId) return rechazar("el proyecto nuevo ya va con otro proyecto de HubSpot");
      const despuesDe = Array.isArray(x.despuesDe) ? x.despuesDe.map((r) => refATarea(foto, r, lote.tareas)) : undefined;
      if (x.prioridad !== undefined && x.prioridad !== null && !(PRIORIDADES as readonly string[]).includes(String(x.prioridad))) return rechazar("la prioridad es alta, media o baja");
      if (x.privada === true && para.tipo !== "yo") return rechazar("«Solo para mí» vale solo en lo tuyo");
      // Un plan lo ve el espacio mientras espera, y lo puede activar otra persona: ahí no hay «Solo para mí».
      if (x.privada === true && delLote) return rechazar("dentro de un plan no hay «Solo para mí»: créala aparte, fuera del proyecto");
      const elTitulo = titulo(x.titulo);
      const ctxDeLaTarea = limpiarContexto(x.contexto, elTitulo);
      if ("motivo" in ctxDeLaTarea) return rechazar(ctxDeLaTarea.motivo);
      return {
        op: "tarea.crear",
        ...(esRef(x.ref) ? { ref: x.ref.trim() } : {}),
        titulo: elTitulo,
        para,
        modo: asigna ? "asignar" : "proponer",
        ...(pideAsignar && !asigna && para.tipo === "persona" ? { pidioAsignar: true } : {}),
        ...(cuando ? { cuando } : {}),
        ...(dia ? { dia } : {}),
        ...(minutos(x.minutos) !== undefined ? { minutos: minutos(x.minutos) } : {}),
        ...(x.prioridad ? { prioridad: x.prioridad as Prioridad } : {}),
        ...ch,
        ...(proyecto ? { proyecto } : {}),
        ...(esTexto(x.seccion) ? { seccion: x.seccion.trim().slice(0, 60) } : {}),
        ...(despuesDe?.length ? { despuesDe } : {}),
        ...(etiquetas(x.etiquetas)?.length ? { etiquetas: etiquetas(x.etiquetas) } : {}),
        contexto: ctxDeLaTarea.contexto,
        ...(esTexto(x.notas) ? { notas: x.notas.trim().slice(0, 2_000) } : {}),
        ...(x.privada === true ? { privada: true } : {}),
      };
    }
    case "tarea.editar": {
      const tarea = refATarea(foto, x.tarea, lote.tareas);
      if ("numero" in tarea && !foto.tareas.get(tarea.numero)!.acciones.editar) return rechazar(`no puedes editar T-${tarea.numero}`);
      const campo = String(x.campo) as CampoDeTarea;
      if (!(CAMPOS_DE_TAREA as readonly string[]).includes(campo)) return rechazar(`no se edita «${String(x.campo)}» (sí: ${CAMPOS_DE_TAREA.join(", ")}; el estado no)`);
      const v = x.valor;
      let valor: string | number | string[] | null;
      switch (campo) {
        case "titulo":
          valor = titulo(v, 160);
          break;
        case "prioridad":
          if (!(PRIORIDADES as readonly string[]).includes(String(v))) return rechazar("la prioridad es alta, media o baja");
          valor = String(v);
          break;
        case "vence": {
          if (v === null) {
            valor = null;
            break;
          }
          const c = cuandoNuevo(foto, v, mensaje);
          if (!c.vence) return rechazar("«vence» necesita un día (hoy, mañana, un día de la semana, fin de mes o una fecha dicha)");
          valor = c.vence;
          break;
        }
        case "minutos":
          valor = v === null ? null : (minutos(v) ?? null);
          break;
        case "notas":
          valor = v === null ? null : esTexto(v) ? v.trim().slice(0, 2_000) : rechazar("las notas van como texto");
          break;
        case "etiquetas":
          valor = etiquetas(v) ?? [];
          break;
        case "cliente":
          valor = v === null ? null : (clienteYProyectoHubspot(foto, v, null).clientId ?? null);
          break;
        case "proyecto": {
          if (v === null) {
            valor = null;
            break;
          }
          const p = refAProyecto(foto, v, lote.proyectos);
          if (!("id" in p)) return rechazar("mover una tarea a un proyecto nuevo: créala dentro de él");
          const r = foto.proyectosPorId.get(p.id);
          if (r?.estado === "propuesta") return rechazar(`«${r.nombre}» es un borrador: actívalo desde su página antes de moverle tareas`);
          valor = p.id;
          break;
        }
        case "seccion":
          valor = v === null ? null : esTexto(v) ? v.trim().slice(0, 60) : rechazar("la sección va como texto");
          break;
      }
      return { op: "tarea.editar", tarea, campo, valor };
    }
    case "tarea.asignar": {
      const tarea = refATarea(foto, x.tarea, lote.tareas);
      if ("ref" in tarea && lote.tareasDePlan.has(tarea.ref)) return rechazar("dentro de un plan, a quién va se dice al crear la tarea («para»): se reparte al activarlo");
      const t = "numero" in tarea ? foto.tareas.get(tarea.numero)! : null;
      const para = paraQuien(foto, x.para, false);
      if (para.tipo !== "persona" && para.tipo !== "yo") return rechazar("se le pasa a una persona (M#) o a ti");
      // Quedarse con una «Por asignar» es tomarla, no pasársela a alguien.
      const toma = !!t && para.tipo === "yo" && !t.responsableEmail;
      if (t && !(toma ? t.acciones.tomar : t.acciones.reasignar)) return rechazar(toma ? `no puedes tomar T-${t.numero}` : `no puedes pasarle T-${t.numero} a otra persona`);
      const email = para.tipo === "persona" ? para.email : foto.yo.email;
      const equipo = foto.personasPorEmail.get(email)?.equipo ?? null;
      const proyecto = t?.proyectoId ? (foto.proyectosPorId.get(t.proyectoId) ?? null) : null;
      const asigna = para.tipo === "yo" || (x.modo === "asignar" && puedeAsignar(foto, email, equipo, proyecto));
      return { op: "tarea.asignar", tarea, para, modo: asigna ? "asignar" : "proponer", ...(x.modo === "asignar" && !asigna ? { pidioAsignar: true } : {}) };
    }
    case "tarea.mover-semana": {
      const tarea = refATarea(foto, x.tarea, lote.tareas);
      if ("ref" in tarea && lote.tareasDePlan.has(tarea.ref)) return rechazar("dentro de un plan, la semana va al crear la tarea («cuando» o «dia»)");
      if ("numero" in tarea && !foto.tareas.get(tarea.numero)!.acciones.moverDeSemana) return rechazar(`no puedes mover T-${tarea.numero} de semana`);
      return { op: "tarea.mover-semana", tarea, cuando: cuandoNuevo(foto, x.cuando, mensaje) };
    }
    case "tarea.depender": {
      const tarea = refATarea(foto, x.tarea, lote.tareas);
      if (!Array.isArray(x.despuesDe) || !x.despuesDe.length) return rechazar("falta a qué espera («despuesDe»)");
      const despuesDe = x.despuesDe.map((r) => refATarea(foto, r, lote.tareas));
      if (despuesDe.some((d) => JSON.stringify(d) === JSON.stringify(tarea))) return rechazar("una tarea no se espera a sí misma");
      return { op: "tarea.depender", tarea, despuesDe };
    }
    case "proyecto.crear": {
      if (!esRef(x.ref)) return rechazar("un proyecto nuevo necesita su ref (por ejemplo «onb1»)");
      const espacio = x.espacio === undefined || x.espacio === null ? null : foto.espacios.get(String(x.espacio).trim());
      if (x.espacio && !espacio) return rechazar(`${String(x.espacio)} no es un espacio de la lista (usa una E#)`);
      const espacioId = espacio?.id ?? [...foto.espacios.values()].find((e) => e.puedeCrear)?.id;
      if (!espacioId) return rechazar("no tienes un espacio donde crear proyectos");
      if (espacio && !espacio.puedeCrear) return rechazar("en ese espacio no puedes crear proyectos");
      const inicia = x.inicia !== undefined && x.inicia !== null ? cuandoNuevo(foto, x.inicia, mensaje) : null;
      const vence = x.vence !== undefined && x.vence !== null ? cuandoNuevo(foto, x.vence, mensaje) : null;
      const responsable = x.responsable !== undefined && x.responsable !== null ? persona(foto, x.responsable).email : undefined;
      const secciones = Array.isArray(x.secciones) ? [...new Set(x.secciones.filter(esTexto).map((s) => s.trim().slice(0, 60)))].slice(0, 12) : undefined;
      return {
        op: "proyecto.crear",
        ref: x.ref.trim(),
        nombre: titulo(x.nombre, 80),
        espacioId,
        ...clienteYProyectoHubspot(foto, x.cliente, x.proyectoHubspot),
        ...(inicia ? { inicia: inicia.vence ?? inicia.semana ?? undefined } : {}),
        ...(vence?.vence ? { vence: vence.vence } : {}),
        ...(responsable ? { responsableEmail: responsable } : {}),
        ...(secciones?.length ? { secciones } : {}),
      };
    }
    case "proyecto.editar": {
      const proyecto = refAProyecto(foto, x.proyecto, lote.proyectos);
      if ("id" in proyecto && !foto.proyectosPorId.get(proyecto.id)?.administra) return rechazar("no administras ese proyecto");
      const campo = String(x.campo) as CampoDeProyecto;
      if (!(CAMPOS_DE_PROYECTO as readonly string[]).includes(campo)) return rechazar(`no se edita «${String(x.campo)}» de un proyecto (sí: ${CAMPOS_DE_PROYECTO.join(", ")})`);
      let valor: string | string[] | null;
      if (campo === "nombre") valor = titulo(x.valor, 80);
      else if (campo === "vence") valor = x.valor === null ? null : (cuandoNuevo(foto, x.valor, mensaje).vence ?? rechazar("«vence» necesita un día"));
      else if (campo === "responsable") valor = persona(foto, x.valor).email;
      else if (campo === "secciones") valor = Array.isArray(x.valor) ? [...new Set(x.valor.filter(esTexto).map((s) => s.trim().slice(0, 60)))].slice(0, 12) : rechazar("las secciones van en una lista");
      else if ("ref" in proyecto) return rechazar("un proyecto nuevo nace activo (o en borrador, si trae tareas): su estado se cambia después");
      else if (foto.proyectosPorId.get(proyecto.id)?.estado === "propuesta") return rechazar("ese proyecto es un borrador: se activa o se descarta desde su página");
      else if ((ESTADOS_DE_PROYECTO_DEL_CHAT as readonly string[]).includes(String(x.valor))) valor = String(x.valor);
      else return rechazar(`el estado de un proyecto es ${ESTADOS_DE_PROYECTO_DEL_CHAT.join(", ")}`);
      return { op: "proyecto.editar", proyecto, campo, valor };
    }
    default:
      return rechazar(`«${String(x.op)}» no es una operación (sí: ${OPERACIONES_DE_TAREAS.join(", ")})`);
  }
}

/**
 * Revalidar lo PENDIENTE (ya normalizado) contra la foto de hoy: cae lo que ya no se ve o ya no se puede. No pide la
 * fecha literal: esa regla es solo para lo nuevo de cada turno.
 */
export function podarOperacionesDeTareas(foto: FotoDeTareas, ops: readonly OperacionDeTareas[]): { vivas: OperacionDeTareas[]; caidas: { operacion: OperacionDeTareas; motivo: string }[] } {
  const vivas: OperacionDeTareas[] = [];
  const caidas: { operacion: OperacionDeTareas; motivo: string }[] = [];
  const tareaExiste = (r: RefATarea) => ("numero" in r ? foto.tareas.has(r.numero) : true);
  for (const o of ops) {
    const motivo = (() => {
      const personaViva = (p: ParaQuienDelChat) => p.tipo !== "persona" || foto.personasPorEmail.has(p.email);
      switch (o.op) {
        case "tarea.crear":
          if (!personaViva(o.para)) return "esa persona ya no está en el equipo";
          if (o.clientId && !foto.clientesVisibles.has(o.clientId)) return "ya no ves ese cliente";
          if (o.proyecto && "id" in o.proyecto && !foto.proyectosPorId.has(o.proyecto.id)) return "ese proyecto ya no está";
          if (o.despuesDe?.some((d) => !tareaExiste(d))) return "una de las tareas a las que espera ya no está";
          return null;
        case "tarea.editar":
        case "tarea.mover-semana":
        case "tarea.depender":
        case "tarea.asignar":
          if (!tareaExiste(o.tarea)) return "esa tarea ya no está o ya no la ves";
          if (o.op === "tarea.asignar" && !personaViva(o.para)) return "esa persona ya no está en el equipo";
          return null;
        case "proyecto.crear": {
          // El espacio de un equipo que todavía no tenía fila: el aplicar lo crea (la misma regla que mutaciones).
          const clave = o.espacioId.startsWith("equipo:") ? o.espacioId.slice("equipo:".length) : null;
          if (clave) return foto.yo.esSuperAdmin || clave === foto.yo.equipo || foto.yo.lidera.includes(clave) ? null : "ese espacio ya no es tuyo";
          if (!foto.espaciosPorId.has(o.espacioId)) return "ese espacio ya no está";
          return null;
        }
        case "proyecto.editar":
          if ("id" in o.proyecto && !foto.proyectosPorId.get(o.proyecto.id)?.administra) return "ese proyecto ya no lo administras";
          return null;
      }
    })();
    if (motivo) caidas.push({ operacion: o, motivo });
    else vivas.push(o);
  }
  // En cadena: lo que nombra algo que cayó (el proyecto, la tarea a la que espera) cae con ello.
  const { vivas: siguen, colgadas } = soltarColgadas(vivas);
  for (const o of colgadas) caidas.push({ operacion: o, motivo: "dependía de algo que ya no va" });
  return { vivas: siguen, caidas };
}

/** Lo que nombran unas operaciones ya normalizadas: el servidor lo carga en la foto antes de revalidarlas. */
export function referenciasDeOperaciones(ops: readonly OperacionDeTareas[]): { numeros: number[]; proyectos: string[]; proyectosHubspot: string[] } {
  const numeros = new Set<number>();
  const proyectos = new Set<string>();
  const hubspot = new Set<string>();
  const t = (r: RefATarea | undefined) => r && "numero" in r && numeros.add(r.numero);
  const p = (r: RefAProyecto | undefined) => r && "id" in r && proyectos.add(r.id);
  for (const o of ops) {
    if ("tarea" in o) t(o.tarea);
    if (o.op === "tarea.crear" || o.op === "tarea.depender") o.despuesDe?.forEach(t);
    if (o.op === "tarea.crear" || o.op === "proyecto.editar") p(o.proyecto);
    if (o.op === "tarea.editar" && o.campo === "proyecto" && typeof o.valor === "string") proyectos.add(o.valor);
    if ((o.op === "tarea.crear" || o.op === "proyecto.crear") && o.projectId) hubspot.add(o.projectId);
  }
  return { numeros: [...numeros], proyectos: [...proyectos], proyectosHubspot: [...hubspot] };
}

/* ── Dependencias, refs y huellas (el acuerdo vivo) ─────────────────────────────────────────────────────────── */

/** Lo que cada operación NECESITA (índices): desmarcar un proyecto nuevo se lleva sus tareas; una tarea nueva, lo que la espera o la edita. */
export function dependenciasDeOperacionesDeTareas(ops: readonly OperacionDeTareas[]): number[][] {
  const proyecto = new Map<string, number>();
  const tarea = new Map<string, number>();
  ops.forEach((o, i) => {
    if (o.op === "proyecto.crear") proyecto.set(o.ref, i);
    if (o.op === "tarea.crear" && o.ref) tarea.set(o.ref, i);
  });
  const deTarea = (r: RefATarea) => ("ref" in r ? tarea.get(r.ref) : undefined);
  const deProyecto = (r: RefAProyecto | undefined) => (r && "ref" in r ? proyecto.get(r.ref) : undefined);
  return ops.map((o) => {
    const d = new Set<number>();
    const sumar = (i: number | undefined) => i !== undefined && d.add(i);
    if (o.op === "tarea.crear") {
      sumar(deProyecto(o.proyecto));
      o.despuesDe?.forEach((r) => sumar(deTarea(r)));
    } else if (o.op === "tarea.depender") {
      sumar(deTarea(o.tarea));
      o.despuesDe.forEach((r) => sumar(deTarea(r)));
    } else if (o.op === "tarea.editar" || o.op === "tarea.asignar" || o.op === "tarea.mover-semana") {
      sumar(deTarea(o.tarea));
    } else if (o.op === "proyecto.editar") {
      sumar(deProyecto(o.proyecto));
    }
    return [...d].sort((a, b) => a - b);
  });
}

/** Las refs que crea una operación (para renombrar lo nuevo que choca con lo pendiente). */
export function refsCreadas(o: OperacionDeTareas): string[] {
  return (o.op === "tarea.crear" || o.op === "proyecto.crear") && o.ref ? [o.ref] : [];
}

/** La misma operación con sus refs renombradas (las propias y las que apunta). */
export function reapuntarRefs(o: OperacionDeTareas, renombres: ReadonlyMap<string, string>): OperacionDeTareas {
  if (!renombres.size) return o;
  const t = (r: RefATarea): RefATarea => ("ref" in r && renombres.has(r.ref) ? { ref: renombres.get(r.ref)! } : r);
  const p = (r: RefAProyecto): RefAProyecto => ("ref" in r && renombres.has(r.ref) ? { ref: renombres.get(r.ref)! } : r);
  switch (o.op) {
    case "tarea.crear":
      return { ...o, ...(o.ref && renombres.has(o.ref) ? { ref: renombres.get(o.ref)! } : {}), ...(o.proyecto ? { proyecto: p(o.proyecto) } : {}), ...(o.despuesDe ? { despuesDe: o.despuesDe.map(t) } : {}) };
    case "proyecto.crear":
      return renombres.has(o.ref) ? { ...o, ref: renombres.get(o.ref)! } : o;
    case "tarea.depender":
      return { ...o, tarea: t(o.tarea), despuesDe: o.despuesDe.map(t) };
    case "tarea.editar":
    case "tarea.asignar":
    case "tarea.mover-semana":
      return { ...o, tarea: t(o.tarea) };
    case "proyecto.editar":
      return { ...o, proyecto: p(o.proyecto) };
  }
}

/** La huella de una operación para deduplicar: sin `origen` ni `pidioAsignar`, con el título normalizado. */
export function huellaDeOperacion(o: OperacionDeTareas): string {
  const { origen: _o, ...resto } = o as OperacionDeTareas & { origen?: string };
  void _o;
  // Sin el contexto: la misma tarea contada con otras palabras sigue siendo la misma.
  const sinMarcas = { ...resto, pidioAsignar: undefined, contexto: undefined, sesion: undefined } as Record<string, unknown>;
  if ("titulo" in sinMarcas && typeof sinMarcas.titulo === "string") sinMarcas.titulo = huellaDeTexto(sinMarcas.titulo);
  /* ⚠ Canónica en TODOS los niveles. Un replacer en forma de lista filtra las claves de cada nivel con la misma lista,
     y vaciaba `tarea` y `cuando`: «pasar T-12 a la semana del 12» y «pasar T-15 a la del 19» daban la misma huella. */
  const canon = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(canon)
      : v && typeof v === "object"
        ? Object.fromEntries(
            Object.keys(v as Record<string, unknown>)
              .sort()
              .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
              .map((k) => [k, canon((v as Record<string, unknown>)[k])]),
          )
        : v;
  return JSON.stringify(canon(sinMarcas));
}

/**
 * Juntar lo pendiente con lo nuevo de este turno: descarta lo pedido (con cascada), deduplica ANTES de renombrar, y
 * renombra las refs NUEVAS que chocan con una pendiente (`onb1` → `onb1_2`). Lo pendiente va primero y no cambia.
 */
export function fusionarOperacionesDeTareas(
  pendientes: readonly OperacionDeTareas[],
  nuevas: readonly OperacionDeTareas[],
  descartar: ReadonlySet<number>,
): { operaciones: OperacionDeTareas[]; arrastradas: number[]; descartadas: number[] } {
  // 1. Descartar con cascada: lo que necesita algo descartado también se va.
  const deps = dependenciasDeOperacionesDeTareas(pendientes);
  const fuera = new Set<number>([...descartar].filter((i) => i >= 0 && i < pendientes.length));
  for (let cambio = true; cambio; ) {
    cambio = false;
    deps.forEach((d, i) => {
      if (!fuera.has(i) && d.some((j) => fuera.has(j))) {
        fuera.add(i);
        cambio = true;
      }
    });
  }
  const quedan = pendientes.filter((_, i) => !fuera.has(i));
  // 2. Deduplicar lo nuevo contra lo que queda (antes de renombrar).
  const huellas = new Set(quedan.map(huellaDeOperacion));
  const frescas = nuevas.filter((o) => !huellas.has(huellaDeOperacion(o)));
  // 3. Renombrar las refs nuevas que chocan con una pendiente.
  const usadas = new Set(quedan.flatMap(refsCreadas));
  const renombres = new Map<string, string>();
  for (const o of frescas) {
    for (const r of refsCreadas(o)) {
      if (!usadas.has(r)) {
        usadas.add(r);
        continue;
      }
      let k = 2;
      while (usadas.has(`${r}_${k}`)) k++;
      renombres.set(r, `${r}_${k}`);
      usadas.add(`${r}_${k}`);
    }
  }
  const operaciones = [...quedan, ...frescas.map((o) => reapuntarRefs(o, renombres))];
  return { operaciones, arrastradas: quedan.map((_, i) => i), descartadas: [...fuera].sort((a, b) => a - b) };
}

/* ── Lo que se ve del acuerdo ────────────────────────────────────────────────────────────────────────────────── */

/** La semana real de lo que es tuyo (salta lo que ya revisaste); la de otra persona se respeta: ella decide. */
export function semanaReal(foto: FotoDeTareas, para: ParaQuienDelChat, semana: string | null): string | null {
  if (!semana) return null;
  if (para.tipo !== "yo") return semana;
  return primeraSemanaSinRevisar(semana, foto.semanasRevisadas, { lunesDeHoy: lunesDeHoy(foto.ahora), conPiso: true });
}

/** Una tarea abierta tuya que se parece (para decir «parecida a T-12»; nada se fusiona solo). */
export function parecidaA(foto: FotoDeTareas, tituloNuevo: string): number | null {
  const mias = [...foto.tareas.values()].filter((t) => t.abierta && t.responsableEmail === foto.yo.email && esCandidataClara(tituloNuevo, t.titulo));
  const [p] = masParecidas(tituloNuevo, mias, (t) => t.titulo, 1);
  return p ? p.numero : null;
}

/* ── Lo guardado, antes de aplicar ───────────────────────────────────────────────────────────────────────────── */

const FECHA_GUARDADA = /^\d{4}-\d{2}-\d{2}$/;
const ORIGEN_DEL_CHAT = /^c:[0-9a-f]{12}:\d+$/;

/** Una semana guardada vale si es un lunes (o no hay). */
function semanaValida(semana: unknown): boolean {
  if (semana === null || semana === undefined) return true;
  return typeof semana === "string" && FECHA_GUARDADA.test(semana) && lunesDeFecha(semana) === semana;
}

/**
 * ⛔ Lo que está guardado en el hilo pasó por la prueba en seco del turno, pero se vuelve a mirar lo que la escritura da
 * por bueno sin validar: una prioridad, un estado de proyecto, una semana que no es lunes o un origen con otra forma
 * escribirían una fila que ninguna pantalla sabe leer (o chocarían con el sello de otro acuerdo).
 */
export function acuerdoBienFormado(ops: readonly OperacionDeTareas[]): boolean {
  return ops.every((o) => {
    switch (o.op) {
      case "tarea.crear":
        if (o.origen !== undefined && !ORIGEN_DEL_CHAT.test(o.origen)) return false;
        if (o.sesion !== undefined && (typeof o.sesion !== "string" || !o.sesion)) return false;
        if (o.prioridad !== undefined && o.prioridad !== null && !(PRIORIDADES as readonly string[]).includes(String(o.prioridad))) return false;
        return semanaValida(o.cuando?.semana);
      case "proyecto.crear":
        return o.origen === undefined || ORIGEN_DEL_CHAT.test(o.origen);
      case "tarea.editar":
        return o.campo !== "prioridad" || (PRIORIDADES as readonly string[]).includes(String(o.valor));
      case "tarea.mover-semana":
        return semanaValida(o.cuando?.semana);
      case "proyecto.editar":
        return o.campo !== "estado" || (ESTADOS_DE_PROYECTO_DEL_CHAT as readonly string[]).includes(String(o.valor));
      default:
        return true;
    }
  });
}
