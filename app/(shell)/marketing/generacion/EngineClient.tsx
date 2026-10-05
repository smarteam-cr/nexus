"use client";

/**
 * Generación (/marketing/generacion) — la tanda de los viernes y el historial del motor (rediseño del 2026-10-04,
 * sistema «Nexus · interfaz interna»).
 *
 *  - «Próxima tanda»: cuándo corre sola y cuánto pide. Las cantidades se GUARDAN sin correr el motor (PUT
 *    /api/marketing/tanda): antes solo se guardaban al apretar «Generar», así que nadie sabía qué iba a pedir el
 *    cron. Medido ese día: pedía 1 de empresa y 0 de perfil personal, y las últimas 10 tandas trajeron 1 cada una.
 *  - Tres formas de correrlo, como antes: «Generar ahora» (la cadena completa, la del cron), «Regenerar con lo
 *    guardado» (sin leer las fuentes) y «Solo leer las fuentes» (sin generar).
 *  - El historial es una tabla con lo que trajo cada corrida, y quién la corrió si fue a mano.
 */
import Link from "next/link";
import { useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Alert, Button, Field, Input, PageHeader, TableSkeleton } from "@/components/ui";
import { BotonBlanco } from "@/components/ui/sistema";
import { useMarketingEngine, type RunRow } from "@/components/marketing/useMarketingEngine";
import { Rotulo } from "@/components/marketing/piezas";
import { MARKETING_GEN_DEFAULTS, MARKETING_GEN_LIMITS } from "@/lib/marketing/marketing-ui";
import { fechaCorta } from "@/lib/marketing/tanda";
import { crDateParts } from "@/lib/jobs/time";
import type { ResumenInsumos } from "@/lib/marketing/queries";
import { cn } from "@/lib/cn";

/** Entero en [0, max]; vacío o basura → 0. */
function acotar(raw: string, max: number): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, max);
}

const cuando = (iso: string) => {
  const hora = new Date(iso).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "America/Costa_Rica" }).replace(/^0/, "");
  return `${fechaCorta(crDateParts(new Date(iso)).dateKey)}, ${hora}`;
};

