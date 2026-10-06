/**
 * lib/finanzas/cierre.ts — el cierre del mes (rediseño de Finanzas, 2026-10-03, docs/finanzas-rediseno-plan.md, etapa
 * «Cierre del mes»).
 *
 * Cerrar un mes es que quien supervisa diga «estos números están bien». Se guarda quién, cuándo y los números de ese
 * momento; **no se congela nada**: si después cambia algo del mes, el punto de equilibrio lo dice («cambió después del
 * cierre») en vez de bloquear la edición. Qué cuenta como cambio: un gasto, una factura o una quincena de ese mes; un
 * cobro no (`HuellaDelMes`, 2026-10-06).
 *
 * ── QUÉ BLOQUEA ─────────────────────────────────────────────────────────────────
 * Lo que hace que el gasto o el ingreso del mes estén completos y revisados:
 *   · la planilla, con sus dos quincenas generadas Y marcadas como pagadas (decisión de Elías, 2026-10-05: una
 *     quincena generada y sin marcar como pagada no deja cerrar);
 *   · los gastos: desde octubre de 2026, el aviso de quien registra («ya anoté todos»); antes, el Excel de egresos
 *     completo (lo que el punto de equilibrio dice que le falta, sin la planilla, que es su propia línea);
 *   · el tipo de cambio: el del Banco Central con todos los días del mes o, si al BCCR le faltan días (o no tiene
 *     ninguno), uno confirmado por una persona (no el que cargó un script). Decisión de Elías, 2026-10-05: «si al Banco
 *     Central le faltan días de un mes, Alex puede cerrarlo confirmando él la tasa»;
 *   · la revisión al día: nada de ese mes por revisar ni devuelto.
 * Lo de Conciliación, los pagos que Odoo o Mercury ya dan por pagados, las cuotas por facturar y las comisiones vencidas
 * se MUESTRAN pero no bloquean: hoy son más de cien filas y el mes no se cerraría nunca.
 *
 * PURO: sin Prisma ni red.
 */
import { EGRESOS_DESDE_NEXUS, etiquetaMes } from "./gastos";

export type GrupoDeCierre = "Costos y gastos" | "Revisión" | "Ingresos" | "Conciliación";

export interface ItemDeCierre {
  clave: string;
  grupo: GrupoDeCierre;
  titulo: string;
  detalle: string;
  listo: boolean;
  /** Si falta, ¿frena el cierre? */
  bloquea: boolean;
  /** Quién lo resuelve: el nombre de pila, ya puesto. */
  quien: string;
  accion: string;
  href: string;
}

export interface TipoCambioDelMes {
  crcPorUsd: number;
  fuente: string;
  /**
   * Email de quien lo confirmó, o null si lo cargó un script (todavía no lo confirmó nadie). Con el BCCR completo no
   * cuenta (manda el BCCR): solo vale en un mes sin días del BCCR o con días que faltan (`mandaLaTasaConfirmada`).
   */
  confirmadoPor: string | null;
  /**
   * El del Banco Central (2026-10-05): cuántos días del mes trajeron su tasa y si están todos. Con todos, el mes no se
   * confirma a mano. Con días que faltan, lo cierra una persona confirmando la tasa. null o ausente = el mes no tiene
   * días del BCCR.
   */
  bccr?: { dias: number; completo: boolean } | null;
}

export interface DatosDelMes {
  periodo: string;
  /** Las quincenas de planilla generadas en el libro (con al menos una fila, pagada o no). */
  quincenas: number[];
  /** De ésas, las que tienen TODAS sus filas en PAGADO (`quincenasPorMes`). */
  quincenasPagadas: number[];
  /** El aviso de quien registra de que los gastos del mes están todos (meses desde el corte). */
  gastosListos: boolean;
  gastosAnotados: number;
  /** Lo que le falta al mes según el punto de equilibrio, SIN la planilla (meses del Excel). */
  faltantesDelExcel: string[];
  tipoCambio: TipoCambioDelMes | null;
  /** Pagos y gastos de ese mes por revisar, y devueltos sin corregir. */
  porRevisar: number;
  devueltos: number;
}

