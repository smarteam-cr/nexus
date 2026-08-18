/**
 * /finanzas/equilibrio — el reporte anual: la curva mensual de la operación contra su
 * punto de equilibrio. SOLO SUPER_ADMIN, mismo gate autónomo que /finanzas/costos.
 *
 * Por qué acá y no como un tab más de /cobranza: el reporte junta ingresos con planilla
 * y estructura de costos, así que hereda el candado de lo más sensible que mezcla. Los
 * paneles SUPER_ADMIN ya se habían mudado a /finanzas/* por esa misma razón, y esta
 * carpeta es la que el escaneo estructural de privacidad vigila.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadReporteAnual } from "@/lib/cobranza";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import EquilibrioClient from "@/components/finanzas/equilibrio/EquilibrioClient";

export const dynamic = "force-dynamic";

export default async function FinanzasEquilibrioPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  // "Hoy" = día calendario de Costa Rica: decide qué mes es futuro y, con eso, qué
  // meses entran al promedio del equilibrio.
  const todayISO = crDateParts(new Date()).dateKey;
  const anio = Number(todayISO.slice(0, 4));
  const reporte = await loadReporteAnual(anio, todayISO);

  return (
    <div className={SHELL_DEFAULT}>
      <EquilibrioClient initialReporte={reporte} />
    </div>
  );
}
