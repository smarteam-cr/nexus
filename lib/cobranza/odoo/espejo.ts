/**
 * lib/cobranza/odoo/espejo.ts
 *
 * Las DECISIONES del espejo, como funciones puras: sin Prisma, sin red, sin reloj. El sync
 * las orquesta y no decide nada por su cuenta.
 *
 * ── POR QUÉ ESTÁ SEPARADO DEL SYNC ──────────────────────────────────────────────
 * El molde de este módulo (`lib/ventas/sync-ganadas.ts`) **no tiene un solo test**, y no por
 * descuido: mezcla la lectura de HubSpot con la decisión de qué cambió, y el proyecto `unit`
 * de vitest prohíbe la red. La consecuencia es que la guarda del 50 % —la que impide que un
 * timeout vacíe el año— nunca se probó contra un caso.
 *
 * Acá las tres decisiones que importan (`esCorridaParcial`, `calcularDeltas`,
 * `proponerSemaforo`) nacen puras para no heredar eso.
 *
 * ⚠⚠ **Este módulo NO convierte moneda, nunca.** El monto se guarda en la moneda nativa del
 * documento y `convertir()` de `lib/finanzas/equilibrio.ts` sigue siendo el único punto de
 * conversión del sistema. Lo vigila el test §K de `equilibrio.test.ts` y `guardas.test.ts`.
 */
import { addDaysISO, DEFAULT_CREDITO_DIAS } from "../engine";

/* ── 1. Leer lo que Odoo manda ──────────────────────────────────────────────────── */

/**
 * ⚠ Odoo devuelve `false` —el booleano— para todo campo vacío: fechas, textos y relaciones.
 * No `null`, no `""`. Un `?? ""` lo deja pasar y termina escribiendo el string `"false"` en
 * la base, que después nadie sabe de dónde salió.
 */
