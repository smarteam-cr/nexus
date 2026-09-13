/**
 * lib/finanzas/excel-vs-odoo.ts
 *
 * El último Excel de cobranza de Alex contra la copia de Odoo, factura por factura, en el mismo formato de
 * «lo que no cuadra» del reporte de equilibrio (inconsistencias.ts). Es lo que leen Alex (cobranza) y Marco
 * (dirección) en /finanzas/excel-vs-odoo.
 *
 * PURO: cero Prisma, cero red, cero reloj. Entran las filas del Excel ya leídas (libro-alex-lectura.ts) y
 * las facturas de la copia de Odoo; sale la lista. La carga vive en excel-vs-odoo-server.ts.
 *
 * ── QUÉ SE COMPARA Y QUÉ NO ────────────────────────────────────────────────────
 * Solo los documentos de Odoo del Excel (`esDeOdoo`): las pestañas por mes de Odoo, «Hoja 9» y lo que el
 * Compendio marca «Odoo». Mercury, QuickBooks, No inscritos y los planes de pago no pasan por Odoo: no hay
 * contra qué mirarlos, así que van contados en una nota al pie y no como inconsistencia. INV-26 e INV-27
 * (Insider) no son cartera (`NO_SON_CARTERA`) y no cuentan en ningún lado.
 *
 * ── ⛔ TRES TRAMPAS MEDIDAS EN EL EXCEL REAL ────────────────────────────────────
 * 1. «Importe pendiente firmado» viene en COLONES aunque la fila diga USD (FAC/2026/0206: 2.109,71 USD de
 *    total y 1.050.044,86 de pendiente). No se lee nunca: se compara «Total en moneda» (`FilaLibro.total`)
 *    contra `montoTotal` de Odoo, los dos con impuesto y en la moneda del documento.
 * 2. Nunca se suma CRC con USD. Cada punto sale partido en una línea por moneda (`Inconsistencia.moneda`) y
 *    lo pendiente se resume por moneda. Tampoco se ordena una moneda contra la otra: ₡13 millones no es
 *    «más plata» que $15.000.
 * 3. Los colores se contradicen entre pestañas (11 facturas pasan de «vencida» a «en gracia»): si está
 *    pagada lo dice la columna de estado (`estadoDelDocumento`), nunca el color.
 *
 * Lo que NO hace: decir cuál de los dos tiene razón. Cada línea dice qué mirar y quién lo cierra; cuando se
 * corrige el Excel (y se sube de nuevo) o Odoo, la línea desaparece sola.
 */
import {
  NO_SON_CARTERA,
  agruparDocumentos,
  centavos,
  esDeOdoo,
  estadoDelDocumento,
  fmtMontoLibro,
  nombreDelPeriodo,
} from "@/lib/cobranza/libro-alex";
import type { EstadoLibro, FilaLibro, SeccionLibro } from "@/lib/cobranza/libro-alex-lectura";
import { normalizarNumeroFactura } from "@/lib/cobranza/numero-factura";
import { esDocumentoVivo } from "@/lib/cobranza/odoo/diferencias";
import { montoConSigno } from "@/lib/cobranza/odoo/espejo";
import { claveSociedad } from "@/lib/cobranza/sociedades";
import type { Inconsistencia, ItemInconsistencia, QuienResuelve, Severidad } from "./inconsistencias";

/* ── Entrada ────────────────────────────────────────────────────────────────────── */

/** Una factura (o nota de crédito) de la copia de Odoo, tal como la necesita el cruce. */
export type FacturaDelEspejo = {
  numero: string;
  /** out_invoice | out_refund */
  moveType: string;
  /** posted | cancel */
  state: string;
  /** paid | in_payment | not_paid | partial | reversed */
  paymentState: string;
  moneda: string;
  /** Con impuesto, en la moneda del documento, positivo también en una nota de crédito. */
  montoTotal: number;
  /** Lo que falta pagar, en la moneda del documento. Solo se usa en un pago parcial. */
  montoResidual: number;
  odooPartnerId: number;
  odooPartnerNombre: string;
  /** `YYYY-MM-DD` */
  invoiceDate: string;
  /** DESAPARECIDA = Odoo la tuvo y ya no la devuelve (la fila nunca se borra). */
  estadoEspejo: "VIGENTE" | "DESAPARECIDA";
};

export type EntradaExcelVsOdoo = {
  filas: readonly FilaLibro[];
  facturas: readonly FacturaDelEspejo[];
  /** Día (Costa Rica, `YYYY-MM-DD`) en que se subió el Excel: una factura de Odoo posterior no puede estar en él. */
  excelDelDia: string;
  /** Día (Costa Rica) de la última copia buena de Odoo. null = nunca hubo una. */
  odooDelDia: string | null;
  /** El año cuyas facturas de Odoo el Excel tiene que listar. */
  anio: number;
};

