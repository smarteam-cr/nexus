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
import {
  coberturaDe,
  periodosDeAguinaldo,
  primeraQuincenaDe,
  quincenasDelPeriodo,
  type Cobertura,
} from "@/lib/cobranza/planilla";

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
  /**
   * Lo que va a ser el aguinaldo cuando el período cierre, SI todo sigue igual:
   * lo ya pagado más las quincenas que faltan al monto de la última.
   *
   * ⚠ Es una PROYECCIÓN, no un dato observado — la única de este archivo, y por
   * eso va rotulada como tal en pantalla. Se apoya en algo que sí se sabe (lo
   * que se le está pagando hoy) y nunca en una tasa.
   *
   * Quien ya no está en planilla NO se proyecta: su total es lo acumulado, que
   * es la verdad. Proyectar a las 4 personas que salieron en julio hasta
   * noviembre inflaría el número justo donde más se nota.
   */
  aguinaldoProyectado: number;
  /** Cuántas quincenas se le sumaron a la proyección. 0 = ya no se proyecta. */
  quincenasProyectadas: number;
  /** El monto por quincena con el que se proyectó (el de la última pagada). */
  montoQuincenaActual: number;
  /** false = ya no está en planilla, así que su aguinaldo no va a crecer más. */
  sigueEnPlanilla: boolean;
  /** sumaConComisiones ÷ 12. No se elige por Nexus: se muestran los dos. */
  aguinaldoConComisiones: number;
  /** La quincena MÁS VIEJA de esta persona en el libro (su ingreso observado). */
  desde: string | null;
  cobertura: Cobertura;
}

/**
 * Un salario ACTIVO de la configuración de costos. Entra solo para poder decir
 * QUIÉN NO APARECE — nunca para estimar su aguinaldo: sin quincenas en el libro
 * no hay nada observado que dividir, y usar el monto del costo sería fabricar.
 */
export interface SalarioActivo {
  teamMemberId: string | null;
  nombre: string;
  moneda: string;
}

/**
 * Un salario de la configuración de costos, con su estado, para saber QUIÉN YA NO ESTÁ EN EL EQUIPO (F-20). No sirve
 * para estimar nada: solo dice si la persona sigue (algún salario sin dar de baja, aunque esté pausado o en otra moneda)
 * o cuándo salió (`finalizadoEl`).
 */
export interface SalarioDelEquipo {
  teamMemberId: string | null;
  nombre: string;
  /** "YYYY-MM-DD" de la baja; null = sigue (activo o pausado). */
  finalizadoEl: string | null;
}

/**
 * Las claves de una persona (de una quincena o de un salario), sin la moneda: su id del equipo, si lo tiene, y su nombre
 * sin el cargo («Jerson Escudero · CSL…» y «Jerson Escudero» son la misma). Las dos, porque su salario puede no estar
 * ligado a la persona y su quincena sí (Jerson, 2026).
 */
export function clavesDePersona(teamMemberId: string | null, nombre: string): string[] {
  const porNombre = `nombre:${nombre.split(/ · | - /)[0]!.trim().toLowerCase()}`;
  return teamMemberId ? [teamMemberId, porNombre] : [porNombre];
}

export interface FaltanteAguinaldo {
  nombre: string;
  moneda: string;
  /**
   * SIN_PERSONA_LIGADA es peor que SIN_QUINCENAS y por eso se distinguen: sin
   * persona ligada, generar la quincena NUNCA lo va a incluir, así que el
   * problema no se arregla solo el mes que viene.
   */
  motivo: "SIN_QUINCENAS" | "SIN_PERSONA_LIGADA";
}

