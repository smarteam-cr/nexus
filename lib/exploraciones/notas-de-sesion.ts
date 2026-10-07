/**
 * Las notas del vendedor de cada sesión: lo que sabe o interpreta y no quedó en la grabación (lo que
 * le contaron por WhatsApp, cómo entiende el modelo de negocio). Elías, 2026-10-05: «el vendedor
 * podría agregar notas editables con su propio contexto». PURO.
 *
 * Viven en `contenido.notas`, el mismo registro de las notas rápidas del guion viejo (que se siguen
 * leyendo), con la clave `sesion:<id de la sesión>`: así se guardan con la operación `nota` de
 * siempre, sin SQL, y el agente ya las lee como fuente del vendedor (fuentes.ts, N0).
 */
import type { SesionPlaneada } from "./guia";
import { diaCorto } from "./fechas";

const PREFIJO = "sesion:";

/** El tope de una nota: el mismo que valida `contenido.notas` (esquemas.ts). */
export const MAX_NOTA_DE_SESION = 4000;
/** El tope de la clave de una nota: alcanza para `sesion:<id>:<a qué apunta la pregunta>`. */
export const MAX_CLAVE_DE_NOTA = 72;

export function claveDeNotaDeSesion(sesionId: string): string {
  return `${PREFIJO}${sesionId}`;
}

/**
 * Lo que respondió el cliente a una pregunta de la guía, anotado durante la reunión (rediseño de las
 * sesiones, 2026-10-07): una nota por pregunta, `sesion:<id>:<a qué apunta>` (`metas`, `1.3`).
 */
export function claveDeNotaDePregunta(sesionId: string, para: string): string {
  return `${PREFIJO}${sesionId}:${para}`;
}

/**
 * Cómo se nombra una nota para el agente. Las de una sesión llevan su número, su fecha y su tema;
 * las de una pregunta, además, la pregunta. `rotuloDePaso` nombra las del guion viejo. null = una
 * clave que no se reconoce.
 */
export function rotuloDeLaNota(
  clave: string,
  sesiones: readonly SesionPlaneada[],
  rotuloDePaso: (id: string) => string | null,
  preguntaDe: (sesionId: string, para: string) => string | null = () => null,
): string | null {
  if (!clave.startsWith(PREFIJO)) return rotuloDePaso(clave);
  const [id, ...resto] = clave.slice(PREFIJO.length).split(":");
  const para = resto.join(":");
  const i = sesiones.findIndex((s) => s.id === id);
  if (i < 0) return "Notas del vendedor de una sesión que ya no está";
  const s = sesiones[i];
  const datos = [s.fecha ? diaCorto(s.fecha) : null, s.titulo ?? null].filter(Boolean).join(", ");
  const base = `Notas del vendedor de la sesión ${i + 1}${datos ? ` (${datos})` : ""}`;
  if (!para) return base;
  const pregunta = preguntaDe(id, para);
  return `${base}, sobre lo que respondió el cliente a ${pregunta ? `«${pregunta}»` : `lo que apunta a ${para}`}`;
}

// ── Las instrucciones adicionales de la preventa (2026-10-06) ─────────────────

/**
 * Las «Instrucciones adicionales» del contexto de la preventa. Desde el 2026-10-07, una por PIEZA
 * (Elías: «la misma sección, pero guardarse para cada artefacto»), y cada una la lee solo el agente de
 * esa pieza: la de Preparación, la preparación; la de Exploración, la lectura de cada reunión y la
 * guía; la de Casos de uso, los casos. Las reuniones y las fuentes manuales siguen siendo de la
 * empresa y se ven en todas. Viven en `contenido.notas` (`instrucciones:<pieza>`), con la operación
 * `nota` de siempre: sin SQL. No son una nota del vendedor sobre el cliente: es lo que le pide a la
 * IA, así que no entran como fuente (no se citan ni prueban un nivel).
 */
export const PIEZAS_CON_INSTRUCCIONES = ["preparacion", "exploracion", "casos"] as const;
export type PiezaConInstrucciones = (typeof PIEZAS_CON_INSTRUCCIONES)[number];

/** El prefijo de las claves de instrucciones (y la clave única que hubo hasta el 2026-10-07, sin pieza). */
export const CLAVE_DE_INSTRUCCIONES = "instrucciones";

export function claveDeInstrucciones(pieza: PiezaConInstrucciones): string {
  return `${CLAVE_DE_INSTRUCCIONES}:${pieza}`;
}

/** ¿Esta nota son instrucciones (de cualquier pieza) y no una nota del vendedor? */
export function esClaveDeInstrucciones(clave: string): boolean {
  return clave === CLAVE_DE_INSTRUCCIONES || clave.startsWith(`${CLAVE_DE_INSTRUCCIONES}:`);
}

/** El bloque que recibe el agente de esa pieza, o "" si no hay instrucciones. */
export function bloqueDeInstrucciones(notas: Readonly<Record<string, string>>, pieza: PiezaConInstrucciones): string {
  const texto = (notas[claveDeInstrucciones(pieza)] ?? "").trim();
  if (!texto) return "";
  return (
    `=== INSTRUCCIONES ADICIONALES DEL VENDEDOR ===\n${texto}\n` +
    "(Tenlas en cuenta en todo lo que propongas: pesan más que lo demás. No son palabras del cliente ni evidencia: no las cites ni las uses para dar un nivel.)\n\n"
  );
}
