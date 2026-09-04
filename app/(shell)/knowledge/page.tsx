import { requireConsultantSession } from "@/lib/auth";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/ui";
import KnowledgeClient from "./KnowledgeClient";

// Página DINÁMICA (cada page llama a un `require…User` y el layout lee la cookie del tema): un
// `export const revalidate` acá nunca cacheó nada — se retiró en C-15 (2026-09-04).

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
    <div className="flex-1 overflow-y-auto">
      <div className={SHELL_DEFAULT}>
        <PageHeader
          title="Base de conocimiento"
          description="Metodologías, procesos y specs que los agentes AI consultan para generar recomendaciones contextualizadas."
        />
        <KnowledgeClient initialDocs={docs} initialTags={tags} />
      </div>
    </div>
  );
}
