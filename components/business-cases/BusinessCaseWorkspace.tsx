"use client";

/**
 * BusinessCaseWorkspace — mismo chrome que el canvas de kickoff (ProjectCanvasPanel):
 *   1. Card de CONTEXTO (estilo ProjectHandoffSection): sesiones del prospecto
 *      (estilo SessionSelectionReview) + "Fuentes manuales" colapsable.
 *   2. Header: dropdown del canvas ("Caso de uso N ▾") + "Generar con IA" a la
 *      izquierda; "Acceso del cliente" + (export) a la derecha.
 *   3. Landing FULL-BLEED (margen negativo, rompe el padding del panel) con la
 *      PublishBar "Subir al cliente" arriba. Edición inline del motor de landing.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui";
import PublishBar from "@/components/canvas/PublishBar";
import LandingView, { type LandingSectionData } from "@/components/landing/LandingView";
import { BUSINESS_CASE_LANDING } from "@/components/landing/configs/business-case";
import { useCanvasSections, type SectionWithBlocks } from "@/components/canvas/useCanvasSections";

type VersionMeta = { canvasId: string; version: number; isActive: boolean; name: string };
type SessionMeta = { sessionId: string; title: string; date: string; participants: string[]; applies: boolean; hasTranscript: boolean };
type Transcript = { id: string; source: string; rawText: string; fileName: string | null };

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function BusinessCaseWorkspace({
  bcId,
  clientName,
  clientLogoUrl,
  publishedAt,
}: {
  bcId: string;
  clientName: string;
  clientLogoUrl: string | null;
  status: string;
  publishedAt: string | null;
}) {
  const toast = useToast();
  const [versions, setVersions] = useState<VersionMeta[]>([]);
  const [canvasId, setCanvasId] = useState<string>("");
  const [generating, setGenerating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [published, setPublished] = useState(!!publishedAt);
  const [dirty, setDirty] = useState(!publishedAt);
  const [accessNonce, setAccessNonce] = useState(0);

  const loadMeta = useCallback(
    async (preferCanvasId?: string) => {
      try {
        const m = await fetchJson<{ activeCanvasId: string | null; versions: VersionMeta[] }>(
          `/api/business-cases/${bcId}/canvas-meta`,
        );
        setVersions(m.versions);
        setCanvasId((prev) =>
          preferCanvasId ?? (prev && m.versions.some((v) => v.canvasId === prev) ? prev : m.activeCanvasId ?? ""),
        );
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el caso de uso.");
      }
    },
    [bcId, toast],
  );
  useEffect(() => {
    loadMeta();
  }, [loadMeta]);

  // poll:false → la generación del BC es síncrona; sin polling (evita parpadeo).
  // onContentChange → marca cambios sin subir (dirty) para la PublishBar.
  const hook = useCanvasSections(`/api/business-cases/${bcId}`, canvasId, () => setDirty(true), { poll: false });
  const sectionByKey = new Map<string, SectionWithBlocks>(hook.sections.map((s) => [s.key, s]));
  const sectionsData: LandingSectionData[] = hook.sections.map((s) => ({ key: s.key, data: s.blocks[0]?.data ?? null, brief: s.agentBriefOverride }));
  const hasConfirmed = hook.sections.some((s) => s.blocks.some((b) => b.status === "CONFIRMED" && !blockBlank(b.data)));

  const onSectionChange = (key: string, data: unknown) => {
    const sec = sectionByKey.get(key);
    const block = sec?.blocks[0];
    if (sec && block) hook.saveBlock(sec.id, block.id, { data });
  };

  const onBriefChange = (key: string, brief: string) => {
    const sec = sectionByKey.get(key);
    if (sec) hook.setBrief(sec.id, brief);
  };

  const generate = async () => {
    if (generating) return;
    setGenerating(true);
    try {
      const r = await fetchJson<{ canvasId: string; version: number }>(`/api/business-cases/${bcId}/generate`, { method: "POST" });
      toast.success(`Caso de uso ${r.version} generado. Revisá y confirmá las secciones.`);
      await loadMeta(r.canvasId);
      await hook.refetch();
      setDirty(true);
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
      setPublished(true);
      setDirty(false);
      setAccessNonce((n) => n + 1);
      toast.success("Subido. El cliente ya ve la última versión.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo subir al cliente.");
    } finally {
      setPublishing(false);
    }
  };

  const hasCanvas = !!canvasId;
  const unpublished = !published || dirty;

  return (
    <div className="space-y-6">
      {/* 1. Contexto (estilo card de handoff) */}
      <ContextCard bcId={bcId} onAfterChange={() => setDirty(true)} />

      {/* 2. Header: dropdown del canvas + Generar (izq) · Acceso (der) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <CanvasDropdown versions={versions} canvasId={canvasId} onSwitch={setCanvasId} />
          <button
            onClick={generate}
            disabled={generating}
            className="flex items-center gap-1.5 text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-50 px-3 py-1.5 rounded-lg transition-colors"
          >
            {generating ? (
              <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
            )}
            {generating ? "Generando…" : "Generar con IA"}
          </button>
        </div>
        <div className="flex items-center gap-2">
          <BcAccessButton bcId={bcId} refreshKey={accessNonce} onRevoked={() => setPublished(false)} />
        </div>
      </div>

      {/* Revisión del agente / errores */}
      {hook.draftCount > 0 && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800">
          <span className="text-sm font-medium flex-1">
            {hook.draftCount} {hook.draftCount === 1 ? "sección nueva" : "secciones nuevas"} del agente — revisá y confirmá.
          </span>
          <button onClick={hook.acceptAll} className="text-xs font-semibold hover:underline">Confirmar todas</button>
        </div>
      )}
      {hook.error && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl bg-red-50 border border-red-200 text-red-700">
          <span className="text-sm font-medium flex-1">{hook.error}</span>
          <button onClick={hook.clearError} className="text-xs font-semibold hover:underline">Cerrar</button>
        </div>
      )}

      {/* 3. PublishBar + Landing FULL-BLEED (rompe el padding del panel px-6 py-8) */}
      <div style={{ margin: "1.5rem -1.5rem -2rem" }}>
        <div style={{ padding: "0 24px 14px" }}>
          <PublishBar
            unpublished={unpublished}
            hint={unpublished && !hasConfirmed ? "Confirmá al menos una sección para poder subirla al cliente." : undefined}
            onPublish={publish}
            publishing={publishing}
            cleanMessage="El cliente ve la última versión."
          />
        </div>
        {!hasCanvas || hook.loading ? (
          <div className="px-6 pb-8">
            <div className="rounded-xl border border-dashed border-line bg-surface p-8 text-center text-sm text-fg-muted">
              {hasCanvas ? "Cargando…" : "Preparando el caso de uso…"}
            </div>
          </div>
        ) : (
          <LandingView
            config={BUSINESS_CASE_LANDING}
            ctx={{ clientName, clientLogoUrl }}
            sections={sectionsData}
            mode="edit"
            onSectionChange={onSectionChange}
            onBriefChange={onBriefChange}
            renderOverlay={(key) => <SectionTools section={sectionByKey.get(key)} hook={hook} />}
          />
        )}
      </div>
    </div>
  );
}

