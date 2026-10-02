/**
 * /cobranza/mercury — la integración con Mercury, con el molde de /cobranza/odoo: qué es, emparejar y lo que no cuadra
 * (2026-10-02).
 *
 * Mismo gate que /cobranza (`cobranza.read`); el enforcement real vive en guardCobranzaAccess, en /api/cobranza/mercury/**.
 * Los conteos se leen acá, en el servidor: deciden con qué pestaña abre.
 */
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import { requireInternalUser } from "@/lib/auth/supabase";
import { can } from "@/lib/auth/permissions/engine";
import { prisma } from "@/lib/db/prisma";
import { ultimaCorridaMercury } from "@/lib/cobranza/mercury/sync";
import { cargarDiferenciasMercury, cargarEmparejadoMercury } from "@/lib/cobranza/mercury/servicio";
import { resumenDeDiferencias } from "@/lib/cobranza/odoo/diferencias";
import { pestanaMercuryDe } from "@/lib/cobranza/mercury/pestanas";
import MercuryClient from "@/components/cobranza/MercuryClient";

export const dynamic = "force-dynamic";

export default async function MercuryPage({ searchParams }: { searchParams: Promise<{ pestana?: string }> }) {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "cobranza", "read"))) redirect("/clients");
  const { pestana } = await searchParams;
  const puedeEditar = await can(ctx.teamMember, "cobranza", "write");

  const [corrida, facturas, emparejado, diferencias] = await Promise.all([
    ultimaCorridaMercury(),
    prisma.facturaMercury.count({ where: { estadoEspejo: "VIGENTE" } }),
    cargarEmparejadoMercury().then((e) => e.conteos),
    cargarDiferenciasMercury().then((d) => resumenDeDiferencias(d.inconsistencias).filas),
  ]);

  return (
    <div className="px-6 py-8">
      <PageHeader
        title="Mercury"
        description="Nexus lee las facturas, los clientes y los pagos de Mercury y los pone al lado de los cobros. Solo lectura: nunca escribe en Mercury ni mueve un cobro por su cuenta."
      />
      <MercuryClient
        corrida={corrida}
        /* Sin token la copia no puede correr: la pantalla lo dice en vez de mostrar una lista vacía. */
        tieneToken={Boolean(process.env.MERCURY_API_TOKEN?.trim())}
        conteos={{
          facturas,
          clientes: emparejado.clientes,
          emparejados: emparejado.emparejados,
          porEmparejar: emparejado.sinEmparejar,
          cuentasSinCliente: emparejado.cuentasSinCliente,
          diferencias,
        }}
        puedeEditar={puedeEditar}
        pestanaInicial={pestanaMercuryDe(pestana)}
      />
    </div>
  );
}
