import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import WorkspaceClient from "./WorkspaceClient";

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
    select: {
      id: true,
      name: true,
      status: true,
      projectType: true,
      serviceType: true,
      tags: true,
    },
  });

  return <WorkspaceClient clientId={id} projects={projects} />;
}
