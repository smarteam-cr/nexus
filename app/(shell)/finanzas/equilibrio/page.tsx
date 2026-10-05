/**
 * /finanzas/equilibrio — el punto de equilibrio, para revisar entre RevOps, el CFO y el CEO (rediseño 2026-10-05).
 * SOLO SUPER_ADMIN, mismo gate autónomo que /finanzas/costos.
 *
 * Por qué acá y no como un tab más de /cobranza: el reporte junta ingresos con planilla y estructura de costos, así que
 * hereda el candado de lo más sensible que mezcla. Los paneles SUPER_ADMIN ya se habían mudado a /finanzas/* por esa
 * misma razón, y esta carpeta es la que el escaneo estructural de privacidad vigila.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadReporteAnual } from "@/lib/cobranza";
import { TIPO_SERVICIO_LABEL } from "@/lib/cobranza/schema";
import { prisma } from "@/lib/db/prisma";
import { crDateParts } from "@/lib/jobs/time";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import PuntoDeEquilibrio from "@/components/finanzas/equilibrio/PuntoDeEquilibrio";

export const dynamic = "force-dynamic";

export default async function FinanzasEquilibrioPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  // "Hoy" = día calendario de Costa Rica: decide qué mes es futuro y, con eso, qué
  // meses entran al promedio del equilibrio.
  const todayISO = crDateParts(new Date()).dateKey;
  const anio = Number(todayISO.slice(0, 4));
  const reporte = await loadReporteAnual(anio, todayISO);

  // Quién firmó la decisión de los aliados, por su nombre de pila.
  const firmante = reporte.decisionAliados?.decididoPor;
  const miembros = firmante
    ? await prisma.teamMember.findMany({ where: { email: { equals: firmante, mode: "insensitive" } }, select: { email: true, name: true } })
    : [];
  const nombres = Object.fromEntries(miembros.map((m) => [m.email.toLowerCase(), m.name.split(" ")[0] || m.email]));

  return (
    <div className={SHELL_DEFAULT}>
      <PuntoDeEquilibrio initialReporte={reporte} hoyISO={todayISO} etiquetasDeServicio={TIPO_SERVICIO_LABEL} nombres={nombres} />
    </div>
  );
}
