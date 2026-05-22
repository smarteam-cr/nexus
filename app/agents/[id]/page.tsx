import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import AppShell from "@/components/layout/AppShell";
import AgentFormClient from "./AgentFormClient";

// Detalle de agente — ISR 30s. PATCH/DELETE deben llamar
// revalidatePath(`/agents/${id}`) para reflejar cambios inmediatos.
export const revalidate = 30;

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
      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
      <AgentFormClient agentId={id} initialData={initialData as any} />
    </AppShell>
  );
}
