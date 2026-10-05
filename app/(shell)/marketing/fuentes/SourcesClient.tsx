"use client";

/**
 * Fuentes (/marketing/fuentes) — los perfiles de LinkedIn que lee el motor (rediseño del 2026-10-04, sistema
 * «Nexus · interfaz interna»). Lo nuevo es decir qué APORTA cada uno: cuántos posts de los últimos 3 meses entran a
 * la tanda y cuántas publicaciones del agente citan al menos un post suyo. Medido ese día: una sola fuente aparecía
 * en las 112 publicaciones, aunque otra tenía cinco veces más posts recientes.
 */
import { useCallback, useEffect, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Alert, Button, ConfirmDialog, Drawer, EmptyState, Field, Input, Menu, PageHeader, SkeletonPanel, Skeleton, TableSkeleton } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import { ChipGris, diaYMesCr } from "@/components/marketing/piezas";
import { cn } from "@/lib/cn";

interface Fuente {
  id: string;
  profileUrl: string;
  label: string | null;
  active: boolean;
  lastFetchedAt: string | null;
  lastFetchError: string | null;
  postsEnVentana: number;
  ideasInspiradas: number;
  _count: { posts: number };
}

const FORM_VACIO = { profileUrl: "", label: "" };
const RECOMENDADAS = { min: 5, max: 10 };

const urlCorta = (u: string) => u.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "");
const hora = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-CR", { hour: "numeric", minute: "2-digit", hour12: false, timeZone: "America/Costa_Rica" }).replace(/^0/, "");

