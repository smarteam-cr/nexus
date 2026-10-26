import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAccessToClient } from "@/lib/auth/access";
import { BackLink } from "@/components/ui";
import DocumentoDeLaEmpresaWorkspace from "@/components/clients/DocumentoDeLaEmpresaWorkspace";

export const dynamic = "force-dynamic";

// UN DOCUMENTO DE LA EMPRESA (R3 etapas 2 y 3, 2026-10-27): el editor del diagnóstico de una empresa sin proyecto. Solo
// abre un documento de ESTA empresa (sin proyecto ni propuesta); los de un proyecto se abren desde su proyecto.
export default async function DocumentoDeLaEmpresaPage({ params }: { params: Promise<{ id: string; canvasId: string }> }) {
  const { id, canvasId } = await params;
  await requireAccessToClient(id).catch(() => notFound());
  const [cliente, doc] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { name: true } }),
    prisma.projectCanvas.findFirst({ where: { id: canvasId, clientId: id, projectId: null, businessCaseId: null }, select: { id: true, slug: true } }),
  ]);
  // Hoy solo el diagnóstico tiene editor de empresa.
  if (!cliente || !doc || doc.slug !== "diagnosis") notFound();
  return (
    <div className="flex flex-col">
      <div className="px-6 pt-4">
        <BackLink href={`/clients/${id}/documentos`}>Documentos de la empresa</BackLink>
      </div>
      <DocumentoDeLaEmpresaWorkspace clientId={id} canvasId={doc.id} clientName={cliente.name} />
    </div>
  );
}
