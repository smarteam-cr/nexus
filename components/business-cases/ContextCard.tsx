"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui";
import TagsStrip from "@/components/tags/TagsStrip";
import { ContextColumn, ContextColumnList, ContextRow, CTX_ICONS } from "@/components/clients/context-column";
import type { ImplementationType } from "@prisma/client";

type SessionMeta = { sessionId: string; title: string; date: string; participants: string[]; applies: boolean; hasTranscript: boolean };
type Transcript = {
  id: string;
  source: string;
  rawText: string;
  fileName: string | null;
  // Fuente URL (diagnóstico por URL): fileUrl http + fecha del último fetch.
  fileUrl?: string | null;
  processedAt?: string | null;
};

const isUrlTranscript = (t: Transcript) => !!t.fileUrl?.startsWith("http");
function hostnameOf(u: string): string {
  try { return new URL(u).hostname; } catch { return u; }
}

// Checklist de casos de uso del catálogo (GET use-case-candidates)
type UseCaseRow = {
  id: string;
  title: string;
  description: string;
  price: string | null;
  active: boolean;
  selected: boolean;
  priceOverride: string | null;
};
type HsTimelineItem = { type: "NOTE" | "CALL" | "MEETING"; title: string; date: string | null; snippet: string };
const HS_TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };

