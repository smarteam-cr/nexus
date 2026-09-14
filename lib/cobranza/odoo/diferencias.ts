/**
 * lib/cobranza/odoo/diferencias.ts
 *
 * Todo lo que no cuadra entre Nexus y Odoo, en una sola lista. Es la mesa de trabajo con el CFO:
 * «son estas cosas, en este orden, y estas las decidís vos».
 *
 * PURO: cero Prisma, cero red, cero `new Date()`. Entra lo medido, sale la lista.
 *
 * Reusa el contrato de `lib/finanzas/inconsistencias.ts` con sus dos reglas, que acá valen igual:
 *   1. **Todo se DETECTA, nada se escribe a mano.** Una lista hardcodeada de hallazgos
 *      envejece sola: sigue mostrando lo arreglado y calla lo nuevo.
 *   2. **Cada línea dice cuánta plata mueve y quién la resuelve.** Sin monto no se prioriza;
 *      sin dueño no se cierra nunca.
 *
 * ⚠⚠ **Este módulo NO convierte moneda, y desde el 2026-09-13 tampoco suma monedas a la vista.**
 * Cada línea trae su plata una cifra por moneda (`montos`) y los documentos que la componen (`plata`),
 * y el encabezado suma por moneda sin repetir documentos (`resumenDeDiferencias`). Hasta entonces el
 * encabezado decía «121 693 746» sumando colones con dólares, contaba dos veces ₡26 millones y dejaba
 * afuera US$543.281. `convertir()` de lib/finanzas/equilibrio.ts sigue siendo el único punto de
 * conversión del sistema.
 */
import type { Inconsistencia, ItemInconsistencia } from "@/lib/finanzas/inconsistencias";
import { centavos as CENTAVOS, fmtMontoLibro, IVA_COSTA_RICA, subconjuntoUnico } from "../montos";
import { normalizarNumeroFactura, plataformaDelNumero } from "../numero-factura";

/* ── Cómo se cierra cada línea ──────────────────────────────────────────────────── */

/**
 * En qué sistema se arregla. Es la primera pregunta que hace quien mira la lista, y sin
 * respuesta cada línea obliga a abrir los dos sistemas para averiguarlo.
 */
export type DondeSeArregla =
  | "ODOO" // hay que tocar el ERP
  | "MERCURY" // se factura por fuera de Odoo: la copia de Odoo NUNCA va a cerrar esta línea sola
  | "NEXUS" // se arregla acá adentro
  | "PREGUNTANDO"; // no lo resuelve nadie tecleando: falta un dato de negocio

/** Plata de UNA moneda. Una lista de estas nunca se suma entre sí. */
export interface MontoEnMoneda {
  moneda: string;
  monto: number;
}

/**
 * Un documento o un cobro que una línea cuenta como plata que no cuadra.
 *
 * `clave` identifica la cosa, no la línea —`f:` una factura de Odoo, `c:` un cobro de Nexus, `l:` una
 * factura soltada, `m:` la diferencia de monto de una factura—, para que el encabezado la sume UNA vez
 * aunque la miren dos líneas. ⚠ Es lo que reemplaza a `yaContadoEn` como regla de conteo: esa marca
 * solo se ponía cuando TODAS las facturas de una línea estaban en otra, y ninguna línea real lo cumplía.
 */
export interface PlataDeLinea {
  clave: string;
  moneda: string;
  monto: number;
}

export interface ItemDiferencia extends ItemInconsistencia {
  /** La moneda de `monto`. ⚠ Sin ella el monto no se muestra: un número sin moneda es el que se suma mal. */
  moneda?: string;
}

/**
 * Una diferencia con su salida. Extiende el contrato de `inconsistencias.ts` y le agrega lo que ese
 * contrato no tiene: **los pasos concretos** y **la plata por moneda**.
 *
 * ⚠ `queHacer` del contrato original es UNA oración. Alcanza para un titular y no para
 * ejecutar: quien abre esta pantalla necesita saber en qué sistema entrar, qué buscar, y qué
 * hacer con lo que encuentre. Sin eso la lista se lee, se asiente, y no se cierra nunca.
 */
export interface DiferenciaOdoo extends Inconsistencia {
  donde: DondeSeArregla;
  /** Los pasos, en orden. Cada uno una acción, no una explicación. */
  pasos: string[];
  /** A dónde ir dentro de Nexus, cuando la salida está acá mismo. */
  atajo?: { etiqueta: string; tab: "emparejar" };
  /** Qué significa aceptarla, para que «está bien así» no sea un botón a ciegas. */
  queSignificaAceptar: string;
  /**
   * Una acción por fila del detalle, para las líneas que **solo cierra una persona**.
   *
   * ⛔ No la lleva ninguna línea que la copia de Odoo pueda cerrar. Poder marcar «hecho» a mano algo
   * que la copia verifica sería poder esconder un documento que sigue emitido — que es justo lo
   * contrario de para qué existe la lista.
   */
  accionPorItem?: { etiqueta: string; ayuda: string };
  /**
   * Cómo se cierra ESTA línea, cuando no es como se cierran las demás de su `donde`.
   *
   * ⚠ El pie genérico de ODOO promete que la línea se actualiza sola con la próxima copia. Para una
   * liberación sin número de documento eso es falso, y una promesa falsa sobre cuándo desaparece algo
   * es cómo se aprende a ignorar una lista entera.
   */
  pie?: string;
  items: ItemDiferencia[];
  /**
   * Lo que mueve la línea, una cifra por moneda (dólares primero). Vacío = no se cuantifica.
   * ⚠ Es lo que muestra la tarjeta. `montoEnJuego` queda como la cifra mayor, solo por contrato.
   */
  montos: MontoEnMoneda[];
  /**
   * Los documentos que la línea suma al encabezado. Vacío = la línea informa y no suma: pagos sin
   * conciliar, exentas, moneda ya corregida, facturas de varias cuotas. Ver `resumenDeDiferencias`.
   */
  plata: PlataDeLinea[];
  /**
   * Las facturas (`f:`) y los cobros (`c:`) de los que habla la línea, sumen o no al encabezado. Es su CASA: lo que
   * prueba `coberturaDelCruce`, que toda factura por cobrar y todo cobro facturado que se pueden verificar terminan
   * juntados con su par o en una sola línea.
   *
   * ⚠ Una línea que solo da una PISTA sobre un documento no lo lista: la nota de crédito dice qué factura parece
   * anular, pero la casa de esa factura es otra línea (o su cobro). Medido el 2026-09-14: sin esta cuenta, TEC-AE
   * FAC/2026/0298 (US$4.860, sin pagar) no estaba en ninguna línea y nada lo decía.
   */
  documentos: string[];
  /**
   * `true` = alguien la marcó «está bien así» y sus números no cambiaron desde entonces.
   *
   * ⚠ Sigue viniendo en la lista, marcada, en vez de desaparecer. Si se filtrara acá **no
   * habría forma de volver a abrirla**: quedaría cerrada para siempre por un clic. Quien la
   * consume decide dónde ponerla; quien la calcula no le esconde nada.
   */
  aceptada: boolean;
}

/* ── Lo que entra ───────────────────────────────────────────────────────────────── */

export interface CobroParaCruzar {
  id: string;
  cuentaId: string;
  cuentaNombre: string;
  periodo: string;
  fechaProgramada: string;
  monto: number;
  moneda: string;
  estado: string;
  /**
   * Cuándo se marcó facturado (`Cobro.fechaEmision`, `YYYY-MM-DD`), o null si no lo está.
   *
   * ⚠ Es una FECHA y no un booleano desde el 2026-09-12: «cobro sin factura» solo puede acusar
   * lo que la copia de Odoo ya tuvo tiempo de ver, y eso depende de cuándo se facturó.
   */
  fechaEmision: string | null;
  /**
   * El número de la factura que alguien anotó al marcar facturado (`Cobro.numeroFactura`, etapa 7).
   * null = sin número: los facturados de antes, o «no tengo el número».
   *
   * ⭐ Obligatorio a propósito: un cargador que se olvidara de pasarlo haría que el cruce volviera a
   * adivinar por monto sin que nada lo avise.
   */
  numeroFactura: string | null;
  /**
   * Dónde se emitió la factura, si quien la marcó lo dijo (`Cobro.plataformaFactura`, etapa 12). null = no lo
   * dijo, y manda la vía de cobro de la cuenta. Obligatorio por lo mismo que el número.
   */
  plataformaFactura: string | null;
}

export interface FacturaParaCruzar {
  id: string;
  odooMoveId: number;
  numero: string;
  cuentaId: string | null;
  odooPartnerId: number;
  odooPartnerNombre: string;
  invoiceDate: string;
  montoNeto: number;
  montoTotal: number;
  /**
   * Lo que Odoo deja sin pagar (o sin aplicar, en una nota de crédito), con IVA. Obligatorio desde el
   * 2026-09-13: «por cobrar», «sin saldo» y «nota sin aplicar» salen de acá, y un cargador que no lo
   * pasara haría que todo pareciera pagado.
   */
  montoResidual: number;
  montoImpuesto: number;
  moneda: string;
  moveType: string;
  paymentState: string;
  state: string;
}

/**
 * Una factura que Nexus soltó porque el acuerdo de pago cambió, y que alguien tiene que anular
 * del lado del ERP.
 *
 * ⛔ Nexus NO escribe en el ERP, ni «solo para anular». Estas filas son la cola de trabajo, y
 * mientras estén abiertas la plata que representan sigue emitida contra un cliente que ya no la
 * debe. Es la línea que evita que «Nexus no escribe en el ERP» se vuelva «Nexus pide y nadie
 * hace».
 */
export interface LiberacionParaCruzar {
  id: string;
  cuentaId: string;
  clienteNombre: string;
  numCuota: number | null;
  periodo: string;
  monto: number;
  moneda: string;
  fechaEmision: string | null;
  /** El número de documento en el ERP. Sin esto no hay forma de verificarlo solo. */
  referenciaExterna: string | null;
  plataforma: string;
  decision: string;
  liberadaPor: string;
  liberadaEn: string;
  /** Alguien la cerró a mano. Cierra cualquier plataforma, incluida ODOO. */
  resuelta: boolean;
}

/** Lo mínimo de la cuenta para poder decir dónde se factura de verdad. */
export interface CuentaParaCruzar {
  id: string;
  nombre: string;
  tipo: string;
  viaCobro: string;
}

/**
 * La factura con que el Excel de Alexander cubre un cobro que no tiene número anotado. La arma el cargador con la
 * comparación del libro sobre el último lote subido (`documentosDelLibroPorCobro`, libro-alex.ts).
 *
 * ⭐ Es la única evidencia que tiene Nexus de que una cuota sin número se facturó por Mercury en una cuenta que dice
 * facturar por Odoo. Medido el 2026-09-14: ACCCSA, 5 cuotas de US$712 cobradas; el Excel trae INV-4-1 a INV-4-4 de
 * Mercury por US$712,50 y «cobro sin factura» las acusaba de no tener factura en Odoo (US$3.560, el 75 % de la línea).
 */
export interface DocumentoDelLibro {
  numero: string;
  plataforma: "ODOO" | "MERCURY";
  /** El total del Excel, con IVA si lo lleva (Mercury no lo lleva). null = el Excel no lo trae. */
  total: number | null;
  moneda: string | null;
  /** «hoja» fila N. */
  fuente: string;
  /** true = la cuota se ató por ser la única del mes, con un monto parecido pero no igual (712,50 contra 712). */
  porElMes: boolean;
}

export interface EstadoDelCruce {
  cobros: CobroParaCruzar[];
  facturas: FacturaParaCruzar[];
  /**
   * cobroId → la factura con que el Excel de Alexander cubre ese cobro sin número. Vacío = no hay lote del Excel.
   * ⭐ Obligatorio a propósito: un cargador que se olvidara de pasarlo volvería a acusar a ACCCSA sin que nada avise.
   */
  libro: ReadonlyMap<string, DocumentoDelLibro>;
  /** Las facturas soltadas al recuadrar un acuerdo, resueltas y sin resolver. */
  liberaciones: LiberacionParaCruzar[];
  cuentas: CuentaParaCruzar[];
  /** Cuentas que facturan por Odoo sin cliente de Odoo asignado todavía. */
  cuentasSinVinculo: number;
  cuentasTotales: number;
  /** Las cuentas con al menos un cliente de Odoo vinculado. Sin vínculo no hay contra qué verificar. */
  cuentasVinculadas: ReadonlySet<string>;
  /** Día (`YYYY-MM-DD`) en que empezó la última copia BUENA de Odoo. null = nunca corrió bien. */
  ultimaCorridaOk: string | null;
  /** Claves de diferencias que alguien ya marcó «está bien así», con su huella. */
  aceptadas: ReadonlyMap<string, string>;
}

/* ── El cruce ───────────────────────────────────────────────────────────────────── */

export interface ParCobroFactura {
  cobroId: string;
  facturaId: string;
  cuentaNombre: string;
  monto: number;
  moneda: string;
  /**
   * Cuántas cuotas cubre esa factura: 1 = la suya sola. Más de 1 = una factura compartida, que solo
   * sale del apareo por NÚMERO: por monto nunca se adivina qué cuotas suman una factura.
   *
   * ⚠ No es un pago parcial. La factura es una sola y su estado de pago es el de la factura entera.
   */
  cuotas: number;
}

export interface MontoDistinto {
  /** El primero de `cobroIds`, para quien necesita uno solo. */
  cobroId: string;
  /** Los cobros que anotan esa factura: uno solo, salvo una factura compartida por número. */
  cobroIds: string[];
  /** Cuántas cuotas suman `montoCobro`. */
  cuotas: number;
  facturaId: string;
  cuentaNombre: string;
  numero: string;
  montoCobro: number;
  montoFactura: number;
  moneda: string;
  diferencia: number;
}

export interface ResultadoCruce {
  pares: ParCobroFactura[];
  cobrosSolos: CobroParaCruzar[];
  /**
   * Cobros con un número de factura que no encontró su documento vivo en la cuenta, o que tiene
   * forma de Mercury. ⛔ No pasan por el apareo por monto —sería desmentir su propio número— ni por
   * «cobro sin factura»: el porqué lo dice `clasificarNumerosSinPar`.
   */
  conNumeroSinPar: CobroParaCruzar[];
  facturasSolas: FacturaParaCruzar[];
  montosDistintos: MontoDistinto[];
}

const DIA = 86_400_000;
const dias = (a: string, b: string) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DIA;
const restarDias = (iso: string, n: number) => new Date(Date.parse(`${iso}T00:00:00Z`) - n * DIA).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;
const anioDe = (iso: string) => Number(iso.slice(0, 4));

/**
 * ¿Este documento es una factura que alguien debe o ya pagó? Factura —no nota de crédito—, no
 * anulada y no revertida.
 *
 * ⭐ UNA sola regla para todo el módulo. Antes cada línea filtraba a su manera: `cruzar()` sacaba
 * las notas y las anuladas pero no las REVERTIDAS, y las líneas de moneda, «sin cuenta»,
 * pagos sin conciliar y exentas no sacaban nada. Medido el 2026-09-12:
 *   · las 4 filas de Publimark por 11.541.250 —una revertida en USD, su nota de crédito en USD y
 *     dos facturas vivas en CRC— salían como «el mismo monto en dos monedas», y eran las que
 *     dictaban el «95,8 % de la facturación en dólares» que el texto tenía escrito a mano;
 *   · las notas de crédito sin cuenta sumaban en «sin atribuir» como si hubiera que cobrarlas;
 *   · una factura revertida podía aparearse con un cobro y taparlo.
 *
 * Las notas de crédito no desaparecen de la lista: se cuentan aparte, sin sumar plata. Y la
 * liberación REVERTIR sigue buscándolas (`liberacionesPendientes`), que es para lo que sirven.
 */
export function esDocumentoVivo(f: Pick<FacturaParaCruzar, "moveType" | "state" | "paymentState">): boolean {
  return f.moveType === "out_invoice" && f.state !== "cancel" && f.paymentState !== "reversed";
}

/**
 * ¿Odoo la da por cobrar? Viva y sin pagar, del todo o en parte.
 *
 * ⚠ Pagada sin conciliar con el banco NO es por cobrar: Odoo ya registró el pago (medido el
 * 2026-09-13: las 181 facturas en ese estado tienen saldo 0).
 */
export function estaPorCobrar(f: Pick<FacturaParaCruzar, "moveType" | "state" | "paymentState">): boolean {
  return esDocumentoVivo(f) && (f.paymentState === "not_paid" || f.paymentState === "partial");
}

/** Lo que falta cobrar de una factura, sin IVA como todo Nexus. Pago parcial: la parte del neto que queda. */
function netoPorCobrar(f: FacturaParaCruzar): number {
  if (f.paymentState === "partial" && f.montoTotal > 0) return round2((f.montoNeto * f.montoResidual) / f.montoTotal);
  return f.montoNeto;
}

/** Lo que una nota de crédito tiene sin aplicar, con IVA: su saldo, o el total si Odoo no la tocó. */
const saldoDeNota = (f: FacturaParaCruzar) => (f.paymentState === "partial" ? f.montoResidual : f.montoTotal);

const PAGO_EN_PALABRAS: Readonly<Record<string, string>> = {
  not_paid: "sin pagar",
  partial: "pagada en parte",
  paid: "pagada",
  in_payment: "pagada sin conciliar con el banco",
  reversed: "revertida",
  invoicing_legacy: "de antes de Odoo",
};

/** El estado de un documento como lo dice una persona. ⛔ Nunca el código de Odoo en pantalla. */
export function estadoDePagoEnPalabras(f: Pick<FacturaParaCruzar, "moveType" | "state" | "paymentState">): string {
  if (f.state === "cancel") return "anulada";
  if (f.moveType === "out_refund") {
    if (f.paymentState === "not_paid") return "nota de crédito sin aplicar";
    if (f.paymentState === "partial") return "nota de crédito aplicada en parte";
    return "nota de crédito aplicada";
  }
  return PAGO_EN_PALABRAS[f.paymentState] ?? "estado de pago desconocido";
}

const NOMBRE_DE_MONEDA: Readonly<Record<string, string>> = { USD: "dólares", CRC: "colones" };
const nombreDeMoneda = (m: string) => NOMBRE_DE_MONEDA[m] ?? m;

/** Dólares primero, después colones, después cualquier otra: el mismo orden en toda la pantalla. */
const ordenDeMoneda = (m: string) => (m === "USD" ? 0 : m === "CRC" ? 1 : 2);

