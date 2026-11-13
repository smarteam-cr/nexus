/**
 * lib/ventas/ventas-sin-cobro.ts — los negocios ganados que no tienen cobro, uno por uno y con su responsable
 * (2026-11-13). PURO: sin Prisma, sin red, sin reloj.
 *
 * ── QUÉ ES «SIN COBRO» ──────────────────────────────────────────────────────────
 * Lo MISMO que la línea «Ventas ganadas que no están en cobranza» de Finanzas (VENTAS_SIN_COBRANZA,
 * lib/finanzas/inconsistencias.ts): una venta del año, de un pipeline que cuenta, no descartada, con parte de su monto sin
 * respaldo (`descubierto > 0`). El respaldo se mide por MONTO con `clasificarVentas`: primero lo facturado del cliente en
 * el año, después las cuotas cargadas que todavía no se facturan. Una venta cuyo cobro ya está cargado en cuotas deja de
 * ser pendiente: está en cobranza, y desde ahí la persigue la cola de siempre.
 *
 * ⚠ La cuenta de lo facturado por cliente repite, paso por paso, la de `armarEstadoParaAuditar` (lib/cobranza/queries.ts)
 * con las mismas funciones puras (`tipoIngresoDeCobro`, `sumarPorClienteEnPresentacion`, `convertir`, `clasificarVentas`).
 * No se llama al reporte anual porque ese carga también la planilla y los salarios, y «Para ti» de quien cobra no tiene por
 * qué leerlos. Si una de las dos cambia de regla, cambia la otra: la prueba `ventas-sin-cobro.test.ts` fija los bordes.
 *
 * ── HASTA CUÁNDO ────────────────────────────────────────────────────────────────
 * Hasta que el cobro quede cargado (sale sola de la lista) o alguien la descarte con una razón (`excluida` +
 * `excluidaMotivo`, con quién y cuándo).
 */
import { clasificarVentas, type ClaseHueco } from "./clasificar-huecos";
import { convertir, sumarPorClienteEnPresentacion, tipoIngresoDeCobro, type CobroDeCliente, type MonedaEq, type TasaDeMes } from "@/lib/finanzas/equilibrio";
import { responsableDeLaVenta } from "@/lib/cobranza/responsables";

export interface VentaParaRevisar {
  id: string;
  hubspotDealId: string;
  nombre: string;
  /** AAAA-MM-DD. */
  fechaCierre: string;
  monto: number | null;
  moneda: string;
  /** Lo que HubSpot dice que vale en la moneda de la casa. Manda sobre `monto`, como en el reporte. */
  montoConvertidoHubspot: number | null;
  pipelineId: string;
  clientId: string | null;
  clienteNombre: string | null;
  excluida: boolean;
  responsableCobroEmail: string | null;
}

export interface CobroParaRespaldo {
  clientId: string;
  estado: string;
  periodo: string;
  /** AAAA-MM-DD. */
  fechaProgramada: string;
  fechaEmision: string | null;
  fechaCobro: string | null;
  monto: number;
  moneda: MonedaEq;
}

