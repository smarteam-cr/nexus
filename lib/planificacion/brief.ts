/**
 * lib/planificacion/brief.ts — las secciones de la Planificación que vinieron del Brief de implementación
 * (2026-10-25, docs/planificacion-brief-plan.md).
 *
 * El Brief es la hoja de cálculo con la que el equipo configura HubSpot. Lo que la Planificación no tenía
 * y ahora tiene: la ficha del proyecto (hubs, sesiones, quiénes participan), los usuarios y sus permisos,
 * por dónde entran los leads, los formularios, las cotizaciones y los informes. Ninguna la escribe el
 * agente en la corrida principal (ya está en el tope de tokens): las llena el CSE, el cliente o una
 * plantilla.
 *
 * Puro: la forma de cada sección, cómo se lee lo que venga (`adoptar*`) y las reglas que la pantalla
 * hace cumplir (los permisos no se contradicen). Lo usan las secciones y las pruebas.
 */
import { nuevoIdDeFila, normalizarObjeto, type FilaPropiedad } from "./propiedades";

const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v.filter((x) => x && typeof x === "object") as T[]) : []);
/** Un id para cada elemento que no lo tenga. Se aplica al ESCRIBIR, no al leer: un id inventado en cada
    render cambiaría la identidad del elemento entre renders. */
export const conIds = <T extends { id?: string }>(xs: readonly T[]): T[] => xs.map((x) => (x.id ? x : { ...x, id: nuevoIdDeFila() }));

/* ── Ficha del proyecto ─────────────────────────────────────────────────────── */

/** Los hubs de HubSpot con el nombre y el slug del catálogo de etiquetas (lib/tags/catalog.ts): el Brief decía
    «Operation» y «Content», que hoy son Data Hub y Content Hub, y le faltaba Revenue Hub. */
export const HUBS = [
  { slug: "marketing_hub", hub: "Marketing Hub" },
  { slug: "sales_hub", hub: "Sales Hub" },
  { slug: "service_hub", hub: "Service Hub" },
  { slug: "content_hub", hub: "Content Hub" },
  { slug: "data_hub", hub: "Data Hub" },
  { slug: "revenue_hub", hub: "Revenue Hub" },
] as const;

/** Los hubs que el proyecto tiene vendidos (sus etiquetas), con el nombre de la ficha. */
export function hubsVendidos(etiquetas: readonly string[] | undefined): string[] {
  const t = new Set(etiquetas ?? []);
  return HUBS.filter((h) => t.has(h.slug)).map((h) => h.hub);
}

export const EDICIONES = [
  { value: "starter", label: "Starter" },
  { value: "professional", label: "Professional" },
  { value: "enterprise", label: "Enterprise" },
] as const;

export const LADOS = [
  { value: "smarteam", label: "Smarteam" },
  { value: "hubspot", label: "HubSpot" },
  { value: "cliente", label: "El cliente" },
] as const;

export interface HubDelProyecto {
  hub: string;
  incluido?: string;
  edicion?: string;
  sesionesSetup?: string;
  sesionesCapacitacion?: string;
}
export interface Participante {
  id?: string;
  nombre: string;
  cargo?: string;
  correo?: string;
  telefono?: string;
  lado?: string;
  principal?: string;
}
export interface FichaDelProyectoData {
  intro?: string;
  hubs: HubDelProyecto[];
  participantes: Participante[];
  alcance?: string;
  consideraciones?: string;
}

/** Los hubs siempre están (los que no se guardaron, vacíos): así se marca cuál entra sin escribir su nombre. */
export function adoptarFichaDelProyecto(data: unknown): FichaDelProyectoData {
  const d = (data ?? {}) as Record<string, unknown>;
  const guardados = arr<HubDelProyecto>(d.hubs);
  const mismo = (h: HubDelProyecto, nombre: string) => txt(h.hub).toLowerCase() === nombre.toLowerCase();
  const deLaLista = HUBS.map(({ hub }) => guardados.find((h) => mismo(h, hub)) ?? { hub });
  const otros = guardados.filter((h) => !HUBS.some((x) => mismo(h, x.hub)));
  return {
    intro: txt(d.intro),
    hubs: [...deLaLista, ...otros],
    participantes: arr<Participante>(d.participantes),
    alcance: txt(d.alcance),
    consideraciones: txt(d.consideraciones),
  };
}

