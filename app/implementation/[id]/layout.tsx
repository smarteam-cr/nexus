import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { notFound } from "next/navigation";
import Link from "next/link";
import AppShell from "@/components/layout/AppShell";
import DeleteImplementationButton from "./DeleteImplementationButton";

export default async function ImplementationLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const { id } = await params;

  const implementation = await prisma.implementation.findUnique({
    where: { id },
  });

  if (!implementation) notFound();

  const isReady = ["READY", "EXECUTING", "DONE"].includes(implementation.status);

  return (
    <AppShell>
      <div className="flex-1 flex flex-col min-h-screen">
        {/* Top bar with tabs */}
        <header className="flex-shrink-0 border-b border-gray-800 px-4 py-3 flex items-center justify-between gap-4">
          {/* Left: back + name */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/dashboard"
              className="flex items-center gap-1 text-gray-500 hover:text-gray-300 text-xs transition-colors flex-shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              Atrás
            </Link>
            <div className="w-px h-4 bg-gray-700 flex-shrink-0" />
            <div className="w-2 h-2 rounded-full bg-brand flex-shrink-0" />
            <span className="text-sm font-medium text-white truncate">{implementation.name}</span>
          </div>

          {/* Right: tabs + delete */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {/* Mode tabs */}
            <nav className="flex gap-1 p-1 rounded-lg bg-gray-900 border border-gray-800">
              <Link
                href={`/implementation/${id}/plan`}
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-colors text-gray-400 hover:text-white hover:bg-gray-800"
              >
                🧠 Planificación
              </Link>
              <Link
                href={isReady ? `/implementation/${id}/execute` : "#"}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isReady
                    ? "text-gray-400 hover:text-white hover:bg-gray-800"
                    : "text-gray-700 cursor-not-allowed"
                }`}
                title={!isReady ? "Genera un plan primero" : undefined}
              >
                ⚡ Ejecución
              </Link>
            </nav>
            <DeleteImplementationButton implementationId={id} />
          </div>
        </header>

        <div className="flex-1">{children}</div>
      </div>
    </AppShell>
  );
}
