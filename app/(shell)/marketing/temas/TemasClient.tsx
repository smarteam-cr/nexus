"use client";

/**
 * Temas (/marketing/temas) — sobre qué escribe el agente (rediseño del 2026-10-04, sistema «Nexus · interfaz
 * interna»). El modelo Prisma sigue llamándose ContentPillar.
 *
 *  - Lo que sugiere el agente va arriba como fila azul con su chispa y su porqué: «Crear el tema» o «Descartar».
 *    Aprobar crea el tema y le pasa las publicaciones que esperaban ese nombre.
 *  - La tabla dice cuántas publicaciones tiene cada tema y cuántas siguen sin revisar: así se ve qué tema llena la
 *    cola (medido ese día: el tema en campaña tenía 31 de las 75 sin revisar).
 *  - El tema en campaña lleva su chip; poner o quitar de campaña, pausar y borrar van en el menú «⋯».
 */
import { useCallback, useEffect, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button, ConfirmDialog, Drawer, EmptyState, Field, Input, Menu, PageHeader, Textarea, TableSkeleton } from "@/components/ui";
import { BotonAzul, BotonTexto, IconoDeSugerencia } from "@/components/ui/sistema";
import { BotonClaro, ChipActivo, ChipGris, Rotulo } from "@/components/marketing/piezas";

interface Tema {
  id: string;
  name: string;
  description: string | null;
  origin: "HUMAN" | "AGENT";
  active: boolean;
  isCampaign: boolean;
  sinRevisar: number;
  _count: { ideas: number };
}
interface Sugerencia {
  id: string;
  name: string;
  description: string | null;
  rationale: string | null;
}

const FORM_VACIO = { name: "", description: "" };

/** En campaña primero, después los que más publicaciones tienen; los pausados al final. */
function orden(a: Tema, b: Tema): number {
  if (a.active !== b.active) return a.active ? -1 : 1;
  if (a.isCampaign !== b.isCampaign) return a.isCampaign ? -1 : 1;
  return b._count.ideas - a._count.ideas;
}