/* ── Salida ─────────────────────────────────────────────────────────────────────── */

export type PendienteEnMoneda = {
  moneda: string;
  /** Facturas que están en los dos y tocan esta moneda de un lado o del otro. */
  facturas: number;
  /** Suma del total de las que el Excel da sin pagar (o activas). */
  segunExcel: number;
  /** Lo que Odoo deja por cobrar: el total sin pago, lo que falta de un pago parcial. */
  segunOdoo: number;
};

export type NoComparado = {
  /** Documentos que no pasan por Odoo, por sección, de mayor a menor. */
  fueraDeOdoo: Array<{ seccion: SeccionLibro; cuantos: number }>;
  /** Documentos de Odoo del Excel sin número, sin total o sin moneda: no hay qué comparar. */
  incompletos: number;
  /** Facturas de Odoo del año emitidas DESPUÉS de subir el Excel: entran cuando se suba uno nuevo. */
  posterioresAlExcel: number;
};

export type ExcelVsOdoo = {
  /** Documentos de Odoo del Excel que se compararon. */
  comparados: number;
  inconsistencias: Inconsistencia[];
  /** Una por moneda, dólares primero. */
  pendiente: PendienteEnMoneda[];
  noComparado: NoComparado;
};

/* ── Reglas ─────────────────────────────────────────────────────────────────────── */

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Dólares primero, colones después: es el orden en que Alex lee el Excel. Nunca por monto. */
const ordenDeMoneda = (m: string) => (m === "USD" ? 0 : m === "CRC" ? 1 : 2);
const EN_MONEDA: Record<string, string> = { USD: "en dólares", CRC: "en colones" };
const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/**
 * ¿Odoo la tiene y vale? Vigente en la copia, no anulada y no revertida. Una factura sigue la regla de la
 * casa (`esDocumentoVivo`); una nota de crédito vale igual mientras no esté anulada.
 */
export function vigenteEnOdoo(f: FacturaDelEspejo): boolean {
  if (f.estadoEspejo !== "VIGENTE") return false;
  if (f.moveType === "out_refund") return f.state !== "cancel" && f.paymentState !== "reversed";
  return esDocumentoVivo(f);
}

/** Una nota de crédito que Odoo tiene vigente y sin aplicar a ninguna factura: un saldo a favor del cliente. */
function esNotaSinAplicar(f: FacturaDelEspejo): boolean {
  return f.moveType === "out_refund" && f.estadoEspejo === "VIGENTE" && f.state !== "cancel" && f.paymentState === "not_paid";
}

/** Lo que Odoo deja por cobrar de una factura. Registrado sin conciliar (in_payment) ya no es deuda. */
function pendienteEnOdoo(f: FacturaDelEspejo): number {
  if (f.moveType !== "out_invoice" || !vigenteEnOdoo(f)) return 0;
  if (f.paymentState === "not_paid") return f.montoTotal;
  if (f.paymentState === "partial") return f.montoResidual;
  return 0;
}

const DEL_EXCEL: Record<EstadoLibro, string> = {
  PAGADO: "el Excel la da pagada",
  SIN_PAGAR: "el Excel la da sin pagar",
  ACTIVA: "el Excel la da activa, sin vencer",
};

const PAGO_EN_ODOO: Record<string, string> = {
  paid: "pagada y conciliada con el banco",
  in_payment: "pago registrado, sin conciliar con el banco",
  not_paid: "sin pago",
  partial: "con un pago parcial",
  reversed: "revertida",
};
const pagoEnOdoo = (f: FacturaDelEspejo) => PAGO_EN_ODOO[f.paymentState] ?? f.paymentState;

/** Por qué Odoo no la tiene vigente, en palabras de quien la va a ir a buscar. */
function porQueNoEstaVigente(f: FacturaDelEspejo | null, fila: FilaLibro, odooDelDia: string | null): string {
  if (!f) {
    // Un Excel más nuevo que la copia puede traer una factura que Odoo emitió después de copiarse.
    return fila.fechaFactura && odooDelDia && fila.fechaFactura > odooDelDia
      ? "Odoo no tiene ese número, pero la factura es posterior a la última copia de Odoo: puede no haber llegado todavía"
      : "Odoo no tiene ese número";
  }
  if (f.estadoEspejo === "DESAPARECIDA") return "Odoo la tenía y ya no la devuelve: la borraron o le cambiaron el número";
  if (f.state === "cancel") return "Odoo la tiene anulada";
  return "Odoo la revirtió con una nota de crédito";
}

