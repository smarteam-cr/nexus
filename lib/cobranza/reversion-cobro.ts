/**
 * lib/cobranza/reversion-cobro.ts
 *
 * Sacar un cobro de COBRADO: la regla, pura. La aplica el chokepoint `cambiarEstadoCobroTx`
 * (lib/cobranza/mutations.ts) y la usa el diálogo `RevertirCobroDialog` para avisar antes de
 * mandar. Sin Prisma, sin red, sin reloj.
 *
 * ⚠ Y sin zod, ni directo ni por `./schema`: el diálogo corre en el navegador, y un import de
 * valor desde acá arrastraría 266 KB de validación para pintar un formulario. Por eso las
 * etiquetas de los estados entran como argumento y el mínimo del motivo vive acá (schema.ts lo
 * importa de este archivo, no al revés).
 *
 * ── POR QUÉ EXISTE ──────────────────────────────────────────────────────────────
 * Sacar un cobro de verde era elegir otra opción en un `<select>`: sin confirmación, sin motivo
 * y sin bitácora. Y el chokepoint limpiaba `confirmadoPor`, o sea que borraba justo el dato que
 * decía quién había dado la plata por entrada.
 *
 * Eso importa porque 83 verdes no los confirmó una persona: los pintó la importación del libro
 * de Alex según el COLOR de la celda (`import:facturaciones-2026`). Tres de ellos nunca se
 * depositaron (Global Supply feb-2026, IIA y Seléctrica jun-2026) y hay que devolverlos a por
 * cobrar sin perder de dónde venía el verde.
 *
 * Ahora salir de COBRADO exige un motivo, y la bitácora del cobro guarda quién lo había
 * confirmado, cuándo, y quién lo revierte — en la misma transacción que el cambio.
 *
 * ⛔ Nada de acá pone un cobro en COBRADO. Solo describe la salida (INV3, INV25).
 */

/**
 * Mínimo de caracteres del motivo. Bajo a propósito: la barrera es que haya que escribir algo
 * con nombre y apellido, no redactar un informe. Con cinco ya no entran «.» ni «x», que son la
 * forma de saltarse un campo obligatorio.
 */
export const MOTIVO_REVERSION_MIN = 5;

/** Las firmas que dejó un cargador y no una persona. Hoy: `import:facturaciones-2026`. */
export const PREFIJO_FIRMA_DE_IMPORTACION = "import:";

export function esFirmaDeImportacion(firma: string | null | undefined): boolean {
  return !!firma && firma.startsWith(PREFIJO_FIRMA_DE_IMPORTACION);
}

/** ¿El cambio pedido saca al cobro de COBRADO? Pasar de COBRADO a COBRADO no es salir. */
export function saleDeCobrado(estadoAntes: string, estadoPedido: string | undefined): boolean {
  return estadoAntes === "COBRADO" && estadoPedido !== undefined && estadoPedido !== "COBRADO";
}

/** Lo que había en el cobro antes del cambio. Fechas como día ISO (`YYYY-MM-DD`). */
export interface CobroAntesDeRevertir {
  estado: string;
  confirmadoPor: string | null;
  confirmadoEnISO: string | null;
  fechaCobroISO: string | null;
  fechaEmisionISO: string | null;
  facturadoPor: string | null;
  referenciaExterna: string | null;
}

/** El pedido de cambio, con la misma semántica que `cobroPatchSchema`. */
export interface PedidoDeCambio {
  estado?: string;
  /** `undefined` = no toca la fecha de emisión; `null` = la quita. */
  fechaEmisionISO?: string | null;
  /**
   * ⚠ Sin el número de factura: desde la etapa 7 tiene su columna y su regla
   * (lib/cobranza/numero-factura.ts), que el chokepoint aplica aparte y que deja su propia línea en
   * la bitácora. Escribirlo también acá lo anotaba dos veces.
   */
  reversion?: { motivo: string };
}

/** Las dos parejas que vigilan INV3 (COBRADO ⇒ confirmadoPor) e INV5 (fechaEmision ⇒ facturadoPor). */
export interface FirmasDelCobro {
  estado: string;
  confirmadoPor: string | null;
  fechaCobroISO: string | null;
  fechaEmisionISO: string | null;
  facturadoPor: string | null;
}

export type DecisionDeReversion =
  /** El cambio no saca al cobro de COBRADO: esta regla no tiene nada que decir. */
  | { tipo: "no-aplica" }
  | { tipo: "rechazo"; status: 400; mensaje: string }
  | {
      tipo: "revertir";
      /**
       * La marca de facturado la había puesto un cargador y el cobro sigue facturado: pasa a
       * nombre de quien revierte. Quien corrige la fecha real de la factura es quien la miró.
       */
      refirmarFacturado: boolean;
      /** El texto de la bitácora del cobro. Una línea por hecho. */
      bitacora: string;
      /**
       * Cómo quedan las firmas después del cambio. Describe lo que escribe el chokepoint: el
       * test la usa para afirmar que una reversión nunca deja INV3 ni INV5 en rojo.
       */
      firmasDespues: FirmasDelCobro;
    };

