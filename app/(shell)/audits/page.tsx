/**
 * /audits — las auditorías del portal de HubSpot (rediseño del 2026-10-04, sistema «Nexus · interfaz
 * interna»). Una fila por corrida con cómo quedó: lecturas, análisis, lo que falta comprobar a mano y
 * cuánto cambió el portal desde la anterior. Las filas las arma `filasDelListado`; el JSON de cada
 * auditoría no cruza al navegador.
 *
 * Gateada por `auditoria.read`. Las auditorías de portales de clientes se filtran por el acceso a ese
 * cliente (`auditoriasVisiblesWhere`), como el resto de Nexus.
 */
import { redirect } from "next/navigation";
import { EmptyState, PageHeader } from "@/components/ui";
import ListadoDeAuditorias from "@/components/auditoria/ListadoDeAuditorias";
import NuevaAuditoria, { type PortalParaAuditar } from "@/components/auditoria/NuevaAuditoria";
import { accessibleClientWhere } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions/engine";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import { auditoriasVisiblesWhere } from "@/lib/auditoria-portal/acceso";
import { filasDelListado } from "@/lib/auditoria-portal/listado";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export const dynamic = "force-dynamic";

const DESCRIPCION =
  "Cómo está configurado un portal de HubSpot: lo que se lee por API, lo que sugiere el análisis y lo que hay que comprobar a mano.";

export default async function AuditoriasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx) redirect("/");
  if (!(await can(ctx.teamMember, "auditoria", "read"))) redirect("/clients");

  const [auditorias, sistema, clientes] = await Promise.all([
    prisma.audit.findMany({
      where: await auditoriasVisiblesWhere(ctx.user),
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        createdAt: true,
        accountId: true,
        clientId: true,
        data: true,
        client: { select: { name: true } },
        account: { select: { isSystem: true } },
      },
    }),
    prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { id: true } }),
    accessibleClientWhere(ctx.user, { kinds: "all" }),
  ]);
  const deClientes = await prisma.hubspotAccount.findMany({
    where: { isSystem: false, clientId: { not: null }, ...(clientes ? { client: clientes } : {}) },
    select: { clientId: true, client: { select: { name: true } } },
    orderBy: { client: { name: "asc" } },
  });
  const portales: PortalParaAuditar[] = [
    ...(sistema ? [{ clientId: null, nombre: "Portal de Smarteam" }] : []),
    ...deClientes.map((c) => ({ clientId: c.clientId, nombre: c.client?.name ?? "Portal de un cliente" })),
  ];

  const filas = filasDelListado(
    auditorias.map((a) => ({
      id: a.id,
      name: a.name,
      createdAt: a.createdAt,
      accountId: a.accountId,
      clientId: a.clientId,
      clienteNombre: a.client?.name ?? null,
      esDelSistema: a.account?.isSystem ?? !a.clientId,
      data: a.data,
    })),
  );

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader title="Auditoría del portal" description={DESCRIPCION} action={filas.length > 0 ? <NuevaAuditoria portales={portales} /> : undefined} />
      {filas.length === 0 ? (
        <EmptyState
          variant="dashed"
          title="Todavía no hay auditorías"
          description="Una auditoría lee cómo está configurado un portal: etapas, propietarios, workflows y propiedades. Lo que no se puede leer queda en «Comprobar a mano»."
          action={<NuevaAuditoria portales={portales} />}
        />
      ) : (
        <ListadoDeAuditorias filas={filas} />
      )}
    </div>
  );
}