export function textoOdoo(v: unknown): string | null {
  if (v === false || v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function numeroOdoo(v: unknown): number {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return 0;
}

/**
 * Un many2one llega como la tupla `[id, "etiqueta"]`, y como `false` cuando está vacío.
 * `currency_id` y `partner_id` son los dos que le importan al espejo.
 */
export function many2one(v: unknown): { id: number; nombre: string } | null {
  if (!Array.isArray(v) || v.length < 2) return null;
  const id = Number(v[0]);
  if (!Number.isFinite(id)) return null;
  return { id, nombre: String(v[1] ?? "").trim() };
}

/** `YYYY-MM-DD` tal cual viene, o `YYYY-MM-DD` recortado de un `YYYY-MM-DD HH:MM:SS`. */
export function fechaOdoo(v: unknown): string | null {
  const s = textoOdoo(v);
  if (!s) return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? m[0] : null;
}

export interface FacturaEspejada {
  odooMoveId: number;
  numero: string;
  moveType: string;
  state: string;
  paymentState: string;
  invoiceDate: string;
  invoiceDateDue: string | null;
  montoNeto: number;
  montoTotal: number;
  montoResidual: number;
  montoImpuesto: number;
  montoTotalSigned: number;
  moneda: string;
  odooPartnerId: number;
  odooPartnerNombre: string;
}

/**
 * Traduce una fila cruda de `account.move` al DTO del espejo. Devuelve `null` cuando la fila
 * no se puede espejar, y el motivo va aparte.
 *
 * ⚠ Se RECHAZA lo que no tiene fecha o no tiene partner, en vez de inventarles un default.
 * Una factura sin `invoice_date` no cae en ningún mes y ensuciaría el año sin que nadie la
 * vea; una sin partner no se puede atribuir a ninguna cuenta. Que aparezca en la lista de
 * inconsistencias es MEJOR que un espejo completo con dos filas mentirosas.
 */
export function mapearFactura(cruda: Record<string, unknown>): { factura: FacturaEspejada } | { rechazo: string } {
  const odooMoveId = Number(cruda.id);
  if (!Number.isFinite(odooMoveId) || odooMoveId <= 0) return { rechazo: "la fila no trae un id de Odoo usable" };

  const invoiceDate = fechaOdoo(cruda.invoice_date);
  if (!invoiceDate) return { rechazo: `la factura ${odooMoveId} no tiene invoice_date` };

  const partner = many2one(cruda.partner_id);
  if (!partner) return { rechazo: `la factura ${odooMoveId} no tiene partner_id` };

  /* La moneda es la del DOCUMENTO, no la de la compañía. Sin ella no se sabe si 2.000 son
     dólares o colones, y la diferencia es 500 veces. */
  const moneda = many2one(cruda.currency_id)?.nombre ?? null;
  if (!moneda) return { rechazo: `la factura ${odooMoveId} no tiene currency_id` };

  return {
    factura: {
      odooMoveId,
      numero: textoOdoo(cruda.name) ?? `(sin número ${odooMoveId})`,
      moveType: textoOdoo(cruda.move_type) ?? "",
      state: textoOdoo(cruda.state) ?? "",
      paymentState: textoOdoo(cruda.payment_state) ?? "not_paid",
      invoiceDate,
      invoiceDateDue: fechaOdoo(cruda.invoice_date_due),
      /* ESTE es el que se compara contra `Cobro.monto`: los cobros de Nexus están cargados
         SIN IVA. Comparar contra `montoTotal` marcaría las 304 facturas como descuadradas
         por exactamente 13 %. */
      montoNeto: numeroOdoo(cruda.amount_untaxed),
      montoTotal: numeroOdoo(cruda.amount_total),
      montoResidual: numeroOdoo(cruda.amount_residual),
      montoImpuesto: numeroOdoo(cruda.amount_tax),
      /* Con signo: `amount_total` es POSITIVO también en las notas de crédito, así que sumar
         facturas y notas con él sobreestima la venta y nada avisa. */
      montoTotalSigned: numeroOdoo(cruda.amount_total_signed),
      moneda,
      odooPartnerId: partner.id,
      odooPartnerNombre: partner.nombre,
    },
  };
}

/* ── 2. El vencimiento ──────────────────────────────────────────────────────────── */

/**
 * `invoice_date + creditoDias`. **NO usa `invoice_date_due`**, y eso es deliberado: el de
 * cabecera es el MÁXIMO de los vencimientos de las líneas, no el término del cliente.
 *
 * ⚠ Con `creditoDias` en null cae a 15 días — que hoy es el caso de 48 de las 49 cuentas.
 * Incluida Colby, cuyos 90 días reales **no están configurados en ninguno de los dos
 * sistemas**. Esa diferencia no la puede resolver el código: es una línea para la mesa de
 * trabajo con el CFO.
 */
export function vencimientoDe(invoiceDate: string, creditoDias: number | null | undefined): string {
  const dias = creditoDias == null || !Number.isFinite(creditoDias) ? DEFAULT_CREDITO_DIAS : Math.trunc(creditoDias);
  return addDaysISO(invoiceDate, dias);
}

/* ── 3. El semáforo ─────────────────────────────────────────────────────────────── */

export type EstadoCobroNexus = "PROGRAMADO" | "POR_COBRAR" | "COBRADO" | "SIN_DATO";

/** Los 6 valores de `payment_state`, traducidos a lo único que a cobranza le importa. */
export type SenalOdoo =
  | "PAGADA"
  | "PAGADA_SIN_CONCILIAR"
  | "PARCIAL"
  | "IMPAGA"
  | "ANULADA_POR_NOTA_DE_CREDITO"
  | "DESCONOCIDA";

export function senalDe(paymentState: string): SenalOdoo {
  switch (paymentState) {
    case "paid":
      return "PAGADA";
    case "in_payment":
      return "PAGADA_SIN_CONCILIAR";
    case "partial":
      return "PARCIAL";
    case "not_paid":
      return "IMPAGA";
    case "reversed":
      return "ANULADA_POR_NOTA_DE_CREDITO";
    default:
      /* `invoicing_legacy` y cualquier valor que agregue un módulo. Medido: 0 en la base
         real, pero un valor desconocido NO puede caer en «impaga» por descarte. */
      return "DESCONOCIDA";
  }
}

export interface PropuestaSemaforo {
  senal: SenalOdoo;
  /** El estado que Odoo sugiere. `null` = Odoo no tiene nada que aportar sobre este cobro. */
  estadoPropuesto: EstadoCobroNexus | null;
  /** Siempre `true` cuando hay propuesta: Odoo PROPONE, la plata la confirma una persona. */
  requiereConfirmacion: boolean;
  /** Odoo registró el pago pero todavía no lo cruzó contra el banco. */
  sinConciliar: boolean;
  /** Nexus y Odoo se contradicen. Es una línea para la mesa de trabajo, no un error a tapar. */
  divergencia: "NEXUS_COBRADO_ODOO_IMPAGA" | "NEXUS_COBRADO_ODOO_PARCIAL" | null;
  nota: string;
}

/**
 * Qué propone Odoo para un cobro. **Nunca decide.**
 *
 * ── LAS TRES REGLAS QUE NO SE NEGOCIAN ──────────────────────────────────────────
 * 1. **Promueve, nunca degrada.** Si Nexus dice COBRADO y Odoo dice impaga, el cobro NO
 *    vuelve a amarillo: se marca la divergencia y la mira una persona. Degradar en silencio
 *    haría que un error de conciliación en el ERP borre plata del dashboard de gerencia.
 * 2. **Ninguna propuesta se aplica sola** (INV25). `COBRADO` exige `confirmadoPor` de una
 *    persona (INV3), así que el sync literalmente no puede escribirlo. Esta función devuelve
 *    una sugerencia para la pantalla, no una orden.
 * 3. **Nace apagada.** Con `promocionHabilitada=false` no propone verde ni una vez.
 *
 * ⚠ La razón del punto 3: **176 de 304 facturas están en `in_payment`**, y el fuente de Odoo
 * 17 Community nunca asigna ese estado —su hook devuelve literalmente `'paid'`—. O esta base
 * es Enterprise, donde significa «pagado, falta conciliar», o hay un módulo de terceros que
 * puede significar otra cosa. Encenderlo sin saberlo pondría 176 cobros en verde de golpe.
 */
export function proponerSemaforo(
  estadoNexus: EstadoCobroNexus,
  paymentState: string,
  opts: { promocionHabilitada: boolean },
): PropuestaSemaforo {
  const senal = senalDe(paymentState);
  const base = { senal, estadoPropuesto: null, requiereConfirmacion: false, sinConciliar: false } as const;

  switch (senal) {
    case "PAGADA":
    case "PAGADA_SIN_CONCILIAR": {
      const sinConciliar = senal === "PAGADA_SIN_CONCILIAR";
      if (estadoNexus === "COBRADO") {
        return { ...base, sinConciliar, divergencia: null, nota: "Odoo confirma el pago." };
      }
      if (!opts.promocionHabilitada) {
        return {
          ...base,
          sinConciliar,
          divergencia: null,
          nota: "Odoo dice que está pagada, pero la promoción a verde está apagada hasta confirmar qué significa «in_payment» en este ERP.",
        };
      }
      return {
        senal,
        estadoPropuesto: "COBRADO",
        requiereConfirmacion: true,
        sinConciliar,
        divergencia: null,
        nota: sinConciliar
          ? "Odoo registró el pago pero todavía no lo concilió contra el banco."
          : "Odoo confirma el pago.",
      };
    }

    case "PARCIAL":
      return {
        ...base,
        divergencia: estadoNexus === "COBRADO" ? "NEXUS_COBRADO_ODOO_PARCIAL" : null,
        nota: "Odoo cobró una parte. Se muestran las dos cifras; no se suman ni se cuadran.",
      };

    case "IMPAGA":
      return {
        ...base,
        divergencia: estadoNexus === "COBRADO" ? "NEXUS_COBRADO_ODOO_IMPAGA" : null,
        nota:
          estadoNexus === "COBRADO"
            ? "Nexus lo tiene cobrado y Odoo dice que la factura sigue impaga. No se degrada: hay que revisarlo."
            : "Odoo todavía no registra el pago.",
      };

    case "ANULADA_POR_NOTA_DE_CREDITO":
      return {
        ...base,
        divergencia: null,
        nota: "La factura se saldó con una nota de crédito, no con un pago. La plata no entró.",
      };

    case "DESCONOCIDA":
      return {
        ...base,
        divergencia: null,
        nota: `Odoo devolvió un estado de pago que este espejo no conoce («${paymentState}»). No se toca el cobro.`,
      };
  }
}

/* ── 4. La bitácora ─────────────────────────────────────────────────────────────── */

export type TipoCambio = "MONTO" | "RESIDUAL" | "ESTADO_PAGO" | "ESTADO" | "FECHA" | "CUENTA";

export interface Delta {
  tipo: TipoCambio;
  anterior: string;
  nuevo: string;
}

/** Lo que el espejo ya tenía guardado de esta factura. */
export interface FacturaPrevia {
  montoTotal: number;
  montoResidual: number;
  paymentState: string;
  state: string;
  invoiceDate: string;
  cuentaId: string | null;
}

/**
 * Qué se movió desde la última corrida. Copia la serialización del molde
 * (`sync-ganadas.ts:343-360`): `"(ninguno)"` para lo vacío y fechas en `YYYY-MM-DD`.
 *
 * ⚠ El monto se compara **redondeado a dos decimales**. Odoo hace la aritmética en float y
 * devuelve `2000.0000000000002` cada tanto: sin el redondeo, la bitácora registraría un
 * cambio de monto por corrida en facturas que nadie tocó, y a la semana nadie la lee.
 */
export function calcularDeltas(previa: FacturaPrevia, nueva: FacturaEspejada, cuentaIdNueva: string | null): Delta[] {
  const d: Delta[] = [];
  const dosDec = (n: number) => n.toFixed(2);

  if (dosDec(previa.montoTotal) !== dosDec(nueva.montoTotal)) {
    d.push({ tipo: "MONTO", anterior: dosDec(previa.montoTotal), nuevo: dosDec(nueva.montoTotal) });
  }
  if (dosDec(previa.montoResidual) !== dosDec(nueva.montoResidual)) {
    d.push({ tipo: "RESIDUAL", anterior: dosDec(previa.montoResidual), nuevo: dosDec(nueva.montoResidual) });
  }
  if (previa.paymentState !== nueva.paymentState) {
    d.push({ tipo: "ESTADO_PAGO", anterior: previa.paymentState, nuevo: nueva.paymentState });
  }
  if (previa.state !== nueva.state) {
    d.push({ tipo: "ESTADO", anterior: previa.state, nuevo: nueva.state });
  }
  if (previa.invoiceDate !== nueva.invoiceDate) {
    d.push({ tipo: "FECHA", anterior: previa.invoiceDate, nuevo: nueva.invoiceDate });
  }
  if ((previa.cuentaId ?? "") !== (cuentaIdNueva ?? "")) {
    d.push({ tipo: "CUENTA", anterior: previa.cuentaId ?? "(ninguno)", nuevo: cuentaIdNueva ?? "(ninguno)" });
  }
  return d;
}

/* ── 5. La guarda del 50 % ──────────────────────────────────────────────────────── */

/**
 * ¿La corrida trajo tan poco que no se puede confiar en lo que falta?
 *
 * Existe porque el modo en que este tipo de sync hace daño no es fallando: es **teniendo
 * éxito con la mitad de los datos**. Si Odoo corta la conexión a mitad de la lectura y el
 * espejo concluye «las otras 200 facturas ya no existen», marca 200 filas como DESAPARECIDA
 * y el año se vacía sin un solo error en el log.
 *
 * ⚠ El `conocidas > 0` no es de adorno: en la PRIMERA corrida no hay nada conocido y toda
 * corrida sería «parcial» para siempre. Copiado de `sync-ganadas.ts:271`.
 */
export function esCorridaParcial(traidas: number, conocidas: number): boolean {
  return conocidas > 0 && traidas < conocidas * 0.5;
}

/**
 * ¿Están desapareciendo TANTAS facturas de golpe que es más probable un problema de lectura
 * que un borrado real?
 *
 * ⚠⚠ La guarda del 50 % deja un hueco peligroso: una corrida que trae el 60 % pasa el filtro
 * de «parcial» y después marca **el 40 % restante como DESAPARECIDA** — cientos de facturas
 * borradas del espejo por un fallo que no fue un borrado. El umbral del 50 % protege contra la
 * catástrofe y deja pasar el desastre.
 *
 * Nadie borra 20 facturas emitidas en un día. Una o dos, sí — un asiento mal cargado que se
 * anula. Por eso el corte es por PROPORCIÓN con un piso absoluto: hasta 5 desapariciones son
 * plausibles; más del 5 % del espejo, no.
 *
 * ⛔ Cuando salta, NO se marca ninguna. Perder la marca de una factura realmente borrada es
 * recuperable —vuelve en la corrida siguiente—; marcar 200 vivas como desaparecidas vacía el
 * cronograma de medio año y nadie sabe por qué.
 */
export function esBorradoMasivo(desaparecidas: number, conocidas: number): boolean {
  if (desaparecidas === 0) return false;
  return desaparecidas > Math.max(5, conocidas * 0.05);
}
