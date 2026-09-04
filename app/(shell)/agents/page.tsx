import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AgentsClient from "./AgentsClient";

// Página DINÁMICA (cada page llama a un `require…User` y el layout lee la cookie del tema): un
// `export const revalidate` acá nunca cacheó nada — se retiró en C-15 (2026-09-04).

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
      agentGroup: true,
      outputType: true,
      associatedStages: true,
      createdAt: true,
      _count: { select: { runs: true } },
    },
  });

  return (
    <AgentsClient agents={agents} />
  );
}
