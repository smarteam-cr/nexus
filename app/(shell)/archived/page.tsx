import { requireConsultantSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import UnarchiveButton from "./UnarchiveButton";

export default async function ArchivedPage() {
  try {
    await requireConsultantSession();
  } catch {
    redirect("/");
  }

  const archived = await prisma.implementation.findMany({
    where: { archived: true },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, status: true, createdAt: true, updatedAt: true },
  });

  const STATUS_LABEL: Record<string, string> = {
    PLANNING: "Planificando",
    READY: "Listo",
    EXECUTING: "Ejecutando",
    DONE: "Completado",
    PAUSED: "Pausado",
  };

  return (
    <div className="flex-1 p-8 max-w-3xl mx-auto w-full">
      <div className="mb-8">
        <h1 className="text-xl font-semibold text-white">Proyectos archivados</h1>
        <p className="text-gray-500 text-sm mt-1">
          {archived.length === 0
            ? "No tienes proyectos archivados."
            : `${archived.length} proyecto${archived.length !== 1 ? "s" : ""} archivado${archived.length !== 1 ? "s" : ""}`}
        </p>
      </div>

      {archived.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-2xl bg-gray-800 flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-gray-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
            </svg>
          </div>
          <p className="text-gray-500 text-sm">Sin proyectos archivados</p>
        </div>
      ) : (
        <div className="space-y-3">
          {archived.map((impl) => (
            <div
              key={impl.id}
              className="flex items-center justify-between gap-4 px-5 py-4 rounded-xl bg-gray-900 border border-gray-800 hover:border-gray-700 transition-colors"
            >
              <div className="min-w-0">
                <p className="text-white text-sm font-medium truncate">{impl.name}</p>
                <p className="text-gray-600 text-xs mt-0.5">
                  {STATUS_LABEL[impl.status] ?? impl.status} ·{" "}
                  {new Date(impl.updatedAt).toLocaleDateString("es", {
                    day: "numeric",
                    month: "short",
                    year: "numeric",
                  })}
                </p>
              </div>
              <UnarchiveButton id={impl.id} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
