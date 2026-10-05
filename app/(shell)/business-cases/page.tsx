/**
 * /business-cases — Propuestas: la entrada de quien vende (rediseño del 2026-10-05).
 *
 * Lee todo de una vez y le baja a la lista filas ya resueltas: el estado y «el cliente» salen de
 * UNA regla (lib/business-cases/estado-de-la-propuesta.ts), calculada acá en el servidor, en la hora
 * de Costa Rica. La lista solo filtra (pestañas, «Mías», búsqueda). Gateado por `ventas.read`.
 */
import { redirect } from "next/navigation";
import Link from "next/link";
import { PageHeader } from "@/components/ui";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import { can } from "@/lib/auth/permissions/engine";
import { resolveBcType } from "@/lib/business-cases/case-types";
import { hubspotCompanyUrl } from "@/lib/hubspot/urls";
import { estadoDeLaPropuesta, ultimoHecho } from "@/lib/business-cases/estado-de-la-propuesta";
import ListaDePropuestas, { type FilaDeLaLista } from "@/components/propuestas/ListaDePropuestas";

export const dynamic = "force-dynamic";

export default async function PropuestasPage() {
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");
  const yo = ctx.teamMember.email.toLowerCase();

  /* Las propuestas viven ENTERAS en el portal del sistema (el CRM de Smarteam): el link a la
     empresa se arma contra ese portal y no contra el que el cliente pudo haber conectado. */
  const [cases, systemAccount, equipo] = await Promise.all([
    prisma.businessCase.findMany({
      select: {
        id: true,
        name: true,
        caseType: true,
        updatedAt: true,
        publishedAt: true,
        approvedAt: true,
        approvedByName: true,
        approvedByEmail: true,
        approvedSnapshotAt: true,
        createdByEmail: true,
        exploracionId: true,
        // La empresa del CASO manda sobre la del cliente: es la que se eligió al crearlo.
        hubspotCompanyId: true,
        client: { select: { name: true, kind: true, hubspotCompanyId: true } },
        access: { select: { revokedAt: true, expiresAt: true, lastUsedAt: true } },
      },
    }),
    prisma.hubspotAccount.findFirst({ where: { isSystem: true }, select: { hubspotPortalId: true } }),
    prisma.teamMember.findMany({ select: { email: true, name: true } }),
  ]);

  // La última versión generada de cada una (la 0 es la plantilla: no cuenta).
  const versiones = await prisma.projectCanvas.groupBy({
    by: ["businessCaseId"],
    where: { businessCaseId: { in: cases.map((c) => c.id) }, version: { gt: 0 } },
    _max: { version: true },
  });
  const ultimaVersion = new Map(versiones.map((v) => [v.businessCaseId, v._max.version]));
  const nombreDe = new Map(equipo.map((m) => [m.email.toLowerCase(), m.name]));

  const ahora = new Date();
  const conOrden: { fila: FilaDeLaLista; orden: number }[] = cases.map((c) => {
    const hechos = {
      publishedAt: c.publishedAt,
      approvedAt: c.approvedAt,
      approvedByName: c.approvedByName,
      approvedByEmail: c.approvedByEmail,
      approvedSnapshotAt: c.approvedSnapshotAt,
      acceso: c.access,
    };
    const e = estadoDeLaPropuesta(hechos, ahora);
    const autor = c.createdByEmail?.toLowerCase() ?? null;
    const version = ultimaVersion.get(c.id);
    const fila: FilaDeLaLista = {
      id: c.id,
      nombre: c.name,
      empresa: c.client.name,
      prospecto: c.client.kind === "PROSPECTO",
      version: version ? `Propuesta ${version}` : null,
      tipo: resolveBcType(c.caseType).shortLabel,
      estado: { clave: e.clave, etiqueta: e.etiqueta, nota: e.nota, notaAtencion: e.notaAtencion },
      cliente: { texto: e.cliente, atencion: e.clienteAtencion },
      arma: autor ? (nombreDe.get(autor) ?? autor) : null,
      esMia: autor === yo,
      hubspotUrl: hubspotCompanyUrl(systemAccount?.hubspotPortalId, c.hubspotCompanyId ?? c.client.hubspotCompanyId),
      usaPreventa: !!c.exploracionId,
    };
    return { fila, orden: ultimoHecho(c.updatedAt, hechos) };
  });
  const filas = conOrden.sort((a, b) => b.orden - a.orden).map((x) => x.fila);

  return (
    <div className={SHELL_DEFAULT}>
      <PageHeader
        title="Propuestas"
        description="Lo que se le cotiza a cada prospecto y si ya la abrió o la aprobó."
        action={
          <Link
            href="/business-cases/new"
            className="inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover"
          >
            Nueva propuesta
          </Link>
        }
      />
      <ListaDePropuestas filas={filas} hayMias={filas.some((f) => f.esMia)} />
    </div>
  );
}
