"use client";

/**
 * BusinessCaseWorkspace — pantalla de un business case: transcripts de contexto,
 * "Generar" (crea una versión nueva del canvas y la llena con el agente), editor
 * del canvas (secciones + bloques markdown editables), selector de versiones y
 * publicación. El agente propone (DRAFT); el vendedor edita/confirma.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";

type Block = {
  id: string;
  blockType: string;
  content: string | null;
  status: "DRAFT" | "CONFIRMED";
  source: string;
  order: number;
};
type Section = { id: string; key: string; label: string; blocks: Block[] };
type CanvasResp = {
  canvas: { id: string; version: number; isActive: boolean } | null;
  versions: { version: number; isActive: boolean }[];
  sections: Section[];
};
type Transcript = { id: string; source: string; rawText: string; fileName: string | null };

export default function BusinessCaseWorkspace({
  bcId,
  status,
  publishedAt,
}: {
  bcId: string;
  status: string;
  publishedAt: string | null;
}) {
  const toast = useToast();
  const [data, setData] = useState<CanvasResp | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [access, setAccess] = useState<{ url: string; password: string | null } | null>(null);
  const [published, setPublished] = useState(!!publishedAt);

  const loadCanvas = useCallback(
    async (v?: number) => {
      try {
        const q = v != null ? `?version=${v}` : "";
        const d = await fetchJson<CanvasResp>(`/api/business-cases/${bcId}/canvas${q}`);
        setData(d);
        setVersion(d.canvas?.version ?? null);
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el canvas.");
      } finally {
        setLoading(false);
      }
    },
    [bcId, toast],
  );

  useEffect(() => {
    loadCanvas();
  }, [loadCanvas]);

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const r = await fetchJson<{ version: number }>(`/api/business-cases/${bcId}/generate`, { method: "POST" });
      toast.success(`Versión ${r.version} generada. Revisá y confirmá las secciones.`);
      await loadCanvas();
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
      const r = await fetchJson<{ url: string; password: string | null }>(`/api/business-cases/${bcId}/publish`, { method: "POST" });
      setAccess({ url: r.url, password: r.password });
      setPublished(true);
      toast.success("Publicado. Compartí el link y la contraseña.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo publicar.");
    } finally {
      setPublishing(false);
    }
  };

  const revoke = async () => {
    try {
      await fetchJson(`/api/business-cases/${bcId}/revoke`, { method: "POST" });
      setPublished(false);
      setAccess(null);
      toast.info("Acceso revocado.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo revocar.");
    }
  };

  const hasCanvas = !!data?.canvas;

  return (
    <div className="space-y-6">
      {/* Acciones */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          {data && data.versions.length > 0 && (
            <select
              value={version ?? ""}
              onChange={(e) => loadCanvas(Number(e.target.value))}
              className="rounded-lg border border-line bg-surface px-2 py-1.5 text-sm text-fg"
            >
              {data.versions.map((v) => (
                <option key={v.version} value={v.version}>
                  Versión {v.version}{v.isActive ? " (activa)" : ""}
                </option>
              ))}
            </select>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={generate}
            disabled={generating}
            className="rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
          >
            {generating ? "Generando…" : hasCanvas ? "Regenerar (nueva versión)" : "Generar business case"}
          </button>
          {published ? (
            <button onClick={revoke} className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
              Revocar
            </button>
          ) : (
            <button
              onClick={publish}
              disabled={publishing || !hasCanvas}
              className="rounded-lg border border-line bg-surface px-3 py-2 text-sm font-medium text-fg hover:bg-surface-hover disabled:opacity-50"
            >
              {publishing ? "Publicando…" : "Publicar"}
            </button>
          )}
        </div>
      </div>

      {access && <AccessPanel url={access.url} password={access.password} />}

      <TranscriptPanel bcId={bcId} />

      {/* Canvas */}
      {loading ? (
        <p className="text-sm text-fg-muted">Cargando…</p>
      ) : !hasCanvas ? (
        <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-fg-muted">
          Todavía no hay canvas. Agregá contexto (transcript o sesiones) y tocá "Generar business case".
        </div>
      ) : (
        <div className="space-y-6">
          {data!.sections.map((s) => (
            <SectionView key={s.id} bcId={bcId} section={s} onChanged={() => loadCanvas(version ?? undefined)} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Sección + sus bloques ─────────────────────────────────────────────────────
function SectionView({ bcId, section, onChanged }: { bcId: string; section: Section; onChanged: () => void }) {
  return (
    <section>
      <h3 className="text-xs font-semibold text-brand uppercase tracking-wider mb-2">{section.label}</h3>
      {section.blocks.length === 0 ? (
        <p className="text-xs text-fg-muted italic">Sin contenido en esta versión.</p>
      ) : (
        <div className="space-y-3">
          {section.blocks.map((b) => (
            <BlockCard key={b.id} bcId={bcId} block={b} onChanged={onChanged} />
          ))}
        </div>
      )}
    </section>
  );
}

// ── Un bloque (markdown) ──────────────────────────────────────────────────────
function BlockCard({ bcId, block, onChanged }: { bcId: string; block: Block; onChanged: () => void }) {
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(block.content ?? "");
  const [aiOpen, setAiOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const put = async (body: Record<string, unknown>) => {
    setBusy(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/canvas/blocks/${block.id}`, {
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

  const save = async () => {
    await put({ content: draft });
    setEditing(false);
  };

  const regenerate = async () => {
    if (!instruction.trim() || busy) return;
    setBusy(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/canvas/blocks/${block.id}/regenerate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction: instruction.trim() }),
      });
      setInstruction("");
      setAiOpen(false);
      toast.success("Bloque reescrito por IA.");
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "La edición por IA falló.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/canvas/blocks/${block.id}`, { method: "DELETE" });
      onChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-xl border bg-surface p-4 ${block.status === "CONFIRMED" ? "border-emerald-300" : "border-line"}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className={`text-2xs px-1.5 py-0.5 rounded ${block.status === "CONFIRMED" ? "bg-emerald-500/15 text-emerald-600" : "bg-surface-muted text-fg-muted"}`}>
          {block.status === "CONFIRMED" ? "Confirmado" : "Borrador"}
        </span>
      </div>

      {editing ? (
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={10}
          className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm font-mono text-fg focus:outline-none focus:border-brand"
        />
      ) : (
        <div className="prose prose-sm max-w-none text-fg [&_h2]:text-fg [&_h3]:text-fg [&_strong]:text-fg [&_a]:text-brand [&_table]:text-sm">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{block.content ?? ""}</ReactMarkdown>
        </div>
      )}

      {aiOpen && (
        <div className="mt-2 flex gap-2">
          <input
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="Ej. más concreto y orientado a ventas"
            className="flex-1 rounded-lg border border-line bg-surface px-3 py-1.5 text-xs text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
          />
          <button onClick={regenerate} disabled={!instruction.trim() || busy} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
            Aplicar
          </button>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
        {block.status === "CONFIRMED" ? (
          <button onClick={() => put({ status: "DRAFT" })} disabled={busy} className="text-fg-muted hover:text-fg">Reabrir</button>
        ) : (
          <button onClick={() => put({ status: "CONFIRMED" })} disabled={busy} className="text-emerald-600 hover:underline font-medium">Confirmar</button>
        )}
        <button onClick={() => setAiOpen((o) => !o)} className="text-fg-muted hover:text-fg">IA</button>
        {editing ? (
          <>
            <button onClick={save} disabled={busy} className="text-brand hover:underline font-medium">Guardar</button>
            <button onClick={() => { setEditing(false); setDraft(block.content ?? ""); }} className="text-fg-muted hover:text-fg">Cancelar</button>
          </>
        ) : (
          <button onClick={() => setEditing(true)} className="text-fg-muted hover:text-fg">Editar</button>
        )}
        <button onClick={remove} disabled={busy} className="text-red-500 hover:underline ml-auto">Eliminar</button>
      </div>
    </div>
  );
}

// ── Acceso publicado ──────────────────────────────────────────────────────────
function AccessPanel({ url, password }: { url: string; password: string | null }) {
  const toast = useToast();
  const copy = (text: string, label: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copiado.`), () => toast.error("No se pudo copiar."));
  return (
    <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2">
      <p className="text-xs font-semibold text-emerald-700">Acceso del prospecto</p>
      <div className="flex items-center gap-2">
        <code className="flex-1 min-w-0 truncate text-xs text-fg bg-surface rounded px-2 py-1 border border-line">{url}</code>
        <button onClick={() => copy(url, "Link")} className="text-xs text-brand hover:underline">Copiar link</button>
      </div>
      {password && (
        <div className="flex items-center gap-2">
          <code className="text-xs text-fg bg-surface rounded px-2 py-1 border border-line">{password}</code>
          <button onClick={() => copy(password, "Contraseña")} className="text-xs text-brand hover:underline">Copiar contraseña</button>
          <a href={url} target="_blank" rel="noreferrer" className="text-xs text-fg-muted hover:text-fg ml-auto">Abrir preview ↗</a>
        </div>
      )}
    </div>
  );
}

// ── Transcripts de contexto ───────────────────────────────────────────────────
function TranscriptPanel({ bcId }: { bcId: string }) {
  const toast = useToast();
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ transcripts: Transcript[] }>(`/api/business-cases/${bcId}/transcript`);
      setTranscripts(d.transcripts);
    } catch {
      /* silencioso */
    }
  }, [bcId]);

  useEffect(() => {
    load();
  }, [load]);

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
      load();
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
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo subir.");
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <section className="rounded-xl border border-line bg-surface p-4">
      <button onClick={() => setOpen((o) => !o)} className="flex items-center justify-between w-full text-left">
        <span className="text-sm font-semibold text-fg">Contexto · transcripts y notas</span>
        <span className="text-xs text-fg-muted">{transcripts.length} · {open ? "ocultar" : "ver"}</span>
      </button>
      {open && (
        <div className="mt-3">
          {transcripts.length > 0 && (
            <ul className="mb-3 space-y-1">
              {transcripts.map((t) => (
                <li key={t.id} className="text-xs text-fg-muted flex items-center gap-2">
                  <span className="px-1.5 py-0.5 rounded bg-surface-muted text-2xs">{t.source === "UPLOADED" ? "Archivo" : "Pegado"}</span>
                  <span className="truncate">{t.fileName ?? `${t.rawText.slice(0, 60)}${t.rawText.length > 60 ? "…" : ""}`}</span>
                </li>
              ))}
            </ul>
          )}
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={3}
            placeholder="Pegá un transcript o una nota…"
            className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand"
          />
          <div className="mt-2 flex items-center gap-2">
            <button onClick={addPasted} disabled={!text.trim() || busy} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:opacity-90 disabled:opacity-50">
              Agregar texto
            </button>
            <input ref={fileRef} type="file" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) addFile(f); }} />
            <button onClick={() => fileRef.current?.click()} disabled={busy} className="rounded-lg border border-line px-3 py-1.5 text-xs font-medium text-fg hover:bg-surface-hover disabled:opacity-50">
              Subir archivo
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
