/**
 * lib/kickoff/academy.ts — la ruta de HubSpot Academy del kickoff (Q1 del roadmap, 2026-10-27, docs/kickoff-mejoras-plan.md).
 * Puro y client-safe: lo usan la sección del kickoff, la pantalla del catálogo, la ruta y las pruebas.
 *
 * Smarteam mantiene un catálogo de listas de reproducción de Academy (nombre, enlace, hub, rol y duración; tabla
 * `ListaDeAcademy`). Cada kickoff trae «Tu ruta en HubSpot Academy»: las listas que le tocan al cliente por los hubs que
 * compró y los roles que esos hubs piden (líderes siempre; Ventas con Sales Hub; Marketing con Marketing Hub; Servicio con
 * Service Hub). La sugiere Nexus, sin IA; el CSE quita o suma. El kickoff GUARDA su copia de cada lista (no un puntero):
 * archivar una lista del catálogo no cambia un kickoff ya publicado.
 */

export const ROLES_DE_ACADEMY = [
  { value: "lideres", label: "Líderes" },
  { value: "ventas", label: "Ventas" },
  { value: "marketing", label: "Marketing" },
  { value: "servicio", label: "Servicio" },
] as const;
export type RolDeAcademy = (typeof ROLES_DE_ACADEMY)[number]["value"];

/** Los hubs del catálogo de etiquetas (lib/tags/catalog.ts) más «general»: una lista que sirve con cualquier hub. */
export const HUBS_DE_ACADEMY = [
  { value: "general", label: "Cualquier hub" },
  { value: "marketing_hub", label: "Marketing Hub" },
  { value: "sales_hub", label: "Sales Hub" },
  { value: "service_hub", label: "Service Hub" },
  { value: "content_hub", label: "Content Hub" },
  { value: "data_hub", label: "Data Hub" },
  { value: "revenue_hub", label: "Revenue Hub" },
] as const;

/** El rol que pide cada hub. Líderes no depende de un hub: va siempre. */
const ROL_DEL_HUB: Record<string, RolDeAcademy> = {
  sales_hub: "ventas",
  marketing_hub: "marketing",
  service_hub: "servicio",
};

/** Una lista del catálogo, como la devuelve la base. */
export interface ListaDelCatalogo {
  id: string;
  nombre: string;
  enlace: string;
  hub: string;
  rol: string;
  duracionMinutos: number | null;
  descripcion?: string | null;
  orden: number;
  activa: boolean;
}

/** Una lista dentro del kickoff: la copia que el cliente ve. `catalogoId` apunta a su origen, si salió del catálogo. */
export interface ListaEnElKickoff {
  id?: string;
  catalogoId?: string;
  nombre: string;
  enlace: string;
  hub?: string;
  rol?: string;
  /** «1 h 30 min» (texto: ya formateado, así el PDF y el enlace no recalculan). */
  duracion?: string;
}

export interface RutaDeAcademyData {
  intro?: string;
  listas: ListaEnElKickoff[];
}

const txt = (v: unknown): string => (typeof v === "string" ? v : "");
const lleno = (v: unknown) => txt(v).trim() !== "";

export function adoptarRutaDeAcademy(data: unknown): RutaDeAcademyData {
  const d = (data ?? {}) as Record<string, unknown>;
  const listas = Array.isArray(d.listas) ? (d.listas.filter((x) => x && typeof x === "object") as ListaEnElKickoff[]) : [];
  return { intro: txt(d.intro), listas };
}

/** Una lista se muestra si tiene nombre y un enlace que se puede abrir. */
export const listaVisible = (l: ListaEnElKickoff) => lleno(l.nombre) && enlaceDeAcademyValido(l.enlace);

/** La regla de vacía de la sección: sin listas que mostrar, el cliente no ve el título solo. */
export function rutaDeAcademyVacia(data: unknown): boolean {
  const d = adoptarRutaDeAcademy(data);
  return !d.listas.some(listaVisible);
}

/** Solo https: el enlace lo abre el cliente desde el documento. */
export function enlaceDeAcademyValido(v: unknown): boolean {
  try {
    return new URL(txt(v).trim()).protocol === "https:";
  } catch {
    return false;
  }
}