/**
 * Decide si un cambio de estado puede sacar al cobro de COBRADO, y con qué rastro.
 *
 * `etiquetas` son las de la pantalla (`ESTADO_COBRO_LABEL`): la bitácora la lee Alex, no un
 * programador, y tiene que decir «Por cobrar» y no `POR_COBRAR`.
 *
 * ⚠ El motivo se exige SOLO al salir de COBRADO. Y al revés: un motivo que llega con un cambio
 * que no sale de COBRADO se rechaza, porque no quedaría escrito en ningún lado y quien lo tipeó
 * creería que sí.
 */
export function decidirReversion(
  antes: CobroAntesDeRevertir,
  pedido: PedidoDeCambio,
  byEmail: string,
  etiquetas: Readonly<Record<string, string>>,
): DecisionDeReversion {
  if (!saleDeCobrado(antes.estado, pedido.estado)) {
    if (pedido.reversion !== undefined) {
      return {
        tipo: "rechazo",
        status: 400,
        mensaje: "El motivo solo se pide al sacar un cobro de Cobrado, y este cambio no lo hace.",
      };
    }
    return { tipo: "no-aplica" };
  }
  // Ya se sabe que sale de COBRADO, así que el estado pedido existe.
  const estadoNuevo = pedido.estado ?? antes.estado;
  const etiqueta = (estado: string) => etiquetas[estado] ?? estado;

  if (!byEmail) {
    return { tipo: "rechazo", status: 400, mensaje: "Sacar un cobro de Cobrado exige un usuario con nombre." };
  }

  const motivo = pedido.reversion?.motivo.trim() ?? "";
  if (motivo.length < MOTIVO_REVERSION_MIN) {
    return {
      tipo: "rechazo",
      status: 400,
      mensaje: `Para sacar un cobro de Cobrado hay que decir por qué (al menos ${MOTIVO_REVERSION_MIN} caracteres).`,
    };
  }

  const fechaDespues = pedido.fechaEmisionISO === undefined ? antes.fechaEmisionISO : pedido.fechaEmisionISO;
  /* Por cobrar es una factura emitida que espera el depósito. Sin fecha de emisión el semáforo
     la lee como «falta facturar», y la pantalla diría una cosa y el estado otra. */
  if (estadoNuevo === "POR_COBRAR" && !fechaDespues) {
    return {
      tipo: "rechazo",
      status: 400,
      mensaje: "Para dejarlo Por cobrar hace falta la fecha en que se emitió la factura.",
    };
  }

  const refirmarFacturado =
    fechaDespues !== null && antes.fechaEmisionISO !== null && esFirmaDeImportacion(antes.facturadoPor);
  // Mismas tres ramas que el chokepoint: poner la fecha firma, quitarla limpia, cambiarla conserva.
  const facturadoDespues =
    fechaDespues === null
      ? null
      : antes.fechaEmisionISO === null || refirmarFacturado
        ? byEmail
        : antes.facturadoPor;

  const lineas: string[] = [
    `${byEmail} sacó este cobro de ${etiqueta(antes.estado)} y lo pasó a ${etiqueta(estadoNuevo)}.`,
    `Motivo: ${motivo}`,
  ];

  let confirmacion = `Lo había confirmado ${antes.confirmadoPor ?? "nadie (no tenía firma)"}`;
  if (antes.confirmadoEnISO) confirmacion += ` el ${antes.confirmadoEnISO}`;
  if (antes.fechaCobroISO) confirmacion += `, con el pago fechado el ${antes.fechaCobroISO}`;
  if (antes.referenciaExterna) confirmacion += ` y la referencia ${antes.referenciaExterna}`;
  confirmacion += ".";
  if (esFirmaDeImportacion(antes.confirmadoPor)) {
    confirmacion += " Esa firma es de una importación, no de una persona: el verde salió del archivo.";
  }
  lineas.push(confirmacion);

  if (fechaDespues !== antes.fechaEmisionISO) {
    if (antes.fechaEmisionISO === null) lineas.push(`Fecha de emisión de la factura: ${fechaDespues}.`);
    else if (fechaDespues === null) lineas.push(`Se quitó la fecha de emisión (era ${antes.fechaEmisionISO}).`);
    else lineas.push(`Fecha de emisión corregida: ${antes.fechaEmisionISO} → ${fechaDespues}.`);
  }
  if (refirmarFacturado) {
    lineas.push(`La marca de facturado pasa de «${antes.facturadoPor}» a ${byEmail}.`);
  } else if (fechaDespues === null && antes.facturadoPor) {
    lineas.push(`Se quitó la marca de facturado de ${antes.facturadoPor}.`);
  }

  return {
    tipo: "revertir",
    refirmarFacturado,
    bitacora: lineas.join("\n"),
    firmasDespues: {
      estado: estadoNuevo,
      confirmadoPor: null,
      fechaCobroISO: null,
      fechaEmisionISO: fechaDespues,
      facturadoPor: facturadoDespues,
    },
  };
}
