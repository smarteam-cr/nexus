/**
 * /finanzas/goals — «Metas y bonos» (2026-11-13). SOLO DIRECCIÓN (Super Admin), el mismo gate que los demás reportes.
 *
 * Responde una pregunta para la reunión de gerencia: ¿cómo vamos contra cada meta que da plata y qué falta? El nivel
 * Elite de HubSpot, el bono del 15 % de HubSpot y el bono de ingresos recurrentes. Cada número dice qué mide y de
 * dónde sale (lib/finanzas/metas-de-gerencia.ts); lo que HubSpot no expone se carga a mano en la misma pantalla.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { crDateParts } from "@/lib/jobs/time";
import { cargarMetasDeGerencia } from "@/lib/finanzas/metas-de-gerencia-server";
// Mismo contenedor que loading.tsx — la fuente única evita que page y skeleton deriven.
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import MetasDeGerencia from "@/components/finanzas/metas/MetasDeGerencia";

export const dynamic = "force-dynamic";

export default async function MetasYBonosPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const datos = await cargarMetasDeGerencia(crDateParts(new Date()).dateKey);
  return (
    <div className={SHELL_DEFAULT}>
      <MetasDeGerencia datos={datos} />
    </div>
  );
}
