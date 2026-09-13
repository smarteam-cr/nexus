/**
 * lib/cobranza/numero-factura.ts
 *
 * El número de la factura de un cobro: cómo se escribe, de qué plataforma parece y qué exige cada
 * cambio. La regla es pura; la aplica el chokepoint `cambiarEstadoCobroTx` (lib/cobranza/mutations.ts)
 * y la usan los diálogos para avisar antes de mandar. Sin Prisma, sin red, sin reloj.
 *
 * ⚠ Y sin zod, ni directo ni por `./schema`: la importan diálogos del navegador (el mismo motivo
 * que reversion-cobro.ts). schema.ts importa los topes de acá, no al revés.
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * «Marcar facturado» pedía solo la fecha. El número se podía pegar recién al REGISTRAR EL PAGO, en
 * `referenciaExterna`, que además guarda ids de transferencias. Medido el 2026-09-12: 144 cobros
 * facturados y ninguno con su número. Justo lo facturado y no cobrado —lo que hay que perseguir—
 * llegaba siempre sin él, y el cruce contra Odoo tenía que adivinar por monto (PUBLIMARK tiene nueve
 * facturas de 15.226,75).
 *
 * Ahora el número nace con la factura: al marcar facturado se elige el documento de Odoo o se
 * teclea, o se dice por qué no se tiene. Queda firmado por quien lo puso, y al revertir la factura
 * el número viejo queda en la bitácora.
 *
 * ⛔ Nada de acá cambia el estado del cobro ni su fecha de emisión (INV3, INV5, INV25).
 */

/** Tope del número ya normalizado. El más largo medido en el espejo tiene 13 caracteres. */
export const NUMERO_FACTURA_MAX = 60;

/**
 * Mínimo del motivo de «no tengo el número». Igual que el de la reversión: la barrera es escribir
 * algo, no redactar un informe. Con cinco ya no entran «.» ni «x».
 */
export const MOTIVO_SIN_NUMERO_MIN = 5;
export const MOTIVO_SIN_NUMERO_MAX = 500;

export type PlataformaDeFactura = "ODOO" | "MERCURY";

/**
 * Cómo se guarda un número: sin espacios alrededor de los separadores y en mayúsculas.
 * «INV - 40» → «INV-40» · « fac/2026/0206 » → «FAC/2026/0206».
 *
 * ⚠ Sin esto el mismo documento entra de tres formas y ni el 409 de «ya está en otra cuenta» ni el
 * cruce contra el espejo lo reconocen. Medido el 2026-09-12 en `referenciaExterna`: «INV-26» e
 * «INV - 26» conviven. Vacío o solo espacios = null.
 */
export function normalizarNumeroFactura(texto: string | null | undefined): string | null {
  if (!texto) return null;
  const limpio = texto.trim().toUpperCase().replace(/\s*([-/.])\s*/g, "$1").replace(/\s+/g, " ");
  return limpio || null;
}

/**
 * Odoo numera `PREFIJO/AÑO/SECUENCIA`: medido en el espejo el 2026-09-12, 347 de 347 documentos son
 * FAC/2026/0206 o NC/2026/0001.
 */
const FORMA_ODOO = /^[A-Z]{2,6}\/\d{4}\/\d{3,}$/;
/** Mercury numera `INV-N`, y las facturas partidas `INV-N-M` (INV-16, INV-4-1). */
const FORMA_MERCURY = /^INV-\d+(?:-\d+)*$/;

/**
 * ¿De qué plataforma tiene forma este número? null = de ninguna conocida: un número de
 * transferencia (666471587) o uno de QuickBooks, que no tiene numeración propia en el libro (QBS-1).
 *
 * ⚠ Es la FORMA, no una verificación: dice «esto parece de Odoo», no «esto está en Odoo».
 */
export function plataformaDelNumero(numero: string | null | undefined): PlataformaDeFactura | null {
  const n = normalizarNumeroFactura(numero);
  if (!n) return null;
  if (FORMA_ODOO.test(n)) return "ODOO";
  if (FORMA_MERCURY.test(n)) return "MERCURY";
  return null;
}

/** Cómo se llaman las plataformas en pantalla. `OTRA` es QuickBooks (components/cobranza/format.ts). */
const NOMBRE_DE_PLATAFORMA: Readonly<Record<string, string>> = { ODOO: "Odoo", MERCURY: "Mercury", OTRA: "QuickBooks" };

/**
 * El aviso cuando el número no corresponde a la plataforma por la que factura la cuenta. No frena:
 * la vía de cobro de una cuenta puede estar mal (nace en ODOO y 16 cuentas internacionales lo
 * arrastran), y el que mira la factura es quien sabe.
 */