function fmtDate(d: string): string {
  return new Date(d).toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

// ── Card de contexto (estilo ProjectHandoffSection) ───────────────────────────
export default function ContextCard({
  bcId,
  onAfterChange,
  onUseCasesSync,
  onUseCasesState,
}: {
  bcId: string;
  onAfterChange?: () => void;
  /** Re-escribe la sección `casos_de_uso` del canvas visto con los seleccionados (solo al togglear). */
  onUseCasesSync?: (items: { title: string; detail: string; price: string }[]) => void;
  /** Reporte (sin escribir) de los títulos seleccionados — para el aviso al publicar. */
  onUseCasesState?: (titles: string[]) => void;
}) {
  const toast = useToast();
  const [included, setIncluded] = useState<SessionMeta[]>([]);
  const [candidates, setCandidates] = useState<SessionMeta[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  // Fuentes manuales
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(true);
  // Colapso general de la card (diseño de 3 columnas, calcado de ProjectContextSection).
  const [open, setOpen] = useState(true);
  // Form de pegado manual (colapsado dentro de la columna "Fuentes manuales").
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  // Diagnóstico por URL (fuente URL: fetch server-side, congelado al pegar, releer manual)
  const [newUrl, setNewUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [busyTranscriptId, setBusyTranscriptId] = useState<string | null>(null);
  // Timeline de HubSpot (llamadas + reuniones + notas detectadas en el registro de empresa)
  const [hubspot, setHubspot] = useState<HsTimelineItem[]>([]);
  const [loadingHs, setLoadingHs] = useState(true);
  // Clasificación (tira de tags) — mismo catálogo que el proyecto; se PROPAGA al crear el handoff.
  const [tags, setTags] = useState<string[]>([]);
  const [modality, setModalityState] = useState<ImplementationType | null>(null);
  // Checklist de casos de uso del catálogo — solo se monta si hay catálogo aplicable
  // (degradación elegante: sin catálogo, este BC funciona exactamente como siempre).
  const [useCases, setUseCases] = useState<UseCaseRow[]>([]);
  const [ucEnabled, setUcEnabled] = useState(false);
  const [ucUnavailable, setUcUnavailable] = useState(false);
  const [ucBusyId, setUcBusyId] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    try {
      const d = await fetchJson<{ included: SessionMeta[]; candidates: SessionMeta[] }>(`/api/business-cases/${bcId}/session-candidates`);
      setIncluded(d.included);
      setCandidates(d.candidates);
    } catch (e) {
      // Antes era silencioso: el vendedor veía "0 fuentes" sin saber que fue un
      // fallo de carga (y generaba un caso vacío creyendo que no había sesiones).
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las sesiones del prospecto.");
    } finally {
      setLoadingSessions(false);
    }
  }, [bcId, toast]);
  const loadTranscripts = useCallback(async () => {
    try {
      const d = await fetchJson<{ transcripts: Transcript[] }>(`/api/business-cases/${bcId}/transcript`);
      setTranscripts(d.transcripts);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las fuentes manuales.");
    } finally {
      setLoadingTranscripts(false);
    }
  }, [bcId, toast]);
  const loadHubspot = useCallback(async () => {
    try {
      const d = await fetchJson<{ items: HsTimelineItem[] }>(`/api/business-cases/${bcId}/hubspot-timeline`);
      setHubspot(d.items);
    } catch {
      /* silencioso — sin HubSpot, el panel sigue */
    } finally {
      setLoadingHs(false);
    }
  }, [bcId]);
  const loadTags = useCallback(async () => {
    try {
      const d = await fetchJson<{ tags: string[]; implementationType: ImplementationType | null }>(`/api/business-cases/${bcId}/tags`);
      setTags(d.tags);
      setModalityState(d.implementationType);
    } catch {
      /* silencioso — la tira aparece vacía/editable */
    }
  }, [bcId]);
  // Devuelve null en error (≠ []): un reload fallido tras togglear NO debe
  // sincronizar la sección con "cero casos" (borraría contenido publicable).
  const ucReqSeq = useRef(0);
  const loadUseCases = useCallback(async (): Promise<UseCaseRow[] | null> => {
    const seq = ++ucReqSeq.current;
    try {
      const d = await fetchJson<{ enabled: boolean; catalogUnavailable: boolean; useCases: UseCaseRow[] }>(
        `/api/business-cases/${bcId}/use-case-candidates`,
      );
      if (seq !== ucReqSeq.current) return null; // respuesta vieja (carrera): descartarla
      setUseCases(d.useCases);
      setUcEnabled(d.enabled);
      setUcUnavailable(d.catalogUnavailable);
      if (d.enabled) onUseCasesState?.(d.useCases.filter((u) => u.selected).map((u) => u.title));
      return d.useCases;
    } catch {
      /* silencioso — sin catálogo, el panel sigue */
      return null;
    }
  }, [bcId, onUseCasesState]);
  useEffect(() => { loadSessions(); loadTranscripts(); loadHubspot(); loadTags(); loadUseCases(); }, [loadSessions, loadTranscripts, loadHubspot, loadTags, loadUseCases]);

  // Persistencia optimista de la clasificación (PATCH /tags).
  const patchTags = useCallback(async (payload: { tags?: string[]; implementationType?: ImplementationType | null }) => {
    try {
      await fetchJson(`/api/business-cases/${bcId}/tags`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la clasificación.");
      loadTags(); // revertir al estado del servidor
    }
  }, [bcId, toast, loadTags]);
  const saveTags = useCallback((slugs: string[]) => { setTags(slugs); patchTags({ tags: slugs }); }, [patchTags]);
  const setModality = useCallback((m: ImplementationType | null) => { setModalityState(m); patchTags({ implementationType: m }); }, [patchTags]);

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

  // Leer una URL de diagnóstico (server-side) → fuente URL. El contenido queda
  // congelado al pegar; "Releer" lo refresca a demanda.
  const addUrlSource = async () => {
    const url = newUrl.trim();
    if (!url || fetchingUrl) return;
    setFetchingUrl(true);
    try {
      const d = await fetchJson<{ transcript: { chars: number; updated: boolean } }>(
        `/api/business-cases/${bcId}/transcript/url`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) },
      );
      setNewUrl("");
      toast.success(
        d.transcript.updated
          ? `Fuente actualizada (${d.transcript.chars.toLocaleString()} caracteres).`
          : `Página leída (${d.transcript.chars.toLocaleString()} caracteres).`,
      );
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo leer la página.");
    } finally {
      setFetchingUrl(false);
    }
  };

  const refetchUrl = async (transcriptId: string) => {
    setBusyTranscriptId(transcriptId);
    try {
      const d = await fetchJson<{ transcript: { chars: number } }>(
        `/api/business-cases/${bcId}/transcript/url`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcriptId, refetch: true }),
        },
      );
      toast.success(`Página releída (${d.transcript.chars.toLocaleString()} caracteres).`);
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo releer la página.");
    } finally {
      setBusyTranscriptId(null);
    }
  };

  const deleteTranscript = async (transcriptId: string) => {
    setBusyTranscriptId(transcriptId);
    try {
      await fetchJson(`/api/business-cases/${bcId}/transcript/${transcriptId}`, { method: "DELETE" });
      toast.info("Fuente eliminada.");
      loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar la fuente.");
    } finally {
      setBusyTranscriptId(null);
    }
  };

  // Marcar/desmarcar (o cambiar priceOverride de) un caso de uso: upsert del pivote +
  // sync de la sección `casos_de_uso` del canvas visto con los seleccionados frescos.
  const patchUseCase = async (useCaseId: string, selected: boolean, priceOverride?: string | null) => {
    setUcBusyId(useCaseId);
    try {
      await fetchJson(`/api/business-cases/${bcId}/use-cases`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ useCaseId, selected, ...(priceOverride !== undefined ? { priceOverride } : {}) }),
      });
      const fresh = await loadUseCases();
      if (!fresh) {
        // El toggle SÍ se guardó pero el reload falló: NO sincronizar la sección con
        // datos viejos/vacíos (borraría contenido). El aviso de publish cubre la divergencia.
        toast.error("Se guardó el cambio, pero no se pudo refrescar el checklist. Recargá la página.");
        return;
      }
      onUseCasesSync?.(
        fresh
          .filter((u) => u.selected)
          .map((u) => ({ title: u.title, detail: u.description, price: u.priceOverride ?? u.price ?? "" })),
      );
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el caso de uso.");
    } finally {
      setUcBusyId(null);
    }
  };

  const selectedUcCount = useCases.filter((u) => u.selected).length;

  const sourceCount = included.length + transcripts.length + hubspot.length;
  const q = search.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => (c.title || "").toLowerCase().includes(q)) : candidates;

  const totalCtx = hubspot.length + included.length + transcripts.length;
  const dot = (color: string) => <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: color }} />;

  return (
    <section className="rounded-2xl border border-line bg-surface">
      {/* Header colapsable — calcado de ProjectContextSection (Contexto del proyecto) */}
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="w-full flex items-center gap-2.5 px-5 py-3 hover:bg-surface-hover transition-colors text-left rounded-t-2xl"
      >
        <svg className={`w-4 h-4 text-fg-secondary flex-shrink-0 transition-transform ${open ? "" : "-rotate-90"}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
        <span className="text-sm font-bold text-fg">Contexto</span>
        <span className="text-[11px] text-fg-muted">{totalCtx} fuente{totalCtx === 1 ? "" : "s"}</span>
        <span className="hidden sm:flex items-center gap-3 ml-2 text-[11px] text-fg-secondary">
          <span className="inline-flex items-center gap-1">{dot("#ff7a59")}{hubspot.length}</span>
          <span className="inline-flex items-center gap-1">{dot("#16a34a")}{included.length}</span>
          <span className="inline-flex items-center gap-1">{dot("#7c6df2")}{transcripts.length}</span>
        </span>
        <span className="ml-auto text-xs text-fg-muted">{open ? "Colapsar" : "Expandir"}</span>
      </button>

      {/* Clasificación (tags + modalidad): siempre visible, se propaga al handoff. */}
      <div className="px-5 pb-2.5">
        <TagsStrip tags={tags} implementationType={modality} canEdit onSetTags={saveTags} onSetModality={setModality} />
      </div>

      {/* Aviso proactivo: sin NINGUNA fuente con contenido no se puede generar con IA. */}
      {!loadingSessions && !loadingHs && transcripts.length === 0 && !included.some((s) => s.hasTranscript) && hubspot.length === 0 && (
        <div className="px-5 pb-2.5">
          <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[11px] text-amber-800 leading-relaxed">
            Para <strong>generar con IA</strong> hace falta al menos una fuente con contenido (transcript o algo del timeline de HubSpot).{" "}
            {included.length > 0 ? "Las sesiones del prospecto todavía no están transcritas — " : ""}
            pegá uno a mano en <strong>Fuentes manuales</strong>.
          </div>
        </div>
      )}

      {/* Cuerpo: 3 columnas (HubSpot · Google Meet · Fuentes manuales), como el proyecto.
          Siempre montado (contadores del header valen colapsado); `hidden` al colapsar. */}
      <div className={open ? "px-5 pb-4" : "hidden"}>
        <p className="text-[11px] text-fg-muted mb-2.5">
          Llamadas, reuniones, notas y transcripciones del prospecto. Se usan automáticamente como contexto al generar.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ContextColumn icon={CTX_ICONS.hubspot} color="#ff7a59" title="HubSpot" count={hubspot.length}>
            <ContextColumnList loading={loadingHs} empty="Nada detectado en el registro de la empresa.">
              {hubspot.map((it, i) => (
                <ContextRow
                  key={i}
                  icon={CTX_ICONS.hubspot}
                  meta={`${HS_TYPE_LABEL[it.type] ?? it.type}${it.date ? ` · ${it.date}` : ""}`}
                  title={it.title || undefined}
                  snippet={it.snippet ?? undefined}
                />
              ))}
            </ContextColumnList>
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={included.length}>
            <ContextColumnList loading={loadingSessions} empty="Sin sesiones del prospecto.">
              {included.map((s) => (
                <ContextRow
                  key={s.sessionId}
                  icon={CTX_ICONS.meet}
                  meta={`${fmtDate(s.date)}${!s.hasTranscript ? " · sin transcripción" : ""}`}
                  title={s.title || "Sin título"}
                  onRemove={busyId === s.sessionId ? undefined : () => toggleSession(s.sessionId, false)}
                  removeTitle="Quitar del caso"
                />
              ))}
            </ContextColumnList>
            <button
              onClick={() => setShowSearch(true)}
              className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg-secondary border border-dashed border-line rounded-lg px-2 py-1.5 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" /></svg>
              Buscar más sesiones
            </button>
          </ContextColumn>

          <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={transcripts.length}>
            <ContextColumnList loading={loadingTranscripts} empty="Sin notas, URLs ni transcripciones a mano.">
              {transcripts.map((t) => {
                const isUrl = isUrlTranscript(t);
                const busy = busyTranscriptId === t.id;
                return (
                  <li key={t.id} className="flex items-start gap-2 rounded-lg border border-line bg-surface-muted px-2.5 py-1.5">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 text-[10px] text-fg-muted">
                        <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={CTX_ICONS.note} />
                        </svg>
                        <span className="truncate">
                          {isUrl
                            ? `URL · ${hostnameOf(t.fileUrl!)}${t.processedAt ? ` · leída ${fmtDate(t.processedAt)}` : ""}`
                            : t.source === "UPLOADED" ? "Archivo" : "Manual"}
                        </span>
                      </div>
                      {t.fileName && <p className="text-xs font-medium text-fg truncate mt-0.5">{t.fileName}</p>}
                      <p className="text-[11px] text-fg-muted truncate">{t.rawText.slice(0, 120)}</p>
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 mt-0.5">
                      {isUrl && (
                        <button
                          onClick={() => refetchUrl(t.id)}
                          disabled={busy}
                          title="Releer la página (actualiza el contenido)"
                          className="text-fg-muted hover:text-fg disabled:opacity-40 transition-colors text-xs px-0.5"
                        >
                          ↻
                        </button>
                      )}
                      <button
                        onClick={() => deleteTranscript(t.id)}
                        disabled={busy}
                        title="Eliminar esta fuente"
                        className="text-fg-muted hover:text-red-500 disabled:opacity-40 transition-colors flex-shrink-0"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  </li>
                );
              })}
            </ContextColumnList>

            {/* Diagnóstico por URL: fetch server-side; congelado al pegar, releer manual. */}
            <div className="mt-2 flex gap-1.5">
              <input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") addUrlSource(); }}
                placeholder="URL del diagnóstico…"
                className="flex-1 min-w-0 px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
              />
              <button
                onClick={addUrlSource}
                disabled={fetchingUrl || newUrl.trim().length === 0}
                className="text-[11px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors flex-shrink-0"
              >
                {fetchingUrl ? "Leyendo…" : "Leer"}
              </button>
            </div>

            {showAdd ? (
              <div className="mt-2 space-y-1.5 rounded-lg border border-line p-2">
                <input
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Título (ej. Zoom con el prospecto)"
                  className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
                />
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  rows={3}
                  placeholder="Pegá el transcript o resumen…"
                  className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
                />
                <div className="flex justify-end gap-1.5">
                  <button onClick={() => { setShowAdd(false); setNewTitle(""); setNewContent(""); }} className="text-[11px] text-fg-muted hover:text-fg px-2 py-1 rounded-lg transition-colors">Cancelar</button>
                  <button onClick={addSource} disabled={savingSource || newContent.trim().length === 0} className="text-[11px] font-semibold text-white bg-brand hover:bg-brand-dark disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors">{savingSource ? "Agregando…" : "Agregar"}</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)} className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg-secondary border border-dashed border-line rounded-lg px-2 py-1.5 transition-colors">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                Agregar fuente
              </button>
            )}
          </ContextColumn>
        </div>
      </div>

      {/* Checklist de casos de uso del catálogo — INTERNO (para compartir pantalla):
          lo marcado se materializa en la sección "Casos de uso" con precios exactos.
          Solo se monta si hay catálogo aplicable; sin catálogo, nada cambia. */}
      {ucUnavailable && (
        <div className="border-t border-line px-5 py-3">
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
            El catálogo de casos de uso no está disponible (tabla ausente en la base). No regeneres
            este caso hasta resolverlo — la sección de casos de uso saldría vacía.
          </p>
        </div>
      )}
      {ucEnabled && useCases.length > 0 && (
        <div className="border-t border-line px-5 py-3">
          <p className="text-xs font-semibold text-fg-muted mb-2">
            Casos de uso del catálogo{selectedUcCount > 0 ? ` (${selectedUcCount} seleccionados)` : ""}
          </p>
          <p className="text-[11px] text-fg-muted leading-relaxed mb-2.5">
            Marcá los que van en esta propuesta: entran a la sección &quot;Casos de uso&quot; con el texto y
            precio exactos del catálogo (el agente no los inventa ni los altera).
          </p>
          <ul className="space-y-1.5">
            {useCases.map((u) => (
              <li
                key={u.id}
                className={`rounded-lg border px-3 py-2.5 ${u.selected ? "border-brand/50 bg-brand/5" : "border-line"}`}
              >
                <label className="flex items-start gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-1"
                    checked={u.selected}
                    // Se deshabilita TODO el checklist con un patch en vuelo: dos toggles
                    // concurrentes en filas distintas reordenados por la red revertirían
                    // el segundo (el load viejo pisa al nuevo).
                    disabled={ucBusyId !== null}
                    onChange={() => patchUseCase(u.id, !u.selected)}
                  />
                  <span className="flex-1 min-w-0">
                    <span className="text-sm text-fg font-medium block">
                      {u.title}
                      {u.price && (
                        <span className="ml-2 text-[11px] px-2 py-0.5 rounded-full border border-line text-fg-muted">
                          {u.price}
                        </span>
                      )}
                      {!u.active && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-amber-700">
                          retirado del catálogo
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-fg-muted block mt-0.5">{u.description}</span>
                  </span>
                </label>
                {u.selected && (
                  <div className="mt-2 ml-6 flex items-center gap-2">
                    <span className="text-[11px] text-fg-muted flex-shrink-0">Precio para este caso:</span>
                    <input
                      defaultValue={u.priceOverride ?? ""}
                      placeholder={u.price ?? "según catálogo"}
                      disabled={ucBusyId !== null}
                      onBlur={(e) => {
                        const v = e.target.value.trim();
                        if (v !== (u.priceOverride ?? "")) patchUseCase(u.id, true, v || null);
                      }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
                      className="w-44 px-2 py-1 text-xs bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

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
