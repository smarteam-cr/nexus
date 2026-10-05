"use client";

/**
 * Audiencia › Buyer personas (/marketing/personas) — las personas que deciden la compra, insumo del agente
 * (rediseño del 2026-10-04, sistema «Nexus · interfaz interna»): tarjetas en dos columnas con lo que le duele y lo
 * que quiere cada una, a la vista. Crear y editar viven en un panel lateral.
 */
import { useState, useEffect, useCallback } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button, CardsSkeleton, ConfirmDialog, Drawer, EmptyState, Field, Input, Menu, PageHeader, Textarea } from "@/components/ui";
import { BotonTexto } from "@/components/ui/sistema";
import AudienciaTabs from "@/components/marketing/AudienciaTabs";
import { Chip, ChipGris, Rotulo } from "@/components/marketing/piezas";

interface Persona {
  id: string;
  name: string;
  role: string | null;
  description: string;
  pains: string | null;
  goals: string | null;
  active: boolean;
}

const FORM_VACIO = { name: "", role: "", description: "", pains: "", goals: "" };

export default function PersonasClient({ canEdit, conteos }: { canEdit: boolean; conteos: { icp: number; personas: number } }) {
  const toast = useToast();
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [loading, setLoading] = useState(true);
  const [drawer, setDrawer] = useState(false);
  const [form, setForm] = useState(FORM_VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmBorrar, setConfirmBorrar] = useState<Persona | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ personas: Persona[] }>("/api/marketing/personas");
      setPersonas(d.personas);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las buyer personas.");
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
    setEditando(null);
  };

  const guardar = async () => {
    if (!form.name.trim() || !form.description.trim() || busy) return;
    setBusy(true);
    try {
      const body = {
        name: form.name.trim(),
        role: form.role.trim() || null,
        description: form.description.trim(),
        pains: form.pains.trim() || null,
        goals: form.goals.trim() || null,
      };
      await fetchJson(editando ? `/api/marketing/personas/${editando}` : "/api/marketing/personas", {
        method: editando ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(editando ? "Buyer persona actualizada." : "Buyer persona creada.");
      cerrar();
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const alternar = async (p: Persona) => {
    try {
      await fetchJson(`/api/marketing/personas/${p.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ active: !p.active }),
      });
      toast.info(p.active ? "Pausada: el agente no la tiene en cuenta." : "Activada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    }
  };

  const borrar = async (p: Persona) => {
    try {
      await fetchJson(`/api/marketing/personas/${p.id}`, { method: "DELETE" });
      toast.info("Buyer persona borrada.");
      load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  return (
    <>
      <PageHeader
        title="Audiencia"
        description={`A quién le escribe el agente: la empresa que buscamos y las personas que deciden la compra.${canEdit ? "" : " Tu rol puede verla pero no editarla."}`}
        action={
          canEdit ? (
            <Button
              variant="primary"
              onClick={() => {
                setForm(FORM_VACIO);
                setEditando(null);
                setDrawer(true);
              }}
            >
              Agregar persona
            </Button>
          ) : undefined
        }
      />
      <div className="space-y-6">
        <AudienciaTabs icp={conteos.icp} personas={conteos.personas} />
        {loading ? (
          <div aria-label="Cargando las buyer personas">
            <CardsSkeleton count={4} columns={2} breakpoint="md" minH="min-h-[260px]" />
          </div>
        ) : personas.length === 0 ? (
          <EmptyState
            variant="dashed"
            title="Todavía no hay buyer personas"
            description={canEdit ? "Agrega la primera: quién es, qué le duele y qué quiere." : "El equipo de Marketing todavía no cargó buyer personas."}
          />
        ) : (
          <section aria-label="Buyer personas" className="grid gap-3 md:grid-cols-2">
            {personas.map((p) => (
              <article key={p.id} className={`flex flex-col gap-3 rounded-xl border border-line bg-surface p-4 ${p.active ? "" : "opacity-60"}`}>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="text-[15px] font-semibold leading-5 text-fg">{p.name}</h2>
                  {p.role && <Chip className="px-2 py-px text-[11px]">{p.role}</Chip>}
                  {!p.active && <ChipGris>Pausada</ChipGris>}
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-[19px] text-fg-secondary">{p.description}</p>
                {(p.pains || p.goals) && (
                  <div className="grid gap-3 border-t border-line pt-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1">
                      <Rotulo>Le duele</Rotulo>
                      <span className="whitespace-pre-wrap text-[13px] leading-[19px] text-fg-secondary">{p.pains || "Sin cargar"}</span>
                    </div>
                    <div className="flex flex-col gap-1">
                      <Rotulo>Quiere</Rotulo>
                      <span className="whitespace-pre-wrap text-[13px] leading-[19px] text-fg-secondary">{p.goals || "Sin cargar"}</span>
                    </div>
                  </div>
                )}
                {canEdit && (
                  <div className="mt-auto flex items-center gap-1">
                    <BotonTexto
                      onClick={() => {
                        setEditando(p.id);
                        setForm({ name: p.name, role: p.role ?? "", description: p.description, pains: p.pains ?? "", goals: p.goals ?? "" });
                        setDrawer(true);
                      }}
                    >
                      Editar
                    </BotonTexto>
                    <BotonTexto onClick={() => alternar(p)}>{p.active ? "Pausar" : "Activar"}</BotonTexto>
                    <Menu
                      aria-label={`Más acciones para ${p.name}`}
                      triggerClassName="rounded-md p-1 text-fg-muted hover:bg-surface-hover hover:text-fg"
                      trigger={
                        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                          <path d="M5 12h.01M12 12h.01M19 12h.01" />
                        </svg>
                      }
                      items={[{ key: "borrar", label: "Borrar", danger: true, onSelect: () => setConfirmBorrar(p) }]}
                    />
                  </div>
                )}
              </article>
            ))}
          </section>
        )}
      </div>

      <Drawer
        open={drawer}
        onClose={cerrar}
        title={editando ? "Editar buyer persona" : "Agregar buyer persona"}
        footer={
          <>
            <Button variant="secondary" onClick={cerrar}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={guardar} disabled={busy || !form.name.trim() || !form.description.trim()}>
              {busy ? "Guardando…" : editando ? "Guardar los cambios" : "Agregar la persona"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Por ejemplo: Director comercial" autoFocus />
          </Field>
          <Field label="Papel en la compra" hint="Opcional. Por ejemplo: decisor final, habilitador.">
            <Input value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} />
          </Field>
          <Field label="Quién es">
            <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={4} />
          </Field>
          <Field label="Qué le duele" hint="Opcional.">
            <Textarea value={form.pains} onChange={(e) => setForm({ ...form, pains: e.target.value })} rows={3} />
          </Field>
          <Field label="Qué quiere" hint="Opcional.">
            <Textarea value={form.goals} onChange={(e) => setForm({ ...form, goals: e.target.value })} rows={3} />
          </Field>
        </div>
      </Drawer>

      <ConfirmDialog
        open={!!confirmBorrar}
        onCancel={() => setConfirmBorrar(null)}
        onConfirm={async () => {
          const p = confirmBorrar;
          setConfirmBorrar(null);
          if (p) await borrar(p);
        }}
        title={`¿Borrar «${confirmBorrar?.name ?? ""}»?`}
        description="El agente deja de tenerla en cuenta. No se puede deshacer; si solo quieres apartarla, usa «Pausar»."
        confirmLabel="Borrar"
      />
    </>
  );
}