/** Suma por moneda, SIN convertir, dólares primero. Es la única forma en que esta lista junta plata. */
export function montosPorMoneda(xs: ReadonlyArray<{ monto: number; moneda: string }>): MontoEnMoneda[] {
  const sumas = new Map<string, number>();
  for (const x of xs) sumas.set(x.moneda, (sumas.get(x.moneda) ?? 0) + x.monto);
  return [...sumas]
    .map(([moneda, monto]) => ({ moneda, monto: round2(monto) }))
    .sort((a, b) => ordenDeMoneda(a.moneda) - ordenDeMoneda(b.moneda) || a.moneda.localeCompare(b.moneda));
}

/** «US$27.420 + ₡72.493.913,64». Cada cifra con su moneda: nunca un número pelado. */
export function textoDeMontos(ms: readonly MontoEnMoneda[]): string {
  return ms.map((m) => fmtMontoLibro(m.monto, m.moneda)).join(" + ");
}

const fmt = (n: number, moneda: string) => fmtMontoLibro(n, moneda);
const principal = (ms: readonly MontoEnMoneda[]): number | null => (ms.length ? Math.max(...ms.map((m) => m.monto)) : null);

/**
 * El año contra el que se decide qué es de este año y qué es historia: el de la última copia buena de
 * Odoo, o si nunca corrió, el de la factura más nueva. PURO: el reloj no entra a este módulo.
 */
export function anioDeReferencia(estado: Pick<EstadoDelCruce, "ultimaCorridaOk" | "facturas">): number | null {
  if (estado.ultimaCorridaOk) return anioDe(estado.ultimaCorridaOk);
  const anios = estado.facturas.map((f) => anioDe(f.invoiceDate)).filter((n) => Number.isFinite(n));
  return anios.length ? Math.max(...anios) : null;
}

/** Cuántos documentos son facturas vivas y cuántos notas de crédito o anulados: «364 facturas» eran 296. */
export function contarDocumentos(
  facturas: ReadonlyArray<Pick<FacturaParaCruzar, "moveType" | "state" | "paymentState">>,
): { facturas: number; otros: number } {
  const vivas = facturas.filter(esDocumentoVivo).length;
  return { facturas: vivas, otros: facturas.length - vivas };
}

/**
 * Cuántos días se le dan a la copia de Odoo para traer una factura marcada en Nexus antes de acusarla.
 *
 * Medido el 2026-09-12 sobre los 54 pares cobro-factura con fecha de emisión: en 43 la factura de
 * Odoo lleva fecha de hasta 15 días DESPUÉS de la que Nexus anotó al marcar facturado. Con menos
 * gracia, una copia al día acusaría en falso lo que simplemente todavía no se emitió. Es además
 * una quincena, el ritmo en que trabaja la cobranza de esta casa (el mismo corte que INV28).
 */
export const DIAS_DE_GRACIA_DEL_ESPEJO = 15;

/**
 * Ventana en la que una factura puede corresponder a un cobro programado.
 *
 * ⚠ Son DOS, y la diferencia importa. El monto exacto es evidencia fuerte, así que se le da
 * medio año: un cobro programado en enero que se facturó en abril es normal. El monto
 * aproximado es evidencia débil y se queda en 45 días, o una factura de enero se aparea con un
 * cobro de diciembre y la lista reporta una «diferencia de monto» que son dos hechos distintos.
 *
 * ⛔ Y la ventana del exacto NO puede ser infinita, que es como estaba: sin límite, un cobro
 * recurrente de USD 2.000 se apareaba con la factura de 2.000 de hace tres años, dejando al
 * cobro de este mes sin factura y sin que nada lo dijera.
 */
const VENTANA_EXACTO_DIAS = 180;
const VENTANA_APROX_DIAS = 45;

/**
 * Cruza cobros contra facturas de la MISMA cuenta.
 *
 * ⚠ El monto se compara **en centavos**, no en flotante: los importes de Odoo llegan con
 * ruido (2260.0000000000002) y un par que no matchea por el decimal 15 es el error que nadie
 * encuentra mirando la pantalla.
 *
 * ⚠ Y se exige la MISMA MONEDA para aparear. Un cobro de USD 2.000 y una factura de CRC 2.000
 * no son el mismo hecho aunque el número coincida: son 500 veces distintos. Esos casos salen
 * como «solos», que es la verdad.
 *
 * ⛔ Solo se aparean documentos vivos (`esDocumentoVivo`). Una nota de crédito corrige una
 * factura, no cubre una cuota; una factura revertida ya no le cobra nada a nadie. Aparear
 * cualquiera de las dos haría desaparecer un cobro que sigue pendiente.
 */
/**
 * Más cerca en el tiempo primero, y **con desempate por id**.
 *
 * ⚠ El desempate no es cosmético: sin él, dos facturas del mismo día por el mismo monto se
 * ordenaban según el orden en que Postgres devolvió las filas — que sin `ORDER BY` no está
 * garantizado. La misma consulta podía aparear cobros con facturas distintas en dos corridas
 * seguidas, y la lista del CFO cambiaba sin que nadie hubiera tocado nada.
 */
const porCercania = (c: CobroParaCruzar) => (a: FacturaParaCruzar, b: FacturaParaCruzar) =>
  dias(a.invoiceDate, c.fechaProgramada) - dias(b.invoiceDate, c.fechaProgramada) ||
  a.odooMoveId - b.odooMoveId;

export function cruzar(cobros: readonly CobroParaCruzar[], facturas: readonly FacturaParaCruzar[]): ResultadoCruce {
  /* Y el recorrido de los cobros también es determinista: el orden de entrada decide quién
     se queda con una factura que dos podrían reclamar. */
  const enOrden = [...cobros].sort((x, y) => x.fechaProgramada.localeCompare(y.fechaProgramada) || x.id.localeCompare(y.id));
  const facturables = facturas.filter((f) => f.cuentaId && esDocumentoVivo(f));
  const usadas = new Set<string>();
  const pares: ParCobroFactura[] = [];
  const montosDistintos: MontoDistinto[] = [];
  const cobrosSolos: CobroParaCruzar[] = [];
  const conNumeroSinPar: CobroParaCruzar[] = [];

  const porCuenta = new Map<string, FacturaParaCruzar[]>();
  for (const f of facturables) {
    if (!f.cuentaId) continue;
    let fs = porCuenta.get(f.cuentaId);
    if (!fs) porCuenta.set(f.cuentaId, (fs = []));
    fs.push(f);
  }

  /* ── Primera pasada: por NÚMERO ──────────────────────────────────────────────────
     ⭐ El cobro que tiene anotado el número de su factura se queda con ESA factura, aunque haya otra
     por el mismo monto más cerca en la fecha. Medido el 2026-09-12 sobre los 3 cobros que Alex
     identificó con su número: por monto se acertaba 1. Seléctrica jun (USD 45, FAC/2026/0302) se
     apareaba con FAC/2026/0277 de mayo como «monto distinto»; IIA jun (USD 60, FAC/2026/0295) quedaba
     sin factura.

     Varios cobros con el mismo número son UNA factura que cubre varias cuotas (ALMOTEC: 3 × 2.300
     contra FAC/2026/0329 por 6.900): se compara la SUMA contra el neto. Si no cuadra es un monto
     distinto de la factura entera —falta anotar una cuota, o una está mal—, no un pago parcial.

     ⛔ Un número que no encuentra su documento vivo en la cuenta NO baja a las pasadas por monto:
     aparearlo con otra factura sería desmentir lo que una persona anotó y firmó. */
  const grupos = new Map<string, { numero: string; cobros: CobroParaCruzar[] }>();
  const sinNumero: CobroParaCruzar[] = [];
  for (const c of enOrden) {
    const numero = normalizarNumeroFactura(c.numeroFactura);
    const forma = plataformaDelNumero(numero);
    if (!numero || forma === null) {
      /* Sin número, o con uno que no es de ninguna plataforma conocida (un número de transferencia):
         no hay contra qué buscarlo. Sigue por monto, como antes de la etapa 8. */
      sinNumero.push(c);
    } else if (forma !== "ODOO") {
      /* INV-16 es de Mercury: la copia de Odoo no lo va a tener nunca. */
      conNumeroSinPar.push(c);
    } else {
      const k = `${c.cuentaId}|${c.moneda}|${numero}`;
      let g = grupos.get(k);
      if (!g) grupos.set(k, (g = { numero, cobros: [] }));
      g.cobros.push(c);
    }
  }
  for (const { numero, cobros: grupo } of grupos.values()) {
    const [primero] = grupo;
    if (!primero) continue;
    const [doc] = (porCuenta.get(primero.cuentaId) ?? [])
      .filter((f) => !usadas.has(f.id) && f.moneda === primero.moneda && normalizarNumeroFactura(f.numero) === numero)
      .sort((a, b) => a.odooMoveId - b.odooMoveId);
    if (!doc) {
      conNumeroSinPar.push(...grupo);
      continue;
    }
    usadas.add(doc.id);
    const suma = grupo.reduce((a, c) => a + CENTAVOS(c.monto), 0);
    if (suma === CENTAVOS(doc.montoNeto)) {
      for (const c of grupo) {
        pares.push({ cobroId: c.id, facturaId: doc.id, cuentaNombre: c.cuentaNombre, monto: c.monto, moneda: c.moneda, cuotas: grupo.length });
      }
    } else {
      montosDistintos.push({
        cobroId: primero.id,
        cobroIds: grupo.map((c) => c.id),
        cuotas: grupo.length,
        facturaId: doc.id,
        cuentaNombre: primero.cuentaNombre,
        numero: doc.numero,
        montoCobro: suma / 100,
        montoFactura: doc.montoNeto,
        moneda: primero.moneda,
        diferencia: (CENTAVOS(doc.montoNeto) - suma) / 100,
      });
    }
  }

  /* Segunda pasada, solo para los que no tienen número: monto exacto. Se hace ENTERA antes de la
     aproximada para que una coincidencia perfecta nunca pierda su factura contra una parecida de
     otro cobro.
     ⚠ Por cercanía de TODOS los pares a la vez, no cuota por cuota. Medido el 2026-09-13 en Honda: la cuota
     de mayo se quedaba con la factura de julio (la más cercana que le quedaba) y la de junio con la de
     agosto, así que las de julio y agosto —con su factura del mismo día— quedaban «sin factura» y la
     factura de mayo + junio (FAC/2026/0311) parecía de otras cuotas. Primero se juntan los pares más
     cercanos; el empate lo deciden los ids, así la lista no cambia entre dos cargas. */
  const exactos: Array<{ c: CobroParaCruzar; f: FacturaParaCruzar; distancia: number }> = [];
  for (const c of sinNumero) {
    for (const f of porCuenta.get(c.cuentaId) ?? []) {
      if (usadas.has(f.id) || f.moneda !== c.moneda || CENTAVOS(f.montoNeto) !== CENTAVOS(c.monto)) continue;
      const distancia = dias(f.invoiceDate, c.fechaProgramada);
      if (distancia <= VENTANA_EXACTO_DIAS) exactos.push({ c, f, distancia });
    }
  }
  exactos.sort((a, b) => a.distancia - b.distancia || a.c.id.localeCompare(b.c.id) || a.f.odooMoveId - b.f.odooMoveId);
  const conExacto = new Set<string>();
  for (const { c, f } of exactos) {
    if (conExacto.has(c.id) || usadas.has(f.id)) continue;
    conExacto.add(c.id);
    usadas.add(f.id);
    pares.push({ cobroId: c.id, facturaId: f.id, cuentaNombre: c.cuentaNombre, monto: c.monto, moneda: c.moneda, cuotas: 1 });
  }

  /* Tercera: misma cuenta, misma moneda, fecha cerca, monto distinto. Es la línea más útil
     de todas — no dice «falta algo», dice «esto no coincide y son X pesos». */
  const apareados = new Set(pares.map((p) => p.cobroId));
  for (const c of sinNumero) {
    if (apareados.has(c.id)) continue;
    const cands = (porCuenta.get(c.cuentaId) ?? [])
      .filter(
        (f) => !usadas.has(f.id) && f.moneda === c.moneda && dias(f.invoiceDate, c.fechaProgramada) <= VENTANA_APROX_DIAS,
      )
      .sort(porCercania(c));
    const hit = cands[0];
    if (!hit) {
      cobrosSolos.push(c);
      continue;
    }
    usadas.add(hit.id);
    montosDistintos.push({
      cobroId: c.id,
      cobroIds: [c.id],
      cuotas: 1,
      facturaId: hit.id,
      cuentaNombre: c.cuentaNombre,
      numero: hit.numero,
      montoCobro: c.monto,
      montoFactura: hit.montoNeto,
      moneda: c.moneda,
      diferencia: Math.round((hit.montoNeto - c.monto) * 100) / 100,
    });
  }

  return {
    pares,
    cobrosSolos,
    conNumeroSinPar,
    facturasSolas: facturables.filter((f) => !usadas.has(f.id)),
    montosDistintos,
  };
}

/* ── La moneda equivocada ───────────────────────────────────────────────────────── */

/**
 * Las notas de crédito que Odoo tiene sin aplicar, del todo o en parte, por cliente de Odoo, moneda y neto.
 * La usan dos reglas: la moneda equivocada (una factura con su nota ya no es un par abierto) y la línea
 * de notas sin aplicar.
 */
const esNotaSinAplicar = (f: FacturaParaCruzar) =>
  f.moveType === "out_refund" && f.state !== "cancel" && (f.paymentState === "not_paid" || f.paymentState === "partial") && saldoDeNota(f) > 0;
const llaveDeMonto = (f: Pick<FacturaParaCruzar, "odooPartnerId" | "moneda" | "montoNeto">) =>
  `${f.odooPartnerId}|${f.moneda}|${CENTAVOS(f.montoNeto)}`;

/**
 * ⭐ El mismo cliente con el MISMO monto exacto en dos monedas distintas.
 *
 * Con un tipo de cambio de ~500 eso no puede ser una coincidencia: es una factura emitida en
 * la moneda equivocada.
 *
 * ⚠ Solo entre documentos VIVOS. Medido el 2026-09-12: de los 6 casos que salían, 2 eran de
 * documentos muertos —Publimark 11.541.250 (la de USD ya revertida con su nota) y Servica 255
 * (las dos revertidas)—: pares que alguien ya había corregido en Odoo, acusados igual.
 *
 * ⚠ Y sin la factura que ya tiene su nota de crédito sin aplicar del mismo cliente, moneda y neto. Medido
 * el 2026-09-13: Syntepro ₡829 y Releva ₡60 ya tenían su nota en colones (FAC/2025/0251 y 0244), y la
 * línea mandaba a emitir una corrección que existía. Esas van a la línea de notas sin aplicar.
 *
 * ⚠ Se detecta por REGLA y no por una lista de números: una lista se queda vieja y sigue
 * mostrando lo que ya se arregló.
 */
export function montosEnDosMonedas(facturas: readonly FacturaParaCruzar[]): Array<{
  odooPartnerId: number;
  odooPartnerNombre: string;
  monto: number;
  monedas: string[];
  numeros: string[];
}> {
  const conNota = new Set(facturas.filter(esNotaSinAplicar).map(llaveDeMonto));
  const grupos = new Map<string, { partner: number; nombre: string; monto: number; monedas: Set<string>; numeros: string[] }>();
  for (const f of facturas) {
    if (!esDocumentoVivo(f) || conNota.has(llaveDeMonto(f))) continue;
    const k = `${f.odooPartnerId}|${CENTAVOS(f.montoNeto)}`;
    const g = grupos.get(k) ?? {
      partner: f.odooPartnerId,
      nombre: f.odooPartnerNombre,
      monto: f.montoNeto,
      monedas: new Set<string>(),
      numeros: [],
    };
    g.monedas.add(f.moneda);
    g.numeros.push(`${f.numero} (${nombreDeMoneda(f.moneda)}, ${estadoDePagoEnPalabras(f)})`);
    grupos.set(k, g);
  }
  return [...grupos.values()]
    .filter((g) => g.monedas.size > 1)
    .map((g) => ({ odooPartnerId: g.partner, odooPartnerNombre: g.nombre, monto: g.monto, monedas: [...g.monedas], numeros: g.numeros }))
    .sort((a, b) => b.monto - a.monto);
}

export interface MonedaCorregida {
  odooPartnerId: number;
  odooPartnerNombre: string;
  monto: number;
  /** La moneda en que salió mal, con la factura revertida y la nota de crédito que la revirtió. */
  equivocada: { moneda: string; revertidas: string[]; notas: string[] };
  /** La moneda en que se volvió a emitir, con sus facturas vivas. */
  buena: { moneda: string; numeros: string[] };
}

/**
 * Las facturas que salieron en la moneda equivocada y ya se corrigieron: en una moneda, la factura
 * revertida y su nota de crédito; en la otra, la factura viva por el mismo importe, del mismo cliente.
 *
 * ── POR QUÉ ES UNA LÍNEA ─────────────────────────────────────────────────────────
 * Publimark FAC/2026/0232 salió en dólares por 11.541.250, un importe en colones. Se revirtió con
 * FAC/2026/0243 —una nota de crédito en dólares, por 13.041.612,50 con IVA— y se reemitió en colones
 * (FAC/2026/0233). No hay plata por cobrar, pero hasta el 2026-09-13 la página lo decía en media frase
 * de otra línea («notas de crédito por USD 11.595.963,50 que no suman»), que se leía como un error
 * vivo de once millones de dólares. Dicho entero, se entiende y se confirma.
 */
