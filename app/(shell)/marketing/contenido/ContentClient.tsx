"use client";

/**
 * Contenido — ideas de contenido como VISTA PREVIA de post social (ancho fijo
 * 552px). Flujo en 4 estados: Sugeridas → Seleccionadas → Aprobadas (+ Descartadas,
 * reversible). La tarjeta imita un post (logo Smarteam + copy + área de imagen
 * OSCURA que muestra el CONCEPTO de imagen + CTAs falsos de red social). El
 * título/tema/fecha viven en el menú "…" de la esquina; las acciones reales van
 * DEBAJO del post. Editable inline (copy/título/concepto) en Seleccionadas/
 * Aprobadas; Sugeridas/Descartadas son read-only.
 */
import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, Badge, Skeleton, ListSkeleton } from "@/components/ui";
import { useMarketingEngine } from "@/components/marketing/useMarketingEngine";
import { ideaState, type ContentIdeaState } from "@/lib/marketing/schema";

interface IdeaRow {
  id: string;
  title: string;
  copy: string;
  imageConcept: string;
  suggestedPillarName: string | null;
  pillar: { id: string; name: string } | null;
  selectedAt: string | null;
  usedAt: string | null;
  discardedAt: string | null;
  hubspotDraftAt: string | null;
  sources: Array<{
    post: { id: string; url: string | null; authorName: string | null; text: string };
  }>;
  createdAt: string;
}
interface PillarOption {
  id: string;
  name: string;
}
interface SocialChannel {
  channelKey: string;
  type: string;
  name: string;
}

// Etiqueta amable del canal a partir del type de HubSpot.
const CHANNEL_LABEL: Record<string, string> = {
  LinkedInCompanyPage: "LinkedIn",
  LinkedInProfile: "LinkedIn (perfil)",
  FacebookPage: "Facebook",
  Instagram: "Instagram",
};
const channelLabel = (c: SocialChannel) => `${CHANNEL_LABEL[c.type] ?? c.type} · ${c.name}`;

// Flujo: Publicaciones sugeridas → Aceptadas (editable) → Aprobadas (aprobar o
// enviar a HubSpot) · Descartadas (reversible, alcanzable desde cualquier paso).
// Los keys internos siguen siendo sugerida/seleccionada/aprobada/descartada.
const TABS: Array<{ key: ContentIdeaState; label: string }> = [
  { key: "sugerida", label: "Publicaciones sugeridas" },
  { key: "seleccionada", label: "Aceptadas" },
  { key: "aprobada", label: "Aprobadas" },
  { key: "descartada", label: "Descartadas" },
];

const nowIso = () => new Date().toISOString();