const juntar = (partes: ReadonlyArray<string | null>) => partes.filter((p): p is string => !!p).join(" · ");

/**
 * Las claves con que se reconoce a un cliente por su nombre. Dos, y no una: `claveSociedad` toma lo que va
 * entre paréntesis como un alias y lo saca, y el Excel copia «MCCANN ERICKSON CENTROAMERICANA (COSTA RICA)
 * SOCIEDAD ANONIMA» donde Odoo guarda el mismo nombre sin paréntesis. Con una sola clave no se encontraban.
 */
function clavesDeCliente(nombre: string): string[] {
  return [claveSociedad(nombre), claveSociedad(nombre.replace(/[()]/g, " "))].filter(Boolean);
}

/* ── Las líneas ─────────────────────────────────────────────────────────────────── */

/** Un caso de un punto: el ítem y la moneda de su monto. */
type Caso = { moneda: string; item: ItemInconsistencia };

type Molde = {
  codigo: string;
  severidad: Severidad;
  titulo: (n: number) => string;
  detalle: string;
  queHacer: string;
  resuelve: QuienResuelve;
};

/**
 * Un punto partido en una línea por moneda. El título dice la moneda solo si el punto tiene las dos: con una
 * sola, el símbolo del monto alcanza. Dentro de cada línea, los ítems van de mayor a menor (ahí sí es la
 * misma moneda).
 */
function lineasPorMoneda(molde: Molde, casos: readonly Caso[]): Inconsistencia[] {
  const porMoneda = new Map<string, ItemInconsistencia[]>();
  for (const c of casos) porMoneda.set(c.moneda, [...(porMoneda.get(c.moneda) ?? []), c.item]);
  const monedas = [...porMoneda.keys()].sort((a, b) => ordenDeMoneda(a) - ordenDeMoneda(b) || a.localeCompare(b));
  return monedas.map((moneda) => {
    const items = [...(porMoneda.get(moneda) ?? [])].sort(
      (a, b) => (b.monto ?? 0) - (a.monto ?? 0) || a.texto.localeCompare(b.texto),
    );
    return {
      codigo: `${molde.codigo}-${moneda}`,
      severidad: molde.severidad,
      titulo: molde.titulo(items.length) + (monedas.length > 1 ? ` · ${EN_MONEDA[moneda] ?? `en ${moneda}`}` : ""),
      detalle: molde.detalle,
      montoEnJuego: round2(items.reduce((n, it) => n + (it.monto ?? 0), 0)),
      moneda,
      queHacer: molde.queHacer,
      resuelve: molde.resuelve,
      items,
    };
  });
}

const PAGADA_Y_ODOO_NO: Molde = {
  codigo: "EXCEL_PAGADA_ODOO_NO",
  severidad: "ALTA",
  titulo: (n) => (n === 1 ? "Una factura que el Excel da por pagada y Odoo no" : `${n} facturas que el Excel da por pagadas y Odoo no`),
  detalle:
    "El Excel las marca pagadas, pero en Odoo siguen sin pago o con un pago a medias. Si la plata entró, falta " +
    "registrarla en Odoo; si no entró, el Excel da por cobrado algo que el cliente todavía debe. Cuando al lado " +
    "dice que Odoo tiene una nota de crédito sin aplicar del mismo cliente y por el mismo monto, lo más probable " +
    "es que la factura se anuló y nadie cruzó la nota. El monto es lo que Odoo deja por cobrar.",
  queHacer:
    "Si al lado dice que hay una nota de crédito sin aplicar, que contabilidad la aplique en Odoo; si no, buscar el depósito en el banco: si está, registrar el pago en Odoo, y si no está, volver a marcarla sin pagar en el Excel.",
  resuelve: "COBRANZA",
};

const SIN_PAGAR_Y_ODOO_PAGADA: Molde = {
  codigo: "EXCEL_SIN_PAGAR_ODOO_PAGADA",
  severidad: "ALTA",
  titulo: (n) =>
    n === 1 ? "Una factura que el Excel da sin pagar y Odoo por pagada" : `${n} facturas que el Excel da sin pagar y Odoo por pagadas`,
  detalle:
    "Odoo ya tiene el pago —conciliado con el banco o al menos registrado— y el Excel las sigue contando como " +
    "deuda. Si el Excel es anterior al pago, alcanza con subir uno nuevo; si no, se le está cobrando a un cliente " +
    "algo que ya pagó. El monto es lo que el Excel cuenta como deuda.",
  queHacer: "Marcarlas pagadas en el Excel con la fecha del depósito; si el pago que registró Odoo está mal, que lo revierta contabilidad.",
  resuelve: "COBRANZA",
};

