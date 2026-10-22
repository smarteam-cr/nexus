/**
 * /api/cobranza/odoo/actualizar — traer lo último de Odoo ahora, sin esperar la copia de la hora.
 *   POST → copia las facturas y la lista de clientes de Odoo, cobra lo pagado y devuelve qué pasó, con la línea de «de
 *          cuándo es la copia» ya actualizada y `cobro` (qué pasó con lo pagado). Lo aprieta una persona: «Actualizar
 *          desde Odoo», arriba de las pestañas.
 *
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN), el de LECTURA. Vuelve a copiar lo que Odoo ya dice, igual que la
 * copia automática de cada hora. ⛔ Solo lee Odoo. Desde el 2026-10-21 corre además el cobro de lo pagado: lo que el
 * job de la hora haría solo, firmado por el sistema y no por quien aprieta (lib/cobranza/libro/cobro-a-pedido.ts).
 *
 * ⚠ Siempre responde 200 con un `estado` (COPIADO, RECIENTE, EN_CURSO, FALLO): que Odoo no conteste no es un error de
 * esta ruta, es la respuesta, y la pantalla la necesita entera para decir de cuándo es la copia que sigue mostrando.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { actualizarDesdeOdoo } from "@/lib/cobranza/odoo/servicio";
import { cobrarLoPagadoAhora } from "@/lib/cobranza/libro/cobro-a-pedido";
import { resumenDelCobro } from "@/lib/finanzas/actualizar-tablero";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  const copia = await actualizarDesdeOdoo(guard.user.email);
  /* Después de copiar, el cobro de lo pagado (2026-10-21): sin esto la factura pagada llegaba y la cuota seguía sin
     cobrar hasta el día siguiente. Nunca lanza: `cobro.ok` en false dice por qué. */
  const cobro = resumenDelCobro(await cobrarLoPagadoAhora(guard.user.email));
  return NextResponse.json({ ...copia, cobro });
}