export function duracionEnPalabras(minutos: number | null | undefined): string {
  if (minutos == null || !Number.isFinite(minutos) || minutos <= 0) return "";
  const h = Math.floor(minutos / 60);
  const m = Math.round(minutos % 60);
  if (!h) return `${m} min`;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const etiquetaDeRol = (v?: string) => ROLES_DE_ACADEMY.find((r) => r.value === v)?.label ?? (v || "Todo el equipo");
export const etiquetaDeHub = (v?: string) => HUBS_DE_ACADEMY.find((h) => h.value === v)?.label ?? (v || "");

/** Los roles que tocan con estos hubs vendidos, en el orden de siempre. Líderes, siempre. */
export function rolesParaLosHubs(hubs: readonly string[]): RolDeAcademy[] {
  const deLosHubs = new Set(hubs.map((h) => ROL_DEL_HUB[h]).filter(Boolean));
  return ROLES_DE_ACADEMY.map((r) => r.value).filter((r) => r === "lideres" || deLosHubs.has(r));
}

/**
 * La ruta que sugiere Nexus: las listas activas del catálogo cuyo hub se vendió (o que sirven con cualquiera) y cuyo rol
 * toca, por rol y en el orden del catálogo. Sin hubs vendidos, solo las generales de líderes.
 */
export function rutaSugerida(catalogo: readonly ListaDelCatalogo[], hubsVendidos: readonly string[]): ListaEnElKickoff[] {
  const hubs = new Set(hubsVendidos);
  const roles = rolesParaLosHubs(hubsVendidos);
  const elegidas = catalogo.filter((l) => l.activa && (l.hub === "general" || hubs.has(l.hub)) && roles.includes(l.rol as RolDeAcademy));
  return roles.flatMap((rol) =>
    elegidas
      .filter((l) => l.rol === rol)
      .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre))
      .map((l) => copiaParaElKickoff(l)),
  );
}

/** La copia de una lista del catálogo que guarda el kickoff. */
export function copiaParaElKickoff(l: ListaDelCatalogo): ListaEnElKickoff {
  return {
    id: `a${l.id}`,
    catalogoId: l.id,
    nombre: l.nombre.trim(),
    enlace: l.enlace.trim(),
    hub: l.hub,
    rol: l.rol,
    duracion: duracionEnPalabras(l.duracionMinutos),
  };
}

/** Las listas del kickoff agrupadas por rol, en el orden de siempre (un rol desconocido va al final). */
export function porRol(listas: readonly ListaEnElKickoff[]): Array<{ rol: string; etiqueta: string; listas: ListaEnElKickoff[] }> {
  const orden = [...ROLES_DE_ACADEMY.map((r) => r.value as string)];
  for (const l of listas) if (l.rol && !orden.includes(l.rol)) orden.push(l.rol);
  const sinRol = listas.filter((l) => !l.rol);
  const grupos = orden
    .map((rol) => ({ rol, etiqueta: etiquetaDeRol(rol), listas: listas.filter((l) => l.rol === rol) }))
    .filter((g) => g.listas.length);
  return sinRol.length ? [...grupos, { rol: "", etiqueta: etiquetaDeRol(""), listas: sinRol }] : grupos;
}

/** Lo que una lista nueva del catálogo necesita para guardarse. Devuelve el motivo, o null si está bien. */
export function porQueNoSeGuarda(l: { nombre?: unknown; enlace?: unknown; hub?: unknown; rol?: unknown; duracionMinutos?: unknown }): string | null {
  if (!lleno(l.nombre)) return "Escribe el nombre de la lista.";
  if (!enlaceDeAcademyValido(l.enlace)) return "El enlace tiene que empezar con https://.";
  if (!HUBS_DE_ACADEMY.some((h) => h.value === l.hub)) return "Elige el hub.";
  if (!ROLES_DE_ACADEMY.some((r) => r.value === l.rol)) return "Elige para quién es.";
  if (l.duracionMinutos != null && (typeof l.duracionMinutos !== "number" || !Number.isInteger(l.duracionMinutos) || l.duracionMinutos < 0 || l.duracionMinutos > 6000))
    return "La duración va en minutos, entre 0 y 6000.";
  return null;
}
