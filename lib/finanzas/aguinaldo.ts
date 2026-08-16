/**
 * lib/finanzas/aguinaldo.ts
 *
 * El aguinaldo por colaborador, derivado PURO del libro de planilla: cero
 * Prisma, cero red. Vive acá y NO en `lib/cobranza/engine.ts` a propósito — el
 * motor es matemática de cobranza congelada por golden, y meterle una fórmula
 * de remuneración lo convertiría en otra cosa.
 *
 * ⚠ POR QUÉ ESTO NO VIOLA LA PROHIBICIÓN FISCAL (ver DECISIONS §El libro de
 * planilla): lo que se calcula es **la suma de lo REGISTRADO en el libro, de
 * diciembre a noviembre, ÷ 12**. Es un DATO OBSERVADO, no una tasa. Este archivo
 * no tiene ni va a tener constantes de CCSS, cargas sociales, renta ni timbrado.
 * Si algún día hace falta eso, es otra conversación y otro archivo.
 *
 * ⚠ TRES REGLAS QUE SOSTIENE:
 *
 *  1. **Por moneda SEPARADA.** Alguien pagado en colones y en dólares produce
 *     DOS resultados, no uno convertido. CRC y USD no se suman en ningún lado
 *     del módulo y acá tampoco (el FX sigue prohibido).
 *  2. **La cobertura se declara.** "8 de 24 quincenas registradas" va al lado del
 *     número. Un aguinaldo calculado sobre medio año no es un aguinaldo
 *     incompleto disimulado.
 *  3. **La fecha de ingreso sale del LIBRO** (`min` de sus quincenas), no de un
 *     campo en `TeamMember` — agregarlo rompería `TEAM_MEMBER_SAFE_SELECT`, la
 *     allowlist congelada de 12 claves que leen decenas de módulos. Y no hace
 *     falta: la fórmula ya maneja sola el año parcial, porque quien entró en
 *     julio simplemente no tiene quincenas de diciembre a junio y su ÷12 sale
 *     proporcional.
 */
import { coberturaDe, periodosDeAguinaldo, primeraQuincenaDe, type Cobertura } from "@/lib/cobranza/planilla";

/** Los MESES del período de aguinaldo. La división es siempre entre esto. */
export const MESES_DEL_AGUINALDO = 12;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Una quincena del libro, en la forma mínima que hace falta para el cálculo. */
export interface QuincenaPagada {
  sujetoTeamMemberId: string | null;
  sujetoNombre: string;
  periodo: string;
  fechaProgramada: string;
  estado: string;
  monto: number;
  moneda: string;
  /** Comisiones liquidadas junto a esa quincena, ya filtradas a su moneda. */
  comisiones: number;
}

export interface AguinaldoPersona {
  /** Clave estable de la fila: persona + moneda (una persona puede tener dos). */
  clave: string;
  teamMemberId: string | null;
  nombre: string;
  moneda: string;
  /** Quincenas PAGADAS que entraron al cálculo. */
  quincenas: number;
  /** Suma de lo pagado en el período, SOLO salario. */
  sumaSalario: number;
  /** Ídem incluyendo las comisiones liquidadas de la MISMA moneda. */
  sumaConComisiones: number;
  /** sumaSalario ÷ 12. Lo que calcula la hoja de Alex. */
  aguinaldoSalario: number;
  /** sumaConComisiones ÷ 12. No se elige por Nexus: se muestran los dos. */
  aguinaldoConComisiones: number;
  /** La quincena MÁS VIEJA de esta persona en el libro (su ingreso observado). */
  desde: string | null;
  cobertura: Cobertura;
}

export interface AguinaldoResultado {
  anio: number;
  /** "2025-12" … "2026-11" — la ventana que se sumó. */
  periodos: string[];
  personas: AguinaldoPersona[];
  /** Totales por moneda SEPARADA. Nunca un total único. */
  totales: Record<string, number>;
}

/**
 * El aguinaldo de cada persona para el año `anio`, sumando de diciembre del año
 * anterior a noviembre de éste.
 *
 * Solo entran las quincenas **PAGADAS**: una pendiente todavía no es plata que
 * salió, y contarla adelantaría un aguinaldo sobre algo que puede no ocurrir.
 */
export function calcularAguinaldo(
  quincenas: QuincenaPagada[],
  anio: number,
): AguinaldoResultado {
  const periodos = periodosDeAguinaldo(anio);
  const enVentana = new Set(periodos);

  const porClave = new Map<string, QuincenaPagada[]>();
  for (const q of quincenas) {
    if (q.estado !== "PAGADO") continue;
    if (!enVentana.has(q.periodo)) continue;
    // La clave lleva la MONEDA: alguien pagado en dos monedas produce dos filas,
    // nunca una convertida.
    const clave = `${q.sujetoTeamMemberId ?? q.sujetoNombre}::${q.moneda}`;
    const l = porClave.get(clave);
    if (l) l.push(q);
    else porClave.set(clave, [q]);
  }

  const personas: AguinaldoPersona[] = [];
  for (const [clave, lista] of porClave) {
    const sumaSalario = round2(lista.reduce((a, q) => a + q.monto, 0));
    const sumaComisiones = round2(lista.reduce((a, q) => a + q.comisiones, 0));
    const sumaConComisiones = round2(sumaSalario + sumaComisiones);
    const primera = lista[0]!;
    personas.push({
      clave,
      teamMemberId: primera.sujetoTeamMemberId,
      nombre: primera.sujetoNombre,
      moneda: primera.moneda,
      quincenas: lista.length,
      sumaSalario,
      sumaConComisiones,
      aguinaldoSalario: round2(sumaSalario / MESES_DEL_AGUINALDO),
      aguinaldoConComisiones: round2(sumaConComisiones / MESES_DEL_AGUINALDO),
      desde: primeraQuincenaDe(lista.map((q) => q.fechaProgramada)),
      cobertura: coberturaDe(lista.length, periodos),
    });
  }

  personas.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.moneda.localeCompare(b.moneda));

  const totales: Record<string, number> = {};
  for (const p of personas) {
    totales[p.moneda] = round2((totales[p.moneda] ?? 0) + p.aguinaldoSalario);
  }

  return { anio, periodos, personas, totales };
}
