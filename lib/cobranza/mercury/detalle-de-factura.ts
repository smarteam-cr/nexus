/**
 * lib/cobranza/mercury/detalle-de-factura.ts — las líneas de una factura de Mercury, traducidas (2026-10-17). PURO.
 *
 * La copia guarda el total; el detalle se pide a Mercury factura por factura (`GET /ar/invoices/{id}`) cuando alguien
 * lo abre. Esto solo traduce lo que llega. ⚠ La forma exacta de las líneas no está en la copia de hoy: se leen con
 * tolerancia (`lineItems` o `items`; `name` o `description`; `unitPrice`, `price` o `amount`) y lo que falta queda en
 * null en vez de inventarse.
 */
import { armarDetalle, type DetalleDeFactura, type LineaDeFactura } from "../detalle-de-factura";

const texto = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);
const numero = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};

export function lineaDeMercury(l: Record<string, unknown>): LineaDeFactura {
  const cantidad = numero(l.quantity) ?? 1;
  const precio = numero(l.unitPrice) ?? numero(l.price) ?? numero(l.amount);
  const total = numero(l.total) ?? numero(l.subtotal) ?? (precio === null ? null : Math.round(precio * cantidad * 100) / 100);
  return {
    tipo: "linea",
    descripcion: texto(l.name) ?? texto(l.description) ?? "",
    producto: null,
    cantidad,
    precioUnitario: precio,
    descuentoPct: null,
    subtotal: total,
    cuenta: null,
  };
}

/** La factura de Mercury tal como llega de la API, traducida. */
export function detalleDeFacturaMercury(respuesta: Record<string, unknown>, f: { numero: string; fecha: string | null; moneda: string }): DetalleDeFactura {
  /* La API puede envolverla en `invoice`. */
  const raw = respuesta.invoice && typeof respuesta.invoice === "object" ? (respuesta.invoice as Record<string, unknown>) : respuesta;
  const filas = Array.isArray(raw.lineItems) ? raw.lineItems : Array.isArray(raw.items) ? raw.items : [];
  const nota = [texto(raw.payerMemo), texto(raw.memo), texto(raw.internalNote)].filter(Boolean).join("\n");
  return armarDetalle({
    fuente: "MERCURY",
    numero: f.numero,
    fecha: f.fecha,
    moneda: f.moneda,
    lineas: (filas as unknown[]).filter((x): x is Record<string, unknown> => !!x && typeof x === "object").map(lineaDeMercury),
    nota: nota || null,
  });
}
