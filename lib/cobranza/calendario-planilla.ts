/**
 * lib/cobranza/calendario-planilla.ts
 *
 * El año de una persona, quincena por quincena: lo que se le pagó y lo que le falta.
 * PURO — cero Prisma, cero red, cero `new Date()`. `hoyISO` entra por parámetro.
 *
 * ── LA REGLA QUE SOSTIENE, Y POR QUÉ ────────────────────────────────────────────
 * Hay DOS fuentes y la frontera entre ellas es si la fila del libro existe:
 *
 *   · Quincena CON fila en el libro → es la verdad, y es intocable. El monto se
 *     congeló cuando se creó la fila y nada lo reescribe. Por eso, hacia atrás,
 *     un aumento no cambia lo que ya se pagó.
 *
 *   · Quincena SIN fila → se PROYECTA acá, al leer. No se escribe nada.
 *
 * `lib/cobranza/planilla.ts` ya advertía la trampa de la alternativa: *"derivarlo del
 * costo haría que subir un salario a mitad de mes reescribiera la Q2 pendiente al monto
 * nuevo con la Q1 ya pagada al viejo"*. Partir por "¿existe la fila?" respeta esa regla
 * al pie: lo escrito no se toca, y lo que todavía no existe se calcula con el salario
 * que rige en ESA quincena.
 *
 * Efecto en el caso que motivó el módulo — Alejandra Ortega, aumento efectivo el
 * 2026-08-31 (Q2 de agosto), de $1.000 a $1.200 al mes:
 *
 *     ago Q1   $500   registrada · monto viejo, congelado
 *     ago Q2   $600   proyectada · el aumento ya rige
 *     sep Q1   $600   proyectada
 *
 * ── LO QUE NO HACE ──────────────────────────────────────────────────────────────
 *  · No escribe. Ninguna proyección se materializa: un aumento no obliga a reescribir
 *    288 filas, la proyección se recalcula sola.
 *  · No convierte moneda. Si alguien cobró en dos monedas, son dos calendarios.
 *  · Cero lógica fiscal. Las quincenas 1–15 y 16–fin son el ciclo con el que Smarteam
 *    paga, no una regla tributaria.
 */
import { montoQuincena } from "./engine";
import { quincenasDelPeriodo, type Periodo } from "./planilla";

// ── Entradas ────────────────────────────────────────────────────────────────────

/** Una quincena ya registrada en el libro. */
export interface PagoRegistrado {
  periodo: string;
  quincena: number;
  fechaProgramada: string;
  monto: number;
  moneda: string;
  estado: string;
  fechaPago: string | null;
}

/**
 * Un movimiento del catálogo de costos, con su fecha EFECTIVA (que puede ser
 * retroactiva: el aumento se registra el 18 y rige desde el 31).
 */
export interface MovimientoDeSalario {
  tipo: string;
  fechaEfectiva: string;
  /** El monto MENSUAL después del movimiento. */
  monto: number;
  montoAnterior: number | null;
  moneda: string;
}

// ── Salidas ─────────────────────────────────────────────────────────────────────

/**
 * Qué es cada casilla del calendario. Son CUATRO cosas distintas y cada una pide algo
 * distinto de quien la mira:
 *
 *   · `registrada`  — ocurrió y está en el libro. Es la verdad, congelada.
 *   · `faltante`    — ocurrió, la persona estaba, y NO está en el libro. Hay que cargarla.
 *   · `proyectada`  — todavía no ocurre. Es una estimación al salario vigente.
 *   · `fuera`       — no corresponde: hay una baja o una pausa que lo apaga.
 *   · `sinDato`     — el catálogo no llega tan atrás. NO es lo mismo que `fuera`.
 *
 * ⚠ `faltante` y `proyectada` NO se pueden fundir. Rellenar una quincena pasada con el
 * salario de hoy la haría ver como pagada y taparía el hueco — y el módulo ya tiene la
 * regla contraria escrita: `coberturaDe` DECLARA cuántas hay de cuántas posibles, en vez
 * de fabricar las que faltan.
 *
 * ⚠ `fuera` y `sinDato` TAMPOCO. El catálogo de costos se sembró el 2026-07-12, así que
 * de Breiner Salas no hay movimientos antes de julio — pero sí tiene pagos desde abril,
 * o sea que estaba. Marcar enero como "no estaba" sería afirmar algo falso; lo cierto es
 * que el sistema no puede saberlo.
 */
export type ClaseQuincena = "registrada" | "faltante" | "proyectada" | "fuera" | "sinDato";

