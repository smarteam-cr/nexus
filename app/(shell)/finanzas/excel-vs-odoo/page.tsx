/**
 * /finanzas/excel-vs-odoo — «Excel vs Odoo»: lo que el último Excel de cobranza de Alex y la copia de Odoo
 * no dicen igual, factura por factura, y quién lo cierra. Para Alex (cobranza) y Marco (dirección).
 * Reemplazó a «Plan de cobranza» el 2026-09-13: esa contaba qué cambió en Nexus, y lo que se había pedido
 * era esto.
 *
 * ⚠ Gate `isCostosRole` (SUPER_ADMIN), NO `cobranza.read`. Medido en solo lectura el 2026-09-13: los
 * SUPER_ADMIN son Alex, Marco y Elías, y el pedido es que nadie más la vea. `cobranza.read` la abriría
 * también a ADMIN y a quien la matriz de /team le dé esa celda. Además el escaneo de
 * costos-privacy.test.ts exige este gate en toda página de finanzas que no se declare como ingreso.
 * ⚠ Si Alex deja de ser SUPER_ADMIN, la página se le cierra.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { loadExcelVsOdoo } from "@/lib/finanzas/excel-vs-odoo-server";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import ExcelVsOdooPanel from "@/components/finanzas/ExcelVsOdooPanel";

export const dynamic = "force-dynamic";

export default async function ExcelVsOdooPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !isCostosRole(ctx.role)) redirect("/clients");

  const datos = await loadExcelVsOdoo();

  return (
    <div className={SHELL_DEFAULT}>
      <ExcelVsOdooPanel datos={datos} />
    </div>
  );
}