export function monedaEquivocadaYaCorregida(facturas: readonly FacturaParaCruzar[]): MonedaCorregida[] {
  type Lado = { vivas: FacturaParaCruzar[]; revertidas: FacturaParaCruzar[]; notas: FacturaParaCruzar[] };
  const grupos = new Map<string, { partner: number; nombre: string; monto: number; lados: Map<string, Lado> }>();
  for (const f of facturas) {
    if (f.state === "cancel") continue;
    const k = `${f.odooPartnerId}|${CENTAVOS(f.montoNeto)}`;
    let g = grupos.get(k);
    if (!g) grupos.set(k, (g = { partner: f.odooPartnerId, nombre: f.odooPartnerNombre, monto: f.montoNeto, lados: new Map() }));
    let lado = g.lados.get(f.moneda);
    if (!lado) g.lados.set(f.moneda, (lado = { vivas: [], revertidas: [], notas: [] }));
    if (esDocumentoVivo(f)) lado.vivas.push(f);
    else if (f.moveType === "out_refund") lado.notas.push(f);
    else if (f.moveType === "out_invoice" && f.paymentState === "reversed") lado.revertidas.push(f);
  }
  const numeros = (fs: FacturaParaCruzar[]) => [...fs].sort((a, b) => a.odooMoveId - b.odooMoveId).map((f) => f.numero);
  const out: MonedaCorregida[] = [];
  for (const g of grupos.values()) {
    const conVivas = [...g.lados].filter(([, l]) => l.vivas.length > 0);
    const [buena] = conVivas;
    if (conVivas.length !== 1 || !buena) continue;
    for (const [moneda, lado] of g.lados) {
      if (moneda === buena[0] || lado.vivas.length || !lado.revertidas.length || !lado.notas.length) continue;
      out.push({
        odooPartnerId: g.partner,
        odooPartnerNombre: g.nombre,
        monto: g.monto,
        equivocada: { moneda, revertidas: numeros(lado.revertidas), notas: numeros(lado.notas) },
        buena: { moneda: buena[0], numeros: numeros(buena[1].vivas) },
      });
    }
  }
  return out.sort((a, b) => b.monto - a.monto || a.odooPartnerNombre.localeCompare(b.odooPartnerNombre));
}

/* ── Notas de crédito sin aplicar ───────────────────────────────────────────────── */

export interface NotaSinAplicar {
  nota: FacturaParaCruzar;
  /** Lo que la nota tiene sin aplicar, con IVA. */
  saldo: number;
  /** La factura sin pagar que parece anular: mismo cliente, moneda e importe. null = no se encontró. */
  anula: FacturaParaCruzar | null;
}

/**
 * Las notas de crédito que Odoo tiene sin aplicar, con la factura que parecen anular.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────────
 * Mientras una nota no se aplica, Odoo sigue dando por cobrar la factura que anula. Medido el
 * 2026-09-13: 14 notas por US$29.930 + ₡1.005. Publimark FAC/2026/0246, US$15.226,75, del mismo día que
 * FAC/2026/0210, que Odoo daba por cobrar; Global Supply 0248 contra FAC/2026/0206, una de las tres que
 * Alex devuelve a por cobrar. La página las despachaba con «no suman», y solo las de clientes sin cuenta.
 *
 * La factura se busca por lo que dice Odoo y nada más: mismo cliente de Odoo, misma moneda, sin pagar, y
 * el mismo importe —el saldo con IVA o el neto—, la más cercana en fecha y nunca la misma para dos notas.
 * Es la regla que nació en «Excel vs Odoo» (06fc81c5) y se rescató antes de borrar esa página.
 * ⚠ Es una PISTA: la aplica contabilidad, que es quien sabe a qué factura corresponde.
 */
export function notasDeCreditoSinAplicar(facturas: readonly FacturaParaCruzar[]): NotaSinAplicar[] {
  const notas = facturas.filter(esNotaSinAplicar).sort((a, b) => a.odooMoveId - b.odooMoveId);
  const porCobrar = facturas.filter(estaPorCobrar);
  const usadas = new Set<string>();
  const out: NotaSinAplicar[] = [];
  for (const nota of notas) {
    const saldo = saldoDeNota(nota);
    const [anula] = porCobrar
      .filter((f) => {
        if (usadas.has(f.id) || f.odooPartnerId !== nota.odooPartnerId || f.moneda !== nota.moneda) return false;
        const debe = f.paymentState === "partial" ? f.montoResidual : f.montoTotal;
        return CENTAVOS(debe) === CENTAVOS(saldo) || CENTAVOS(f.montoNeto) === CENTAVOS(nota.montoNeto);
      })
      .sort((a, b) => dias(a.invoiceDate, nota.invoiceDate) - dias(b.invoiceDate, nota.invoiceDate) || a.odooMoveId - b.odooMoveId);
    if (anula) usadas.add(anula.id);
    out.push({ nota, saldo, anula: anula ?? null });
  }
  return out;
}

/* ── Facturas que cubren varias cuotas ──────────────────────────────────────────── */

/**
 * Cuántos días puede haber entre la factura y la fecha de cada cuota que cubre: cuatro meses. Medido el
 * 2026-09-13: Selvatura facturó enero a marzo el 5-may (110 días) y Iberorutas reemitió mayo + junio el
 * 19-ago, después de revertir la primera (96 días).
 */
export const DIAS_DE_VENTANA_VARIAS_CUOTAS = 120;

export interface FacturaDeVariasCuotas {
  factura: FacturaParaCruzar;
  /** En orden de fecha. */
  cobros: CobroParaCruzar[];
}

const mesAnterior = (iso: string) => {
  const [anio = 0, mes = 1] = iso.split("-").map(Number);
  return mes === 1 ? `${anio - 1}-12` : `${anio}-${String(mes - 1).padStart(2, "0")}`;
};

/**
 * Las facturas cuyo neto es exactamente la suma de 2 o 3 cuotas sin número de su misma cuenta y moneda,
 * con una sola combinación posible.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────────
 * Medido el 2026-09-13: de los US$24.876 de «montos distintos», solo US$40 eran un monto distinto (MTS).
 * El resto eran facturas de varias cuotas apareadas con una sola (ALMOTEC 6.900 = 3 × 2.300; Iberorutas
 * «150 contra 7.100», que es mayo + junio de 3.550). Y 14 de los 21 «cobros sin factura» tenían la suya.
 *
 * ── DE LA SEÑAL MÁS FUERTE A LA MÁS DÉBIL, CON TODAS LAS FACTURAS EN CADA UNA ──────
 *  1. cuotas marcadas facturadas el MISMO DÍA de la factura;
 *  2. cuotas del mes de la factura;
 *  3. cuotas del mes anterior (facturación a mes vencido);
 *  4. cualquier cuota a hasta `DIAS_DE_VENTANA_VARIAS_CUOTAS` días.
 * Es el orden de `asignarCuotas` del libro de Alex. Hecho factura por factura, Ecoquintas —dos servicios,
 * 1.300 + 1.880, facturados juntos cada mes— daba cuatro combinaciones para cada factura y ninguna salía.
 *
 * ⛔ PROPONE, no junta: el cruce sigue igual y la factura NO se aparea con las cuotas. La línea pide anotar
 * el número en cada una, y el número que anota una persona es lo único que las junta. Con dos
 * combinaciones posibles, o dos facturas que reclaman la misma cuota con la misma señal, no se propone nada.
 * ⚠ Una cuota con un número de Odoo o de Mercury ya dijo cuál es su factura: no entra.
 */
export function facturasDeVariasCuotas(
  facturas: readonly FacturaParaCruzar[],
  cuotas: readonly CobroParaCruzar[],
): FacturaDeVariasCuotas[] {
  const fechaDe = (c: CobroParaCruzar) => c.fechaEmision ?? c.fechaProgramada;
  const sinNumero = cuotas.filter((c) => plataformaDelNumero(normalizarNumeroFactura(c.numeroFactura)) === null);
  const candidatas = [...new Map(facturas.filter((f) => f.cuentaId && esDocumentoVivo(f)).map((f) => [f.id, f])).values()].sort(
    (a, b) => a.odooMoveId - b.odooMoveId,
  );
  const senales: ReadonlyArray<(f: FacturaParaCruzar, c: CobroParaCruzar) => boolean> = [
    (f, c) => c.fechaEmision === f.invoiceDate,
    (f, c) => c.periodo === f.invoiceDate.slice(0, 7),
    (f, c) => c.periodo === mesAnterior(f.invoiceDate),
    () => true,
  ];
  const usadas = new Set<string>();
  const asignadas = new Set<string>();
  const out: FacturaDeVariasCuotas[] = [];
  for (const senal of senales) {
    const propuestas: FacturaDeVariasCuotas[] = [];
    for (const f of candidatas) {
      if (asignadas.has(f.id)) continue;
      const cercanas = sinNumero
        .filter(
          (c) =>
            !usadas.has(c.id) &&
            c.cuentaId === f.cuentaId &&
            c.moneda === f.moneda &&
            dias(fechaDe(c), f.invoiceDate) <= DIAS_DE_VENTANA_VARIAS_CUOTAS &&
            senal(f, c),
        )
        .sort((a, b) => dias(fechaDe(a), f.invoiceDate) - dias(fechaDe(b), f.invoiceDate) || a.id.localeCompare(b.id));
      const r = subconjuntoUnico(cercanas, (c) => CENTAVOS(c.monto), CENTAVOS(f.montoNeto), 2, 3);
      if (Array.isArray(r)) {
        propuestas.push({ factura: f, cobros: [...r].sort((a, b) => fechaDe(a).localeCompare(fechaDe(b)) || a.id.localeCompare(b.id)) });
      }
    }
    const usos = new Map<string, number>();
    for (const p of propuestas) for (const c of p.cobros) usos.set(c.id, (usos.get(c.id) ?? 0) + 1);
    for (const p of propuestas) {
      if (!p.cobros.every((c) => usos.get(c.id) === 1)) continue;
      out.push(p);
      asignadas.add(p.factura.id);
      for (const c of p.cobros) usadas.add(c.id);
    }
  }
  return out.sort((a, b) => a.factura.odooMoveId - b.factura.odooMoveId);
}

/* ── Qué cobros facturados se pueden verificar contra la copia de Odoo ──────────── */

export interface CobrosSinFacturaClasificados {
  /** La copia de Odoo ya tendría que haber visto su factura y no la tiene: ODOO-COBRO-SIN-FACTURA. */
  acusables: CobroParaCruzar[];
  /** Su cuenta factura por Odoo pero no está emparejada: se cuentan en ODOO-SIN-CUENTA, sin monto. */
  sinEmparejar: CobroParaCruzar[];
  /** Facturados después del corte: la copia todavía no pudo verlos. */
  recientes: CobroParaCruzar[];
  /**
   * Sin plataforma anotada, en una cuenta que dice facturar por Odoo, y el Excel de Alexander los cubre con una
   * factura de Mercury: la copia de Odoo no la va a tener nunca. Van a ODOO-COBRO-FACTURADO-EN-MERCURY.
   */
  enMercurySegunElExcel: CobroParaCruzar[];
  /** Hasta qué día se verifica. null = la copia nunca corrió bien y no se verifica nada. */
  corte: string | null;
}

/**
 * De los cobros que quedaron sin factura, cuáles se pueden acusar de verdad.
 *
 * ── POR QUÉ ──────────────────────────────────────────────────────────────────────
 * Medido el 2026-09-12: «148 cobros marcados facturados que no tienen factura en Odoo», USD
 * 237.355, severidad ALTA, la cifra más grande de la pantalla. Era un artefacto: sus facturas
 * estaban en la copia sin atribuir, 46 eran de cuentas sin emparejar y 8 de cuentas que facturan
 * por Mercury, que no tiene copia. Una acusación que Alex podía salir a trabajar.
 *
 * Solo se acusa un cobro cuando las tres cosas se cumplen:
 *   1. su cuenta factura por ODOO — Mercury y QuickBooks no tienen copia que lo pueda ver;
 *   2. su cuenta está emparejada — sin vínculo no hay contra qué buscar;
 *   3. se facturó hasta `DIAS_DE_GRACIA_DEL_ESPEJO` días antes de la última lectura buena de Odoo.
 * Un COBRADO sin fecha de emisión usa la programada: entró plata, algo se tuvo que facturar.
 *
 * ⭐ Desde la etapa 12 manda la plataforma anotada en la factura del cobro, y solo sin ella la de la cuenta:
 * una factura de QuickBooks en una cuenta que factura por Odoo no la va a ver nunca la copia.
 *
 * ⭐ Y sin plataforma anotada, antes que la de la cuenta, lo que dice el Excel de Alexander (`estado.libro`): una
 * cuota que el Excel cubre con una factura de Mercury no se acusa de no tener factura en Odoo (ACCCSA, 2026-09-14).
 * Una plataforma que anotó una persona manda sobre el Excel.
 */
export function clasificarCobrosSinFactura(
  cobrosSolos: readonly CobroParaCruzar[],
  estado: Pick<EstadoDelCruce, "cuentas" | "cuentasVinculadas" | "ultimaCorridaOk" | "libro">,
): CobrosSinFacturaClasificados {
  const corte = estado.ultimaCorridaOk ? restarDias(estado.ultimaCorridaOk, DIAS_DE_GRACIA_DEL_ESPEJO) : null;
  const viaDe = new Map(estado.cuentas.map((c) => [c.id, c.viaCobro]));
  const out: CobrosSinFacturaClasificados = { acusables: [], sinEmparejar: [], recientes: [], enMercurySegunElExcel: [], corte };

  for (const c of cobrosSolos) {
    const facturadoEl = c.fechaEmision ?? (c.estado === "COBRADO" ? c.fechaProgramada : null);
    if (!facturadoEl) continue;
    /* Una cuenta que no está en la lista tampoco se acusa: no se sabe por dónde factura. */
    if ((c.plataformaFactura ?? viaDe.get(c.cuentaId)) !== "ODOO") continue;
    if (c.plataformaFactura === null && estado.libro.get(c.id)?.plataforma === "MERCURY") {
      out.enMercurySegunElExcel.push(c);
      continue;
    }
    if (!estado.cuentasVinculadas.has(c.cuentaId)) out.sinEmparejar.push(c);
    else if (corte === null || facturadoEl > corte) out.recientes.push(c);
    else out.acusables.push(c);
  }
  return out;
}

/* ── Un número de factura que no lleva a su factura ─────────────────────────────── */

/**
 * Por qué un cobro con número de factura no encontró su documento. Decide en qué línea cae y qué se
 * le pide a quien la lee: mandar a «emitir la factura» a quien anotó el número de otro cliente es
 * mandarlo a duplicarla.
 */
export type PorQueNoTienePar =
  | "sin-documento" // la copia no tiene ningún documento con ese número
  | "otra-cuenta" // es de un cliente de Odoo emparejado con OTRA cuenta de Nexus
  | "sin-atribuir" // es de un cliente de Odoo que no está emparejado con nadie: no se acusa
  | "nota-de-credito" // corrige una factura; no respalda un cobro
  | "anulada" // la factura está anulada o revertida en Odoo
  | "otra-moneda" // la factura está en otra moneda que el cobro
  | "numero-de-mercury"; // INV-16: no es un documento de Odoo

export interface NumeroSinPar {
  cobro: CobroParaCruzar;
  /** El número anotado, normalizado. */
  numero: string;
  porQue: PorQueNoTienePar;
  /** El documento de Odoo con ese número, cuando la copia lo tiene. */
  documento: FacturaParaCruzar | null;
}

/**
 * Por qué se quedó sin factura cada cobro de `ResultadoCruce.conNumeroSinPar`.
 *
 * El número se busca en TODA la copia y no solo en la cuenta: «Odoo no tiene ese documento» y «es
 * de otro cliente» piden arreglos opuestos, y solo mirando afuera de la cuenta se distinguen.
 *
 * ⚠ Clasifica, no acusa. Qué se muestra lo decide `detectarDiferenciasOdoo`: solo cuentas que
 * facturan por Odoo, «sin-atribuir» no se acusa (falta emparejar, no hay nada mal anotado) y
 * «sin-documento» espera a que la copia haya podido ver el documento.
 */
export function clasificarNumerosSinPar(
  cobros: readonly CobroParaCruzar[],
  facturas: readonly FacturaParaCruzar[],
): NumeroSinPar[] {
  const porNumero = new Map<string, FacturaParaCruzar[]>();
  for (const f of facturas) {
    const n = normalizarNumeroFactura(f.numero);
    if (!n) continue;
    let fs = porNumero.get(n);
    if (!fs) porNumero.set(n, (fs = []));
    fs.push(f);
  }
  /* Vivos primero y con desempate por id: si un número se repitiera, la respuesta no puede depender
     del orden en que llegaron las filas. */
  const orden = (a: FacturaParaCruzar, b: FacturaParaCruzar) =>
    Number(esDocumentoVivo(b)) - Number(esDocumentoVivo(a)) || a.odooMoveId - b.odooMoveId;

  const out: NumeroSinPar[] = [];
  for (const cobro of cobros) {
    const numero = normalizarNumeroFactura(cobro.numeroFactura);
    if (!numero) continue;
    if (plataformaDelNumero(numero) === "MERCURY") {
      out.push({ cobro, numero, porQue: "numero-de-mercury", documento: null });
      continue;
    }
    const docs = [...(porNumero.get(numero) ?? [])].sort(orden);
    const deLaCuenta = docs.find((f) => f.cuentaId === cobro.cuentaId);
    if (deLaCuenta) {
      /* Una factura viva de su cuenta y de su moneda sí es su par: no hay porqué que dar. */
      if (esDocumentoVivo(deLaCuenta) && deLaCuenta.moneda === cobro.moneda) continue;
      /* Está en su cuenta y aun así no se apareó: no es una factura viva, o no es de su moneda. */
      const porQue: PorQueNoTienePar =
        deLaCuenta.moveType === "out_refund" ? "nota-de-credito" : esDocumentoVivo(deLaCuenta) ? "otra-moneda" : "anulada";
      out.push({ cobro, numero, porQue, documento: deLaCuenta });
      continue;
    }
    const deOtraCuenta = docs.find((f) => f.cuentaId !== null);
    if (deOtraCuenta) {
      out.push({ cobro, numero, porQue: "otra-cuenta", documento: deOtraCuenta });
      continue;
    }
    const [suelto] = docs;
    out.push(
      suelto
        ? { cobro, numero, porQue: "sin-atribuir", documento: suelto }
        : { cobro, numero, porQue: "sin-documento", documento: null },
    );
  }
  return out;
}

/* ── Las facturas soltadas, y cuándo deja de haber trabajo pendiente ────────────── */

/**
 * Por qué una liberación sigue abierta. Es lo que decide el texto de la línea: mandar a alguien
 * a «anular la factura» cuando el problema es que Nexus no tiene el número del documento es
 * mandarlo a buscar algo que no puede encontrar.
 */
export type PorQueSigueAbierta =
  | "documento-vigente" // ODOO+CANCELAR: la copia lo sigue trayendo, o sea que nadie lo anuló
  | "sin-nota-de-credito" // ODOO+REVERTIR: no aparece la nota de crédito que lo reversa
  | "sin-numero" // se liberó sin un número de documento de Odoo: no hay nada contra qué verificar
  | "sin-espejo"; // MERCURY / OTRA: no hay copia que la pueda cerrar

