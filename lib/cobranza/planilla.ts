/**
 * lib/cobranza/planilla.ts
 *
 * Calendario PURO del libro de planilla: qué quincenas existen en un período,
 * qué días caen y cuánta cobertura hay. Cero Prisma, cero red.
 *
 * ⚠ QUÉ NO HACE ESTE ARCHIVO, y por qué:
 *
 *  - **No calcula montos.** El monto de una quincena es PROPIO y congelado como
 *    snapshot al crear la fila. `montoQuincena` (el reparto mitad y mitad del
 *    motor) se usa SOLO como sugerencia de UI. Derivarlo del costo haría que
 *    subir un salario a mitad de mes reescribiera la Q2 pendiente al monto nuevo
 *    con la Q1 ya pagada al viejo — y Q1+Q2 no daría ningún salario.
 *  - **No inventa quincenas que no ocurrieron.** `coberturaDe` DECLARA cuántas
 *    hay registradas de cuántas posibles, en vez de rellenar los huecos. El
 *    primer año del libro está incompleto por definición y decirlo es más útil
 *    que fabricarlo.
 *  - **Cero lógica fiscal.** Las quincenas 1-15 y 16-fin son el ciclo con el que
 *    Smarteam paga, no una regla tributaria.
 */
import { finQuincenaISO } from "./engine";

/** "YYYY-MM". Es el período de un mes de planilla. */
export type Periodo = string;

export interface QuincenaDelPeriodo {
  periodo: Periodo;
  /** 1 = del 1 al 15 · 2 = del 16 al fin de mes. */
  quincena: 1 | 2;
  /** El día en que toca pagarla: el 15, o el último del mes (28/29/30/31). */
  fechaProgramada: string;
}

const RE_PERIODO = /^\d{4}-(0[1-9]|1[0-2])$/;

/** ¿El string es un período válido "YYYY-MM"? */
export function esPeriodo(s: string): boolean {
  return RE_PERIODO.test(s);
}

/**
 * Las DOS quincenas de un período, con el día que le toca a cada una.
 *
 * El fin de la Q2 sale de `finQuincenaISO` (el motor) y no de un cálculo propio:
 * es la MISMA regla que agrupa "esta quincena" en la cola de cobros, incluido el
 * clamp de febrero. Dos definiciones de "fin de quincena" es una de más.
 */
export function quincenasDelPeriodo(periodo: Periodo): QuincenaDelPeriodo[] {
  if (!esPeriodo(periodo)) return [];
  return [
    { periodo, quincena: 1, fechaProgramada: `${periodo}-15` },
    { periodo, quincena: 2, fechaProgramada: finQuincenaISO(`${periodo}-16`) },
  ];
}

/** El período al que pertenece una fecha ISO. */
export function periodoDe(iso: string): Periodo {
  return iso.slice(0, 7);
}

/** En qué quincena cae una fecha ISO: día 1-15 → 1, día 16+ → 2. */
export function quincenaDe(iso: string): 1 | 2 {
  return Number(iso.slice(8, 10)) <= 15 ? 1 : 2;
}

/**
 * Los períodos entre dos fechas, inclusive en las dos puntas. Devuelve [] si el
 * rango está invertido — un rango imposible no produce meses fantasma.
 */
export function periodosEntre(desdeISO: string, hastaISO: string): Periodo[] {
  const desde = periodoDe(desdeISO);
  const hasta = periodoDe(hastaISO);
  if (!esPeriodo(desde) || !esPeriodo(hasta) || desde > hasta) return [];

  const out: Periodo[] = [];
  let [y, m] = [Number(desde.slice(0, 4)), Number(desde.slice(5, 7))];
  for (let guard = 0; guard < 1200; guard++) {
    const p = `${y}-${String(m).padStart(2, "0")}`;
    out.push(p);
    if (p === hasta) break;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/**
 * El período de AGUINALDO de un año: diciembre del año anterior a noviembre del
 * año en curso. Es la ventana que usa Costa Rica, y vive acá (y no en el módulo
 * del aguinaldo) porque el LIBRO también la necesita para declarar cobertura.
 */
export function periodosDeAguinaldo(anio: number): Periodo[] {
  return periodosEntre(`${anio - 1}-12-01`, `${anio}-11-01`);
}

export interface Cobertura {
  /** Quincenas efectivamente registradas en el libro. */
  registradas: number;
  /** Quincenas que el período abarca (2 por mes). */
  posibles: number;
  /** "8 de 24 quincenas registradas" — se muestra tal cual. */
  texto: string;
}

/**
 * Cuánto del período está realmente en el libro. Se DECLARA en pantalla en vez
 * de rellenar los huecos: un aguinaldo calculado sobre 8 de 24 quincenas no es
 * un aguinaldo incompleto disimulado, es un dato con su cobertura al lado.
 */
export function coberturaDe(registradas: number, periodos: Periodo[]): Cobertura {
  const posibles = periodos.length * 2;
  // Nunca reportar más de lo posible: si alguien cargó una quincena fuera del
  // período, el numerador mentiría hacia arriba.
  const n = Math.max(0, Math.min(registradas, posibles));
  // El participio concuerda con "quincenas" (el sustantivo al que modifica), no
  // con el numerador: "1 de 2 quincenas registradas", nunca "…registrada".
  const s = posibles === 1 ? "" : "s";
  return {
    registradas: n,
    posibles,
    texto: `${n} de ${posibles} quincena${s} registrada${s}`,
  };
}

/**
 * Cuántas QUINCENAS distintas hay en un conjunto de pagos.
 *
 * Existe porque el numerador de `coberturaDe` es una cuenta de quincenas y el
 * libro tiene una fila por persona × quincena: pasarle `pagos.length` con 12
 * personas daba 172 contra 18 posibles, el clamp lo recortaba a 18 y la pantalla
 * decía «18 de 18» siempre — el aviso no podía delatar un libro incompleto, que
 * es lo único para lo que existe. En `lib/finanzas/aguinaldo.ts` la lista ya es
 * de UNA persona y ahí filas y quincenas coinciden; acá hay que deduplicar.
 */
export function quincenasDistintas(
  pagos: ReadonlyArray<{ periodo: string; quincena: number }>,
): number {
  return new Set(pagos.map((p) => `${p.periodo}::${p.quincena}`)).size;
}

/**
 * La antigüedad de una persona sale del LIBRO (`min` de sus quincenas), no de un
 * campo nuevo en `TeamMember`: agregarlo rompería `TEAM_MEMBER_SAFE_SELECT`, la
 * allowlist congelada de 12 claves que leen decenas de módulos.
 */
export function primeraQuincenaDe(fechas: string[]): string | null {
  if (fechas.length === 0) return null;
  return fechas.reduce((min, f) => (f < min ? f : min));
}
