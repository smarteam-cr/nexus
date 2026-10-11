/**
 * lib/cs/filtros-de-cartera.ts — los filtros de la pestaña «Cartera» y sus vistas (2026-10-09). PURO.
 *
 * Entrega 3 de docs/exito-del-cliente-cartera-plan.md: filtrar por color, relación con HubSpot, tipo de relación,
 * momento, potencial, CSE y renovación, con varios valores a la vez. Los filtros viven en la dirección: una vista
 * es un enlace. Las vistas guardadas (`VistaDeCartera`) son compartidas; las de arranque están acá y no se guardan.
 */
import type { FilaDeLaCartera } from "./clasificacion";
import { ESTADOS_DE_RELACION, type EstadoDeRelacion } from "./relacion-gestionada";
import { COLORES_EN_ORDEN, type SaludDeCuenta } from "./cartera-reglas";
import { diasEntre } from "./formato";
import { coincideBusqueda } from "@/lib/ui/text-search";

export type AlcanceDeCartera = "cartera" | "fuera" | "todas";

/** El valor del filtro de CSE que quiere decir «sin CSE». */
export const SIN_CSE = "__sin__";

export interface FiltrosDeCartera {
  alcance: AlcanceDeCartera;
  color: SaludDeCuenta[];
  hubspot: EstadoDeRelacion[];
  relacion: string[];
  momento: string[];
  potencial: string[];
  /** Nombres de CSE, o `SIN_CSE`. */
  cse: string[];
  /** Renueva en estos días o menos. null = sin filtro. */
  renueva: number | null;
  /** Solo las que tienen el contacto frío o ninguno (las razones «fria» y «sinContacto» del color). */
  sinContacto: boolean;
  porConfirmar: boolean;
  /** La búsqueda por nombre (no se guarda en una vista). */
  q: string;
}

export const FILTROS_VACIOS: FiltrosDeCartera = {
  alcance: "cartera",
  color: [],
  hubspot: [],
  relacion: [],
  momento: [],
  potencial: [],
  cse: [],
  renueva: null,
  sinContacto: false,
  porConfirmar: false,
  q: "",
};

/** Las ventanas de renovación que se ofrecen. */
export const VENTANAS_DE_RENOVACION = [30, 90] as const;

const LISTAS = ["color", "hubspot", "relacion", "momento", "potencial", "cse"] as const;
type Lista = (typeof LISTAS)[number];

const COLORES = new Set<string>(COLORES_EN_ORDEN);
const ESTADOS = new Set<string>(ESTADOS_DE_RELACION.map((e) => e.clave));

type Parametros = URLSearchParams | Record<string, string | string[] | undefined>;

function leer(p: Parametros, k: string): string | null {
  if (p instanceof URLSearchParams) return p.get(k);
  const v = p[k];
  return Array.isArray(v) ? (v[0] ?? null) : (v ?? null);
}

function lista(p: Parametros, k: string, validos?: ReadonlySet<string>): string[] {
  const v = leer(p, k);
  if (!v) return [];
  const xs = [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))].slice(0, 20);
  return validos ? xs.filter((x) => validos.has(x)) : xs.map((x) => x.slice(0, 80));
}

/** Los filtros de la dirección (`?color=en-riesgo,en-friccion&cse=Ana`). Lo que no se entiende se ignora. */
export function filtrosDesdeParametros(p: Parametros): FiltrosDeCartera {
  const alcance = leer(p, "alcance");
  const renueva = Number(leer(p, "renueva"));
  return {
    alcance: alcance === "fuera" || alcance === "todas" ? alcance : "cartera",
    color: lista(p, "color", COLORES) as SaludDeCuenta[],
    hubspot: lista(p, "hubspot", ESTADOS) as EstadoDeRelacion[],
    relacion: lista(p, "relacion"),
    momento: lista(p, "momento"),
    potencial: lista(p, "potencial"),
    cse: lista(p, "cse"),
    renueva: Number.isFinite(renueva) && renueva > 0 && renueva <= 365 ? Math.round(renueva) : null,
    sinContacto: leer(p, "sinContacto") === "1",
    porConfirmar: leer(p, "porConfirmar") === "1",
    q: (leer(p, "q") ?? "").slice(0, 80),
  };
}

/** Los filtros como parámetros de la dirección: solo lo que no es el valor por defecto. */
export function parametrosDeFiltros(f: FiltrosDeCartera): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  if (f.alcance !== "cartera") out.push(["alcance", f.alcance]);
  for (const k of LISTAS) if (f[k].length > 0) out.push([k, f[k].join(",")]);
  if (f.renueva !== null) out.push(["renueva", String(f.renueva)]);
  if (f.sinContacto) out.push(["sinContacto", "1"]);
  if (f.porConfirmar) out.push(["porConfirmar", "1"]);
  if (f.q.trim()) out.push(["q", f.q.trim()]);
  return out;
}