export interface LiberacionPendiente {
  liberacion: LiberacionParaCruzar;
  porQue: PorQueSigueAbierta;
}

/**
 * El número de una factura soltada, si es uno que la copia de Odoo puede ver: normalizado y con
 * forma de Odoo (FAC/2026/0206). null si falta, o si es otra cosa —un número de transferencia, uno de
 * Mercury—, que la copia no va a encontrar nunca.
 *
 * ⭐ La usan las dos puntas del cierre, y tienen que decir lo mismo: `liberacionesPendientes` (¿se
 * cierra sola?) y `resolverLiberacion` en servicio.ts (¿se deja cerrar a mano?). Si una dijera «con
 * número» y la otra «sin número», la liberación quedaría sin cierre automático y sin botón.
 */
export function numeroVerificableEnOdoo(numero: string | null | undefined): string | null {
  const n = normalizarNumeroFactura(numero);
  return n && plataformaDelNumero(n) === "ODOO" ? n : null;
}

/**
 * Cuáles de las facturas soltadas siguen sin resolverse en el ERP.
 *
 * ── LA REGLA DE CIERRE, POR PLATAFORMA ──────────────────────────────────────────
 * **ODOO + CANCELAR** cierra cuando el documento deja de estar vigente en la copia: el sync
 * solo trae `estadoEspejo: VIGENTE`, así que su desaparición ES la evidencia de que alguien lo
 * anuló o lo borró.
 *
 * **ODOO + REVERTIR** cierra cuando aparece una nota de crédito (`out_refund`) del mismo
 * partner, por el mismo monto y moneda, con fecha igual o posterior. El original NO desaparece
 * —eso es lo que distingue revertir de cancelar— así que esperarlo a él sería esperar para
 * siempre.
 *
 * **MERCURY y OTRA no cierran nunca solas.** No tienen copia. Las cierra una persona, y decirlo
 * así es honesto: la alternativa es una línea que se queda abierta para siempre sin explicar por
 * qué, hasta que alguien deja de mirar la lista entera.
 *
 * ⚠ Una liberación SIN número de documento tampoco cierra sola, aunque sea de Odoo. Es tentador
 * darla por buena para que la lista quede limpia; sería inventar que alguien anuló algo.
 *
 * ⚠⚠ Y «sin número» incluye un número que NO es de Odoo (`numeroVerificableEnOdoo`). Un número de
 * transferencia como 666471587 nunca va a aparecer en la copia: con CANCELAR, «no está» se leía
 * como «lo anularon» y la línea desaparecía sola. Es el mismo invento, con un número de por medio.
 *
 * PURA: sin reloj. Cuánto tiempo es demasiado lo decide INV28, que sí lo tiene.
 */
export function liberacionesPendientes(
  liberaciones: readonly LiberacionParaCruzar[],
  facturas: readonly FacturaParaCruzar[],
): LiberacionPendiente[] {
  const porNumero = new Map(facturas.map((f) => [f.numero, f]));
  const notas = facturas.filter((f) => f.moveType === "out_refund");

  const out: LiberacionPendiente[] = [];
  for (const l of liberaciones) {
    if (l.resuelta) continue;

    if (l.plataforma !== "ODOO") {
      out.push({ liberacion: l, porQue: "sin-espejo" });
      continue;
    }
    const numero = numeroVerificableEnOdoo(l.referenciaExterna);
    if (!numero) {
      out.push({ liberacion: l, porQue: "sin-numero" });
      continue;
    }

    const original = porNumero.get(numero);

    if (l.decision === "CANCELAR") {
      /* Que ya no esté es exactamente lo que se pidió. */
      if (original) out.push({ liberacion: l, porQue: "documento-vigente" });
      continue;
    }

    /* REVERTIR. Sin el original no hay partner ni monto contra qué buscar la nota: se deja
       abierta en vez de darla por cerrada, que es el error caro de los dos. */
    if (!original) {
      out.push({ liberacion: l, porQue: "sin-nota-de-credito" });
      continue;
    }
    const reversada = notas.some(
      (n) =>
        n.odooPartnerId === original.odooPartnerId &&
        n.moneda === original.moneda &&
        CENTAVOS(n.montoNeto) === CENTAVOS(original.montoNeto) &&
        n.invoiceDate >= original.invoiceDate,
    );
    if (!reversada) out.push({ liberacion: l, porQue: "sin-nota-de-credito" });
  }
  return out;
}

/* ── La lista ───────────────────────────────────────────────────────────────────── */

type LineaNueva = Omit<DiferenciaOdoo, "aceptada" | "montoEnJuego" | "yaContadoEn" | "plata" | "documentos"> & {
  plata?: PlataDeLinea[];
  /** Sin esto, los `f:` y `c:` de `plata`. */
  documentos?: string[];
};

const SEVERIDAD_ORDEN: Readonly<Record<string, number>> = { ALTA: 0, MEDIA: 1, BAJA: 2 };

const ESTADO_DEL_COBRO: Readonly<Record<string, string>> = { PROGRAMADO: "programado", POR_COBRAR: "por cobrar", COBRADO: "cobrado" };
const estadoDelCobro = (estado: string) => ESTADO_DEL_COBRO[estado] ?? estado.toLowerCase();
const unicos = (xs: readonly string[]) => [...new Set(xs)];

/**
 * La lista completa. El orden: lo aceptado al final; después la severidad; dentro de cada severidad,
 * los dólares y después los colones.
 *
 * ⚠ Hasta el 2026-09-13 ordenaba por «la moneda que más mueve» de cada línea, o sea comparando colones
 * con dólares: «exentas» (baja, ₡1,8 millones, unos US$3.500) quedaba arriba de «cobros sin factura»
 * (alta, US$27.420).
 */
export function detectarDiferenciasOdoo(estado: EstadoDelCruce): DiferenciaOdoo[] {
  return detectar(estado).lineas;
}

/**
 * La lista y lo que el cruce dejó juntado (`f:` y `c:`): los pares cobro-factura, y los que difieren justo en el
 * 13 % del IVA, que tampoco son una diferencia. `coberturaDelCruce` necesita las dos cosas.
 */
