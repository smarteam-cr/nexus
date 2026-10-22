import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { cargarSimulacionDeComisiones } from "@/lib/finanzas/modelo-comisiones/cargar";
import { alcanceDeComisiones } from "@/lib/finanzas/modelo-comisiones/quien-ve";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ModeloDeComisiones from "@/components/finanzas/comisiones/ModeloDeComisiones";

export const dynamic = "force-dynamic";

// FINANZAS › MODELOS › COMISIONES — el modelo de comisiones cerrado con Marco (2026-10-21): cómo funciona y una
// simulación. Entran Super Admin y el equipo comercial (Ventas, CSE, CSL); la simulación se carga SOLO con lo de quien
// mira (lib/finanzas/modelo-comisiones/quien-ve.ts): el alcance se decide antes de leer nada.
export default async function ModeloDeComisionesPage({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  const alcance = ctx ? alcanceDeComisiones(ctx.role, ctx.teamMember.id, isCostosRole(ctx.role)) : null;
  if (!ctx || !alcance) redirect("/clients");

  const sp = await searchParams;
  const datos = await cargarSimulacionDeComisiones(alcance);
  return (
    <div className={SHELL_DEFAULT}>
      <ModeloDeComisiones datos={datos} pestanaInicial={sp.pestana === "simulacion" ? "simulacion" : "como-funciona"} />
    </div>
  );
}
