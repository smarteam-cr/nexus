/**
 * lib/finanzas/caja/politica.ts — cuándo se paga cada compromiso, según la política de pagos aprobada (2026-11-13).
 *
 * PURO: sin Prisma, sin red, sin reloj. La fecha de hoy entra por parámetro, y las fechas son texto «AAAA-MM-DD» con
 * aritmética de calendario en UTC (un `new Date("2026-11-30")` leído en la hora de Costa Rica es el 29).
 *
 * ── LA POLÍTICA ──────────────────────────────────────────────────────────────────────────────────────────────────
 *   · Escenario A — servicios profesionales y outsourcing: facturan del 1 al 3 y se les paga el día 7, si el cliente
 *     ya pagó. Una factura que llega el 4 o después se paga el 7 del mes siguiente. Si el pago espera un cobro, se
 *     paga el primer 7 después de que el cliente pague.
 *   · Escenario B — artículos físicos: se pagan los viernes, con corte el miércoles (lo pedido hasta el miércoles se
 *     paga ese viernes; lo de jueves en adelante, el siguiente), y hasta 50 % de adelanto: el adelanto sale el viernes
 *     del pedido y el resto el viernes del corte de la entrega.
 *   · Comisionistas — la regla que ya tienen: «mes vencido», el siguiente fin de mes después de que el cliente pague
 *     (la misma de las comisiones de vendedor, `quincenaDePagoDeComision`). El día 7 NO está confirmado (lo confirma
 *     Alex Arrieta): queda detrás de `COMISIONISTAS_EL_DIA_7`, que se prende cambiando esa constante.
 *   · Lo demás (planilla, impuestos y cargas sociales, herramientas, otros): en la fecha que la persona pone.
 *
 * Lo que espera algo (la factura, el cobro del cliente, la entrega) no tiene fecha de pago todavía, pero la proyección
 * necesita ponerlo en algún día: `fechaEstimadaISO` es la mejor estimación y nunca es anterior a hoy.
 */
import { finDeMesISO, quincenaDePagoDeComision } from "@/lib/cobranza/comisiones";

/**
 * ¿Los comisionistas pasan al escenario A (factura del 1 al 3, pago el 7)? APAGADO hasta que Alex Arrieta lo confirme.
 * Prenderlo es cambiar esto a `true`: la regla ya está escrita y probada (politica.test.ts).
 */
export const COMISIONISTAS_EL_DIA_7 = false;

/** Escenario A: hasta qué día del mes una factura entra al pago del 7. */
export const ULTIMO_DIA_PARA_FACTURAR = 3;
export const DIA_DE_PAGO_ESCENARIO_A = 7;
/** Escenario B: el corte es el miércoles (3) y se paga el viernes (5). Días de la semana de `getUTCDay`. */
export const DIA_DE_CORTE = 3;
export const DIA_DE_PAGO_ESCENARIO_B = 5;
export const ADELANTO_MAXIMO_PCT = 50;

/**
 * Las categorías de un pago comprometido. ⚠ Sin «Planilla» (revisión del 2026-11-13): la caja ya resta la planilla con
 * sus cargas (los salarios de Costos son el costo completo, con cargas sociales), así que anotarla como compromiso la
 * contaba dos veces. «Impuestos y cargas» es lo que NO está ya en la planilla: IVA, renta, patentes, una multa.
 */
export type CategoriaDePago =
  | "IMPUESTOS_Y_CARGAS"
  | "SERVICIOS_PROFESIONALES"
  | "COMISIONISTA"
  | "ARTICULO_FISICO"
  | "HERRAMIENTA"
  | "OTRO";

export const CATEGORIAS_DE_PAGO = [
  "IMPUESTOS_Y_CARGAS",
  "SERVICIOS_PROFESIONALES",
  "COMISIONISTA",
  "ARTICULO_FISICO",
  "HERRAMIENTA",
  "OTRO",
] as const satisfies readonly CategoriaDePago[];

export const ETIQUETA_DE_CATEGORIA: Record<CategoriaDePago, string> = {
  IMPUESTOS_Y_CARGAS: "Impuestos y cargas (lo que no va en la planilla)",
  SERVICIOS_PROFESIONALES: "Servicios profesionales u outsourcing",
  COMISIONISTA: "Comisionista",
  ARTICULO_FISICO: "Artículo físico",
  HERRAMIENTA: "Herramienta",
  OTRO: "Otro",
};