/** Las claves de la dirección que son de la cartera (para limpiarlas al cambiar de vista). */
export const CLAVES_DE_FILTROS = ["alcance", ...LISTAS, "renueva", "sinContacto", "porConfirmar", "q"] as const;

/** Lo que se guarda en una vista: todo menos la búsqueda. */
export function filtrosParaGuardar(f: FiltrosDeCartera): Omit<FiltrosDeCartera, "q"> {
  const { q: _q, ...resto } = f;
  void _q;
  return resto;
}

/** Una vista guardada vieja o escrita a mano se lee con la misma tolerancia que la dirección. */
export function filtrosDeUnaVista(guardado: unknown): FiltrosDeCartera {
  if (!guardado || typeof guardado !== "object" || Array.isArray(guardado)) return { ...FILTROS_VACIOS };
  const o = guardado as Record<string, unknown>;
  const p: Record<string, string> = {};
  for (const [k, v] of Object.entries(o)) {
    if (Array.isArray(v)) p[k] = v.filter((x) => typeof x === "string").join(",");
    else if (typeof v === "string") p[k] = v;
    else if (typeof v === "number") p[k] = String(v);
    else if (v === true) p[k] = "1";
  }
  return { ...filtrosDesdeParametros(p), q: "" };
}

export function hayFiltros(f: FiltrosDeCartera): boolean {
  return parametrosDeFiltros({ ...f, alcance: "cartera" }).length > 0 || f.alcance !== "cartera";
}

/** ¿Los filtros son los mismos (sin la búsqueda)? Para marcar la vista que se está viendo. */
export function mismosFiltros(a: FiltrosDeCartera, b: FiltrosDeCartera): boolean {
  const norm = (f: FiltrosDeCartera) =>
    JSON.stringify(
      parametrosDeFiltros({ ...f, q: "" })
        .map(([k, v]) => [k, v.split(",").sort().join(",")])
        .sort(),
    );
  return norm(a) === norm(b);
}

/** ¿La fila pasa los filtros? Sin la búsqueda ni el alcance: esos los aplica `filasQuePasan`. */
function pasaLasListas(f: FilaDeLaCartera, x: FiltrosDeCartera, hoy: string, pendientes: (f: FilaDeLaCartera) => number): boolean {
  if (x.color.length && !x.color.includes(f.salud)) return false;
  if (x.hubspot.length && !x.hubspot.includes(f.relacion.estado)) return false;
  if (x.relacion.length && !x.relacion.includes(f.clasificacion.relacion.vigente)) return false;
  if (x.momento.length && !x.momento.includes(f.clasificacion.momento.vigente)) return false;
  if (x.potencial.length && !x.potencial.includes(f.clasificacion.potencial.vigente)) return false;
  if (x.cse.length) {
    const sinCse = x.cse.includes(SIN_CSE) && f.proyectosActivos > 0 && f.cses.length === 0;
    // El CSE de la cuenta (quien lleva más proyectos en ella): el mismo que cuenta la pestaña «Equipo».
    if (!sinCse && !x.cse.some((n) => f.cse?.nombre === n)) return false;
  }
  if (x.renueva !== null && (!f.renueva || diasEntre(hoy, f.renueva) > x.renueva)) return false;
  if (x.sinContacto && !f.razonesDelColor.some((r) => r === "fria" || r === "sinContacto")) return false;
  if (x.porConfirmar && pendientes(f) === 0) return false;
  return true;
}

export function enElAlcance(f: Pick<FilaDeLaCartera, "enCartera">, alcance: AlcanceDeCartera): boolean {
  return alcance === "todas" ? true : alcance === "cartera" ? f.enCartera : !f.enCartera;
}

/** Las filas que se ven con estos filtros. */
export function filasQuePasan(
  filas: readonly FilaDeLaCartera[],
  x: FiltrosDeCartera,
  hoy: string,
  pendientes: (f: FilaDeLaCartera) => number,
): FilaDeLaCartera[] {
  return filas.filter((f) => enElAlcance(f, x.alcance) && coincideBusqueda(f.nombre, x.q) && pasaLasListas(f, x, hoy, pendientes));
}

