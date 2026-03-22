import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";

export default async function OldStagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; stageNum: string }>;
  searchParams: Promise<{ step?: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id, stageNum } = await params;
  const { step } = await searchParams;

  // Verificar que el cliente existe
  const client = await prisma.client.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!client) notFound();

  // Buscar el primer proyecto activo del cliente
  const project = await prisma.project.findFirst({
    where: { clientId: id, status: "active" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  if (project) {
    const stepParam = step ? `?step=${step}` : "";
    redirect(`/clients/${id}/projects/${project.id}/stage/${stageNum}${stepParam}`);
  }

  // Si no hay proyectos activos, redirigir a la lista de proyectos
  redirect(`/clients/${id}`);
}
