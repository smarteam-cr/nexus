import { notFound } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import dynamic from "next/dynamic";

const FlowchartViewer = dynamic(
  () => import("@/components/flowchart/FlowchartViewer"),
  { ssr: false, loading: () => <div className="h-64 bg-gray-50 rounded-xl animate-pulse" /> }
);

const SECTION_LABELS: Record<string, string> = {
  objetivo_alcance: "Objetivo y alcance",
  hipotesis_recomendaciones: "Hipótesis y recomendaciones",
  procesos: "Procesos",
  plan_implementacion: "Plan de implementación",
  documentos: "Documentos",
};

const SECTION_ORDER = ["objetivo_alcance", "hipotesis_recomendaciones", "procesos", "plan_implementacion", "documentos"];

const HUB_COLORS: Record<string, string> = {
  "Marketing Hub": "bg-orange-50 text-orange-700 border-orange-200",
  "Sales Hub":     "bg-blue-50 text-blue-700 border-blue-200",
  "Service Hub":   "bg-green-50 text-green-700 border-green-200",
};

export default async function SharedProjectPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const project = await prisma.project.findUnique({
    where: { shareToken: token },
    select: {
      id: true,
      name: true,
      tags: true,
      client: { select: { name: true, company: true } },
    },
  });

  if (!project) notFound();

  // Get published cards
  const cards = await prisma.clientContextCard.findMany({
    where: {
      projectId: project.id,
      publishedToClient: true,
      canvasSection: { not: null },
    },
    orderBy: [{ canvasOrder: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      title: true,
      content: true,
      publishedContent: true,
      cardType: true,
      canvasSection: true,
      diagramData: true,
    },
  });

  // Group by section
  const grouped = new Map<string, typeof cards>();
  cards.forEach((c) => {
    const s = c.canvasSection!;
    if (!grouped.has(s)) grouped.set(s, []);
    grouped.get(s)!.push(c);
  });

  const sections = SECTION_ORDER
    .filter((key) => grouped.has(key))
    .map((key) => ({ key, label: SECTION_LABELS[key] ?? key, cards: grouped.get(key)! }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-8 h-8 rounded-lg bg-brand/10 flex items-center justify-center">
              <svg className="w-4 h-4 text-brand" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">{project.name}</h1>
              <p className="text-sm text-gray-500">{project.client.name}</p>
            </div>
            {project.tags?.map((tag: string) => (
              <span
                key={tag}
                className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border ${HUB_COLORS[tag] ?? "bg-gray-50 text-gray-600 border-gray-200"}`}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {sections.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-gray-400">No hay contenido publicado todavía.</p>
          </div>
        ) : (
          sections.map(({ key, label, cards: sectionCards }) => (
            <section key={key}>
              <h2 className="text-sm font-bold text-gray-800 uppercase tracking-wider mb-4 pb-2 border-b border-gray-200">
                {label}
              </h2>
              <div className="space-y-4">
                {sectionCards.map((card) => (
                  <SharedCard key={card.id} card={card} />
                ))}
              </div>
            </section>
          ))
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-200 bg-white mt-16">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            Powered by <span className="font-semibold text-gray-600">Nexus</span> · Dinterweb
          </p>
          <p className="text-xs text-gray-300">
            Actualizado: {new Date().toLocaleDateString("es-ES", { day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>
      </footer>
    </div>
  );
}

// ── Shared card component ────────────────────────────────────────────────────

function SharedCard({
  card,
}: {
  card: {
    id: string;
    title: string;
    content: string;
    publishedContent: string | null;
    cardType: string;
    diagramData: unknown;
  };
}) {
  const displayContent = card.publishedContent || card.content;

  if (card.cardType === "FLOWCHART" && card.diagramData) {
    const diagram = card.diagramData as { nodes?: unknown[]; edges?: unknown[] };
    if (diagram.nodes && diagram.edges) {
      return (
        <div className="rounded-xl border border-gray-200 bg-white overflow-hidden shadow-sm">
          <div className="px-5 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-800">{card.title}</h3>
            {displayContent && (
              <p className="text-xs text-gray-500 mt-0.5">{displayContent}</p>
            )}
          </div>
          <div className="h-[500px]">
            <FlowchartViewer
              data={{
                title: card.title,
                description: displayContent,
                nodes: diagram.nodes as Array<{ id: string; type: string; label: string; sublabel?: string; owner?: string; detail?: string; icon?: string; pipelineName?: string; position?: { x: number; y: number } }>,
                edges: diagram.edges as Array<{ id?: string; source: string; target: string; label?: string; edgeType?: "yes" | "no" | "default"; sourceHandle?: string; targetHandle?: string; strokeColor?: string; dashed?: boolean }>,
              }}
            />
          </div>
        </div>
      );
    }
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-gray-800 mb-2">{card.title}</h3>
      <div className="text-sm text-gray-600 whitespace-pre-wrap leading-relaxed">
        {displayContent || <span className="text-gray-300 italic">Sin contenido</span>}
      </div>
    </div>
  );
}
