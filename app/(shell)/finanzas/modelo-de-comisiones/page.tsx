import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { cargarSimulacionDeComisiones } from "@/lib/finanzas/modelo-comisiones/cargar";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ModeloDeComisiones from "@/components/finanzas/comisiones/ModeloDeComisiones";

export const dynamic = "force-dynamic";

// FINANZAS › MODELOS › COMISIONES — la propuesta de comisiones del 15 oct de 2026: cómo funciona y una simulación por
// vendedor con sus ventas ganadas y su meta de HubSpot. Solo Super Admin: lleva lo que gana cada persona.
export default async function ModeloDeComisionesPage({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const sp = await searchParams;
  const datos = await cargarSimulacionDeComisiones();
  return (
    <div className={SHELL_DEFAULT}>
      <ModeloDeComisiones datos={datos} pestanaInicial={sp.pestana === "simulacion" ? "simulacion" : "como-funciona"} />
    </div>
  );
}
