import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import AgentFormClient from "./AgentFormClient";

export const dynamic = "force-dynamic";

export default async function AgentFormPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id } = await params;
  const isNew = id === "new";

  let initialData = null;
  if (!isNew) {
    initialData = await prisma.agent.findUnique({ where: { id } });
    if (!initialData) redirect("/agents");
  }

  return (
    <AppShell>
      <AgentFormClient agentId={id} initialData={initialData} />
    </AppShell>
  );
}
