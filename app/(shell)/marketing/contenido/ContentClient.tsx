"use client";

/**
 * Publicaciones (/marketing/contenido) — lo que propone el agente para LinkedIn (rediseño del 2026-10-04, sistema
 * «Nexus · interfaz interna»). Antes eran tarjetas de 552 px una debajo de otra: con 75 sugeridas, una pared que
 * nadie revisaba (medido ese día: la sugerida más vieja era del 3 jul). Ahora es una lista con la publicación elegida
 * al lado, como una bandeja:
 *
 *  - Pestañas por estado (Sugeridas → Aceptadas → Aprobadas · Descartadas) con su cuenta, y el tipo como segmentado.
 *  - En Sugeridas, las que dicen casi lo mismo van juntas en una fila (lib/marketing/parecidas.ts): 15 de las 75
 *    eran el mismo ángulo. Desde el detalle se ven todas o se descartan las otras de un saque.
 *  - Atajos para revisar rápido: A acepta, D descarta, ↓/↑ se mueve. Solo para quien puede editar.
 *  - Los estados y la regla «por equipo» (solo Marketing publica para Smarteam) no cambian.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import {
  Alert,
  ConfirmDialog,
  EmptyState,
  ListSkeleton,
  PageHeader,
  Segmentado,
  Select,
  SkeletonPanel,
  SkeletonText,
  Tabs,
} from "@/components/ui";
import { FranjaDeSugerencias, IconoDeSugerencia } from "@/components/ui/sistema";
import { useMarketingEngine } from "@/components/marketing/useMarketingEngine";
import PublicacionDetalle from "@/components/marketing/PublicacionDetalle";
import { BotonClaro, Chip, ChipGris, ChipHecho, Rotulo, diaYMesCr } from "@/components/marketing/piezas";
import type { CampoEditable, CanalSocial, ConteosDeIdeas, IdeaRow } from "@/components/marketing/tipos";
import { useMe } from "@/hooks/useMe";
import { agruparParecidas } from "@/lib/marketing/parecidas";
import { cn } from "@/lib/cn";
import {
  ideaState,
  canPublishForSmarteam,
  JOURNEY_STAGE_META,
  MARKETING_JOURNEY_STAGES,
  type ContentIdeaState,
  type MarketingJourneyStageValue,
  type MarketingPostTypeValue,
  type MarketingUsageTargetValue,
} from "@/lib/marketing/marketing-ui";

interface Tema {
  id: string;
  name: string;
  isCampaign: boolean;
}

const ESTADOS: Array<{ key: ContentIdeaState; label: string }> = [
  { key: "sugerida", label: "Sugeridas" },
  { key: "seleccionada", label: "Aceptadas" },
  { key: "aprobada", label: "Aprobadas" },
  { key: "descartada", label: "Descartadas" },
];

type Tipo = "todas" | MarketingPostTypeValue;

const VACIO: Record<ContentIdeaState, { title: string; description: string }> = {
  sugerida: {
    title: "No hay publicaciones sugeridas",
    description: "El agente propone una tanda cada viernes a las 6:00. También puedes generarla ahora.",
  },
  seleccionada: {
    title: "No hay publicaciones aceptadas",
    description: "Acepta una sugerida para trabajarla: editarla y ajustarla con IA.",
  },
  aprobada: {
    title: "No hay publicaciones aprobadas",
    description: "Desde Aceptadas, aprueba una o envíala a HubSpot cuando esté lista.",
  },
  descartada: {
    title: "No hay publicaciones descartadas",
    description: "Las que descartes aparecen acá, y puedes restaurarlas.",
  },
};

const ahora = () => new Date().toISOString();

/** Una fila de la lista: una publicación, o la primera de un grupo de parecidas. */
interface Fila {
  idea: IdeaRow;
  grupo: IdeaRow[];
  /** true si es una de las parecidas que se ven al abrir el grupo. */
  miembro: boolean;
}

