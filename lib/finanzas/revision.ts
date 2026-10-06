/**
 * lib/finanzas/revision.ts — la revisión de quien supervisa sobre lo que registró el equipo (rediseño de Finanzas,
 * 2026-10-03, docs/finanzas-rediseno-plan.md, etapa «Revisión»).
 *
 * Alex revisa dos cosas: los PAGOS que alguien del equipo dio por cobrados y los GASTOS que anotó. Las facturas
 * marcadas no: esas ya se comparan solas contra Odoo y Mercury en Conciliación. Lo que registra un Super Admin no pasa
 * por revisión.
 *
 * ── LA HUELLA ───────────────────────────────────────────────────────────────────
 * Al revisar se guarda la huella de los números del registro. Si después cambian (otro monto, otra fecha en que entró,
 * otra referencia), el registro vuelve a «por revisar» con el aviso «cambió después de tu revisión»: un «Está bien»
 * vale para lo que se vio, no para lo que vino después. Es la misma regla que «Está bien así» en Conciliación.
 *
 * ── DEVOLVER ────────────────────────────────────────────────────────────────────
 * «Devolver» lleva un comentario y le llega a quien lo registró en Pendientes. Cuando lo arregla, avisa «Ya lo corregí»
 * y el registro vuelve a la revisión marcado como corregido. Nada se bloquea: devolver no deshace el pago ni borra el
 * gasto, solo pide que se mire. «Ya lo corregí» lo marca quien lo registró, o quien supervisa (2026-10-05).
 *
 * ── LO QUE CAMBIA OTRO, Y LO QUE SE BORRA (decisiones de Elías, 2026-10-05) ──────────
 * · Un gasto ya revisado que edita alguien que no es quien lo anotó vuelve a la revisión, aunque lo que cambió no
 *   entre en la huella (las etiquetas, las notas), y dice quién lo cambió.
 * · Un gasto ya revisado que alguien BORRA le aparece a quien supervisa: qué era, el monto, quién lo borró y cuándo.
 *   Sin columna nueva: la fila de su revisión (`RevisionRegistro`) se queda, con la foto del gasto en `huella`
 *   (`BORRADO:` + JSON) y quién y cuándo en `corregidoPor`/`corregidoEn`. Está «sin ver» mientras se haya borrado
 *   después de la última revisión; «Visto» la firma con la fecha de hoy y la fila queda como rastro.
 *
 * PURO: sin Prisma ni red.
 */

export type TipoRevisado = "PAGO" | "GASTO";
export type EstadoGuardado = "BIEN" | "DEVUELTO" | "CORREGIDO";
/** Cómo aparece un registro. null = revisado y sin cambios desde entonces: ya no se muestra. */
export type EnRevision = "NUEVO" | "CAMBIO" | "CORREGIDO" | "DEVUELTO" | "BORRADO";

/**
 * Desde cuándo se revisa (por la fecha en que se registró). Agosto de 2026 es el primer mes en que Dinia registró pagos
 * (17 hasta el 3 de octubre): desde ahí no queda nada suyo afuera, y lo de antes ya lo cuadró el libro de Alex.
 */
export const REVISION_DESDE = "2026-08-01";

/** Un registro hecho más de esto después del hecho lleva aviso: o la fecha está mal, o se registró tarde. */
export const DIAS_PARA_AVISAR_TARDE = 30;

export const ETIQUETA_EN_REVISION: Record<EnRevision, string> = {
  NUEVO: "",
  CAMBIO: "Cambió después de tu revisión",
  CORREGIDO: "Corregido",
  DEVUELTO: "Devuelto",
  BORRADO: "Lo borraron después de tu revisión",
};

export interface PagoParaHuella {
  estado: string;
  monto: number;
  moneda: string;
  /** YYYY-MM-DD. */
  fechaCobro: string | null;
  referenciaExterna: string | null;
  numeroFactura: string | null;
}

/** Lo que se mira de un pago: si cambia algo de esto, la revisión vence. */
export function huellaDePago(p: PagoParaHuella): string {
  return ["PAGO", p.estado, p.monto.toFixed(2), p.moneda, p.fechaCobro ?? "", (p.referenciaExterna ?? "").trim(), p.numeroFactura ?? ""].join("|");
}

export interface GastoParaHuella {
  nombre: string;
  monto: number;
  moneda: string;
  /** YYYY-MM-DD. */
  fecha: string;
}

export function huellaDeGasto(g: GastoParaHuella): string {
  return ["GASTO", g.nombre.trim(), g.monto.toFixed(2), g.moneda, g.fecha].join("|");
}

/** Cómo aparece un registro, según su huella de hoy y la revisión guardada (si hay). */
export function enRevision(huellaActual: string, guardada: { estado: string; huella: string } | null): EnRevision | null {
  if (!guardada) return "NUEVO";
  if (guardada.estado === "DEVUELTO") return "DEVUELTO";
  if (guardada.estado === "CORREGIDO") return "CORREGIDO";
  return guardada.huella === huellaActual ? null : "CAMBIO";
}

/**
 * La huella que deja la edición de alguien que no anotó el gasto: la de antes con una marca, para que ya no coincida
 * con ninguna huella de verdad y el gasto vuelva como «cambió después de tu revisión», cambie lo que cambie.
 */
