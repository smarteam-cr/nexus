import { requireConsultantSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import ProjectCanvasPanel from "@/components/clients/ProjectCanvasPanel";

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

  return (
    <div className="flex-1 flex flex-col relative" style={{ height: "calc(100vh - 57px)" }}>
      {/* Canvas de servicio siempre como fondo */}
      <div className="flex-1 overflow-y-auto">
        <ProjectCanvasPanel projectId={projectId} />
      </div>
      {/* Children: en /projects/[id] es vacío, en /stage/[num] es el overlay de la subetapa */}
      {children}
    </div>
  );
}
