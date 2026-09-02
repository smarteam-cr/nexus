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
import DiferenciasOdoo from "@/components/cobranza/DiferenciasOdoo";

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

      {/* La lista de diferencias vive junto al emparejado a propósito: el emparejado ES la
          primera línea de esa lista, y separarlos obligaría a saltar entre dos pantallas para
          entender por qué una factura no tiene dueño. */}
      <div className="mt-10">
        <h2 className="text-base font-semibold text-fg">Lo que no cuadra con Odoo</h2>
        <p className="mb-3 mt-0.5 text-sm text-fg-muted">
          Ordenado por la plata que mueve. Cada línea dice quién la puede cerrar.
        </p>
        <DiferenciasOdoo />
      </div>
    </div>
  );
}