/** Lo que se muestra y no bloquea. Son números de HOY, de todo lo pendiente: no se pueden partir por mes. */
export interface PendientesDelEquipo {
  porFacturar: { n: number; plata: string };
  pagosDetectados: { n: number; plata: string };
  comisionesVencidas: number;
  conciliacion: number;
}

/** Un tipo de cambio lo confirmó una persona si quien lo registró es un email; un script firma «script:…». */
export function confirmadoPorPersona(registradoPor: string | null | undefined): string | null {
  return registradoPor && registradoPor.includes("@") ? registradoPor : null;
}

/**
 * ¿Manda la tasa que confirmó una persona por encima de la del Banco Central? Solo cuando al BCCR le faltan días de un
 * mes que ya empezó (decisión de Elías, 2026-10-05): ahí Alex cierra el mes confirmando él la tasa, y esa es la que se
 * usa. Con el mes completo manda el BCCR; sin ningún día del BCCR manda la cargada a mano, como siempre.
 *
 * UNA regla para los tres que la necesitan: qué tasa usa el año (`cargarTasasDelAnio`), si es firme (`tasaFirme`) y
 * si el cierre la da por confirmada (cierre-server.ts). Copiada, una podía dar el mes por cerrado con una tasa que el
 * punto de equilibrio no usa.
 */
export function mandaLaTasaConfirmada(
  bccr: { completo: boolean; porVenir: boolean } | null | undefined,
  registradoPor: string | null | undefined,
): boolean {
  return !!bccr && !bccr.completo && !bccr.porVenir && confirmadoPorPersona(registradoPor) !== null;
}

/**
 * Las quincenas de cada mes según el libro de planilla (una fila por persona y quincena): generadas = con al menos una
 * fila; pagadas = con TODAS sus filas en PAGADO. Una quincena con alguien todavía en PENDIENTE no está pagada (decisión
 * de Elías, 2026-10-05: «no se puede cerrar un mes con la planilla generada pero sin marcar como pagada»).
 */
export function quincenasPorMes(
  filas: ReadonlyArray<{ periodo: string; quincena: number; estado: string }>,
): Map<string, { anotadas: number[]; pagadas: number[] }> {
  const porQuincena = new Map<string, { periodo: string; quincena: number; pagada: boolean }>();
  for (const f of filas) {
    const k = `${f.periodo}|${f.quincena}`;
    const q = porQuincena.get(k) ?? { periodo: f.periodo, quincena: f.quincena, pagada: true };
    if (f.estado !== "PAGADO") q.pagada = false;
    porQuincena.set(k, q);
  }
  const out = new Map<string, { anotadas: number[]; pagadas: number[] }>();
  for (const q of porQuincena.values()) {
    const m = out.get(q.periodo) ?? { anotadas: [], pagadas: [] };
    m.anotadas.push(q.quincena);
    if (q.pagada) m.pagadas.push(q.quincena);
    out.set(q.periodo, m);
  }
  for (const m of out.values()) {
    m.anotadas.sort((a, b) => a - b);
    m.pagadas.sort((a, b) => a - b);
  }
  return out;
}

/** «2.ª». */
const ordinal = (q: number) => `${q}.ª`;

