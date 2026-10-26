import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { requireAccessToClient } from "@/lib/auth/access";
import { DocumentosDeLaEmpresa } from "@/components/clients/DocumentosDeLaEmpresa";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

// Depende de quién mira y de lo compartido: no cacheable.
export const dynamic = "force-dynamic";

// LOS DOCUMENTOS DE LA EMPRESA (R3 etapas 2 y 3 del roadmap, 2026-10-27): los que son de la empresa y no de un proyecto
// (un diagnóstico para un prospecto). El layout de la ficha ya exige el acceso; acá se vuelve a pedir porque la página
// lee la base por su cuenta.
export default async function DocumentosDeLaEmpresaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireAccessToClient(id).catch(() => notFound());
  const [cliente, filas] = await Promise.all([
    prisma.client.findUnique({ where: { id }, select: { name: true } }),
    prisma.projectCanvas.findMany({
      where: { clientId: id, projectId: null, businessCaseId: null },
      orderBy: { updatedAt: "desc" },
      select: { id: true, name: true, slug: true, updatedAt: true, publishedSnapshotAt: true, accesoDeLaEmpresa: { select: { revokedAt: true } } },
    }),
  ]);
  if (!cliente) notFound();
  return (
    <DocumentosDeLaEmpresa
      clientId={id}
      empresa={cliente.name}
      contenedor={SHELL_DEFAULT}
      documentos={filas.map((f) => ({
        id: f.id,
        nombre: f.name,
        pieza: f.slug,
        actualizado: f.updatedAt.toISOString(),
        compartidoDesde: f.accesoDeLaEmpresa && !f.accesoDeLaEmpresa.revokedAt ? (f.publishedSnapshotAt?.toISOString() ?? null) : null,
      }))}
    />
  );
}
