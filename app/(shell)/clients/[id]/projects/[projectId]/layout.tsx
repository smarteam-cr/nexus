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

  // Los tags NO son decorativos acá: el desplegable los usa para avisar qué piezas le
  // corresponden a este proyecto (pieceReadiness). Sin ellos, `tags ?? []` hace que
  // Desarrollo muestre "Sin tag Integración / Desarrollo a medida" en TODOS los
  // proyectos, incluidos los que sí lo tienen — un aviso que contradice al handoff.
  const project = await prisma.project.findUnique({
    where: { id: projectId, clientId: id },
    select: { id: true, tags: true },
  });
  if (!project) notFound();

  return (
    <div className="flex-1 flex flex-col relative" style={{ height: "calc(100vh - 57px)" }}>
      {/* Canvas de servicio siempre como fondo */}
      <div className="flex-1 overflow-y-auto">
        <ProjectCanvasPanel projectId={projectId} tags={project.tags} />
      </div>
      {/* Children: en /projects/[id] es vacío, en /stage/[num] es el overlay de la subetapa */}
      {children}
    </div>
  );
}