function detectar(estado: EstadoDelCruce): { lineas: DiferenciaOdoo[]; juntados: Set<string> } {
  const out: DiferenciaOdoo[] = [];
  const cruce = cruzar(estado.cobros, estado.facturas);
  const anioRef = anioDeReferencia(estado);

  /* ⚠ La huella se calcula SIEMPRE con `huellaDe`, sobre la línea ya armada. Tener una
     segunda definición acá —aunque sea equivalente hoy— hace que la pantalla acepte con una
     huella y el detector compare con otra: la aceptación no surte efecto nunca y nadie
     entiende por qué. Ya pasó al escribir esto; lo cazó `diferencias.test.ts`. */
  const agregar = (inc: LineaNueva) => {
    const plata = inc.plata ?? [];
    const documentos = unicos(inc.documentos ?? plata.map((p) => p.clave).filter((k) => k.startsWith("f:") || k.startsWith("c:")));
    const linea = { ...inc, plata, documentos, montoEnJuego: principal(inc.montos) };
    out.push({ ...linea, aceptada: estado.aceptadas.get(inc.codigo) === huellaDe(linea) });
  };

  const vivas = estado.facturas.filter(esDocumentoVivo);
  const viaDeCuenta = new Map(estado.cuentas.map((c) => [c.id, c.viaCobro]));
  const nombreDeCuenta = new Map(estado.cuentas.map((c) => [c.id, c.nombre]));
  const tipoDeCuenta = new Map(estado.cuentas.map((c) => [c.id, c.tipo]));
  const cobroPorId = new Map(estado.cobros.map((c) => [c.id, c]));
  const facturaPorId = new Map(estado.facturas.map((f) => [f.id, f]));
  const plataDeFactura = (f: FacturaParaCruzar): PlataDeLinea => ({ clave: `f:${f.id}`, moneda: f.moneda, monto: netoPorCobrar(f) });

  /* ⚠ Los cobros con un número que no lleva a su factura no pasan por «cobro sin factura» (no están
     en `cobrosSolos`): su porqué es más fino y va en las líneas de número. Solo cuentas que facturan por
     Odoo: en una cuenta de Mercury la copia de Odoo no tiene nada que verificar. */
  const numerosSinPar = clasificarNumerosSinPar(cruce.conNumeroSinPar, estado.facturas).filter(
    (x) => (x.cobro.plataformaFactura ?? viaDeCuenta.get(x.cobro.cuentaId)) === "ODOO",
  );

  /* Las cuentas que dicen facturar por Odoo y puede que no lo hagan (línea de cuentas internacionales). Se
     sabe antes de armar nada: sus cobros sin emparejar se cuentan ahí y no en «sin cuenta». ⭐ La evidencia más
     directa de dónde factura una cuenta es el número de sus facturas: un INV-16 anotado en una cuenta «Odoo»
     es una factura de Mercury (etapa 8). */
  const numerosDeMercury = new Map<string, string[]>();
  for (const x of numerosSinPar) {
    if (x.porQue !== "numero-de-mercury") continue;
    let ns = numerosDeMercury.get(x.cobro.cuentaId);
    if (!ns) numerosDeMercury.set(x.cobro.cuentaId, (ns = []));
    if (!ns.includes(x.numero)) ns.push(x.numero);
  }
  const viaDudosa = estado.cuentas.filter(
    (c) => c.viaCobro === "ODOO" && (c.tipo === "INTERNACIONAL" || numerosDeMercury.has(c.id)),
  );
  const idsDudosas = new Set(viaDudosa.map((c) => c.id));

  /* La moneda equivocada, abierta y ya corregida. */
  const dosMonedas = montosEnDosMonedas(estado.facturas);
  const tieneGemela = (f: FacturaParaCruzar) =>
    esDocumentoVivo(f) && dosMonedas.some((d) => d.odooPartnerId === f.odooPartnerId && CENTAVOS(d.monto) === CENTAVOS(f.montoNeto));
  const corregidas = monedaEquivocadaYaCorregida(estado.facturas);
  const numerosCorregidos = new Set(corregidas.flatMap((c) => [...c.equivocada.revertidas, ...c.equivocada.notas]));

  /* ⚠ Una factura recién liberada queda huérfana POR DISEÑO: soltarla es justamente quitarle el cobro. Se
     cuenta una vez, en la línea que la explica. */
  const liberadas = new Set(
    estado.liberaciones.map((l) => normalizarNumeroFactura(l.referenciaExterna)).filter((n): n is string => !!n),
  );

  /* ── Las facturas que cubren varias cuotas, antes de acusar montos y cobros ─────────
     Candidatas: las facturas sin cobro y las que el apareo aproximado juntó con una sola cuota; las cuotas
     facturadas sin factura y las de esos mismos pares aproximados. ⛔ Nunca un par por número: ahí una
     persona ya dijo cuál es la factura. */
  const clasificados = clasificarCobrosSinFactura(cruce.cobrosSolos, estado);
  const formaConocida = (n: string | null | undefined) => plataformaDelNumero(normalizarNumeroFactura(n)) !== null;
  const aproximados = cruce.montosDistintos.filter((d) => d.cuotas === 1 && !formaConocida(cobroPorId.get(d.cobroId)?.numeroFactura));
  const facturado = (c: CobroParaCruzar) => !!c.fechaEmision || c.estado === "COBRADO";
  const variasCuotas = facturasDeVariasCuotas(
    [
      ...cruce.facturasSolas.filter((f) => f.cuentaId && !liberadas.has(f.numero) && !tieneGemela(f)),
      ...aproximados.flatMap((d) => facturaPorId.get(d.facturaId) ?? []),
    ],
    [
      ...clasificados.acusables,
      ...clasificados.recientes,
      ...aproximados.flatMap((d) => {
        const c = cobroPorId.get(d.cobroId);
        return c && facturado(c) ? [c] : [];
      }),
    ],
  );
  const facturasEnVarias = new Set(variasCuotas.map((v) => v.factura.id));
  const cobrosEnVarias = new Set(variasCuotas.flatMap((v) => v.cobros.map((c) => c.id)));

  const montosDistintos = cruce.montosDistintos.filter(
    (d) => !facturasEnVarias.has(d.facturaId) && !d.cobroIds.some((id) => cobrosEnVarias.has(id)),
  );
  /* Una cuota que el apareo aproximado había juntado con una factura que resultó ser de varias cuotas
     vuelve a ser lo que es: un cobro que no tiene la suya. */
  const soltados = cruce.montosDistintos
    .filter((d) => facturasEnVarias.has(d.facturaId))
    .flatMap((d) => d.cobroIds)
    .filter((id) => !cobrosEnVarias.has(id))
    .flatMap((id) => cobroPorId.get(id) ?? []);
  const reclasificados = clasificarCobrosSinFactura(soltados, estado);
  const acusables = [...clasificados.acusables, ...reclasificados.acusables].filter((c) => !cobrosEnVarias.has(c.id));
  const recientes = [...clasificados.recientes, ...reclasificados.recientes].filter((c) => !cobrosEnVarias.has(c.id));
  const sinEmparejarTodos = [...clasificados.sinEmparejar, ...reclasificados.sinEmparejar];
  /* ⚠ Los cobros de cuentas internacionales sin emparejar no se mandan a emparejar: medido el 2026-09-13, 45
     de los 46 eran de cuentas que no tienen ni una factura en Odoo. Se cuentan en su propia línea. */
  const sinEmparejar = sinEmparejarTodos.filter((c) => !idsDudosas.has(c.cuentaId));
  const sinEmparejarDudosas = sinEmparejarTodos.filter((c) => idsDudosas.has(c.cuentaId));
  const corte = clasificados.corte;
  /* Las cuotas que el Excel de Alexander cubre con una factura de Mercury (ACCCSA): no se acusan, se piden numerar. */
  const enMercury = [...clasificados.enMercurySegunElExcel, ...reclasificados.enMercurySegunElExcel].filter((c) => !cobrosEnVarias.has(c.id));
  const cuentasEnMercury = new Set(enMercury.map((c) => c.cuentaId));

  /* ⚠ La factura que el apareo aproximado había juntado con una cuota que resultó ser de OTRA factura de varias
     cuotas vuelve a ser lo que es: una factura sin cobro. Medido el 2026-09-14: TEC-AE FAC/2026/0298 (US$4.860, sin
     pagar) se juntaba por monto con la cuota de mayo; mayo pasaba a la 0272 (abril + mayo), el par se descartaba y la
     0298 no salía en ninguna línea, ni antes ni después de cargar el Excel. Es el espejo de `soltados`. */
  const facturasSoltadas = cruce.montosDistintos
    .filter((d) => !facturasEnVarias.has(d.facturaId) && d.cobroIds.some((id) => cobrosEnVarias.has(id)))
    .flatMap((d) => facturaPorId.get(d.facturaId) ?? []);

  /* ── El estado de pago que Nexus y Odoo no dicen igual, sobre los pares juntados ────
     ⚠ Solo pares (por número o por monto exacto): un par aproximado ya está en «montos distintos». Medido el
     2026-09-14, después de cargar el Excel: 4 cobros por cobrar con su factura pagada en Odoo (US$4.626, Global Supply
     0323, Servica 0285, Amvac 0331, Forestales 0269) y 6 cobrados con la suya sin pagar (US$6.730, sobre todo TEC-AE).
     Ninguna línea los mostraba, y el encabezado «mejoraba» justo porque habían salido de «facturas sin cobro». */
  const paresPorFactura = new Map<string, { factura: FacturaParaCruzar; cobros: CobroParaCruzar[] }>();
  for (const p of cruce.pares) {
    const f = facturaPorId.get(p.facturaId);
    const c = cobroPorId.get(p.cobroId);
    if (!f || !c) continue;
    const g = paresPorFactura.get(f.id) ?? { factura: f, cobros: [] };
    g.cobros.push(c);
    paresPorFactura.set(f.id, g);
  }
  const pagadaEnOdoo = (f: FacturaParaCruzar) => esDocumentoVivo(f) && (f.paymentState === "paid" || f.paymentState === "in_payment");
  const porCobrarPagadas = [...paresPorFactura.values()]
    .map((g) => ({ ...g, cobros: g.cobros.filter((c) => c.estado !== "COBRADO") }))
    .filter((g) => g.cobros.length > 0 && pagadaEnOdoo(g.factura));
  const cobradasSinPagar = [...paresPorFactura.values()]
    .map((g) => ({ ...g, cobros: g.cobros.filter((c) => c.estado === "COBRADO") }))
    .filter((g) => g.cobros.length > 0 && estaPorCobrar(g.factura));

  /* ── 1. Lo que no se sabe de quién es ────────────────────────────────────────── */
  const sinCuentaTodos = estado.facturas.filter((f) => !f.cuentaId);
  const sinCuenta = sinCuentaTodos.filter(esDocumentoVivo);
  const porCobrarSinCuenta = sinCuenta.filter(estaPorCobrar);
  const pagadasSinCuenta = sinCuenta.filter((f) => !estaPorCobrar(f));
  const pagadasViejas = anioRef === null ? 0 : pagadasSinCuenta.filter((f) => anioDe(f.invoiceDate) < anioRef).length;
  const notasSinCuentaTodas = sinCuentaTodos.filter((f) => f.moveType === "out_refund" && f.state !== "cancel");
  const notasSinCuenta = notasSinCuentaTodas.filter((f) => !numerosCorregidos.has(f.numero));
  const notasDeCorreccion = notasSinCuentaTodas.length - notasSinCuenta.length;
  const muertasSinCuenta = sinCuentaTodos.length - sinCuenta.length - notasSinCuentaTodas.length;
  if (sinCuentaTodos.length || sinEmparejar.length) {
    const plata = porCobrarSinCuenta.map(plataDeFactura);
    const montos = montosPorMoneda(plata);
    /* ⚠ «INFLADO» sale de lo detectado: las facturas en dólares por cobrar de ESTE balde que tienen su
       gemela exacta en colones. */
    const infladas = porCobrarSinCuenta.filter((f) => f.moneda === "USD" && tieneGemela(f));
    const partes: string[] = [];
    if (porCobrarSinCuenta.length) {
      partes.push(
        `Odoo las emitió, siguen sin pagar y Nexus no sabe de qué cuenta son: su cliente de Odoo no está emparejado. Hasta que se emparejen, el semáforo de cobranza no las ve. Suman ${textoDeMontos(montos)} sin IVA.`,
      );
    } else if (sinCuenta.length) {
      partes.push("Ninguna está por cobrar, pero hasta emparejar su cliente de Odoo no se pueden cruzar con los cobros de Nexus.");
    }
    if (porCobrarSinCuenta.length && pagadasSinCuenta.length) {
      partes.push(
        `Además hay ${pagadasSinCuenta.length} factura(s) ya pagadas${pagadasViejas ? `, ${pagadasViejas} de años anteriores` : ""}: no son plata por cobrar y no suman.`,
      );
    }
    if (estado.cuentasSinVinculo > 0) {
      partes.push(`Falta emparejar ${estado.cuentasSinVinculo} de ${estado.cuentasTotales} clientes que facturan por Odoo.`);
    }
    if (infladas.length) {
      partes.push(
        `⚠ Ese total puede estar INFLADO en ${fmt(infladas.reduce((a, f) => a + netoPorCobrar(f), 0), "USD")}: ${infladas.length === 1 ? "es una factura en dólares que tiene" : `son ${infladas.length} facturas en dólares que tienen`} su gemela exacta en colones (línea «mismo monto en dos monedas»). Si la equivocada es la de dólares, la cifra real en dólares es esa cantidad menor.`,
      );
    }
    if (notasSinCuenta.length) {
      const n = montosPorMoneda(notasSinCuenta.map((f) => ({ monto: f.montoNeto, moneda: f.moneda })));
      partes.push(`Hay ${notasSinCuenta.length} nota(s) de crédito por ${textoDeMontos(n)} que no suman: corrigen facturas, no son plata por cobrar.`);
    }
    if (notasDeCorreccion) {
      partes.push(
        notasDeCorreccion === 1
          ? "La nota de crédito que corrige una factura emitida en la moneda equivocada va en su propia línea."
          : `Las ${notasDeCorreccion} notas de crédito que corrigen facturas emitidas en la moneda equivocada van en su propia línea.`,
      );
    }
    if (muertasSinCuenta > 0) partes.push(`Y ${muertasSinCuenta} documento(s) anulados o revertidos, que tampoco suman.`);
    const numerosSueltos = numerosSinPar.filter((x) => x.porQue === "sin-atribuir");
    if (numerosSueltos.length) {
      partes.push(
        `${numerosSueltos.length} cobro(s) ya tienen anotado el número de una de estas facturas: emparejar su cliente de Odoo con la cuenta del cobro los junta.`,
      );
    }
    if (sinEmparejar.length) {
      partes.push(
        `${sinEmparejar.length} cobro(s) facturados de cuentas sin emparejar no se pueden verificar contra Odoo: no se acusan como «cobro sin factura» y se cuentan acá, sin monto.`,
      );
    }
    agregar({
      codigo: "ODOO-SIN-CUENTA",
      severidad: porCobrarSinCuenta.length ? "ALTA" : "MEDIA",
      titulo: porCobrarSinCuenta.length
        ? `${porCobrarSinCuenta.length} facturas por cobrar de clientes de Odoo que Nexus no tiene emparejados`
        : sinCuenta.length
          ? `${sinCuenta.length} facturas de Odoo sin cuenta, ninguna por cobrar`
          : sinCuentaTodos.length
            ? `${sinCuentaTodos.length} documentos de Odoo sin cuenta, ninguno por cobrar`
            : `${sinEmparejar.length} cobros facturados no se pueden verificar: su cuenta no está emparejada`,
      detalle: partes.join(" "),
      montos,
      plata,
      documentos: [
        ...plata.map((p) => p.clave),
        ...sinEmparejar.map((c) => `c:${c.id}`),
        ...numerosSueltos.map((x) => `c:${x.cobro.id}`),
      ],
      donde: "NEXUS",
      atajo: { etiqueta: "Ir a emparejar", tab: "emparejar" },
      pasos: [
        "Andá a la pestaña «Emparejar» de esta misma pantalla.",
        "Para cada cuenta, confirmá el cliente de Odoo que le corresponde. Las que ya tienen candidato traen la evidencia a la vista; el resto se busca por nombre o cédula.",
        "Si un cliente de Odoo no es cliente nuestro, marcalo como ajeno para que deje de aparecer.",
        "Al confirmar, las facturas de ese cliente pasan a su cuenta en el acto y sus cobros facturados empiezan a verificarse.",
      ],
      queSignificaAceptar:
        "Que estas facturas pueden quedar sin atribuir y esos cobros sin verificar. Casi nunca es lo correcto: lo que corresponde es emparejar.",
      queHacer: "Emparejar los clientes de Odoo con las cuentas de Nexus en /cobranza/odoo.",
      resuelve: "COBRANZA",
      items: [...agruparPorPartner(porCobrarSinCuenta, netoPorCobrar), ...cuentasPorEmparejar(sinEmparejar)],
    });
  }

  /* ── 2. La moneda equivocada ─────────────────────────────────────────────────── */
  if (dosMonedas.length) {
    /* ⚠ El peso se CALCULA. Estaba escrito a mano —«95,8 %»— y lo seguía diciendo cuando el par
       que lo producía (Publimark) ya estaba revertido en Odoo. */
    const totalUsd = vivas.filter((f) => f.moneda === "USD").reduce((a, f) => a + f.montoNeto, 0);
    const mayorEnUsd = Math.max(0, ...dosMonedas.filter((d) => d.monedas.includes("USD")).map((d) => d.monto));
    const peso = totalUsd > 0 ? mayorEnUsd / totalUsd : 0;
    agregar({
      codigo: "ODOO-MONEDA",
      /* Con importes chicos lo peor que puede pasar son unos cientos de dólares: no compite con lo alto. */
      severidad: dosMonedas.some((d) => d.monto >= 1000) ? "ALTA" : "BAJA",
      titulo: `${dosMonedas.length} montos facturados al mismo cliente en DOS monedas distintas`,
      detalle:
        "El mismo cliente tiene facturas vigentes por el importe exacto en dólares y en colones. Con un tipo de cambio de ~500 eso no puede ser casualidad: alguna de las dos salió en la moneda equivocada. " +
        (peso >= 0.01
          ? `La más grande sola pesa el ${(peso * 100).toLocaleString("es-CR", { maximumFractionDigits: 1 })} % de toda la facturación en dólares de la copia de Odoo, así que cualquier número que se mire en dólares está distorsionado hasta que se resuelva.`
          : "Ninguna llega al 1 % de la facturación en dólares de la copia de Odoo: no distorsiona los totales, pero en cada par sigue habiendo un documento mal emitido."),
      montos: montosPorMoneda(dosMonedas.flatMap((d) => d.monedas.map((moneda) => ({ moneda, monto: d.monto })))),
      plata: vivas.filter((f) => tieneGemela(f) && estaPorCobrar(f)).map(plataDeFactura),
      documentos: vivas.filter(tieneGemela).map((f) => `f:${f.id}`),
      donde: "ODOO",
      pasos: [
        "Abrí en Odoo cada par de facturas de la lista de abajo (los números están en cada línea).",
        "Mirá cuál de las dos salió en la moneda que no era. La pista: el importe idéntico en dólares y en colones no puede ser correcto con un tipo de cambio de ~500.",
        "Anulá en Odoo la que está mal y, si hace falta, reemitila en la moneda correcta.",
      ],
      queSignificaAceptar:
        "Que estos pares en dos monedas son correctos y no hay nada que anular. La línea vuelve si aparece un par nuevo o cambia un monto.",
      queHacer: "Revisar cada par en Odoo y anular la que salió en la moneda que no era.",
      resuelve: "DIRECCION",
      items: dosMonedas.map((x) => ({
        texto: `${x.odooPartnerNombre} — el mismo importe, ${fmtMontoLibro(x.monto, null)}, en ${x.monedas.map(nombreDeMoneda).join(" y ")}`,
        monto: x.monto,
        nota: x.numeros.join(" · "),
      })),
    });
  }

  /* ── 3. La moneda equivocada que ya se corrigió ──────────────────────────────── */
  if (corregidas.length) {
    agregar({
      codigo: "ODOO-MONEDA-CORREGIDA",
      severidad: "BAJA",
      titulo:
        corregidas.length === 1
          ? "1 factura salió en la moneda equivocada y ya se corrigió en Odoo"
          : `${corregidas.length} facturas salieron en la moneda equivocada y ya se corrigieron en Odoo`,
      detalle:
        "Se emitieron por un importe que era de la otra moneda, se revirtieron con una nota de crédito en esa misma moneda y se volvieron a emitir en la buena. No es plata por cobrar ni hay que anular nada. " +
        "Se muestran porque la factura revertida y su nota siguen en Odoo por ese importe en la moneda equivocada: un reporte de Odoo que sume esa moneda sin descontar las reversiones sale inflado en esa cifra.",
      montos: montosPorMoneda(corregidas.map((c) => ({ moneda: c.equivocada.moneda, monto: c.monto }))),
      donde: "ODOO",
      pie: "No se cierra sola: la factura revertida y su nota quedan en Odoo. Cuando contabilidad lo confirme, marcala «está bien así».",
      pasos: [
        "Confirmá con contabilidad que cada nota de crédito quedó aplicada a su factura equivocada (Odoo ya da las dos como cerradas).",
        "Si algún reporte de Odoo del año sale con estos importes, pedí que lo saquen sin las facturas revertidas.",
      ],
      queSignificaAceptar:
        "Que contabilidad ya lo confirmó y los reportes no las suman. La línea vuelve si aparece otra factura en la moneda equivocada.",
      queHacer: "Confirmar con contabilidad que la corrección quedó aplicada y fuera de los reportes.",
      resuelve: "DIRECCION",
      items: corregidas.map((c) => ({
        texto: `${c.odooPartnerNombre} — ${c.equivocada.revertidas.join(", ")} en ${nombreDeMoneda(c.equivocada.moneda)} por ${fmt(c.monto, c.equivocada.moneda)}`,
        monto: c.monto,
        moneda: c.equivocada.moneda,
        nota: `revertida con ${c.equivocada.notas.join(", ")} · la buena: ${c.buena.numeros.join(", ")}, en ${nombreDeMoneda(c.buena.moneda)}`,
      })),
    });
  }

  /* ── 4. Notas de crédito sin aplicar ─────────────────────────────────────────── */
  const notasAbiertas = notasDeCreditoSinAplicar(estado.facturas).map((n) => ({
    ...n,
    /* La plata es la de la factura que anula, sin IVA y con su clave: si esa factura ya está en «sin cuenta»,
       el encabezado la cuenta una vez. Sin factura encontrada, lo que la nota tiene sin aplicar, sin IVA. */
    plata: n.anula
      ? plataDeFactura(n.anula)
      : {
          clave: `f:${n.nota.id}`,
          moneda: n.nota.moneda,
          monto: n.nota.montoTotal > 0 ? round2((n.nota.montoNeto * n.saldo) / n.nota.montoTotal) : n.nota.montoNeto,
        },
  }));
  if (notasAbiertas.length) {
    const plata = notasAbiertas.map((n) => n.plata);
    const montos = montosPorMoneda(plata);
    const deEsteAnio = anioRef !== null && notasAbiertas.some((n) => anioDe(n.nota.invoiceDate) >= anioRef);
    agregar({
      codigo: "ODOO-NOTA-SIN-APLICAR",
      severidad: deEsteAnio ? "ALTA" : "MEDIA",
      titulo: `${notasAbiertas.length} notas de crédito en Odoo sin aplicar a su factura`,
      detalle: `Mientras una nota no se aplica, Odoo sigue dando por cobrar la factura que anula, y el cliente figura debiendo lo que ya no debe. Suman ${textoDeMontos(montos)} sin IVA. Cada fila dice qué factura parece anular: mismo cliente, misma moneda y mismo importe.`,
      montos,
      plata,
      /* ⚠ Las notas, no las facturas que parecen anular: esta línea da una pista sobre esa factura, y su casa es otra
         (su cobro, «sin cobro» o «cobrado sin pagar»). Contarla acá también la dejaba en dos líneas. */
      documentos: notasAbiertas.map((n) => `f:${n.nota.id}`),
      donde: "ODOO",
      pasos: [
        "Pasale la lista a contabilidad: cada nota se aplica en Odoo a la factura que anula (al lado dice cuál parece).",
        "Si la factura sí se debe y la nota fue un error, que la anulen.",
        "⚠ No le cobres al cliente una factura de la lista sin mirar su nota primero.",
      ],
      queSignificaAceptar:
        "Que estas notas pueden quedar sin aplicar. ⚠ Mientras tanto Odoo le sigue cobrando al cliente la factura que anulan.",
      queHacer: "Pedirle a contabilidad que aplique cada nota de crédito a su factura.",
      resuelve: "COBRANZA",
      items: notasAbiertas
        .slice()
        .sort((a, b) => b.nota.invoiceDate.localeCompare(a.nota.invoiceDate) || a.nota.odooMoveId - b.nota.odooMoveId)
        .map((n, i) => ({
          texto: `${n.nota.odooPartnerNombre} — ${n.nota.numero} por ${fmt(n.saldo, n.nota.moneda)}`,
          monto: plata[notasAbiertas.indexOf(n)]?.monto ?? i,
          moneda: n.nota.moneda,
          nota: `${n.nota.invoiceDate} · ${
            n.anula
              ? `parece anular ${n.anula.numero}, que Odoo sigue dando por cobrar`
              : "no hay una factura sin pagar de ese cliente por el mismo importe"
          }`,
        })),
    });
  }

  /* ── 5. Montos que no coinciden ──────────────────────────────────────────────── */
  /* ⚠ Una diferencia de exactamente el 13 % es el IVA, y no se acusa (decisión de Alex, 2026-09-12). */
  const esIva = (d: MontoDistinto) =>
    CENTAVOS(d.montoCobro) === CENTAVOS(d.montoFactura * IVA_COSTA_RICA) ||
    CENTAVOS(d.montoFactura) === CENTAVOS(d.montoCobro * IVA_COSTA_RICA);
  const deIva = montosDistintos.filter(esIva);
  const montosReales = montosDistintos.filter((d) => !esIva(d));
  if (montosReales.length) {
    const plata = montosReales.map((d) => ({ clave: `m:${d.facturaId}`, moneda: d.moneda, monto: Math.abs(d.diferencia) }));
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "ODOO-MONTO",
      severidad: "ALTA",
      titulo: `${montosReales.length} cobros con un monto distinto al de su factura`,
      detalle:
        `Nexus dice una cifra y Odoo otra para la misma factura, y no es el IVA ni una factura que cubra varias cuotas. La diferencia total es ${textoDeMontos(montos)}. Puede ser un descuento que se aplicó al facturar, o un error de carga en el plan de pago.` +
        (deIva.length
          ? ` No se cuentan ${deIva.length} cobro(s) que difieren de su factura justo en el 13 %: es el IVA, y ese no se toca.`
          : ""),
      montos,
      plata,
      documentos: montosReales.flatMap((d) => [`f:${d.facturaId}`, ...d.cobroIds.map((id) => `c:${id}`)]),
      donde: "NEXUS",
      pasos: [
        "Abrí el cliente en Cobranza y compará su plan de pago contra la factura de Odoo (el número está en cada línea).",
        "Si el descuento o el ajuste se aplicó al facturar y el plan quedó viejo, corregí el plan en Nexus.",
        "Si el plan estaba bien y la factura salió con otro monto, la corrección va del lado de Odoo.",
      ],
      queSignificaAceptar:
        "Que estas diferencias de monto son esperadas —un descuento pactado, un redondeo— y no hay que corregir nada. Si el monto cambia, la línea vuelve.",
      queHacer: "Comparar cada par y corregir el que esté mal: el plan en Nexus o la factura en Odoo.",
      resuelve: "COBRANZA",
      items: montosReales
        .slice()
        .sort((a, b) => Math.abs(b.diferencia) - Math.abs(a.diferencia))
        .map((d) => ({
          texto: `${d.cuentaNombre} — Nexus ${fmt(d.montoCobro, d.moneda)}${d.cuotas > 1 ? ` en ${d.cuotas} cuotas` : ""} vs Odoo ${fmt(d.montoFactura, d.moneda)}`,
          monto: Math.abs(d.diferencia),
          moneda: d.moneda,
          nota: `factura ${d.numero} · Odoo dice ${d.diferencia > 0 ? "más" : "menos"}: ${fmt(Math.abs(d.diferencia), d.moneda)}`,
        })),
    });
  }

  /* ── 5b. El estado de pago que Nexus y Odoo no dicen igual ──────────────────────
     ⛔ Dos líneas y no una: se cierran al revés. La primera la cierra quien registra el pago en Nexus; la segunda,
     quien encuentra (o no) el depósito. Ninguna mueve un cobro sola: entrar o salir de Cobrado lo firma una persona. */
  const cuotasDe = (cs: readonly CobroParaCruzar[]) => cs.map((c) => `${c.periodo} ${fmt(c.monto, c.moneda)}`).join(" + ");
  /* ⚠ La fila no dice si el par se juntó por el número o por el monto: anotarle el número a un cobro que ya se juntaba
     por monto no puede cambiar la lista (lo vigila «la lista no cambia cuando el número dice lo mismo…»). */
  const sumaDe = (cs: readonly CobroParaCruzar[]) => round2(cs.reduce((a, c) => a + c.monto, 0));
  const nombreDelPar = (g: { factura: FacturaParaCruzar; cobros: readonly CobroParaCruzar[] }) => g.cobros[0]?.cuentaNombre ?? g.factura.odooPartnerNombre;

  if (porCobrarPagadas.length) {
    const cobros = porCobrarPagadas.flatMap((g) => g.cobros);
    const plata = cobros.map((c) => ({ clave: `c:${c.id}`, moneda: c.moneda, monto: c.monto }));
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "ODOO-POR-COBRAR-PAGADA",
      severidad: "ALTA",
      titulo: `${cobros.length} cobros por cobrar en Nexus con su factura ya pagada en Odoo`,
      detalle:
        `Nexus los sigue dando por cobrar —y vencidos, si ya pasó la fecha— y Odoo ya registró el pago de su factura. Lo más probable es que la plata haya entrado y falte registrarla en Nexus. Suman ${textoDeMontos(montos)}. ` +
        "⛔ Nexus no los pasa a Cobrado por lo que diga Odoo: el pago lo registra una persona, con el comprobante.",
      montos,
      plata,
      documentos: porCobrarPagadas.flatMap((g) => [`f:${g.factura.id}`, ...g.cobros.map((c) => `c:${c.id}`)]),
      donde: "NEXUS",
      pasos: [
        "Abrí el cronograma de la cuenta de cada fila.",
        "Si entró la plata, registrá el pago con el comprobante y la fecha en que entró.",
        "Si Odoo registró un pago que no es de esta factura, pedile a contabilidad que lo corrija en Odoo.",
      ],
      queSignificaAceptar:
        "Que estos cobros siguen por cobrar aunque Odoo tenga su factura pagada. ⚠ Mientras tanto cuentan en la cartera vencida y abren alertas.",
      queHacer: "Registrar el pago de cada cobro con su comprobante, desde el cronograma.",
      resuelve: "COBRANZA",
      items: porCobrarPagadas
        .slice()
        .sort((a, b) => sumaDe(b.cobros) - sumaDe(a.cobros) || a.factura.odooMoveId - b.factura.odooMoveId)
        .map((g) => ({
          texto: `${nombreDelPar(g)} — ${g.factura.numero} por ${fmt(sumaDe(g.cobros), g.factura.moneda)}`,
          monto: sumaDe(g.cobros),
          moneda: g.factura.moneda,
          nota: `${cuotasDe(g.cobros)} · ${unicos(g.cobros.map((c) => estadoDelCobro(c.estado))).join(", ")} en Nexus · ${estadoDePagoEnPalabras(g.factura)} en Odoo`,
        })),
    });
  }

  if (cobradasSinPagar.length) {
    /* ⚠ La plata es lo que Odoo deja sin pagar, con la clave de la factura: si una nota de crédito parece anularla, el
       encabezado la cuenta una sola vez (TEC-AE 0200 contra la nota 0250). En una factura de varias cuotas con solo
       algunas cobradas es la factura entera: la pregunta es la misma. */
    const plata = cobradasSinPagar.map((g) => plataDeFactura(g.factura));
    const montos = montosPorMoneda(plata);
    const cobros = cobradasSinPagar.reduce((n, g) => n + g.cobros.length, 0);
    agregar({
      codigo: "ODOO-COBRADO-SIN-PAGAR",
      severidad: "ALTA",
      titulo: `${cobros} cobros en Cobrado con su factura sin pagar en Odoo`,
      detalle:
        `Nexus los da por cobrados y Odoo sigue esperando el pago de su factura. O entró la plata y falta registrarla en Odoo, o no entró y el cobro está en Cobrado de más. Odoo deja sin pagar ${textoDeMontos(montos)} sin IVA. ` +
        "⛔ Lo cobrado se queda cobrado salvo lo que decidió Alex: esta lista es para verificar el depósito, no para sacar de Cobrado en bloque.",
      montos,
      plata,
      documentos: cobradasSinPagar.flatMap((g) => [`f:${g.factura.id}`, ...g.cobros.map((c) => `c:${c.id}`)]),
      donde: "PREGUNTANDO",
      pasos: [
        "Buscá en el banco el depósito de cada fila.",
        "Si entró, pasale el comprobante a contabilidad para que registre el pago en Odoo, y anotá la referencia del depósito en el cobro.",
        "Si no entró, sacalo de Cobrado desde el cronograma, con el motivo. Lo decide una persona: Nexus no lo saca solo.",
        "Si la factura tiene una nota de crédito sin aplicar (está en su línea), mirala antes: puede que no se deba.",
      ],
      queSignificaAceptar:
        "Que Nexus los da por cobrados aunque Odoo tenga su factura sin pagar. Solo tiene sentido si el depósito está verificado y contabilidad lo va a registrar.",
      queHacer: "Verificar el depósito de cada cobro: que contabilidad lo registre en Odoo si entró, o sacarlo de Cobrado si no.",
      resuelve: "COBRANZA",
      items: cobradasSinPagar
        .slice()
        .sort((a, b) => netoPorCobrar(b.factura) - netoPorCobrar(a.factura) || a.factura.odooMoveId - b.factura.odooMoveId)
        .map((g) => ({
          texto: `${nombreDelPar(g)} — ${g.factura.numero} por ${fmt(netoPorCobrar(g.factura), g.factura.moneda)}`,
          monto: netoPorCobrar(g.factura),
          moneda: g.factura.moneda,
          nota: `${cuotasDe(g.cobros)} · cobrado en Nexus · ${estadoDePagoEnPalabras(g.factura)} en Odoo`,
        })),
    });
  }

  /* ── 6. Facturas que cubren varias cuotas ────────────────────────────────────── */
  if (variasCuotas.length) {
    agregar({
      codigo: "ODOO-FACTURA-VARIAS-CUOTAS",
      severidad: "MEDIA",
      titulo: `${variasCuotas.length} facturas de Odoo cubren varias cuotas de Nexus`,
      detalle:
        "Cada factura suma exactamente dos o tres cuotas de su cuenta que no tienen el número anotado, y no hay otra combinación que dé lo mismo. No es un monto distinto ni un cobro sin factura: falta anotar el número de la factura en cada una de esas cuotas, y con eso el cruce las junta sin adivinar. ⚠ La propuesta sale del monto: confirmala antes de anotar.",
      montos: montosPorMoneda(variasCuotas.map((v) => ({ moneda: v.factura.moneda, monto: v.factura.montoNeto }))),
      documentos: variasCuotas.flatMap((v) => [`f:${v.factura.id}`, ...v.cobros.map((c) => `c:${c.id}`)]),
      donde: "NEXUS",
      pasos: [
        "Abrí el cronograma de la cuenta de cada fila.",
        "En cada cuota que nombra la fila, anotá el número de la factura («Agregar número»).",
        "Si alguna cuota no es de esa factura, anotale la suya: el número que anota una persona manda sobre esta propuesta.",
      ],
      queSignificaAceptar:
        "Que esas cuotas se quedan sin número. La lista las va a seguir cruzando por monto, que es justo lo que confunde a las otras líneas.",
      queHacer: "Anotar el número de la factura en cada cuota que cubre.",
      resuelve: "COBRANZA",
      items: variasCuotas.map((v) => ({
        texto: `${v.cobros[0]?.cuentaNombre ?? v.factura.odooPartnerNombre} — ${v.factura.numero} por ${fmt(v.factura.montoNeto, v.factura.moneda)}`,
        monto: v.factura.montoNeto,
        moneda: v.factura.moneda,
        nota: `cubre ${v.cobros.length} cuotas: ${v.cobros.map((c) => `${c.periodo} ${fmt(c.monto, c.moneda)}`).join(" + ")} · ${estadoDePagoEnPalabras(v.factura)}`,
      })),
    });
  }

  /* ── 7. Cobros sin factura — la línea que Alexander pidió primero ─────────────── */
  /* ⚠⚠ Solo lo que se puede VERIFICAR (`clasificarCobrosSinFactura`) y lo que no cubre una factura de
     varias cuotas. Esta línea llegó a decir USD 237.355 sobre facturas que estaban en la copia, sin atribuir. */
  if (acusables.length > 0 && corte !== null) {
    const plata = acusables.map((c) => ({ clave: `c:${c.id}`, moneda: c.moneda, monto: c.monto }));
    const montos = montosPorMoneda(plata);
    /* Si la cuenta tuvo una factura por ese importe y se anuló, eso es lo que hay que decir: no «no se emitió».
       ⚠ Cerca de la fecha de emisión O de la programada. Medido el 2026-09-14: Hotel Alta Las Palomas, cuota de marzo
       marcada facturada el 10-ago; su FAC/2026/0225 es del 5-mar y se revirtió con NC/2026/0019. A 158 días de la
       emisión la pista no aparecía y la fila decía «no tiene factura». */
    const anuladaDe = (c: CobroParaCruzar) =>
      estado.facturas
        .filter(
          (f) =>
            f.cuentaId === c.cuentaId &&
            f.moveType === "out_invoice" &&
            !esDocumentoVivo(f) &&
            f.moneda === c.moneda &&
            CENTAVOS(f.montoNeto) === CENTAVOS(c.monto) &&
            Math.min(dias(f.invoiceDate, c.fechaEmision ?? c.fechaProgramada), dias(f.invoiceDate, c.fechaProgramada)) <= 60,
        )
        .sort((a, b) => a.odooMoveId - b.odooMoveId)[0];
    const notaDe = (f: FacturaParaCruzar) =>
      estado.facturas.find(
        (n) =>
          n.moveType === "out_refund" &&
          n.state !== "cancel" &&
          n.cuentaId === f.cuentaId &&
          n.moneda === f.moneda &&
          CENTAVOS(n.montoNeto) === CENTAVOS(f.montoNeto) &&
          n.invoiceDate >= f.invoiceDate,
      );
    agregar({
      codigo: "ODOO-COBRO-SIN-FACTURA",
      severidad: "ALTA",
      titulo: `${acusables.length} cobros marcados facturados que no tienen factura en Odoo`,
      detalle:
        `Son de cuentas que facturan por Odoo y ya están emparejadas, y se marcaron facturados hasta el ${corte} —${DIAS_DE_GRACIA_DEL_ESPEJO} días antes de la última copia buena de Odoo—, así que Odoo ya tendría que tener su documento y no lo tiene: ni una factura sola ni una que sume varias cuotas. O la factura no se emitió, o se emitió a nombre de una razón social de Odoo que no está vinculada a esta cuenta. Suman ${textoDeMontos(montos)}.` +
        (recientes.length
          ? ` No se cuentan ${recientes.length} cobro(s) facturados después de esa fecha: todavía no pudieron llegar a la copia de Odoo.`
          : ""),
      montos,
      plata,
      donde: "ODOO",
      pasos: [
        "Buscá en Odoo si la factura existe a nombre de otra razón social. Si aparece, el problema es el emparejado: arreglalo en la pestaña «Emparejar».",
        "Si no existe, hay que emitirla en Odoo. Si la fila dice que se anuló, confirmá si el cobro sigue vigente.",
        "Si no correspondía facturarla, sacale la marca de facturado al cobro en Nexus.",
        "Si el cobro está en Cobrado, entró plata sin un documento en Odoo: empezá por esos.",
      ],
      queSignificaAceptar:
        "Que estos cobros pueden estar marcados facturados sin respaldo en Odoo. Solo tiene sentido si sabés que se facturaron por fuera del ERP.",
      queHacer: "Verificar en Odoo si la factura existe; si no existe, emitirla o revertir la marca en Nexus.",
      resuelve: "COBRANZA",
      items: acusables
        .slice()
        .sort((a, b) => b.monto - a.monto)
        .map((c) => {
          const anulada = anuladaDe(c);
          return {
            texto: `${c.cuentaNombre} — ${fmt(c.monto, c.moneda)}`,
            monto: c.monto,
            moneda: c.moneda,
            nota:
              `${c.periodo} · programado ${c.fechaProgramada} · ${c.estado}` +
              (anulada
                ? ` · tenía ${anulada.numero}, ${anulada.state === "cancel" ? "anulada" : "revertida"} en Odoo${
                    notaDe(anulada) ? ` con ${notaDe(anulada)?.numero}` : ""
                  }: si la cuota ya no se debe, decidí qué pasa con ella`
                : cuentasEnMercury.has(c.cuentaId)
                  ? " · ⚠ el Excel de Alexander da otras cuotas de esta cuenta facturadas por Mercury: buscala ahí antes de emitirla en Odoo"
                  : ""),
          };
        }),
    });
  }

  /* ── 7b. Cobros que el Excel de Alexander da facturados por Mercury ──────────────
     ⭐ No se acusan de no tener factura en Odoo: la copia no la va a tener nunca. Lo que falta es su número. Medido el
     2026-09-14: ACCCSA, 5 cuotas de US$712 que el Excel trae como INV-4-1 a INV-4-4 (US$712,50), eran US$3.560 de los
     US$4.740 de «cobros sin factura». No suma: la factura existe, en otra plataforma. */
  if (enMercury.length) {
    const montos = montosPorMoneda(enMercury);
    const porElMes = enMercury.filter((c) => estado.libro.get(c.id)?.porElMes).length;
    agregar({
      codigo: "ODOO-COBRO-FACTURADO-EN-MERCURY",
      severidad: "MEDIA",
      titulo: `${enMercury.length} cobros que el Excel de Alexander da facturados por Mercury no tienen el número anotado`,
      detalle:
        `Son de cuentas que dicen facturar por Odoo, pero el Excel de Alexander los cubre con una factura de Mercury (cada fila dice cuál). Odoo no la va a tener nunca, así que no se acusan como «cobro sin factura»: falta anotar el número de Mercury en cada cuota. Suman ${textoDeMontos(montos)}.` +
        (porElMes
          ? ` ⚠ En ${porElMes === 1 ? "una" : porElMes} la cuota se ata por el mes y el monto del Excel no es exactamente el de Nexus: decidí cuál vale antes de anotar.`
          : ""),
      montos,
      documentos: enMercury.map((c) => `c:${c.id}`),
      donde: "NEXUS",
      pasos: [
        "Abrí el cronograma de la cuenta de cada fila.",
        "En cada cuota, anotá el número de Mercury que dice la fila, con Mercury como plataforma.",
        "Si el monto del Excel no es el de la cuota, decidí cuál vale antes de anotar: Nexus guarda el neto.",
        "Si la cuenta factura todo por Mercury, corregí su vía de cobro en la ficha.",
      ],
      queSignificaAceptar:
        "Que estas cuotas se quedan sin el número de su factura de Mercury. No se acusan como «sin factura», pero nada las puede verificar.",
      queHacer: "Anotar en cada cuota el número de Mercury que dice el Excel de Alexander.",
      resuelve: "COBRANZA",
      items: enMercury
        .slice()
        .sort((a, b) => a.cuentaNombre.localeCompare(b.cuentaNombre) || a.periodo.localeCompare(b.periodo) || a.id.localeCompare(b.id))
        .map((c) => {
          const doc = estado.libro.get(c.id);
          return {
            texto: `${c.cuentaNombre} — ${fmt(c.monto, c.moneda)}`,
            monto: c.monto,
            moneda: c.moneda,
            nota:
              `${c.periodo} · ${estadoDelCobro(c.estado)} · el Excel: ${doc?.numero ?? "una factura de Mercury"}` +
              (doc && doc.total !== null ? ` por ${fmt(doc.total, doc.moneda ?? c.moneda)}` : "") +
              (doc ? ` (${doc.fuente})` : "") +
              (doc?.porElMes ? " · ⚠ atada por el mes: el monto no es el mismo" : ""),
          };
        }),
    });
  }

  /* ── 8. Un número de factura que no lleva a su factura ────────────────────────── */
  /* ⭐ Desde la etapa 8 el cobro con número se aparea POR ESE NÚMERO, y cuando no lo encuentra no se
     le busca otra factura por monto: se dice por qué. Son dos líneas porque piden arreglos opuestos.
     «Odoo no tiene esa factura vigente» se arregla corrigiendo el número o emitiendo la factura; «es
     de otro cliente» se arregla corrigiendo el número o el emparejado, y emitir ahí la duplicaría. */
  const motivoSinPar = (x: NumeroSinPar): string => {
    const d = x.documento;
    switch (x.porQue) {
      case "sin-documento":
        return "Odoo no tiene ese documento";
      case "nota-de-credito":
        return "es una nota de crédito, no una factura";
      case "anulada":
        return d?.state === "cancel" ? "la factura está anulada en Odoo" : "la factura está revertida en Odoo";
      case "otra-moneda":
        return `la factura está en ${d ? nombreDeMoneda(d.moneda) : "otra moneda"}`;
      case "otra-cuenta":
        return `es de ${d?.odooPartnerNombre ?? "otro cliente"}, emparejado con ${(d?.cuentaId && nombreDeCuenta.get(d.cuentaId)) || "otra cuenta"}`;
      case "sin-atribuir":
        return `es de ${d?.odooPartnerNombre ?? "un cliente de Odoo"}, que no está emparejado`;
      case "numero-de-mercury":
        return "es un número de Mercury";
    }
  };
  const itemDeNumero = (x: NumeroSinPar): ItemDiferencia => ({
    texto: `${x.cobro.cuentaNombre} — ${fmt(x.cobro.monto, x.cobro.moneda)}`,
    monto: x.cobro.monto,
    moneda: x.cobro.moneda,
    nota: `${x.numero} · ${motivoSinPar(x)} · ${x.cobro.periodo} · ${x.cobro.estado}`,
  });
  const porMontoDelCobro = (a: NumeroSinPar, b: NumeroSinPar) => b.cobro.monto - a.cobro.monto;
  const plataDeNumero = (x: NumeroSinPar): PlataDeLinea => ({ clave: `c:${x.cobro.id}`, moneda: x.cobro.moneda, monto: x.cobro.monto });

  /* «Odoo no tiene ese documento» solo se afirma sobre lo que la copia ya tuvo tiempo de ver: la misma
     gracia que la línea de cobros sin factura. Una nota de crédito, una anulada o una en otra moneda ya
     están en la copia, así que no esperan. */
  const sinFacturaVigente = numerosSinPar.filter(
    (x) => x.porQue === "sin-documento" || x.porQue === "nota-de-credito" || x.porQue === "anulada" || x.porQue === "otra-moneda",
  );
  const sinFacturaVigenteAcusables = sinFacturaVigente.filter(
    (x) => x.porQue !== "sin-documento" || (corte !== null && (x.cobro.fechaEmision ?? x.cobro.fechaProgramada) <= corte),
  );
  const numerosTodaviaNoVistos = sinFacturaVigente.length - sinFacturaVigenteAcusables.length;
  if (sinFacturaVigenteAcusables.length) {
    const plata = sinFacturaVigenteAcusables.map(plataDeNumero);
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "ODOO-NUMERO-SIN-DOCUMENTO",
      severidad: "ALTA",
      titulo: `${sinFacturaVigenteAcusables.length} cobros anotan una factura que Odoo no tiene vigente`,
      detalle:
        `Cada uno tiene anotado un número de factura de Odoo, pero en su cuenta ese número no es una factura vigente: Odoo no tiene el documento, es una nota de crédito, está anulada o está en otra moneda (cada fila dice cuál). O el número está mal anotado, o la factura que respaldaba el cobro ya no vale. Suman ${textoDeMontos(montos)}.` +
        (numerosTodaviaNoVistos
          ? ` No se cuentan ${numerosTodaviaNoVistos} cobro(s) con un número que la copia de Odoo todavía no pudo ver: se facturaron después de su última lectura buena, con ${DIAS_DE_GRACIA_DEL_ESPEJO} días de gracia.`
          : ""),
      montos,
      plata,
      donde: "NEXUS",
      pasos: [
        "Buscá en Odoo el número de cada fila (al lado dice qué pasa con ese documento).",
        "Si el número está mal anotado, corregilo en el cronograma de la cuenta: «cambiar», al lado del número.",
        "Si la factura se anuló, se revirtió o salió en otra moneda, el cobro necesita una factura vigente: emitila en Odoo y anotá su número en el cobro.",
        "Si no correspondía facturar ese cobro, revertí su factura en Nexus.",
      ],
      queSignificaAceptar:
        "Que estos cobros pueden seguir apuntando a un documento que no es una factura vigente. Casi nunca es lo correcto: o el número está mal, o falta la factura.",
      queHacer: "Buscar cada número en Odoo y corregirlo en el cobro, o emitir la factura vigente que falta.",
      resuelve: "COBRANZA",
      items: sinFacturaVigenteAcusables.slice().sort(porMontoDelCobro).map(itemDeNumero),
    });
  }

  const deOtroCliente = numerosSinPar.filter((x) => x.porQue === "otra-cuenta");
  if (deOtroCliente.length) {
    const plata = deOtroCliente.map(plataDeNumero);
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "ODOO-NUMERO-DE-OTRO-CLIENTE",
      severidad: "ALTA",
      titulo: `${deOtroCliente.length} cobros anotan el número de una factura de otro cliente de Odoo`,
      detalle: `El número anotado en cada cobro es de un documento que Odoo le emitió a un cliente emparejado con OTRA cuenta de Nexus (cada fila dice con cuál). O el número está mal anotado, o ese cliente de Odoo está emparejado con la cuenta equivocada. ⚠ No emitas otra factura: la que dice el número ya existe. Suman ${textoDeMontos(montos)}.`,
      montos,
      plata,
      donde: "NEXUS",
      atajo: { etiqueta: "Ir a emparejar", tab: "emparejar" },
      pasos: [
        "Abrí en Odoo el documento de cada fila y fijate a qué razón social se le emitió.",
        "Si es de otra empresa, el número está mal anotado: corregilo en el cronograma de la cuenta («cambiar», al lado del número).",
        "Si es de esta misma empresa, su cliente de Odoo está emparejado con la cuenta equivocada: corregilo en la pestaña «Emparejar».",
      ],
      queSignificaAceptar:
        "Que estos cobros pueden quedar apuntando a una factura emitida a otra cuenta. Solo tendría sentido si las dos cuentas fueran la misma empresa, y eso se arregla emparejando, no aceptando.",
      queHacer: "Corregir el número en el cobro o, si es la misma empresa, el emparejado del cliente de Odoo.",
      resuelve: "COBRANZA",
      items: deOtroCliente.slice().sort(porMontoDelCobro).map(itemDeNumero),
    });
  }

  /* ── 9. Facturas atribuidas sin cobro que las explique ───────────────────────── */
  /* ⚠ Y tampoco las anteriores al PRIMER cobro que Nexus tiene cargado de esa cuenta. Medido el
     2026-09-12: 78 de los 170 documentos que se atribuyen al vincular son de antes de que Nexus
     planificara la cuenta —hay facturas de 2021—. Son historia, no un servicio sin cargar.
     ⚠ Una cuenta sin ningún cobro no tiene «antes»: cuentan sus facturas de este año y las que siguen sin
     pagar. Medido el 2026-09-13: JUDESUR metía ₡21,2 millones de 2024 y 2025 ya pagados, el 97 % de la
     línea, y tapaba la única factura suya de este año. */
  const primerCobro = new Map<string, string>();
  for (const c of estado.cobros) {
    const p = primerCobro.get(c.cuentaId);
    if (p === undefined || c.fechaProgramada < p) primerCobro.set(c.cuentaId, c.fechaProgramada);
  }
  /* ⚠ Una factura que Odoo sigue dando por cobrar nunca es historia, sea del año que sea: es plata que el cliente debe
     y que ningún cobro de Nexus va a perseguir. Hasta el 2026-09-14 eso valía solo para las cuentas sin cobros. */
  const antesDelPrimerCobro = (f: FacturaParaCruzar) => {
    const p = f.cuentaId ? primerCobro.get(f.cuentaId) : undefined;
    return p !== undefined && f.invoiceDate < p;
  };
  const esHistoria = (f: FacturaParaCruzar) => {
    if (estaPorCobrar(f)) return false;
    const p = f.cuentaId ? primerCobro.get(f.cuentaId) : undefined;
    if (p !== undefined) return f.invoiceDate < p;
    return anioRef !== null && anioDe(f.invoiceDate) < anioRef;
  };
  const huerfanas = [...cruce.facturasSolas, ...facturasSoltadas].filter(
    (f) => f.cuentaId && !liberadas.has(f.numero) && !facturasEnVarias.has(f.id) && !tieneGemela(f),
  );
  const historia = huerfanas.filter(esHistoria);
  const facturasSinCobro = huerfanas.filter((f) => !esHistoria(f));
  if (facturasSinCobro.length) {
    const plata = facturasSinCobro.map((f) => ({ clave: `f:${f.id}`, moneda: f.moneda, monto: f.montoNeto }));
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "ODOO-FACTURA-SIN-COBRO",
      severidad: "MEDIA",
      titulo: `${facturasSinCobro.length} facturas de Odoo sin un cobro que las explique`,
      detalle:
        `Se le facturó a un cliente que Nexus conoce, pero no hay ningún cobro planificado que corresponda, ni solo ni sumando cuotas. Puede ser algo que se facturó fuera del plan, un servicio que falta cargar o una deuda de antes de que Nexus planificara la cuenta, que Odoo sigue dando por cobrar. Suman ${textoDeMontos(montos)} sin IVA.` +
        (historia.length
          ? ` No se cuentan ${historia.length} factura(s) ya pagadas de antes del primer cobro que Nexus tiene cargado de su cuenta, o de años anteriores en cuentas sin cobros: son historia.`
          : ""),
      montos,
      plata,
      donde: "NEXUS",
      pasos: [
        "Si es de un servicio vigente, falta cargar ese servicio o su plan de pago en Cobranza.",
        "Si el cliente está mal emparejado, la factura es de otro: arreglalo en «Emparejar».",
        "Si es algo que Nexus no planifica, marcá la línea «está bien así».",
      ],
      queSignificaAceptar:
        "Que estas facturas son de cosas que Nexus no planifica. La línea vuelve si aparece una factura nueva.",
      queHacer: "Revisar si falta cargar el servicio en Nexus, o si es facturación que Nexus no planifica.",
      resuelve: "COBRANZA",
      items: facturasSinCobro
        .slice()
        .sort((a, b) => b.montoNeto - a.montoNeto)
        .slice(0, 60)
        .map((f) => ({
          texto: `${f.odooPartnerNombre} — ${fmt(f.montoNeto, f.moneda)}`,
          monto: f.montoNeto,
          moneda: f.moneda,
          nota:
            `${f.numero} · ${f.invoiceDate} · ${estadoDePagoEnPalabras(f)}` +
            (antesDelPrimerCobro(f) ? " · de antes del primer cobro que Nexus tiene de la cuenta" : ""),
        })),
    });
  }

  /* ── 10 y 11. Las facturas que Nexus soltó y alguien tiene que anular ────────── */
  const pendientes = liberacionesPendientes(estado.liberaciones, estado.facturas);
  /* Una pista para las que no tienen número: en su cuenta, una factura ya revertida o anulada por el mismo
     importe cerca de la fecha, o ninguna factura en Odoo (entonces no se emitió acá). Medido el 2026-09-13:
     Honda ya estaba revertida (FAC/2026/0340 con NC/2026/0018); Kaizen y Wherex no tienen nada en Odoo. */
  const pistaDeLiberacion = (l: LiberacionParaCruzar): string | null => {
    const deLaCuenta = estado.facturas.filter((f) => f.cuentaId === l.cuentaId);
    if (!deLaCuenta.length) return "este cliente no tiene ninguna factura en Odoo: probablemente se emitió en Mercury o QuickBooks";
    const referencia = l.fechaEmision ?? `${l.periodo}-15`;
    const [muerta] = deLaCuenta
      .filter(
        (f) =>
          f.moveType === "out_invoice" &&
          !esDocumentoVivo(f) &&
          f.moneda === l.moneda &&
          CENTAVOS(f.montoNeto) === CENTAVOS(l.monto) &&
          dias(f.invoiceDate, referencia) <= 30,
      )
      .sort((a, b) => dias(a.invoiceDate, referencia) - dias(b.invoiceDate, referencia) || a.odooMoveId - b.odooMoveId);
    if (!muerta) return null;
    const nota = deLaCuenta.find(
      (n) =>
        n.moveType === "out_refund" &&
        n.state !== "cancel" &&
        n.moneda === muerta.moneda &&
        CENTAVOS(n.montoNeto) === CENTAVOS(muerta.montoNeto) &&
        n.invoiceDate >= muerta.invoiceDate,
    );
    return `parece ser ${muerta.numero}, ya ${muerta.state === "cancel" ? "anulada" : "revertida"}${nota ? ` con ${nota.numero}` : ""}: si es esa, marcala resuelta`;
  };
  const itemDeLiberacion = (p: LiberacionPendiente): ItemDiferencia => {
    const pista = p.porQue === "sin-numero" ? pistaDeLiberacion(p.liberacion) : null;
    return {
      id: p.liberacion.id,
      texto: `${p.liberacion.clienteNombre} — ${fmt(p.liberacion.monto, p.liberacion.moneda)}`,
      monto: p.liberacion.monto,
      moneda: p.liberacion.moneda,
      nota:
        `${p.liberacion.referenciaExterna ?? "sin número"} · cuota ${p.liberacion.numCuota ?? "?"} · ` +
        `${p.liberacion.decision === "CANCELAR" ? "anular" : "revertir"} · ` +
        `soltada por ${p.liberacion.liberadaPor} el ${p.liberacion.liberadaEn}` +
        (p.porQue !== "sin-numero"
          ? ""
          : p.liberacion.referenciaExterna
            ? " · ⚠ ese número no es de un documento de Odoo"
            : " · ⚠ sin número de documento") +
        (pista ? ` · ${pista}` : ""),
    };
  };
  const plataDeLiberacion = (p: LiberacionPendiente): PlataDeLinea => ({
    clave: `l:${p.liberacion.id}`,
    moneda: p.liberacion.moneda,
    monto: p.liberacion.monto,
  });

  /* ⚠⚠ Las de Odoo se parten en DOS líneas, y no es cosmético: **se cierran de maneras
     distintas**. Con número, la copia ve el documento anularse y la línea desaparece sola. Sin
     número no hay nada contra qué mirar — y hasta la etapa 7 el número solo se escribía al
     REGISTRAR EL PAGO, así que un cobro facturado-y-no-cobrado (que es justo la población que se
     libera) llegaba casi siempre sin él. Juntas en una sola línea, la mitad sin número quedaba
     esperando para siempre una copia que no la puede ver, bajo un texto que prometía lo
     contrario. */
  const enOdooSinNumero = pendientes.filter((p) => p.liberacion.plataforma === "ODOO" && p.porQue === "sin-numero");
  const enOdoo = pendientes.filter((p) => p.liberacion.plataforma === "ODOO" && p.porQue !== "sin-numero");
  if (enOdoo.length) {
    const plata = enOdoo.map(plataDeLiberacion);
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "ODOO-LIBERADAS-PENDIENTES",
      severidad: "ALTA",
      titulo: `${enOdoo.length} facturas que Nexus soltó siguen emitidas en Odoo`,
      detalle:
        `Al recuadrar un acuerdo de pago, alguien decidió que estas facturas ya no aplican y las soltó de su cobro. ` +
        `Nexus NO escribe en el ERP: los documentos siguen ahí, emitidos contra clientes que ya no deben ese monto. ` +
        `Suman ${textoDeMontos(montos)}.`,
      montos,
      plata,
      /* La casa de la factura soltada es esta línea: por eso `huerfanas` no la cuenta como «sin cobro». */
      documentos: enOdoo.flatMap((p) => {
        const n = numeroVerificableEnOdoo(p.liberacion.referenciaExterna);
        return n === null ? [] : estado.facturas.filter((f) => normalizarNumeroFactura(f.numero) === n).map((f) => `f:${f.id}`);
      }),
      /* ⚠ Severidad ALTA con dueño en COBRANZA: es la línea que evita que «Nexus no escribe en
         el ERP» se convierta en «Nexus pide y nadie hace». */
      donde: "ODOO",
      pasos: [
        "Abrí Odoo y buscá cada documento por su número.",
        "Las que dicen «anular»: cancelalas o borralas según lo que permita el estado del documento.",
        "Las que dicen «revertir»: emitile una nota de crédito por el mismo monto y moneda.",
        "Con la próxima copia de Odoo salen de esta lista solas. No hay que marcar nada acá.",
      ],
      queSignificaAceptar:
        "Que estas facturas se pueden quedar como están. ⚠ Es plata emitida contra un cliente que no la debe: aceptarlo es una decisión contable, no una limpieza de pantalla.",
      queHacer: "Anular o revertir en Odoo cada documento de la lista, según lo que se decidió al soltarlo.",
      resuelve: "COBRANZA",
      items: enOdoo.sort((a, b) => b.liberacion.monto - a.liberacion.monto).map(itemDeLiberacion),
    });
  }

  if (enOdooSinNumero.length) {
    const plata = enOdooSinNumero.map(plataDeLiberacion);
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "ODOO-LIBERADAS-SIN-NUMERO",
      severidad: "ALTA",
      titulo: `${enOdooSinNumero.length} facturas soltadas sin número de documento`,
      detalle: `Se soltaron como de Odoo, pero sin un número de documento de Odoo —el cobro no lo tenía, o tenía otro número, como el de una transferencia—, así que la copia de Odoo no tiene contra qué compararlas: no se pueden cerrar solas. Pasa con los cobros facturados antes de que «Marcar facturado» pidiera el número. Cada fila dice lo que se encontró: una factura ya revertida por el mismo importe, o un cliente sin ninguna factura en Odoo. Suman ${textoDeMontos(montos)}.`,
      montos,
      plata,
      donde: "ODOO",
      /* ⚠ Sin esto hereda el pie genérico de ODOO, que promete que la línea se actualiza sola. */
      pie: "No hay número para verificarlas con la copia de Odoo: se cierran acá, a mano.",
      pasos: [
        "Si la fila dice «parece ser», abrí ese documento en Odoo: si es el de la cuota y ya está revertido, marcala resuelta.",
        "Si dice que el cliente no tiene facturas en Odoo, se emitió en Mercury o QuickBooks: anulala allá y marcala resuelta.",
        "Si no dice nada, buscá el documento en Odoo por cliente, monto y fecha, anulalo o emitile la nota de crédito, y marcala resuelta.",
        "Para que no vuelva a pasar: los cobros facturados sin número muestran «Agregar número» en el cronograma de la cuenta. Completalos antes de soltar otra factura.",
      ],
      queSignificaAceptar:
        "Que estos documentos se quedan como están. ⚠ Nadie los va a volver a mirar: no hay número que la copia de Odoo pueda seguir.",
      queHacer: "Ubicar el documento en Odoo por cliente y monto, anularlo, y marcar la liberación resuelta.",
      accionPorItem: {
        etiqueta: "Ya está anulada",
        ayuda: "Marcala solo después de verlo anulado en Odoo. Sin número, nada lo verifica por vos.",
      },
      resuelve: "COBRANZA",
      items: enOdooSinNumero.sort((a, b) => b.liberacion.monto - a.liberacion.monto).map(itemDeLiberacion),
    });
  }

  const fueraDeOdoo = pendientes.filter((p) => p.liberacion.plataforma !== "ODOO");
  if (fueraDeOdoo.length) {
    const plata = fueraDeOdoo.map(plataDeLiberacion);
    const montos = montosPorMoneda(plata);
    agregar({
      codigo: "LIBERADAS-FUERA-DE-ODOO",
      severidad: "ALTA",
      titulo: `${fueraDeOdoo.length} facturas soltadas se emitieron fuera de Odoo`,
      detalle: `Se facturaron por Mercury o QuickBooks, así que la copia de Odoo no las va a ver nunca y esta línea NO se cierra sola. La cierra una persona, cuando confirma que el documento se anuló allá. Suman ${textoDeMontos(montos)}.`,
      montos,
      plata,
      donde: "MERCURY",
      pasos: [
        "Entrá a la plataforma donde se emitió (Mercury o QuickBooks) y buscá el documento.",
        "Anulalo o emitile la nota de crédito, según lo que se decidió al soltarlo.",
        "Volvé acá y marcala resuelta: nada lo puede verificar por vos.",
      ],
      queSignificaAceptar:
        "Que estos documentos se quedan como están. ⚠ Nadie los va a volver a mirar: Nexus no tiene copia de esas plataformas.",
      queHacer: "Anular el documento en la plataforma donde se emitió y marcar la liberación resuelta.",
      /* ⚠ Acción por fila porque no hay copia que la pueda cerrar. Sin esto el texto manda a marcarla
         resuelta en un botón que no existe. */
      accionPorItem: {
        etiqueta: "Ya está anulada",
        ayuda: "Marcala solo después de verlo anulado en la plataforma. Nada lo verifica por vos.",
      },
      resuelve: "COBRANZA",
      items: fueraDeOdoo.sort((a, b) => b.liberacion.monto - a.liberacion.monto).map(itemDeLiberacion),
    });
  }

  /* ── 12. Pagos registrados sin conciliar con el banco ────────────────────────── */
  /* ⭐ Hasta el 2026-09-13 esta línea preguntaba qué significaba el estado y ofrecía «encender la promoción».
     Los datos ya lo contestan: medido ese día, las 181 facturas en ese estado tienen saldo 0 en Odoo. Es
     «pago registrado, falta cruzarlo con el estado de cuenta del banco», casi todo de 2021–2022. No es plata
     por cobrar, así que informa y no suma. La bandera de la promoción a verde sigue apagada: es otra
     decisión (docs/odoo-decisiones.md). */
  const enPago = vivas.filter((f) => f.paymentState === "in_payment");
  if (enPago.length) {
    const recientesPago = anioRef === null ? enPago : enPago.filter((f) => anioDe(f.invoiceDate) >= anioRef - 1);
    const viejasPago = enPago.filter((f) => !recientesPago.includes(f));
    const sinSaldo = enPago.filter((f) => CENTAVOS(f.montoResidual) === 0).length;
    const montos = montosPorMoneda(enPago.map((f) => ({ moneda: f.moneda, monto: f.montoNeto })));
    const aniosDe = (fs: readonly FacturaParaCruzar[]) => {
      const as = fs.map((f) => anioDe(f.invoiceDate));
      const [min, max] = [Math.min(...as), Math.max(...as)];
      return min === max ? `de ${min}` : `de ${min} a ${max}`;
    };
    const periodoReciente = anioRef === null ? "" : ` de ${anioRef - 1} y ${anioRef}`;
    agregar({
      codigo: "ODOO-IN-PAYMENT",
      severidad: "BAJA",
      titulo: recientesPago.length
        ? `${recientesPago.length} facturas${periodoReciente} figuran pagadas en Odoo, pero el pago no está conciliado con el banco`
        : `${enPago.length} facturas ${aniosDe(enPago)} figuran pagadas en Odoo, pero el pago no está conciliado con el banco`,
      detalle: [
        sinSaldo === enPago.length
          ? "Odoo ya registró el pago de cada una y no les deja saldo: falta cruzar ese pago con el estado de cuenta del banco."
          : `Odoo registró el pago y falta cruzarlo con el estado de cuenta del banco. ${sinSaldo} de ${enPago.length} ya no tienen saldo.`,
        "No es plata por cobrar y no suma a lo que no cuadra.",
        recientesPago.length && viejasPago.length ? `Hay ${viejasPago.length} más, ${aniosDe(viejasPago)}, en la misma situación.` : "",
        `Suman ${textoDeMontos(montos)} sin IVA.`,
      ]
        .filter(Boolean)
        .join(" "),
      montos,
      donde: "ODOO",
      pie: "Se actualiza sola con la próxima copia de Odoo, a medida que contabilidad concilie.",
      pasos: [
        recientesPago.length
          ? `Pasale la lista a contabilidad para que concilie con el banco los pagos${periodoReciente}.`
          : "Pasale la lista a contabilidad para que concilie esos pagos con el banco.",
        "Los de años anteriores no mueven la cobranza de hoy: que los concilie cuando cierre esos años.",
      ],
      queSignificaAceptar:
        "Que contabilidad ya tiene la lista. ⚠ Aceptarla no pone ningún cobro en verde: un cobro pasa a Cobrado solo cuando una persona registra el pago.",
      queHacer: "Pasarle la lista a contabilidad para conciliar esos pagos con el banco.",
      resuelve: "COBRANZA",
      items: [
        ...agruparPorPartner(recientesPago, (f) => f.montoNeto),
        ...[...new Set(viejasPago.map((f) => anioDe(f.invoiceDate)))]
          .sort((a, b) => b - a)
          .map((anio) => {
            const delAnio = viejasPago.filter((f) => anioDe(f.invoiceDate) === anio);
            return {
              texto: `${anio} — ${delAnio.length} factura${delAnio.length === 1 ? "" : "s"}`,
              nota: textoDeMontos(montosPorMoneda(delAnio.map((f) => ({ moneda: f.moneda, monto: f.montoNeto })))),
            };
          }),
      ],
    });
  }

  /* ── 13. Las exentas ─────────────────────────────────────────────────────────── */
  /* ⚠ Solo las del año: medido el 2026-09-13, 13 de las 21 eran historia pagada, y la frase «no se puede
     decidir por país» era falsa para los colones (un ente público y una empresa mexicana). La plata que
     importa es el impuesto que habría faltado, no el neto. */
  const exentas = vivas.filter((f) => f.montoImpuesto === 0);
  const exentasDelAnio = anioRef === null ? exentas : exentas.filter((f) => anioDe(f.invoiceDate) === anioRef);
  if (exentasDelAnio.length) {
    const impuesto = montosPorMoneda(exentasDelAnio.map((f) => ({ moneda: f.moneda, monto: round2(f.montoNeto * (IVA_COSTA_RICA - 1)) })));
    const anteriores = exentas.length - exentasDelAnio.length;
    agregar({
      codigo: "ODOO-EXENTAS",
      severidad: "BAJA",
      titulo: `${exentasDelAnio.length} facturas${anioRef === null ? "" : ` de ${anioRef}`} salieron sin impuesto`,
      detalle:
        `Pueden ser exenciones legítimas —un cliente del exterior, un ente público— o impuesto que faltó cargar. Importa porque el borrador de cobro le dice al cliente un monto sin impuesto, y la factura que recibe puede traerlo. Si todas debían llevarlo, faltarían ${textoDeMontos(impuesto)} de IVA.` +
        (anteriores ? ` No se cuentan ${anteriores} de años anteriores.` : ""),
      montos: impuesto,
      donde: "PREGUNTANDO",
      pasos: [
        "Pasale la lista al contador y confirmá cuáles son exenciones reales (cada fila dice si la cuenta es nacional o internacional).",
        "Si alguna debía llevar impuesto, hay que corregir la factura en Odoo.",
      ],
      queSignificaAceptar:
        "Que las exenciones están confirmadas por el contador. La línea vuelve si aparece una factura exenta nueva.",
      queHacer: "Confirmar con el contador cuáles son exenciones reales.",
      resuelve: "DIRECCION",
      items: agruparPorPartner(exentasDelAnio, (f) => f.montoNeto, (fs) => {
        const tipo = fs[0]?.cuentaId ? tipoDeCuenta.get(fs[0].cuentaId) : undefined;
        return tipo === "INTERNACIONAL" ? "cuenta internacional" : tipo === "NACIONAL" ? "cuenta nacional" : "sin cuenta en Nexus";
      }),
    });
  }

  /* ── 14. La vía de cobro por defecto en cuentas que no facturan por Odoo ─────── */
  /* ⚠ La vía de cobro nace en ODOO. Cuentas internacionales que facturan por Mercury la arrastran
     sin que nadie la haya elegido, y ese default mentiroso es lo que hace que una liberación
     salga con la plataforma equivocada y termine en la lista de Odoo, esperando una copia que
     nunca la va a cerrar. Salen como línea propia, para revisarlas una por una: corregirlas a
     ciegas sería cambiar un default equivocado por otro. ⭐ La evidencia va en la NOTA de la fila y no
     en su texto, para que una línea ya aceptada no se reabra solo por anotarle un número. */
  const conEvidencia = viaDudosa.filter((c) => numerosDeMercury.has(c.id)).length;
  if (viaDudosa.length) {
    const facturasDe = new Map<string, number>();
    for (const f of estado.facturas) if (f.cuentaId) facturasDe.set(f.cuentaId, (facturasDe.get(f.cuentaId) ?? 0) + 1);
    const sinVerificarDe = new Map<string, number>();
    for (const c of sinEmparejarDudosas) sinVerificarDe.set(c.cuentaId, (sinVerificarDe.get(c.cuentaId) ?? 0) + 1);
    agregar({
      codigo: "CUENTA-INTERNACIONAL-EN-ODOO",
      severidad: "MEDIA",
      titulo: viaDudosa.every((c) => c.tipo === "INTERNACIONAL")
        ? `${viaDudosa.length} cuentas internacionales dicen facturar por Odoo`
        : `${viaDudosa.length} cuentas dicen facturar por Odoo y puede que no lo hagan`,
      /* No hay monto: el problema no es plata mal contada, es una etiqueta que manda a buscar
         al lugar equivocado. */
      montos: [],
      /* La casa de sus cobros sin verificar y de los que llevan un número de Mercury: ninguna otra línea los mira. */
      documentos: [
        ...sinEmparejarDudosas.map((c) => `c:${c.id}`),
        ...numerosSinPar.filter((x) => x.porQue === "numero-de-mercury" && idsDudosas.has(x.cobro.cuentaId)).map((x) => `c:${x.cobro.id}`),
      ],
      detalle:
        "Figuran como que facturan por Odoo porque es lo que trae la cuenta al crearse, no porque alguien lo haya elegido. Importa porque decide dónde se va a buscar una factura cuando haya que anularla, y una cuenta internacional que factura por Mercury mandaría a alguien a buscar en el sistema equivocado. No se puede corregir a ciegas: hay internacionales que sí facturan por Odoo. Cada fila dice cuántas facturas tiene en Odoo." +
        (conEvidencia
          ? ` ${conEvidencia === 1 ? "Una tiene" : `${conEvidencia} tienen`} cobros con un número de factura de Mercury (INV-…): es la evidencia más directa de dónde factura de verdad.`
          : "") +
        (sinEmparejarDudosas.length
          ? ` Sus ${sinEmparejarDudosas.length} cobro(s) facturados no se pueden verificar contra Odoo y se cuentan acá, no como clientes por emparejar.`
          : ""),
      donde: "PREGUNTANDO",
      pasos: [
        "Por cada cuenta, mirá una factura real y confirmá en qué plataforma se emitió.",
        "Corregí la vía de cobro en la ficha de la cuenta.",
        "Al soltar una factura, el diálogo ya avisa de esta contradicción y lo que se elija ahí corrige la cuenta sola.",
      ],
      queSignificaAceptar:
        "Que estas cuentas sí facturan por Odoo aunque sean internacionales. La línea vuelve si aparece una cuenta internacional nueva con el default puesto.",
      queHacer: "Confirmar con finanzas en qué plataforma factura cada una y corregir la vía de cobro.",
      resuelve: "COBRANZA",
      items: viaDudosa
        .slice()
        .sort((a, b) => a.nombre.localeCompare(b.nombre))
        .map((c) => {
          const base = c.tipo === "INTERNACIONAL" ? "internacional · vía de cobro: Odoo (por defecto)" : "vía de cobro: Odoo";
          const n = facturasDe.get(c.id) ?? 0;
          const enOdooTexto = n === 0 ? "ninguna factura en Odoo" : `${n} documento${n === 1 ? "" : "s"} en Odoo`;
          const sinVerificar = sinVerificarDe.get(c.id);
          const ns = numerosDeMercury.get(c.id);
          return {
            texto: c.nombre,
            nota:
              `${base} · ${enOdooTexto}` +
              (sinVerificar ? ` · ${sinVerificar} cobro${sinVerificar === 1 ? "" : "s"} facturado${sinVerificar === 1 ? "" : "s"} sin verificar` : "") +
              (ns ? ` · ⚠ tiene facturas con número de Mercury: ${ns.join(", ")}` : ""),
          };
        }),
    });
  }

  /* «Ya contado en»: la primera línea de arriba que ya suma TODOS los documentos de esta. Solo es una marca
     para quien lee: el encabezado no la necesita, porque cuenta cada documento una vez por su clave. */
  out.forEach((linea, i) => {
    if (!linea.plata.length) return;
    const claves = linea.plata.map((p) => p.clave);
    const contenedora = out.slice(0, i).find((o) => {
      const suyas = new Set(o.plata.map((p) => p.clave));
      return claves.every((c) => suyas.has(c));
    });
    if (contenedora) linea.yaContadoEn = contenedora.codigo;
  });

  const en = (d: DiferenciaOdoo, moneda: string) => d.montos.find((m) => m.moneda === moneda)?.monto ?? 0;
  const lineas = out.sort(
    (a, b) =>
      Number(a.aceptada) - Number(b.aceptada) ||
      (SEVERIDAD_ORDEN[a.severidad] ?? 3) - (SEVERIDAD_ORDEN[b.severidad] ?? 3) ||
      en(b, "USD") - en(a, "USD") ||
      en(b, "CRC") - en(a, "CRC") ||
      (b.montoEnJuego ?? -1) - (a.montoEnJuego ?? -1),
  );
  const juntados = new Set([
    ...cruce.pares.flatMap((p) => [`f:${p.facturaId}`, `c:${p.cobroId}`]),
    ...deIva.flatMap((d) => [`f:${d.facturaId}`, ...d.cobroIds.map((id) => `c:${id}`)]),
  ]);
  return { lineas, juntados };
}

