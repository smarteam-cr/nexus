/**
 * /finanzas/costos/aguinaldo — la provisión estimada por colaborador, SOLO
 * SUPER_ADMIN. Gate AUTÓNOMO isCostosRole(role) antes de cualquier query.
 *
 * Es un DATO OBSERVADO del libro (suma dic→nov ÷ 12), no una tasa: Nexus no
 * tiene ni va a tener tablas de CCSS, cargas ni renta.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadAguinaldo } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import AguinaldoPanel from "@/components/finanzas/AguinaldoPanel";

export const dynamic = "force-dynamic";

export default async function FinanzasAguinaldoPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const anio = Number(crDateParts(new Date()).dateKey.slice(0, 4));
  const aguinaldo = await loadAguinaldo(anio);

  return (
    <div className={SHELL_DEFAULT}>
      <AguinaldoPanel initial={aguinaldo} />
    </div>
  );
}