export function avisoDePlataforma(numero: string | null | undefined, viaCobro: string): string | null {
  const n = normalizarNumeroFactura(numero);
  if (!n) return null;
  const forma = plataformaDelNumero(n);
  const via = NOMBRE_DE_PLATAFORMA[viaCobro] ?? viaCobro;
  if (forma === null) {
    /* Solo en Odoo una forma desconocida es sospechosa: es la única plataforma con espejo, y un
       número que no tiene su forma no lo va a poder verificar nunca. */
    return viaCobro === "ODOO"
      ? `«${n}» no tiene la forma de un número de Odoo (FAC/2026/0206): el espejo no lo va a poder verificar. ¿No es un número de transferencia?`
      : null;
  }
  if (forma === viaCobro) return null;
  return `«${n}» tiene forma de número de ${NOMBRE_DE_PLATAFORMA[forma]}, y esta cuenta factura por ${via}. Revisalo antes de guardar.`;
}

/** Lo que hay en el cobro antes del cambio. Fechas como día ISO (`YYYY-MM-DD`). */
export interface NumeroAntes {
  fechaEmisionISO: string | null;
  numeroFactura: string | null;
  numeroFacturaPor: string | null;
  sinNumeroFacturaMotivo: string | null;
}

/** El pedido, con la misma semántica que `cobroPatchSchema`. */
export interface PedidoDeNumero {
  /** `undefined` = no toca la fecha de emisión; `null` = revierte la factura. */
  fechaEmisionISO?: string | null;
  /** `undefined` = no toca el número; `null` o vacío = lo quita. */
  numeroFactura?: string | null;
  /** `undefined` = no toca la marca; `null` o vacío = la quita. */
  sinNumeroFacturaMotivo?: string | null;
}

export type DecisionDeNumero =
  /** El pedido no cambia ni el número ni la marca. */
  | { tipo: "sin-cambios" }
  | { tipo: "rechazo"; status: 400; mensaje: string }
  | {
      tipo: "escribir";
      numeroFactura: string | null;
      sinNumeroFacturaMotivo: string | null;
      /** true = firma quien hace el cambio · false = se limpia la autoría (la factura se revirtió). */
      firmar: boolean;
      /**
       * El número que ENTRA, para buscarlo en otras cuentas antes de escribir (409). null si no entra
       * uno nuevo: re-guardar el mismo número no vuelve a preguntar.
       */
      numeroNuevo: string | null;
      /** El texto de la bitácora del cobro. Una línea por hecho. */
      bitacora: string;
    };

/**
 * Decide qué pasa con el número de la factura en un cambio del cobro.
 *
 * Las reglas, en orden:
 *  1. El número y «no tengo el número» no van juntos, y el motivo tiene un mínimo.
 *  2. Sin factura después del cambio no hay número: pedirlo es un 400, y el que había se limpia con
 *     su autoría, dejando el número viejo en la bitácora (revertir la factura).
 *  3. ⭐ Cuando la fecha de emisión pasa de vacía a fecha —marcar facturado— exige el número o la
 *     marca con su motivo.
 *  4. Cambiar una fecha ya puesta por otra no exige nada: los 144 facturados de antes siguen
 *     editables sin inventarles un número.
 *  5. A una factura con número no se le quita el número sin reemplazarlo por la marca (y al revés):
 *     sería fabricar un facturado sin número por la puerta de atrás.
 *
 * ⚠ El 409 de «ese número ya está en otra cuenta» NO se decide acá: hace falta la base. El chokepoint
 * lo pregunta con `numeroNuevo` antes de escribir.
 */