export default function ContentClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<ContentIdeaState>("sugerida");
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [pillars, setPillars] = useState<PillarOption[]>([]);
  const [pillarFilter, setPillarFilter] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  // Canales sociales de HubSpot (para "Enviar a HubSpot"). supported=false → sin scope social.
  const [channels, setChannels] = useState<SocialChannel[]>([]);
  const [channelsSupported, setChannelsSupported] = useState(true);

  const engine = useMarketingEngine();

  const requestIdRef = useRef(0);
  const load = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    try {
      const params = new URLSearchParams();
      params.set("state", tab);
      if (pillarFilter) params.set("pillarId", pillarFilter);
      const [ideasRes, pillarsRes] = await Promise.all([
        fetchJson<{ ideas: IdeaRow[] }>(`/api/marketing/ideas?${params.toString()}`),
        fetchJson<{ pillars: PillarOption[] }>("/api/marketing/pillars"),
      ]);
      if (requestId !== requestIdRef.current) return;
      setIdeas(ideasRes.ideas);
      setPillars(pillarsRes.pillars);
    } catch (e) {
      if (requestId !== requestIdRef.current) return;
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las ideas.");
    } finally {
      if (requestId === requestIdRef.current) setLoading(false);
    }
  }, [toast, pillarFilter, tab]);
  useEffect(() => {
    load();
  }, [load]);

  // Canales sociales de HubSpot: una vez al montar (portal-wide, no por tarjeta).
  useEffect(() => {
    if (!canEdit) return;
    fetchJson<{ supported: boolean; channels: SocialChannel[] }>("/api/marketing/social-channels")
      .then((r) => {
        setChannelsSupported(r.supported);
        setChannels(r.channels ?? []);
      })
      .catch(() => setChannelsSupported(false)); // silencioso: la feature simplemente no aparece
  }, [canEdit]);

  const wasEngineBusyRef = useRef(false);
  const engineBusy = engine.busy;
  useEffect(() => {
    if (wasEngineBusyRef.current && !engineBusy) load();
    wasEngineBusyRef.current = engineBusy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineBusy]);

  const patchState = async (
    id: string,
    body: Record<string, boolean>,
    optimistic: Partial<IdeaRow>,
    msg: string,
  ) => {
    if (busyId) return;
    setBusyId(id);
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, ...optimistic } : i)));
    try {
      await fetchJson(`/api/marketing/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.info(msg);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
      load();
    } finally {
      setBusyId(null);
    }
  };

  const accept = (id: string) => patchState(id, { selected: true }, { selectedAt: nowIso() }, "Aceptada.");
  const approve = (id: string) => patchState(id, { used: true }, { usedAt: nowIso() }, "Aprobada.");
  const unapprove = (id: string) => patchState(id, { used: false }, { usedAt: null }, "Reabierta en Aceptadas.");
  const discard = (id: string) => patchState(id, { discarded: true }, { discardedAt: nowIso() }, "Descartada.");
  const restore = (id: string) => patchState(id, { discarded: false }, { discardedAt: null }, "Restaurada.");

  const saveField = async (id: string, field: "title" | "copy" | "imageConcept", value: string) => {
    const prev = ideas.find((i) => i.id === id)?.[field];
    if (value === prev) return;
    setIdeas((cur) => cur.map((i) => (i.id === id ? { ...i, [field]: value } : i)));
    try {
      await fetchJson(`/api/marketing/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar el cambio.");
      load();
    }
  };

  const adjust = async (id: string, instruction: string): Promise<string | null> => {
    try {
      const r = await fetchJson<{ copy: string }>(`/api/marketing/ideas/${id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instruction }),
      });
      return r.copy;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo ajustar con IA.");
      return null;
    }
  };

  // Enviar la idea a HubSpot como borrador social (uno por canal elegido).
  const sendHubspotDraft = async (id: string, channelKeys: string[]): Promise<boolean> => {
    try {
      const r = await fetchJson<{ created: number; total: number }>(
        `/api/marketing/ideas/${id}/hubspot-draft`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ channelKeys }) },
      );
      const partial = r.created < r.total ? ` (${r.created}/${r.total} canales)` : "";
      toast.success(`Borrador${r.created === 1 ? "" : "es"} creado${r.created === 1 ? "" : "s"} en HubSpot${partial}. Revisalo en el compositor social.`);
      // Enviar a HubSpot también APRUEBA (usedAt): la publicación pasa a Aprobadas.
      setIdeas((cur) => cur.map((i) => (i.id === id ? { ...i, hubspotDraftAt: nowIso(), usedAt: i.usedAt ?? nowIso() } : i)));
      load();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo enviar a HubSpot.");
      return false;
    }
  };

  const remove = async (id: string) => {
    try {
      await fetchJson(`/api/marketing/ideas/${id}`, { method: "DELETE" });
      toast.info("Idea borrada definitivamente.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copiado al portapapeles.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  const lastRun = engine.lastRun;
  const visibleIdeas = ideas.filter((i) => ideaState(i) === tab);

  const emptyCopy: Record<ContentIdeaState, { title: string; description: string }> = {
    sugerida: { title: "No hay publicaciones sugeridas", description: "Generá la primera tanda con el botón de arriba." },
    seleccionada: {
      title: "No hay publicaciones aceptadas",
      description: "Aceptá una publicación desde las sugeridas para trabajarla (editarla y ajustarla con IA).",
    },
    aprobada: {
      title: "No hay publicaciones aprobadas",
      description: "Desde Aceptadas, aprobá o enviá a HubSpot una publicación cuando esté lista.",
    },
    descartada: { title: "No hay publicaciones descartadas", description: "Las que descartes aparecen acá (podés restaurarlas)." },
  };

  return (
    <div className="space-y-4">
      {/* Barra del motor */}
      <div className="rounded-2xl border border-line bg-surface p-4 flex items-center justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          {engine.loading ? (
            // Skeleton inline: reserva la línea de estado del motor (misma altura que el text-sm).
            <Skeleton className="h-3 w-40 my-1" />
          ) : (
            <p className="text-sm font-medium text-fg">
              {lastRun
                ? `Última corrida: ${new Date(lastRun.createdAt).toLocaleString("es-CR", { dateStyle: "short", timeStyle: "short" })}${
                    lastRun.status === "DONE" && lastRun.contentIdeasCount != null
                      ? ` · ${lastRun.contentIdeasCount} idea(s) generadas`
                      : lastRun.status === "ERROR"
                        ? " · falló"
                        : lastRun.status === "RUNNING"
                          ? " · en curso"
                          : ""
                  }`
                : "Todavía no corriste el motor."}
            </p>
          )}
          <Link href="/marketing/generacion" className="text-xs text-brand hover:underline">
            Ver detalle del motor →
          </Link>
        </div>
        {canEdit && (
          <button
            onClick={() => engine.startRun("CHAIN")}
            disabled={engine.busy}
            className="flex-shrink-0 px-4 py-2 text-sm rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
          >
            {engine.busy ? (engine.runningPhase ?? "En curso…") : "Generar ideas nuevas"}
          </button>
        )}
      </div>

      {/* Tabs de estado + filtro por tema */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex gap-1 flex-wrap">
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
        <select
          value={pillarFilter}
          onChange={(e) => setPillarFilter(e.target.value)}
          className="px-3 py-1.5 text-xs bg-surface border border-line rounded-lg text-fg"
        >
          <option value="">Todos los temas</option>
          {pillars.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        // Skeleton estructural: reserva el área de la lista de publicaciones
        // (filas rounded-xl) para que al llegar las ideas nada salte.
        <ListSkeleton rows={6} lines={2} />
      ) : visibleIdeas.length === 0 ? (
        <EmptyState variant="dashed" title={emptyCopy[tab].title} description={emptyCopy[tab].description} />
      ) : (
        <ul className="flex flex-wrap gap-4 justify-center lg:justify-start">
          {visibleIdeas.map((idea) => (
            <IdeaCard
              key={idea.id}
              idea={idea}
              canEdit={canEdit}
              busy={busyId === idea.id}
              onAccept={() => accept(idea.id)}
              onApprove={() => approve(idea.id)}
              onUnapprove={() => unapprove(idea.id)}
              onDiscard={() => discard(idea.id)}
              onRestore={() => restore(idea.id)}
              onDelete={() => setConfirmDeleteId(idea.id)}
              onSaveField={(field, value) => saveField(idea.id, field, value)}
              onAdjust={(instruction) => adjust(idea.id, instruction)}
              onCopy={copyToClipboard}
              channels={channels}
              channelsSupported={channelsSupported}
              onSendHubspot={(channelKeys) => sendHubspotDraft(idea.id, channelKeys)}
            />
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
        title="¿Borrar definitivamente?"
        description="Se borra para siempre. Si solo querés sacarla de la vista, usá Descartar (es reversible)."
        confirmLabel="Borrar"
      />
    </div>
  );
}

// ── Tarjeta de idea (vista previa de post, ancho fijo 552px) ────────────────────

function IdeaCard({
  idea,
  canEdit,
  busy,
  onAccept,
  onApprove,
  onUnapprove,
  onDiscard,
  onRestore,
  onDelete,
  onSaveField,
  onAdjust,
  onCopy,
  channels,
  channelsSupported,
  onSendHubspot,
}: {
  idea: IdeaRow;
  canEdit: boolean;
  busy: boolean;
  onAccept: () => void;
  onApprove: () => void;
  onUnapprove: () => void;
  onDiscard: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onSaveField: (field: "title" | "copy" | "imageConcept", value: string) => void;
  onAdjust: (instruction: string) => Promise<string | null>;
  onCopy: (text: string) => void;
  channels: SocialChannel[];
  channelsSupported: boolean;
  onSendHubspot: (channelKeys: string[]) => Promise<boolean>;
}) {
  const state = ideaState(idea);
  const editable = canEdit && (state === "seleccionada" || state === "aprobada");
  const [adjusting, setAdjusting] = useState(false);
  // "Ver copy completo": el copy se recorta a 3 líneas; el toggle SIEMPRE se
  // ofrece (sin heurístico de longitud) — un conteo de caracteres no predice
  // cuántas líneas ocupa un texto que envuelve por ancho real de viewport.
  const [showFull, setShowFull] = useState(false);
  const clampCls = showFull ? "" : "line-clamp-3";

  const tag = idea.pillar ? (
    <Badge size="xs">{idea.pillar.name}</Badge>
  ) : idea.suggestedPillarName ? (
    <span className="text-[11px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/30">
      Tema sugerido: {idea.suggestedPillarName}
    </span>
  ) : (
    <span className="text-[11px] text-fg-muted">Sin tema</span>
  );

  return (
    <li className={`w-[552px] max-w-full ${state === "descartada" ? "opacity-60" : ""}`}>
      {/* La "publicación" — vista previa estilo post (ancho 552px, padding 16px) */}
      <article className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
        {/* Header: logo Smarteam + nombre + menú "…" (metadata) */}
        <div className="flex items-center gap-2.5">
          {/* Avatar: círculo navy con el isotipo (SVG vectorial, nítido a cualquier tamaño) */}
          <div className="w-9 h-9 rounded-full bg-[#0d2340] flex items-center justify-center flex-shrink-0" aria-label="Smarteam">
            <SmarteamMark className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-fg leading-tight">Smarteam</p>
            <p className="text-[11px] text-fg-muted leading-tight">
              Justo ahora · 🌐
              {state === "seleccionada" && " · Aceptada"}
              {state === "aprobada" && " · Aprobada"}
              {idea.hubspotDraftAt && " · ✓ Borrador en HubSpot"}
              {state === "descartada" && " · Descartada"}
            </p>
          </div>
          <InfoPopover title={idea.title} tag={tag} date={new Date(idea.createdAt).toLocaleDateString("es-CR")} />
        </div>

        {/* Copy del post (3 líneas en lectura + "… más"; editable al seleccionar) */}
        <div>
          {editable && !adjusting ? (
            <InlineEditable
              value={idea.copy}
              editable
              onSave={(v) => onSaveField("copy", v)}
              multiline
              textClass={`text-sm text-fg-secondary whitespace-pre-wrap leading-relaxed ${clampCls}`}
              placeholder="Escribí el copy…"
            />
          ) : (
            <p className={`text-sm text-fg-secondary whitespace-pre-wrap leading-relaxed ${clampCls}`}>{idea.copy}</p>
          )}
          <button
            onClick={() => setShowFull((s) => !s)}
            className="mt-1 text-xs font-medium text-fg-muted hover:text-fg-secondary"
          >
            {showFull ? "Ver menos" : "… más"}
          </button>
        </div>

        {/* Área de imagen: OSCURA + letras claras, más cuadrada — muestra el concepto */}
        <div className="rounded-xl bg-[#0d2340] min-h-[220px] flex flex-col items-center justify-center text-center gap-2 p-4 overflow-y-auto">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-[#6f8bb0]">🖼 Concepto de imagen</span>
          {editable ? (
            <InlineEditable
              value={idea.imageConcept}
              editable
              dark
              onSave={(v) => onSaveField("imageConcept", v)}
              multiline
              textClass="text-sm text-[#e6edf7] whitespace-pre-wrap w-full"
              placeholder="Describí la imagen…"
            />
          ) : (
            <p className="text-sm text-[#e6edf7] whitespace-pre-wrap">{idea.imageConcept}</p>
          )}
        </div>

        {/* CTAs falsos del post (decorativos) */}
        <div className="flex items-center justify-around border-t border-line pt-2.5 text-fg-muted text-xs font-medium">
          <span className="flex items-center gap-1.5">👍 Me gusta</span>
          <span className="flex items-center gap-1.5">💬 Comentario</span>
          <span className="flex items-center gap-1.5">↗ Compartir</span>
        </div>
      </article>

      {/* Acciones reales (gestión de la idea) — DEBAJO del post */}
      {canEdit && (
        <div className="flex items-center gap-2 flex-wrap mt-2 px-1">
          {/* Enviar a HubSpot: disponible en Aceptadas y Aprobadas (si el scope social está activo).
              Desde Aceptadas, enviar TAMBIÉN aprueba → pasa a Aprobadas. */}
          {(state === "seleccionada" || state === "aprobada") && channelsSupported && channels.length > 0 && (
            <HubspotDraftPopover channels={channels} alreadySent={!!idea.hubspotDraftAt} onSend={onSendHubspot} />
          )}
          {state === "sugerida" && (
            <>
              <button onClick={onAccept} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90">
                Aceptar
              </button>
              <button onClick={onDiscard} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-muted hover:text-fg-secondary disabled:opacity-40">
                Descartar
              </button>
            </>
          )}
          {state === "seleccionada" && (
            <>
              <button onClick={onApprove} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90">
                Aprobar
              </button>
              <button onClick={onDiscard} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-muted hover:text-fg-secondary disabled:opacity-40">
                Descartar
              </button>
            </>
          )}
          {state === "aprobada" && (
            <>
              <button onClick={onUnapprove} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-muted hover:text-fg-secondary disabled:opacity-40">
                Reabrir
              </button>
              <button onClick={onDiscard} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-muted hover:text-fg-secondary disabled:opacity-40">
                Descartar
              </button>
            </>
          )}
          {state === "descartada" && (
            <>
              <button onClick={onRestore} disabled={busy} className="px-3 py-1.5 text-xs rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90">
                Restaurar
              </button>
              <button onClick={onDelete} className="px-3 py-1.5 text-xs rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10">
                Borrar definitivo
              </button>
            </>
          )}
          {editable && <AdjustPopover onAdjust={onAdjust} onApplied={(copy) => onSaveField("copy", copy)} onBusyChange={setAdjusting} />}
          <button onClick={() => onCopy(idea.copy)} className="px-3 py-1.5 text-xs rounded-lg border border-line text-fg-secondary hover:bg-surface-hover">
            Copiar copy
          </button>
        </div>
      )}
    </li>
  );
}

// ── Menú "…" con la metadata (título / tema / fecha) ────────────────────────────

function InfoPopover({ title, tag, date }: { title: string; tag: React.ReactNode; date: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  return (
    <div className="relative flex-shrink-0" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="Detalles de la publicación (título, tema, fecha)"
        aria-expanded={open}
        className="w-7 h-7 rounded-full text-fg-muted hover:text-fg-secondary hover:bg-surface-hover flex items-center justify-center"
      >
        <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
          <circle cx="5" cy="12" r="1.6" />
          <circle cx="12" cy="12" r="1.6" />
          <circle cx="19" cy="12" r="1.6" />
        </svg>
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-1 z-20 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl space-y-2 text-left">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-fg-muted">Título</p>
            <p className="text-xs text-fg">{title}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-fg-muted mb-0.5">Tema</p>
            <div className="text-xs">{tag}</div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-fg-muted">Fecha</p>
            <p className="text-xs text-fg-secondary">{date}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Ajustar con IA (popover: presets + instrucción libre) ───────────────────────

const ADJUST_PRESETS: Array<{ label: string; instruction: string }> = [
  { label: "Más corto", instruction: "Hacelo más corto y conciso, sin perder el mensaje central." },
  { label: "Más largo", instruction: "Desarrollalo un poco más, con más detalle y contexto." },
  { label: "Otro tono", instruction: "Reescribilo con un tono distinto (más cercano y conversacional)." },
];

function AdjustPopover({
  onAdjust,
  onApplied,
  onBusyChange,
}: {
  onAdjust: (instruction: string) => Promise<string | null>;
  onApplied: (copy: string) => void;
  onBusyChange: (busy: boolean) => void;
}) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (text: string) => {
    if (!text.trim() || busy) return;
    setBusy(true);
    onBusyChange(true);
    try {
      const copy = await onAdjust(text.trim());
      if (copy) {
        onApplied(copy);
        toast.success("Copy ajustado con IA.");
        setInstruction("");
        setOpen(false);
      }
    } finally {
      setBusy(false);
      onBusyChange(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title="Ajustar el copy con IA"
        aria-expanded={open}
        className="px-3 py-1.5 text-xs rounded-lg border border-brand/30 text-brand hover:bg-brand/5"
      >
        ✨ Ajustar
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-20 w-72 rounded-xl border border-line bg-surface p-2 shadow-xl">
          <div className="flex flex-wrap gap-1 mb-2">
            {ADJUST_PRESETS.map((p) => (
              <button
                key={p.label}
                onClick={() => run(p.instruction)}
                disabled={busy}
                className="px-2 py-1 text-[11px] rounded-lg border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-40"
              >
                {p.label}
              </button>
            ))}
          </div>
          <textarea
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            placeholder="O escribí una instrucción (ej. más orientado a ventas)"
            rows={2}
            className="w-full bg-surface-muted border border-line rounded-lg px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-brand/50 resize-y"
          />
          <div className="flex justify-end gap-2 mt-2">
            <button onClick={() => setOpen(false)} className="px-2.5 py-1 text-[11px] rounded-lg text-fg-muted hover:text-fg-secondary">
              Cancelar
            </button>
            <button
              onClick={() => run(instruction)}
              disabled={busy || !instruction.trim()}
              className="px-2.5 py-1 text-[11px] rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Ajustando…" : "Aplicar"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Enviar a HubSpot como borrador social (popover: elegir canal[es]) ───────────

function HubspotDraftPopover({
  channels,
  alreadySent,
  onSend,
}: {
  channels: SocialChannel[];
  alreadySent: boolean;
  onSend: (channelKeys: string[]) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  // Default: LinkedIn marcado si existe; si no, el primer canal.
  const [selected, setSelected] = useState<Set<string>>(() => {
    const li = channels.find((c) => /linkedin/i.test(c.type));
    return new Set(li ? [li.channelKey] : channels[0] ? [channels[0].channelKey] : []);
  });
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);

  const toggle = (key: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const send = async () => {
    if (selected.size === 0 || busy) return;
    setBusy(true);
    const ok = await onSend([...selected]);
    setBusy(false);
    if (ok) setOpen(false);
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="px-3 py-1.5 text-xs rounded-lg border border-brand/30 text-brand hover:bg-brand/5"
      >
        {alreadySent ? "Reenviar a HubSpot" : "Enviar a HubSpot"}
      </button>
      {open && (
        <div className="absolute left-0 bottom-full mb-1 z-20 w-64 rounded-xl border border-line bg-surface p-3 shadow-xl">
          <p className="text-[11px] font-semibold text-fg-muted mb-2">Crear borrador en HubSpot en:</p>
          <div className="space-y-1.5 mb-3">
            {channels.map((c) => (
              <label key={c.channelKey} className="flex items-center gap-2 text-xs text-fg-secondary cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(c.channelKey)}
                  onChange={() => toggle(c.channelKey)}
                  className="accent-brand"
                />
                {channelLabel(c)}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <button onClick={() => setOpen(false)} className="px-2.5 py-1 text-[11px] rounded-lg text-fg-muted hover:text-fg-secondary">
              Cancelar
            </button>
            <button
              onClick={send}
              disabled={busy || selected.size === 0}
              className="px-2.5 py-1 text-[11px] rounded-lg bg-brand text-white disabled:opacity-40 hover:opacity-90"
            >
              {busy ? "Enviando…" : "Crear borrador"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Isotipo Smarteam (dos cápsulas diagonales teal/azul) ────────────────────────

function SmarteamMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      {/* cápsula teal + su cap azul arriba */}
      <line x1="52" y1="30" x2="30" y2="60" stroke="#42E4B3" strokeWidth="20" strokeLinecap="round" />
      <circle cx="52" cy="30" r="12" fill="#168CF6" />
      {/* cápsula azul + su cap teal abajo */}
      <line x1="72" y1="45" x2="50" y2="75" stroke="#168CF6" strokeWidth="20" strokeLinecap="round" />
      <circle cx="50" cy="75" r="12" fill="#42E4B3" />
    </svg>
  );
}

// ── Editor inline (click-to-edit, guarda en blur si cambió y no vacío) ───────────
// `dark`: variante para el área de imagen oscura (textarea de fondo oscuro).

function InlineEditable({
  value,
  editable,
  onSave,
  multiline = false,
  textClass,
  placeholder,
  dark = false,
}: {
  value: string;
  editable: boolean;
  onSave: (v: string) => void;
  multiline?: boolean;
  textClass: string;
  placeholder?: string;
  dark?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (!editable) {
    return <div className={textClass}>{value}</div>;
  }

  if (!editing) {
    return (
      <div
        onClick={() => {
          setDraft(value);
          setEditing(true);
        }}
        title="Clic para editar"
        className={`${textClass} cursor-text rounded -mx-1 px-1 transition-colors ${dark ? "hover:bg-white/5" : "hover:bg-surface-hover"}`}
      >
        {value || <span className={`italic ${dark ? "text-[#6f8bb0]" : "text-fg-muted"}`}>{placeholder ?? "Clic para editar"}</span>}
      </div>
    );
  }

  return (
    <textarea
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        const t = draft.trim();
        if (t && t !== value) onSave(t);
        setEditing(false);
      }}
      autoFocus
      rows={multiline ? 6 : 2}
      className={
        dark
          ? "w-full bg-[#0a1c33] border border-[#24405f] rounded-lg px-2 py-1.5 text-sm text-[#e6edf7] focus:outline-none focus:border-brand resize-y"
          : "w-full bg-surface-muted border border-line rounded-lg px-2 py-1.5 text-xs text-fg focus:outline-none focus:border-brand/50 focus:ring-1 focus:ring-brand/20 resize-y"
      }
    />
  );
}
