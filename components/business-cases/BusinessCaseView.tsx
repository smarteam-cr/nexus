"use client";

/**
 * BusinessCaseView — vista de UN business case: transcripts (pegar/subir),
 * generación por agente, canvas de bloques (editar/ocultar/confirmar/IA/eliminar)
 * y publicación (token + contraseña + link). El agente propone (DRAFT); el
 * vendedor confirma. Publicar exige ≥1 transcript y ≥1 bloque confirmado visible.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { useUndo, useUndoScope } from "@/components/ui/UndoProvider";

type BCBlock = {
  id: string;
  blockType: string;
  order: number;
  content: unknown;
  status: "DRAFT" | "CONFIRMED";
  source: string;
  isVisible: boolean;
  needsValidation: boolean;
};

type BCDetail = {
  id: string;
  name: string;
  status: string;
  publishedAt: string | null;
  blocks: BCBlock[];
  transcripts: { id: string; source: string; fileName: string | null; rawText: string; createdAt: string }[];
  access: {
    accessToken: string;
    accessPassword: string | null;
    revokedAt: string | null;
  } | null;
};

const BLOCK_LABEL: Record<string, string> = {
  HERO: "Hero",
  PAIN_POINTS: "Dolores",
  BEFORE_AFTER: "Antes / Después",
  SOLUTION: "Solución",
  ROI_METRICS: "Métricas / ROI",
  TIMELINE: "Cronograma",
  INVESTMENT: "Inversión",
  PARTNER: "Partner",
  CTA: "Llamado a la acción",
};

export default function BusinessCaseView({
  bcId,
  onChanged,
}: {
  bcId: string;
  onChanged?: () => void;
}) {
  const toast = useToast();
  const { clearScope } = useUndo();
  const undoScope = `bc:${bcId}`;
  useUndoScope(undoScope); // purga el historial al desmontar / cambiar de caso
  const [detail, setDetail] = useState<BCDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchJson<{ businessCase: BCDetail }>(`/api/business-cases/${bcId}`);
      setDetail(data.businessCase);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el caso.");
    } finally {
      setLoading(false);
    }
  }, [bcId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  const refresh = useCallback(() => {
    load();
    onChanged?.();
  }, [load, onChanged]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/generate`, { method: "POST" });
      toast.success("Bloques generados. Revisalos y confirmá los que sirvan.");
      clearScope(undoScope); // la generación reemplaza los bloques DRAFT: el historial previo ya no aplica
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "La generación falló.");
    } finally {
      setGenerating(false);
    }
  };

  const publish = async () => {
    if (publishing) return;
    setPublishing(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/publish`, { method: "POST" });
      toast.success("Publicado. Compartí el link y la contraseña con el prospecto.");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo publicar.");
    } finally {
      setPublishing(false);
    }
  };

  const revoke = async () => {
    try {
      await fetchJson(`/api/business-cases/${bcId}/revoke`, { method: "POST" });
      toast.info("Acceso revocado. La landing dejó de estar disponible.");
      refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo revocar.");
    }
  };

  if (loading) return <p className="p-6 text-sm text-fg-muted">Cargando…</p>;
  if (!detail) return <p className="p-6 text-sm text-fg-muted">No se encontró el caso.</p>;

  const isPublished = !!detail.publishedAt && !detail.access?.revokedAt;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-fg truncate">{detail.name}</h2>
          <p className="text-xs text-fg-muted mt-0.5">
            {isPublished ? "Publicado" : "Borrador"} · {detail.blocks.length} bloques
          </p>
        </div>
        <div className="flex flex-shrink-0 gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-hover disabled:opacity-50"
          >
            {generating ? "Generando…" : "Generar"}
          </button>
          {isPublished ? (
            <button
              onClick={revoke}
              className="rounded-lg border border-red-300 bg-surface px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Revocar
            </button>
          ) : (
            <button
              onClick={publish}
              disabled={publishing}
              className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
            >
              {publishing ? "Publicando…" : "Publicar"}
            </button>
          )}
        </div>
      </div>

      {/* Acceso publicado */}
      {isPublished && detail.access && (
        <AccessPanel token={detail.access.accessToken} password={detail.access.accessPassword} />
      )}

      {/* Transcripts */}
      <TranscriptPanel bcId={bcId} transcripts={detail.transcripts} onChanged={refresh} />

      {/* Bloques */}
      <section>
        <h3 className="text-sm font-semibold text-fg mb-3">Bloques</h3>
        {detail.blocks.length === 0 ? (
          <p className="text-sm text-fg-muted">
            Todavía no hay bloques. Agregá un transcript y tocá “Generar”.
          </p>
        ) : (
          <div className="space-y-3">
            {detail.blocks.map((b) => (
              <BlockEditor key={b.id} bcId={bcId} block={b} onChanged={refresh} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Panel de acceso ───────────────────────────────────────────────────────────
function AccessPanel({ token, password }: { token: string; password: string | null }) {
  const toast = useToast();
  const verifyUrl =
    typeof window !== "undefined"
      ? `${window.location.origin}/external/business-case/verify/${token}`
      : `/external/business-case/verify/${token}`;
  const copy = (text: string, label: string) => {
    navigator.clipboard?.writeText(text).then(
      () => toast.success(`${label} copiado.`),
      () => toast.error("No se pudo copiar."),
    );
  };
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
      <p className="text-xs font-semibold text-emerald-700">Acceso del prospecto</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-xs text-fg bg-surface rounded px-2 py-1 border border-line">
          {verifyUrl}
        </code>
        <button onClick={() => copy(verifyUrl, "Link")} className="text-xs text-brand hover:underline">
          Copiar link
        </button>
      </div>
      {password && (
        <div className="flex items-center gap-2">
          <code className="text-xs text-fg bg-surface rounded px-2 py-1 border border-line">
            {password}
          </code>
          <button onClick={() => copy(password, "Contraseña")} className="text-xs text-brand hover:underline">
            Copiar contraseña
          </button>
          <a href={verifyUrl} target="_blank" rel="noreferrer" className="text-xs text-fg-muted hover:text-fg ml-auto">
            Abrir preview ↗
          </a>
        </div>
      )}
    </div>
  );
}

// ── Panel de transcripts ──────────────────────────────────────────────────────
function TranscriptPanel({
  bcId,
  transcripts,
  onChanged,
}: {
  bcId: string;
  transcripts: BCDetail["transcripts"];
  onChanged: () => void;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPasted = async () => {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "PASTED", rawText: text.trim() }),
      });
      setText("");
      toast.success("Transcript agregado.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  };

  const addFile = async (file: File) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      await fetchJson(`/api/business-cases/${bcId}/transcript`, { method: "POST", body: fd });
      toast.success("Archivo subido.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <h3 className="text-sm font-semibold text-fg mb-2">Transcripts</h3>
      {transcripts.length > 0 && (
        <ul className="mb-3 space-y-1">
          {transcripts.map((t) => (
            <li key={t.id} className="text-xs text-fg-muted flex items-center gap-2">
              <span className="px-1.5 py-0.5 rounded bg-surface-muted text-2xs">
                {t.source === "UPLOADED" ? "Archivo" : "Pegado"}
              </span>
              <span className="truncate">
                {t.fileName ?? `${t.rawText.slice(0, 60)}${t.rawText.length > 60 ? "…" : ""}`}
              </span>
            </li>
          ))}
        </ul>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        placeholder="Pegá el transcript de la reunión comercial…"
        className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
      />
      <div className="mt-2 flex items-center gap-2">
        <button
          onClick={addPasted}
          disabled={!text.trim() || busy}
          className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
        >
          Agregar texto
        </button>
        <input
          ref={fileRef}
          type="file"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) addFile(f);
          }}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-hover disabled:opacity-50"
        >
          Subir archivo
        </button>
      </div>
    </section>
  );
}

// ── Editor de un bloque ─────────────────────────────────────────────────────
function BlockEditor({
  bcId,
  block,
  onChanged,
}: {
  bcId: string;
  block: BCBlock;
  onChanged: () => void;
}) {
  const toast = useToast();
  const { pushUndo } = useUndo();
  const undoScope = `bc:${bcId}`;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [aiOpen, setAiOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const put = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/blocks/${block.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  // PUT + registro de undo que re-PUTea el estado previo (sin volver a registrar undo).
  const putUndoable = async (
    body: Record<string, unknown>,
    label: string,
    prevBody: Record<string, unknown>,
    coalesceKey?: string,
  ) => {
    await put(body);
    pushUndo({
      scope: undoScope,
      label,
      coalesceKey,
      undo: async () => {
        try {
          await fetchJson(`/api/business-cases/${bcId}/blocks/${block.id}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(prevBody),
          });
          onChanged();
          return true;
        } catch {
          return false;
        }
      },
    });
  };

  const saveContent = async () => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(draft);
    } catch {
      toast.error("El JSON del contenido no es válido.");
      return;
    }
    await putUndoable(
      { content: parsed },
      "Bloque editado",
      { content: block.content as Record<string, unknown> },
      `${undoScope}|block|${block.id}`,
    );
    setEditing(false);
  };

  const aiEdit = async () => {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    try {
      const prevContent = block.content as Record<string, unknown>;
      await fetchJson(`/api/business-cases/${bcId}/blocks/${block.id}/ai-edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      setInstruction("");
      setAiOpen(false);
      toast.success("Bloque editado por IA.");
      onChanged();
      // Undo: restaura el contenido pre-IA (re-PUT directo).
      pushUndo({
        scope: undoScope,
        label: "Edición por IA",
        undo: async () => {
          try {
            await fetchJson(`/api/business-cases/${bcId}/blocks/${block.id}`, {
              method: "PUT",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ content: prevContent }),
            });
            onChanged();
            return true;
          } catch {
            return false;
          }
        },
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "La edición por IA falló.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      // Snapshot ANTES de borrar → habilita recrear el bloque al deshacer.
      const snap = {
        blockType: block.blockType,
        content: (block.content ?? {}) as Record<string, unknown>,
        isVisible: block.isVisible,
        status: block.status,
        needsValidation: block.needsValidation,
      };
      await fetchJson(`/api/business-cases/${bcId}/blocks/${block.id}`, { method: "DELETE" });
      onChanged();
      pushUndo({
        scope: undoScope,
        label: "Bloque eliminado",
        undo: async () => {
          try {
            await fetchJson(`/api/business-cases/${bcId}/blocks`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(snap),
            });
            onChanged();
            return true;
          } catch {
            return false;
          }
        },
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-xl border bg-surface p-4 ${
        block.isVisible ? "border-line" : "border-dashed border-line opacity-60"
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-fg">{BLOCK_LABEL[block.blockType] ?? block.blockType}</span>
          <span
            className={`text-2xs px-1.5 py-0.5 rounded ${
              block.status === "CONFIRMED"
                ? "bg-emerald-500/15 text-emerald-600"
                : "bg-surface-muted text-fg-muted"
            }`}
          >
            {block.status === "CONFIRMED" ? "Confirmado" : "Borrador"}
          </span>
          {!block.isVisible && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-surface-muted text-fg-muted">Oculto</span>
          )}
          {block.needsValidation && (
            <span className="text-2xs px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-600">
              Validar datos
            </span>
          )}
        </div>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={8}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-xs font-mono text-fg focus:outline-none focus:border-brand"
        />
      ) : (
        <pre className="text-xs text-fg-muted bg-surface-muted rounded-lg p-3 overflow-x-auto whitespace-pre-wrap max-h-40">
          {safeStringify(block.content)}
        </pre>
      )}

      {aiOpen && (
        <div className="mt-2 flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ej. Hacé los dolores más concretos y orientados a ventas"
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
          />
          <button
            onClick={aiEdit}
            disabled={!instruction.trim() || busy}
            className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            Aplicar
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {block.status === "CONFIRMED" ? (
          <button onClick={() => putUndoable({ status: "DRAFT" }, "Bloque reabierto", { status: "CONFIRMED" })} disabled={busy} className="text-fg-muted hover:text-fg">
            Reabrir
          </button>
        ) : (
          <button onClick={() => putUndoable({ status: "CONFIRMED" }, "Bloque confirmado", { status: "DRAFT" })} disabled={busy} className="text-emerald-600 hover:underline font-medium">
            Confirmar
          </button>
        )}
        <button onClick={() => putUndoable({ isVisible: !block.isVisible }, block.isVisible ? "Bloque oculto" : "Bloque visible", { isVisible: block.isVisible })} disabled={busy} className="text-fg-muted hover:text-fg">
          {block.isVisible ? "Ocultar" : "Mostrar"}
        </button>
        <button
          onClick={() => {
            setAiOpen((o) => !o);
          }}
          className="text-fg-muted hover:text-fg"
        >
          IA
        </button>
        {editing ? (
          <>
            <button onClick={saveContent} disabled={busy} className="text-brand hover:underline font-medium">
              Guardar
            </button>
            <button onClick={() => setEditing(false)} className="text-fg-muted hover:text-fg">
              Cancelar
            </button>
          </>
        ) : (
          <button
            onClick={() => {
              setDraft(safeStringify(block.content));
              setEditing(true);
            }}
            className="text-fg-muted hover:text-fg"
          >
            Editar
          </button>
        )}
        <button onClick={remove} disabled={busy} className="text-red-500 hover:underline ml-auto">
          Eliminar
        </button>
      </div>
    </div>
  );
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}