export interface AguinaldoResultado {
  anio: number;
  /** "2025-12" … "2026-11" — la ventana que se sumó. */
  periodos: string[];
  personas: AguinaldoPersona[];
  /** Totales por moneda SEPARADA. Nunca un total único. */
  totales: Record<string, number>;
  /** Lo mismo pero de la PROYECCIÓN: lo que va a haber que pagar en diciembre. */
  totalesProyectado: Record<string, number>;
  /** Cuántas quincenas del período faltan por ocurrir. 0 = la ventana cerró. */
  quincenasPorVenir: number;
  /**
   * ⚠ La ventana TODAVÍA NO CERRÓ: lo que se muestra es lo devengado HASTA HOY,
   * no lo que se va a pagar en diciembre. Sin este dato la pantalla afirmaba un
   * aguinaldo final cuando le faltaban meses de sumar — el número no estaba mal,
   * estaba mal rotulado, que en una pantalla de plata es lo mismo.
   */
  periodoAbierto: boolean;
  /** El último mes de la ventana ("2026-11"): hasta cuándo va a seguir subiendo. */
  cierraEn: string;
  /** Salarios activos que NO tienen ni una quincena en el libro. */
  faltantes: FaltanteAguinaldo[];
  /**
   * Quienes cobraron quincenas en el período pero ya no están en el equipo (su salario se finalizó o se pausó). NO van en
   * `personas` ni en los totales (feedback F-20 de Alexander Arrieta, 9 nov: se arrastraban a la reserva de los gastos; su
   * aguinaldo proporcional se paga en la liquidación). Se nombran aparte para que no desaparezcan sin decirlo.
   */
  fueraDelEquipo: AguinaldoPersona[];
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
  /**
   * "YYYY-MM-DD". Entra por PARÁMETRO y no se consulta adentro: este archivo es
   * puro y `new Date()` acá haría el resultado dependiente del huso y del reloj,
   * o sea intesteable. El llamador ya resuelve la fecha de Costa Rica.
   */
  hoyISO: string,
  /** Los salarios activos, solo para declarar quién no aparece. Opcional. */
  salariosActivos: SalarioActivo[] = [],
  /** Todos los salarios con su baja, para sacar a quien salió del equipo DENTRO del período (F-20). Opcional. */
  salariosDelEquipo: SalarioDelEquipo[] = [],
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

  // Cuántas quincenas del período TODAVÍA NO OCURRIERON. Es global, no por
  // persona: de hoy en adelante, a quien siga en planilla le tocan todas.
  // Se cuenta por fecha programada y no por lo registrado, porque una quincena
  // que ya pasó y nadie cargó es un hueco del libro, no plata futura — meterla
  // en la proyección la contaría dos veces cuando alguien la registre.
  const todasLasQuincenas = periodos.flatMap((p) => quincenasDelPeriodo(p));
  const quincenasPorVenir = todasLasQuincenas.filter((q) => q.fechaProgramada > hoyISO).length;

  // Quién sigue en planilla. La proyección solo se aplica a ellos: proyectar
  // hasta noviembre a las personas que ya salieron inflaría el total justo donde
  // más se nota (hay 4 bajas en julio).
  const activos = new Set(salariosActivos.map((s) => `${s.teamMemberId ?? s.nombre}::${s.moneda}`));

  const personas: AguinaldoPersona[] = [];
  for (const [clave, lista] of porClave) {
    const sumaSalario = round2(lista.reduce((a, q) => a + q.monto, 0));
    const sumaComisiones = round2(lista.reduce((a, q) => a + q.comisiones, 0));
    const sumaConComisiones = round2(sumaSalario + sumaComisiones);
    const primera = lista[0]!;

    // El monto de la ÚLTIMA quincena pagada = "la configuración de hoy". Es lo
    // que hace que un aumento a mitad de año se refleje solo en la proyección,
    // sin ninguna tasa ni ningún campo que alguien tenga que mantener.
    const ultima = [...lista].sort((a, b) =>
      a.fechaProgramada.localeCompare(b.fechaProgramada),
    )[lista.length - 1]!;
    const montoQuincenaActual = ultima.monto;

    // ⚠ Sin lista de activos NADIE se proyecta, en vez de asumir que todos
    // siguen. Es la degradación honesta del módulo: si no se sabe quién está en
    // planilla, la única verdad es lo acumulado.
    const sigueEnPlanilla = activos.has(clave);
    const quincenasProyectadas = sigueEnPlanilla ? quincenasPorVenir : 0;
    const proyectadoBase = round2(sumaSalario + quincenasProyectadas * montoQuincenaActual);

    personas.push({
      clave,
      teamMemberId: primera.sujetoTeamMemberId,
      nombre: primera.sujetoNombre,
      moneda: primera.moneda,
      quincenas: lista.length,
      sumaSalario,
      sumaConComisiones,
      aguinaldoSalario: round2(sumaSalario / MESES_DEL_AGUINALDO),
      aguinaldoProyectado: round2(proyectadoBase / MESES_DEL_AGUINALDO),
      quincenasProyectadas,
      montoQuincenaActual,
      sigueEnPlanilla,
      aguinaldoConComisiones: round2(sumaConComisiones / MESES_DEL_AGUINALDO),
      desde: primeraQuincenaDe(lista.map((q) => q.fechaProgramada)),
      cobertura: coberturaDe(lista.length, periodos),
    });
  }

