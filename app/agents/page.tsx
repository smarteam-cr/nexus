import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import AgentsClient from "./AgentsClient";

export const dynamic = "force-dynamic";

export default async function AgentsPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const agents = await prisma.agent.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      status: true,
      scope: true,
      agentType: true,
      outputType: true,
      associatedStages: true,
      createdAt: true,
      _count: { select: { runs: true } },
    },
  });

  return (
    <AppShell>
      <AgentsClient agents={agents} />
    </AppShell>
  );
}
