/**
 * lib/cobranza/odoo/numero-propuesta.ts
 *
 * Qué número de factura le corresponde a cada cobro, propuesto desde el libro de Alex. PURO: sin
 * Prisma, sin red, sin reloj (el día llega como argumento). La consulta vive en
 * lib/cobranza/libro-alex-server.ts.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * Desde la etapa 7 la factura nace con número, pero 144 cobros se facturaron antes y ninguno lo tiene.
 * Anotarlos uno por uno desde «Agregar número» obliga a Alex a buscar cada documento a mano, cuando su
 * libro ya dice qué factura es de qué mes. Acá se cruza: el NÚMERO y el MES del libro llevan a la
 * cuenta (por el cliente de Odoo, o por el nombre) y de ahí a la cuota. Las cuotas se reparten con la
 * misma regla que la comparación (`asignarCuotas`), así las dos pestañas no se contradicen.
 *
 * ⭐ Manda el libro; el espejo solo verifica (choque 3 del plan). Una factura que el espejo todavía no
 * trae (las de septiembre) se propone igual, con el aviso.
 *
 * Para las cuotas facturadas que el libro no nombra: la factura del espejo con el MISMO monto y la fecha
 * más cercana, una por cuota y nunca la misma para dos. Nunca un número que el libro sí tiene: si el
 * libro no lo ató a una cuota, el espejo no lo va a atar a otra.
 *
 * ⛔ Nada de acá escribe. «Es esta» manda `patch` al PATCH del cobro, que firma con el email de quien
 * confirma (numero-factura.ts). Y `patch` no tiene lugar para un estado ni una fecha de cobro: anotar el
 * número de una factura no dice nada de si se cobró.
 */
import {
  NO_SON_CARTERA,
  agruparDocumentos,
  asignarCuotas,
  centavos,
  documentoSinCobro,
  esFactura,
  fmtMontoLibro,
  indexarContexto,
  motivoNoCartera,
  netoDelDocumento,
  nombreDelPeriodo,
  pedidoDeCuotas,
  resolverCuenta,
  type CobroParaLibro,
  type ContextoLibro,
  type DocumentoLibro,
  type FacturaParaLibro,
  type NetoDelDocumento,
} from "../libro-alex";
import type { FilaLibro } from "../libro-alex-lectura";
import { esDocumentoVivo } from "./diferencias";

/** Cuántos días puede haber entre la factura del espejo y la fecha de emisión que tiene la cuota. */
export const DIAS_DE_VENTANA_DEL_ESPEJO = 60;

/** LIBRO = el número y el mes del libro · ESPEJO = una cuota que el libro no nombra, por monto y fecha. */
export type OrigenDeNumero = "LIBRO" | "ESPEJO";

/** Lo que «Es esta» manda al PATCH del cobro. El tipo no deja lugar para un estado. */
export type PatchDeNumero = { numeroFactura: string; fechaEmision?: string };

export type OpcionDeNumero = {
  numero: string;
  origen: OrigenDeNumero;
  /** `YYYY-MM-DD`, la del documento según el libro o el espejo. */
  fechaFactura: string | null;
  /** Neto, o el total del libro si el neto no se sabe. */
  montoFactura: number | null;
  moneda: string;
  enEspejo: boolean;
  /** Cuántas cuotas cubre esta factura en la propuesta: 3 en ALMOTEC, 1 casi siempre. */
  cuotas: number;
  /** De dónde sale, en una línea. */
  detalle: string;
  patch: PatchDeNumero;
};

export type CuotaParaNumerar = {
  cobroId: string;
  cuentaId: string;
  cuentaNombre: string;
  servicio: string;
  periodo: string;
  fechaProgramada: string;
  monto: number;
  moneda: string;
  estado: string;
  fechaEmision: string | null;
  numCuota: number | null;
  sinNumeroFacturaMotivo: string | null;
  opcion: OpcionDeNumero;
};

export type DocumentoSinCuota = { numero: string; cliente: string; periodo: string | null; motivo: string };

export type NumerosDelLibro = {
  cuotas: CuotaParaNumerar[];
  /** Documentos del libro con número a los que no se les encontró cuota, con el porqué. */
  sinCuota: DocumentoSinCuota[];
  /** Documentos del libro cuyo número ya está anotado en un cobro. */
  yaAnotados: number;
};

