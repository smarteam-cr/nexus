/**
 * /finanzas/modelo-de-comisiones — el MODELO de comisiones (2026-10-07): dónde Nexus va a ayudar a definir los porcentajes, cuándo
 * aplican y sus topes. SOLO SUPER_ADMIN, con el mismo gate autónomo que Costos (isCostosRole): es política de
 * remuneración.
 *
 * ⚠ No es lo que se le PAGA a cada vendedor: eso vive en /finanzas/costos/comisiones-vendedor (lo devengado sobre los
 * cobros, lo liquidado y el historial). Esta pantalla define las reglas; esa, lo que salió de aplicarlas.
 *
 * Por ahora es el caparazón: todavía no carga datos.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ModeloDeComisiones from "@/components/finanzas/comisiones/ModeloDeComisiones";

export const dynamic = "force-dynamic";

export default async function ComisionesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  return (
    <div className={SHELL_DEFAULT}>
      <ModeloDeComisiones />
    </div>
  );
}