export default function EngineClient({
  canEdit,
  proximaTanda,
  resumen,
}: {
  canEdit: boolean;
  proximaTanda: { etiqueta: string; pendienteHoy: boolean };
  resumen: ResumenInsumos;
}) {
  const toast = useToast();
  const { runs, stats, sources, loading, busy, runningPhase, startRun, lastRun } = useMarketingEngine();

  const [empresaGuardada, setEmpresaGuardada] = useState(resumen.genEmpresaTarget ?? MARKETING_GEN_DEFAULTS.empresa);
  const [personaGuardada, setPersonaGuardada] = useState(resumen.genPersonaTarget ?? MARKETING_GEN_DEFAULTS.persona);
  const [empresa, setEmpresa] = useState(String(empresaGuardada));
  const [persona, setPersona] = useState(String(personaGuardada));
  const [guardando, setGuardando] = useState(false);
  const nEmpresa = acotar(empresa, MARKETING_GEN_LIMITS.maxEmpresa);
  const nPersona = acotar(persona, MARKETING_GEN_LIMITS.maxPersona);
  const total = nEmpresa + nPersona;
  const cambio = nEmpresa !== empresaGuardada || nPersona !== personaGuardada;
  const config = { empresaCount: nEmpresa, personaCount: nPersona };
  const hayPosts = (stats?.inWindow ?? resumen.postsEnVentana) > 0;

  const guardar = async () => {
    if (total === 0 || guardando) return;
    setGuardando(true);
    try {
      const r = await fetchJson<{ settings: { genEmpresaTarget: number; genPersonaTarget: number } }>("/api/marketing/tanda", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      setEmpresaGuardada(r.settings.genEmpresaTarget);
      setPersonaGuardada(r.settings.genPersonaTarget);
      toast.success("Guardado. La tanda del viernes pide eso.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  /**
   * Correr con cantidades las guarda como las de la tanda (runs/route.ts): la pantalla lo refleja, pero
   * solo si el servidor aceptó la corrida (si dijo que no —ya había una en curso, por ejemplo— no guardó).
   */
  const correr = async (kind: "CHAIN" | "GENERATE") => {
    if (!(await startRun(kind, config))) return;
    setEmpresaGuardada(nEmpresa);
    setPersonaGuardada(nPersona);
  };

  const conError = sources.filter((s) => s.active && s.lastFetchError);
  const fuentesActivas = loading ? resumen.fuentesActivas : sources.filter((s) => s.active).length;
  const pocas = empresaGuardada + personaGuardada <= 2;
  const totalGuardado = empresaGuardada + personaGuardada;

  return (
    <>
      <PageHeader
        title="Generación"
        description="Cada viernes a las 6:00 el motor lee las fuentes y el agente propone publicaciones e ideas de SEM con lo que lee de temas, audiencia y voz. También se puede correr a mano."
        action={
          canEdit ? (
            <Button variant="primary" onClick={() => correr("CHAIN")} disabled={busy || total === 0}>
              {busy ? "Generando…" : "Generar ahora"}
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-6">
        {busy && (
          <Alert variant="info">
            El agente está armando la tanda{runningPhase ? ` · ${runningPhase}` : ""}. Las nuevas aparecen en Publicaciones e Ideas de SEM cuando termine.
          </Alert>
        )}
        {!busy && lastRun?.status === "ERROR" && <Alert variant="danger" title="La última corrida falló">{lastRun.error ?? "Sin detalle."}</Alert>}
        {conError.length > 0 && (
          <Alert variant="danger" title="Fuentes que no se pudieron leer en la última tanda">
            {conError.map((s) => `${s.label}: ${s.lastFetchError}`).join(" · ")}
          </Alert>
        )}

        <div className="flex flex-wrap items-stretch gap-4">
          <section aria-label="Próxima tanda" className="flex min-w-0 flex-[2_1_520px] flex-col gap-3.5 rounded-xl border border-line bg-surface p-5">
            <div className="flex flex-col gap-0.5">
              <Rotulo>Próxima tanda</Rotulo>
              <span className="text-[22px] font-bold leading-7 text-fg">{proximaTanda.etiqueta.replace(", ", " · ")}</span>
              <span className="text-[13px] text-fg-muted">
                {proximaTanda.pendienteHoy
                  ? "Hoy: el motor la corre en el próximo minuto."
                  : "Automática. Pide lo que configures acá; el agente puede entregar menos si no hay buen material."}
              </span>
            </div>

            {canEdit ? (
              <div className="flex flex-wrap items-end gap-4">
                <Field label="Página de empresa" hint={`por tanda · máx ${MARKETING_GEN_LIMITS.maxEmpresa}`} className="w-[200px]">
                  <Input type="number" min={0} max={MARKETING_GEN_LIMITS.maxEmpresa} value={empresa} onChange={(e) => setEmpresa(e.target.value)} disabled={busy} />
                </Field>
                <Field label="Perfil personal" hint={`por tanda · máx ${MARKETING_GEN_LIMITS.maxPersona}`} className="w-[200px]">
                  <Input type="number" min={0} max={MARKETING_GEN_LIMITS.maxPersona} value={persona} onChange={(e) => setPersona(e.target.value)} disabled={busy} />
                </Field>
                {cambio && (
                  <div className="flex items-center gap-2 pb-6">
                    <BotonBlanco onClick={guardar} disabled={guardando || total === 0}>
                      {guardando ? "Guardando…" : "Guardar"}
                    </BotonBlanco>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-fg-secondary">
                Pide {empresaGuardada} de página de empresa y {personaGuardada} de perfil personal.
              </p>
            )}
            {total === 0 && <p className="text-xs text-warn-ink">Configura al menos una publicación, de empresa o de perfil personal.</p>}

            {pocas && (
              <Alert variant="warning" title={`Cada viernes ${totalGuardado === 1 ? "sale una sola publicación" : `salen solo ${totalGuardado} publicaciones`}.`}>
                El valor de fábrica es {MARKETING_GEN_DEFAULTS.empresa} de empresa y {MARKETING_GEN_DEFAULTS.persona} de perfil personal.
              </Alert>
            )}

            {canEdit && (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-line pt-3.5 text-xs text-fg-muted">
                <span>Otras formas de correrlo:</span>
                <button
                  type="button"
                  onClick={() => correr("GENERATE")}
                  disabled={busy || !hayPosts || total === 0}
                  title={hayPosts ? undefined : "Todavía no hay posts guardados"}
                  className="font-semibold text-brand hover:text-brand-light disabled:opacity-50"
                >
                  Regenerar con lo guardado
                </button>
                <span>sin leer las fuentes, para estrenar cambios en temas o voz ·</span>
                <button type="button" onClick={() => startRun("INGEST")} disabled={busy} className="font-semibold text-brand hover:text-brand-light disabled:opacity-50">
                  Solo leer las fuentes
                </button>
                <span>sin generar, para probar una fuente nueva</span>
              </div>
            )}
          </section>

          <section aria-label="Lo que entra a la tanda" className="flex min-w-0 flex-[1_1_300px] flex-col gap-3 rounded-xl border border-line bg-surface-muted p-5">
            <Rotulo>Lo que entra a la tanda</Rotulo>
            <Dato numero={stats?.inWindow ?? resumen.postsEnVentana} texto="posts de los últimos 3 meses" nota={`${stats?.total ?? resumen.postsTotal} guardados; los de más de 3 meses quedan afuera`} />
            <Dato numero={fuentesActivas} texto={fuentesActivas === 1 ? "fuente activa" : "fuentes activas"} href="/marketing/fuentes" enlace="ver fuentes" />
            <Dato
              numero={resumen.temasActivos}
              texto={`temas activos${resumen.temasEnCampana.length > 0 ? ` · ${resumen.temasEnCampana.length} en campaña` : ""}`}
              href="/marketing/temas"
              enlace="ver temas"
            />
          </section>
        </div>

        <section aria-label="Historial de corridas" className="space-y-2.5">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-sm font-semibold text-fg">Historial</h2>
            <span className="text-xs text-fg-muted">las últimas 10 corridas</span>
          </div>
          {loading ? (
            <TableSkeleton columns={7} rows={5} />
          ) : runs.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Todavía no hay corridas. La primera es el viernes a las 6:00, o ahora con «Generar ahora».</p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[820px] border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                    <th className="border-b border-line px-4 py-2.5 font-semibold">Fecha</th>
                    <th className="border-b border-line px-4 py-2.5 font-semibold">Cómo</th>
                    <th className="border-b border-line px-4 py-2.5 text-right font-semibold">Posts nuevos</th>
                    <th className="border-b border-line px-4 py-2.5 text-right font-semibold">Publicaciones</th>
                    <th className="border-b border-line px-4 py-2.5 text-right font-semibold">Ideas de SEM</th>
                    <th className="border-b border-line px-4 py-2.5 text-right font-semibold">Temas sugeridos</th>
                    <th className="border-b border-line px-4 py-2.5 font-semibold">Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((r) => (
                    <Corrida key={r.id} r={r} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-fg-muted">
            Lo que propone cada tanda llega a <Link href="/marketing/contenido" className="font-medium text-brand hover:text-brand-light">Publicaciones</Link> y{" "}
            <Link href="/marketing/ideas-de-campana" className="font-medium text-brand hover:text-brand-light">Ideas de SEM</Link>.
          </p>
        </section>
      </div>
    </>
  );
}

function Dato({ numero, texto, nota, href, enlace }: { numero: number; texto: string; nota?: string; href?: string; enlace?: string }) {
  return (
    <div className="flex flex-col gap-0.5 border-t border-line pt-3 first-of-type:border-t-0 first-of-type:pt-0">
      <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{numero}</span>
      <span className="text-[13px] text-fg-secondary">
        {texto}
        {href && enlace && (
          <>
            {" · "}
            <Link href={href} className="font-semibold text-brand hover:text-brand-light">
              {enlace}
            </Link>
          </>
        )}
      </span>
      {nota && <span className="text-xs text-fg-muted">{nota}</span>}
    </div>
  );
}

function Corrida({ r }: { r: RunRow }) {
  const como =
    r.trigger === "CRON"
      ? "Automática"
      : `A mano${r.startedByName ? ` · ${r.startedByName}` : ""}${r.kind === "GENERATE" ? " · con lo guardado" : r.kind === "INGEST" ? " · solo fuentes" : ""}`;
  const num = (n: number | null) => (n === null ? "—" : String(n));
  return (
    <tr>
      <td className="whitespace-nowrap border-b border-line px-4 py-2.5 text-fg">{cuando(r.createdAt)}</td>
      <td className="border-b border-line px-4 py-2.5 text-fg-secondary">{como}</td>
      <td className="border-b border-line px-4 py-2.5 text-right tabular-nums">{num(r.newPostsCount)}</td>
      <td className="border-b border-line px-4 py-2.5 text-right tabular-nums">{num(r.contentIdeasCount)}</td>
      <td className="border-b border-line px-4 py-2.5 text-right tabular-nums">{num(r.campaignIdeasCount)}</td>
      <td className="border-b border-line px-4 py-2.5 text-right tabular-nums text-fg-muted">{num(r.pillarSuggestionsCount)}</td>
      <td className={cn("border-b border-line px-4 py-2.5", r.status === "DONE" ? "text-success-ink" : r.status === "ERROR" ? "text-danger-ink" : "text-fg-secondary")}>
        {r.status === "DONE" ? "✓ Lista" : r.status === "ERROR" ? <span title={r.error ?? undefined}>✕ Falló</span> : "● En curso"}
      </td>
    </tr>
  );
}