/** Los roles que el Brief ya trae escritos, para empezar sin tipear los cargos. */
export const PARTICIPANTES_DE_SIEMPRE: ReadonlyArray<Pick<Participante, "cargo" | "lado">> = [
  { cargo: "Customer Success Lead", lado: "smarteam" },
  { cargo: "Solution Architect", lado: "smarteam" },
  { cargo: "Project manager", lado: "smarteam" },
  { cargo: "Ventas", lado: "smarteam" },
  { cargo: "CSM de HubSpot", lado: "hubspot" },
  { cargo: "Responsable del proyecto", lado: "cliente" },
];

/* ── Usuarios y permisos ────────────────────────────────────────────────────── */

/** Hasta dónde llega un permiso. En el Brief son tres casillas (Todo · Lo de su propiedad · Lo de su equipo) más «nada». */
export const NIVELES_DE_PERMISO = [
  { value: "nada", label: "Nada" },
  { value: "propios", label: "Lo suyo" },
  { value: "equipo", label: "Lo de su equipo" },
  { value: "todo", label: "Todo" },
] as const;

export const OBJETOS_CON_PERMISO = [
  { key: "contactos", label: "Contactos" },
  { key: "empresas", label: "Empresas" },
  { key: "negocios", label: "Negocios" },
  { key: "tickets", label: "Tickets" },
] as const;
export type ObjetoConPermiso = (typeof OBJETOS_CON_PERMISO)[number]["key"];

/** En orden: cada acción no puede llegar más lejos que la anterior. */
export const ACCIONES_DE_PERMISO = [
  { key: "ver", label: "Ver" },
  { key: "editar", label: "Editar" },
  { key: "eliminar", label: "Eliminar" },
] as const;
export type AccionDePermiso = (typeof ACCIONES_DE_PERMISO)[number]["key"];

export const TIPOS_DE_EQUIPO = [
  { value: "supervision", label: "Supervisión" },
  { value: "operativo", label: "Operativo" },
] as const;

export type PermisosDeObjeto = Partial<Record<AccionDePermiso, string>>;

export interface EquipoDeHubspot {
  id?: string;
  nombre: string;
  tipo?: string;
  permisos?: Partial<Record<ObjetoConPermiso, PermisosDeObjeto>>;
  /** «si»/«no»: ve la tabla de usuarios. */
  tablaDeUsuarios?: string;
  /** «si»/«no»: puede exportar la base. */
  exportar?: string;
}
export interface UsuarioDeHubspot {
  id?: string;
  nombre: string;
  apellido?: string;
  correo?: string;
  cargo?: string;
  /** El `id` del equipo: renombrar el equipo no deja al usuario sin equipo. */
  equipoId?: string;
  licencia?: string;
  superAdmin?: string;
  champion?: string;
}
export interface UsuariosPermisosData {
  intro?: string;
  equipos: EquipoDeHubspot[];
  usuarios: UsuarioDeHubspot[];
}

const rango = (nivel: unknown) => Math.max(0, NIVELES_DE_PERMISO.findIndex((n) => n.value === nivel));

/**
 * Los permisos de un objeto como los puede mostrar la matriz: un valor que no es del vocabulario se descarta, y lo que
 * se contradice (editar más amplio que ver, eliminar más que editar) baja al tope. La pantalla ya no deja escribirlo,
 * pero el chat escribe directo: sin esto, «editar: todo» con «ver: lo suyo» se veía así (2026-10-25, la revisión).
 */
