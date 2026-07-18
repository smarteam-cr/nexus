/**
 * /business-cases/[id] — workspace de un business case (por businessCaseId).
 * F2: shell mínimo (header). El panel de sesiones de contexto, la generación y el
 * editor de canvas se construyen en F3–F5. Gateado por el área de Ventas (VENTAS/DEV/CSL/SUPER_ADMIN).
 */
import { redirect, notFound } from "next/navigation";
import Link from "next/link";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import BusinessCaseWorkspace from "@/components/business-cases/BusinessCaseWorkspace";
import { can } from "@/lib/auth/permissions/engine";
import { resolveCaseTypeFor } from "@/lib/business-cases/resolve-template";
import { getBrandLogos, brandLogoMap } from "@/lib/external/smarteam-logo";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Borrador",
  PUBLISHED: "Publicado",
  ARCHIVED: "Archivado",
};

export default async function BusinessCasePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !(await can(ctx.teamMember, "ventas", "read"))) redirect("/clients");

  const bc = await prisma.businessCase.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      status: true,
      publishedAt: true,
      hubspotDealId: true,
      caseType: true,
      caseSubtype: true,
      language: true,
      client: { select: { id: true, name: true, isProspect: true, logoUrl: true } },
    },
  });
  if (!bc) notFound();

  // Logos de marca (config global de Nexus: Smarteam + HubSpot + Insider One) —
  // el hero los pinta en la brand-row.
  const brandLogos = await getBrandLogos();

  // Tipo/template (columna → __meta del v0 → default hubspot). El v0 siempre existe
  // para BCs nuevos; para legacy sin __meta la resolución cae al default.
  const v0 = await prisma.projectCanvas.findFirst({
    where: { businessCaseId: id, version: 0 },
    select: { sections: true },
  });
  const resolved = resolveCaseTypeFor(bc, v0?.sections);

  return (
    <div className="px-6 py-8">
      <Link href="/business-cases" className="text-xs text-fg-muted hover:text-fg">
        ← Ventas
      </Link>
      <div className="mt-2 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold text-fg truncate">{bc.name}</h1>
        <span className="flex-shrink-0 flex items-center gap-1.5">
          <span className="text-[11px] px-2 py-1 rounded border border-line text-fg-muted">
            {resolved.typeDef.shortLabel}
            {resolved.caseSubtype
              ? ` · ${resolved.typeDef.subtypes?.find((s) => s.id === resolved.caseSubtype)?.label ?? resolved.caseSubtype}`
              : ""}
          </span>
          <span className="text-xs px-2 py-1 rounded bg-surface-muted text-fg-muted">
            {STATUS_LABEL[bc.status] ?? bc.status}
          </span>
        </span>
      </div>
      <p className="mt-1 text-sm text-fg-muted">
        {bc.client.name}
        {bc.client.isProspect ? " (prospecto)" : ""}
        {bc.hubspotDealId ? " · deal vinculado" : ""}
      </p>

      <div className="mt-8">
        <BusinessCaseWorkspace
          bcId={bc.id}
          clientId={bc.client.id}
          clientName={bc.client.name}
          clientLogoUrl={bc.client.logoUrl}
          smarteamLogoUrl={brandLogos.smarteam}
          brandLogos={brandLogoMap(brandLogos)}
          status={bc.status}
          publishedAt={bc.publishedAt ? bc.publishedAt.toISOString() : null}
          templateId={resolved.templateId}
          language={bc.language}
        />
      </div>
    </div>
  );
}
