/**
 * lib/cobranza/libro/servicio.ts — «Lo pagado», la lista de cada mañana (plan «Un solo libro financiero», paso 2,
 * 2026-10-17). Server-only.
 *
 * Lo mismo que hace `scripts/aplicar-odoo-y-mercury.ts`, desde la pantalla: Conciliación › «Lo pagado» muestra lo que
 * Odoo y Mercury ya dicen (cuotas que se pegan a su factura, cuotas pagadas allá listas para cobrar, choques) y quien
 * concilia lo confirma con un clic, con SU firma.
 *
 * Desde el 2026-10-18 lo pagado y conciliado con el banco se cobra SOLO cada mañana (`correrElCobroDelDia`, job
 * `lo-pagado-daily`), firmado por el sistema. Esta lista queda para lo que no es seguro (Odoo «en proceso de pago», una
 * entrada de Mercury encontrada solo por el monto…) y para pegar facturas: eso lo confirma una persona, con SU firma, que
 * sale del guard de la ruta y no del cuerpo del pedido, y se escribe SOLO lo que marcó (`accionesElegidas`).
 * ⛔ Nada de esto escribe en Odoo ni en Mercury: Odoo se lee para saber el día de cada pago.
 */
import "server-only";
import { aplicarLoQueDicenOdooYMercury, cobrarLoPagadoSolo, type ResultadoDelCobroSolo, type ResultadoDelLibro } from "./aplicar";
import type { SeleccionDelLibro } from "./hechos";
import { decidirElTurno, estadoDeLaCopia, type Turno } from "./turno";
import { crearTransporteXmlRpc, configDesdeEntorno } from "@/lib/cobranza/odoo/transporte-xmlrpc";
import type { OdooTransport } from "@/lib/cobranza/odoo/transporte";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { motivoApagado } from "@/lib/jobs/requisitos";

/** Cuánto se espera cada respuesta de Odoo cuando la pide una persona (como «Actualizar desde Odoo»). */
const ESPERA_ODOO_MS = 20_000;

/** El puerto de Odoo, o null si este servidor no tiene la clave: las pagadas de Odoo quedan «sin el día del pago». */
function transporteOdoo(): OdooTransport | null {
  if (!process.env.ODOO_PASSWORD) return null;
  return crearTransporteXmlRpc({ ...configDesdeEntorno(), timeoutMs: ESPERA_ODOO_MS });
}

/**
 * El cobro solo del día (job `lo-pagado-daily`). Mira si las copias de Odoo y Mercury corrieron bien hoy
 * (`decidirElTurno`) y, si toca, cobra con las que están al día. `aplicar: false` = el simulacro del mismo cálculo.
 * Devuelve `resultado: null` si todavía no toca (hay que esperar a una copia).
 */
export async function correrElCobroDelDia(
  now: Date,
  opciones: { aplicar: boolean; ignorarLaHora?: boolean },
): Promise<{ turno: Turno; resultado: ResultadoDelCobroSolo | null }> {
  const { dateKey: hoy, hour } = crDateParts(now);
  const [odooBuena, mercuryBuena] = await Promise.all([
    prisma.syncOdooCorrida.findFirst({ where: { ok: true }, orderBy: { iniciadaEn: "desc" }, select: { iniciadaEn: true } }),
    prisma.syncMercuryCorrida.findFirst({ where: { ok: true }, orderBy: { iniciadaEn: "desc" }, select: { iniciadaEn: true } }),
  ]);
  const diaDe = (x: { iniciadaEn: Date } | null) => (x ? crDateParts(x.iniciadaEn).dateKey : null);
  const turno = decidirElTurno(opciones.ignorarLaHora ? 23 : hour, {
    ODOO: estadoDeLaCopia(motivoApagado("odoo-espejo-daily", process.env) === null, diaDe(odooBuena), hoy),
    MERCURY: estadoDeLaCopia(motivoApagado("mercury-espejo-daily", process.env) === null, diaDe(mercuryBuena), hoy),
  });
  if (!turno.correr) return { turno, resultado: null };
  const odoo = turno.fuentes.includes("ODOO") && process.env.ODOO_PASSWORD ? crearTransporteXmlRpc(configDesdeEntorno()) : null;
  const resultado = await cobrarLoPagadoSolo({ aplicar: opciones.aplicar, hoy, odoo, fuentes: turno.fuentes });
  return { turno, resultado };
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