/* ── La cobertura: que nada se caiga de la lista ni esté dos veces ──────────────── */

export interface CoberturaDelCruce {
  /** Facturas por cobrar de cuentas emparejadas que no están juntadas con un cobro ni en ninguna línea. */
  facturasSinCasa: FacturaParaCruzar[];
  /** Las que están en más de una línea, con los códigos. */
  facturasRepetidas: Array<{ factura: FacturaParaCruzar; lineas: string[] }>;
  /** Cobros facturados y verificables que no están juntados con su factura ni en ninguna línea. */
  cobrosSinCasa: CobroParaCruzar[];
  cobrosRepetidos: Array<{ cobro: CobroParaCruzar; lineas: string[] }>;
}

/**
 * ¿Algo que no cuadra se cae de la lista, o está dos veces? Toda factura viva, sin pagar, de una cuenta emparejada, y
 * todo cobro facturado que la copia de Odoo ya pudo ver (cuenta que factura por Odoo, emparejada, antes del corte)
 * termina juntado con su par o en la casa de exactamente una línea (`DiferenciaOdoo.documentos`). Juntado y en una
 * línea también vale: es un par cuyo estado de pago no coincide.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * Medido el 2026-09-14, después de cargar el Excel de Alexander: TEC-AE FAC/2026/0298 (US$4.860, sin pagar) no estaba
 * en ninguna línea, ni antes ni después de la carga; se había caído entre «montos distintos» y «varias cuotas». Cada
 * línea nueva tiene su prueba; esta es la que caza lo que no tiene línea.
 */
