/**
 * /cobranza/production — el paso a producción de cada proyecto y sus responsables (2026-11-13).
 *
 * La llenan personas que no ven Cobranza: la CSL pone quién confirma la producción y quién cobra; Desarrollo confirma el
 * día en que el servicio pasó a producción, y con eso arranca su cobro. Sin montos. Quién entra: lib/cobranza/produccion-acceso.ts.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { puedeVerProduccion } from "@/lib/cobranza/produccion-acceso";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { PageHeader } from "@/components/ui";
import PasoAProduccion from "@/components/cobranza/PasoAProduccion";

export const dynamic = "force-dynamic";

export default async function PasoAProduccionPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  const [veCobranza, editaCobranza] = await Promise.all([can(ctx.teamMember, "cobranza", "read"), can(ctx.teamMember, "cobranza", "write")]);
  if (!puedeVerProduccion({ rol: ctx.role, email: ctx.user.email, veCobranza, editaCobranza })) redirect("/para-ti");

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Paso a producción"
        description="El cobro de un conector o de un servicio recurrente arranca el día en que pasa a producción. Aquí se confirma ese día, y quién lo confirma y quién cobra en cada proyecto."
        {...(veCobranza ? { backHref: "/cobranza?ver=seguimiento", backLabel: "Cobranza" } : {})}
      />
      <PasoAProduccion hoyISO={crDateParts(new Date()).dateKey} />
    </div>
  );
}