export interface VentaSinCobro {
  id: string;
  hubspotDealId: string;
  nombre: string;
  fechaCierre: string;
  clientId: string | null;
  clienteNombre: string | null;
  /** Lo vendido, en la moneda de presentación. */
  monto: number;
  /** Lo que no tiene respaldo, en la moneda de presentación. */
  descubierto: number;
  clase: Extract<ClaseHueco, "PARCIAL" | "SIN_COBRANZA" | "SIN_CLIENTE">;
  /** El correo de quien la persigue (el suyo o el por defecto). */
  responsable: string;
  /** Lo eligió alguien (false = es el por defecto). */
  reasignada: boolean;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export function ventasSinCobro(input: {
  anio: number;
  hoyISO: string;
  monedaPresentacion: MonedaEq;
  tasas: readonly TasaDeMes[];
  pipelinesQueCuentan: readonly string[];
  ventas: readonly VentaParaRevisar[];
  cobros: readonly CobroParaRespaldo[];
}): VentaSinCobro[] {
  const { anio, hoyISO } = input;
  const tasaDelPeriodo = new Map(input.tasas.map((t) => [t.periodo, t]));
  const ultimaTasa = input.tasas[input.tasas.length - 1] ?? null;
  const programado = new Map<string, number>();
  const cobrosDeCliente: CobroDeCliente[] = [];
  for (const c of input.cobros) {
    const t = tipoIngresoDeCobro(
      { estado: c.estado, periodo: c.periodo, fechaProgramadaISO: c.fechaProgramada, fechaEmisionISO: c.fechaEmision, fechaCobroISO: c.fechaCobro },
      hoyISO,
      { anioDeLaFactura: true },
    );
    if (t.tipo === "PROGRAMADO" && t.periodo >= `${anio}-01`) {
      // Un mes por venir, con la última tasa conocida (la regla del tipo de cambio). Sin tasa no suma: queda descubierta.
      const tasa = tasaDelPeriodo.get(t.periodo) ?? (t.periodo > hoyISO.slice(0, 7) ? ultimaTasa : null);
      const r = convertir(c.monto, c.moneda, input.monedaPresentacion, tasa);
      if (r) programado.set(c.clientId, round2((programado.get(c.clientId) ?? 0) + r.monto));
      continue;
    }
    if (!t.periodo.startsWith(`${anio}-`)) continue;
    cobrosDeCliente.push({ clave: c.clientId, tipo: t.tipo, periodo: t.periodo, monto: c.monto, moneda: c.moneda, concepto: c.clientId });
  }
  const { facturado } = sumarPorClienteEnPresentacion(cobrosDeCliente, { monedaPresentacion: input.monedaPresentacion, tasas: input.tasas });

  const delAnio = input.ventas.filter((v) => v.fechaCierre.startsWith(`${anio}-`));
  const resumen = clasificarVentas(
    delAnio.map((v) => ({
      hubspotDealId: v.hubspotDealId,
      nombre: v.nombre,
      fechaCierre: v.fechaCierre,
      monto: v.montoConvertidoHubspot ?? v.monto,
      pipelineId: v.pipelineId,
      clientId: v.clientId,
      excluida: v.excluida,
      sospechaPrueba: false,
    })),
    [...new Set([...facturado.keys(), ...programado.keys()])].map((clientId) => ({
      clientId,
      facturado: facturado.get(clientId) ?? 0,
      programado: programado.get(clientId) ?? 0,
    })),
    { anio, pipelinesQueCuentan: input.pipelinesQueCuentan },
  );

  const porDeal = new Map(delAnio.map((v) => [v.hubspotDealId, v]));
  return resumen.ventas
    .filter((v) => v.descubierto > 0 && (v.clase === "PARCIAL" || v.clase === "SIN_COBRANZA" || v.clase === "SIN_CLIENTE"))
    .map((v): VentaSinCobro => {
      const cruda = porDeal.get(v.hubspotDealId)!;
      return {
        id: cruda.id,
        hubspotDealId: v.hubspotDealId,
        nombre: v.nombre,
        fechaCierre: v.fechaCierre,
        clientId: v.clientId,
        clienteNombre: cruda.clienteNombre,
        monto: v.monto ?? 0,
        descubierto: v.descubierto,
        clase: v.clase as VentaSinCobro["clase"],
        responsable: responsableDeLaVenta(cruda),
        reasignada: !!cruda.responsableCobroEmail?.trim(),
      };
    })
    .sort((a, b) => b.descubierto - a.descubierto || a.fechaCierre.localeCompare(b.fechaCierre));
}

/** Las de una persona. */
export const deResponsable = (ventas: readonly VentaSinCobro[], email: string): VentaSinCobro[] =>
  ventas.filter((v) => v.responsable === email.trim().toLowerCase());
