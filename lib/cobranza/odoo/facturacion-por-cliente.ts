/**
 * lib/cobranza/odoo/facturacion-por-cliente.ts
 *
 * Cuánto se le facturó y cuánto entró de cada cliente en un año, según la copia de Odoo, al lado de lo que ventas
 * cerró con ese cliente en HubSpot ese mismo año. PURO: sin Prisma, sin red y sin reloj.
 *
 * ── POR QUÉ EXISTE (2026-09-30, punto 8 de la revisión con Alex) ────────────────
 * Marco quiere saber qué plata entró de cada cliente y compararla con lo que ventas cerró, al menos de 2025. La copia
 * de Odoo ya traía todos los años —2021, 2022, 2024, 2025 y 2026; lo viejo vino de Factum—, pero solo se cruzaba con
 * los cobros de Nexus, que empiezan en 2026, así que 2025 no se veía en ninguna pantalla. Esto la muestra por
 * cliente, con la factura más reciente arriba.
 *
 * ── LAS REGLAS ──────────────────────────────────────────────────────────────────
 * - Todo sin IVA y por moneda, sin convertir nunca: una cifra en dólares y otra en colones van lado a lado.
 * - «Facturado»: las facturas vivas del año (`esDocumentoVivo`) menos las notas de crédito del año que no revierten
 *   una factura. ⚠ Una factura revertida (la emitida en la moneda equivocada, por ejemplo) no cuenta, y la nota que
 *   la revirtió tampoco: restarla la contaría dos veces. Esa nota se reconoce por el mismo cliente, la misma moneda y
 *   el mismo total (medido el 2026-09-30: las 22 revertidas de 2026 tienen su nota así, sin ninguna suelta).
 * - «Cobrado»: lo pagado de esas facturas (lo que Odoo ya no da por cobrar) menos la parte APLICADA de esas notas:
 *   una nota aplicada salda una factura sin que entre plata.
 * - «Por cobrar»: la misma regla que «Lo que no cuadra» y «Emparejar» (`estaPorCobrar`, `netoPorCobrar`).
 * - Así, facturado = cobrado + por cobrar − notas sin aplicar, y la fila dice cuánto hay en notas sin aplicar.
 * - El cliente es la cuenta de Nexus si la factura tiene cuenta; si no, el cliente de Odoo, «sin cuenta en Nexus».
 * - «Ventas cerradas»: los tratos ganados en HubSpot con cierre en el año, de los pipelines que cuentan como venta de
 *   la casa y sin excluir —la regla del punto de equilibrio—, de la empresa de esa cuenta. Sin cuenta en Nexus no hay
 *   empresa con qué cruzarlos. ⚠ Es una guía y no un cuadre: una venta cerrada en diciembre se factura en enero.
 * - Orden: la última factura del año, la más reciente arriba.
 */
import { PIPELINES_VENTA_PROPIA } from "@/lib/ventas/pipelines";
import { esDocumentoVivo, estaPorCobrar, montosPorMoneda, netoPorCobrar, type MontoEnMoneda } from "./diferencias";

/** Un documento de la copia de Odoo, como lo lee esta vista. */
export interface DocumentoParaHistorial {
  numero: string;
  moveType: string;
  state: string;
  paymentState: string;
  /** `YYYY-MM-DD`. */
  invoiceDate: string;
  montoNeto: number;
  montoTotal: number;
  montoResidual: number;
  moneda: string;
  odooPartnerId: number;
  odooPartnerNombre: string;
  cuentaId: string | null;
}

export interface CuentaParaHistorial {
  cuentaId: string;
  clientId: string;
  nombre: string;
  /** ODOO, MERCURY u OTRA: dice por dónde factura quien vendió y no tiene facturas de Odoo. */
  viaCobro: string;
}

export interface VentaParaHistorial {
  clientId: string | null;
  clienteNombre: string | null;
  /** `YYYY-MM-DD`. */
  fechaCierre: string;
  monto: number | null;
  moneda: string;
  estado: string;
  excluida: boolean;
  pipelineId: string;
}

export interface VentasDelAnio {
  tratos: number;
  /** Tratos ganados sin monto en HubSpot: se cuentan, no se suman. */
  sinMonto: number;
  montos: MontoEnMoneda[];
}

export interface FilaDeFacturacion {
  /** `cuenta:<id>` o `odoo:<id del cliente de Odoo>`. */
  clave: string;
  nombre: string;
  /** null = ninguna cuenta de Nexus tiene a este cliente de Odoo. */
  cuentaId: string | null;
  /** Las razones sociales de Odoo a las que se facturó, si no son solo el nombre de la fila. */
  clientesDeOdoo: string[];
  facturas: number;
  ultimaFactura: string;
  facturado: MontoEnMoneda[];
  cobrado: MontoEnMoneda[];
  porCobrar: MontoEnMoneda[];
  notasSinAplicar: MontoEnMoneda[];
  /** null = sin cuenta en Nexus: no hay empresa con qué cruzar los tratos. */
  ventas: VentasDelAnio | null;
}