export function permisosCoherentes(p: unknown): PermisosDeObjeto {
  const d = (p ?? {}) as Record<string, unknown>;
  const out: PermisosDeObjeto = {};
  let tope = NIVELES_DE_PERMISO.length - 1;
  for (const { key } of ACCIONES_DE_PERMISO) {
    const v = d[key];
    if (!NIVELES_DE_PERMISO.some((n) => n.value === v)) {
      tope = Math.min(tope, 0);
      continue;
    }
    const r = Math.min(rango(v), tope);
    out[key] = NIVELES_DE_PERMISO[r].value;
    tope = r;
  }
  return out;
}

export function adoptarUsuariosPermisos(data: unknown): UsuariosPermisosData {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    intro: txt(d.intro),
    equipos: arr<EquipoDeHubspot>(d.equipos).map((e) => ({
      ...e,
      permisos: Object.fromEntries(
        OBJETOS_CON_PERMISO.filter((o) => e.permisos?.[o.key]).map((o) => [o.key, permisosCoherentes(e.permisos?.[o.key])]),
      ),
    })),
    usuarios: arr<UsuarioDeHubspot>(d.usuarios),
  };
}

/** Los niveles que admite una acción: hasta donde llegue la anterior (ver no tiene tope). */
export function nivelesPermitidos(p: PermisosDeObjeto | undefined, accion: AccionDePermiso) {
  const i = ACCIONES_DE_PERMISO.findIndex((a) => a.key === accion);
  if (i <= 0) return NIVELES_DE_PERMISO;
  const tope = rango(p?.[ACCIONES_DE_PERMISO[i - 1].key]);
  return NIVELES_DE_PERMISO.filter((_, j) => j <= tope);
}

/**
 * Cambia un permiso sin dejar una contradicción: editar no llega más lejos que ver, ni eliminar más que
 * editar. Bajar uno baja los que dependen de él; pedir más de lo que admite se queda en el tope.
 */
export function ajustarPermiso(p: PermisosDeObjeto | undefined, accion: AccionDePermiso, nivel: string): PermisosDeObjeto {
  const out: PermisosDeObjeto = { ...(p ?? {}) };
  const i = ACCIONES_DE_PERMISO.findIndex((a) => a.key === accion);
  const tope = i <= 0 ? NIVELES_DE_PERMISO.length - 1 : rango(out[ACCIONES_DE_PERMISO[i - 1].key]);
  out[accion] = NIVELES_DE_PERMISO[Math.min(rango(nivel), tope)].value;
  for (let j = i + 1; j < ACCIONES_DE_PERMISO.length; j++) {
    const k = ACCIONES_DE_PERMISO[j].key;
    const previo = rango(out[ACCIONES_DE_PERMISO[j - 1].key]);
    if (out[k] !== undefined && rango(out[k]) > previo) out[k] = NIVELES_DE_PERMISO[previo].value;
  }
  return out;
}

/** Las licencias que pide la lista de usuarios, de la más pedida a la menos. Sin licencia cuenta aparte. */
export function resumenDeLicencias(usuarios: readonly UsuarioDeHubspot[]): Array<{ licencia: string; usuarios: number }> {
  const conNombre = usuarios.filter((u) => txt(u.nombre).trim() || txt(u.correo).trim());
  const cuenta = new Map<string, { licencia: string; usuarios: number }>();
  for (const u of conNombre) {
    const l = txt(u.licencia).trim() || "Sin licencia definida";
    const k = l.toLowerCase();
    const e = cuenta.get(k) ?? { licencia: l, usuarios: 0 };
    e.usuarios++;
    cuenta.set(k, e);
  }
  return [...cuenta.values()].sort((a, b) => b.usuarios - a.usuarios);
}

const esSi = (v: unknown) => /^(si|sí|yes|true|x)$/i.test(txt(v).trim());

