"use client";

/**
 * components/propuestas/ContextoDeLaPropuesta.tsx — el paso «Contexto» de la ficha de la propuesta
 * (rediseño del 2026-10-05). Reemplaza a ContextCard.
 *
 * Pedido de Elías: «la sección de contexto de cada propuesta debe verse igual a las secciones de
 * contexto de kickoff, diagnósticos, etc.». Por eso es el MISMO molde que el contexto del handoff
 * (components/clients/ProjectContextSection.tsx): filas plegables de «alrededor» (FilaDeAlrededor)
 * y, adentro, las columnas de siempre (ContextColumn / ContextRow) —HubSpot · Google Meet · Fuentes
 * manuales · Preventa— con las mismas insignias («Material», «Incluida», «Excluida») y la misma X.
 * Lo que es propio de la propuesta queda igual que antes:
 *   · HubSpot: las notas, llamadas y reuniones de la empresa; la X las saca SOLO de esta propuesta.
 *   · Google Meet: las sesiones del prospecto que se eligieron, más «Buscar más sesiones».
 *   · Fuentes manuales: pegar un texto o leer una URL (el diagnóstico web).
 *   · Preventa: la de la empresa, con o sin (components/propuestas/ColumnaPreventa.tsx).
 *   · Casos de uso con precio fijo: entran con su precio exacto; el agente no los escribe.
 * Las cuentas dicen lo que ALIMENTA: una fuente excluida sigue a la vista, pero no cuenta.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Modal } from "@/components/ui";
import TagsStrip from "@/components/tags/TagsStrip";
import { ContextColumn, ContextColumnList, ContextRow, CTX_ICONS } from "@/components/clients/context-column";
import { FilaDeAlrededor } from "@/components/clients/FilaDeAlrededor";
import { fechaDeVentas } from "@/lib/business-cases/estado-de-la-propuesta";
import ColumnaPreventa, { type PreventaDeLaPropuesta } from "./ColumnaPreventa";

type SessionMeta = { sessionId: string; title: string; date: string; participants: string[]; applies: boolean; hasTranscript: boolean };
type Transcript = {
  id: string;
  source: string;
  rawText: string;
  fileName: string | null;
  /** Fuente URL (diagnóstico web): la dirección y cuándo se leyó. */
  fileUrl?: string | null;
  processedAt?: string | null;
};
type UseCaseRow = {
  id: string;
  title: string;
  description: string;
  price: string | null;
  active: boolean;
  selected: boolean;
  priceOverride: string | null;
};
type HsTimelineItem = {
  /** Id del engagement en HubSpot (v1): la clave con la que se excluye. */
  id: string;
  type: "NOTE" | "CALL" | "MEETING";
  title: string;
  date: string | null;
  snippet: string;
  excluded?: boolean;
};

const HS_TYPE_LABEL: Record<string, string> = { NOTE: "Nota", CALL: "Llamada", MEETING: "Reunión" };
const isUrlTranscript = (t: Transcript) => !!t.fileUrl?.startsWith("http");
function hostnameOf(u: string): string {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}

/** Lo que el paso reporta a la ficha (la barra de pasos y «Lo que va a leer»). */
export interface CuentasDelContexto {
  hubspot: number;
  hubspotTotal: number;
  meet: number;
  /** Sesiones elegidas sin transcripción: se ven, pero el agente no las puede leer. */
  meetSinTranscripcion: number;
  manuales: number;
  preventa: number;
  /** Hay al menos una fuente con contenido: sin ninguna no se puede generar. */
  hayMaterial: boolean;
  cargando: boolean;
}