export interface VentasSinFacturas {
  clientId: string;
  nombre: string;
  /** La vía de cobro de su cuenta, o null si la empresa no tiene cuenta de cobro. */
  viaCobro: string | null;
  ventas: VentasDelAnio;
}

export interface FacturacionDelAnio {
  anio: number;
  filas: FilaDeFacturacion[];
  totales: {
    facturas: number;
    facturado: MontoEnMoneda[];
    cobrado: MontoEnMoneda[];
    porCobrar: MontoEnMoneda[];
    notasSinAplicar: MontoEnMoneda[];
    /** Las de las filas con cuenta: lo que se puede comparar con lo facturado. */
    ventas: VentasDelAnio;
  };
  /** Empresas con ventas cerradas en el año y ninguna factura de Odoo ese año: facturan por Mercury, o se les facturó otro año. */
  ventasSinFacturas: VentasSinFacturas[];
  /** Los años con alguna factura viva en la copia, el más nuevo primero. */
  anios: number[];
}

const round2 = (n: number) => Math.round(n * 100) / 100;
const anioDe = (iso: string) => Number(iso.slice(0, 4));
const esNota = (d: Pick<DocumentoParaHistorial, "moveType" | "state" | "paymentState">) =>
  d.moveType === "out_refund" && d.state !== "cancel" && d.paymentState !== "reversed";

/** La parte de una nota de crédito que ya se aplicó a una factura, sin IVA. */
function netoAplicado(n: Pick<DocumentoParaHistorial, "montoNeto" | "montoTotal" | "montoResidual">): number {
  if (n.montoTotal <= 0) return 0;
  const aplicado = (n.montoNeto * (n.montoTotal - n.montoResidual)) / n.montoTotal;
  return round2(Math.min(n.montoNeto, Math.max(0, aplicado)));
}

/**
 * Las notas de crédito que revierten una factura revertida: mismo cliente, misma moneda y mismo total. Cada nota
 * revierte UNA factura, y se prefiere la del mismo día o la siguiente más cercana.
 */
export function notasDeReversion(documentos: readonly DocumentoParaHistorial[]): Set<string> {
  const revertidas = documentos
    .filter((d) => d.moveType === "out_invoice" && d.paymentState === "reversed")
    .sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.numero.localeCompare(b.numero));
  const notas = documentos.filter(esNota).sort((a, b) => a.invoiceDate.localeCompare(b.invoiceDate) || a.numero.localeCompare(b.numero));
  const usadas = new Set<string>();
  for (const f of revertidas) {
    const candidatas = notas.filter(
      (n) => !usadas.has(n.numero) && n.odooPartnerId === f.odooPartnerId && n.moneda === f.moneda && round2(n.montoTotal) === round2(f.montoTotal),
    );
    const nota = candidatas.find((n) => n.invoiceDate >= f.invoiceDate) ?? candidatas[0];
    if (nota) usadas.add(nota.numero);
  }
  return usadas;
}

/** Suma los tratos que cuentan: ganados, sin excluir, de un pipeline de venta propia. */
function sumarVentas(ventas: readonly VentaParaHistorial[]): VentasDelAnio {
  return {
    tratos: ventas.length,
    sinMonto: ventas.filter((v) => v.monto === null).length,
    montos: montosPorMoneda(ventas.flatMap((v) => (v.monto === null ? [] : [{ monto: v.monto, moneda: v.moneda }]))),
  };
}

export function ventaCuenta(v: VentaParaHistorial, anio: number): boolean {
  return v.estado === "GANADA" && !v.excluida && PIPELINES_VENTA_PROPIA.includes(v.pipelineId) && anioDe(v.fechaCierre) === anio;
}

