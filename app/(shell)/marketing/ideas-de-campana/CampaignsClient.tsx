"use client";

/**
 * Ideas de SEM (/marketing/ideas-de-campana) — campañas pagadas que propone el agente en cada tanda (rediseño del
 * 2026-10-04, sistema «Nexus · interfaz interna»). El modelo Prisma sigue siendo CampaignIdea.
 *
 *  - Agrupadas por TANDA (la corrida que las propuso), la más nueva arriba; las tres últimas abiertas.
 *  - La descripción del agente se lee por campos (objetivo, audiencia, ángulo, keywords…): lib/marketing/idea-sem.ts.
 *  - Las que repiten título o ángulo lo dicen (lib/marketing/parecidas.ts, sin contar el canal).
 *  - Medido ese día: 56 por revisar desde el 3 jul y ninguna revisada. «Descartar las de más de 30 días» limpia la
 *    cola de un saque, con confirmación y reversible desde Descartadas.
 *  - Aprobar no lanza nada: la deja lista para armarla en la plataforma de anuncios.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, EmptyState, ListSkeleton, PageHeader, Segmentado, Tabs } from "@/components/ui";
import { FranjaDeSugerencias, BotonAzul, BotonBlanco, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { Chip, ChipGris, Rotulo, diaYMesCr } from "@/components/marketing/piezas";
import { seccionesDeIdeaSem } from "@/lib/marketing/idea-sem";
import { agruparParecidas, IGNORAR_EN_SEM } from "@/lib/marketing/parecidas";
import { fechaCorta } from "@/lib/marketing/tanda";
import { crDateParts } from "@/lib/jobs/time";
import { cn } from "@/lib/cn";

type Estado = "PENDING" | "APPROVED" | "DISCARDED";
type Canal = "GOOGLE_SEARCH" | "PAID_SOCIAL" | "DISPLAY" | "OTHER";
type FiltroCanal = "todas" | "GOOGLE_SEARCH" | "PAID_SOCIAL" | "otros";

interface IdeaSem {
  id: string;
  runId: string | null;
  title: string;
  channel: Canal;
  description: string;
  status: Estado;
  createdAt: string;
}

interface Conteos {
  total: number;
  porCanal: Record<string, number>;
}

const CANAL: Record<Canal, string> = {
  GOOGLE_SEARCH: "Búsqueda en Google",
  PAID_SOCIAL: "Anuncios en redes",
  DISPLAY: "Display",
  OTHER: "Otro canal",
};

const ESTADOS: Array<{ key: Estado; label: string }> = [
  { key: "PENDING", label: "Por revisar" },
  { key: "APPROVED", label: "Aprobadas" },
  { key: "DISCARDED", label: "Descartadas" },
];

const TANDAS_ABIERTAS = 3;
const DIAS_VIEJA = 30;

export default function CampaignsClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [tab, setTab] = useState<Estado>("PENDING");
  const [canal, setCanal] = useState<FiltroCanal>("todas");
  const [filas, setFilas] = useState<IdeaSem[]>([]);
  const [conteos, setConteos] = useState<Record<Estado, Conteos> | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [abierta, setAbierta] = useState<string | null | undefined>(undefined);
  const [verTodas, setVerTodas] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState<string | null>(null);
  const [confirmViejas, setConfirmViejas] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ campaigns: IdeaSem[]; counts: Record<Estado, Conteos> }>(`/api/marketing/campaigns?status=${tab}`);
      setFilas(d.campaigns);
      setConteos(d.counts);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las ideas de SEM.");
    } finally {
      setLoading(false);
    }
  }, [toast, tab]);
  useEffect(() => {
    load();
  }, [load]);

  const visibles = useMemo(
    () =>
      filas.filter((f) =>
        canal === "todas" ? true : canal === "otros" ? f.channel === "DISPLAY" || f.channel === "OTHER" : f.channel === canal,
      ),
    [filas, canal],
  );

  // Cada idea sabe si se repite: la más nueva del grupo dice cuántas anteriores se le parecen; las otras, a cuál.
  const parecidas = useMemo(() => {
    const m = new Map<string, string>();
    for (const g of agruparParecidas(visibles, (f) => f.title, IGNORAR_EN_SEM)) {
      if (g.length < 2) continue;
      m.set(g[0].id, `Se parece a ${g.length - 1} anterior${g.length - 1 === 1 ? "" : "es"}`);
      for (const f of g.slice(1)) m.set(f.id, `Parecida a una del ${diaYMesCr(g[0].createdAt)}`);
    }
    return m;
  }, [visibles]);

  // Una tanda = una corrida. Sin corrida (ideas viejas), el día en que llegaron.
  const tandas = useMemo(() => {
    const out: Array<{ clave: string; dateKey: string; ideas: IdeaSem[] }> = [];
    const porClave = new Map<string, (typeof out)[number]>();
    for (const f of visibles) {
      const dateKey = crDateParts(new Date(f.createdAt)).dateKey;
      const clave = f.runId ?? `dia-${dateKey}`;
      let t = porClave.get(clave);
      if (!t) {
        t = { clave, dateKey, ideas: [] };
        porClave.set(clave, t);
        out.push(t);
      }
      t.ideas.push(f);
    }
    return out;
  }, [visibles]);

  const mostradas = verTodas ? tandas : tandas.slice(0, TANDAS_ABIERTAS);
  const escondidas = tandas.slice(TANDAS_ABIERTAS);
  const ideasEscondidas = escondidas.reduce((n, t) => n + t.ideas.length, 0);
  const abiertaEfectiva = abierta === undefined ? (mostradas[0]?.ideas[0]?.id ?? null) : abierta;

  const limite = Date.now() - DIAS_VIEJA * 864e5;
  const viejas = tab === "PENDING" ? filas.filter((f) => new Date(f.createdAt).getTime() < limite) : [];
  const masVieja = filas.length > 0 ? filas[filas.length - 1].createdAt : null;

  const revisar = async (id: string, action: "approve" | "discard") => {
    if (busy) return;
    setBusy(true);
    try {
      await fetchJson(`/api/marketing/campaigns/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      toast.success(action === "approve" ? "Aprobada: queda lista para armarla en la plataforma de anuncios." : "Descartada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const borrar = async (id: string) => {
    try {
      await fetchJson(`/api/marketing/campaigns/${id}`, { method: "DELETE" });
      toast.info("Idea de SEM borrada para siempre.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  const descartarViejas = async () => {
    try {
      const r = await fetchJson<{ descartadas: number }>("/api/marketing/campaigns/descartar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: viejas.map((v) => v.id).slice(0, 200) }),
      });
      toast.info(`Se descartaron ${r.descartadas}. Están en Descartadas.`);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron descartar.");
    }
  };

  const otros = (conteos?.[tab].porCanal.DISPLAY ?? 0) + (conteos?.[tab].porCanal.OTHER ?? 0);
  const opcionesCanal: Array<{ clave: FiltroCanal; etiqueta: string; cuenta?: number }> = [
    { clave: "todas", etiqueta: "Todas", cuenta: conteos?.[tab].total },
    { clave: "GOOGLE_SEARCH", etiqueta: CANAL.GOOGLE_SEARCH, cuenta: conteos?.[tab].porCanal.GOOGLE_SEARCH ?? 0 },
    { clave: "PAID_SOCIAL", etiqueta: CANAL.PAID_SOCIAL, cuenta: conteos?.[tab].porCanal.PAID_SOCIAL ?? 0 },
    ...(otros > 0 ? [{ clave: "otros" as const, etiqueta: "Otros", cuenta: otros }] : []),
  ];

  return (
    <>
      <PageHeader
        title="Ideas de SEM"
        description="Campañas pagadas que propone el agente en cada tanda: búsqueda en Google y anuncios en redes. Aprobar una idea no la lanza: la deja lista para armarla en la plataforma de anuncios."
      />
      <div className="space-y-5">
        <Tabs
          aria-label="Estado de las ideas de SEM"
          value={tab}
          onChange={(k) => {
            setTab(k);
            setAbierta(undefined);
            setVerTodas(false);
            setLoading(true);
          }}
          items={ESTADOS.map((e) => ({ key: e.key, label: e.label, count: conteos?.[e.key].total }))}
        />

        <div className="flex flex-col gap-1.5">
          <Rotulo>Canal</Rotulo>
          <Segmentado<FiltroCanal> etiqueta="Canal" valor={canal} onCambio={setCanal} opciones={opcionesCanal} />
        </div>

        {tab === "PENDING" && !loading && filas.length > 0 && (
          <FranjaDeSugerencias
            acciones={
              canEdit && viejas.length > 0 ? (
                <BotonBlanco onClick={() => setConfirmViejas(true)}>
                  Descartar las de más de {DIAS_VIEJA} días ({viejas.length})
                </BotonBlanco>
              ) : undefined
            }
          >
            <strong className="font-semibold">
              El agente propone {filas.length} {filas.length === 1 ? "idea" : "ideas"} de SEM
            </strong>
            {masVieja ? ` desde el ${diaYMesCr(masVieja)}` : ""}. Nada se lanza sola.
          </FranjaDeSugerencias>
        )}

        {loading ? (
          <ListSkeleton rows={6} lines={2} trailing />
        ) : visibles.length === 0 ? (
          <EmptyState
            variant="dashed"
            title={
              tab === "PENDING" ? "No hay ideas de SEM por revisar" : tab === "APPROVED" ? "No hay ideas de SEM aprobadas" : "No hay ideas de SEM descartadas"
            }
            description={tab === "PENDING" ? "El agente propone algunas en cada tanda de los viernes." : undefined}
          />
        ) : (
          <div className="space-y-5">
            {mostradas.map((t) => (
              <section key={t.clave} aria-label={`Tanda del ${fechaCorta(t.dateKey)}`} className="space-y-2">
                <div className="flex items-baseline gap-2.5">
                  <h2 className="text-sm font-semibold text-fg">Tanda del {fechaCorta(t.dateKey)}</h2>
                  <span className="text-xs text-fg-muted">
                    {t.ideas.length} {t.ideas.length === 1 ? "idea" : "ideas"}
                  </span>
                </div>
                <ul className="overflow-hidden rounded-xl border border-line bg-surface">
                  {t.ideas.map((f) => (
                    <FilaDeIdea
                      key={f.id}
                      idea={f}
                      abierta={abiertaEfectiva === f.id}
                      parecida={parecidas.get(f.id) ?? null}
                      sugerida={tab === "PENDING"}
                      canEdit={canEdit}
                      busy={busy}
                      onToggle={() => setAbierta(abiertaEfectiva === f.id ? null : f.id)}
                      onAprobar={() => revisar(f.id, "approve")}
                      onDescartar={() => revisar(f.id, "discard")}
                      onBorrar={() => setConfirmBorrar(f.id)}
                    />
                  ))}
                </ul>
              </section>
            ))}
            {!verTodas && escondidas.length > 0 && (
              <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-line bg-surface px-4 py-3.5">
                <span className="min-w-0 flex-1 basis-80 text-[13px] text-fg-secondary">
                  <b className="font-semibold">
                    {ideasEscondidas} {ideasEscondidas === 1 ? "idea más" : "ideas más"}
                  </b>
                  , de las tandas del {fechaCorta(escondidas[escondidas.length - 1].dateKey)} al {fechaCorta(escondidas[0].dateKey)}.
                </span>
                <BotonBlanco onClick={() => setVerTodas(true)}>Ver las anteriores</BotonBlanco>
              </div>
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
        title="¿Borrar esta idea de SEM?"
        description="Se borra para siempre. No se puede deshacer."
        confirmLabel="Borrar"
      />
      <ConfirmDialog
        open={confirmViejas}
        onCancel={() => setConfirmViejas(false)}
        onConfirm={async () => {
          setConfirmViejas(false);
          await descartarViejas();
        }}
        title={`¿Descartar las ${viejas.length} de más de ${DIAS_VIEJA} días?`}
        description="Pasan a Descartadas y puedes aprobar cualquiera desde ahí. Las de las últimas semanas se quedan."
        confirmLabel="Descartar"
        variant="default"
      />
    </>
  );
}

function FilaDeIdea({
  idea,
  abierta,
  parecida,
  sugerida,
  canEdit,
  busy,
  onToggle,
  onAprobar,
  onDescartar,
  onBorrar,
}: {
  idea: IdeaSem;
  abierta: boolean;
  parecida: string | null;
  sugerida: boolean;
  canEdit: boolean;
  busy: boolean;
  onToggle: () => void;
  onAprobar: () => void;
  onDescartar: () => void;
  onBorrar: () => void;
}) {
  const secciones = useMemo(() => seccionesDeIdeaSem(idea.description), [idea.description]);
  const angulo = secciones.find((s) => s.campo === "angulo")?.texto ?? secciones[0]?.texto ?? "";
  return (
    <li className={cn("flex flex-col gap-2.5 border-b border-line px-4 py-3.5 last:border-b-0", abierta ? "bg-surface-muted" : "bg-surface")}>
      <div className="flex flex-wrap items-start gap-2.5">
        {sugerida && <IconoDeSugerencia className="mt-0.5 h-[15px] w-[15px] flex-shrink-0 text-brand" />}
        <button
          type="button"
          aria-expanded={abierta}
          onClick={onToggle}
          className="flex min-w-0 flex-1 basis-96 flex-col gap-1 text-left"
        >
          <span className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold leading-5 text-fg">{idea.title}</span>
            <Chip className="px-2 py-px text-[11px]">{CANAL[idea.channel]}</Chip>
            {parecida && <ChipGris>{parecida}</ChipGris>}
          </span>
          {!abierta && angulo && (
            <span className="line-clamp-1 text-[13px] leading-[19px] text-fg-secondary">
              <span className="text-fg-muted">Ángulo · </span>
              {angulo}
            </span>
          )}
        </button>
        {canEdit && (
          <span className="flex items-center gap-1.5">
            {idea.status === "PENDING" && (
              <>
                <BotonTexto onClick={onDescartar} disabled={busy}>Descartar</BotonTexto>
                <BotonAzul onClick={onAprobar} disabled={busy}>Aprobar</BotonAzul>
              </>
            )}
            {idea.status === "APPROVED" && <BotonTexto onClick={onDescartar} disabled={busy}>Descartar</BotonTexto>}
            {idea.status === "DISCARDED" && (
              <>
                <BotonTexto onClick={onBorrar} className="text-danger-ink hover:text-danger-ink">Borrar</BotonTexto>
                <BotonBlanco onClick={onAprobar} disabled={busy}>Aprobar</BotonBlanco>
              </>
            )}
          </span>
        )}
      </div>
      {abierta && (
        <dl className={cn("grid gap-x-6 gap-y-3.5 sm:grid-cols-2", sugerida && "sm:pl-[25px]")}>
          {secciones.map((s) => (
            <div key={s.campo} className={cn("flex flex-col gap-1", s.campo === "intro" && "sm:col-span-2")}>
              <dt>
                <Rotulo>{s.rotulo}</Rotulo>
              </dt>
              <dd className="text-[13px] leading-[19px] text-fg-secondary">
                {s.keywords && s.keywords.length > 0 ? (
                  <span className="flex flex-wrap gap-1.5">
                    {s.keywords.map((k) => (
                      <span key={k} className="rounded-md border border-line bg-surface-muted px-2 py-0.5 text-xs text-fg-secondary">
                        {k}
                      </span>
                    ))}
                  </span>
                ) : (
                  s.texto
                )}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </li>
  );
}