export interface QuincenaDelCalendario {
  periodo: string;
  quincena: 1 | 2;
  fechaProgramada: string;
  /** null en `faltante` y en `fuera`: no hay número que se pueda afirmar. */
  monto: number | null;
  moneda: string;
  clase: ClaseQuincena;
  /** "PAGADO" | "PENDIENTE" mientras esté registrada; null en las demás. */
  estado: string | null;
  fechaPago: string | null;
  /** De qué salario mensual sale la proyección. null en las registradas. */
  salarioMensual: number | null;
  /** La quincena ya ocurrió según `hoyISO`. */
  pasada: boolean;
}

export interface CalendarioDePersona {
  quincenas: QuincenaDelCalendario[];
  registradas: number;
  proyectadas: number;
  /** Quincenas que ya ocurrieron y nadie anotó. Es lo accionable del calendario. */
  faltantes: number;
  /** Suma de lo REGISTRADO. Es plata que salió (o que ya está anotada). */
  totalRegistrado: number;
  /** Suma de lo PROYECTADO. No es plata: es lo que va a costar si nada cambia. */
  totalProyectado: number;
  /** Los cambios de salario del año, para poder ver POR QUÉ el monto cambia. */
  cambios: Array<{ fecha: string; de: number | null; a: number | null; tipo: string }>;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * El salario MENSUAL vigente en una fecha, reproduciendo los movimientos.
 *
 * ⚠ DEVUELVE null CUANDO LA PERSONA NO ESTÁ ACTIVA — una baja o una pausa no son
 * "salario cero": son "no corresponde". Un cero se sumaría a los totales y diría que esa
 * quincena costó nada, cuando lo correcto es que no exista.
 *
 * Y null también cuando NO HAY NINGÚN movimiento anterior a la fecha: el catálogo se
 * sembró en julio de 2026, así que preguntar por marzo no tiene respuesta. Para el
 * pasado eso no importa —manda el libro, que sí tiene la fila— y para el futuro siempre
 * hay al menos el alta.
 */
export function salarioVigenteEn(
  movimientos: readonly MovimientoDeSalario[],
  fechaISO: string,
): { monto: number; moneda: string } | null {
  /**
   * ⚠ LOS DOS TIPOS DE MOVIMIENTO NO USAN EL MISMO BORDE, y no es un descuido.
   *
   *  · Un aumento rige DESDE su fecha: el de Alejandra es efectivo el 2026-08-31, que es
   *    la fecha de la Q2 de agosto, y esa quincena ya va con el monto nuevo.
   *  · Una baja apaga DESPUÉS de la suya: la de Lorena es el 2026-08-15 y esa quincena
   *    SÍ se le pagó — está en el libro, $918. El último día trabajado se cobra.
   *
   * Con el mismo borde para los dos, uno de los dos casos queda mal. Lo cazó una prueba
   * con los datos reales de Lorena.
   */
  const apaga = (tipo: string) => tipo === "BAJA" || tipo === "PAUSA" || tipo === "ELIMINACION";
  const hasta = movimientos
    .filter((m) => (apaga(m.tipo) ? m.fechaEfectiva < fechaISO : m.fechaEfectiva <= fechaISO))
    .sort((a, b) => a.fechaEfectiva.localeCompare(b.fechaEfectiva));
  if (hasta.length === 0) return null;

  let monto: number | null = null;
  let moneda = hasta[0]!.moneda;
  for (const m of hasta) {
    moneda = m.moneda;
    switch (m.tipo) {
      case "ALTA":
      case "REACTIVACION":
      case "CAMBIO_MONTO":
        monto = m.monto;
        break;
      case "BAJA":
      case "PAUSA":
      case "ELIMINACION":
        // Deja de correr. Un REACTIVACION posterior lo vuelve a encender con su monto.
        monto = null;
        break;
      default:
        // Un tipo que este módulo no conoce NO puede cambiar la plata en silencio.
        break;
    }
  }
  return monto === null ? null : { monto, moneda };
}

/** Las 24 quincenas del año, en orden. */
function quincenasDelAnio(anio: number): Array<{ periodo: Periodo; quincena: 1 | 2; fecha: string }> {
  const out: Array<{ periodo: Periodo; quincena: 1 | 2; fecha: string }> = [];
  for (let m = 1; m <= 12; m++) {
    const periodo = `${anio}-${String(m).padStart(2, "0")}` as Periodo;
    for (const q of quincenasDelPeriodo(periodo)) {
      out.push({ periodo, quincena: q.quincena, fecha: q.fechaProgramada });
    }
  }
  return out;
}

/**
 * El calendario de UNA persona para UN año.
 *
 * Devuelve SIEMPRE las 24 quincenas: una que no ocurrió y no se puede proyectar sale
 * con `monto: null` en vez de desaparecer. Un hueco que se ve es un dato; una fila que
 * falta parece que el mes no existió.
 */
export function calendarioDePersona(
  pagos: readonly PagoRegistrado[],
  movimientos: readonly MovimientoDeSalario[],
  anio: number,
  hoyISO: string,
): CalendarioDePersona {
  const porClave = new Map(pagos.map((p) => [`${p.periodo}-${p.quincena}`, p]));

  const quincenas: QuincenaDelCalendario[] = quincenasDelAnio(anio).map(({ periodo, quincena, fecha }) => {
    const reg = porClave.get(`${periodo}-${quincena}`);
    if (reg) {
      return {
        periodo,
        quincena,
        fechaProgramada: reg.fechaProgramada,
        monto: reg.monto,
        moneda: reg.moneda,
        clase: "registrada" as const,
        estado: reg.estado,
        fechaPago: reg.fechaPago,
        salarioMensual: null,
        pasada: reg.fechaProgramada <= hoyISO,
      };
    }

    const pasada = fecha <= hoyISO;
    const vigente = salarioVigenteEn(movimientos, fecha);
    /**
     * ⚠ Una quincena PASADA sin fila NO se proyecta. Rellenarla con el salario de hoy la
     * haría ver como pagada y taparía el hueco; lo útil es que se vea que falta.
     *
     * ⚠ Y "sin fila" solo es FALTANTE si la persona estaba activa. La primera versión no
     * lo miraba, y a Alexander Vanegas —que entró el 1 de agosto— le marcaba quince
     * quincenas faltantes de enero a julio. Esas no faltan: no estaba. Una lista de
     * pendientes con catorce falsos positivos no se revisa.
     */
    // Sin NINGÚN movimiento anterior, el catálogo no llega tan atrás: es "no se sabe",
    // no "no estaba". Con movimientos pero sin salario vigente, sí está apagado.
    const hayHistoria = movimientos.some((m) => m.fechaEfectiva <= fecha);
    const clase: ClaseQuincena = vigente
      ? pasada
        ? "faltante"
        : "proyectada"
      : hayHistoria
        ? "fuera"
        : "sinDato";
    return {
      periodo,
      quincena,
      fechaProgramada: fecha,
      monto: clase === "proyectada" ? montoQuincena(vigente!.monto, quincena) : null,
      moneda: vigente?.moneda ?? pagos[0]?.moneda ?? "USD",
      clase,
      estado: null,
      fechaPago: null,
      salarioMensual: clase === "proyectada" ? vigente!.monto : null,
      pasada,
    };
  });

  const registradas = quincenas.filter((q) => q.clase === "registrada");
  const proyectadas = quincenas.filter((q) => q.clase === "proyectada");

  return {
    quincenas,
    registradas: registradas.length,
    proyectadas: proyectadas.length,
    faltantes: quincenas.filter((q) => q.clase === "faltante").length,
    totalRegistrado: round2(registradas.reduce((n, q) => n + (q.monto ?? 0), 0)),
    totalProyectado: round2(proyectadas.reduce((n, q) => n + (q.monto ?? 0), 0)),
    cambios: movimientos
      .filter((m) => m.fechaEfectiva.startsWith(String(anio)))
      .sort((a, b) => a.fechaEfectiva.localeCompare(b.fechaEfectiva))
      .map((m) => ({
        fecha: m.fechaEfectiva,
        de: m.montoAnterior,
        a: m.tipo === "BAJA" || m.tipo === "PAUSA" || m.tipo === "ELIMINACION" ? null : m.monto,
        tipo: m.tipo,
      })),
  };
}

/**
 * Cuándo empieza a contar un cambio de salario, visto desde hoy.
 *
 * Vive acá y no en el formulario porque es la MISMA regla que arma el calendario, leída al
 * revés: el formulario le anuncia a quien edita lo que estas funciones van a hacer después.
 * Separarlas sería tener la regla escrita dos veces y que una envejezca.
 */
export type VigenciaDelCambio = "retroactivo" | "hoy" | "futuro";

export function vigenciaDe(fechaEfectivaISO: string, hoyISO: string): VigenciaDelCambio {
  if (fechaEfectivaISO < hoyISO) return "retroactivo";
  if (fechaEfectivaISO > hoyISO) return "futuro";
  return "hoy";
}
