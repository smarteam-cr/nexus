"use client";

/** Ideas de SEM (campañas de pago: PPC / Google Search) — aprobar / descartar / borrar.
 * El modelo Prisma sigue siendo CampaignIdea; esto es relabel de UI ("campaña"
 * queda reservado para el concepto cross-área, ver ContentPillar.isCampaign). */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, ListSkeleton } from "@/components/ui";

type CampaignStatus = "PENDING" | "APPROVED" | "DISCARDED";

interface CampaignRow {
  id: string;
  title: string;
  channel: "GOOGLE_SEARCH" | "PAID_SOCIAL" | "DISPLAY" | "OTHER";
  description: string;
  status: CampaignStatus;
  createdAt: string;
}

const CHANNEL_LABEL: Record<CampaignRow["channel"], string> = {
  GOOGLE_SEARCH: "Google Search",
  PAID_SOCIAL: "Paid social",
  DISPLAY: "Display",
  OTHER: "Otro",
};

const TABS: Array<{ key: CampaignStatus; label: string }> = [
  { key: "PENDING", label: "Pendientes" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "DISCARDED", label: "Descartadas" },
];

export default function CampaignsClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<CampaignStatus>("PENDING");
  const [rows, setRows] = useState<CampaignRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ campaigns: CampaignRow[] }>(`/api/marketing/campaigns?status=${tab}`);
      setRows(d.campaigns);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las ideas de SEM.");
    } finally {
      setLoading(false);
    }
  }, [toast, tab]);
  useEffect(() => {
    load();
  }, [load]);

  const review = async (id: string, action: "approve" | "discard") => {
    if (busy) return;
    setBusy(true);
    try {
      await fetchJson(`/api/marketing/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      toast.success(action === "approve" ? "Idea de SEM aprobada." : "Idea de SEM descartada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo procesar.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await fetchJson(`/api/marketing/campaigns/${id}`, { method: "DELETE" });
      toast.info("Idea de SEM eliminada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 text-xs rounded-lg border transition-colors ${
              tab === t.key
                ? "border-brand text-brand bg-brand/5 font-medium"
                : "border-line text-fg-muted hover:text-fg-secondary"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        // Skeleton estructural: misma cáscara que las cards de ideas de SEM
        // (filas rounded-xl título + descripción) para que nada salte al cargar.
        <ListSkeleton rows={4} rowClassName="h-20" />
      ) : rows.length === 0 ? (
        <EmptyState
          variant="dashed"
          title={tab === "PENDING" ? "No hay ideas de SEM pendientes" : tab === "APPROVED" ? "No hay ideas de SEM aprobadas" : "No hay ideas de SEM descartadas"}
          description={tab === "PENDING" ? "Corré el motor desde Contenido para generar ideas de SEM." : undefined}
        />
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.id} className="rounded-xl border border-line bg-surface px-4 py-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-fg">
                    {r.title}
                    <Badge size="xs" className="ml-2">
                      {CHANNEL_LABEL[r.channel]}
                    </Badge>
                  </p>
                  <p className="mt-1 text-xs text-fg-secondary whitespace-pre-wrap">{r.description}</p>
                </div>
                {canEdit && (
                  <span className="flex-shrink-0 flex items-center gap-2">
                    {r.status === "PENDING" && (
                      <>
                        <button
                          onClick={() => review(r.id, "approve")}
                          disabled={busy}
                          className="px-3 py-1.5 text-xs rounded-lg bg-brand text-white hover:opacity-90 disabled:opacity-40"
                        >
                          Aprobar
                        </button>
                        <button
                          onClick={() => review(r.id, "discard")}
                          disabled={busy}
                          className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
                        >
                          Descartar
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setConfirmDeleteId(r.id)}
                      className="text-xs text-red-400 hover:text-red-300"
                    >
                      Borrar
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) await remove(id);
        }}
        title="¿Borrar esta idea de SEM?"
        description="Se borra definitivamente. Esta acción no se puede deshacer."
        confirmLabel="Borrar"
      />
    </div>
  );
}
