import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { proyectoNavegableWhere } from "@/lib/projects/scope";

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

  /* El primer proyecto NAVEGABLE del cliente — el mismo criterio que el rail, porque a eso
     se está redirigiendo. Antes era `{ clientId, status: "active" }` a secas, así que si el
     proyecto activo más viejo del cliente resultaba ser el centinela de "Información del
     cliente", esta URL vieja redirigía a la página de etapa de un proyecto que no existe
     como tal. */
  const project = await prisma.project.findFirst({
    where: proyectoNavegableWhere({ clientId: id }),
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
