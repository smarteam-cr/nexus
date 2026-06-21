/**
 * GET /api/dashboard/portfolio
 *
 * D.3 panel de cartera — lista de TODOS los proyectos con su resumen (avance, riesgos,
 * control de alcance, salud derivada+override). EXCLUSIVO de roles con `seeAllClients`
 * (CSL / Ventas / Super Admin) → un CSE recibe 403. La página /dashboard hace SSR con el
 * mismo loader; este GET se usa para re-fetch del cliente (p.ej. tras editar la salud).
 */
import { NextResponse } from "next/server";
import { guardCapability } from "@/lib/auth/api-guards";
import { accessibleClientWhere } from "@/lib/auth/access";
import { loadPortfolio } from "@/lib/portfolio/load";

export async function GET() {
  const guard = await guardCapability("seeAllClients");
  if (guard instanceof NextResponse) return guard;

  // Para roles see-all → null (toda la cartera). Se respeta el filtro por si en el futuro
  // un rol scopeado accede.
  const where = await accessibleClientWhere(guard.user);
  const projects = await loadPortfolio(where);
  return NextResponse.json({ projects });
}
