/**
 * /finanzas/costos — costos fijos + gastos puntuales, SOLO SUPER_ADMIN.
 * Gate AUTÓNOMO: isCostosRole(role), sin depender de cobranza.read (COSTOS_ROLES
 * es subconjunto estricto y SUPER_ADMIN es all-true en el engine de permisos —
 * desacoplar no mueve a nadie de acceso real). El redirect corta ANTES de
 * ejecutar cualquier query — ni un byte de costos entra al payload RSC de un
 * no-SUPER_ADMIN.
 */
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadCostos, loadGastos } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import FinanzasCostosClient from "@/components/finanzas/FinanzasCostosClient";

export const dynamic = "force-dynamic";

export default async function FinanzasCostosPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  const [costos, gastos] = await Promise.all([loadCostos(), loadGastos()]);

  return (
    <AppShell>
      <div className="px-6 py-8">
        <FinanzasCostosClient initialCostos={costos} initialGastos={gastos} todayISO={todayISO} />
      </div>
    </AppShell>
  );
}
