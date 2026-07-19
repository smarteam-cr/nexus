import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { parseRunError } from "@/lib/agents/run-error";

/**
 * Historial de corridas de UN agente — EL feedback loop de calibración que no
 * existía: editar el prompt sin ver cómo corrió es calibrar a ciegas. Server
 * component; misma fuente que el centro de corridas (AgentRun), filtrada por
 * agentId. El link lleva al workspace del cliente donde vive el resultado.
 */

const STATUS_META: Record<string, { label: string; cls: string }> = {
  DONE: { label: "OK", cls: "text-emerald-400 bg-emerald-500/10 border-emerald-500/25" },
  ERROR: {
    label: "Falló",
    cls: "text-red-400 bg-destructive-muted border-red-500/25",
  },
  RUNNING: { label: "Corriendo", cls: "text-brand-light bg-brand/10 border-brand/25" },
  PENDING: { label: "En cola", cls: "text-fg-muted bg-surface-hover border-line" },
  ARCHIVED: { label: "Archivada", cls: "text-fg-muted bg-surface-hover border-line" },
};

function duracion(createdAt: Date, updatedAt: Date): string {
  const s = Math.round((updatedAt.getTime() - createdAt.getTime()) / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.round(s / 60)} min`;
}

export default async function RunsHistory({ agentId }: { agentId: string }) {
  const runs = await prisma.agentRun.findMany({
    where: { agentId },
    orderBy: { createdAt: "desc" },
    take: 15,
    select: {
      id: true,
      status: true,
      createdAt: true,
      updatedAt: true,
      clientId: true,
      output: true,
      client: { select: { name: true } },
    },
  });

  if (runs.length === 0) return null;

  return (
    <section className="mt-8 border-t border-line pt-6">
      <h2 className="text-sm font-semibold text-fg mb-1">Últimas corridas</h2>
      <p className="text-xs text-fg-muted mb-4">
        Cómo corrió este agente en la práctica — el insumo para calibrar el prompt.
      </p>
      <ul className="space-y-1.5">
        {runs.map((r) => {
          const meta = STATUS_META[r.status] ?? STATUS_META.PENDING;
          const inner = (
            <div className="flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2 hover:bg-surface-hover transition-colors">
              <span className={`flex-shrink-0 text-[10px] font-bold uppercase tracking-wider rounded-full border px-2 py-0.5 ${meta.cls}`}>
                {meta.label}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs text-fg truncate">
                  {r.client?.name ?? "Sin cliente"}
                  <span className="text-fg-muted">
                    {" · "}
                    {r.createdAt.toLocaleString("es-CR", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                    {" · "}
                    {duracion(r.createdAt, r.updatedAt)}
                  </span>
                </p>
                {r.status === "ERROR" && (
                  <p className="text-[11px] text-red-400 truncate">
                    {parseRunError(r.output)}
                  </p>
                )}
              </div>
            </div>
          );
          return (
            <li key={r.id}>
              {r.clientId ? (
                <Link href={`/clients/${r.clientId}`} className="block">
                  {inner}
                </Link>
              ) : (
                inner
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