export function facturacionPorCliente(
  documentos: readonly DocumentoParaHistorial[],
  cuentas: readonly CuentaParaHistorial[],
  ventas: readonly VentaParaHistorial[],
  anio: number,
): FacturacionDelAnio {
  const cuentaPorId = new Map(cuentas.map((c) => [c.cuentaId, c]));
  const cuentaPorCliente = new Map(cuentas.map((c) => [c.clientId, c]));
  const deReversion = notasDeReversion(documentos);
  const anios = [...new Set(documentos.filter(esDocumentoVivo).map((d) => anioDe(d.invoiceDate)))]
    .filter(Number.isFinite)
    .sort((a, b) => b - a);

  type Acumulado = {
    clave: string;
    nombre: string;
    cuentaId: string | null;
    clientesDeOdoo: Set<string>;
    facturas: number;
    ultimaFactura: string;
    facturado: Array<{ monto: number; moneda: string }>;
    cobrado: Array<{ monto: number; moneda: string }>;
    porCobrar: Array<{ monto: number; moneda: string }>;
    notasSinAplicar: Array<{ monto: number; moneda: string }>;
  };
  const filas = new Map<string, Acumulado>();
  const filaDe = (d: DocumentoParaHistorial): Acumulado => {
    /* Una factura con cuenta que ya no existe se queda con su cliente de Odoo: no se inventa una empresa. */
    const cuenta = d.cuentaId ? cuentaPorId.get(d.cuentaId) : undefined;
    const clave = cuenta ? `cuenta:${cuenta.cuentaId}` : `odoo:${d.odooPartnerId}`;
    const ya = filas.get(clave);
    if (ya) return ya;
    const nueva: Acumulado = {
      clave,
      nombre: cuenta?.nombre ?? d.odooPartnerNombre,
      cuentaId: cuenta?.cuentaId ?? null,
      clientesDeOdoo: new Set(),
      facturas: 0,
      ultimaFactura: "",
      facturado: [],
      cobrado: [],
      porCobrar: [],
      notasSinAplicar: [],
    };
    filas.set(clave, nueva);
    return nueva;
  };

  for (const d of documentos) {
    if (anioDe(d.invoiceDate) !== anio) continue;
    if (esDocumentoVivo(d)) {
      const f = filaDe(d);
      const pendiente = estaPorCobrar(d) ? netoPorCobrar(d) : 0;
      f.clientesDeOdoo.add(d.odooPartnerNombre);
      f.facturas++;
      if (d.invoiceDate > f.ultimaFactura) f.ultimaFactura = d.invoiceDate;
      f.facturado.push({ monto: d.montoNeto, moneda: d.moneda });
      f.cobrado.push({ monto: round2(d.montoNeto - pendiente), moneda: d.moneda });
      if (pendiente > 0) f.porCobrar.push({ monto: pendiente, moneda: d.moneda });
    } else if (esNota(d) && !deReversion.has(d.numero)) {
      const f = filaDe(d);
      const aplicado = netoAplicado(d);
      f.clientesDeOdoo.add(d.odooPartnerNombre);
      f.facturado.push({ monto: -d.montoNeto, moneda: d.moneda });
      if (aplicado > 0) f.cobrado.push({ monto: -aplicado, moneda: d.moneda });
      if (d.montoNeto - aplicado > 0) f.notasSinAplicar.push({ monto: round2(d.montoNeto - aplicado), moneda: d.moneda });
    }
  }

  /* Los tratos del año que cuentan, por empresa. */
  const contadas = ventas.filter((v) => v.clientId !== null && ventaCuenta(v, anio));
  const ventasPorCliente = new Map<string, VentaParaHistorial[]>();
  for (const v of contadas) ventasPorCliente.set(v.clientId!, [...(ventasPorCliente.get(v.clientId!) ?? []), v]);

  /* ⚠ Una fila que solo tiene notas (sin facturas del año) no es un cliente al que se le facturó: queda fuera de la
     lista y de los totales. Pasa con una nota de enero que corrige una factura de diciembre. */
  const conFacturas = [...filas.values()].filter((f) => f.facturas > 0);
  const listas: FilaDeFacturacion[] = conFacturas
    .map((f) => {
      const cuenta = f.cuentaId ? cuentaPorId.get(f.cuentaId) : undefined;
      const suyas = cuenta ? ventasPorCliente.get(cuenta.clientId) ?? [] : null;
      return {
        clave: f.clave,
        nombre: f.nombre,
        cuentaId: f.cuentaId,
        clientesDeOdoo: [...f.clientesDeOdoo].filter((n) => n !== f.nombre).sort((a, b) => a.localeCompare(b, "es")),
        facturas: f.facturas,
        ultimaFactura: f.ultimaFactura,
        facturado: montosPorMoneda(f.facturado),
        cobrado: montosPorMoneda(f.cobrado),
        porCobrar: montosPorMoneda(f.porCobrar),
        notasSinAplicar: montosPorMoneda(f.notasSinAplicar),
        ventas: suyas === null ? null : sumarVentas(suyas),
      };
    })
    .sort((a, b) => b.ultimaFactura.localeCompare(a.ultimaFactura) || a.nombre.localeCompare(b.nombre, "es"));

  const clientesConFila = new Set(listas.flatMap((f) => (f.cuentaId ? [cuentaPorId.get(f.cuentaId)!.clientId] : [])));
  const ventasSinFacturas: VentasSinFacturas[] = [...ventasPorCliente]
    .filter(([clientId]) => !clientesConFila.has(clientId))
    .map(([clientId, vs]) => ({
      clientId,
      nombre: cuentaPorCliente.get(clientId)?.nombre ?? vs[0]?.clienteNombre ?? clientId,
      viaCobro: cuentaPorCliente.get(clientId)?.viaCobro ?? null,
      ventas: sumarVentas(vs),
    }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  const juntar = (clave: "facturado" | "cobrado" | "porCobrar" | "notasSinAplicar") => montosPorMoneda(listas.flatMap((f) => f[clave]));
  return {
    anio,
    filas: listas,
    totales: {
      facturas: listas.reduce((n, f) => n + f.facturas, 0),
      facturado: juntar("facturado"),
      cobrado: juntar("cobrado"),
      porCobrar: juntar("porCobrar"),
      notasSinAplicar: juntar("notasSinAplicar"),
      ventas: sumarVentas(listas.flatMap((f) => (f.cuentaId && f.ventas ? ventasPorCliente.get(cuentaPorId.get(f.cuentaId)!.clientId) ?? [] : []))),
    },
    ventasSinFacturas,
    anios,
  };
}
