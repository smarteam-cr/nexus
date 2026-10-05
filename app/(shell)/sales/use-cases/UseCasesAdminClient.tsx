"use client";

/**
 * UseCasesAdminClient — el catálogo de casos de uso de Ventas (rediseño del 2026-10-05).
 *
 * Servicios con precio fijo que quien vende marca en el contexto de una propuesta: entran al
 * documento con su precio exacto y el agente nunca los escribe ni los inventa. Una tabla con
 * «Activos / Apagados» y el filtro por tipo de propuesta; el formulario se abre al crear o al
 * editar. Borrar solo se puede sin propuestas que lo usen (409 → el servidor sugiere apagarlo).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { ConfirmDialog, ListSkeleton, Segmentado } from "@/components/ui";
import { cn } from "@/lib/cn";
import { BC_TYPE_CATALOG, resolveBcType } from "@/lib/business-cases/case-types";
import { productTags, scopeTags } from "@/lib/tags/catalog";

type UseCaseRow = {
  id: string;
  title: string;
  description: string;
  price: string | null;
  appliesTo: string[];
  tags: string[];
  active: boolean;
  order: number;
};

const EMPTY_FORM = { title: "", description: "", price: "", appliesTo: [] as string[], tags: [] as string[] };
const ROTULO = "text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted";
const BOTON_AZUL =
  "inline-flex h-9 items-center rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50";

type Vista = "activos" | "apagados";

export default function UseCasesAdminClient() {
  const toast = useToast();
  const [rows, setRows] = useState<UseCaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  /** null = formulario cerrado · "nuevo" · el id del que se edita. */
  const [editando, setEditando] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [vista, setVista] = useState<Vista>("activos");
  const [tipo, setTipo] = useState("");

  const load = useCallback(async () => {
    try {
      const d = await fetchJson<{ useCases: UseCaseRow[] }>("/api/use-cases");
      setRows(d.useCases);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo cargar el catálogo.");
    } finally {
      setLoading(false);
    }
  }, [toast]);
  useEffect(() => {
    void load();
  }, [load]);

  const toggleIn = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const abrirNuevo = () => {
    setEditando("nuevo");
    setForm(EMPTY_FORM);
  };
  const abrirEdicion = (r: UseCaseRow) => {
    setEditando(r.id);
    setForm({ title: r.title, description: r.description, price: r.price ?? "", appliesTo: r.appliesTo, tags: r.tags });
  };
  const cerrar = () => {
    setEditando(null);
    setForm(EMPTY_FORM);
  };

  const save = async () => {
    if (!form.title.trim() || !form.description.trim() || busy) return;
    setBusy(true);
    try {
      const body = {
        title: form.title,
        description: form.description,
        price: form.price.trim() || null,
        appliesTo: form.appliesTo,
        tags: form.tags,
      };
      if (editando && editando !== "nuevo") {
        await fetchJson(`/api/use-cases/${editando}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast.success("Caso de uso actualizado.");
      } else {
        await fetchJson("/api/use-cases", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
        toast.success("Caso de uso creado.");
      }
      cerrar();
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setBusy(false);
    }
  };

  const toggleActive = async (r: UseCaseRow) => {
    try {
      await fetchJson(`/api/use-cases/${r.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ active: !r.active }) });
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar.");
    }
  };

  const remove = async (id: string) => {
    try {
      await fetchJson(`/api/use-cases/${id}`, { method: "DELETE" });
      toast.info("Caso de uso borrado.");
      void load();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar.");
    }
  };

  const allTags = [...productTags(), ...scopeTags()];
  const chip = (selectedList: string[], value: string) =>
    cn(
      "cursor-pointer rounded-full border px-2.5 py-1 text-xs transition-colors",
      selectedList.includes(value) ? "border-brand bg-info-surface font-semibold text-brand" : "border-line text-fg-muted hover:text-fg",
    );

  const activos = rows.filter((r) => r.active).length;
  const visibles = useMemo(
    () =>
      rows.filter(
        (r) => (vista === "activos" ? r.active : !r.active) && (!tipo || r.appliesTo.length === 0 || r.appliesTo.includes(tipo)),
      ),
    [rows, vista, tipo],
  );

  const formulario = editando && (
    <section className="flex flex-col gap-3 rounded-xl border border-info-line bg-surface p-4">
      <span className="text-sm font-semibold text-fg">{editando === "nuevo" ? "Nuevo caso de uso" : "Editar caso de uso"}</span>
      <input
        value={form.title}
        onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
        placeholder="Título (ej. Portal de autoservicio de tickets)"
        className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none"
      />
      <textarea
        value={form.description}
        onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
        rows={3}
        placeholder="Qué incluye, en una o dos líneas (quien vende la ve al marcarlo, y puede entrar a la propuesta)…"
        className="resize-y rounded-lg border border-line bg-surface px-3 py-2 text-sm text-fg focus:border-brand focus:outline-none"
      />
      <input
        value={form.price}
        onChange={(e) => setForm((f) => ({ ...f, price: e.target.value }))}
        placeholder="Precio, como lo lee el cliente (ej. «USD 1.200» o «desde $500 al mes»). Opcional"
        className="h-9 rounded-lg border border-line bg-surface px-3 text-sm text-fg focus:border-brand focus:outline-none"
      />
      <div className="flex flex-col gap-1.5">
        <span className={ROTULO}>Aplica a · vacío = a todos los tipos</span>
        <div className="flex flex-wrap gap-1.5">
          {BC_TYPE_CATALOG.map((t) => (
            <button key={t.id} type="button" className={chip(form.appliesTo, t.id)} onClick={() => setForm((f) => ({ ...f, appliesTo: toggleIn(f.appliesTo, t.id) }))}>
              {t.shortLabel}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={ROTULO}>Etiquetas</span>
        <div className="flex flex-wrap gap-1.5">
          {allTags.map((t) => (
            <button key={t.slug} type="button" className={chip(form.tags, t.slug)} onClick={() => setForm((f) => ({ ...f, tags: toggleIn(f.tags, t.slug) }))}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button type="button" onClick={cerrar} className="px-3 py-1.5 text-[13px] text-fg-muted transition-colors hover:text-fg">
          Cancelar
        </button>
        <button type="button" onClick={() => void save()} disabled={busy || !form.title.trim() || !form.description.trim()} className={BOTON_AZUL}>
          {busy ? "Guardando…" : editando === "nuevo" ? "Crear caso de uso" : "Guardar cambios"}
        </button>
      </div>
    </section>
  );

  if (loading) return <ListSkeleton rows={5} lines={2} />;

  return (
    <div className="flex flex-col gap-4">
      {rows.length === 0 ? (
        editando ? (
          formulario
        ) : (
          <section className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-line bg-surface-muted px-6 py-14 text-center">
            <span className="text-[15px] font-semibold text-fg">Todavía no hay ningún caso de uso</span>
            <span className="max-w-lg text-[13px] leading-[19px] text-fg-muted">
              Sirven para lo que se vende siempre igual y con el mismo precio: un portal de tickets, una integración estándar, un tablero. Se
              marcan en la propuesta y se cotizan solos, sin que nadie los reescriba.
            </span>
            <button type="button" onClick={abrirNuevo} className={BOTON_AZUL}>
              Crear el primero
            </button>
          </section>
        )
      ) : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <Segmentado
                etiqueta="Activos o apagados"
                opciones={[
                  { clave: "activos", etiqueta: `Activos · ${activos}` },
                  { clave: "apagados", etiqueta: `Apagados · ${rows.length - activos}` },
                ]}
                valor={vista}
                onCambio={setVista}
              />
              <label className="inline-flex items-center gap-2 text-[13px] text-fg-secondary">
                Aplica a
                <select
                  value={tipo}
                  onChange={(e) => setTipo(e.target.value)}
                  className="h-8 rounded-lg border border-line bg-surface px-2 text-[13px] text-fg focus:border-brand focus:outline-none"
                >
                  <option value="">Todos los tipos</option>
                  {BC_TYPE_CATALOG.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.shortLabel}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            {!editando && (
              <button type="button" onClick={abrirNuevo} className={BOTON_AZUL}>
                + Nuevo caso de uso
              </button>
            )}
          </div>

          {formulario}

          {visibles.length === 0 ? (
            <p className="rounded-xl border border-dashed border-line bg-surface px-4 py-6 text-center text-[13px] text-fg-muted">
              {vista === "activos" ? "Ningún caso de uso activo con ese filtro." : "Ningún caso de uso apagado con ese filtro."}
            </p>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[760px] border-collapse text-[13px] leading-[19px]">
                <thead>
                  <tr className="bg-surface-muted text-left">
                    <th className={cn(ROTULO, "border-b border-line px-4 py-2.5")}>Caso de uso</th>
                    <th className={cn(ROTULO, "w-36 border-b border-line px-4 py-2.5")}>Precio</th>
                    <th className={cn(ROTULO, "w-48 border-b border-line px-4 py-2.5")}>Aplica a</th>
                    <th className={cn(ROTULO, "w-20 border-b border-line px-4 py-2.5")}>Activo</th>
                    <th className="w-36 border-b border-line px-4 py-2.5">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visibles.map((r) => (
                    <tr key={r.id} className="align-top">
                      <td className="border-b border-line px-4 py-3">
                        <span className="block text-sm font-semibold text-fg">{r.title}</span>
                        <span className="line-clamp-2 text-xs text-fg-muted">{r.description}</span>
                      </td>
                      <td className="border-b border-line px-4 py-3 font-semibold text-fg">{r.price ?? <span className="font-normal text-fg-muted">—</span>}</td>
                      <td className="border-b border-line px-4 py-3">
                        <span className="flex flex-wrap gap-1">
                          {(r.appliesTo.length ? r.appliesTo.map((t) => resolveBcType(t).shortLabel) : ["Todos los tipos"]).map((l) => (
                            <span key={l} className="rounded-full border border-line px-2 py-0.5 text-xs text-fg-secondary">
                              {l}
                            </span>
                          ))}
                        </span>
                      </td>
                      <td className="border-b border-line px-4 py-3">
                        <button
                          type="button"
                          role="switch"
                          aria-checked={r.active}
                          aria-label={r.active ? "Apagar" : "Activar"}
                          onClick={() => void toggleActive(r)}
                          className={cn(
                            "inline-flex h-[18px] w-8 items-center rounded-full p-0.5 transition-colors",
                            r.active ? "justify-end bg-primary" : "justify-start bg-surface-hover",
                          )}
                        >
                          <span className="h-3.5 w-3.5 rounded-full bg-surface shadow-sm" />
                        </button>
                      </td>
                      <td className="border-b border-line px-4 py-3 text-right">
                        <button type="button" onClick={() => abrirEdicion(r)} className="px-2 py-1 text-xs text-fg-muted transition-colors hover:text-fg">
                          Editar
                        </button>
                        <button type="button" onClick={() => setConfirmDeleteId(r.id)} className="px-2 py-1 text-xs text-fg-muted transition-colors hover:text-danger-ink">
                          Borrar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <span className="text-xs leading-[17px] text-fg-muted">
            Cambiar un precio acá no toca las propuestas ya subidas: cada propuesta guarda el precio con el que se marcó, y quien vende puede
            ajustarlo solo para ese cliente.
          </span>
        </>
      )}

      <ConfirmDialog
        open={!!confirmDeleteId}
        onCancel={() => setConfirmDeleteId(null)}
        onConfirm={async () => {
          const id = confirmDeleteId;
          setConfirmDeleteId(null);
          if (id) await remove(id);
        }}
        title="¿Borrar este caso de uso?"
        description="Solo se puede borrar si ninguna propuesta lo tiene marcado. Si alguna lo usa, apágalo."
        confirmLabel="Borrar"
      />
    </div>
  );
}