const NO_VIGENTE_EN_ODOO: Molde = {
  codigo: "EXCEL_NO_VIGENTE_EN_ODOO",
  severidad: "ALTA",
  titulo: (n) => (n === 1 ? "Una factura del Excel que Odoo no tiene vigente" : `${n} facturas del Excel que Odoo no tiene vigentes`),
  detalle:
    "Están en el Excel, pero en Odoo no existen, desaparecieron, están anuladas o se revirtieron con una nota de " +
    "crédito. Una factura anulada no se cobra: mientras el Excel la siga contando, la cartera se ve más grande de " +
    "lo que es. El monto es el total que anota el Excel.",
  queHacer:
    "Buscar el número en Odoo: si la anularon, sacarla del Excel o marcarla anulada; si es un error al copiar el número, corregirlo.",
  resuelve: "COBRANZA",
};

const MONEDA_DISTINTA: Molde = {
  codigo: "MONEDA_DISTINTA",
  severidad: "ALTA",
  titulo: (n) => (n === 1 ? "Una factura en otra moneda en el Excel que en Odoo" : `${n} facturas en otra moneda en el Excel que en Odoo`),
  detalle:
    "El Excel la anota en una moneda y Odoo la emitió en la otra. Entre colones y dólares la diferencia es de " +
    "cientos de veces, así que cualquier total que la incluya está mal. El monto es el de la factura en Odoo.",
  queHacer: "Corregir la moneda en el Excel según la factura de Odoo; si la que está mal es la factura, contabilidad la anula y la vuelve a emitir.",
  resuelve: "COBRANZA",
};

const MONTO_DISTINTO: Molde = {
  codigo: "MONTO_DISTINTO",
  severidad: "MEDIA",
  titulo: (n) => (n === 1 ? "Una factura con otro total en el Excel que en Odoo" : `${n} facturas con otro total en el Excel que en Odoo`),
  detalle:
    "Misma factura y misma moneda, pero el total no da igual: se compara el total con impuesto de los dos lados, " +
    "al céntimo. El monto es la diferencia.",
  queHacer: "Copiar el total de Odoo en el Excel; si el que está mal es el de Odoo, lo corrige contabilidad con una nota.",
  resuelve: "COBRANZA",
};

const FALTA_EN_EXCEL = (anio: number): Molde => ({
  codigo: "ODOO_FALTA_EN_EXCEL",
  severidad: "MEDIA",
  titulo: (n) =>
    n === 1 ? `Una factura de ${anio} que Odoo tiene y el Excel no lista` : `${n} facturas de ${anio} que Odoo tiene y el Excel no lista`,
  detalle:
    "Odoo las emitió y siguen vigentes, pero no están en ninguna pestaña del Excel: es facturación que el " +
    "seguimiento de cobranza no está mirando. No cuentan las anuladas, las revertidas ni las que Odoo emitió " +
    "después de que se subió el Excel.",
  queHacer: "Agregarlas al Excel en su mes, con su estado de pago; si alguna no es cartera, dejarlo anotado.",
  resuelve: "COBRANZA",
});

const NOTAS_SIN_APLICAR: Molde = {
  codigo: "NOTA_DE_CREDITO_SIN_APLICAR",
  severidad: "MEDIA",
  titulo: (n) => (n === 1 ? "Una nota de crédito sin aplicar en Odoo" : `${n} notas de crédito sin aplicar en Odoo`),
  detalle:
    "Son de clientes que están en el Excel. Una nota de crédito sin aplicar es un saldo a favor del cliente: " +
    "hasta que se cruce con una factura, Odoo muestra a ese cliente debiendo más de lo que debe, o debiéndole " +
    "plata a él.",
  queHacer: "Decidir con contabilidad si cada nota se aplica a una factura abierta del cliente o se le devuelve la plata, y aplicarla en Odoo.",
  resuelve: "DIRECCION",
};

const PAGADA_SIN_CONCILIAR: Molde = {
  codigo: "PAGADA_SIN_CONCILIAR",
  severidad: "BAJA",
  titulo: (n) =>
    n === 1 ? "Una factura pagada que Odoo tiene sin conciliar con el banco" : `${n} facturas pagadas que Odoo tiene sin conciliar con el banco`,
  detalle:
    "El Excel las da pagadas y Odoo también tiene el pago registrado, pero todavía no lo cruzó con el movimiento " +
    "del banco. No es plata que se deba: es un cierre contable pendiente, y hasta que se haga Odoo no confirma que " +
    "el depósito existe.",
  queHacer: "Conciliar esos pagos en Odoo contra el estado de cuenta del banco.",
  resuelve: "COBRANZA",
};