export function coberturaDelCruce(estado: EstadoDelCruce): CoberturaDelCruce {
  const { lineas, juntados } = detectar(estado);
  const casas = new Map<string, string[]>();
  for (const l of lineas) for (const d of l.documentos) casas.set(d, [...(casas.get(d) ?? []), l.codigo]);
  const corte = estado.ultimaCorridaOk ? restarDias(estado.ultimaCorridaOk, DIAS_DE_GRACIA_DEL_ESPEJO) : null;
  const viaDe = new Map(estado.cuentas.map((c) => [c.id, c.viaCobro]));
  const out: CoberturaDelCruce = { facturasSinCasa: [], facturasRepetidas: [], cobrosSinCasa: [], cobrosRepetidos: [] };

  for (const f of estado.facturas) {
    if (!estaPorCobrar(f) || !f.cuentaId || !estado.cuentasVinculadas.has(f.cuentaId)) continue;
    const ls = casas.get(`f:${f.id}`) ?? [];
    if (ls.length > 1) out.facturasRepetidas.push({ factura: f, lineas: ls });
    else if (!ls.length && !juntados.has(`f:${f.id}`)) out.facturasSinCasa.push(f);
  }
  for (const c of estado.cobros) {
    const facturadoEl = c.fechaEmision ?? (c.estado === "COBRADO" ? c.fechaProgramada : null);
    if (!facturadoEl || corte === null || facturadoEl > corte) continue;
    if ((c.plataformaFactura ?? viaDe.get(c.cuentaId)) !== "ODOO" || !estado.cuentasVinculadas.has(c.cuentaId)) continue;
    const ls = casas.get(`c:${c.id}`) ?? [];
    if (ls.length > 1) out.cobrosRepetidos.push({ cobro: c, lineas: ls });
    else if (!ls.length && !juntados.has(`c:${c.id}`)) out.cobrosSinCasa.push(c);
  }
  return out;
}