export default function TemasClient({ canEdit }: { canEdit: boolean }) {
  const toast = useToast();
  const [temas, setTemas] = useState<Tema[]>([]);
  const [sugerencias, setSugerencias] = useState<Sugerencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState<Tema | null>(null);
  const [porQueAbierto, setPorQueAbierto] = useState<Set<string>>(new Set());

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ pillars: Tema[]; suggestions: Sugerencia[] }>("/api/marketing/pillars");
      setTemas([...d.pillars].sort(orden));
      setSugerencias(d.suggestions);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar los temas.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    load();
  }, [load]);

  const revisarSugerencia = async (id: string, action: "approve" | "discard") => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await fetchJson<{ ok: boolean; relinkedIdeas?: number }>(`/api/marketing/pillar-suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      if (action === "approve") {
        toast.success(
          `Tema creado${r.relinkedIdeas ? `. ${r.relinkedIdeas === 1 ? "Una publicación quedó" : `${r.relinkedIdeas} publicaciones quedaron`} con este tema` : ""}.`,
        );
      } else {
        toast.info("Sugerencia descartada.");
      }
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const cerrar = () => {
    setDrawer(false);
    setForm(FORM_VACIO);
    setEditando(null);
  };

  const guardar = async () => {
    if (!form.name.trim() || busy) return;
    setBusy(true);
    try {
      const body = { name: form.name.trim(), description: form.description.trim() || null };
      await fetchJson(editando ? `/api/marketing/pillars/${editando}` : "/api/marketing/pillars", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(editando ? "Tema actualizado." : "Tema creado.");
      cerrar();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const cambiar = async (t: Tema, body: { active?: boolean; isCampaign?: boolean }, msg: string) => {
    try {
      await fetchJson(`/api/marketing/pillars/${t.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.info(msg);
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    }
  };

  const borrar = async (t: Tema) => {
    try {
      await fetchJson(`/api/marketing/pillars/${t.id}`, { method: "DELETE" });
      toast.info("Tema borrado. Sus publicaciones quedaron sin tema.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  const activos = temas.filter((t) => t.active).length;

  return (
    <>
      <PageHeader
        title="Temas"
        description="Los temas sobre los que escribe el agente. El tema en campaña pesa más en cada tanda; uno pausado no se usa."
        action={
          canEdit ? (
            <BotonClaro
              onClick={() => {
                setForm(FORM_VACIO);
                setEditando(null);
                setDrawer(true);
              }}
            >
              Nuevo tema
            </BotonClaro>
          ) : undefined
        }
      />
      <div className="space-y-6">
        {sugerencias.length > 0 && (
          <section aria-label="Temas que sugiere el agente" className="flex flex-col gap-1.5">
            <Rotulo azul>
              <IconoDeSugerencia className="h-[13px] w-[13px]" />
              Sugeridos por el agente · {sugerencias.length}
            </Rotulo>
            {sugerencias.map((s) => (
              <div key={s.id} className="flex flex-wrap items-start gap-2.5 rounded-lg border border-info-line bg-info-surface py-2.5 pl-3 pr-2.5">
                <IconoDeSugerencia className="mt-0.5 h-[15px] w-[15px] flex-shrink-0 text-brand" />
                <div className="flex min-w-0 flex-1 basis-[28rem] flex-col gap-1">
                  <span className="text-[11px] font-semibold text-brand">Tema nuevo</span>
                  <span className="text-sm font-semibold leading-5 text-fg">{s.name}</span>
                  {s.description && <span className="text-[13px] leading-[19px] text-fg-secondary">{s.description}</span>}
                  {s.rationale && (
                    <span className="text-xs leading-[17px] text-fg-muted">
                      {porQueAbierto.has(s.id) ? (
                        <>Por qué: {s.rationale} · </>
                      ) : null}
                      <button
                        type="button"
                        className="font-medium text-brand hover:text-brand-light"
                        onClick={() =>
                          setPorQueAbierto((p) => {
                            const n = new Set(p);
                            if (n.has(s.id)) n.delete(s.id);
                            else n.add(s.id);
                            return n;
                          })
                        }
                      >
                        {porQueAbierto.has(s.id) ? "ocultar" : "ver de dónde sale"}
                      </button>
                    </span>
                  )}
                </div>
                {canEdit && (
                  <span className="flex items-center gap-1.5">
                    <BotonTexto onClick={() => revisarSugerencia(s.id, "discard")} disabled={busy}>Descartar</BotonTexto>
                    <BotonAzul onClick={() => revisarSugerencia(s.id, "approve")} disabled={busy}>Crear el tema</BotonAzul>
                  </span>
                )}
              </div>
            ))}
          </section>
        )}

        <section aria-label="Temas" className="flex flex-col gap-2.5">
          <div className="flex items-baseline gap-2.5">
            <h2 className="text-sm font-semibold text-fg">Temas</h2>
            {!loading && (
              <span className="text-xs text-fg-muted">
                {activos} {activos === 1 ? "activo" : "activos"} · en campaña primero, después los que más publicaciones tienen
              </span>
            )}
          </div>
          {loading ? (
            <TableSkeleton columns={4} rows={8} />
          ) : temas.length === 0 ? (
            <EmptyState
              variant="dashed"
              title="Todavía no hay temas"
              description={canEdit ? "Crea el primero, o espera la tanda del viernes: el agente puede sugerir temas." : "El equipo de Marketing todavía no cargó temas."}
            />
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[720px] border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                    <th className="border-b border-line px-4 py-2.5 font-semibold">Tema</th>
                    <th className="w-[150px] border-b border-line px-4 py-2.5 font-semibold">Publicaciones</th>
                    <th className="w-[140px] border-b border-line px-4 py-2.5 font-semibold">Lo creó</th>
                    <th className="w-[100px] border-b border-line px-4 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {temas.map((t) => (
                    <tr key={t.id} className={t.active ? "" : "opacity-60"}>
                      <td className="border-b border-line px-4 py-3 align-top">
                        <span className="flex flex-col gap-0.5">
                          <span className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-semibold text-fg">{t.name}</span>
                            {t.isCampaign && t.active && <ChipActivo>● En campaña</ChipActivo>}
                            {!t.active && <ChipGris>Pausado</ChipGris>}
                          </span>
                          {t.description && <span className="line-clamp-2 max-w-[640px] text-fg-muted">{t.description}</span>}
                        </span>
                      </td>
                      <td className="border-b border-line px-4 py-3 align-top tabular-nums">
                        <span className="flex flex-col gap-0.5">
                          <span className="text-fg">{t._count.ideas}</span>
                          {t.sinRevisar > 0 && <span className="text-xs text-fg-muted">{t.sinRevisar} sin revisar</span>}
                        </span>
                      </td>
                      <td className="border-b border-line px-4 py-3 align-top text-fg-secondary">
                        {t.origin === "AGENT" ? "El agente" : "El equipo"}
                      </td>
                      <td className="whitespace-nowrap border-b border-line px-4 py-3 text-right align-top">
                        {canEdit && (
                          <span className="inline-flex items-center gap-1">
                            <BotonTexto
                              onClick={() => {
                                setEditando(t.id);
                                setForm({ name: t.name, description: t.description ?? "" });
                                setDrawer(true);
                              }}
                            >
                              Editar
                            </BotonTexto>
                            <Menu
                              aria-label={`Más acciones para ${t.name}`}
                              align="end"
                              triggerClassName="rounded-md p-1 text-fg-muted hover:bg-surface-hover hover:text-fg"
                              trigger={<IconoMas />}
                              items={[
                                {
                                  key: "campana",
                                  label: t.isCampaign ? "Quitar de campaña" : "Poner en campaña",
                                  onSelect: () =>
                                    cambiar(
                                      t,
                                      { isCampaign: !t.isCampaign },
                                      t.isCampaign ? "Ya no está en campaña." : "En campaña: la próxima tanda lo va a priorizar.",
                                    ),
                                },
                                {
                                  key: "activo",
                                  label: t.active ? "Pausar" : "Activar",
                                  onSelect: () => cambiar(t, { active: !t.active }, t.active ? "Pausado: el agente no lo usa." : "Activado."),
                                },
                                { key: "borrar", label: "Borrar", danger: true, separatorBefore: true, onSelect: () => setConfirmBorrar(t) },
                              ]}
                            />
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      <Drawer
        open={drawer}
        onClose={cerrar}
        title={editando ? "Editar tema" : "Nuevo tema"}
        footer={
          <>
            <Button variant="secondary" onClick={cerrar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardar} disabled={busy || !form.name.trim()}>
              {busy ? "Guardando…" : editando ? "Guardar los cambios" : "Crear el tema"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Por ejemplo: IA aplicada a revenue" autoFocus />
          </Field>
          <Field label="Qué cubre" hint="Opcional. El agente lo lee para saber qué entra en el tema.">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
          </Field>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirmBorrar}
        onCancel={() => setConfirmBorrar(null)}
        onConfirm={async () => {
          const t = confirmBorrar;
          setConfirmBorrar(null);
          if (t) await borrar(t);
        }}
        title={`¿Borrar «${confirmBorrar?.name ?? ""}»?`}
        description="Sus publicaciones no se borran: quedan sin tema."
        confirmLabel="Borrar"
      />
    </>
  );
}

function IconoMas() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
      <path d="M5 12h.01M12 12h.01M19 12h.01" />
    </svg>
  );
}
