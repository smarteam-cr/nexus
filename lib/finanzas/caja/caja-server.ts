/**
 * lib/finanzas/caja/caja-server.ts — lee todo lo que necesita «Dónde está la plata» y lo arma. Server-only.
 *
 * ⚠ PRIVACIDAD: lo consume quien tiene «Caja y pagos» en su permiso por persona (María José), que NO es el de salarios.
 * Los costos recurrentes de categoría Salario se leen con su monto y salen de acá SUMADOS como «Planilla», sin nombre ni
 * monto por persona: el `select` no pide el nombre de ningún costo, y lo vigila guardas.test.ts. Lo mismo las
 * comisiones de vendedor: una línea por día de pago, sin el vendedor.
 *
 * Lo que entra y sale sale de las MISMAS funciones que la caja neta (`loadProyeccion`, `proyectarCostos`,
 * `proyectarGastos`, con sus cortes): un cobro o un costo no puede contar distinto acá y allá.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { loadComisionesVendedor, loadProyeccion } from "@/lib/cobranza";
import { proyectarCostos, proyectarGastos, type CostoProyeccionInput } from "@/lib/cobranza/engine";
import {
  COMISIONISTAS_EL_DIA_7,
  ETIQUETA_DE_CATEGORIA,
  cuotasDePago,
  type CategoriaDePago,
  type CompromisoParaFechar,
  type EstadoDelPago,
} from "./politica";
import {
  cierreDelAnio,
  proyectarCaja,
  type EntradaDeProyeccion,
  type MovimientoFechado,
  type ProyeccionDeCaja,
  type RubroSale,
  type TotalesMoneda,
} from "./proyeccion";
import { ordenarPagosSiNoAlcanza, type OrdenDePagos } from "./prioridad";
import { pagosPorSemana, type PagoDeLaSemana, type SemanaDePagos } from "./semana";

/** Un saldo cargado a mano con más días que esto se marca como viejo: lo que pasó después no está en la cuenta. */
export const DIAS_PARA_SALDO_VIEJO = 3;

export interface CuentaDeBancoDTO {
  id: string;
  nombre: string;
  moneda: "CRC" | "USD";
  origen: "MANUAL" | "MERCURY";
  sociedad: string | null;
  saldo: number | null;
  /** Solo Mercury: el saldo contable (incluye lo enviado que todavía no se asentó). */
  saldoContable: number | null;
  fechaISO: string | null;
  diasDelSaldo: number | null;
  viejo: boolean;
  registradoPor: string | null;
}

export interface CompromisoDTO {
  id: string;
  tipo: "PAGO" | "RESERVA";
  concepto: string;
  beneficiario: string | null;
  categoria: CategoriaDePago;
  monto: number;
  moneda: "CRC" | "USD";
  fechaISO: string | null;
  facturaRecibidaISO: string | null;
  entregadoISO: string | null;
  adelantoPct: number;
  adelantoPagadoISO: string | null;
  cobroId: string | null;
  cobroEtiqueta: string | null;
  estado: "PENDIENTE" | "PAGADO" | "ANULADO";
  pagadoISO: string | null;
  sociedad: string | null;
  nota: string | null;
  registradoPor: string;
  /** Cuándo se paga (o se paga lo que falta), según la política. Vacío si ya se pagó o se anuló. */
  proximaCuota: { fechaISO: string | null; fechaEstimadaISO: string; estado: EstadoDelPago; porQue: string; atrasado: boolean } | null;
}

export interface CajaDTO {
  hoyISO: string;
  tipoDeCambio: { crcPorUsd: number; fechaISO: string } | null;
  cuentas: CuentaDeBancoDTO[];
  proyeccion: ProyeccionDeCaja;
  /** Lo que NO entra a la cuenta, pero se muestra: si entra, suma. */
  aparte: {
    vencidos: { totales: TotalesMoneda; count: number };
    porFacturar: { totales: TotalesMoneda; count: number };
    comisionesAtrasadas: { totales: TotalesMoneda; count: number };
  };
  semanas: SemanaDePagos[];
  /** Solo si la caja no alcanza: los pagos hasta el primer faltante, en el orden acordado. */
  orden: OrdenDePagos | null;
  compromisos: CompromisoDTO[];
  revision: { hoy: { por: string; en: string } | null; ultima: { fechaISO: string; por: string } | null };
  comisionistasElDia7: boolean;
  /** Los cobros todavía sin cobrar, para atar un pago del escenario A al cliente que tiene que pagar antes. */
  cobrosParaAtar: Array<{ id: string; etiqueta: string }>;
}

