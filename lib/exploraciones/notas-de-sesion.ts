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
 * La clave de las «Instrucciones adicionales» del contexto de la preventa (pedido de Elías: el mismo
 * «Contexto adicional» en todas las piezas, como el del cronograma). Viven en `contenido.notas`, con
 * la operación `nota` de siempre: sin SQL. No es una nota del vendedor sobre el cliente: es lo que le
 * pide a la IA, así que no entra como fuente (no se cita ni prueba un nivel).
 */
export const CLAVE_DE_INSTRUCCIONES = "instrucciones";

/** El bloque que reciben los agentes de la preventa, o "" si no hay instrucciones. */
export function bloqueDeInstrucciones(notas: Readonly<Record<string, string>>): string {
  const texto = (notas[CLAVE_DE_INSTRUCCIONES] ?? "").trim();
  if (!texto) return "";
  return (
    `=== INSTRUCCIONES ADICIONALES DEL VENDEDOR ===\n${texto}\n` +
    "(Tenlas en cuenta en todo lo que propongas: pesan más que lo demás. No son palabras del cliente ni evidencia: no las cites ni las uses para dar un nivel.)\n\n"
  );
}
