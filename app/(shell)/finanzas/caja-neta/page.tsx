/**
 * /finanzas/caja-neta — entra menos sale por bucket, SOLO SUPER_ADMIN. Mismo
 * gate autónomo que /finanzas/costos (ver ese page.tsx para el porqué).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadCajaNeta, loadSnapshotSeries } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import FinanzasCajaNetaClient from "@/components/finanzas/FinanzasCajaNetaClient";

export const dynamic = "force-dynamic";

export default async function FinanzasCajaNetaPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const todayISO = crDateParts(new Date()).dateKey;
  const [cajaNeta, series] = await Promise.all([loadCajaNeta(todayISO), loadSnapshotSeries()]);

  return (
    <div className={SHELL_DEFAULT}>
      <FinanzasCajaNetaClient initialCajaNeta={cajaNeta} initialSeries={series} />
    </div>
  );
}
