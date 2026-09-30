/**
 * /api/cobranza/odoo/actualizar — traer lo último de Odoo ahora, sin esperar la copia de la mañana.
 *   POST → copia las facturas y la lista de clientes de Odoo y devuelve qué pasó, con la línea de «de cuándo es la
 *          copia» ya actualizada. Lo aprieta una persona: «Actualizar desde Odoo», arriba de las pestañas.
 *
 * Acceso: guardCobranzaAccess (ADMIN + SUPER_ADMIN), el de LECTURA. No cambia ningún dato del negocio: vuelve a copiar
 * lo que Odoo ya dice, igual que la copia automática de las 6. ⛔ Solo lee Odoo, y no toca ningún cobro.
 *
 * ⚠ Siempre responde 200 con un `estado` (COPIADO, RECIENTE, EN_CURSO, FALLO): que Odoo no conteste no es un error de
 * esta ruta, es la respuesta, y la pantalla la necesita entera para decir de cuándo es la copia que sigue mostrando.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { actualizarDesdeOdoo } from "@/lib/cobranza/odoo/servicio";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await actualizarDesdeOdoo(guard.user.email));
}