export function decidirNumeroFactura(antes: NumeroAntes, pedido: PedidoDeNumero, byEmail: string): DecisionDeNumero {
  const rechazo = (mensaje: string): DecisionDeNumero => ({ tipo: "rechazo", status: 400, mensaje });
  const numeroPedido = pedido.numeroFactura === undefined ? undefined : normalizarNumeroFactura(pedido.numeroFactura);
  const motivoPedido =
    pedido.sinNumeroFacturaMotivo === undefined ? undefined : pedido.sinNumeroFacturaMotivo?.trim() || null;
  const fechaDespues = pedido.fechaEmisionISO === undefined ? antes.fechaEmisionISO : pedido.fechaEmisionISO;
  const autorAntes = antes.numeroFacturaPor ? ` (lo había puesto ${antes.numeroFacturaPor})` : "";

  if (numeroPedido && motivoPedido) {
    return rechazo("O el número de la factura, o «no tengo el número»: los dos a la vez no.");
  }
  if (motivoPedido && motivoPedido.length < MOTIVO_SIN_NUMERO_MIN) {
    return rechazo(`Contá por qué no tenés el número de la factura (al menos ${MOTIVO_SIN_NUMERO_MIN} caracteres).`);
  }
  if (numeroPedido && numeroPedido.length > NUMERO_FACTURA_MAX) {
    return rechazo(`El número de la factura no puede pasar de ${NUMERO_FACTURA_MAX} caracteres.`);
  }

  /* 2. Sin factura: no hay número que guardar, y el que había se va con su firma. */
  if (fechaDespues === null) {
    if (numeroPedido || motivoPedido) {
      return rechazo("Un cobro sin factura no lleva número: primero marcalo facturado.");
    }
    if (!antes.numeroFactura && !antes.sinNumeroFacturaMotivo) return { tipo: "sin-cambios" };
    return {
      tipo: "escribir",
      numeroFactura: null,
      sinNumeroFacturaMotivo: null,
      firmar: false,
      numeroNuevo: null,
      bitacora: antes.numeroFactura
        ? `Se quitó el número de factura ${antes.numeroFactura}${autorAntes}: el cobro dejó de estar facturado.`
        : `Se quitó la marca «no tengo el número» (${antes.sinNumeroFacturaMotivo})${autorAntes}: el cobro dejó de estar facturado.`,
    };
  }

  const numeroDespues = numeroPedido !== undefined ? numeroPedido : motivoPedido ? null : antes.numeroFactura;
  const motivoDespues =
    motivoPedido !== undefined ? motivoPedido : numeroPedido ? null : antes.sinNumeroFacturaMotivo;

  if (!numeroDespues && !motivoDespues) {
    /* 3. Marcar facturado sin número ni motivo. */
    if (antes.fechaEmisionISO === null) {
      return rechazo(
        "Para marcar facturado hace falta el número de la factura, o marcar «no tengo el número» y decir por qué.",
      );
    }
    /* 5. */
    if (antes.numeroFactura) {
      return rechazo("Para quitarle el número a una factura, decí por qué no lo tenés, o revertí la factura.");
    }
    if (antes.sinNumeroFacturaMotivo) {
      return rechazo("Para quitar «no tengo el número» hace falta poner el número de la factura.");
    }
    /* 4. Un facturado de antes, sin número: cambiarle la fecha no le exige nada. */
    return { tipo: "sin-cambios" };
  }

  if (numeroDespues === antes.numeroFactura && motivoDespues === antes.sinNumeroFacturaMotivo) {
    return { tipo: "sin-cambios" };
  }
  if (!byEmail) return rechazo("Poner el número de una factura exige un usuario con nombre.");

  const lineas: string[] = [];
  if (numeroDespues) {
    lineas.push(
      antes.numeroFactura
        ? `${byEmail} corrigió el número de factura: ${antes.numeroFactura} → ${numeroDespues}${autorAntes}.`
        : `${byEmail} anotó el número de factura ${numeroDespues}.`,
    );
    if (antes.sinNumeroFacturaMotivo) {
      lineas.push(`Reemplaza la marca «no tengo el número» (${antes.sinNumeroFacturaMotivo}).`);
    }
  } else {
    lineas.push(
      antes.sinNumeroFacturaMotivo
        ? `${byEmail} cambió por qué la factura no tiene número.`
        : `${byEmail} marcó la factura sin número.`,
    );
    lineas.push(`Motivo: ${motivoDespues}`);
    if (antes.numeroFactura) lineas.push(`Se quitó el número ${antes.numeroFactura}${autorAntes}.`);
  }

  return {
    tipo: "escribir",
    numeroFactura: numeroDespues,
    sinNumeroFacturaMotivo: motivoDespues,
    firmar: true,
    numeroNuevo: numeroDespues && numeroDespues !== antes.numeroFactura ? numeroDespues : null,
    bitacora: lineas.join("\n"),
  };
}

/** El 409 del chokepoint. Sin montos: lo lee cualquiera que pueda marcar facturado. */
export function mensajeNumeroEnOtraCuenta(numero: string, otraCuenta: string): string {
  return (
    `La factura ${numero} ya está anotada en otra cuenta (${otraCuenta}). Un documento le cobra a un solo cliente: ` +
    `revisá el número, o el emparejado con Odoo si es la misma empresa.`
  );
}

/**
 * ¿Este cobro está facturado y sin número ni motivo? Es lo que muestra «Agregar número» en la
 * pantalla. Los facturados antes de la etapa 7 están todos así.
 */
export function faltaNumeroDeFactura(c: {
  fechaEmision: string | null;
  numeroFactura?: string | null;
  sinNumeroFacturaMotivo?: string | null;
}): boolean {
  return c.fechaEmision !== null && !c.numeroFactura && !c.sinNumeroFacturaMotivo;
}