/** Lo que conviene resolver antes de crear los usuarios en HubSpot. */
export function avisosDeUsuarios(d: UsuariosPermisosData): string[] {
  const usuarios = d.usuarios.filter((u) => txt(u.nombre).trim() || txt(u.correo).trim());
  if (!usuarios.length) return [];
  const avisos: string[] = [];
  const sinCorreo = usuarios.filter((u) => !txt(u.correo).trim()).length;
  if (sinCorreo) avisos.push(`${sinCorreo === 1 ? "Un usuario no tiene" : `${sinCorreo} usuarios no tienen`} correo: sin correo no se le puede invitar.`);
  const correos = usuarios.map((u) => txt(u.correo).trim().toLowerCase()).filter(Boolean);
  const repetidos = [...new Set(correos.filter((c, i) => correos.indexOf(c) !== i))];
  if (repetidos.length) avisos.push(`Correo repetido: ${repetidos.join(", ")}.`);
  if (!usuarios.some((u) => esSi(u.superAdmin))) avisos.push("Nadie quedó como superadministrador.");
  const ids = new Set(d.equipos.map((e) => e.id));
  const sinEquipo = usuarios.filter((u) => !u.equipoId || !ids.has(u.equipoId)).length;
  if (d.equipos.length && sinEquipo) avisos.push(`${sinEquipo === 1 ? "Un usuario no tiene" : `${sinEquipo} usuarios no tienen`} equipo: no se sabe qué permisos le tocan.`);
  return avisos;
}

/* ── Por dónde entran los leads ─────────────────────────────────────────────── */

export interface CanalDeEntrada {
  id?: string;
  canal: string;
  responsable?: string;
  atencion?: string;
  pasaA?: string;
  origen?: string;
}
export interface CanalesDeEntradaData {
  intro?: string;
  canales: CanalDeEntrada[];
}
export function adoptarCanales(data: unknown): CanalesDeEntradaData {
  const d = (data ?? {}) as Record<string, unknown>;
  return { intro: txt(d.intro), canales: arr<CanalDeEntrada>(d.canales) };
}

/** Los canales que trae el Brief, para empezar sin escribirlos. */
export const CANALES_DE_SIEMPRE = [
  "Llamada",
  "Formulario del sitio web",
  "Formularios de campañas en redes sociales",
  "WhatsApp",
  "Messenger",
  "Chatbot",
  "Registro manual de contactos",
  "Eventos, ferias y webinars",
] as const;

/* ── Formularios ────────────────────────────────────────────────────────────── */

export interface CampoDeFormulario {
  /** El `id` de la fila en la tabla de propiedades. Sin él, el campo es solo un nombre. */
  propiedadId?: string;
  /** El nombre como estaba al elegirlo: lo que se muestra si la tabla no está a mano (el PDF, el enlace). */
  etiqueta: string;
  obligatorio?: string;
}
export interface Formulario {
  id?: string;
  nombre: string;
  objeto?: string;
  donde?: string;
  campos: CampoDeFormulario[];
  alEnviar?: string;
  origen?: string;
}
export interface FormulariosData {
  intro?: string;
  items: Formulario[];
}
export function adoptarFormularios(data: unknown): FormulariosData {
  const d = (data ?? {}) as Record<string, unknown>;
  return {
    intro: txt(d.intro),
    items: arr<Formulario>(d.items).map((f) => ({ ...f, campos: arr<CampoDeFormulario>(f.campos) })),
  };
}

/**
 * Cómo está cada campo de un formulario contra la tabla de propiedades: el nombre vigente (si la
 * propiedad se renombró, manda la tabla) y si la propiedad ya no existe. Sin tabla (el PDF, el enlace),
 * se muestra lo guardado y no se avisa nada.
 */
export function camposContraPropiedades(
  campos: readonly CampoDeFormulario[],
  propiedades: readonly FilaPropiedad[] | undefined,
): Array<CampoDeFormulario & { vigente: string; falta: boolean }> {
  return campos.map((c) => {
    if (!propiedades || !c.propiedadId) return { ...c, vigente: c.etiqueta, falta: false };
    const p = propiedades.find((f) => f.id === c.propiedadId);
    return p ? { ...c, vigente: (p.etiqueta || p.campo || c.etiqueta).trim(), falta: false } : { ...c, vigente: c.etiqueta, falta: true };
  });
}

