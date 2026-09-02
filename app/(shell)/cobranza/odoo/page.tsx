/**
 * /cobranza/odoo — emparejar los clientes de Odoo con las cuentas de Nexus.
 *
 * Es el paso PREVIO al espejo de facturas, y el orden importa: con 15 de 49 cuentas
 * resueltas por señal automática, encender el sync antes produciría facturas colgadas de la
 * cuenta equivocada, que cuesta más limpiar que hacerlo bien de entrada.
 *
 * Mismo gate que /cobranza (`cobranza.read`); el enforcement real vive en
 * guardCobranzaAccess, en /api/cobranza/odoo/emparejado.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import EmparejadoOdoo from "@/components/cobranza/EmparejadoOdoo";

export const dynamic = "force-dynamic";

export default async function EmparejadoOdooPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Emparejar con Odoo"
        description="Decile a Nexus qué cliente de Odoo corresponde a cada cuenta. Es trabajo de una sola vez: al confirmar se guarda la cédula, y la próxima el emparejado se sostiene solo."
      />
      <EmparejadoOdoo />
    </div>
  );
}
