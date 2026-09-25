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
import { cargarDiferencias, contarEmparejado } from "@/lib/cobranza/odoo/servicio";
import { resumenDeDiferencias } from "@/lib/cobranza/odoo/diferencias";
import { pestanaDe } from "@/lib/cobranza/odoo/pestanas";
import OdooClient from "@/components/cobranza/OdooClient";

export const dynamic = "force-dynamic";

export default async function OdooPage({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  const { pestana } = await searchParams;
  const pestanaInicial = pestanaDe(pestana);
  /* Cerrar a mano una factura soltada es una ESCRITURA: afirma que alguien anuló un documento
     en un sistema que Nexus no puede verificar. La API ya lo exige; acá se evita ofrecer el
     botón a quien va a chocar con un 403. */
  const puedeEditar = await can(ctx.teamMember, "cobranza", "write");

  const [corrida, facturas, emparejado, diferencias] = await Promise.all([
    ultimaCorrida(),
    prisma.facturaOdoo.count({ where: { estadoEspejo: "VIGENTE" } }),
    /* ⭐ La regla única de «por emparejar» (vía Odoo y sin cliente de Odoo), la misma de la lista y de «Lo que
       no cuadra». Hasta el 2026-09-25 acá se contaban FICHAS vinculadas contra todas las cuentas: la pestaña
       decía 28 con 29 tarjetas, y las 8 cuentas de Mercury no se iban nunca. */
    contarEmparejado(),
    /* El badge cuenta lo que falta RESOLVER: FILAS pendientes, las mismas que «cosas por resolver»
       (`resumenDeDiferencias`). Lo marcado «está bien así» sigue en la respuesta para poder deshacerlo, pero no
       es trabajo pendiente. ⚠ Hasta el 2026-09-25 contaba líneas (15, con 107 filas por mirar). Es solo el
       número con que abre: «Lo que no cuadra» lo actualiza al marcar, sin recargar. */
    cargarDiferencias().then((d) => resumenDeDiferencias(d.inconsistencias).filas),
  ]);

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Odoo"
        description="Nexus lee las facturas del ERP y las pone al lado de los cobros. Solo lectura: nunca escribe en Odoo ni mueve un cobro por su cuenta."
      />
      <OdooClient
        corrida={corrida}
        conteos={{
          facturas,
          cuentas: emparejado.cuentas,
          cuentasVinculadas: emparejado.vinculadas,
          porEmparejar: emparejado.porEmparejar,
          enMercury: emparejado.enMercury,
          enOtra: emparejado.enOtra,
          diferencias,
        }}
        /* ⚠ /integrations/odoo es SOLO SUPER_ADMIN. Mostrarle el enlace a un ADMIN sería un
           callejón sin salida: hace clic y el gate lo rebota a /clients, que se lee como un
           error de la app y no como una restricción. */
        puedeVerCorridas={isCostosRole(ctx.role)}
        puedeEditar={puedeEditar}
        pestanaInicial={pestanaInicial}
      />
    </div>
  );
}
