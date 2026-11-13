/**
 * /finanzas/companies — las sociedades de Smarteam (2026-11-13): lo que se deben entre sí, lo que se movió sin una
 * factura que lo respalde y el catálogo de cuentas de Odoo.
 *
 * Solo dirección y quien supervisa: el gate de Costos (`isCostosRole`), como el cierre; las rutas que escriben lo
 * vuelven a pedir (`guardSupervisionFinanzas`). Lo de Odoo llega con la copia de cada hora; «Actualizar» la corre ya.
 */
import { redirect } from "next/navigation";
import { requireInternalUser } from "@/lib/auth/supabase";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { cargarPaginaDeSociedades } from "@/lib/sociedades/server";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import SociedadesClient from "@/components/sociedades/SociedadesClient";

export const dynamic = "force-dynamic";

export default async function SociedadesPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/clients");
  if (!isCostosRole(ctx.role)) redirect("/finanzas/pendientes");
  const d = await cargarPaginaDeSociedades();
  return (
    <div className={SHELL_DEFAULT}>
      <SociedadesClient d={d} />
    </div>
  );
}