/**
 * El encabezado de la lista: cuántas líneas están abiertas y cuánta plata no cuadra, por moneda, contando
 * cada documento UNA vez aunque lo miren varias líneas. Las aceptadas no cuentan.
 *
 * ⛔ Nunca una sola cifra: con colones y dólares, son dos.
 */
export function resumenDeDiferencias(lineas: readonly DiferenciaOdoo[]): {
  abiertas: number;
  plata: MontoEnMoneda[];
  documentos: number;
} {
  const abiertas = lineas.filter((l) => !l.aceptada);
  const unicas = new Map<string, PlataDeLinea>();
  for (const l of abiertas) for (const p of l.plata) if (!unicas.has(p.clave)) unicas.set(p.clave, p);
  return { abiertas: abiertas.length, plata: montosPorMoneda([...unicas.values()]), documentos: unicas.size };
}

/** Las cuentas sin emparejar que tienen cobros facturados: por dónde conviene empezar a emparejar. */
function cuentasPorEmparejar(cobros: readonly CobroParaCruzar[]): ItemDiferencia[] {
  const g = new Map<string, { nombre: string; n: number }>();
  for (const c of cobros) {
    const p = g.get(c.cuentaId) ?? { nombre: c.cuentaNombre, n: 0 };
    p.n++;
    g.set(c.cuentaId, p);
  }
  return [...g.values()]
    .sort((a, b) => b.n - a.n || a.nombre.localeCompare(b.nombre))
    .map(({ nombre, n }) => ({
      texto: `${nombre} — cuenta sin emparejar`,
      nota: `${n} cobro${n === 1 ? "" : "s"} facturado${n === 1 ? "" : "s"} sin verificar`,
    }));
}

/** Agrupa por cliente y moneda para que una lista de 347 filas sea legible. */
function agruparPorPartner(
  facturas: readonly FacturaParaCruzar[],
  montoDe: (f: FacturaParaCruzar) => number,
  notaExtra?: (fs: readonly FacturaParaCruzar[]) => string,
): ItemDiferencia[] {
  const g = new Map<string, { nombre: string; monto: number; moneda: string; facturas: FacturaParaCruzar[] }>();
  for (const f of facturas) {
    const k = `${f.odooPartnerNombre}|${f.moneda}`;
    const p = g.get(k) ?? { nombre: f.odooPartnerNombre, monto: 0, moneda: f.moneda, facturas: [] };
    p.monto += montoDe(f);
    p.facturas.push(f);
    g.set(k, p);
  }
  return [...g.values()]
    .sort((a, b) => ordenDeMoneda(a.moneda) - ordenDeMoneda(b.moneda) || b.monto - a.monto || a.nombre.localeCompare(b.nombre))
    .map((v) => ({
      texto: `${v.nombre} — ${fmt(round2(v.monto), v.moneda)}`,
      monto: round2(v.monto),
      moneda: v.moneda,
      nota: `${v.facturas.length} factura${v.facturas.length === 1 ? "" : "s"}` + (notaExtra ? ` · ${notaExtra(v.facturas)}` : ""),
    }));
}

/**
 * La huella de una diferencia aceptada. Se acepta ESA diferencia, no «este par para siempre»:
 * si los números cambian, la línea vuelve sola.
 *
 * ⚠ Una aceptación no puede convertirse en el lugar donde se esconde un problema nuevo.
 */
export function huellaDe(inc: Pick<Inconsistencia, "items">): string {
  return inc.items.map((i) => `${i.texto}=${i.monto ?? ""}`).join("|");
}