export type Escenario = "A" | "B" | "MES_VENCIDO" | "FECHA_FIJA";

export function escenarioDe(categoria: CategoriaDePago, opciones: { comisionistasElDia7?: boolean } = {}): Escenario {
  const dia7 = opciones.comisionistasElDia7 ?? COMISIONISTAS_EL_DIA_7;
  if (categoria === "SERVICIOS_PROFESIONALES") return "A";
  if (categoria === "COMISIONISTA") return dia7 ? "A" : "MES_VENCIDO";
  if (categoria === "ARTICULO_FISICO") return "B";
  return "FECHA_FIJA";
}

/** La regla de cada escenario, en palabras, para la pantalla. */
export const REGLA_DE_ESCENARIO: Record<Escenario, string> = {
  A: "Factura del 1 al 3 y se paga el 7, si el cliente ya pagó.",
  B: "Se paga el viernes; lo pedido después del miércoles pasa al viernes siguiente. Hasta 50 % de adelanto.",
  MES_VENCIDO: "Mes vencido: el siguiente fin de mes después de que el cliente pague.",
  FECHA_FIJA: "En la fecha anotada.",
};

// ── Fechas (texto AAAA-MM-DD, aritmética en UTC) ────────────────────────────────────────────────────────────────

const pad = (n: number) => String(n).padStart(2, "0");
const aFecha = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const aISO = (d: Date) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;

export function sumarDiasISO(iso: string, dias: number): string {
  const d = aFecha(iso);
  d.setUTCDate(d.getUTCDate() + dias);
  return aISO(d);
}

/** El día `dia` del mes siguiente al de `iso`. */
function diaDelMesSiguiente(iso: string, dia: number): string {
  const d = aFecha(iso);
  return aISO(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, dia)));
}

/** El primer día 7 desde `iso`, contando ese mismo día. */
export function siguienteDia7(iso: string): string {
  const dia = Number(iso.slice(8, 10));
  return dia <= DIA_DE_PAGO_ESCENARIO_A ? `${iso.slice(0, 8)}${pad(DIA_DE_PAGO_ESCENARIO_A)}` : diaDelMesSiguiente(iso, DIA_DE_PAGO_ESCENARIO_A);
}

/** Escenario A: el 7 que le toca a una factura recibida en `iso`. */
export function dia7DeLaFactura(iso: string): string {
  const dia = Number(iso.slice(8, 10));
  return dia <= ULTIMO_DIA_PARA_FACTURAR ? `${iso.slice(0, 8)}${pad(DIA_DE_PAGO_ESCENARIO_A)}` : diaDelMesSiguiente(iso, DIA_DE_PAGO_ESCENARIO_A);
}

/**
 * Escenario B: el viernes que le toca a lo pedido (o entregado) en `iso`. Lunes a miércoles → ese viernes; jueves a
 * domingo → el viernes de la semana siguiente (la semana va de lunes a domingo).
 */
export function viernesDelCorte(iso: string): string {
  const dow = aFecha(iso).getUTCDay(); // 0 domingo … 6 sábado
  const lunesADomingo = dow === 0 ? 7 : dow; // 1 lunes … 7 domingo
  const hastaViernes = DIA_DE_PAGO_ESCENARIO_B - lunesADomingo;
  return sumarDiasISO(iso, lunesADomingo <= DIA_DE_CORTE ? hastaViernes : hastaViernes + 7);
}

/** El lunes de la semana de `iso` (la semana va de lunes a domingo). */
export function lunesDeLaSemana(iso: string): string {
  const dow = aFecha(iso).getUTCDay();
  return sumarDiasISO(iso, -(dow === 0 ? 6 : dow - 1));
}

const maxISO = (...fechas: string[]) => fechas.reduce((a, b) => (b > a ? b : a));

// ── Las cuotas de un compromiso ─────────────────────────────────────────────────────────────────────────────────