/** Lo que dice la línea de la planilla: qué quincena falta generar y cuál falta marcar como pagada. */
function detalleDePlanilla(d: Pick<DatosDelMes, "quincenas" | "quincenasPagadas">, mes: string): { listo: boolean; detalle: string } {
  const faltaGenerar = [1, 2].filter((q) => !d.quincenas.includes(q));
  const faltaPagar = [1, 2].filter((q) => d.quincenas.includes(q) && !d.quincenasPagadas.includes(q));
  if (faltaGenerar.length === 0 && faltaPagar.length === 0) return { listo: true, detalle: "Las dos quincenas están pagadas." };
  if (faltaGenerar.length === 2) return { listo: false, detalle: `Falta toda la planilla de ${mes}.` };
  const pagar =
    faltaPagar.length === 2
      ? "marcar como pagadas las dos quincenas"
      : faltaPagar.length === 1
        ? `marcar como pagada la ${ordinal(faltaPagar[0]!)} quincena`
        : null;
  if (faltaGenerar.length === 0) return { listo: false, detalle: `Falta ${pagar}.` };
  const generar = `Falta la ${ordinal(faltaGenerar[0]!)} quincena de ${mes}`;
  return { listo: false, detalle: pagar ? `${generar}, y marcar como pagada la ${ordinal(faltaPagar[0]!)}.` : `${generar}.` };
}

/** ¿Este faltante del punto de equilibrio es de la planilla? Ya tiene su propia línea en el cierre. */
export function esFaltanteDePlanilla(f: string): boolean {
  return f === "planilla" || /^planilla-q\d/.test(f);
}

const plural = (n: number, uno: string, varios: string) => (n === 1 ? `1 ${uno}` : `${n} ${varios}`);
const colones = (n: number) => `₡${n.toLocaleString("es-CR", { maximumFractionDigits: 2 })}`;

