/**
 * lib/finanzas/cierre.ts — el cierre del mes (rediseño de Finanzas, 2026-10-03, docs/finanzas-rediseno-plan.md, etapa
 * «Cierre del mes»).
 *
 * Cerrar un mes es que quien supervisa diga «estos números están bien». Se guarda quién, cuándo y los números de ese
 * momento; **no se congela nada**: si después cambia algo del mes, el punto de equilibrio lo dice («cambió después del
 * cierre») en vez de bloquear la edición.
 *
 * ── QUÉ BLOQUEA ─────────────────────────────────────────────────────────────────
 * Lo que hace que el gasto o el ingreso del mes estén completos y revisados:
 *   · la planilla, con sus dos quincenas;
 *   · los gastos: desde octubre de 2026, el aviso de quien registra («ya anoté todos»); antes, el Excel de egresos
 *     completo (lo que el punto de equilibrio dice que le falta, sin la planilla, que es su propia línea);
 *   · el tipo de cambio, confirmado por una persona (no el que cargó un script);
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
  /** Email de quien lo confirmó, o null si lo cargó un script (todavía no lo confirmó nadie). */
  confirmadoPor: string | null;
  /**
   * El del Banco Central (2026-10-05): cuántos días del mes trajeron su tasa y si están todos. Con esto el mes no se
   * confirma a mano: está listo cuando el BCCR tiene todos sus días. null o ausente = el mes no tiene días del BCCR.
   */
  bccr?: { dias: number; completo: boolean } | null;
}

export interface DatosDelMes {
  periodo: string;
  /** Las quincenas de planilla anotadas en el libro. */
  quincenas: number[];
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
  const faltaQ = [1, 2].filter((q) => !d.quincenas.includes(q));
  const items: ItemDeCierre[] = [
    {
      clave: "planilla",
      grupo: "Costos y gastos",
      titulo: "Pagar y anotar la planilla",
      detalle:
        faltaQ.length === 0
          ? "Las dos quincenas están anotadas."
          : faltaQ.length === 2
            ? `Falta toda la planilla de ${mes}.`
            : `Falta la ${faltaQ[0]}ª quincena de ${mes}.`,
      listo: faltaQ.length === 0,
      bloquea: true,
      quien: nombres.supervisa,
      accion: "Ir a Planilla",
      href: "/finanzas/costos/planillas",
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
    d.tipoCambio?.bccr
      ? {
          // Desde 2026-10-05 el tipo de cambio sale del Banco Central día por día: nadie lo confirma, se trae.
          clave: "tipo-cambio",
          grupo: "Costos y gastos",
          titulo: "Tener el tipo de cambio del Banco Central",
          detalle: d.tipoCambio.bccr.completo
            ? `${colones(d.tipoCambio.crcPorUsd)} por dólar: el promedio de la venta del BCCR de ${plural(d.tipoCambio.bccr.dias, "día", "días")}.`
            : `${colones(d.tipoCambio.crcPorUsd)} por dólar con ${plural(d.tipoCambio.bccr.dias, "día", "días")} del BCCR: faltan días del mes.`,
          listo: d.tipoCambio.bccr.completo,
          bloquea: true,
          quien: nombres.supervisa,
          accion: "Ver el tipo de cambio",
          href: "/finanzas/tipo-de-cambio",
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

/** Los números que se guardan al cerrar, en dólares: con ellos se sabe después si el mes cambió. */
export interface NumerosDelCierre {
  moneda: "USD";
  egresos: number;
  facturado: number;
  cobrado: number;
  ingresosTotales: number;
}

/** ¿Cambió el mes después de cerrarlo? Un centavo de redondeo no cuenta. */
export function cambioDespuesDelCierre(guardados: NumerosDelCierre, hoy: Omit<NumerosDelCierre, "moneda">): boolean {
  const campos = ["egresos", "facturado", "cobrado", "ingresosTotales"] as const;
  const centavos = (n: number) => Math.round(n * 100);
  return campos.some((c) => Math.abs(centavos(guardados[c] ?? 0) - centavos(hoy[c])) > 1);
}

/** El mes que conviene cerrar al entrar: el anterior al de hoy. */
export function mesParaCerrar(hoyISO: string): string {
  const [y, m] = hoyISO.slice(0, 7).split("-").map(Number) as [number, number];
  return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}
