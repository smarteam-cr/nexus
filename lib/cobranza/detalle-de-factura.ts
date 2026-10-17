/**
 * lib/cobranza/detalle-de-factura.ts — el detalle de una factura de Odoo o de Mercury: sus líneas y su nota (plan «Un
 * solo libro financiero», paso 5, 2026-10-17). PURO: sin red, sin Prisma, sin reloj.
 *
 * La copia de Odoo y la de Mercury guardan solo el total de cada factura. El detalle se lee del sistema cuando alguien lo
 * abre (lib/cobranza/odoo/detalle-de-factura.ts y lib/cobranza/mercury/detalle-de-factura.ts lo traducen a esta forma),
 * y no se guarda: es una consulta por factura, a pedido, y lo que manda es lo que dice el sistema ese día.
 *
 * Lo que se mira en el detalle (medido el 2026-10-16 leyendo las facturas de 2026): la nota de la factura dice el mes
 * del servicio («Factura de Setiembre 2026»), y las líneas dicen si hay licencia y servicio juntos (Fundauna:
 * ₡1.037.001 de licencias y ₡1.265.600 de servicio en la FAC/2026/0359). ⚠ El producto y la cuenta contable de Odoo
 * casi nunca separan la licencia («Implementación de CRM» en todo): el detalle se lee, no se clasifica solo.
 */

export type TipoDeLinea = "linea" | "seccion" | "nota";

export interface LineaDeFactura {
  tipo: TipoDeLinea;
  descripcion: string;
  /** El producto de Odoo; null en Mercury y en las secciones. */
  producto: string | null;
  cantidad: number | null;
  precioUnitario: number | null;
  /** Porcentaje de descuento de la línea (Odoo), o null. */
  descuentoPct: number | null;
  /** Sin impuestos. null en una sección o una nota. */
  subtotal: number | null;
  /** La cuenta contable (Odoo), o null. */
  cuenta: string | null;
}

export interface DetalleDeFactura {
  fuente: "ODOO" | "MERCURY";
  numero: string;
  /** `YYYY-MM-DD`, o null si el sistema no la dice. */
  fecha: string | null;
  moneda: string;
  lineas: LineaDeFactura[];
  /** La nota de la factura en texto plano (Odoo: `narration`; Mercury: el memo). null = sin nota. */
  nota: string | null;
  /** El mes del servicio leído de la nota o de las líneas (`YYYY-MM`), o null si no lo dice. */
  mesDelServicio: string | null;
  /** La suma de los subtotales de las líneas. */
  totalLineas: number;
}

const MESES: Readonly<Record<string, number>> = {
  enero: 1,
  febrero: 2,
  marzo: 3,
  abril: 4,
  mayo: 5,
  junio: 6,
  julio: 7,
  agosto: 8,
  septiembre: 9,
  setiembre: 9,
  octubre: 10,
  noviembre: 11,
  diciembre: 12,
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");

/** El HTML de una nota de Odoo, en texto: sin etiquetas, con los saltos de línea y sin espacios de más. null si queda vacía. */
export function textoPlano(html: string | null | undefined): string | null {
  if (!html || typeof html !== "string") return null;
  const t = html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split("\n")
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
  return t || null;
}

/**
 * El mes del servicio que nombra un texto: «Factura de Setiembre 2026», «mes de cobro septiembre 2026», «Implementación
 * de CRM de Setiembre 2026», «September 2026». Devuelve `YYYY-MM` del PRIMER mes con año que aparece; sin año, null: un
 * mes suelto no dice de qué año es, y adivinarlo correría el servicio un año.
 */
export function mesDelServicio(...textos: ReadonlyArray<string | null | undefined>): string | null {
  for (const t of textos) {
    if (!t) continue;
    const plano = sinTildes(t).toLowerCase();
    for (const m of plano.matchAll(/\b([a-z]+)\b[\s,/-]*(?:de[l]?\s+)?(20\d{2})\b/g)) {
      const mes = MESES[m[1]!];
      if (mes) return `${m[2]}-${String(mes).padStart(2, "0")}`;
    }
  }
  return null;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Arma el detalle con su total y el mes del servicio (de la nota primero; si no, de las líneas). */
export function armarDetalle(d: Omit<DetalleDeFactura, "totalLineas" | "mesDelServicio">): DetalleDeFactura {
  return {
    ...d,
    totalLineas: round2(d.lineas.reduce((n, l) => n + (l.subtotal ?? 0), 0)),
    mesDelServicio: mesDelServicio(d.nota, ...d.lineas.map((l) => l.descripcion)),
  };
}