  personas.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.moneda.localeCompare(b.moneda));

  /* Quien SALIÓ del equipo dentro del período sale de la lista y de los totales (F-20): su aguinaldo proporcional se
     paga en la liquidación y no va en la reserva de diciembre. «Salió» = ningún salario suyo sigue sin dar de baja (un
     salario pausado o en otra moneda cuenta como que sigue) y su última baja cae antes del cierre de la ventana. Por la
     fecha, y no por el equipo de hoy: quien cobró su aguinaldo y renunció después sigue en el año que ya cerró. */
  const cierreDeLaVentana = periodos[periodos.length - 1] ?? `${anio}-11`;
  const siguen = new Set(salariosDelEquipo.filter((s) => !s.finalizadoEl).flatMap((s) => clavesDePersona(s.teamMemberId, s.nombre)));
  const bajaDe = new Map<string, string>();
  for (const s of salariosDelEquipo) {
    if (!s.finalizadoEl) continue;
    for (const k of clavesDePersona(s.teamMemberId, s.nombre)) if ((bajaDe.get(k) ?? "") < s.finalizadoEl) bajaDe.set(k, s.finalizadoEl);
  }
  const salio = (p: AguinaldoPersona) => {
    const ks = clavesDePersona(p.teamMemberId, p.nombre);
    if (ks.some((k) => siguen.has(k))) return false;
    const baja = ks.map((k) => bajaDe.get(k) ?? "").sort().pop();
    return !!baja && baja.slice(0, 7) <= cierreDeLaVentana;
  };
  const fueraDelEquipo = personas.filter(salio);
  if (fueraDelEquipo.length) personas.splice(0, personas.length, ...personas.filter((p) => !salio(p)));

  const totales: Record<string, number> = {};
  const totalesProyectado: Record<string, number> = {};
  for (const p of personas) {
    totales[p.moneda] = round2((totales[p.moneda] ?? 0) + p.aguinaldoSalario);
    totalesProyectado[p.moneda] = round2(
      (totalesProyectado[p.moneda] ?? 0) + p.aguinaldoProyectado,
    );
  }

  // La ventana sigue abierta mientras el mes de hoy no pase el último de la
  // ventana. Comparación de strings "YYYY-MM": el formato ISO ordena solo.
  const cierraEn = periodos[periodos.length - 1] ?? `${anio}-11`;
  const periodoAbierto = hoyISO.slice(0, 7) <= cierraEn;

  // Quién NO aparece. La clave es la misma que agrupa a las personas, así que un
  // salario cuya persona sí tiene quincenas nunca se reporta como faltante.
  const conQuincenas = new Set(personas.map((p) => p.clave));
  const faltantes: FaltanteAguinaldo[] = [];
  for (const s of salariosActivos) {
    const clave = `${s.teamMemberId ?? s.nombre}::${s.moneda}`;
    if (conQuincenas.has(clave)) continue;
    faltantes.push({
      nombre: s.nombre,
      moneda: s.moneda,
      motivo: s.teamMemberId === null ? "SIN_PERSONA_LIGADA" : "SIN_QUINCENAS",
    });
  }
  faltantes.sort((a, b) => a.nombre.localeCompare(b.nombre) || a.moneda.localeCompare(b.moneda));

  return {
    anio,
    periodos,
    personas,
    totales,
    totalesProyectado,
    quincenasPorVenir,
    periodoAbierto,
    cierraEn,
    faltantes,
    fueraDelEquipo,
  };
}
