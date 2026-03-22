import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import ExecutionView from "@/components/implementation/ExecutionView";

export default async function ExecutePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/");

  const { id } = await params;

  const implementation = await prisma.implementation.findFirst({
    where: { id, accountId: session.id },
    include: {
      executions: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!implementation) notFound();

  if (!implementation.plan) {
    redirect(`/implementation/${id}/plan`);
  }

  return (
    <ExecutionView
      implementationId={id}
      plan={implementation.plan as {
        summary: string;
        businessContext: string;
        apiTasks: Array<{
          id: string;
          action: string;
          resource: string;
          description: string;
          params: Record<string, unknown>;
        }>;
        manualTasks: Array<{
          id: string;
          title: string;
          description: string;
          steps: string[];
          helpUrl?: string;
        }>;
      }}
      existingLogs={implementation.executions.map((e) => ({
        id: e.id,
        action: e.action,
        resource: e.resource,
        status: e.status,
        details: e.details as Record<string, unknown>,
        createdAt: e.createdAt.toISOString(),
      }))}
      status={implementation.status}
    />
  );
}