const num = (d: unknown): number => Number(d);
const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;
const diasEntre = (desdeISO: string, hastaISO: string) =>
  Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86_400_000);

const RUBRO_DE_COSTO: Record<CostoProyeccionInput["categoria"], "PLANILLA" | "HERRAMIENTAS" | "FIJOS"> = {
  SALARIO: "PLANILLA",
  HERRAMIENTA: "HERRAMIENTAS",
  FIJO_OPERACION: "FIJOS",
};

function rubroDeCategoria(c: CategoriaDePago): RubroSale {
  if (c === "PLANILLA") return "PLANILLA";
  if (c === "IMPUESTOS_Y_CARGAS") return "IMPUESTOS_Y_CARGAS";
  if (c === "HERRAMIENTA") return "HERRAMIENTAS";
  return "PAGOS";
}

function fmtCobro(c: { fechaProgramada: Date; monto: unknown; moneda: string; cuenta: { client: { name: string } } }): string {
  const monto = num(c.monto).toLocaleString("es-CR", { maximumFractionDigits: 0 });
  return `${c.cuenta.client.name} · ${c.moneda === "USD" ? "US$" : "₡"}${monto} · ${isoDay(c.fechaProgramada)}`;
}

export async function cargarCaja(hoyISO: string): Promise<CajaDTO> {
  const hoy = new Date(`${hoyISO}T00:00:00Z`);
  const [entra, filasCostos, filasGastos, comisionesAliado, comisionesVendedor, tc, cuentas, compromisos, revisiones, cobrosAbiertos] =
    await Promise.all([
      loadProyeccion(hoyISO),
      /* ⚠ Sin `nombre`: los salarios salen sumados y nunca con el nombre de la persona. */
      prisma.costoRecurrente.findMany({
        where: { activo: true },
        select: { id: true, categoria: true, monto: true, moneda: true, frecuencia: true, activo: true, finalizadoEl: true },
      }),
      prisma.gastoPuntual.findMany({
        where: { fecha: { gte: hoy } },
        select: { id: true, nombre: true, monto: true, moneda: true, fecha: true },
      }),
      prisma.comisionPartner.findMany({
        where: { estado: "POR_COBRAR" },
        select: { id: true, partner: true, monto: true, moneda: true, fecha: true, montoEsProyeccion: true },
      }),
      loadComisionesVendedor(),
      prisma.tipoCambioDia.findFirst({ orderBy: { fecha: "desc" }, select: { fecha: true, venta: true } }),
      prisma.cuentaDeBanco.findMany({
        where: { activa: true },
        orderBy: [{ orden: "asc" }, { nombre: "asc" }],
        include: { saldos: { orderBy: { fecha: "desc" }, take: 1 } },
      }),
      prisma.pagoComprometido.findMany({
        where: { OR: [{ estado: "PENDIENTE" }, { estado: "PAGADO", pagadoEl: { gte: new Date(hoy.getTime() - 30 * 86_400_000) } }] },
        orderBy: [{ createdAt: "desc" }],
        include: {
          cobro: { select: { estado: true, fechaProgramada: true, fechaCobro: true, monto: true, moneda: true, cuenta: { select: { client: { select: { name: true } } } } } },
        },
      }),
      prisma.revisionDeCaja.findMany({ orderBy: { fecha: "desc" }, take: 1 }),
      prisma.cobro.findMany({
        where: { estado: { not: "COBRADO" }, cuenta: { excluidaOperacion: false } },
        orderBy: { fechaProgramada: "asc" },
        take: 300,
        select: { id: true, fechaProgramada: true, monto: true, moneda: true, cuenta: { select: { client: { select: { name: true } } } } },
      }),
    ]);

  const crcPorUsd = tc ? num(tc.venta) : null;

  // ── Los cortes de la caja neta, con los costos sumados por rubro ──
  const costos: CostoProyeccionInput[] = filasCostos.map((c) => ({
    costoId: c.id,
    nombre: c.id, // el nombre no viaja: el orden estable lo da el id
    categoria: c.categoria,
    monto: num(c.monto),
    moneda: c.moneda,
    frecuencia: c.frecuencia,
    activo: c.activo,
    finalizadoEl: isoDay(c.finalizadoEl),
  }));
  const sale = proyectarCostos(costos, { todayISO: hoyISO });
  const costosPorKey = new Map(sale.buckets.map((b) => [b.key, b]));
  const cortes: EntradaDeProyeccion["cortes"] = entra.buckets.map((b) => ({
    key: b.key,
    etiqueta: b.etiqueta,
    granularidad: b.granularidad,
    desdeISO: b.desdeISO,
    hastaISO: b.hastaISO,
    cobros: b.totales,
    costos: (costosPorKey.get(b.key)?.costos ?? []).map((k) => ({ rubro: RUBRO_DE_COSTO[k.categoria], moneda: k.moneda, monto: k.monto })),
  }));

  // ── Lo que tiene día ──
  const fechados: MovimientoFechado[] = [];
  const semana: PagoDeLaSemana[] = [];
  const aparteComisiones = { totales: { CRC: 0, USD: 0 } as TotalesMoneda, count: 0 };
  for (const c of comisionesAliado) {
    const fechaISO = isoDay(c.fecha)!;
    if (fechaISO < hoyISO) {
      aparteComisiones.totales[c.moneda] = round2(aparteComisiones.totales[c.moneda] + num(c.monto));
      aparteComisiones.count++;
      continue;
    }
    fechados.push({ fechaISO, moneda: c.moneda, monto: num(c.monto), rubro: "COMISIONES", concepto: `${c.partner}${c.montoEsProyeccion ? " (estimada)" : ""}` });
  }

  const gastos = proyectarGastos(
    filasGastos.map((g) => ({ gastoId: g.id, nombre: g.nombre, monto: num(g.monto), moneda: g.moneda, fechaISO: isoDay(g.fecha)! })),
    { todayISO: hoyISO },
  );
  for (const b of gastos.buckets) {
    for (const g of b.gastos) {
      const f = filasGastos.find((x) => x.id === g.gastoId);
      const fechaISO = isoDay(f?.fecha) ?? b.desdeISO;
      fechados.push({ fechaISO, moneda: g.moneda, monto: g.monto, rubro: "GASTOS", concepto: g.nombre });
      semana.push({
        clave: `gasto:${g.gastoId}`, concepto: g.nombre, beneficiario: null, tipo: "Gasto anotado", monto: g.monto, moneda: g.moneda,
        fechaISO, fechaEstimadaISO: fechaISO, estado: "PROGRAMADO", atrasado: false, porQue: "Gasto anotado con su día.", compromisoId: null, parte: null,
      });
    }
  }

  // Comisiones de vendedor por cobrar al vendedor: una línea por día de pago y moneda, sin nombres.
  const porDia = new Map<string, { fechaISO: string; moneda: "CRC" | "USD"; monto: number; personas: Set<string> }>();
  for (const d of comisionesVendedor.devengadas) {
    if (d.moneda !== "CRC" && d.moneda !== "USD") continue;
    const k = `${d.fechaPago}:${d.moneda}`;
    const g = porDia.get(k) ?? { fechaISO: d.fechaPago, moneda: d.moneda, monto: 0, personas: new Set<string>() };
    g.monto = round2(g.monto + d.monto);
    g.personas.add(d.teamMemberId);
    porDia.set(k, g);
  }
  for (const g of porDia.values()) {
    const concepto = `Comisiones de vendedor (${g.personas.size === 1 ? "1 persona" : `${g.personas.size} personas`})`;
    fechados.push({ fechaISO: g.fechaISO, moneda: g.moneda, monto: g.monto, rubro: "COMISIONES_DE_VENDEDOR", concepto });
    semana.push({
      clave: `comision-vendedor:${g.fechaISO}:${g.moneda}`, concepto, beneficiario: null, tipo: "Comisiones de vendedor", monto: g.monto, moneda: g.moneda,
      fechaISO: g.fechaISO, fechaEstimadaISO: g.fechaISO < hoyISO ? hoyISO : g.fechaISO, estado: "PROGRAMADO", atrasado: g.fechaISO < hoyISO,
      porQue: comisionesVendedor.politicaPago.label, compromisoId: null, parte: null,
    });
  }

  // Los pagos comprometidos y las reservas.
  const reservas: EntradaDeProyeccion["reservas"] = [];
  const compromisosDTO: CompromisoDTO[] = [];
  for (const c of compromisos) {
    const paraFechar: CompromisoParaFechar = {
      id: c.id,
      concepto: c.concepto,
      beneficiario: c.beneficiario,
      categoria: c.categoria,
      monto: num(c.monto),
      moneda: c.moneda,
      fechaISO: isoDay(c.fecha),
      facturaRecibidaISO: isoDay(c.facturaRecibidaEl),
      entregadoISO: isoDay(c.entregadoEl),
      adelantoPct: c.adelantoPct,
      adelantoPagadoISO: isoDay(c.adelantoPagadoEl),
      cobro: c.cobro
        ? { estado: c.cobro.estado, fechaProgramadaISO: isoDay(c.cobro.fechaProgramada)!, fechaCobroISO: isoDay(c.cobro.fechaCobro), clienteNombre: c.cobro.cuenta.client.name }
        : null,
    };
    let proximaCuota: CompromisoDTO["proximaCuota"] = null;
    if (c.estado === "PENDIENTE" && c.tipo === "RESERVA" && c.fecha) {
      reservas.push({ id: c.id, concepto: c.concepto, moneda: c.moneda, monto: num(c.monto), paraISO: isoDay(c.fecha)! });
    } else if (c.estado === "PENDIENTE" && c.tipo === "PAGO") {
      const cuotas = cuotasDePago(paraFechar, hoyISO);
      for (const q of cuotas) {
        const etiqueta = q.parte === "ADELANTO" ? `${c.concepto} (adelanto)` : q.parte === "RESTO" ? `${c.concepto} (resto)` : c.concepto;
        fechados.push({ fechaISO: q.fechaEstimadaISO, moneda: q.moneda, monto: q.monto, rubro: rubroDeCategoria(c.categoria), concepto: etiqueta });
        semana.push({
          clave: `pago:${c.id}:${q.parte}`, concepto: etiqueta, beneficiario: c.beneficiario, tipo: ETIQUETA_DE_CATEGORIA[c.categoria], monto: q.monto, moneda: q.moneda,
          fechaISO: q.fechaISO, fechaEstimadaISO: q.fechaEstimadaISO, estado: q.estado, atrasado: q.atrasado, porQue: q.porQue, compromisoId: c.id, parte: q.parte,
        });
      }
      const q = cuotas[0];
      if (q) proximaCuota = { fechaISO: q.fechaISO, fechaEstimadaISO: q.fechaEstimadaISO, estado: q.estado, porQue: q.porQue, atrasado: q.atrasado };
    }
    compromisosDTO.push({
      id: c.id,
      tipo: c.tipo,
      concepto: c.concepto,
      beneficiario: c.beneficiario,
      categoria: c.categoria,
      monto: num(c.monto),
      moneda: c.moneda,
      fechaISO: paraFechar.fechaISO,
      facturaRecibidaISO: paraFechar.facturaRecibidaISO,
      entregadoISO: paraFechar.entregadoISO,
      adelantoPct: c.adelantoPct,
      adelantoPagadoISO: paraFechar.adelantoPagadoISO,
      cobroId: c.cobroId,
      cobroEtiqueta: c.cobro ? fmtCobro(c.cobro) : null,
      estado: c.estado,
      pagadoISO: isoDay(c.pagadoEl),
      sociedad: c.sociedad,
      nota: c.nota,
      registradoPor: c.registradoPor,
      proximaCuota,
    });
  }

  // La planilla de cada quincena, en su día (el 15 y el último del mes), sumada.
  for (const b of sale.buckets) {
    if (b.granularidad !== "quincena") continue;
    const planilla: TotalesMoneda = { CRC: 0, USD: 0 };
    for (const k of b.costos) if (k.categoria === "SALARIO") planilla[k.moneda] = round2(planilla[k.moneda] + k.monto);
    for (const moneda of ["CRC", "USD"] as const) {
      if (planilla[moneda] === 0) continue;
      semana.push({
        clave: `planilla:${b.key}:${moneda}`, concepto: `Planilla ${b.etiqueta}`, beneficiario: null, tipo: "Planilla", monto: planilla[moneda], moneda,
        fechaISO: b.hastaISO, fechaEstimadaISO: b.hastaISO < hoyISO ? hoyISO : b.hastaISO, estado: "PROGRAMADO", atrasado: false,
        porQue: "La mitad del costo mensual de los salarios, el 15 y el último día del mes (estimado de los recurrentes).", compromisoId: null, parte: null,
      });
    }
  }

  // ── Las cuentas ──
  const cuentasDTO: CuentaDeBancoDTO[] = cuentas.map((c) => {
    const s = c.saldos[0];
    const fechaISO = isoDay(s?.fecha);
    const dias = fechaISO ? diasEntre(fechaISO, hoyISO) : null;
    return {
      id: c.id,
      nombre: c.nombre,
      moneda: c.moneda,
      origen: c.origen,
      sociedad: c.sociedad,
      saldo: s ? num(s.monto) : null,
      saldoContable: s?.montoContable != null ? num(s.montoContable) : null,
      fechaISO,
      diasDelSaldo: dias,
      viejo: dias !== null && dias > DIAS_PARA_SALDO_VIEJO,
      registradoPor: s?.registradoPor ?? null,
    };
  });

  const proyeccion = proyectarCaja({
    hoyISO,
    cierreISO: cierreDelAnio(hoyISO),
    crcPorUsd,
    saldos: cuentasDTO.map((c) => ({ cuentaId: c.id, nombre: c.nombre, moneda: c.moneda, monto: c.saldo, fechaISO: c.fechaISO })),
    cortes,
    fechados,
    reservas,
  });

  // Si no alcanza: lo libre de hoy más lo que entra hasta el corte del faltante, contra lo que sale hasta ahí.
  let orden: OrdenDePagos | null = null;
  if (proyeccion.primerFaltante) {
    const hasta = proyeccion.primerFaltante.key;
    const idx = proyeccion.cortes.findIndex((c) => c.key === hasta);
    const hastaAqui = proyeccion.cortes.slice(0, idx + 1);
    // Lo libre de hoy ya descuenta TODAS las reservas: las que salen en estos cortes no se vuelven a restar.
    const disponible: TotalesMoneda = { ...proyeccion.libreHoy };
    for (const c of hastaAqui) {
      disponible.CRC = round2(disponible.CRC + c.entraTotal.CRC);
      disponible.USD = round2(disponible.USD + c.entraTotal.USD);
    }
    const claves = new Set(hastaAqui.map((c) => c.key));
    orden = ordenarPagosSiNoAlcanza(proyeccion.salidas.filter((s) => claves.has(s.corteKey)), disponible, crcPorUsd);
  }

  const ultima = revisiones[0];
  const fechaUltima = isoDay(ultima?.fecha);
  return {
    hoyISO,
    tipoDeCambio: tc && crcPorUsd ? { crcPorUsd, fechaISO: tc.fecha } : null,
    cuentas: cuentasDTO,
    proyeccion,
    aparte: {
      vencidos: { totales: entra.vencidos.totales, count: entra.vencidos.cobros.length },
      porFacturar: { totales: entra.porFacturar.totales, count: entra.porFacturar.cobros.length },
      comisionesAtrasadas: aparteComisiones,
    },
    semanas: pagosPorSemana(semana, hoyISO),
    orden,
    compromisos: compromisosDTO,
    revision: {
      hoy: ultima && fechaUltima === hoyISO ? { por: ultima.revisadoPor, en: ultima.revisadoEn.toISOString() } : null,
      ultima: ultima && fechaUltima ? { fechaISO: fechaUltima, por: ultima.revisadoPor } : null,
    },
    comisionistasElDia7: COMISIONISTAS_EL_DIA_7,
    cobrosParaAtar: cobrosAbiertos.map((c) => ({ id: c.id, etiqueta: fmtCobro(c) })),
  };
}

