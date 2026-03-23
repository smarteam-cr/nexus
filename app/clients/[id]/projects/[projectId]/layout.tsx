import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export default async function ProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string; projectId: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id, projectId } = await params;

  const project = await prisma.project.findUnique({
    where: { id: projectId, clientId: id },
    select: { id: true },
  });
  if (!project) notFound();

  return <div className="flex-1 flex flex-col">{children}</div>;
}
