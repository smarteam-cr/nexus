/**
 * lib/cobranza/odoo/detalle-de-factura.ts — las líneas y la nota de una factura de Odoo, leídas a pedido (2026-10-17).
 * Solo lectura.
 *
 * El espejo copia el total de cada factura y no su detalle. Esto lo pide cuando alguien abre una factura en «Facturación
 * por cliente»: el asiento (`account.move`, su nota) y sus líneas de producto, sección y nota (`account.move.line`).
 * ⚠ Las líneas de impuesto, del plazo de pago y de redondeo no van: no son lo que se facturó.
 *
 * Habla con Odoo solo por el puerto (`OdooTransport`): ni HTTP ni base acá (guardas.test.ts).
 */
import type { OdooTransport } from "./transporte";
import { armarDetalle, textoPlano, type DetalleDeFactura, type LineaDeFactura, type TipoDeLinea } from "../detalle-de-factura";

/** Los campos de cada línea que se muestran. */
export const ODOO_CAMPOS_LINEA = ["name", "display_type", "product_id", "quantity", "price_unit", "discount", "price_subtotal", "account_id", "sequence"] as const;

const TIPO: Readonly<Record<string, TipoDeLinea>> = { product: "linea", line_section: "seccion", line_note: "nota" };

/** El nombre de un many2one de Odoo (`[id, "nombre"]`), o null. */
const nombreDe = (v: unknown): string | null => (Array.isArray(v) && typeof v[1] === "string" ? v[1] : null);
const numero = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** Una línea de Odoo, traducida. null si no es una línea de lo facturado (impuesto, plazo de pago, redondeo). */
export function lineaDeOdoo(l: Record<string, unknown>): LineaDeFactura | null {
  /* Odoo anterior a la 16 no tiene `display_type` en las líneas de producto: false = producto. */
  const tipo = l.display_type === false || l.display_type === undefined ? "linea" : TIPO[String(l.display_type)];
  if (!tipo) return null;
  const esLinea = tipo === "linea";
  return {
    tipo,
    descripcion: typeof l.name === "string" ? l.name.trim() : "",
    producto: esLinea ? nombreDe(l.product_id) : null,
    cantidad: esLinea ? numero(l.quantity) : null,
    precioUnitario: esLinea ? numero(l.price_unit) : null,
    descuentoPct: esLinea && numero(l.discount) ? numero(l.discount) : null,
    subtotal: esLinea ? numero(l.price_subtotal) : null,
    cuenta: esLinea ? nombreDe(l.account_id) : null,
  };
}

export async function detalleDeFacturaOdoo(
  t: OdooTransport,
  f: { odooMoveId: number; numero: string; fecha: string | null; moneda: string },
): Promise<DetalleDeFactura> {
  const [movs, lineas] = await Promise.all([
    t.buscarYLeer("account.move", [["id", "=", f.odooMoveId]], ["id", "narration", "ref"], {}),
    t.buscarYLeer(
      "account.move.line",
      [
        ["move_id", "=", f.odooMoveId],
        ["display_type", "in", ["product", "line_section", "line_note"]],
      ],
      ODOO_CAMPOS_LINEA,
      { order: "sequence asc, id asc" },
    ),
  ]);
  const mov = movs[0] ?? {};
  const nota = [textoPlano(typeof mov.narration === "string" ? mov.narration : null), typeof mov.ref === "string" && mov.ref.trim() ? `Referencia: ${mov.ref.trim()}` : null]
    .filter(Boolean)
    .join("\n");
  return armarDetalle({
    fuente: "ODOO",
    numero: f.numero,
    fecha: f.fecha,
    moneda: f.moneda,
    lineas: lineas.map(lineaDeOdoo).filter((l): l is LineaDeFactura => l !== null),
    nota: nota || null,
  });
}