/** Lo mínimo para el aviso diario de Pendientes: sin la proyección entera. */
export interface ResumenDeCaja {
  revisadaHoy: { por: string } | null;
  cuentasSinSaldo: number;
  saldosViejos: number;
  pagosDeLaSemana: { n: number; totales: TotalesMoneda };
  esperando: number;
  libreAlCierreEnUsd: number | null;
  alCierre: TotalesMoneda;
  primerFaltante: { etiqueta: string } | null;
}

export function resumirCaja(c: CajaDTO): ResumenDeCaja {
  const esta = c.semanas[0];
  return {
    revisadaHoy: c.revision.hoy ? { por: c.revision.hoy.por } : null,
    cuentasSinSaldo: c.cuentas.filter((x) => x.saldo === null).length,
    saldosViejos: c.cuentas.filter((x) => x.viejo).length,
    pagosDeLaSemana: { n: esta?.pagos.length ?? 0, totales: esta?.total ?? { CRC: 0, USD: 0 } },
    esperando: esta?.esperando.length ?? 0,
    libreAlCierreEnUsd: c.proyeccion.alCierre.libreEnUsd,
    alCierre: c.proyeccion.alCierre.libre,
    primerFaltante: c.proyeccion.primerFaltante ? { etiqueta: c.proyeccion.primerFaltante.etiqueta } : null,
  };
}
