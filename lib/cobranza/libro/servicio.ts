/**
 * lib/cobranza/libro/servicio.ts — «Lo pagado», la lista de cada mañana (plan «Un solo libro financiero», paso 2,
 * 2026-10-17). Server-only.
 *
 * Lo mismo que hace `scripts/aplicar-odoo-y-mercury.ts`, desde la pantalla: Conciliación › «Lo pagado» muestra lo que
 * Odoo y Mercury ya dicen (cuotas que se pegan a su factura, cuotas pagadas allá listas para cobrar, choques) y quien
 * concilia lo confirma con un clic, con SU firma.
 *
 * ⛔ El cobro sin firma de una persona no está autorizado (INV3, INV25): esto nunca corre solo. La firma es el correo de
 * quien aprieta el botón (sale del guard de la ruta, no del cuerpo del pedido), y se escribe SOLO lo que esa persona
 * marcó, con el día del pago que vio (`accionesElegidas`, lib/cobranza/libro/hechos.ts).
 * ⛔ Nada de esto escribe en Odoo ni en Mercury: Odoo se lee para saber el día de cada pago.
 */
import "server-only";
import { aplicarLoQueDicenOdooYMercury, type ResultadoDelLibro } from "./aplicar";
import type { SeleccionDelLibro } from "./hechos";
import { crearTransporteXmlRpc, configDesdeEntorno } from "@/lib/cobranza/odoo/transporte-xmlrpc";
import type { OdooTransport } from "@/lib/cobranza/odoo/transporte";

/** Cuánto se espera cada respuesta de Odoo cuando la pide una persona (como «Actualizar desde Odoo»). */
const ESPERA_ODOO_MS = 20_000;

/** El puerto de Odoo, o null si este servidor no tiene la clave: las pagadas de Odoo quedan «sin el día del pago». */
function transporteOdoo(): OdooTransport | null {
  if (!process.env.ODOO_PASSWORD) return null;
  return crearTransporteXmlRpc({ ...configDesdeEntorno(), timeoutMs: ESPERA_ODOO_MS });
}

export interface LoPagado extends ResultadoDelLibro {
  /** false = el servidor no tiene la clave de Odoo y no pudo leer el día de los pagos de Odoo. */
  conOdoo: boolean;
}

/** La lista, sin escribir nada. */
export async function cargarLoPagado(hoy: string): Promise<LoPagado> {
  const odoo = transporteOdoo();
  const r = await aplicarLoQueDicenOdooYMercury({ aplicar: false, cobrar: true, firma: "", hoy, odoo });
  return { ...r, conOdoo: odoo !== null };
}

/**
 * Escribe lo marcado, firmado por `firma` (un miembro del equipo: lo verifica `aplicarLoQueDicenOdooYMercury`).
 * Devuelve lo escrito, lo saltado con su porqué y la lista que queda después (null si no se pudo releer).
 */
export async function confirmarLoPagado(
  firma: string,
  seleccion: SeleccionDelLibro,
  hoy: string,
): Promise<{ resultado: ResultadoDelLibro; queda: LoPagado | null }> {
  const odoo = transporteOdoo();
  const resultado = await aplicarLoQueDicenOdooYMercury({ aplicar: true, cobrar: true, firma, hoy, odoo, seleccion });
  /* ⚠ Lo escrito ya quedó: si falla la relectura de la lista, se devuelve el resultado igual (con `queda` en null) y la
     pantalla la vuelve a pedir. Un error acá haría creer que no se escribió nada. */
  let queda: LoPagado | null = null;
  try {
    queda = await cargarLoPagado(hoy);
  } catch {
    console.error("[cobranza/libro] se escribió, pero no se pudo releer la lista (detalle omitido a propósito)");
  }
  return { resultado, queda };
}