export interface CompromisoParaFechar {
  id: string;
  concepto: string;
  beneficiario: string | null;
  categoria: CategoriaDePago;
  monto: number;
  moneda: "CRC" | "USD";
  /** La fecha que puso la persona. Manda sobre la política. */
  fechaISO: string | null;
  facturaRecibidaISO: string | null;
  entregadoISO: string | null;
  adelantoPct: number;
  adelantoPagadoISO: string | null;
  /** El cobro del cliente que tiene que entrar antes. */
  cobro: { estado: string; fechaProgramadaISO: string; fechaCobroISO: string | null; clienteNombre: string } | null;
}

export type EstadoDelPago = "PROGRAMADO" | "FALTA_LA_FACTURA" | "ESPERA_AL_CLIENTE" | "ESPERA_LA_ENTREGA" | "SIN_FECHA";

export const ETIQUETA_DE_ESTADO: Record<EstadoDelPago, string> = {
  PROGRAMADO: "Programado",
  FALTA_LA_FACTURA: "Falta la factura",
  ESPERA_AL_CLIENTE: "Espera que el cliente pague",
  ESPERA_LA_ENTREGA: "Espera la entrega",
  SIN_FECHA: "Sin fecha",
};

export interface CuotaDePago {
  compromisoId: string;
  parte: "TOTAL" | "ADELANTO" | "RESTO";
  concepto: string;
  beneficiario: string | null;
  categoria: CategoriaDePago;
  monto: number;
  moneda: "CRC" | "USD";
  /** Cuándo se paga según la regla. null = todavía espera algo (`estado` dice qué). */
  fechaISO: string | null;
  /** Para la proyección: la fecha de la regla, o la mejor estimación si espera algo. Nunca antes de hoy. */
  fechaEstimadaISO: string;
  estado: EstadoDelPago;
  /** La fecha de la regla ya pasó y no se pagó: se debe hoy. */
  atrasado: boolean;
  escenario: Escenario;
  /** Por qué esa fecha, en una línea. */
  porQue: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Las cuotas pendientes de un compromiso PENDIENTE: una (TOTAL), o dos en el escenario B con adelanto (ADELANTO y
 * RESTO; el adelanto ya pagado no vuelve a salir).
 */
export function cuotasDePago(
  c: CompromisoParaFechar,
  hoyISO: string,
  opciones: { comisionistasElDia7?: boolean } = {},
): CuotaDePago[] {
  const escenario = escenarioDe(c.categoria, opciones);
  const base = {
    compromisoId: c.id,
    concepto: c.concepto,
    beneficiario: c.beneficiario,
    categoria: c.categoria,
    moneda: c.moneda,
    escenario,
  };
  const cuota = (
    parte: CuotaDePago["parte"],
    monto: number,
    fechaISO: string | null,
    estimada: string,
    estado: EstadoDelPago,
    porQue: string,
  ): CuotaDePago => ({
    ...base,
    parte,
    monto: round2(monto),
    fechaISO,
    fechaEstimadaISO: maxISO(estimada, hoyISO),
    estado,
    atrasado: fechaISO !== null && fechaISO < hoyISO,
    porQue,
  });

  /* La fecha que puso una persona manda siempre: es una decisión, no una regla. */
  if (c.fechaISO) return [cuota("TOTAL", c.monto, c.fechaISO, c.fechaISO, "PROGRAMADO", "Fecha anotada a mano.")];

  if (escenario === "A") {
    const delCliente = c.cobro;
    const clientePago = !delCliente || delCliente.estado === "COBRADO";
    if (!c.facturaRecibidaISO) {
      // Sin factura: lo más pronto que se puede pagar es el 7 que corresponde a una factura que llegue hoy.
      const estimada = dia7DeLaFactura(hoyISO);
      return [cuota("TOTAL", c.monto, null, estimada, "FALTA_LA_FACTURA", "Se paga el 7 siguiente a que llegue la factura.")];
    }
    const delaFactura = dia7DeLaFactura(c.facturaRecibidaISO);
    if (!clientePago && delCliente) {
      const estimada = maxISO(delaFactura, siguienteDia7(maxISO(delCliente.fechaProgramadaISO, hoyISO)));
      return [cuota("TOTAL", c.monto, null, estimada, "ESPERA_AL_CLIENTE", `Se paga el 7 siguiente a que pague ${delCliente.clienteNombre}.`)];
    }
    const fecha = delCliente?.fechaCobroISO ? maxISO(delaFactura, siguienteDia7(delCliente.fechaCobroISO)) : delaFactura;
    const dia = Number(c.facturaRecibidaISO.slice(8, 10));
    const porQue =
      dia <= ULTIMO_DIA_PARA_FACTURAR
        ? `Facturó el ${dia}: entra al pago del 7.`
        : `Facturó el ${dia}, después del 3: pasa al 7 del mes siguiente.`;
    return [cuota("TOTAL", c.monto, fecha, fecha, "PROGRAMADO", porQue)];
  }

  if (escenario === "B") {
    const pct = Math.max(0, Math.min(ADELANTO_MAXIMO_PCT, Math.round(c.adelantoPct)));
    const adelanto = round2((c.monto * pct) / 100);
    const resto = round2(c.monto - adelanto);
    const out: CuotaDePago[] = [];
    if (!c.facturaRecibidaISO) {
      const estimada = viernesDelCorte(hoyISO);
      return [cuota("TOTAL", c.monto, null, estimada, "FALTA_LA_FACTURA", "Se paga el viernes del corte en que llegue el pedido.")];
    }
    const viernesPedido = viernesDelCorte(c.facturaRecibidaISO);
    if (pct === 0) {
      return [cuota("TOTAL", c.monto, viernesPedido, viernesPedido, "PROGRAMADO", "Viernes del corte del pedido (corte el miércoles).")];
    }
    if (!c.adelantoPagadoISO && adelanto > 0) {
      out.push(cuota("ADELANTO", adelanto, viernesPedido, viernesPedido, "PROGRAMADO", `Adelanto del ${pct} %, el viernes del corte del pedido.`));
    }
    if (resto > 0) {
      if (c.entregadoISO) {
        const viernes = viernesDelCorte(c.entregadoISO);
        out.push(cuota("RESTO", resto, viernes, viernes, "PROGRAMADO", "El resto, el viernes del corte de la entrega."));
      } else {
        // Sin entrega todavía: a lo sumo el viernes siguiente al del adelanto (no puede llegar antes).
        const estimada = sumarDiasISO(maxISO(viernesPedido, viernesDelCorte(hoyISO)), 7);
        out.push(cuota("RESTO", resto, null, estimada, "ESPERA_LA_ENTREGA", "El resto se paga el viernes del corte en que llegue."));
      }
    }
    return out;
  }

  if (escenario === "MES_VENCIDO") {
    const delCliente = c.cobro;
    if (delCliente && delCliente.estado === "COBRADO" && delCliente.fechaCobroISO) {
      const fecha = quincenaDePagoDeComision(delCliente.fechaCobroISO).fechaProgramada;
      return [cuota("TOTAL", c.monto, fecha, fecha, "PROGRAMADO", `Mes vencido: ${delCliente.clienteNombre} pagó; sale el siguiente fin de mes.`)];
    }
    if (delCliente) {
      const estimada = quincenaDePagoDeComision(maxISO(delCliente.fechaProgramadaISO, hoyISO)).fechaProgramada;
      return [cuota("TOTAL", c.monto, null, estimada, "ESPERA_AL_CLIENTE", `Mes vencido: espera que pague ${delCliente.clienteNombre}.`)];
    }
    const desde = c.facturaRecibidaISO ?? hoyISO;
    const fecha = quincenaDePagoDeComision(desde).fechaProgramada;
    return c.facturaRecibidaISO
      ? [cuota("TOTAL", c.monto, fecha, fecha, "PROGRAMADO", "Mes vencido: el siguiente fin de mes después de la factura.")]
      : [cuota("TOTAL", c.monto, null, finDeMesISO(hoyISO.slice(0, 7)), "SIN_FECHA", "Sin cobro ni factura: anota cuándo se paga.")];
  }

  /* FECHA_FIJA sin fecha: se cuenta hoy, para que la proyección no la esconda. */
  return [cuota("TOTAL", c.monto, null, hoyISO, "SIN_FECHA", "Sin fecha: anota cuándo se paga. Mientras tanto se cuenta hoy.")];
}
