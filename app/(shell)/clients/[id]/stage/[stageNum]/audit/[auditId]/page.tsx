import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AuditDetailClient from "@/app/(shell)/audits/[id]/AuditDetailClient";
import type { LifecycleSnapshot, LifecycleStageCount, AuditInsight, OwnerAssignmentStats } from "@/lib/hubspot/portal-analyzer";

export default async function AuditDetailInWorkspacePage({
  params,
}: {
  params: Promise<{ id: string; stageNum: string; auditId: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id: clientId, stageNum, auditId } = await params;

  const audit = await prisma.audit.findUnique({
    where: { id: auditId },
  });

  if (!audit) notFound();

  const data = audit.data as unknown as LifecycleSnapshot | null;
  const lifecycleStats = data?.lifecycleStats;

  const contacts: LifecycleStageCount[] = lifecycleStats?.contacts ?? [];
  const companies: LifecycleStageCount[] = lifecycleStats?.companies ?? [];
  const totalContacts = lifecycleStats?.totalContacts ?? 0;
  const totalCompanies = lifecycleStats?.totalCompanies ?? 0;
  const totalDeals = lifecycleStats?.totalDeals ?? 0;
  const totalTickets = lifecycleStats?.totalTickets ?? 0;
  const lifecycleWorkflows = lifecycleStats?.lifecycleWorkflows ?? [];
  const ownerStats: OwnerAssignmentStats | undefined = data?.ownerStats ?? undefined;

  const insights: AuditInsight[] = data?.insights?.insights ?? [];
  const insightsGeneratedAt = data?.insights?.generatedAt
    ? new Date(data.insights.generatedAt).toLocaleDateString("es-ES", {
        day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
      })
    : null;

  const capturedAt = data?.capturedAt
    ? new Date(data.capturedAt).toLocaleDateString("es-ES", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  // Paso 2 (index 2) = Auditoría del CRM en etapa 1
  const backUrl = `/clients/${clientId}/stage/${stageNum}?step=2`;

  return (
    <AuditDetailClient
      auditId={audit.id}
      capturedAt={capturedAt}
      insightsGeneratedAt={insightsGeneratedAt}
      contacts={contacts}
      companies={companies}
      totalContacts={totalContacts}
      totalCompanies={totalCompanies}
      totalDeals={totalDeals}
      totalTickets={totalTickets}
      lifecycleWorkflows={lifecycleWorkflows}
      ownerStats={ownerStats}
      insights={insights}
      hasLifecycleStats={!!lifecycleStats}
    />
  );
}