export default function ContentClient({ canEdit, proximaTanda }: { canEdit: boolean; proximaTanda: string }) {
  const toast = useToast();
  const me = useMe();
  const canChooseSmarteam = canPublishForSmarteam(me?.role);
  const engine = useMarketingEngine();

  const [tab, setTab] = useState<ContentIdeaState>("sugerida");
  const [tipo, setTipo] = useState<Tipo>("todas");
  const [tema, setTema] = useState("");
  const [etapa, setEtapa] = useState<"" | MarketingJourneyStageValue>("");
  const [ideas, setIdeas] = useState<IdeaRow[]>([]);
  const [conteos, setConteos] = useState<ConteosDeIdeas | null>(null);
  const [temas, setTemas] = useState<Tema[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [selId, setSelId] = useState<string | null>(null);
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const [confirmBorrar, setConfirmBorrar] = useState<string | null>(null);
  const [confirmOtras, setConfirmOtras] = useState<string[] | null>(null);
  const [canales, setCanales] = useState<CanalSocial[]>([]);
  const [canalesOk, setCanalesOk] = useState(true);

  const pedido = useRef(0);
  const load = useCallback(async () => {
    const id = ++pedido.current;
    try {
      const params = new URLSearchParams({ state: tab });
      if (tipo !== "todas") params.set("postType", tipo);
      if (tema) params.set("pillarId", tema);
      // La etapa es solo de los posts de empresa: con «Perfil personal» no se manda.
      if (etapa && tipo !== "PERSONA") params.set("stage", etapa);
      const [r, t] = await Promise.all([
        fetchJson<{ ideas: IdeaRow[]; counts: ConteosDeIdeas }>(`/api/marketing/ideas?${params}`),
        fetchJson<{ pillars: Tema[] }>("/api/marketing/pillars"),
      ]);
      if (id !== pedido.current) return;
      setIdeas(r.ideas);
      setConteos(r.counts);
      setTemas(t.pillars);
    } catch (e) {
      if (id !== pedido.current) return;
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las publicaciones.");
    } finally {
      if (id === pedido.current) setLoading(false);
    }
  }, [toast, tab, tipo, tema, etapa]);
  useEffect(() => {
    load();
  }, [load]);

  // Canales sociales de HubSpot: una vez al montar. Sin el permiso social, enviar a HubSpot no aparece.
  useEffect(() => {
    if (!canEdit) return;
    fetchJson<{ supported: boolean; channels: CanalSocial[] }>("/api/marketing/social-channels")
      .then((r) => {
        setCanalesOk(r.supported);
        setCanales(r.channels ?? []);
      })
      .catch(() => setCanalesOk(false));
  }, [canEdit]);

  // Al terminar una tanda, la lista se recarga sola.
  const corriendoAntes = useRef(false);
  useEffect(() => {
    if (corriendoAntes.current && !engine.busy) load();
    corriendoAntes.current = engine.busy;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.busy]);

  // ── La lista ──────────────────────────────────────────────────────────────────
  const visibles = useMemo(() => ideas.filter((i) => ideaState(i) === tab), [ideas, tab]);
  const grupos = useMemo(
    () => (tab === "sugerida" ? agruparParecidas(visibles, (i) => i.title) : visibles.map((i) => [i])),
    [visibles, tab],
  );
  const filas = useMemo<Fila[]>(() => {
    const out: Fila[] = [];
    for (const g of grupos) {
      out.push({ idea: g[0], grupo: g, miembro: false });
      if (g.length > 1 && abiertos.has(g[0].id)) for (const m of g.slice(1)) out.push({ idea: m, grupo: g, miembro: true });
    }
    return out;
  }, [grupos, abiertos]);
  const elegida = visibles.find((i) => i.id === selId) ?? filas[0]?.idea ?? null;
  const grupoElegido = elegida ? (grupos.find((g) => g.some((i) => i.id === elegida.id)) ?? [elegida]) : [];
  const repartidas = grupos.filter((g) => g.length > 1).length;

  /** La que queda elegida después de que `id` sale de la pestaña: la siguiente, o la anterior si era la última. */
  const siguienteA = (id: string): string | null => {
    const i = filas.findIndex((f) => f.idea.id === id);
    return filas[i + 1]?.idea.id ?? filas[i - 1]?.idea.id ?? null;
  };

  // ── Acciones ──────────────────────────────────────────────────────────────────
  const cambiar = async (id: string, body: Record<string, boolean | string>, optimista: Partial<IdeaRow>, msg: string, saleDeLaPestana: boolean) => {
    if (busyId) return;
    setBusyId(id);
    if (saleDeLaPestana) setSelId(siguienteA(id));
    setIdeas((prev) => prev.map((i) => (i.id === id ? { ...i, ...optimista } : i)));
    try {
      await fetchJson(`/api/marketing/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.info(msg);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    } finally {
      setBusyId(null);
      load();
    }
  };

  const aceptar = (id: string, destino: MarketingUsageTargetValue) =>
    cambiar(
      id,
      { selected: true, acceptedFor: destino },
      { selectedAt: ahora(), acceptedFor: destino, acceptedByName: me?.name ?? null },
      destino === "SMARTEAM" ? "Aceptada para Smarteam. Está en Aceptadas." : "Aceptada para tu perfil. Está en Aceptadas.",
      true,
    );
  const aprobar = (id: string) => cambiar(id, { used: true }, { usedAt: ahora() }, "Aprobada.", true);
  const reabrir = (id: string) => cambiar(id, { used: false }, { usedAt: null }, "Volvió a Aceptadas.", true);
  const descartar = (id: string) => cambiar(id, { discarded: true }, { discardedAt: ahora() }, "Descartada. Puedes restaurarla.", true);
  const restaurar = (id: string) => cambiar(id, { discarded: false }, { discardedAt: null }, "Restaurada.", true);

  const guardarCampo = async (id: string, campo: CampoEditable, valor: string) => {
    const antes = ideas.find((i) => i.id === id)?.[campo];
    if (valor === antes) return;
    setIdeas((cur) => cur.map((i) => (i.id === id ? { ...i, [campo]: valor } : i)));
    try {
      await fetchJson(`/api/marketing/ideas/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [campo]: valor }),
      });
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar el cambio.");
      load();
    }
  };

  const ajustar = async (id: string, instruction: string): Promise<string | null> => {
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

  const enviarAHubspot = async (id: string, channelKeys: string[]): Promise<boolean> => {
    try {
      const r = await fetchJson<{ created: number; total: number }>(`/api/marketing/ideas/${id}/hubspot-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ channelKeys }),
      });
      const parcial = r.created < r.total ? ` (${r.created} de ${r.total} canales)` : "";
      toast.success(`${r.created === 1 ? "Borrador creado" : "Borradores creados"} en HubSpot${parcial}. Revísalo en el compositor social.`);
      // Enviar a HubSpot también aprueba: desde Aceptadas, pasa a Aprobadas.
      if (tab === "seleccionada") setSelId(siguienteA(id));
      setIdeas((cur) => cur.map((i) => (i.id === id ? { ...i, hubspotDraftAt: ahora(), usedAt: i.usedAt ?? ahora() } : i)));
      load();
      return true;
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo enviar a HubSpot.");
      return false;
    }
  };

  const borrar = async (id: string) => {
    setSelId(siguienteA(id));
    try {
      await fetchJson(`/api/marketing/ideas/${id}`, { method: "DELETE" });
      toast.info("Publicación borrada para siempre.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    } finally {
      load();
    }
  };

  const descartarVarias = async (ids: string[]) => {
    const quedan = new Set(ids);
    setIdeas((cur) => cur.map((i) => (quedan.has(i.id) ? { ...i, discardedAt: ahora() } : i)));
    try {
      const r = await fetchJson<{ descartadas: number }>("/api/marketing/ideas/descartar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      toast.info(`${r.descartadas === 1 ? "Se descartó 1" : `Se descartaron ${r.descartadas}`}. Están en Descartadas.`);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron descartar.");
    } finally {
      load();
    }
  };

  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Texto copiado.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };

  // ── Atajos de teclado (Sugeridas, para quien puede editar) ───────────────────
  const atajos = useRef<(e: KeyboardEvent) => void>(() => {});
  atajos.current = (e: KeyboardEvent) => {
    if (e.metaKey || e.ctrlKey || e.altKey || !elegida) return;
    const el = e.target as HTMLElement | null;
    if (el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName))) return;
    if (document.querySelector('[role="dialog"]')) return;
    const i = filas.findIndex((f) => f.idea.id === elegida.id);
    if (e.key === "ArrowDown" || e.key === "j") {
      const sig = filas[i + 1];
      if (sig) {
        e.preventDefault();
        setSelId(sig.idea.id);
      }
    } else if (e.key === "ArrowUp" || e.key === "k") {
      const ant = filas[i - 1];
      if (ant) {
        e.preventDefault();
        setSelId(ant.idea.id);
      }
    } else if (canEdit && tab === "sugerida" && !busyId) {
      const principal: MarketingUsageTargetValue =
        canChooseSmarteam && elegida.postType !== "PERSONA" ? "SMARTEAM" : "PERSONAL";
      if (e.key === "a" || e.key === "A") {
        e.preventDefault();
        aceptar(elegida.id, principal);
      } else if (e.key === "d" || e.key === "D") {
        e.preventDefault();
        descartar(elegida.id);
      }
    }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => atajos.current(e);
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // ── Textos ────────────────────────────────────────────────────────────────────
  const sinFiltros = tipo === "todas" && !tema && !etapa;
  const masVieja = tab === "sugerida" && sinFiltros && visibles.length > 0 ? visibles[visibles.length - 1].createdAt : null;
  const totalSugeridas = conteos?.sugerida.total ?? visibles.length;
  const cuentaTipo = (k: Tipo) => (conteos ? (k === "todas" ? conteos[tab].total : conteos[tab][k]) : undefined);

  const meta = (i: IdeaRow): string => {
    const temaTxt = i.pillar?.name ?? (i.suggestedPillarName ? `${i.suggestedPillarName} (propuesto)` : "Sin tema");
    switch (ideaState(i)) {
      case "sugerida":
        return `${i.postType === "PERSONA" ? "Perfil personal" : "Página de empresa"} · ${temaTxt} · ${diaYMesCr(i.createdAt)}`;
      case "seleccionada":
        return i.acceptedFor
          ? `${i.acceptedByName ?? "Alguien del equipo"} · ${i.acceptedFor === "SMARTEAM" ? "para Smarteam" : "uso personal"}${i.selectedAt ? ` · ${diaYMesCr(i.selectedAt)}` : ""}`
          : `Sin destino anotado${i.selectedAt ? ` · ${diaYMesCr(i.selectedAt)}` : ""}`;
      case "aprobada":
        return `Aprobada${i.usedAt ? ` el ${diaYMesCr(i.usedAt)}` : ""} · ${temaTxt}`;
      default:
        return `${temaTxt} · ${diaYMesCr(i.createdAt)}`;
    }
  };

  return (
    <>
      <PageHeader
        title="Publicaciones"
        description="Lo que propone el agente cada viernes para LinkedIn: la página de Smarteam y los perfiles personales del equipo. Nada se publica solo."
        badges={<Chip>Próxima tanda: {proximaTanda}</Chip>}
        action={
          canEdit ? (
            <BotonClaro onClick={() => engine.startRun("CHAIN")} disabled={engine.busy}>
              {engine.busy ? "Generando…" : "Generar ahora"}
            </BotonClaro>
          ) : undefined
        }
      />

      <div className="space-y-5">
        {engine.busy && (
          <Alert variant="info">
            El agente está armando la tanda{engine.runningPhase ? ` · ${engine.runningPhase}` : ""}. Las nuevas aparecen acá cuando termine.
          </Alert>
        )}
        {!engine.busy && engine.lastRun?.status === "ERROR" && (
          <Alert variant="danger" action={<Link href="/marketing/generacion" className="text-xs font-semibold text-danger-ink underline">Ver en Generación</Link>}>
            La última tanda falló: {engine.lastRun.error ?? "sin detalle"}.
          </Alert>
        )}

        <Tabs
          aria-label="Estado de las publicaciones"
          value={tab}
          onChange={(k) => {
            setTab(k);
            setSelId(null);
            setAbiertos(new Set());
            setLoading(true);
          }}
          items={ESTADOS.map((e) => ({ key: e.key, label: e.label, count: conteos?.[e.key].total }))}
        />

        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Rotulo>Tipo</Rotulo>
            <Segmentado<Tipo>
              etiqueta="Tipo de publicación"
              valor={tipo}
              onCambio={(k) => {
                setTipo(k);
                setSelId(null);
              }}
              opciones={[
                { clave: "todas", etiqueta: "Todas", cuenta: cuentaTipo("todas") },
                { clave: "EMPRESA", etiqueta: "Página de empresa", cuenta: cuentaTipo("EMPRESA") },
                { clave: "PERSONA", etiqueta: "Perfil personal", cuenta: cuentaTipo("PERSONA") },
              ]}
            />
          </div>
          <label className="flex flex-col gap-1.5">
            <Rotulo>Tema</Rotulo>
            <Select value={tema} onChange={(e) => setTema(e.target.value)} className="w-auto min-w-[220px] bg-surface py-[7px] text-[13px] text-fg">
              <option value="">Todos los temas</option>
              {temas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.isCampaign ? " · en campaña" : ""}
                </option>
              ))}
            </Select>
          </label>
          {tipo !== "PERSONA" && (
            <label className="flex flex-col gap-1.5">
              <Rotulo>Etapa</Rotulo>
              <Select
                value={etapa}
                onChange={(e) => setEtapa(e.target.value as "" | MarketingJourneyStageValue)}
                className="w-auto min-w-[170px] bg-surface py-[7px] text-[13px] text-fg"
              >
                <option value="">Todas las etapas</option>
                {MARKETING_JOURNEY_STAGES.map((s) => (
                  <option key={s} value={s}>
                    {JOURNEY_STAGE_META[s].label}
                  </option>
                ))}
              </Select>
            </label>
          )}
        </div>

        {tab === "sugerida" && !loading && visibles.length > 0 && (
          <FranjaDeSugerencias>
            <strong className="font-semibold">
              El agente propone {totalSugeridas} {totalSugeridas === 1 ? "publicación" : "publicaciones"}
            </strong>
            {masVieja ? ` desde el ${diaYMesCr(masVieja)}` : ""}. Nada se publica solo.
            {repartidas > 0 ? " Las que dicen casi lo mismo van juntas." : ""}
          </FranjaDeSugerencias>
        )}

        {loading ? (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]" aria-label="Cargando las publicaciones">
            <ListSkeleton rows={7} lines={2} />
            <SkeletonPanel minH="min-h-[520px]" bodyClassName="p-5 space-y-4">
              <SkeletonText lines={3} />
              <SkeletonText lines={8} />
            </SkeletonPanel>
          </div>
        ) : filas.length === 0 ? (
          <EmptyState variant="dashed" title={VACIO[tab].title} description={VACIO[tab].description} />
        ) : (
          <div className="grid items-start gap-5 lg:grid-cols-[minmax(300px,400px)_minmax(0,1fr)]">
            <section aria-label="Lista de publicaciones" className="overflow-hidden rounded-xl border border-line bg-surface">
              <ul className="max-h-[860px] overflow-y-auto">
                {filas.map((f) => {
                  const on = elegida?.id === f.idea.id;
                  return (
                    <li key={f.idea.id}>
                      <button
                        type="button"
                        aria-current={on ? "true" : undefined}
                        onClick={() => setSelId(f.idea.id)}
                        className={cn(
                          "flex w-full flex-col gap-1.5 border-b border-line py-3 pr-3.5 text-left transition-colors",
                          f.miembro ? "pl-9" : "pl-3.5",
                          on ? "bg-info-surface" : "bg-surface hover:bg-surface-hover",
                        )}
                      >
                        <span className="flex items-start gap-2">
                          {tab === "sugerida" && !f.miembro && (
                            <IconoDeSugerencia className="mt-[3px] h-[13px] w-[13px] flex-shrink-0 text-brand" />
                          )}
                          <span className={cn("line-clamp-2 min-w-0 flex-1 leading-[18px] text-fg", f.miembro ? "text-xs" : "text-[13px] font-semibold")}>
                            {f.idea.title}
                          </span>
                        </span>
                        <span className="text-xs leading-4 text-fg-muted">{meta(f.idea)}</span>
                        {(!f.miembro && f.grupo.length > 1) || (tab !== "sugerida" && f.idea.hubspotDraftAt) ? (
                          <span className="flex flex-wrap gap-1.5">
                            {!f.miembro && f.grupo.length > 1 && <ChipGris>{f.grupo.length} versiones</ChipGris>}
                            {tab !== "sugerida" && f.idea.hubspotDraftAt && <ChipHecho>✓ En HubSpot</ChipHecho>}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="border-t border-line px-3.5 py-2.5 text-xs text-fg-muted">
                {visibles.length} {visibles.length === 1 ? "publicación" : "publicaciones"}
                {repartidas > 0 ? ` en ${grupos.length} filas` : ""} · las más nuevas primero
              </div>
            </section>

            {elegida && (
              <PublicacionDetalle
                key={elegida.id}
                idea={elegida}
                canEdit={canEdit}
                canChooseSmarteam={canChooseSmarteam}
                busy={busyId === elegida.id}
                versiones={grupoElegido.length}
                versionesDesde={grupoElegido.length > 1 ? diaYMesCr(grupoElegido[grupoElegido.length - 1].createdAt) : null}
                versionesAbiertas={abiertos.has(grupoElegido[0]?.id ?? "")}
                onVerVersiones={() =>
                  setAbiertos((s) => {
                    const n = new Set(s);
                    const k = grupoElegido[0].id;
                    if (n.has(k)) n.delete(k);
                    else n.add(k);
                    return n;
                  })
                }
                onDescartarOtras={() => setConfirmOtras(grupoElegido.filter((i) => i.id !== elegida.id).map((i) => i.id))}
                onAccept={(d) => aceptar(elegida.id, d)}
                onApprove={() => aprobar(elegida.id)}
                onUnapprove={() => reabrir(elegida.id)}
                onDiscard={() => descartar(elegida.id)}
                onRestore={() => restaurar(elegida.id)}
                onDelete={() => setConfirmBorrar(elegida.id)}
                onSaveField={(c, v) => guardarCampo(elegida.id, c, v)}
                onAdjust={(t) => ajustar(elegida.id, t)}
                onCopy={copiar}
                channels={canales}
                channelsSupported={canalesOk}
                onSendHubspot={(keys) => enviarAHubspot(elegida.id, keys)}
              />
            )}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!confirmBorrar}
        onCancel={() => setConfirmBorrar(null)}
        onConfirm={async () => {
          const id = confirmBorrar;
          setConfirmBorrar(null);
          if (id) await borrar(id);
        }}
        title="¿Borrar para siempre?"
        description="No se puede deshacer. Si solo quieres sacarla de la vista, ya está en Descartadas."
        confirmLabel="Borrar"
      />
      <ConfirmDialog
        open={!!confirmOtras}
        onCancel={() => setConfirmOtras(null)}
        onConfirm={async () => {
          const ids = confirmOtras;
          setConfirmOtras(null);
          if (ids?.length) await descartarVarias(ids);
        }}
        title={`¿Descartar las otras ${confirmOtras?.length ?? 0}?`}
        description="Te quedas con la que estás viendo. Las otras pasan a Descartadas y puedes restaurarlas."
        confirmLabel="Descartar"
      />
    </>
  );
}
