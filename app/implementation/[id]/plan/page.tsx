import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import PlanningChat from "@/components/chat/PlanningChat";

export default async function PlanPage({
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
      messages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!implementation) notFound();

  const initialMessages = implementation.messages.map((m) => ({
    id: m.id,
    role: m.role as "user" | "assistant",
    content: m.content,
  }));

  return (
    <PlanningChat
      implementationId={id}
      initialMessages={initialMessages}
      hasPlan={!!implementation.plan}
      status={implementation.status}
    />
  );
}
