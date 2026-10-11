"use client";

/**
 * components/tareas/ComentariosDeLaTarea.tsx — conversar sobre una tarea, en su cajón (docs/tareas-plan.md §5.2).
 *
 * Los ve quien ve la tarea. Comentar avisa a los otros involucrados (responsable, quien la pidió y quien la creó). Lo
 * tuyo se edita y se quita (no se borra: se archiva). Ctrl+Enter envía.
 */
import { useCallback, useEffect, useState } from "react";
import { Textarea } from "@/components/ui";
import { BotonBlanco, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { diaYHora } from "@/lib/tareas/semana";
import type { ComentarioVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";

export function ComentariosDeLaTarea({ tareaId, onCambio }: { tareaId: string; onCambio?: () => void }) {
  const toast = useToast();
  const [comentarios, setComentarios] = useState<ComentarioVista[] | null>(null);
  const [nuevo, setNuevo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [editando, setEditando] = useState<{ id: string; cuerpo: string } | null>(null);

  const cargar = useCallback(async () => {
    try {
      setComentarios((await apiTareas.comentarios(tareaId)).comentarios);
    } catch {
      setComentarios([]);
    }
  }, [tareaId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function enviar() {
    const cuerpo = nuevo.trim();
    if (!cuerpo || enviando) return;
    setEnviando(true);
    try {
      await apiTareas.comentar(tareaId, cuerpo);
      setNuevo("");
      await cargar();
      onCambio?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo comentar.");
    } finally {
      setEnviando(false);
    }
  }

  async function guardarEdicion() {
    if (!editando || !editando.cuerpo.trim()) return;
    try {
      await apiTareas.cambiarComentario(editando.id, { accion: "editar", cuerpo: editando.cuerpo.trim() });
      setEditando(null);
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    }
  }

  async function quitar(id: string) {
    try {
      await apiTareas.cambiarComentario(id, { accion: "archivar" });
      await cargar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo quitar.");
    }
  }

  return (
    <div className="space-y-2" data-recorrido="tareas.comentarios">
      <p className={ROTULO_DEL_SISTEMA}>Comentarios{comentarios && comentarios.length ? ` · ${comentarios.length}` : ""}</p>
      {comentarios === null ? (
        <p className="text-xs text-fg-muted">Cargando…</p>
      ) : comentarios.length === 0 ? (
        <p className="text-xs text-fg-muted">Nadie comentó todavía.</p>
      ) : (
        <ul className="space-y-2">
          {comentarios.map((c) => (
            <li key={c.id} className="rounded-lg border border-line bg-surface px-3 py-2">
              <p className="text-xs text-fg-muted">
                <span className="font-medium text-fg">{c.autor.nombre}</span> · {diaYHora(c.cuando)}
                {c.editado ? " · editado" : ""}
              </p>
              {editando?.id === c.id ? (
                <div className="mt-1.5 space-y-1.5">
                  <Textarea
                    value={editando.cuerpo}
                    onChange={(e) => setEditando({ id: c.id, cuerpo: e.target.value })}
                    rows={3}
                    maxLength={4000}
                    aria-label="Editar el comentario"
                  />
                  <div className="flex items-center gap-2">
                    <BotonBlanco onClick={() => void guardarEdicion()} disabled={!editando.cuerpo.trim()}>
                      Guardar
                    </BotonBlanco>
                    <BotonTexto onClick={() => setEditando(null)}>Cancelar</BotonTexto>
                  </div>
                </div>
              ) : (
                <>
                  <p className="mt-1 whitespace-pre-wrap text-[13px] text-fg">{c.cuerpo}</p>
                  {c.propio && (
                    <div className="mt-1 flex items-center gap-2">
                      <BotonTexto onClick={() => setEditando({ id: c.id, cuerpo: c.cuerpo })}>Editar</BotonTexto>
                      <BotonTexto onClick={() => void quitar(c.id)}>Quitar</BotonTexto>
                    </div>
                  )}
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <Textarea
        value={nuevo}
        onChange={(e) => setNuevo(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void enviar();
          }
        }}
        rows={2}
        maxLength={4000}
        placeholder="Escribe un comentario. Le llega a quien tiene la tarea y a quien la pidió."
        aria-label="Nuevo comentario"
      />
      <div className="flex justify-end">
        <BotonBlanco onClick={() => void enviar()} disabled={!nuevo.trim() || enviando}>
          {enviando ? "Enviando…" : "Comentar"}
        </BotonBlanco>
      </div>
    </div>
  );
}