/** Las líneas del cierre de un mes, en el orden en que se leen. */
export function itemsDeCierre(
  d: DatosDelMes,
  equipo: PendientesDelEquipo | null,
  nombres: { registra: string; supervisa: string },
): ItemDeCierre[] {
  const mes = etiquetaMes(d.periodo);
  const desdeNexus = d.periodo >= EGRESOS_DESDE_NEXUS;
  const planilla = detalleDePlanilla(d, mes);
  const items: ItemDeCierre[] = [
    {
      clave: "planilla",
      grupo: "Costos y gastos",
      titulo: "Pagar y anotar la planilla",
      detalle: planilla.detalle,
      listo: planilla.listo,
      bloquea: true,
      quien: nombres.supervisa,
      // Al historial y no a la configuración: ahí se generan y se pagan las quincenas (2026-10-06).
      accion: "Ir al historial de planilla",
      href: "/finanzas/costos/planillas/historial",
    },
    desdeNexus
      ? {
          clave: "gastos",
          grupo: "Costos y gastos",
          titulo: "Anotar los gastos del mes",
          detalle: d.gastosListos
            ? `${nombres.registra} avisó que están todos (${plural(d.gastosAnotados, "gasto", "gastos")}).`
            : `${plural(d.gastosAnotados, "gasto anotado", "gastos anotados")}. Falta que ${nombres.registra} avise que están todos.`,
          listo: d.gastosListos,
          bloquea: true,
          quien: nombres.registra,
          accion: "Ir a Gastos del mes",
          href: `/finanzas/gastos?mes=${d.periodo}`,
        }
      : {
          clave: "gastos",
          grupo: "Costos y gastos",
          titulo: "Tener los gastos del Excel de egresos",
          detalle:
            d.faltantesDelExcel.length === 0
              ? "El Excel de egresos tiene todo lo que se espera del mes."
              : `Le falta: ${d.faltantesDelExcel.join("; ")}. Hasta septiembre los gastos salen de ese Excel.`,
          listo: d.faltantesDelExcel.length === 0,
          bloquea: true,
          quien: nombres.supervisa,
          accion: "Ver en el punto de equilibrio",
          href: "/finanzas/equilibrio",
        },
    d.tipoCambio?.bccr?.completo
      ? {
          // Desde 2026-10-05 el tipo de cambio sale del Banco Central día por día: con el mes completo nadie lo
          // confirma, se trae.
          clave: "tipo-cambio",
          grupo: "Costos y gastos",
          titulo: "Tener el tipo de cambio del Banco Central",
          detalle: `${colones(d.tipoCambio.crcPorUsd)} por dólar: el promedio de la venta del BCCR de ${plural(d.tipoCambio.bccr.dias, "día", "días")}.`,
          listo: true,
          bloquea: true,
          quien: nombres.supervisa,
          accion: "Ver el tipo de cambio",
          href: "/finanzas/tipo-de-cambio",
        }
      : d.tipoCambio?.bccr
        ? {
            // Al BCCR le faltan días del mes (decisión de Elías, 2026-10-05): lo cierra quien supervisa confirmando la
            // tasa. La que confirma es la que usa el punto de equilibrio (`mandaLaTasaConfirmada`).
            clave: "tipo-cambio",
            grupo: "Costos y gastos",
            titulo: "Confirmar el tipo de cambio",
            detalle: d.tipoCambio.confirmadoPor
              ? `${colones(d.tipoCambio.crcPorUsd)} por dólar, confirmado. Al Banco Central le faltan días del mes: manda la tasa confirmada.`
              : `${colones(d.tipoCambio.crcPorUsd)} por dólar con ${plural(d.tipoCambio.bccr.dias, "día", "días")} del BCCR: faltan días del mes. Para cerrarlo, confirma la tasa o pon otra.`,
            listo: !!d.tipoCambio.confirmadoPor,
            bloquea: true,
            quien: nombres.supervisa,
            accion: "Confirmar",
            href: "#tipo-de-cambio",
          }
        : {
            clave: "tipo-cambio",
            grupo: "Costos y gastos",
            titulo: "Confirmar el tipo de cambio",
            detalle: !d.tipoCambio
              ? `${mes} no tiene tipo de cambio: lo que está en colones no se puede sumar.`
              : d.tipoCambio.confirmadoPor
                ? `${colones(d.tipoCambio.crcPorUsd)} por dólar, confirmado.`
                : `${colones(d.tipoCambio.crcPorUsd)} por dólar, sin confirmar: ${d.tipoCambio.fuente}. No hay días del Banco Central para este mes.`,
            listo: !!d.tipoCambio?.confirmadoPor,
            bloquea: true,
            quien: nombres.supervisa,
            accion: d.tipoCambio ? "Confirmar" : "Poner",
            href: "#tipo-de-cambio",
          },
    {
      clave: "revision",
      grupo: "Revisión",
      titulo: "Revisar el trabajo del equipo",
      detalle:
        d.porRevisar + d.devueltos === 0
          ? `Todo lo que registró ${nombres.registra} de ${mes} está revisado.`
          : [
              d.porRevisar ? `${plural(d.porRevisar, "registro", "registros")} de ${mes} sin revisar` : null,
              d.devueltos ? `${plural(d.devueltos, "devuelto", "devueltos")} sin corregir` : null,
            ]
              .filter(Boolean)
              .join(" y ") + ".",
      listo: d.porRevisar + d.devueltos === 0,
      bloquea: true,
      quien: nombres.supervisa,
      accion: "Ir a Supervisión",
      href: "/finanzas/supervision#revision",
    },
  ];
  if (equipo) {
    items.push(
      {
        clave: "facturar",
        grupo: "Ingresos",
        titulo: "Facturar las cuotas que ya tocan",
        detalle: equipo.porFacturar.n
          ? `${plural(equipo.porFacturar.n, "cuota sin facturar", "cuotas sin facturar")} · ${equipo.porFacturar.plata}`
          : "No hay cuotas atrasadas sin factura.",
        listo: equipo.porFacturar.n === 0,
        bloquea: false,
        quien: nombres.registra,
        accion: "Ir a Cobranza",
        href: "/cobranza",
      },
      {
        clave: "pagos",
        grupo: "Ingresos",
        titulo: "Registrar los pagos que entraron",
        detalle: equipo.pagosDetectados.n
          ? `Odoo o Mercury ya dan por pagadas ${plural(equipo.pagosDetectados.n, "cuota que en Nexus sigue", "cuotas que en Nexus siguen")} por cobrar · ${equipo.pagosDetectados.plata}`
          : "Nada de lo que Odoo o Mercury dan por pagado sigue por cobrar en Nexus.",
        listo: equipo.pagosDetectados.n === 0,
        bloquea: false,
        quien: nombres.registra,
        accion: "Ir a Conciliación",
        href: "/finanzas/conciliacion",
      },
      {
        clave: "comisiones",
        grupo: "Ingresos",
        titulo: "Confirmar las comisiones de aliados",
        detalle: equipo.comisionesVencidas
          ? `${plural(equipo.comisionesVencidas, "comisión con la fecha vencida", "comisiones con la fecha vencida")} y sin confirmar.`
          : "No hay comisiones vencidas sin confirmar.",
        listo: equipo.comisionesVencidas === 0,
        bloquea: false,
        quien: nombres.registra,
        accion: "Ir a Aliados",
        href: "/finanzas/comisiones-partner",
      },
      {
        clave: "conciliacion",
        grupo: "Conciliación",
        titulo: "Resolver lo que no cuadra",
        detalle: equipo.conciliacion
          ? `${plural(equipo.conciliacion, "fila", "filas")} entre Odoo, Mercury y Nexus.`
          : "Todo cuadra con Odoo y Mercury.",
        listo: equipo.conciliacion === 0,
        bloquea: false,
        quien: nombres.registra,
        accion: "Ir a Conciliación",
        href: "/finanzas/conciliacion",
      },
    );
  }
  return items;
}