export default function SourcesClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [fuentes, setFuentes] = useState<Fuente[]>([]);
  const [totalIdeas, setTotalIdeas] = useState(0);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [busy, setBusy] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState<Fuente | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ sources: Fuente[]; totalIdeas: number }>("/api/marketing/sources");
      // Las que más inspiran primero; las pausadas al final.
      setFuentes([...d.sources].sort((a, b) => (a.active !== b.active ? (a.active ? -1 : 1) : b.ideasInspiradas - a.ideasInspiradas)));
      setTotalIdeas(d.totalIdeas);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las fuentes.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const cerrar = () => {
    setDrawer(false);
    setForm(FORM_VACIO);
  };

  const agregar = async () => {
    if (!form.profileUrl.trim() || busy) return;
    setBusy(true);
    try {
      await fetchJson("/api/marketing/sources", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ profileUrl: form.profileUrl.trim(), label: form.label.trim() || null }),
      });
      toast.success("Fuente agregada. Se lee en la próxima tanda.");
      cerrar();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo agregar.");
    } finally {
      setBusy(false);
    }
  };

  const alternar = async (f: Fuente) => {
    try {
      await fetchJson(`/api/marketing/sources/${f.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !f.active }),
      });
      toast.info(f.active ? "Pausada: el motor no la lee." : "Activada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    }
  };

  const borrar = async (f: Fuente) => {
    try {
      await fetchJson(`/api/marketing/sources/${f.id}`, { method: "DELETE" });
      toast.info("Fuente borrada, con sus posts guardados.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  const activas = fuentes.filter((f) => f.active);
  const enVentana = activas.reduce((n, f) => n + f.postsEnVentana, 0);
  const guardados = fuentes.reduce((n, f) => n + f._count.posts, 0);
  const conError = activas.filter((f) => f.lastFetchError);
  const ultima = activas.map((f) => f.lastFetchedAt).filter((x): x is string => !!x).sort().pop() ?? null;

  return (
    <>
      <PageHeader
        title="Fuentes"
        description={`Perfiles de LinkedIn que el motor lee cada viernes: unos 20 posts recientes de cada uno, sin repetir. De ahí saca las ideas. Se recomiendan entre ${RECOMENDADAS.min} y ${RECOMENDADAS.max} activas.`}
        action={
          canEdit ? (
            <Button variant="primary" onClick={() => setDrawer(true)}>
              Agregar fuente
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-5">
        {loading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <SkeletonPanel key={i} minH="min-h-[96px]" bodyClassName="p-4 space-y-2">
                <Skeleton className="h-3 w-28" delay={i * 40} />
                <Skeleton className="h-6 w-16" delay={i * 40 + 20} />
                <Skeleton className="h-3 w-40" delay={i * 40 + 40} />
              </SkeletonPanel>
            ))}
          </div>
        ) : (
          <section aria-label="Resumen" className="grid gap-3 sm:grid-cols-3">
            <Cifra
              rotulo="Fuentes activas"
              valor={String(activas.length)}
              nota={
                activas.length < RECOMENDADAS.min
                  ? `● Se recomiendan entre ${RECOMENDADAS.min} y ${RECOMENDADAS.max}`
                  : `Dentro de lo recomendado (${RECOMENDADAS.min} a ${RECOMENDADAS.max})`
              }
              tono={activas.length < RECOMENDADAS.min ? "atencion" : "neutro"}
            />
            <Cifra rotulo="Posts de los últimos 3 meses" valor={String(enVentana)} nota={`Entran a la tanda · ${guardados} guardados en total`} />
            <Cifra
              rotulo="Última lectura"
              valor={ultima ? `${diaYMesCr(ultima)}, ${hora(ultima)}` : "Todavía no"}
              nota={
                ultima
                  ? conError.length === 0
                    ? `✓ ${activas.length === 1 ? "Se leyó" : `Las ${activas.length} se leyeron`} sin errores`
                    : `✕ ${conError.length === 1 ? "Una falló" : `${conError.length} fallaron`}`
                  : "La primera lectura es en la próxima tanda"
              }
              tono={ultima ? (conError.length === 0 ? "hecho" : "error") : "neutro"}
            />
          </section>
        )}

        {conError.length > 0 && (
          <Alert variant="danger" title="No se pudieron leer en la última tanda">
            {conError.map((f) => `${f.label ?? urlCorta(f.profileUrl)}: ${f.lastFetchError}`).join(" · ")}
          </Alert>
        )}

        {loading ? (
          <TableSkeleton columns={5} rows={4} />
        ) : fuentes.length === 0 ? (
          <EmptyState
            variant="dashed"
            title="Todavía no hay fuentes"
            description={canEdit ? `Agrega entre ${RECOMENDADAS.min} y ${RECOMENDADAS.max} perfiles de LinkedIn para alimentar el motor.` : "El equipo de Marketing todavía no cargó fuentes."}
          />
        ) : (
          <section aria-label="Perfiles" className="space-y-2.5">
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[820px] border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                    <th className="border-b border-line px-4 py-2.5 font-semibold">Fuente</th>
                    <th className="w-[130px] border-b border-line px-4 py-2.5 text-right font-semibold">Últimos 3 meses</th>
                    <th className="w-[110px] border-b border-line px-4 py-2.5 text-right font-semibold">Guardados</th>
                    <th className="w-[210px] border-b border-line px-4 py-2.5 font-semibold">Inspiró</th>
                    <th className="w-[150px] border-b border-line px-4 py-2.5 font-semibold">Última lectura</th>
                    <th className="w-[100px] border-b border-line px-4 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fuentes.map((f) => {
                    const parte = totalIdeas > 0 ? Math.round((f.ideasInspiradas / totalIdeas) * 100) : 0;
                    return (
                      <tr key={f.id} className={f.active ? "" : "opacity-60"}>
                        <td className="border-b border-line px-4 py-3">
                          <span className="flex flex-col gap-0.5">
                            <span className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-fg">{f.label || urlCorta(f.profileUrl)}</span>
                              {!f.active && <ChipGris>Pausada</ChipGris>}
                            </span>
                            <a href={f.profileUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-fg-muted hover:text-fg">
                              {urlCorta(f.profileUrl)} ↗
                            </a>
                          </span>
                        </td>
                        <td className="border-b border-line px-4 py-3 text-right tabular-nums text-fg">{f.postsEnVentana}</td>
                        <td className="border-b border-line px-4 py-3 text-right tabular-nums text-fg-muted">{f._count.posts}</td>
                        <td className="border-b border-line px-4 py-3">
                          <span className="flex flex-col gap-1">
                            <span className="tabular-nums text-fg">
                              {f.ideasInspiradas} de {totalIdeas} publicaciones
                            </span>
                            <span aria-hidden="true" className="block h-1 overflow-hidden rounded-full bg-surface-hover">
                              <span className="block h-1 rounded-full bg-fg-muted" style={{ width: `${parte}%` }} />
                            </span>
                          </span>
                        </td>
                        <td className="border-b border-line px-4 py-3">
                          {f.lastFetchedAt ? (
                            <span className="flex flex-col gap-0.5">
                              <span className="text-fg">
                                {diaYMesCr(f.lastFetchedAt)}, {hora(f.lastFetchedAt)}
                              </span>
                              <span className={cn("text-xs", f.lastFetchError ? "text-danger-ink" : "text-success-ink")}>
                                {f.lastFetchError ? "✕ Falló" : "✓ Sin errores"}
                              </span>
                            </span>
                          ) : (
                            <span className="text-fg-muted">Todavía no</span>
                          )}
                        </td>
                        <td className="whitespace-nowrap border-b border-line px-4 py-3 text-right">
                          {canEdit && (
                            <span className="inline-flex items-center gap-1">
                              <BotonTexto onClick={() => alternar(f)}>{f.active ? "Pausar" : "Activar"}</BotonTexto>
                              <Menu
                                aria-label={`Más acciones para ${f.label ?? urlCorta(f.profileUrl)}`}
                                align="end"
                                triggerClassName="rounded-md p-1 text-fg-muted hover:bg-surface-hover hover:text-fg"
                                trigger={<IconoMas />}
                                items={[{ key: "borrar", label: "Borrar", danger: true, onSelect: () => setConfirmBorrar(f) }]}
                              />
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-fg-muted">
              «Inspiró» cuenta, de las {totalIdeas} publicaciones que propuso el agente, cuántas citan al menos un post de esa fuente.
            </p>
          </section>
        )}
      </div>

      <Drawer
        open={drawer}
        onClose={cerrar}
        title="Agregar fuente"
        description="Un perfil o una página de empresa pública de LinkedIn."
        footer={
          <>
            <Button variant="secondary" onClick={cerrar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={agregar} disabled={busy || !form.profileUrl.trim()}>
              {busy ? "Agregando…" : "Agregar la fuente"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Enlace del perfil">
            <Input value={form.profileUrl} onChange={(e) => setForm({ ...form, profileUrl: e.target.value })} placeholder="https://www.linkedin.com/in/…" autoFocus />
          </Field>
          <Field label="Nombre para mostrar" hint="Opcional. Si no lo pones, se muestra el enlace.">
            <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          </Field>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirmBorrar}
        onCancel={() => setConfirmBorrar(null)}
        onConfirm={async () => {
          const f = confirmBorrar;
          setConfirmBorrar(null);
          if (f) await borrar(f);
        }}
        title="¿Borrar esta fuente?"
        description="Se borran también sus posts guardados. No se puede deshacer; si solo quieres que no se lea, usa «Pausar»."
        confirmLabel="Borrar"
      />
    </>
  );
}

function Cifra({
  rotulo,
  valor,
  nota,
  tono = "neutro",
}: {
  rotulo: string;
  valor: string;
  nota: string;
  tono?: "neutro" | "atencion" | "hecho" | "error";
}) {
  return (
    <div className="flex flex-col gap-1 rounded-xl border border-line bg-surface p-4">
      <span className="text-xs text-fg-muted">{rotulo}</span>
      <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{valor}</span>
      <span
        className={cn(
          "text-xs",
          tono === "atencion" ? "text-warn-ink" : tono === "hecho" ? "text-success-ink" : tono === "error" ? "text-danger-ink" : "text-fg-muted",
        )}
      >
        {nota}
      </span>
    </div>
  );
}

function IconoMas() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  );
}