/* ── El cruce ───────────────────────────────────────────────────────────────────── */

/** Por número normalizado. Si un número está dos veces (una vigente y otra que desapareció), manda la vigente. */
function indexarEspejo(facturas: readonly FacturaDelEspejo[]): Map<string, FacturaDelEspejo> {
  const porNumero = new Map<string, FacturaDelEspejo>();
  for (const f of facturas) {
    const numero = normalizarNumeroFactura(f.numero);
    if (!numero) continue;
    const previa = porNumero.get(numero);
    if (!previa || (previa.estadoEspejo !== "VIGENTE" && f.estadoEspejo === "VIGENTE")) porNumero.set(numero, f);
  }
  return porNumero;
}

type Cruce = {
  numero: string;
  fila: FilaLibro;
  total: number;
  moneda: string;
  estado: EstadoLibro | null;
  factura: FacturaDelEspejo | null;
};

export function compararExcelConOdoo(e: EntradaExcelVsOdoo): ExcelVsOdoo {
  const espejo = indexarEspejo(e.facturas);
  const documentos = agruparDocumentos(e.filas).filter((d) => !(d.principal.numero && NO_SON_CARTERA.has(d.principal.numero)));

  const fueraDeOdoo = new Map<SeccionLibro, number>();
  const clientesDelExcel = new Set<string>();
  const cruces: Cruce[] = [];
  let incompletos = 0;
  for (const { principal: f } of documentos) {
    if (!esDeOdoo(f)) {
      fueraDeOdoo.set(f.seccion, (fueraDeOdoo.get(f.seccion) ?? 0) + 1);
      continue;
    }
    for (const clave of clavesDeCliente(f.cliente)) clientesDelExcel.add(clave);
    if (!f.numero || f.total === null || !f.moneda) {
      incompletos += 1;
      continue;
    }
    cruces.push({ numero: f.numero, fila: f, total: f.total, moneda: f.moneda, estado: estadoDelDocumento(f), factura: espejo.get(f.numero) ?? null });
  }

  const pagadaYOdooNo: Caso[] = [];
  const pagadaSinConciliar: Caso[] = [];
  const sinPagarYOdooPagada: Caso[] = [];
  const noVigente: Caso[] = [];
  const monedaDistinta: Caso[] = [];
  const montoDistinto: Caso[] = [];
  const partnersDelExcel = new Set<number>();

  // Las notas de crédito que Odoo tiene sin aplicar, por ficha de cliente. Se miran dos veces: como punto
  // propio (abajo) y al lado de cada factura que el Excel da pagada y Odoo no.
  const notasPorPartner = new Map<number, FacturaDelEspejo[]>();
  for (const f of e.facturas) {
    if (esNotaSinAplicar(f)) notasPorPartner.set(f.odooPartnerId, [...(notasPorPartner.get(f.odooPartnerId) ?? []), f]);
  }
  /** Número de una nota → las facturas del punto 1 que explica (mismo cliente, misma moneda, mismo monto). */
  const facturasDeLaNota = new Map<string, string[]>();

  for (const c of cruces) {
    const f = c.factura;
    const texto = `${c.numero} · ${c.fila.cliente}`;
    // Una factura que solo está en el Compendio no trae mes: se omite en vez de escribir «sin mes».
    const mes = c.fila.periodo ? nombreDelPeriodo(c.fila.periodo) : null;
    if (f) partnersDelExcel.add(f.odooPartnerId);

    if (!f || !vigenteEnOdoo(f)) {
      noVigente.push({
        moneda: c.moneda,
        item: { id: c.numero, texto, monto: c.total, nota: juntar([porQueNoEstaVigente(f, c.fila, e.odooDelDia), c.estado ? DEL_EXCEL[c.estado] : null, mes]) },
      });
      continue;
    }

    const lados = (excel: number, odoo: number) =>
      juntar([`El Excel: ${fmtMontoLibro(excel, c.moneda)}`, `Odoo: ${fmtMontoLibro(odoo, f.moneda)}`, mes]);
    if (f.moneda !== c.moneda) {
      monedaDistinta.push({ moneda: f.moneda, item: { id: c.numero, texto, monto: f.montoTotal, nota: lados(c.total, f.montoTotal) } });
    } else {
      // Con signo: si el Excel anota una nota de crédito en negativo, Odoo la guarda en positivo.
      const deOdoo = montoConSigno(f.moveType, f.montoTotal);
      if (Math.abs(centavos(c.total) - centavos(deOdoo)) > 1) {
        montoDistinto.push({ moneda: c.moneda, item: { id: c.numero, texto, monto: round2(Math.abs(c.total - deOdoo)), nota: lados(c.total, deOdoo) } });
      }
    }

    // El estado de pago solo se cruza en facturas: en una nota de crédito «pagada» quiere decir «aplicada».
    if (f.moveType !== "out_invoice" || !c.estado) continue;
    if (c.estado === "PAGADO") {
      if (f.paymentState === "not_paid" || f.paymentState === "partial") {
        const parcial = f.paymentState === "partial";
        const debe = parcial ? f.montoResidual : f.montoTotal;
        // ⚠ Una nota de crédito sin aplicar del mismo cliente y por lo mismo que Odoo deja por cobrar es casi
        // siempre la factura anulada sin cruzar: medido, Publimark 0210 y su nota 0246 son del mismo día y
        // monto. Sin decirlo, «si no está el depósito, marcarla sin pagar» devolvía al Excel una deuda que
        // no existe (US$18.000 entre Publimark, Fruitpoint y Fundación Tecnológica).
        // Por número: la copia no llega en orden, y la misma nota no puede cambiar de lugar entre dos cargas.
        const iguales = (notasPorPartner.get(f.odooPartnerId) ?? [])
          .filter((n) => n.moneda === f.moneda && centavos(n.montoTotal) === centavos(debe))
          .sort((a, b) => a.numero.localeCompare(b.numero));
        for (const n of iguales) facturasDeLaNota.set(n.numero, [...(facturasDeLaNota.get(n.numero) ?? []), c.numero]);
        pagadaYOdooNo.push({
          moneda: f.moneda,
          item: {
            id: c.numero,
            texto,
            monto: debe,
            nota: juntar([
              parcial
                ? `Odoo: pago parcial, faltan ${fmtMontoLibro(f.montoResidual, f.moneda)} de ${fmtMontoLibro(f.montoTotal, f.moneda)}`
                : "Odoo: sin pago",
              iguales.length > 0
                ? `Odoo tiene sin aplicar ${iguales.length === 1 ? "la nota de crédito" : "las notas de crédito"} ` +
                  `${enLista(iguales.map((n) => n.numero))} del mismo cliente por el mismo monto: si anuló esta factura, falta aplicarla`
                : null,
              mes,
            ]),
          },
        });
      } else if (f.paymentState === "in_payment") {
        // ⚠ No es «sin pagar»: el pago está registrado, falta cruzarlo con el banco. Va en su propia línea.
        pagadaSinConciliar.push({ moneda: f.moneda, item: { id: c.numero, texto, monto: f.montoTotal, nota: mes ?? undefined } });
      }
    } else if (f.paymentState === "paid" || f.paymentState === "in_payment") {
      sinPagarYOdooPagada.push({
        moneda: c.moneda,
        item: { id: c.numero, texto, monto: c.total, nota: juntar([`Odoo: ${pagoEnOdoo(f)}`, DEL_EXCEL[c.estado], mes]) },
      });
    }
  }

  // ── Lo que Odoo tiene y el Excel no lista ──
  // Contra TODOS los números del Excel, de cualquier pestaña: una factura de Odoo anotada en el Compendio
  // o en otra sección no falta.
  const numerosDelExcel = new Set(e.filas.flatMap((f) => (f.numero ? [f.numero] : [])));
  const faltanEnExcel: Caso[] = [];
  let posterioresAlExcel = 0;
  for (const f of e.facturas) {
    if (f.estadoEspejo !== "VIGENTE" || !esDocumentoVivo(f) || f.invoiceDate.slice(0, 4) !== String(e.anio)) continue;
    const numero = normalizarNumeroFactura(f.numero);
    if (numero && numerosDelExcel.has(numero)) continue;
    if (f.invoiceDate > e.excelDelDia) {
      posterioresAlExcel += 1;
      continue;
    }
    faltanEnExcel.push({
      moneda: f.moneda,
      item: { id: f.numero, texto: `${f.numero} · ${f.odooPartnerNombre}`, monto: f.montoTotal, nota: `Odoo: ${pagoEnOdoo(f)} · ${nombreDelPeriodo(f.invoiceDate.slice(0, 7))}` },
    });
  }

  // ── Notas de crédito sin aplicar, de clientes del Excel ──
  // El cliente se reconoce por la ficha de Odoo de sus facturas y, si el número no está en la copia, por el
  // nombre: en las pestañas de Odoo el Excel copia la razón social tal como sale en la factura.
  const notasSinAplicar: Caso[] = [];
  for (const f of e.facturas) {
    if (!esNotaSinAplicar(f)) continue;
    const porNombre = clavesDeCliente(f.odooPartnerNombre).some((clave) => clientesDelExcel.has(clave));
    if (!partnersDelExcel.has(f.odooPartnerId) && !porNombre) continue;
    // La factura que esta nota probablemente anula: dirección decide a cuál aplicarla con el número a la vista.
    const explica = facturasDeLaNota.get(f.numero) ?? [];
    notasSinAplicar.push({
      moneda: f.moneda,
      item: {
        id: f.numero,
        texto: `${f.numero} · ${f.odooPartnerNombre}`,
        monto: f.montoTotal,
        nota: juntar([
          `Emitida en ${nombreDelPeriodo(f.invoiceDate.slice(0, 7))}`,
          explica.length > 0
            ? `mismo cliente y monto que ${enLista(explica)}, que el Excel da ${explica.length === 1 ? "pagada" : "pagadas"} y Odoo sin pago`
            : null,
        ]),
      },
    });
  }

  // ── Lo pendiente, por moneda, sobre lo que está en los dos ──
  const pendiente = new Map<string, { claves: Set<string>; segunExcel: number; segunOdoo: number }>();
  const deMoneda = (m: string) => {
    const previo = pendiente.get(m);
    if (previo) return previo;
    const nuevo = { claves: new Set<string>(), segunExcel: 0, segunOdoo: 0 };
    pendiente.set(m, nuevo);
    return nuevo;
  };
  for (const c of cruces) {
    const f = c.factura;
    if (!f || f.moveType !== "out_invoice") continue;
    // ⚠ Una factura con la moneda cambiada queda afuera de los DOS lados: sumarla metía ₡13 millones en la
    // tarjeta de dólares como «pendiente según el Excel». Ya tiene su línea arriba.
    if (f.moneda !== c.moneda) continue;
    const p = deMoneda(c.moneda);
    p.claves.add(c.numero);
    if (c.estado === "SIN_PAGAR" || c.estado === "ACTIVA") p.segunExcel += c.total;
    p.segunOdoo += pendienteEnOdoo(f);
  }

  return {
    comparados: cruces.length,
    inconsistencias: [
      ...lineasPorMoneda(PAGADA_Y_ODOO_NO, pagadaYOdooNo),
      ...lineasPorMoneda(SIN_PAGAR_Y_ODOO_PAGADA, sinPagarYOdooPagada),
      ...lineasPorMoneda(NO_VIGENTE_EN_ODOO, noVigente),
      ...lineasPorMoneda(MONEDA_DISTINTA, monedaDistinta),
      ...lineasPorMoneda(MONTO_DISTINTO, montoDistinto),
      ...lineasPorMoneda(FALTA_EN_EXCEL(e.anio), faltanEnExcel),
      ...lineasPorMoneda(NOTAS_SIN_APLICAR, notasSinAplicar),
      ...lineasPorMoneda(PAGADA_SIN_CONCILIAR, pagadaSinConciliar),
    ],
    pendiente: [...pendiente]
      .sort(([a], [b]) => ordenDeMoneda(a) - ordenDeMoneda(b) || a.localeCompare(b))
      .map(([moneda, p]) => ({ moneda, facturas: p.claves.size, segunExcel: round2(p.segunExcel), segunOdoo: round2(p.segunOdoo) })),
    noComparado: {
      fueraDeOdoo: [...fueraDeOdoo].map(([seccion, cuantos]) => ({ seccion, cuantos })).sort((a, b) => b.cuantos - a.cuantos),
      incompletos,
      posterioresAlExcel,
    },
  };
}

