/**
 * lib/canvas/acciones-del-enfoque.ts — las «Acciones coherentes» del diagnóstico, cortas (2026-10-28, decisión 16 del
 * roadmap, L4 etapa 2).
 *
 * Elías: en el diagnóstico queda el enfoque con tres o cuatro acciones, una línea cada una, y el detalle (grupo, hub,
 * quick win y alcance) pasa a la Planificación (sección «Las acciones, en detalle»). Solo para los diagnósticos que se
 * generen desde ese día: los ya generados no se tocan, ni en datos ni en cómo se ven.
 *
 * Cómo se distingue uno del otro sin tocar lo guardado: el runner marca la sección con `__forma: "enfoque"` (fuera del
 * esquema: `preserveNonSchemaKeys` la acarrea en el chat y en «Mejorar con IA», y `NO_CONTENIDO` la ignora) y le
 * saca a cada acción los campos del detalle. La tabla corta se pinta SOLO con la marca y sin detalle escrito: un
 * diagnóstico viejo no tiene la marca y se ve igual que siempre, y si alguien le escribe detalle a uno nuevo (el chat
 * lo puede hacer), la tabla lo muestra en vez de esconderlo.
 *
 * Lo que quedó fuera del alcance: con el campo `alcance` vacío, una acción de un diagnóstico nuevo se marca «Fuera de este
 * alcance» en «Consecuencias positivas» cuando «Alcance acordado» la cita en su lista `fuera` (`accionesFueraDelAlcance`).
 * En un diagnóstico viejo manda su `alcance`, como siempre.
 *
 * Módulo PURO: lo usan el runner (server), el adaptador y el renderer (client); se testea sin base.
 */
import { codigosCitados, normalizarCodigo } from "./revisar-hilo";

/** La sección del diagnóstico. Igual a `ACCIONES_KEY` de diagnostico.defs.ts (no se importa: este módulo es puro). */
const ACCIONES = "acciones";

/** Dónde vive la marca en el Json de la sección. */
export const CLAVE_DE_LA_FORMA = "__forma";
/** La forma corta: el enfoque con tres o cuatro acciones de una línea. */
export const FORMA_DEL_ENFOQUE = "enfoque";

/** Lo que pasó a la Planificación: el diagnóstico corto ya no lo escribe. */
export const CAMPOS_DEL_DETALLE = ["grupo", "hub", "quickWin", "alcance"] as const;

const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** ¿Alguna acción tiene escrito algo del detalle? */
export function tieneDetalle(acciones: unknown): boolean {
  if (!Array.isArray(acciones)) return false;
  return acciones.some(
    (a) => a && typeof a === "object" && CAMPOS_DEL_DETALLE.some((k) => texto((a as Record<string, unknown>)[k]) !== ""),
  );
}

/** ¿La tabla se pinta corta? Con la marca y sin detalle escrito. Sin la marca (un diagnóstico viejo, la Planificación,
 *  la Ejecución), la de siempre. */
export function seVeCorta(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d[CLAVE_DE_LA_FORMA] === FORMA_DEL_ENFOQUE && !tieneDetalle(d.acciones);
}

/**
 * Lo que hace el runner del diagnóstico después de generar: la sección de acciones queda marcada y sin los campos del
 * detalle (el prompt ya los pide vacíos; esto lo hace cumplir). Devuelve secciones nuevas; sin la sección, las mismas.
 */
export function dejarElEnfoqueCorto<T extends { key: string; data: unknown }>(secciones: readonly T[]): T[] {
  return secciones.map((s) => {
    if (s.key !== ACCIONES || !s.data || typeof s.data !== "object") return s;
    const data = s.data as Record<string, unknown>;
    const acciones = Array.isArray(data.acciones)
      ? data.acciones.map((a) => {
          if (!a || typeof a !== "object") return a;
          const sinDetalle = { ...(a as Record<string, unknown>) };
          for (const k of CAMPOS_DEL_DETALLE) delete sinDetalle[k];
          return sinDetalle;
        })
      : data.acciones;
    return { ...s, data: { ...data, acciones, [CLAVE_DE_LA_FORMA]: FORMA_DEL_ENFOQUE } };
  });
}

/** Las acciones (códigos normalizados, «AC1») que «Alcance acordado» deja fuera, en su lista `fuera`. */
export function accionesFueraDelAlcance(alcanceAcordado: unknown): Set<string> {
  const fuera = (alcanceAcordado as { fuera?: unknown } | null | undefined)?.fuera;
  if (!Array.isArray(fuera)) return new Set();
  return new Set(
    fuera.flatMap((f) => (f && typeof f === "object" ? codigosCitados(texto((f as Record<string, unknown>).acciones), "AC") : [])),
  );
}

/** ¿La acción queda fuera del alcance? Su `alcance` manda; vacío (un diagnóstico nuevo), lo dice «Alcance acordado». */
export function accionFuera(accion: { id?: unknown; alcance?: unknown }, fueraDelAlcance: ReadonlySet<string>): boolean {
  const alcance = texto(accion.alcance);
  if (alcance) return /fuera/i.test(alcance);
  const id = texto(accion.id);
  return !!id && fueraDelAlcance.has(normalizarCodigo(id));
}

/**
 * ¿«Mejorar con IA» tiene que seguir el criterio de ANTES (las acciones con su detalle)? Sí cuando la sección guardada no
 * tiene la marca y ya trae detalle: es un diagnóstico generado antes del 2026-10-28, y la guía nueva le propondría
 * vaciarle el grupo, el hub, el quick win y el alcance.
 */
export function esDeAntesDelEnfoqueCorto(data: unknown): boolean {
  if (!data || typeof data !== "object") return false;
  const d = data as Record<string, unknown>;
  return d[CLAVE_DE_LA_FORMA] !== FORMA_DEL_ENFOQUE && tieneDetalle(d.acciones);
}

/** La fila de «Agregar acción». En la tabla corta nace sin el detalle: con un «no» o un «dentro», la tabla volvería a la
 *  larga, con las columnas vacías, apenas alguien agrega una acción a mano. */
export function accionNueva(id: string, corta: boolean) {
  return corta
    ? { id, accion: "", detalle: "", ataca: "", mueve: "" }
    : { id, accion: "", detalle: "", grupo: "", ataca: "", mueve: "", hub: "", quickWin: "no", alcance: "dentro" };
}
