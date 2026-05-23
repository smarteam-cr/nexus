import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import { PageHeader } from "@/components/ui";
import KnowledgeClient from "./KnowledgeClient";

// Listado de conocimientos — ISR 2 min. Upload/delete deben llamar
// revalidatePath("/knowledge").
export const revalidate = 120;

export default async function KnowledgePage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const [docs, tags] = await Promise.all([
    prisma.knowledgeDocument.findMany({
      include: { tags: true },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.knowledgeTag.findMany({
      orderBy: [{ category: "asc" }, { label: "asc" }],
    }),
  ]);

  return (
    <AppShell>
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8">
          <PageHeader
            title="Base de conocimiento"
            description="Metodologías, procesos y specs que los agentes AI consultan para generar recomendaciones contextualizadas."
          />
          <KnowledgeClient initialDocs={docs} initialTags={tags} />
        </div>
      </div>
    </AppShell>
  );
}
