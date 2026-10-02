/**
 * /api/cobranza/mercury/actualizar — traer lo último de Mercury ahora, sin esperar la copia de la mañana.
 *   POST → copia facturas, clientes y movimientos de Mercury y devuelve qué pasó, con la línea de «de cuándo es la
 *          copia» ya actualizada. Lo aprieta una persona: «Actualizar desde Mercury».
 *
 * Acceso: guardCobranzaAccess (lectura de Cobranza): no cambia ningún dato del negocio, vuelve a copiar lo que Mercury
 * ya dice. ⛔ Solo lee Mercury (el token no puede escribir) y no toca ningún cobro. Siempre 200 con un `estado`.
 */
import { NextResponse } from "next/server";
import { guardCobranzaAccess } from "@/lib/auth/api-guards";
import { actualizarDesdeMercury } from "@/lib/cobranza/mercury/servicio";

export const dynamic = "force-dynamic";

export async function POST() {
  const guard = await guardCobranzaAccess();
  if (guard instanceof NextResponse) return guard;
  return NextResponse.json(await actualizarDesdeMercury(guard.user.email));
}
