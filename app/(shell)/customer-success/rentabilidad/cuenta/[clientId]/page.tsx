import { notFound, redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { veRentabilidad, veSuCarga } from "@/lib/rentabilidad/acceso";
import { RUTA_DE_TU_CARGA } from "@/lib/carga/rutas";
import { cargarMargenDeLaCuenta } from "@/lib/rentabilidad/queries";
import MargenDeLaCuenta from "@/components/rentabilidad/MargenDeLaCuenta";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

// RENTABILIDAD › UNA CUENTA — el margen mes a mes, quién la atendió con su costo por hora, su factor y lo que respondió
// el equipo (2026-10-07). Solo dirección, como Rentabilidad. Lo vigila lib/rentabilidad/acceso.test.ts.
export default async function MargenDeLaCuentaPage({ params }: { params: Promise<{ clientId: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !veRentabilidad(ctx.role)) redirect(ctx && veSuCarga(ctx.role) ? RUTA_DE_TU_CARGA : "/clients");

  const { clientId } = await params;
  const datos = await cargarMargenDeLaCuenta(clientId);
  if (!datos) notFound();
  return <MargenDeLaCuenta datos={datos} contenedor={SHELL_DEFAULT} />;
}