/**
 * El año cuyas facturas de Odoo lista el Excel: el que más se repite en las fechas de sus facturas de Odoo.
 * `porDefecto` si no trae ninguna.
 *
 * ⚠ No el año de hoy: en enero, el Excel que se sube todavía es el del año que cerró, y con el año de hoy
 * la lista acusaría de «faltantes» las facturas de un año que ese Excel no cubre.
 */
export function anioDelExcel(filas: readonly FilaLibro[], porDefecto: number): number {
  const cuantas = new Map<number, number>();
  for (const f of filas) {
    const fecha = esDeOdoo(f) ? (f.fechaFactura ?? f.periodo) : null;
    const anio = fecha ? Number(fecha.slice(0, 4)) : Number.NaN;
    if (Number.isInteger(anio)) cuantas.set(anio, (cuantas.get(anio) ?? 0) + 1);
  }
  let elegido = porDefecto;
  let max = 0;
  for (const [anio, n] of cuantas) {
    if (n > max || (n === max && anio > elegido)) {
      elegido = anio;
      max = n;
    }
  }
  return elegido;
}

/**
 * Lo que la página recibe del servidor (excel-vs-odoo-server.ts). Vive acá y no allá para que el panel no
 * importe un módulo que toca la base.
 */
export type DatosExcelVsOdoo = {
  /** `copiadoEl`: día de Costa Rica de la última copia buena; `atrasado`: la regla de Cobranza › Odoo. */
  odoo: { copiadoEl: string | null; atrasado: boolean };
  /** null = todavía no se subió ningún Excel. */
  excel: {
    subidoEl: string;
    /** El nombre de quien lo subió, o su correo si no es del equipo. */
    subidoPor: string;
    filasIlegibles: number;
    comparacion: ExcelVsOdoo;
    notaAlPie: string | null;
    avisos: string[];
  } | null;
};

