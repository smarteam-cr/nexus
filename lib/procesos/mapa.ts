/**
 * lib/procesos/mapa.ts — EL MAPA DE UN PROCESO DEL CLIENTE: HOY Y DESPUÉS DE LA IMPLEMENTACIÓN.
 *
 * Puro (sin Prisma, sin servidor y sin zod): lo leen el agente, las rutas, la pantalla y los
 * documentos. Leer la respuesta del modelo vive aparte (`respuesta.ts`), porque usa zod y la pantalla
 * no tiene por qué cargarlo (guarda C-24 de lib/auth/client-safe.test.ts).
 *
 * Un proceso es UN bloque FLOWCHART de la sección «procesos» de Información del cliente, con
 * `data.formato = "carriles-v1"`. Convive con los mapas del formato anterior (los del agente
 * `agent-mapeo-inicial`: `data.nodes` + `data.edges`), que se siguen viendo hasta volver a mapear.
 * Sin SQL: la forma nueva vive en el mismo Json.
 *
 * Las dos versiones comparten el mismo modelo: carriles (quién hace el paso), pasos y flechas. Cada
 * paso dice de DÓNDE sale (`origen`) y, si lo dijo el cliente, trae la cita literal de la reunión,
 * verificada por código contra la transcripción (`lib/procesos/citas.ts`), no por el modelo.
 * Ver docs/DECISIONS.md «Procesos: un mapa de hoy y uno de después, en carriles».
 */
export const FORMATO_MAPA = "carriles-v1" as const;
export const FORMATO_INDICE = "procesos-indice-v1" as const;

export const ORIGENES = ["dicho", "acordado", "propuesto", "supuesto"] as const;
export type OrigenDelPaso = (typeof ORIGENES)[number];
export const TIPOS_DE_PASO = ["inicio", "paso", "decision", "espera", "fin"] as const;
export type TipoDePaso = (typeof TIPOS_DE_PASO)[number];
export const CAMBIOS = ["igual", "cambia", "nuevo", "automatico"] as const;
export type CambioDelPaso = (typeof CAMBIOS)[number];
export const TIPOS_DE_CARRIL = ["cliente_final", "equipo", "sistema"] as const;
export type TipoDeCarril = (typeof TIPOS_DE_CARRIL)[number];
export const ESTADOS = ["borrador", "revisado", "validado"] as const;
export type EstadoDelMapa = (typeof ESTADOS)[number];
export const AREAS = ["marketing", "ventas", "servicio", "operacion", "finanzas"] as const;
export type AreaDelProceso = (typeof AREAS)[number];

export interface CitaDelPaso {
  sesionId: string;
  sesionTitulo: string;
  /** YYYY-MM-DD de la reunión. */
  fecha: string;
  cita: string;
  /** «mm:ss» o «h:mm:ss» de la marca de tiempo más cercana de la transcripción. */
  minuto?: string;
  /** Quién lo dijo, como lo nombra la transcripción. */
  quien?: string;
}

export interface PasoDelMapa {
  id: string;
  carril: string;
  texto: string;
  tipo: TipoDePaso;
  herramienta: string;
  origen: OrigenDelPaso;
  citas: CitaDelPaso[];
  /** Solo en HOY: qué falla o cuesta en ese paso, si una reunión lo dijo. */
  dolor: string;
  /** Solo en DESPUÉS. */
  cambio: CambioDelPaso | "";
  /** Solo en DESPUÉS: los pasos de HOY que este reemplaza. */
  reemplaza: string[];
  /** Solo en DESPUÉS: dónde vive en HubSpot, si se sabe. */
  enHubspot: string;
}

export interface CarrilDelMapa {
  id: string;
  nombre: string;
  tipo: TipoDeCarril;
}

export interface FlechaDelMapa {
  de: string;
  a: string;
  etiqueta: string;
}

export interface VersionDelMapa {
  carriles: CarrilDelMapa[];
  pasos: PasoDelMapa[];
  flechas: FlechaDelMapa[];
}

export interface CambioDelProceso {
  texto: string;
  hoy: string[];
  despues: string[];
}

export interface MapaDeProceso {
  formato: typeof FORMATO_MAPA;
  /** Slug estable del proceso: al volver a mapear, un mapa editado a mano con el mismo id se respeta. */
  id: string;
  nombre: string;
  area: AreaDelProceso;
  queResuelve: string;
  hoy: VersionDelMapa;
  despues: VersionDelMapa & { seVa: { id: string; porque: string }[] };
  cambios: CambioDelProceso[];
  /** Lo que falta confirmar con el cliente para que el mapa sea cierto. */
  preguntas: string[];
  estado: EstadoDelMapa;
  /** Sube con cada cambio guardado (editor, estado): guardar sobre otra versión responde 409. Ausente = 0. */
  version?: number;
  /** Los nombres con que las lecturas de cada reunión llamaron a este proceso: de ahí salen las citas
   *  que el editor ofrece para sumar. Ausente en mapas armados antes del 2026-10-07. */
  incluye?: string[];
  revisadoPor?: string | null;
  revisadoEn?: string | null;
  validadoPor?: string | null;
  validadoEn?: string | null;
  generadoEn: string;
}