/** Cuántas filas del alcance tienen cada valor de una lista (para el número al lado de cada opción). */
export function cuantasPor(
  filas: readonly FilaDeLaCartera[],
  lista: Lista,
  valor: string,
): number {
  return filas.filter((f) => {
    switch (lista) {
      case "color":
        return f.salud === valor;
      case "hubspot":
        return f.relacion.estado === valor;
      case "relacion":
        return f.clasificacion.relacion.vigente === valor;
      case "momento":
        return f.clasificacion.momento.vigente === valor;
      case "potencial":
        return f.clasificacion.potencial.vigente === valor;
      case "cse":
        return valor === SIN_CSE ? f.proyectosActivos > 0 && f.cses.length === 0 : f.cse?.nombre === valor;
    }
  }).length;
}

// ── LAS VISTAS DE ARRANQUE ───────────────────────────────────────────────────────────────────

export interface VistaDeArranque {
  id: string;
  nombre: string;
  /** Una línea: qué junta y para qué. */
  para: string;
  filtros: FiltrosDeCartera;
}

const vista = (id: string, nombre: string, para: string, f: Partial<FiltrosDeCartera>): VistaDeArranque => ({
  id,
  nombre,
  para,
  filtros: { ...FILTROS_VACIOS, ...f },
});

/** Las de arranque (plan, entrega 3), más la de la relación con HubSpot (2026-10-09). No se guardan ni se borran. */
export const VISTAS_DE_ARRANQUE: readonly VistaDeArranque[] = [
  vista("riesgo-renueva", "En riesgo con renovación cercana", "Rojas que renuevan en 90 días o menos: la conversación de esta semana.", {
    color: ["en-riesgo"],
    renueva: 90,
  }),
  vista("relacion-por-vencer", "Relación con HubSpot por vencer", "Sin trabajo en su portal se pierden el uso y los puntos de partner.", {
    hubspot: ["urgente", "por-vencer", "terminada"],
  }),
  vista("en-espera", "En espera del cliente", "Frenadas por el cliente: qué se espera de cada una.", { color: ["en-espera"] }),
  vista("alto-potencial", "Alto potencial sin servicio activo", "Cuentas donde se puede vender y hoy no hay nada en curso.", {
    alcance: "todas",
    potencial: ["alto"],
    relacion: ["sin-servicio", "licencias"],
  }),
  vista("sin-cse", "Sin CSE", "Cuentas con proyecto activo que no lleva nadie.", { cse: [SIN_CSE] }),
];

// ── LA PESTAÑA «EQUIPO» (entrega 4) ──────────────────────────────────────────────────────────

/** Lo que mira la CSL de cada CSE en la 1:1. Cada número se abre como filtro de la pestaña «Cartera». */
export interface CifrasDelCse {
  cuentas: number;
  recurrentes: number;
  enRiesgo: number;
  enEspera: number;
  sinContacto: number;
  relacionPorVencer: number;
}

/** Las cifras de un CSE: las cuentas de la cartera cuyo CSE es él (quien lleva más proyectos en ella). */
export function cifrasDelCse(filas: readonly FilaDeLaCartera[], nombre: string): CifrasDelCse {
  const suyas = filas.filter((f) => f.enCartera && f.cse?.nombre === nombre);
  return {
    cuentas: suyas.length,
    recurrentes: suyas.filter((f) => f.clasificacion.relacion.vigente === "recurrente").length,
    enRiesgo: suyas.filter((f) => f.salud === "en-riesgo").length,
    enEspera: suyas.filter((f) => f.salud === "en-espera").length,
    sinContacto: suyas.filter((f) => f.razonesDelColor.some((r) => r === "fria" || r === "sinContacto")).length,
    relacionPorVencer: suyas.filter((f) => ["urgente", "por-vencer", "terminada"].includes(f.relacion.estado)).length,
  };
}

/** El filtro de la pestaña «Cartera» que abre cada número de la pestaña «Equipo». */
export function filtroDeLaCifra(nombre: string, cifra: keyof CifrasDelCse): FiltrosDeCartera {
  const base: FiltrosDeCartera = { ...FILTROS_VACIOS, cse: [nombre] };
  switch (cifra) {
    case "cuentas":
      return base;
    case "recurrentes":
      return { ...base, relacion: ["recurrente"] };
    case "enRiesgo":
      return { ...base, color: ["en-riesgo"] };
    case "enEspera":
      return { ...base, color: ["en-espera"] };
    case "sinContacto":
      return { ...base, sinContacto: true };
    case "relacionPorVencer":
      return { ...base, hubspot: ["urgente", "por-vencer", "terminada"] };
  }
}

/** Dónde queda un CSE contra la meta de recurrentes. */
export function contraLaMeta(recurrentes: number, meta: { min: number; max: number }): "debajo" | "en-la-meta" | "arriba" {
  if (recurrentes < meta.min) return "debajo";
  if (recurrentes > meta.max) return "arriba";
  return "en-la-meta";
}