/** Un `data` estructurado está "en blanco" si todos sus strings/arrays lo están. */
function blockBlank(v: unknown): boolean {
  if (v == null) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.every(blockBlank);
  if (typeof v === "object") return Object.values(v as Record<string, unknown>).every(blockBlank);
  return false;
}

// ── Dropdown del canvas ("Caso de uso N ▾"), estilo ProjectCanvasPanel ─────────
function CanvasDropdown({
  versions,
  canvasId,
  onSwitch,
}: {
  versions: VersionMeta[];
  canvasId: string;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const active = versions.find((v) => v.canvasId === canvasId);
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-xl font-bold text-fg hover:text-fg-secondary transition-colors"
      >
        {active?.name ?? "Caso de uso"}
        <svg className={`w-4 h-4 text-fg-muted transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && versions.length > 0 && (
        <div className="absolute left-0 top-full mt-1 z-50 w-60 bg-surface border border-line rounded-xl shadow-xl py-1">
          {versions.map((v) => (
            <button
              key={v.canvasId}
              onClick={() => { onSwitch(v.canvasId); setOpen(false); }}
              className={`w-full text-left px-4 py-2 text-sm transition-colors ${
                v.canvasId === canvasId ? "bg-brand/10 text-brand font-semibold" : "text-fg-secondary hover:bg-surface-hover"
              }`}
            >
              {v.name}{v.isActive ? " · activo" : ""}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Controles por sección (overlay): IA + confirmar ───────────────────────────
function SectionTools({
  section,
  hook,
}: {
  section: SectionWithBlocks | undefined;
  hook: ReturnType<typeof useCanvasSections>;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [instr, setInstr] = useState("");
  const [busy, setBusy] = useState(false);
  const block = section?.blocks[0];
  if (!section || !block) return null;
  const isDraft = block.status === "DRAFT";

  const regen = async () => {
    if (!instr.trim() || busy) return;
    setBusy(true);
    try {
      const r = await hook.regenerateBlock(section.id, block.id, instr.trim());
      if (r) {
        await hook.saveBlock(section.id, block.id, { data: r.data });
        toast.success("Sección reescrita por IA.");
        setInstr("");
        setOpen(false);
      }
    } finally {
      setBusy(false);
    }
  };

  const pill: React.CSSProperties = {
    display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 8px",
    borderRadius: 8, fontSize: 12, fontWeight: 600, background: "rgba(255,255,255,0.92)",
    border: "1px solid rgba(15,23,42,0.12)", boxShadow: "0 4px 14px -6px rgba(15,23,42,0.3)",
    color: "#0f172a", cursor: "pointer",
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
      <div style={{ display: "flex", gap: 6 }}>
        {isDraft && (
          <button style={{ ...pill, color: "#047857" }} onClick={() => hook.acceptBlock(section.id, block.id)}>
            ✓ Confirmar
          </button>
        )}
        <button style={{ ...pill, color: "#168CF6" }} onClick={() => setOpen((o) => !o)} title="Editar con IA">
          ✨ IA
        </button>
      </div>
      {open && (
        <div style={{ display: "flex", gap: 6, background: "#fff", border: "1px solid rgba(15,23,42,0.12)", borderRadius: 10, padding: 6, boxShadow: "0 8px 24px -8px rgba(15,23,42,0.35)", width: 280 }}>
          <input
            value={instr}
            onChange={(e) => setInstr(e.target.value)}
            placeholder="Ej. más concreto y orientado a ventas"
            onKeyDown={(e) => { if (e.key === "Enter") regen(); }}
            style={{ flex: 1, fontSize: 12, padding: "6px 8px", border: "1px solid #E5E7EB", borderRadius: 7, color: "#0f172a", outline: "none" }}
          />
          <button onClick={regen} disabled={busy || !instr.trim()} style={{ ...pill, color: "#fff", background: "#168CF6", borderColor: "#168CF6", opacity: busy || !instr.trim() ? 0.5 : 1 }}>
            {busy ? "…" : "Aplicar"}
          </button>
        </div>
      )}
    </div>
  );
}

// ── Acceso del cliente (pill + modal) ─────────────────────────────────────────
function BcAccessButton({ bcId, refreshKey, onRevoked }: { bcId: string; refreshKey: number; onRevoked: () => void }) {
  const toast = useToast();
  const [state, setState] = useState<{ exists: boolean; url?: string; accessPassword?: string | null; revokedAt?: string | null } | null>(null);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`/api/business-cases/${bcId}/external-access`);
      setState(r.ok ? await r.json() : { exists: false });
    } catch {
      setState({ exists: false });
    }
  }, [bcId]);
  useEffect(() => { refresh(); }, [refresh, refreshKey]);

  const active = !!state?.exists && !state?.revokedAt;
  const copy = (text: string, label: string) =>
    navigator.clipboard?.writeText(text).then(() => toast.success(`${label} copiado.`), () => toast.error("No se pudo copiar."));

  const revoke = async () => {
    setWorking(true);
    try {
      await fetch(`/api/business-cases/${bcId}/revoke`, { method: "POST" });
      await refresh();
      onRevoked();
      toast.info("Acceso revocado.");
    } catch {
      toast.error("No se pudo revocar.");
    } finally {
      setWorking(false);
    }
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          active ? "bg-emerald-50 border-emerald-200 text-emerald-700 hover:bg-emerald-100" : "bg-surface-muted border-line text-fg-secondary hover:bg-surface-hover"
        }`}
        title="Acceso del prospecto al caso de negocio"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
        </svg>
        {active ? "Acceso activo" : "Acceso del cliente"}
      </button>

      <Modal open={open} onClose={() => setOpen(false)} title="Acceso del prospecto" size="md">
        {!active ? (
          <p className="text-sm text-fg-muted leading-relaxed">
            Todavía no compartiste el caso. Confirmá secciones y tocá <strong className="text-fg">&quot;Subir al cliente&quot;</strong> para generar el link + contraseña del prospecto.
          </p>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-fg-muted">El prospecto entra con el link + la contraseña. Entregásela por canal seguro.</p>
            <div>
              <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">Link</label>
              <div className="flex items-center gap-1">
                <input readOnly value={state?.url ?? ""} onFocus={(e) => e.currentTarget.select()} className="flex-1 px-2 py-1.5 text-[11px] bg-surface-muted border border-line rounded-lg text-fg-secondary font-mono" />
                <button onClick={() => state?.url && copy(state.url, "Link")} className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0">Copiar</button>
              </div>
            </div>
            {state?.accessPassword && (
              <div>
                <label className="block text-[10px] font-semibold text-fg-muted uppercase tracking-wider mb-1">Contraseña</label>
                <div className="flex items-center gap-1">
                  <input readOnly value={state.accessPassword} onFocus={(e) => e.currentTarget.select()} className="flex-1 px-2 py-1.5 text-sm bg-surface-muted border border-line rounded-lg text-fg font-mono tracking-wider" />
                  <button onClick={() => state.accessPassword && copy(state.accessPassword, "Contraseña")} className="px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-surface-hover border border-line text-fg-secondary hover:bg-surface-muted flex-shrink-0">Copiar</button>
                </div>
              </div>
            )}
            <div className="flex justify-end pt-1">
              <button onClick={revoke} disabled={working} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-500 hover:bg-red-500/10 transition-colors disabled:opacity-50">
                {working ? "Revocando…" : "Revocar acceso"}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}

// ── Card de contexto (estilo ProjectHandoffSection) ───────────────────────────
function ContextCard({ bcId, onAfterChange }: { bcId: string; onAfterChange?: () => void }) {
  const toast = useToast();
  const [included, setIncluded] = useState<SessionMeta[]>([]);
  const [candidates, setCandidates] = useState<SessionMeta[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Fuentes manuales
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [showSources, setShowSources] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [savingSource, setSavingSource] = useState(false);

  const loadSessions = useCallback(async () => {
    try {
      const d = await fetchJson<{ included: SessionMeta[]; candidates: SessionMeta[] }>(`/api/business-cases/${bcId}/session-candidates`);
      setIncluded(d.included);
      setCandidates(d.candidates);
    } catch {
      /* silencioso */
    } finally {
      setLoadingSessions(false);
    }
  }, [bcId]);
  const loadTranscripts = useCallback(async () => {
    try {
      const d = await fetchJson<{ transcripts: Transcript[] }>(`/api/business-cases/${bcId}/transcript`);
      setTranscripts(d.transcripts);
    } catch {
      /* silencioso */
    }
  }, [bcId]);
  useEffect(() => { loadSessions(); loadTranscripts(); }, [loadSessions, loadTranscripts]);

  const toggleSession = async (sessionId: string, include: boolean) => {
    setBusyId(sessionId);
    try {
      await fetchJson(`/api/business-cases/${bcId}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, included: include }),
      });
      await loadSessions();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la sesión.");
    } finally {
      setBusyId(null);
    }
  };

  const addSource = async () => {
    const content = newContent.trim();
    if (!content || savingSource) return;
    setSavingSource(true);
    try {
      await fetchJson(`/api/business-cases/${bcId}/transcript`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source: "PASTED", rawText: newTitle.trim() ? `${newTitle.trim()}\n\n${content}` : content }),
      });
      setNewTitle("");
      setNewContent("");
      toast.success("Fuente agregada.");
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setSavingSource(false);
    }
  };

  const sourceCount = included.length + transcripts.length;
  const q = search.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => (c.title || "").toLowerCase().includes(q)) : candidates;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-3.5">
        <svg className="w-4 h-4 text-brand flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-fg">Contexto para generar el caso de negocio</h3>
          <p className="text-xs text-fg-muted mt-0.5">
            {sourceCount === 0 ? "Sumá sesiones del prospecto o pegá notas." : `${sourceCount} fuente${sourceCount === 1 ? "" : "s"} de contexto.`}
          </p>
        </div>
      </div>

      {/* Sesiones (estilo SessionSelectionReview) */}
      <div className="border-t border-line px-5 py-3 space-y-3">
        <p className="text-xs font-semibold text-fg">
          Sesiones que alimentan el caso{included.length > 0 ? ` (${included.length})` : ""}
        </p>
        {loadingSessions ? (
          <div className="h-12 rounded-xl skeleton-shimmer" />
        ) : included.length === 0 ? (
          <p className="text-xs text-fg-muted">Todavía no incluiste sesiones del prospecto. Buscá abajo o pegá una transcripción a mano.</p>
        ) : (
          <ul className="space-y-2">
            {included.map((s) => (
              <li key={s.sessionId} className="flex items-center gap-3 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
                <svg className="w-4 h-4 text-fg-muted flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-fg truncate">{s.title || "Sin título"}</p>
                  <p className="text-[11px] text-fg-muted truncate">
                    {fmtDate(s.date)}{!s.hasTranscript ? " · sin transcripción" : ""}
                  </p>
                </div>
                <button
                  onClick={() => toggleSession(s.sessionId, false)}
                  disabled={busyId === s.sessionId}
                  title="Quitar del caso"
                  className="text-fg-muted hover:text-red-500 disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex items-center justify-between gap-2 pt-1">
          <p className="text-[11px] text-fg-muted">¿Falta alguna sesión del prospecto?</p>
          <button
            onClick={() => setShowSearch(true)}
            className="text-[11px] font-semibold text-brand hover:text-brand-dark transition-colors inline-flex items-center gap-1 flex-shrink-0"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
            Buscar más sesiones
          </button>
        </div>

        <button
          onClick={() => setShowSources(true)}
          className="w-full flex items-center gap-2 text-left text-[11px] text-fg-muted bg-surface-muted rounded-lg px-3 py-2 hover:bg-surface-hover transition-colors"
        >
          <svg className="w-4 h-4 flex-shrink-0 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
          <span>¿Una reunión clave no se grabó? <span className="text-brand font-medium">Ingresá la transcripción a mano</span></span>
        </button>
      </div>

      {/* Fuentes manuales (colapsable, estilo handoff) */}
      <div className="border-t border-line px-5 py-3">
        <button
          onClick={() => setShowSources((v) => !v)}
          className="flex items-center gap-2 text-xs font-semibold text-fg-muted hover:text-fg transition-colors"
        >
          <svg className={`w-3 h-3 transition-transform ${showSources ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
          Fuentes manuales{transcripts.length > 0 ? ` (${transcripts.length})` : ""}
        </button>
        {showSources && (
          <div className="mt-3 space-y-3">
            <p className="text-[11px] text-fg-muted leading-relaxed">
              Pegá transcripts o resúmenes de reuniones que NO entraron por el sync (ej. un Zoom externo). El agente los usa como una fuente más. Se guardan y cuentan al generar.
            </p>
            {transcripts.length > 0 && (
              <ul className="space-y-2">
                {transcripts.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-fg truncate">{t.source === "UPLOADED" ? "Archivo" : "Pegado"}{t.fileName ? ` · ${t.fileName}` : ""}</p>
                      <p className="text-[11px] text-fg-muted truncate">{t.rawText.slice(0, 140)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-2 rounded-lg border border-line p-3">
              <input
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="Título (ej. Zoom con el prospecto — 12 jun)"
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
              />
              <textarea
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
                rows={4}
                placeholder="Pegá acá el transcript o el resumen…"
                className="w-full px-2.5 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
              />
              <div className="flex justify-end">
                <button
                  onClick={addSource}
                  disabled={savingSource || newContent.trim().length === 0}
                  className="text-xs font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 px-3 py-1.5 rounded-lg transition-colors"
                >
                  {savingSource ? "Agregando…" : "Agregar fuente"}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal "Buscar más sesiones" */}
      <Modal open={showSearch} onClose={() => { setShowSearch(false); setSearch(""); }} title="Buscar sesiones del prospecto" size="md">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título…"
          className="w-full px-3 py-2 text-sm bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand mb-3"
        />
        {filtered.length === 0 ? (
          <p className="text-xs text-fg-muted py-2">No se encontraron más sesiones del prospecto.</p>
        ) : (
          <ul className="space-y-1.5 max-h-80 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.sessionId} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs text-fg truncate">{c.title || "Sin título"}</span>
                    <span className="text-[10px] text-fg-muted flex-shrink-0">{fmtDate(c.date)}</span>
                    {c.applies && (
                      <span className="text-[9px] font-bold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 rounded-full px-1.5 py-0.5 flex-shrink-0">Ventas</span>
                    )}
                    {!c.hasTranscript && (
                      <span className="text-[9px] font-medium text-amber-700 bg-amber-50 border border-amber-200 rounded-full px-1.5 py-0.5 flex-shrink-0">sin transcripción</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => toggleSession(c.sessionId, true)}
                  disabled={busyId === c.sessionId}
                  className="text-[11px] font-semibold text-brand hover:text-brand-dark disabled:opacity-40 transition-colors flex-shrink-0"
                >
                  Agregar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </section>
  );
}