export function huellaEditadaPorOtro(huellaAnterior: string): string {
  return huellaAnterior.startsWith("EDITADO|") ? huellaAnterior : `EDITADO|${huellaAnterior}`;
}

/** ¿Es la misma persona? Por email, sin mayúsculas. */
export function mismaPersona(a: string | null | undefined, b: string | null | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

// ── Los gastos borrados después de revisados ─────────────────────────────────────

/** La foto de un gasto borrado, como queda en la huella de su revisión. */
export interface GastoBorrado {
  nombre: string;
  monto: number;
  moneda: string;
  /** YYYY-MM-DD. */
  fecha: string;
  /** Quién lo había anotado (email), y el día (de Costa Rica) en que lo anotó. */
  registradoPor: string | null;
  registradoEn: string;
  /** Cómo estaba su revisión antes de borrarlo (BIEN, DEVUELTO, CORREGIDO) y el comentario de la devolución, si hubo. */
  estadoAntes: string;
  comentarioAntes: string | null;
}

export const PREFIJO_BORRADO = "BORRADO:";

export function huellaDeBorrado(g: GastoBorrado): string {
  return `${PREFIJO_BORRADO}${JSON.stringify(g)}`;
}

/** La foto de un gasto borrado, o null si la huella no es la de un borrado (o está rota). */
export function leerBorrado(huella: string): GastoBorrado | null {
  if (!huella.startsWith(PREFIJO_BORRADO)) return null;
  try {
    const g = JSON.parse(huella.slice(PREFIJO_BORRADO.length)) as Partial<GastoBorrado>;
    if (typeof g.nombre !== "string" || typeof g.monto !== "number" || typeof g.moneda !== "string" || typeof g.fecha !== "string") return null;
    return {
      nombre: g.nombre,
      monto: g.monto,
      moneda: g.moneda,
      fecha: g.fecha,
      registradoPor: typeof g.registradoPor === "string" ? g.registradoPor : null,
      registradoEn: typeof g.registradoEn === "string" ? g.registradoEn : g.fecha,
      estadoAntes: typeof g.estadoAntes === "string" ? g.estadoAntes : "BIEN",
      comentarioAntes: typeof g.comentarioAntes === "string" ? g.comentarioAntes : null,
    };
  } catch {
    return null;
  }
}

/**
 * ¿Quien supervisa todavía no vio que lo borraron? Sí, mientras se haya borrado después de su última revisión. «Visto»
 * firma la revisión con la fecha de hoy; si lo borra la misma persona que lo había revisado, nace visto.
 */
export function borradoSinVer(r: { huella: string; revisadoEn: Date; corregidoEn: Date | null }): boolean {
  return r.huella.startsWith(PREFIJO_BORRADO) && !!r.corregidoEn && r.corregidoEn.getTime() > r.revisadoEn.getTime();
}

/** Días de calendario de una fecha a otra (YYYY-MM-DD o ISO completo; se toma el día). */
export function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86_400_000);
}

const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «3 jul». */
export function diaCorto(iso: string): string {
  return `${+iso.slice(8, 10)} ${MESES_CORTOS[+iso.slice(5, 7) - 1]}`;
}

/** Lo raro de un pago, en palabras. Vacío = nada que señalar. */
export function avisosDePago(p: { fechaCobro: string | null; fechaEmision: string | null; registradoEn: string }): string[] {
  const out: string[] = [];
  if (p.fechaCobro) {
    const dias = diasEntre(p.fechaCobro, p.registradoEn);
    if (dias > DIAS_PARA_AVISAR_TARDE) out.push(`Se registró ${dias} días después de entrar`);
    if (dias < 0) out.push(`Dice que entró el ${diaCorto(p.fechaCobro)}, después de registrarlo`);
  }
  if (!p.fechaEmision) out.push("Cobrado sin factura marcada");
  return out;
}

/** Lo raro de un gasto. Un gasto con fecha futura es una compra planificada: entra a la caja de ese día. */
export function avisosDeGasto(g: { fecha: string; registradoEn: string }): string[] {
  const dias = diasEntre(g.fecha, g.registradoEn);
  if (dias > DIAS_PARA_AVISAR_TARDE) return [`Se anotó ${dias} días después del gasto`];
  if (dias < 0) return [`Es una compra a futuro, del ${diaCorto(g.fecha)}`];
  return [];
}

/** Algo devuelto, como lo ve quien lo registró en su Pendientes. */
export interface Devuelto {
  tipo: TipoRevisado;
  registroId: string;
  /** «Pago de Teamnet · US$2.000 · cuota de agosto 2026». */
  texto: string;
  comentario: string;
  /** Nombre de pila de quien lo devolvió. */
  por: string;
  /** Dónde se corrige. */
  href: string;
}

/**
 * El orden de la revisión: primero lo borrado, lo corregido y lo que cambió (ya se había mirado), después lo más
 * reciente.
 */
export function ordenDeRevision<T extends { estado: EnRevision; registradoEn: string }>(filas: readonly T[]): T[] {
  const peso: Record<EnRevision, number> = { BORRADO: 0, CORREGIDO: 1, CAMBIO: 2, NUEVO: 3, DEVUELTO: 4 };
  return [...filas].sort((a, b) => peso[a.estado] - peso[b.estado] || b.registradoEn.localeCompare(a.registradoEn));
}
