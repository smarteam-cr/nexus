/**
 * /finanzas/caja — «Dónde está la plata» (2026-11-13): saldos de banco, proyección al cierre del año, pagos de cada
 * semana según la política y, si no alcanza, el orden de pago.
 *
 * Gate: Super Admin, o quien tenga «Caja y pagos» (`tesoreria`) en su permiso por persona de /team (María José). La
 * planilla llega SUMADA: este permiso no abre ningún salario (lib/finanzas/caja/caja-server.ts).
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { puedePorPersona } from "@/lib/auth/salarios-por-persona";
import { cargarCaja, type CajaDTO } from "@/lib/finanzas/caja/caja-server";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { Alert, PageHeader } from "@/components/ui";
import DondeEstaLaPlata from "@/components/finanzas/caja/DondeEstaLaPlata";

export const dynamic = "force-dynamic";

export default async function DondeEstaLaPlataPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(isCostosRole(ctx.role) || puedePorPersona(ctx.role, ctx.teamMember, { section: "tesoreria", action: "read" }))) redirect("/clients");
  const puedeEditar = puedePorPersona(ctx.role, ctx.teamMember, { section: "tesoreria", action: "write" });

  const todayISO = crDateParts(new Date()).dateKey;
  let caja: CajaDTO | null = null;
  try {
    caja = await cargarCaja(todayISO);
  } catch (e) {
    if (!esquemaDesactualizado(e)) throw e;
  }

  return (
    <div className={SHELL_DEFAULT}>
      {caja ? (
        <DondeEstaLaPlata initial={caja} puedeEditar={puedeEditar} />
      ) : (
        <div className="space-y-6">
          <PageHeader title="Dónde está la plata" />
          <Alert variant="warning">Falta correr el SQL de la caja (scripts/sql/2026-11-13-caja-y-pagos.sql) en esta base.</Alert>
        </div>
      )}
    </div>
  );
}
