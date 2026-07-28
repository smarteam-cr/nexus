/**
 * lib/ui/logo-scale.ts — el tamaño del logo del cliente, en un solo lugar.
 *
 * El logo se pinta en 7 superficies con TRES altos base distintos y ya afinados: 30px sobre
 * el navy del hero (app/landing-engine.css), 40px en el cronograma que ve el cliente
 * (TimelineLanding) y 36px en el cronograma interno (CronogramaCanvas). Por eso el tamaño se
 * guarda como PORCENTAJE y no en píxeles: un número en px obligaría a unificar los tres altos,
 * y eso cambiaría el aspecto de todo lo ya publicado. El porcentaje es un multiplicador —
 * cada superficie conserva su alto y el número significa lo mismo en todas.
 *
 * DOS NIVELES, y el de arriba es ABSOLUTO:
 *   base del cliente (`Client.logoScale`) → aplica a todos sus documentos
 *   ajuste del canvas (`hero.logoScale`)  → PISA a la base, no la multiplica
 * Base 120 + canvas 150 se ve a 150, no a 180. Si multiplicara, el número que muestra la
 * barra no sería el tamaño que se ve y el control dejaría de ser legible.
 *
 * ⚠ POR QUÉ ESTE ARCHIVO ES LA ÚNICA FUENTE DEL STRING CSS ─────────────────────────────
 * El mecanismo es `height: calc(30px * var(--logo-scale, 1))` con la variable SIN UNIDAD.
 * Si alguna vez sale con unidad ("120%", "1.2px"), el `calc` se vuelve inválido, la
 * declaración entera se descarta y `height` cae a `auto` → el logo se pinta a su resolución
 * natural, que pueden ser 1000px de alto, en una propuesta que el cliente está mirando.
 * No es una degradación: es una explosión. `logoScaleStyle` es el único constructor, y tiene
 * test.
 */
import type { CSSProperties } from "react";

/** 50% sobre 30px son 15px: el piso de legibilidad de un logo con texto. */
export const LOGO_SCALE_MIN = 50;
/** 200% sobre 30px son 60px, donde el logo del cliente ya aplasta al de Smarteam en la
 *  misma fila. Que el tope sea alcanzable y feo es mejor que un tope que corte una
 *  necesidad real. */
export const LOGO_SCALE_MAX = 200;
/** Paso 5 → 31 posiciones: resolución suficiente sin fingir precisión de 1%. */
export const LOGO_SCALE_STEP = 5;
export const LOGO_SCALE_DEFAULT = 100;

/** Nombre de la custom property. Una constante para que el CSS y el TS no deriven. */
export const LOGO_SCALE_VAR = "--logo-scale";

/**
 * Normaliza lo que venga de la DB, de un Json de canvas o de un input.
 * `null` cuando no hay valor utilizable — y `null` NO es 0: 0 sería un logo invisible.
 */
export function clampLogoScale(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? Number(value) : NaN;
  if (!Number.isFinite(n)) return null;
  const entero = Math.round(n);
  if (entero < LOGO_SCALE_MIN) return LOGO_SCALE_MIN;
  if (entero > LOGO_SCALE_MAX) return LOGO_SCALE_MAX;
  return entero;
}

/**
 * El porcentaje EFECTIVO de una superficie: el ajuste del canvas pisa a la base del
 * cliente, y si no hay ninguno, 100. Nunca devuelve null — quien pinta necesita un número.
 */
export function resolveLogoScale(base: unknown, override?: unknown): number {
  return clampLogoScale(override) ?? clampLogoScale(base) ?? LOGO_SCALE_DEFAULT;
}

/**
 * El `style` del `<img>`. Se pone SOLO en el logo del cliente: los de Smarteam y HubSpot
 * comparten la misma clase CSS y, al no traer la variable, caen al fallback `1` y quedan
 * exactamente como estaban.
 *
 * Devuelve `undefined` en el 100% para no ensuciar el DOM de los clientes sin configurar
 * (que hoy son todos) — el fallback del CSS ya da ese valor.
 */
export function logoScaleStyle(pct: number): CSSProperties | undefined {
  if (pct === LOGO_SCALE_DEFAULT) return undefined;
  // Sin unidad y con `/ 100` explícito: el CSS multiplica píxeles por este número pelado.
  return { [LOGO_SCALE_VAR]: String(pct / 100) } as CSSProperties;
}

/** `height` de una superficie cuyo alto base NO vive en el CSS del motor (los cronogramas,
 *  que hoy lo tienen inline o en Tailwind). Mismo `calc` que la regla compartida. */
export function logoHeightCalc(basePx: number): string {
  return `calc(${basePx}px * var(${LOGO_SCALE_VAR}, 1))`;
}