/** La fecha de emisión pasa a ser la del documento, igual que al elegirlo en «Marcar facturado». */
function patchPara(c: CobroParaLibro, numero: string, fechaFactura: string | null): PatchDeNumero {
  return fechaFactura && fechaFactura !== c.fechaEmision ? { numeroFactura: numero, fechaEmision: fechaFactura } : { numeroFactura: numero };
}

const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000;

export function proponerNumeros(filas: readonly FilaLibro[], ctx: ContextoLibro, hoyISO: string): NumerosDelLibro {
  const idx = indexarContexto(ctx);
  /* Un número ya anotado no se vuelve a proponer: ni en otra cuenta (el chokepoint lo frenaría con un
     409) ni en la misma (sería asignar dos veces una de las nueve facturas iguales de PUBLIMARK). */
  const tomados = new Set(ctx.cobros.flatMap((c) => (c.numeroFactura ? [c.numeroFactura] : [])));
  const opciones = new Map<string, OpcionDeNumero>();
  const sinCuota: DocumentoSinCuota[] = [];
  let yaAnotados = 0;

  const documentos = agruparDocumentos(filas).filter((d) => esFactura(d.principal) && d.principal.numero);
  const numerosDelLibro = new Set(documentos.flatMap((d) => (d.principal.numero ? [d.principal.numero] : [])));
  const aRepartir: Array<{ doc: DocumentoLibro; numero: string; cuentaNombre: string; cuentaId: string; neto: NetoDelDocumento }> = [];

  for (const doc of documentos) {
    const f = doc.principal;
    const numero = f.numero;
    if (!numero) continue;
    const dejar = (motivo: string) => sinCuota.push({ numero, cliente: f.cliente, periodo: f.periodo, motivo });

    if (tomados.has(numero)) {
      yaAnotados += 1;
      continue;
    }
    const noCartera = motivoNoCartera(doc, idx);
    if (noCartera) {
      dejar(noCartera.texto);
      continue;
    }
    const sinCobro = documentoSinCobro(doc, idx);
    if (sinCobro) {
      dejar(sinCobro === "NOTA_DE_CREDITO" ? "Es una nota de crédito: no es el número de un cobro." : "Odoo la tiene anulada o revertida.");
      continue;
    }
    if (f.fechaFactura && f.fechaFactura > hoyISO) {
      dejar("La factura tiene fecha futura: se anota cuando se emita.");
      continue;
    }
    const res = resolverCuenta(doc, idx);
    if (res.tipo !== "una" || res.cuenta.via === "SIGLAS") {
      dejar(
        res.tipo === "sin-emparejar"
          ? `El cliente de Odoo «${res.clienteDeOdoo}» no está emparejado con ninguna cuenta.`
          : res.tipo === "varias"
            ? "Hay varias cuentas que pueden ser esta: se decide en «Fila por fila»."
            : res.tipo === "una"
              ? `La cuenta «${res.cuenta.nombre}» sale solo por las siglas: confírmala en «Fila por fila».`
              : "No hay una cuenta de Nexus con este nombre.",
      );
      continue;
    }
    aRepartir.push({ doc, numero, cuentaNombre: res.cuenta.nombre, cuentaId: res.cuenta.cuentaId, neto: netoDelDocumento(doc, res.cuenta.cuentaId, idx) });
  }

  /* Sin el paso de «la única cuota del mes»: acá no se muestra una diferencia, se propone un número, y
     proponerlo con un monto que no da sería adivinar. */
  const { asignadas } = asignarCuotas(
    aRepartir.map((x) => pedidoDeCuotas(x.doc, x.cuentaId, x.neto)),
    idx,
    { porNumero: false, unicaDelMes: false },
  );
  const usadosPorElLibro = new Set<string>();
  for (const { doc, numero, cuentaNombre, neto } of aRepartir) {
    const f = doc.principal;
    const objetivo = neto.monto ?? f.total;
    const asignada = asignadas.get(doc.clave);
    if (!asignada) {
      sinCuota.push({
        numero,
        cliente: f.cliente,
        periodo: f.periodo,
        motivo: `${cuentaNombre} no tiene una cuota sin número de ${nombreDelPeriodo(f.periodo)} por ${fmtMontoLibro(objetivo, f.moneda)}${
          neto.monto === null ? "" : " neto"
        }.`,
      });
      continue;
    }
    usadosPorElLibro.add(numero);
    const fuente = doc.fuentes.find((x) => x.seccion !== "COMPENDIO") ?? f;
    for (const c of asignada.cobros) {
      opciones.set(c.id, {
        numero,
        origen: "LIBRO",
        fechaFactura: f.fechaFactura,
        montoFactura: objetivo,
        moneda: c.moneda,
        enEspejo: idx.facturaPorNumero.has(numero),
        cuotas: asignada.cobros.length,
        detalle: `«${fuente.hoja}» fila ${fuente.fila}, ${nombreDelPeriodo(f.periodo)}`,
        patch: patchPara(c, numero, f.fechaFactura),
      });
    }
  }

  /* Las cuotas facturadas que el libro no nombró: el espejo, con el mismo monto y la fecha más cercana. */
  const partnersPorCuenta = new Map<string, Set<number>>();
  for (const v of ctx.vinculos) {
    if (v.cuentaId) partnersPorCuenta.set(v.cuentaId, (partnersPorCuenta.get(v.cuentaId) ?? new Set()).add(v.odooPartnerId));
  }
  const pares: Array<{ cobro: CobroParaLibro; factura: FacturaParaLibro; distancia: number }> = [];
  for (const c of ctx.cobros) {
    if (opciones.has(c.id) || c.numeroFactura || !c.fechaEmision || c.estado === "SIN_DATO") continue;
    if (idx.cuentaPorId.get(c.cuentaId)?.viaCobro !== "ODOO") continue;
    const partners = partnersPorCuenta.get(c.cuentaId);
    if (!partners?.size) continue;
    for (const fa of ctx.facturas) {
      if (!partners.has(fa.odooPartnerId) || fa.moneda !== c.moneda || !esDocumentoVivo(fa)) continue;
      if (tomados.has(fa.numero) || numerosDelLibro.has(fa.numero) || usadosPorElLibro.has(fa.numero) || NO_SON_CARTERA.has(fa.numero)) continue;
      if (centavos(fa.montoNeto) !== centavos(c.monto)) continue;
      const distancia = dias(fa.invoiceDate, c.fechaEmision);
      if (distancia <= DIAS_DE_VENTANA_DEL_ESPEJO) pares.push({ cobro: c, factura: fa, distancia });
    }
  }
  pares.sort((a, b) => a.distancia - b.distancia || a.factura.odooMoveId - b.factura.odooMoveId || a.cobro.id.localeCompare(b.cobro.id));
  const facturasOfrecidas = new Set<string>();
  for (const { cobro, factura, distancia } of pares) {
    if (opciones.has(cobro.id) || facturasOfrecidas.has(factura.numero)) continue;
    facturasOfrecidas.add(factura.numero);
    opciones.set(cobro.id, {
      numero: factura.numero,
      origen: "ESPEJO",
      fechaFactura: factura.invoiceDate,
      montoFactura: factura.montoNeto,
      moneda: factura.moneda,
      enEspejo: true,
      cuotas: 1,
      detalle: `No está en el libro: del espejo de Odoo (${factura.odooPartnerNombre}), a ${Math.round(distancia)} días de la fecha de emisión de la cuota`,
      patch: patchPara(cobro, factura.numero, factura.invoiceDate),
    });
  }

  const cuotas: CuotaParaNumerar[] = ctx.cobros.flatMap((c) => {
    const opcion = opciones.get(c.id);
    if (!opcion) return [];
    return [
      {
        cobroId: c.id,
        cuentaId: c.cuentaId,
        cuentaNombre: idx.cuentaPorId.get(c.cuentaId)?.nombre ?? c.cuentaId,
        servicio: c.servicio,
        periodo: c.periodo,
        fechaProgramada: c.fechaProgramada,
        monto: c.monto,
        moneda: c.moneda,
        estado: c.estado,
        fechaEmision: c.fechaEmision,
        numCuota: c.numCuota,
        sinNumeroFacturaMotivo: c.sinNumeroFacturaMotivo,
        opcion,
      },
    ];
  });
  cuotas.sort(
    (a, b) =>
      Number(a.opcion.origen === "ESPEJO") - Number(b.opcion.origen === "ESPEJO") ||
      a.cuentaNombre.localeCompare(b.cuentaNombre) ||
      a.periodo.localeCompare(b.periodo) ||
      a.fechaProgramada.localeCompare(b.fechaProgramada),
  );
  return { cuotas, sinCuota, yaAnotados };
}