/* ── Textos de la página ────────────────────────────────────────────────────────── */

const SECCION_FUERA_DE_ODOO: Record<SeccionLibro, string> = {
  MERCURY: "de Mercury",
  QUICKBOOKS: "de QuickBooks",
  NO_INSCRITOS: "de No inscritos",
  PLAN_DE_PAGO: "de planes de pago",
  COMPENDIO: "solo del Compendio",
  ODOO: "de Odoo",
};

/**
 * La nota al pie: lo que no se comparó y por qué, con su conteo. null = se comparó todo.
 * ⚠ No es una inconsistencia: que Mercury no esté en Odoo es lo esperable, y listarlo como problema
 * convertía la agenda en ruido.
 */
export function notaAlPie(n: NoComparado): string | null {
  const partes: string[] = [];
  const fuera = n.fueraDeOdoo.reduce((s, x) => s + x.cuantos, 0);
  if (fuera > 0) {
    partes.push(
      `No se comparan ${fuera} ${fuera === 1 ? "documento" : "documentos"} del Excel que no pasan por Odoo ` +
        `(${enLista(n.fueraDeOdoo.map((x) => `${x.cuantos} ${SECCION_FUERA_DE_ODOO[x.seccion]}`))}): Odoo no tiene contra qué mirarlos.`,
    );
  }
  if (n.posterioresAlExcel > 0) {
    partes.push(
      n.posterioresAlExcel === 1
        ? "Tampoco una factura que Odoo emitió después de que se subió el Excel: entra cuando se suba uno nuevo."
        : `Tampoco ${n.posterioresAlExcel} facturas que Odoo emitió después de que se subió el Excel: entran cuando se suba uno nuevo.`,
    );
  }
  if (n.incompletos > 0) {
    partes.push(
      n.incompletos === 1
        ? "Una factura de Odoo del Excel no tiene número, total o moneda, y no se pudo comparar."
        : `${n.incompletos} facturas de Odoo del Excel no tienen número, total o moneda, y no se pudieron comparar.`,
    );
  }
  return partes.length ? partes.join(" ") : null;
}