export interface SesionLeida {
  id: string;
  titulo: string;
  fecha: string;
  hechos: number;
}

/** El bloque CARD que acompaña a los mapas: el resumen del agente y lo que no se pudo mapear. */
export interface IndiceDeProcesos {
  formato: typeof FORMATO_INDICE;
  resumen: string;
  porLevantar: { nombre: string; falta: string }[];
  sesiones: SesionLeida[];
  generadoEn: string;
}

// ── Reconocer qué hay en un bloque ──────────────────────────────────────────────

export function esMapaDeCarriles(data: unknown): data is MapaDeProceso {
  return !!data && typeof data === "object" && (data as { formato?: unknown }).formato === FORMATO_MAPA;
}

export function esIndiceDeProcesos(data: unknown): data is IndiceDeProcesos {
  return !!data && typeof data === "object" && (data as { formato?: unknown }).formato === FORMATO_INDICE;
}

/** Un mapa del formato anterior con contenido (lo que antes era la única forma). */
export function esMapaAnterior(data: unknown): boolean {
  const nodes = (data as { nodes?: unknown } | null)?.nodes;
  return Array.isArray(nodes) && nodes.length > 0;
}

/**
 * ¿Este bloque cuenta como «el cliente tiene procesos»? Lo usan el chip del proyecto, la cartera y
 * el gate de generar/regenerar: con los mapas nuevos, mirar solo `nodes` diría que no hay ninguno.
 */
export function tieneContenidoDeProceso(data: unknown): boolean {
  if (esMapaDeCarriles(data)) return data.hoy.pasos.length > 0 || data.despues.pasos.length > 0;
  return esMapaAnterior(data);
}

/** Un slug estable para el id de un proceso («Admisión y matrícula» → «admision-y-matricula»). */
export function slugDeProceso(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "proceso";
}

/** Una cita sin ubicar todavía: la clave de la reunión (S1, S2…) y el texto. */
export type CitaSinUbicar = { sesion: string; cita: string };

// ── Cuentas que leen la pantalla y los documentos ───────────────────────────────

export function cuentasDelMapa(m: MapaDeProceso) {
  const supuestos = m.hoy.pasos.filter((p) => p.origen === "supuesto").length + m.despues.pasos.filter((p) => p.origen === "supuesto").length;
  const propuestos = m.despues.pasos.filter((p) => p.origen === "propuesto").length;
  const conCita = m.hoy.pasos.filter((p) => p.origen === "dicho").length + m.despues.pasos.filter((p) => p.origen === "acordado").length;
  const reuniones = new Set([...m.hoy.pasos, ...m.despues.pasos].flatMap((p) => p.citas.map((c) => c.sesionId)));
  const carrilesSistema = new Set(m.despues.carriles.filter((c) => c.tipo === "sistema").map((c) => c.id));
  return {
    pasos: m.hoy.pasos.length + m.despues.pasos.length,
    conCita,
    supuestos,
    propuestos,
    reuniones: reuniones.size,
    dolores: m.hoy.pasos.filter((p) => p.dolor).length,
    responsablesHoy: m.hoy.carriles.filter((c) => c.tipo !== "sistema").length,
    loHaceElSistema: m.despues.pasos.filter((p) => carrilesSistema.has(p.carril)).length,
    nuevos: m.despues.pasos.filter((p) => p.cambio === "nuevo").length,
  };
}

export const ETIQUETA_DE_AREA: Record<AreaDelProceso, string> = {
  marketing: "Marketing",
  ventas: "Ventas",
  servicio: "Servicio",
  operacion: "Operación",
  finanzas: "Finanzas",
};

export const ETIQUETA_DE_ESTADO: Record<EstadoDelMapa, string> = {
  borrador: "Borrador del agente",
  revisado: "Revisado",
  validado: "Validado con el cliente",
};

export const ETIQUETA_DE_ORIGEN: Record<OrigenDelPaso, string> = {
  dicho: "Lo dijo el cliente",
  acordado: "Acordado con el cliente",
  propuesto: "Propuesto por Smarteam · el cliente no lo confirmó",
  supuesto: "Supuesto del agente · confírmalo con el cliente",
};