/** Lo que falta y frena el cierre. */
export function faltanParaCerrar(items: readonly ItemDeCierre[]): ItemDeCierre[] {
  return items.filter((i) => i.bloquea && !i.listo);
}

export type EstadoEnElAnio = "CERRADO" | "LISTO" | "FALTA" | "EN_CURSO" | "FUTURO";

/**
 * Cómo se ve un mes en la tira del año. `primeroQueFalta` es el título de la primera línea que frena, para decir qué
 * falta en una palabra.
 */
export function estadoEnElAnio(
  periodo: string,
  hoyISO: string,
  cerrado: boolean,
  faltan: readonly Pick<ItemDeCierre, "clave">[],
): { estado: EstadoEnElAnio; texto: string } {
  const actual = hoyISO.slice(0, 7);
  if (cerrado) return { estado: "CERRADO", texto: "Cerrado" };
  if (periodo > actual) return { estado: "FUTURO", texto: "Por venir" };
  if (periodo === actual) return { estado: "EN_CURSO", texto: "En curso" };
  if (faltan.length === 0) return { estado: "LISTO", texto: "Completo" };
  const corto: Record<string, string> = {
    planilla: "Falta planilla",
    gastos: "Faltan gastos",
    "tipo-cambio": "Falta tipo de cambio",
    revision: "Falta revisar",
  };
  return {
    estado: "FALTA",
    texto: faltan.length === 1 ? (corto[faltan[0]!.clave] ?? "Falta un dato") : `Faltan ${faltan.length} cosas`,
  };
}

/**
 * Lo que decide si un mes cerrado cambió (decisión de Elías con Alex, 2026-10-06): sus GASTOS y sus FACTURAS, cada uno
 * por moneda original. «Cobrar es lo normal»: que un cliente pague en octubre una factura de septiembre no marca
 * septiembre; agregar, corregir o borrar un gasto, una factura o una quincena de planilla de septiembre, sí.
 *
 *   · gastos    lo anotado del mes: gastos, recurrentes y las quincenas de planilla. SIN la reserva de aguinaldo: se
 *               recalcula con cualquier salario del año y no es algo que se haya anotado en ese mes.
 *   · facturas  las facturas EMITIDAS en el mes, cobradas o no, y las comisiones de aliados con monto confirmado (una
 *               estimación no). Por fecha de emisión y no por la de cobro: es lo que hace que cobrar no mueva nada.
 *
 * En su moneda y no en dólares: el tipo de cambio tampoco marca el mes (no es un gasto ni una factura), y así la marca
 * se puede saber en cualquier moneda del reporte.
 */
