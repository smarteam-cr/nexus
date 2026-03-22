import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import ProjectsClient from "./ProjectsClient";

export default async function ClientPage({
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

  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!client) notFound();

  const projects = await prisma.project.findMany({
    where: { clientId: id },
    orderBy: { createdAt: "asc" },
    include: {
      _count: {
        select: { stageNotes: true, contextCards: true, documents: true },
      },
    },
  });

  // Si solo hay un proyecto, ir directo a él
  if (projects.length === 1) {
    redirect(`/clients/${id}/projects/${projects[0].id}/stage/1`);
  }

  return <ProjectsClient clientId={id} initialProjects={projects} />;
}
