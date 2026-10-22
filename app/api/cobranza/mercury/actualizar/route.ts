/**
 * /api/cobranza/mercury/actualizar — traer lo último de Mercury ahora, sin esperar la copia de la hora.
 *   POST → copia facturas, clientes y movimientos de Mercury, cobra lo pagado y devuelve qué pasó, con la línea de «de
 *          cuándo es la copia» ya actualizada y `cobro`. Lo aprieta una persona: «Actualizar desde Mercury».
 *
 * Acceso: guardCobranzaAccess (lectura de Cobranza): vuelve a copiar lo que Mercury ya dice. ⛔ Solo lee Mercury (el
 * token no puede escribir). Desde el 2026-10-21 corre además el cobro de lo pagado, firmado por el sistema: lo que el
 * job de la hora haría solo (lib/cobranza/libro/cobro-a-pedido.ts). Siempre 200 con un `estado`.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { actualizarDesdeMercury } from "@/lib/cobranza/mercury/servicio";
import { cobrarLoPagadoAhora } from "@/lib/cobranza/libro/cobro-a-pedido";
import { resumenDelCobro } from "@/lib/finanzas/actualizar-tablero";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const copia = await actualizarDesdeMercury(guard.user.email);
  /* Después de copiar, el cobro de lo pagado (2026-10-21): sin esto la factura pagada llegaba y la cuota seguía sin
     cobrar hasta el día siguiente. Nunca lanza: `cobro.ok` en false dice por qué. */
  const cobro = resumenDelCobro(await cobrarLoPagadoAhora(guard.user.email));
  return NextResponse.json({ ...copia, cobro });
}
