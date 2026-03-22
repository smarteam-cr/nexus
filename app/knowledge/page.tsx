import { requireConsultantSession } from "@/lib/auth";
import { prisma } from "@/lib/db/prisma";
import { redirect } from "next/navigation";
import AppShell from "@/components/layout/AppShell";
import KnowledgeClient from "./KnowledgeClient";

export const dynamic = "force-dynamic";

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
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold text-white">Base de conocimiento</h1>
            <p className="mt-1 text-sm text-gray-400">
              Metodologías, procesos y specs que los agentes AI consultan para generar recomendaciones contextualizadas.
            </p>
          </div>
        </div>
        <KnowledgeClient initialDocs={docs} initialTags={tags} />
      </div>
    </AppShell>
  );
}