// `type` y no `interface`: se guarda como JSON en `CierreMes.numeros`, y una interfaz no entra en el tipo JSON de Prisma.
export type HuellaDelMes = {
  gastos: Record<string, number>;
  facturas: Record<string, number>;
};

/**
 * Los números que se guardan al cerrar. `huella` decide si el mes cambió (desde 2026-10-06); el resto es la foto de ese
 * día en dólares (lo que se guardaba antes: lo facturado y lo cobrado se mueven con cada cobro, por eso ya no deciden).
 */
export interface NumerosDelCierre {
  moneda: "USD";
  egresos: number;
  facturado: number;
  cobrado: number;
  ingresosTotales: number;
  huella?: HuellaDelMes;
}

/** Lo que alimenta la huella, ya leído de la base (puro: sin Prisma). */
export interface FuentesDeLaHuella {
  egresos: ReadonlyArray<{ periodo: string; rubro: string; monto: number; moneda: string }>;
  facturas: ReadonlyArray<{ fechaEmisionISO: string | null; monto: number; moneda: string }>;
  comisiones: ReadonlyArray<{ fechaISO: string; monto: number; moneda: string; esProyeccion: boolean }>;
}

/** La huella de cada mes. En centavos al sumar, para que el orden de las filas no invente una diferencia. */
export function huellasPorMes(f: FuentesDeLaHuella): Map<string, HuellaDelMes> {
  const acc = new Map<string, { gastos: Map<string, number>; facturas: Map<string, number> }>();
  const sumar = (periodo: string, lado: "gastos" | "facturas", moneda: string, monto: number) => {
    const m = acc.get(periodo) ?? { gastos: new Map(), facturas: new Map() };
    m[lado].set(moneda, (m[lado].get(moneda) ?? 0) + Math.round(monto * 100));
    acc.set(periodo, m);
  };
  for (const e of f.egresos) if (e.rubro !== "RESERVA_AGUINALDO") sumar(e.periodo, "gastos", e.moneda, e.monto);
  for (const c of f.facturas) if (c.fechaEmisionISO) sumar(c.fechaEmisionISO.slice(0, 7), "facturas", c.moneda, c.monto);
  for (const c of f.comisiones) if (!c.esProyeccion) sumar(c.fechaISO.slice(0, 7), "facturas", c.moneda, c.monto);
  const aObjeto = (m: Map<string, number>) => Object.fromEntries([...m].map(([k, v]) => [k, v / 100]));
  return new Map([...acc].map(([p, m]) => [p, { gastos: aObjeto(m.gastos), facturas: aObjeto(m.facturas) }]));
}

/**
 * ¿Cambió el mes después de cerrarlo? Un centavo de redondeo no cuenta. null = el cierre es anterior a la huella
 * (2026-10-06) y no se puede saber sin volver a marcarlo por cada cobro.
 */
export function cambioDespuesDelCierre(guardados: NumerosDelCierre, hoy: HuellaDelMes | undefined): boolean | null {
  if (!guardados.huella) return null;
  const ahora = hoy ?? { gastos: {}, facturas: {} };
  const distinto = (a: Record<string, number>, b: Record<string, number>) =>
    [...new Set([...Object.keys(a), ...Object.keys(b)])].some(
      (m) => Math.abs(Math.round((a[m] ?? 0) * 100) - Math.round((b[m] ?? 0) * 100)) > 1,
    );
  return distinto(guardados.huella.gastos, ahora.gastos) || distinto(guardados.huella.facturas, ahora.facturas);
}

/** El mes que conviene cerrar al entrar: el anterior al de hoy. */
export function mesParaCerrar(hoyISO: string): string {
  const [y, m] = hoyISO.slice(0, 7).split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