/** Las propiedades que se pueden pedir en un formulario de ese objeto (Contacto si no dice). */
export function propiedadesParaFormulario(propiedades: readonly FilaPropiedad[] | undefined, objeto: unknown) {
  const o = normalizarObjeto(objeto) || "Contacto";
  return (propiedades ?? [])
    .filter((f) => f.id && normalizarObjeto(f.objeto) === o && (f.etiqueta || f.campo))
    .map((f) => ({ value: f.id!, label: (f.etiqueta || f.campo).trim() }));
}

/* ── Cotizaciones e informes ────────────────────────────────────────────────── */

export interface CotizacionesData {
  intro?: string;
  propiedades?: string;
  formato?: string;
  ajustes?: string;
  origen?: string;
}
export function adoptarCotizaciones(data: unknown): CotizacionesData {
  const d = (data ?? {}) as Record<string, unknown>;
  return { intro: txt(d.intro), propiedades: txt(d.propiedades), formato: txt(d.formato), ajustes: txt(d.ajustes), origen: txt(d.origen) };
}

export interface Informe {
  id?: string;
  nombre: string;
  mide?: string;
  frecuencia?: string;
  area?: string;
  /** El objetivo del diagnóstico que mide (OBJ-01…). */
  objetivo?: string;
  origen?: string;
}
export interface InformesData {
  intro?: string;
  items: Informe[];
}
export function adoptarInformes(data: unknown): InformesData {
  const d = (data ?? {}) as Record<string, unknown>;
  return { intro: txt(d.intro), items: arr<Informe>(d.items) };
}

/* ── Cuándo una sección no tiene nada que mostrarle al cliente ──────────────────
   El motor omite en lectura una sección «en blanco» (lib/landing/is-blank.ts), pero mira los DATOS: un «no» de una
   casilla o el cargo de una fila sin nombre la mantenían viva, y el cliente veía el título sin nada abajo (2026-10-25,
   la revisión). Cada sección declara su regla (`vacia` en su definición) y su componente filtra con la misma. */

const lleno = (v: unknown) => txt(v).trim() !== "";

export const hubVisible = (h: HubDelProyecto) => esSi(h.incluido);
export const participanteVisible = (p: Participante) => lleno(p.nombre) || lleno(p.correo);
export const equipoVisible = (e: EquipoDeHubspot) => lleno(e.nombre);
export const usuarioVisible = (u: UsuarioDeHubspot) => lleno(u.nombre) || lleno(u.correo);
export const canalVisible = (c: CanalDeEntrada) => lleno(c.canal);
export const formularioVisible = (f: Formulario) => lleno(f.nombre) || f.campos.some((c) => lleno(c.etiqueta));
export const informeVisible = (i: Informe) => lleno(i.nombre);

export function fichaVacia(data: unknown): boolean {
  const d = adoptarFichaDelProyecto(data);
  return !lleno(d.intro) && !lleno(d.alcance) && !lleno(d.consideraciones) && !d.hubs.some(hubVisible) && !d.participantes.some(participanteVisible);
}
export function usuariosVacia(data: unknown): boolean {
  const d = adoptarUsuariosPermisos(data);
  return !lleno(d.intro) && !d.equipos.some(equipoVisible) && !d.usuarios.some(usuarioVisible);
}
export function canalesVacia(data: unknown): boolean {
  const d = adoptarCanales(data);
  return !lleno(d.intro) && !d.canales.some(canalVisible);
}
export function formulariosVacia(data: unknown): boolean {
  const d = adoptarFormularios(data);
  return !lleno(d.intro) && !d.items.some(formularioVisible);
}
export function cotizacionesVacia(data: unknown): boolean {
  const d = adoptarCotizaciones(data);
  return !lleno(d.intro) && !lleno(d.propiedades) && !lleno(d.formato) && !lleno(d.ajustes);
}
export function informesVacia(data: unknown): boolean {
  const d = adoptarInformes(data);
  return !lleno(d.intro) && !d.items.some(informeVisible);
}
