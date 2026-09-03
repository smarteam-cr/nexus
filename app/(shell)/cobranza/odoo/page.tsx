/**
 * /cobranza/odoo — la integración con el ERP, en tres pestañas: qué es, emparejar, y lo que
 * no cuadra.
 *
 * Mismo gate que /cobranza (`cobranza.read`); el enforcement real vive en guardCobranzaAccess,
 * en /api/cobranza/odoo/**.
 *
 * ⚠ Los conteos se leen ACÁ, en el servidor, y no en el cliente: deciden qué pestaña abre
 * primero, y hacerlo en el cliente significaría montar la pestaña equivocada y saltar.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { isCostosRole } from "@/lib/auth/cobranza-roles";
import { prisma } from "@/lib/db/prisma";
import { ultimaCorrida } from "@/lib/cobranza/odoo/sync";
import { cargarDiferencias } from "@/lib/cobranza/odoo/servicio";
import OdooClient from "@/components/cobranza/OdooClient";

export const dynamic = "force-dynamic";

export default async function OdooPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");

  const [corrida, facturas, cuentasVinculadas, cuentas, diferencias] = await Promise.all([
    ultimaCorrida(),
    prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } }),
    prisma.odooPartnerVinculo.count({ where: { cuentaId: { not: null } } }),
    prisma.cuentaFinanciera.count(),
    /* El badge cuenta lo que falta RESOLVER: las marcadas «está bien así» siguen en la lista
       para poder reabrirlas, pero no son trabajo pendiente. */
    cargarDiferencias().then((d) => d.inconsistencias.filter((i) => !i.aceptada).length),
  ]);

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Odoo"
        description="Nexus lee las facturas del ERP y las pone al lado de los cobros. Solo lectura: nunca escribe en Odoo ni mueve un cobro por su cuenta."
      />
      <OdooClient
        corrida={corrida}
        conteos={{ facturas, cuentasVinculadas, cuentas, diferencias }}
        /* ⚠ /integrations/odoo es SOLO SUPER_ADMIN. Mostrarle el enlace a un ADMIN sería un
           callejón sin salida: hace clic y el gate lo rebota a /clients, que se lee como un
           error de la app y no como una restricción. */
        puedeVerCorridas={isCostosRole(ctx.role)}
      />
    </div>
  );
}
