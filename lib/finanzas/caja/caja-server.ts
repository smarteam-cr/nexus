/**
 * lib/finanzas/caja/caja-server.ts — lee todo lo que necesita «Dónde está la plata» y lo arma. Server-only.
 *
 * ⚠ PRIVACIDAD: lo consume quien tiene «Caja y pagos» en su permiso por persona (María José), que NO es el de salarios.
 * Los salarios (costos recurrentes de categoría Salario) y las comisiones de vendedor salen de acá JUNTOS como «Personal»,
 * una línea por corte y en una sola moneda (lib/finanzas/caja/personal.ts): nunca una línea por moneda ni por día que
 * pueda ser de una sola persona. El `select` no pide el nombre de ningún costo, y lo vigila guardas.test.ts.
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
import { corteDelDia, juntarPersonal, type PartidaDePersonal } from "./personal";

/** Un saldo cargado a mano con más días que esto se marca como viejo: lo que pasó después no está en la cuenta. */
export const DIAS_PARA_SALDO_VIEJO = 3;

export interface CuentaDeBancoDTO {
  id: string;
  nombre: string;
  moneda: "CRC" | "USD";
  origen: "MANUAL" | "MERCURY";
  /** La sociedad de la lista oficial: su id y su nombre. */
  sociedadId: string | null;
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
  sociedadId: string | null;
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
  /** Las sociedades de la lista oficial (lib/sociedades), para elegir la de una cuenta o un pago. */
  sociedades: Array<{ id: string; nombre: string }>;
}

const num = (d: unknown): number => Number(d);
const isoDay = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);
const round2 = (n: number) => Math.round(n * 100) / 100;
const diasEntre = (desdeISO: string, hastaISO: string) =>
  Math.round((Date.parse(`${hastaISO}T00:00:00Z`) - Date.parse(`${desdeISO}T00:00:00Z`)) / 86_400_000);

/** Los recurrentes que no son salario. Los salarios van por «Personal» (personal.ts), junto con las comisiones. */
const RUBRO_DE_COSTO: Record<Exclude<CostoProyeccionInput["categoria"], "SALARIO">, "HERRAMIENTAS" | "FIJOS"> = {
  HERRAMIENTA: "HERRAMIENTAS",
  FIJO_OPERACION: "FIJOS",
};

/** El concepto de la línea de personal: no dice cuántas personas hay, ni nombra a ninguna. */
export const CONCEPTO_DE_PERSONAL = "Personal (planilla y comisiones de vendedor)";

function rubroDeCategoria(c: CategoriaDePago): RubroSale {
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
  const [entra, filasCostos, filasGastos, comisionesAliado, comisionesVendedor, tc, cuentas, compromisos, revisiones, cobrosAbiertos, sociedades] =
    await Promise.all([
      loadProyeccion(hoyISO),
      /* ⚠ Sin `nombre`: los salarios salen sumados y nunca con el nombre de la persona. El id de la persona solo sirve
         para contar a cuántas junta la línea de personal; no viaja. */
      prisma.costoRecurrente.findMany({
        where: { activo: true },
        select: { id: true, categoria: true, monto: true, moneda: true, frecuencia: true, activo: true, finalizadoEl: true, teamMemberId: true },
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
        include: { saldos: { orderBy: { fecha: "desc" }, take: 1 }, sociedad: { select: { nombre: true } } },
      }),
      prisma.pagoComprometido.findMany({
        where: { OR: [{ estado: "PENDIENTE" }, { estado: "PAGADO", pagadoEl: { gte: new Date(hoy.getTime() - 30 * 86_400_000) } }] },
        orderBy: [{ createdAt: "desc" }],
        include: {
          sociedad: { select: { nombre: true } },
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
      prisma.sociedadPropia.findMany({ where: { activa: true }, orderBy: [{ orden: "asc" }, { nombre: "asc" }], select: { id: true, nombre: true } }),
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

  // ── Personal: los salarios de cada corte y las comisiones de vendedor del corte en que se pagan, juntos ──
  const personaDelCosto = new Map(filasCostos.map((c) => [c.id, c.teamMemberId ?? `costo:${c.id}`]));
  const partidasDePersonal: PartidaDePersonal[] = [];
  for (const b of sale.buckets) {
    for (const k of b.costos) {
      if (k.categoria === "SALARIO") partidasDePersonal.push({ corteKey: b.key, persona: personaDelCosto.get(k.costoId) ?? k.costoId, moneda: k.moneda, monto: k.monto });
    }
  }
  for (const d of comisionesVendedor.devengadas) {
    if (d.moneda !== "CRC" && d.moneda !== "USD") continue;
    // Lo atrasado se debe ya: cae en el primer corte. Lo que cae después del último corte no entra (como todo lo fechado).
    const corte = corteDelDia(entra.buckets, d.fechaPago);
    if (corte) partidasDePersonal.push({ corteKey: corte.key, persona: d.teamMemberId, moneda: d.moneda, monto: d.monto });
  }
  const personal = juntarPersonal(partidasDePersonal, crcPorUsd);

  const cortes: EntradaDeProyeccion["cortes"] = entra.buckets.map((b) => ({
    key: b.key,
    etiqueta: b.etiqueta,
    granularidad: b.granularidad,
    desdeISO: b.desdeISO,
    hastaISO: b.hastaISO,
    cobros: b.totales,
    costos: [
      ...personal.filter((p) => p.corteKey === b.key).map((p) => ({ rubro: "PLANILLA" as const, moneda: p.moneda, monto: p.monto })),
      ...(costosPorKey.get(b.key)?.costos ?? []).flatMap((k) =>
        k.categoria === "SALARIO" ? [] : [{ rubro: RUBRO_DE_COSTO[k.categoria], moneda: k.moneda, monto: k.monto }],
      ),
    ],
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

  // Las comisiones de vendedor ya van en «Personal», con la planilla del corte en que se pagan (arriba): una línea propia
  // por día y moneda podía ser la comisión de una sola persona.

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
      sociedadId: c.sociedadId,
      sociedad: c.sociedad?.nombre ?? null,
      nota: c.nota,
      registradoPor: c.registradoPor,
      proximaCuota,
    });
  }

  // Personal de cada quincena, en su día (el 15 y el último del mes): la planilla y las comisiones de esa quincena, juntas.
  for (const b of entra.buckets) {
    if (b.granularidad !== "quincena") continue;
    for (const p of personal) {
      if (p.corteKey !== b.key) continue;
      semana.push({
        clave: `personal:${b.key}:${p.moneda}`, concepto: `${CONCEPTO_DE_PERSONAL} · ${b.etiqueta}`, beneficiario: null, tipo: "Personal", monto: p.monto, moneda: p.moneda,
        fechaISO: b.hastaISO, fechaEstimadaISO: b.hastaISO < hoyISO ? hoyISO : b.hastaISO, estado: "PROGRAMADO", atrasado: false,
        porQue:
          "La mitad del costo mensual de los salarios (estimado de los recurrentes) más las comisiones de vendedor de la quincena, el 15 y el último día del mes. " +
          "Va en una sola moneda, con lo de la otra al tipo de cambio: así no se lee el salario ni la comisión de nadie.",
        compromisoId: null, parte: null,
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
      sociedadId: c.sociedadId,
      sociedad: c.sociedad?.nombre ?? null,
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
    sociedades,
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
