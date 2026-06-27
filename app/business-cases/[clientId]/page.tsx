/**
 * /business-cases/[clientId] — business cases de un cliente (master-detail).
 * Gateado por rol VENTAS/CSL/SUPER_ADMIN.
 */
import { redirect, notFound } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { requireInternalUser } from "@/lib/auth/supabase";
import { prisma } from "@/lib/db/prisma";
import BusinessCaseClientView from "@/components/business-cases/BusinessCaseClientView";

export const dynamic = "force-dynamic";

const SALES_ROLES = ["VENTAS", "CSL", "SUPER_ADMIN"];

export default async function BusinessCasesClientPage({
  params,
}: {
  params: Promise<{ clientId: string }>;
}) {
  const { clientId } = await params;
  const ctx = await requireInternalUser().catch(() => null);
  if (!ctx || !SALES_ROLES.includes(ctx.role)) redirect("/clients");

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: { id: true, name: true, hubspotAccount: { select: { id: true } } },
  });
  if (!client) notFound();

  return (
    <AppShell>
      <BusinessCaseClientView
        clientId={client.id}
        clientName={client.name}
        hasHubspot={!!client.hubspotAccount}
      />
    </AppShell>
  );
}