export default function ContextoDeLaPropuesta({
  bcId,
  empresa,
  puedeEditar,
  preventa,
  preventaOcupada,
  onUsarPreventa,
  onCuentas,
  onAfterChange,
  onUseCasesSync,
  onUseCasesState,
  pie,
}: {
  bcId: string;
  empresa: string;
  puedeEditar: boolean;
  preventa: PreventaDeLaPropuesta | null;
  preventaOcupada: boolean;
  onUsarPreventa: (exploracionId: string | null) => void;
  onCuentas: (c: CuentasDelContexto) => void;
  onAfterChange?: () => void;
  /** Re-escribe la sección `casos_de_uso` del canvas visto con los marcados (solo al tocar uno). */
  onUseCasesSync?: (items: { title: string; detail: string; price: string }[]) => void;
  /** Los títulos marcados, sin escribir: para el aviso al subir. */
  onUseCasesState?: (titles: string[]) => void;
  /** El botón de generar y su nota, al pie del paso. */
  pie: ReactNode;
}) {
  const toast = useToast();
  const [included, setIncluded] = useState<SessionMeta[]>([]);
  const [candidates, setCandidates] = useState<SessionMeta[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(true);
  const [showSearch, setShowSearch] = useState(false);
  const [search, setSearch] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [busyHsId, setBusyHsId] = useState<string | null>(null);
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loadingTranscripts, setLoadingTranscripts] = useState(true);
  const [ctxAbierto, setCtxAbierto] = useState(true);
  const [casosAbierto, setCasosAbierto] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [savingSource, setSavingSource] = useState(false);
  const [newUrl, setNewUrl] = useState("");
  const [fetchingUrl, setFetchingUrl] = useState(false);
  const [busyTranscriptId, setBusyTranscriptId] = useState<string | null>(null);
  const [hubspot, setHubspot] = useState<HsTimelineItem[]>([]);
  const [loadingHs, setLoadingHs] = useState(true);
  const [tags, setTags] = useState<string[]>([]);
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
      // Nunca en silencio: «0 reuniones» por un fallo de carga hacía generar con menos de lo que había.
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
      /* sin HubSpot, el resto del contexto sigue */
    } finally {
      setLoadingHs(false);
    }
  }, [bcId]);
  const loadTags = useCallback(async () => {
    try {
      const d = await fetchJson<{ tags: string[] }>(`/api/business-cases/${bcId}/tags`);
      setTags(d.tags);
    } catch {
      /* la tira aparece vacía y editable */
    }
  }, [bcId]);
  // null en error (≠ []): un reload fallido después de tocar un caso NO puede sincronizar la sección con «cero».
  const ucReqSeq = useRef(0);
  const loadUseCases = useCallback(async (): Promise<UseCaseRow[] | null> => {
    const seq = ++ucReqSeq.current;
    try {
      const d = await fetchJson<{ enabled: boolean; catalogUnavailable: boolean; useCases: UseCaseRow[] }>(
        `/api/business-cases/${bcId}/use-case-candidates`,
      );
      if (seq !== ucReqSeq.current) return null; // respuesta vieja (carrera): se descarta
      setUseCases(d.useCases);
      setUcEnabled(d.enabled);
      setUcUnavailable(d.catalogUnavailable);
      if (d.enabled) onUseCasesState?.(d.useCases.filter((u) => u.selected).map((u) => u.title));
      return d.useCases;
    } catch {
      return null;
    }
  }, [bcId, onUseCasesState]);
  useEffect(() => {
    void loadSessions();
    void loadTranscripts();
    void loadHubspot();
    void loadTags();
    void loadUseCases();
  }, [loadSessions, loadTranscripts, loadHubspot, loadTags, loadUseCases]);

  // Al usar otra preventa cambian los casos de uso marcados (llegan los que eligió la preventa).
  const preventaId = preventa?.exploracionId ?? null;
  useEffect(() => {
    if (preventaId) void loadUseCases();
  }, [preventaId, loadUseCases]);

  /** La X de HubSpot: se relee del servidor, porque lo que importa es lo que quedó GUARDADO (lo lee la generación). */
  const toggleHsItem = async (engagementId: string, excluded: boolean) => {
    setBusyHsId(engagementId);
    try {
      await fetchJson(`/api/business-cases/${bcId}/hubspot-timeline/exclude`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ engagementId, excluded }),
      });
      await loadHubspot();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el contexto.");
    } finally {
      setBusyHsId(null);
    }
  };

  const saveTags = useCallback(
    (slugs: string[]) => {
      setTags(slugs);
      void (async () => {
        try {
          await fetchJson(`/api/business-cases/${bcId}/tags`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tags: slugs }),
          });
        } catch (e) {
          toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la clasificación.");
          void loadTags();
        }
      })();
    },
    [bcId, toast, loadTags],
  );

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
      setShowAdd(false);
      toast.success("Fuente agregada.");
      void loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setSavingSource(false);
    }
  };

  // Leer una URL (diagnóstico web) en el servidor. El texto queda congelado al pegar; «Releer» lo refresca.
  const addUrlSource = async () => {
    const url = newUrl.trim();
    if (!url || fetchingUrl) return;
    setFetchingUrl(true);
    try {
      const d = await fetchJson<{ transcript: { chars: number; updated: boolean } }>(`/api/business-cases/${bcId}/transcript/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });
      setNewUrl("");
      toast.success(d.transcript.updated ? "Fuente actualizada." : "Página leída.");
      void loadTranscripts();
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
      await fetchJson(`/api/business-cases/${bcId}/transcript/url`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptId, refetch: true }),
      });
      toast.success("Página releída.");
      void loadTranscripts();
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
      toast.info("Fuente quitada.");
      void loadTranscripts();
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo quitar la fuente.");
    } finally {
      setBusyTranscriptId(null);
    }
  };

  // Marcar o desmarcar (o cambiar el precio de) un caso de uso, y sincronizar la sección del canvas visto.
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
        toast.error("Se guardó el cambio, pero no se pudo refrescar la lista. Recarga la página.");
        return;
      }
      onUseCasesSync?.(
        fresh.filter((u) => u.selected).map((u) => ({ title: u.title, detail: u.description, price: u.priceOverride ?? u.price ?? "" })),
      );
      onAfterChange?.();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar el caso de uso.");
    } finally {
      setUcBusyId(null);
    }
  };

  const hubspotQueAlimenta = hubspot.filter((it) => !it.excluded).length;
  const hubspotExcluidas = hubspot.length - hubspotQueAlimenta;
  const preventaCuenta = preventa?.exploracionId ? 1 : 0;
  const total = hubspotQueAlimenta + included.length + transcripts.length + preventaCuenta;
  const cargando = loadingSessions || loadingHs || loadingTranscripts;
  const hayMaterial =
    transcripts.length > 0 || included.some((s) => s.hasTranscript) || hubspotQueAlimenta > 0 || preventaCuenta > 0;
  const meetSinTranscripcion = included.filter((s) => !s.hasTranscript).length;

  useEffect(() => {
    onCuentas({
      hubspot: hubspotQueAlimenta,
      hubspotTotal: hubspot.length,
      meet: included.length,
      meetSinTranscripcion,
      manuales: transcripts.length,
      preventa: preventaCuenta,
      hayMaterial,
      cargando,
    });
  }, [onCuentas, hubspotQueAlimenta, hubspot.length, included.length, meetSinTranscripcion, transcripts.length, preventaCuenta, hayMaterial, cargando]);

  const q = search.trim().toLowerCase();
  const filtered = q ? candidates.filter((c) => (c.title || "").toLowerCase().includes(q)) : candidates;
  const marcados = useCases.filter((u) => u.selected).length;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1">
        <h2 className="text-[22px] font-bold leading-7 text-fg">Contexto</h2>
        <p className="text-sm text-fg-secondary">
          Lo que va a leer el agente al generar. Se ve y se cura igual que el contexto del handoff, del kickoff o del diagnóstico.
        </p>
      </div>

      <section aria-label="Qué se vende" className="flex flex-col gap-2.5 rounded-xl border border-line bg-surface p-4">
        <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">Qué se vende</span>
        <TagsStrip tags={tags} canEdit={puedeEditar} onSetTags={saveTags} />
      </section>

      {!cargando && !hayMaterial && (
        <div className="rounded-xl border border-warn-line bg-warn-surface px-4 py-3 text-[13px] leading-[19px] text-warn-ink">
          Para generar hace falta al menos una fuente con contenido: una nota de HubSpot, una reunión con transcripción, una fuente a
          mano o la preventa.
          {included.length > 0 ? " Las reuniones elegidas todavía no tienen transcripción." : ""}
        </div>
      )}

      {/* Las filas de alrededor, como en el handoff: la primera sin su raya de arriba (la pone la tarjeta). */}
      <section aria-label="Alrededor de la propuesta" className="overflow-clip rounded-xl border border-line bg-surface [&>div:first-child]:border-t-0">
        <FilaDeAlrededor
          titulo="Contexto de la propuesta"
          ayuda={`Lo que lee el agente: notas de HubSpot, reuniones, fuentes a mano${preventaCuenta ? " y la preventa" : ""}.`}
          meta={
            cargando
              ? "Cargando…"
              : `${total} fuente${total === 1 ? "" : "s"}${hubspotExcluidas > 0 ? ` · ${hubspotExcluidas} excluida${hubspotExcluidas === 1 ? "" : "s"}` : ""}`
          }
          abierto={ctxAbierto}
          onAlternar={() => setCtxAbierto((v) => !v)}
        >
          <p className="mb-2.5 text-xs text-fg-muted">
            Estas fuentes arman la propuesta. Todo lo <span className="font-medium text-fg-secondary">incluido</span> alimenta la
            generación; <span className="font-medium text-fg-secondary">excluye</span> lo que sea de otra venta. Sacarlo de acá no lo
            borra de HubSpot ni de la preventa.
          </p>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <ContextColumn icon={CTX_ICONS.hubspot} color="#ff7a59" title="HubSpot" count={hubspotQueAlimenta}>
              <ContextColumnList loading={loadingHs} empty="Nada en el registro de la empresa.">
                {hubspot.map((it) => (
                  <ContextRow
                    key={it.id}
                    icon={it.type === "NOTE" ? CTX_ICONS.note : CTX_ICONS.calendar}
                    meta={`${HS_TYPE_LABEL[it.type] ?? it.type}${it.date ? ` · ${it.date}` : ""}`}
                    title={it.title || undefined}
                    snippet={it.snippet || undefined}
                    dim={it.excluded}
                    badge={it.excluded ? { label: "Excluida", tone: "muted" } : { label: "Material", tone: "green" }}
                    action={
                      puedeEditar && it.excluded
                        ? { label: "Incluir", onClick: () => void toggleHsItem(it.id, false), disabled: busyHsId === it.id }
                        : undefined
                    }
                    onRemove={puedeEditar && !it.excluded && busyHsId !== it.id ? () => void toggleHsItem(it.id, true) : undefined}
                    removeTitle="Excluir de esta propuesta (no se borra de HubSpot)"
                  />
                ))}
              </ContextColumnList>
            </ContextColumn>

            <ContextColumn icon={CTX_ICONS.meet} color="#16a34a" title="Google Meet" count={included.length}>
              <ContextColumnList loading={loadingSessions} empty="Sin reuniones elegidas. Agrégalas con «Buscar más sesiones».">
                {included.map((s) => (
                  <ContextRow
                    key={s.sessionId}
                    icon={CTX_ICONS.meet}
                    meta={fechaDeVentas(s.date)}
                    title={s.title || "Sin título"}
                    badge={s.hasTranscript ? { label: "Incluida", tone: "green" } : { label: "Sin transcripción", tone: "amber" }}
                    onRemove={puedeEditar && busyId !== s.sessionId ? () => void toggleSession(s.sessionId, false) : undefined}
                    removeTitle="Sacar de esta propuesta"
                  />
                ))}
              </ContextColumnList>
              {puedeEditar && (
                <button
                  type="button"
                  onClick={() => setShowSearch(true)}
                  className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line px-2 py-1.5 text-[11px] font-medium text-brand transition-colors hover:text-brand-dark"
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
                  </svg>
                  Buscar más sesiones
                </button>
              )}
            </ContextColumn>

            <ContextColumn icon={CTX_ICONS.note} color="#7c6df2" title="Fuentes manuales" count={transcripts.length}>
              <ContextColumnList loading={loadingTranscripts} empty="Sin fuentes. Pega lo que no quedó en ninguna reunión.">
                {transcripts.map((t) => {
                  const isUrl = isUrlTranscript(t);
                  const busy = busyTranscriptId === t.id;
                  return (
                    <ContextRow
                      key={t.id}
                      icon={CTX_ICONS.note}
                      meta={
                        isUrl
                          ? `URL · ${hostnameOf(t.fileUrl!)}${t.processedAt ? ` · leída el ${fechaDeVentas(t.processedAt)}` : ""}`
                          : t.source === "UPLOADED"
                            ? "Archivo"
                            : "Manual"
                      }
                      title={t.fileName ?? undefined}
                      snippet={t.rawText.slice(0, 120)}
                      action={puedeEditar && isUrl ? { label: "Releer", onClick: () => void refetchUrl(t.id), disabled: busy } : undefined}
                      onRemove={puedeEditar && !busy ? () => void deleteTranscript(t.id) : undefined}
                      removeTitle="Quitar fuente"
                    />
                  );
                })}
              </ContextColumnList>
              {puedeEditar &&
                (showAdd ? (
                  <div className="mt-2 space-y-1.5 rounded-lg border border-line p-2">
                    <input
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      placeholder="Título, con la fecha si son notas de una reunión"
                      className="w-full rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:border-brand focus:outline-none"
                    />
                    <textarea
                      value={newContent}
                      onChange={(e) => setNewContent(e.target.value)}
                      rows={3}
                      placeholder="Pega la nota, el correo o la transcripción…"
                      className="w-full resize-y rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:border-brand focus:outline-none"
                    />
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => {
                          setShowAdd(false);
                          setNewTitle("");
                          setNewContent("");
                        }}
                        className="rounded-lg px-2 py-1 text-[11px] text-fg-muted transition-colors hover:text-fg"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={() => void addSource()}
                        disabled={savingSource || newContent.trim().length === 0}
                        className="rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-40"
                      >
                        {savingSource ? "Agregando…" : "Agregar"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="mt-2 flex gap-1.5">
                      <input
                        value={newUrl}
                        onChange={(e) => setNewUrl(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && void addUrlSource()}
                        placeholder="Leer una URL (diagnóstico web)…"
                        aria-label="URL para leer"
                        className="min-w-0 flex-1 rounded-lg border border-line bg-surface px-2 py-1.5 text-[11px] text-fg focus:border-brand focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => void addUrlSource()}
                        disabled={fetchingUrl || newUrl.trim().length === 0}
                        className="flex-shrink-0 rounded-lg border border-line bg-surface px-2.5 py-1 text-[11px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover disabled:opacity-40"
                      >
                        {fetchingUrl ? "Leyendo…" : "Leer"}
                      </button>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowAdd(true)}
                      className="mt-2 inline-flex w-full items-center justify-center gap-1 rounded-lg border border-dashed border-line px-2 py-1.5 text-[11px] font-medium text-fg-muted transition-colors hover:text-fg-secondary"
                    >
                      <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                      </svg>
                      Agregar fuente
                    </button>
                  </>
                ))}
            </ContextColumn>

            <ContextColumn icon={CTX_ICONS.note} color="#d97706" title="Preventa" count={preventaCuenta}>
              <ColumnaPreventa
                datos={preventa}
                empresa={empresa}
                puedeEditar={puedeEditar}
                ocupado={preventaOcupada}
                onUsar={onUsarPreventa}
              />
            </ContextColumn>
          </div>
        </FilaDeAlrededor>

        <FilaDeAlrededor
          titulo="Casos de uso con precio fijo"
          ayuda="Entran con su precio exacto: el agente no los escribe."
          meta={
            ucUnavailable
              ? "No disponible"
              : !ucEnabled || useCases.length === 0
                ? "Catálogo vacío"
                : marcados > 0
                  ? `${marcados} marcado${marcados === 1 ? "" : "s"}`
                  : "Ninguno marcado"
          }
          metaTono={ucUnavailable ? "atencion" : "neutro"}
          abierto={casosAbierto}
          onAlternar={() => setCasosAbierto((v) => !v)}
        >
          {ucUnavailable ? (
            <p className="rounded-lg border border-warn-line bg-warn-surface px-3 py-2 text-xs text-warn-ink">
              El catálogo de casos de uso no está disponible (falta su tabla en la base). No regeneres hasta resolverlo: la sección
              saldría vacía.
            </p>
          ) : !ucEnabled || useCases.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line bg-surface-muted px-3 py-2.5 text-xs leading-[18px] text-fg-muted">
              Todavía no hay ninguno en el catálogo para este tipo de propuesta. Cuando haya, se marcan acá (y los que eligió la preventa
              llegan marcados).{" "}
              <a href="/sales/use-cases" className="font-semibold text-brand hover:text-brand-dark">
                Ir a Casos de uso
              </a>
            </p>
          ) : (
            <ul className="space-y-1.5">
              {useCases.map((u) => (
                <li key={u.id} className={`rounded-lg border px-3 py-2.5 ${u.selected ? "border-info-line bg-info-surface" : "border-line"}`}>
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={u.selected}
                      // Todo el checklist se traba con un cambio en vuelo: dos a la vez, reordenados por la red, se pisarían.
                      disabled={!puedeEditar || ucBusyId !== null}
                      onChange={() => void patchUseCase(u.id, !u.selected)}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-fg">
                        {u.title}
                        {u.price && <span className="ml-2 rounded-full border border-line px-2 py-0.5 text-[11px] text-fg-muted">{u.price}</span>}
                        {!u.active && <span className="ml-2 text-[11px] text-warn-ink">retirado del catálogo</span>}
                      </span>
                      <span className="mt-0.5 block text-xs text-fg-muted">{u.description}</span>
                    </span>
                  </label>
                  {u.selected && (
                    <div className="ml-6 mt-2 flex items-center gap-2">
                      <span className="flex-shrink-0 text-[11px] text-fg-muted">Precio para esta propuesta:</span>
                      <input
                        defaultValue={u.priceOverride ?? ""}
                        placeholder={u.price ?? "según catálogo"}
                        disabled={!puedeEditar || ucBusyId !== null}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v !== (u.priceOverride ?? "")) void patchUseCase(u.id, true, v || null);
                        }}
                        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
                        className="w-44 rounded-lg border border-line bg-surface px-2 py-1 text-xs text-fg focus:border-brand focus:outline-none"
                      />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </FilaDeAlrededor>
      </section>

      {pie}

      <Modal
        open={showSearch}
        onClose={() => {
          setShowSearch(false);
          setSearch("");
        }}
        title="Buscar sesiones del prospecto"
        size="md"
      >
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por título…"
          className="mb-3 w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
        />
        {filtered.length === 0 ? (
          <p className="py-2 text-xs text-fg-muted">No hay más sesiones del prospecto.</p>
        ) : (
          <ul className="max-h-80 space-y-1.5 overflow-y-auto">
            {filtered.map((c) => (
              <li key={c.sessionId} className="flex items-center gap-2 rounded-lg border border-line px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-xs text-fg">{c.title || "Sin título"}</span>
                    <span className="flex-shrink-0 text-[10px] text-fg-muted">{fechaDeVentas(c.date)}</span>
                    {c.applies && (
                      <span className="flex-shrink-0 rounded-full border border-success-line bg-success-surface px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-success-ink">
                        Ventas
                      </span>
                    )}
                    {!c.hasTranscript && (
                      <span className="flex-shrink-0 rounded-full border border-warn-line bg-warn-surface px-1.5 py-0.5 text-[9px] font-medium text-warn-ink">
                        sin transcripción
                      </span>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleSession(c.sessionId, true)}
                  disabled={busyId === c.sessionId}
                  className="flex-shrink-0 text-[11px] font-semibold text-brand transition-colors hover:text-brand-dark disabled:opacity-40"
                >
                  Agregar
                </button>
              </li>
            ))}
          </ul>
        )}
      </Modal>
    </div>
  );
}