/** Días de `desde` a `hasta`, las dos `YYYY-MM-DD`. */
export function diasEntre(desde: string, hasta: string): number {
  const dia = (iso: string) => Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  return Math.round((dia(hasta) - dia(desde)) / 86_400_000);
}

/**
 * A partir de cuántos días de diferencia con la copia de Odoo el Excel se avisa viejo. Una semana: en ese
 * tiempo ya se movieron pagos, y cada uno aparece abajo como «el Excel dice sin pagar y Odoo pagada» sin
 * que haya nada que corregir más que subir el Excel de nuevo.
 */
export const DIAS_EXCEL_VIEJO = 7;

/** Los avisos que van arriba de la lista: lo que hace que la comparación no sea confiable. */
export function avisosDeFrescura(x: { excelDelDia: string; odooDelDia: string | null; odooAtrasado: boolean }): string[] {
  if (!x.odooDelDia) {
    return ["Odoo todavía no se copió nunca completo: sin esa copia, todo el Excel aparece como que Odoo no lo tiene."];
  }
  const avisos: string[] = [];
  if (x.odooAtrasado) {
    avisos.push("La copia de Odoo está atrasada: lo último que se registró en Odoo puede no estar reflejado abajo.");
  }
  const dias = diasEntre(x.excelDelDia, x.odooDelDia);
  if (dias > DIAS_EXCEL_VIEJO) {
    avisos.push(
      `El Excel es ${dias} días más viejo que la copia de Odoo: parte de lo que sigue puede ser plata que se movió después. ` +
        "Conviene subir uno nuevo en Cobranza › Importar.",
    );
  }
  return avisos;
}
