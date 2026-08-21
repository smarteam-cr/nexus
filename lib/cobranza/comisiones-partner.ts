/**
 * lib/cobranza/comisiones-partner.ts
 *
 * La aritmética del panel de comisiones de aliado. PURO: cero Prisma, cero red, cero
 * `new Date()` — la fecha de hoy entra por parámetro cuando hace falta.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * Esta cuenta vivía dentro de `loadComisionesPartner` y no tenía UNA sola prueba, con
 * dos consecuencias que llegaron juntas a la pantalla:
 *
 *   1. El «Total acumulado» sumaba TODAS las filas sin mirar el estado, así que mezclaba
 *      plata que entró al banco con plata que todavía se espera — incluida la proyección
 *      de noviembre, que no ocurrió. Un número así no se puede llevar a una reunión.
 *   2. Nadie podía notar (1), porque el DTO ni siquiera transportaba el estado.
 *
 * ⚠ CRC Y USD NUNCA SE SUMAN. Es la regla dura de todo el módulo de cobranza: los
 * totales son SIEMPRE por moneda, y una conversión acá escondería de qué moneda es la
 * plata que alguien está mirando.
 */

/** Lo mínimo de una comisión para poder sumarla. */
export interface ComisionParaSumar {
  partner: string;
  monto: number;
  moneda: string;
  /** "COBRADO" = la plata entró y alguien lo firmó. Cualquier otra cosa: todavía no. */
  estado: string;
}

/** El corte de una moneda: lo que entró, lo que se espera, y la suma de los dos. */
export interface CorteDeMoneda {
  moneda: string;
  cobrado: number;
  esperado: number;
  total: number;
  cuantasCobradas: number;
  cuantasEsperadas: number;
}

export interface TotalPorPartner extends CorteDeMoneda {
  partner: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Normaliza el nombre del aliado para agrupar: "HubSpot" y "hubspot" son el mismo.
 * Espejo local de `normalizePartner` de schema.ts, para que este módulo no dependa de
 * nada — si algún día divergen, `comisiones-partner.test.ts` lo caza.
 */
function clave(partner: string): string {
  return partner.trim().toLowerCase();
}

function vacio(moneda: string): CorteDeMoneda {
  return { moneda, cobrado: 0, esperado: 0, total: 0, cuantasCobradas: 0, cuantasEsperadas: 0 };
}

function acumular(dst: CorteDeMoneda, c: ComisionParaSumar): void {
  if (c.estado === "COBRADO") {
    dst.cobrado = round2(dst.cobrado + c.monto);
    dst.cuantasCobradas += 1;
  } else {
    dst.esperado = round2(dst.esperado + c.monto);
    dst.cuantasEsperadas += 1;
  }
  dst.total = round2(dst.cobrado + dst.esperado);
}

/**
 * Lo que se ganó con cada aliado, partido en lo que entró y lo que se espera.
 *
 * Una línea por (aliado, moneda): el mismo aliado que paga en dos monedas son DOS
 * líneas, nunca una convertida.
 */
export function totalesPorPartner(comisiones: readonly ComisionParaSumar[]): TotalPorPartner[] {
  const acc = new Map<string, TotalPorPartner>();
  for (const c of comisiones) {
    const k = `${clave(c.partner)}::${c.moneda}`;
    let fila = acc.get(k);
    if (!fila) {
      fila = { partner: c.partner, ...vacio(c.moneda) };
      acc.set(k, fila);
    }
    acumular(fila, c);
  }
  // Por plata, y el nombre desempata para que el orden no dependa del Map.
  return [...acc.values()].sort((a, b) => b.total - a.total || a.partner.localeCompare(b.partner));
}

/** El corte general, también por moneda. */
export function totalesPorMoneda(comisiones: readonly ComisionParaSumar[]): CorteDeMoneda[] {
  const acc = new Map<string, CorteDeMoneda>();
  for (const c of comisiones) {
    let fila = acc.get(c.moneda);
    if (!fila) {
      fila = vacio(c.moneda);
      acc.set(c.moneda, fila);
    }
    acumular(fila, c);
  }
  return [...acc.values()].sort((a, b) => b.total - a.total || a.moneda.localeCompare(b.moneda));
}

/**
 * La retención del procesador de una comisión: lo que se llevó Stripe entre lo que el
 * aliado reportó y lo que llegó al banco.
 *
 * ⚠ SE DERIVA, NO SE GUARDA. Un tercer número guardado puede contradecir a los otros
 * dos, y entonces hay que decidir a cuál creerle — que es justo el problema que este
 * modelo viene a cerrar. Sin el bruto devuelve null: "no se sabe" es una respuesta, y
 * asumir cero diría que no hubo retención, que es una afirmación distinta.
 */
export function retencionDe(
  neto: number,
  bruto: number | null | undefined,
): { monto: number; pct: number } | null {
  if (bruto === null || bruto === undefined) return null;
  if (!Number.isFinite(bruto) || bruto <= 0) return null;
  const monto = round2(bruto - neto);
  // Un neto MAYOR que el bruto no es una retención negativa: es un dato mal cargado, y
  // mostrarlo como "-2%" haría creer que el procesador devolvió plata.
  if (monto < 0) return null;
  return { monto, pct: Math.round((monto / bruto) * 10000) / 100 };
}

/** Una comisión, con lo justo para poder sugerir la próxima. */
export interface ComisionParaProyectar {
  fecha: string;
  monto: number;
  moneda: string;
  estado: string;
}

/**
 * Cuánto sugerir para la PRÓXIMA comisión de un aliado: lo que entró la última vez que
 * alguien lo confirmó.
 *
 * ── POR QUÉ LA ÚLTIMA CONFIRMADA Y NO UN PROMEDIO ───────────────────────────────
 * La comisión no es estática: en un trimestre entran cuentas y sube, o hay churn y
 * baja. Nadie sabe de antemano cuánto van a pagar. Un promedio de tres trimestres
 * suaviza justo la señal que importa —hacia dónde se está moviendo— y da un número que
 * no ocurrió nunca. El último medido, en cambio, es un hecho: pasó.
 *
 * ⚠ SOLO CUENTA LO CONFIRMADO. Sugerir a partir de otra proyección sería copiar una
 * estimación y presentarla como si tuviera respaldo — que es exactamente cómo aparecieron
 * los "$51.000 exactos, dos veces" que este módulo viene a desarmar.
 *
 * null = todavía no hay ninguna confirmada, y entonces no se sugiere nada. Un cero o un
 * "usá el registrado" harían pasar por dato lo que no lo es.
 */
export function sugerenciaParaLaProxima(
  comisiones: readonly ComisionParaProyectar[],
): { monto: number; moneda: string; desde: string } | null {
  const confirmadas = comisiones
    .filter((c) => c.estado === "COBRADO")
    .sort((a, b) => a.fecha.localeCompare(b.fecha));
  const ultima = confirmadas.at(-1);
  if (!ultima) return null;
  return { monto: ultima.monto, moneda: ultima.moneda, desde: ultima.fecha };
}

