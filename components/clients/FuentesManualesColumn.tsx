"use client";

/**
 * components/clients/FuentesManualesColumn.tsx — LA COLUMNA «FUENTES MANUALES» DE UN CONTEXTO.
 *
 * Salió de `ProjectContextSection` (2026-09-23) para servir a DOS contextos: el del handoff
 * (`/handoff-sources`) y el del cronograma (`/timeline/sources`). Misma pantalla, distinto destino;
 * el endpoint llega por prop y nada más cambia.
 *
 * ── LO QUE ARREGLA DE PASO ───────────────────────────────────────────────────
 * La versión vieja se tragaba todo error (`catch { ignore }` y un `if (r.ok)` sin `else`): un 403
 * al pegar una nota dejaba el formulario abierto, sin mensaje, y la persona creía que había
 * guardado. Ahora cada fallo se dice con el motivo que manda el servidor.
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { ContextColumnList, ContextRow, CTX_ICONS } from "./context-column";

export interface FuenteManual {
  id: string;
  title: string | null;
  content: string;
  createdByEmail: string | null;
  createdAt: string;
}

async function motivo(r: Response, porDefecto: string): Promise<string> {
  const d = (await r.json().catch(() => null)) as { error?: string } | null;
  return d?.error ?? porDefecto;
}

export default function FuentesManualesColumn({
  endpoint,
  canEdit,
  onCount,
  tope,
  largoQueLee,
  vacio = "Sin notas ni transcripciones a mano.",
  placeholder = "Pega el transcript o resumen…",
  placeholderTitulo = "Título (ej. Zoom con el cliente)",
  etiquetaAgregar = "Agregar fuente",
}: {
  /** Base de la API: GET/POST acá y DELETE en `${endpoint}/${id}`. */
  endpoint: string;
  canEdit: boolean;
  /** Reporta cuántas fuentes hay (para el contador del encabezado). */
  onCount?: (n: number) => void;
  /**
   * Cuántos caracteres lee el agente en total. Si lo pegado pasa ese número, la columna lo dice:
   * un tope que solo conoce el servidor es texto que la persona cree que el agente leyó.
   */
  tope?: number;
  /**
   * Cuánto suma lo pegado COMO LO LEE EL AGENTE (rótulos, fechas y separadores incluidos). Con ese
   * MISMO número se decide el aviso y se lo muestra: antes el aviso se decidía con el armado del
   * servidor y se imprimía título + contenido, así que cerca del tope decía «suma 11.883… y el agente
   * lee hasta 12.000: no entra» (revisión adversarial, 2026-09-24). Quien conoce el formato (p. ej.
   * `largoDeLasNotas`) lo pasa acá. Recibe las fuentes ENTERAS, con su `createdAt`: las notas del
   * cronograma llevan la fecha de carga en su encabezado. Sin esto, título + contenido.
   */
  largoQueLee?: (fuentes: ReadonlyArray<{ title: string | null; content: string; createdAt?: string }>) => number;
  vacio?: string;
  placeholder?: string;
  placeholderTitulo?: string;
  etiquetaAgregar?: string;
}) {
  const toast = useToast();
  const [sources, setSources] = useState<FuenteManual[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchSources = useCallback(async () => {
    try {
      const r = await fetch(endpoint);
      if (r.ok) {
        const d = await r.json();
        setSources(d.sources ?? []);
      } else {
        toast.error(await motivo(r, "No se pudieron cargar las fuentes manuales."));
      }
    } catch {
      toast.error("No se pudieron cargar las fuentes manuales: revisa la conexión.");
    }
  }, [endpoint, toast]);

  // Carga inicial inline (el setState es post-fetch, no síncrono — patrón sin set-state-in-effect).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(endpoint);
        if (cancelled) return;
        if (r.ok) {
          const d = await r.json();
          if (!cancelled) setSources(d.sources ?? []);
        } else if (r.status !== 401 && r.status !== 403) {
          /* Sin permiso para ver la columna no es un error de la pantalla: pasa todos los días
             (un CSE con el cliente compartido abre el proyecto y el handoff no es suyo). Un toast
             rojo en cada apertura enseña a ignorar los toasts. Las ACCIONES sí avisan: ahí la
             persona intentó algo. */
          toast.error(await motivo(r, "No se pudieron cargar las fuentes manuales."));
        }
      } catch {
        /* Un corte de red al montar no merece un toast: la lista queda vacía y el próximo intento
           (agregar) dice lo que pase. */
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [endpoint, toast]);

  useEffect(() => {
    if (!loading) onCount?.(sources.length);
  }, [loading, sources.length, onCount]);

  const addSource = useCallback(async () => {
    const content = newContent.trim();
    if (!content || saving) return;
    setSaving(true);
    try {
      const r = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: newTitle.trim() || undefined, content }),
      });
      if (r.ok) {
        setNewTitle("");
        setNewContent("");
        setShowAdd(false);
        await fetchSources();
      } else {
        toast.error(await motivo(r, "No se pudo guardar la fuente."));
      }
    } catch {
      toast.error("No se pudo guardar la fuente: revisa la conexión.");
    }
    setSaving(false);
  }, [endpoint, newTitle, newContent, saving, fetchSources, toast]);

  const removeSource = useCallback(
    async (id: string) => {
      try {
        const r = await fetch(`${endpoint}/${id}`, { method: "DELETE" });
        if (!r.ok) toast.error(await motivo(r, "No se pudo quitar la fuente."));
        await fetchSources();
      } catch {
        toast.error("No se pudo quitar la fuente: revisa la conexión.");
      }
    },
    [endpoint, fetchSources, toast],
  );

  const largoTotal = largoQueLee
    ? largoQueLee(sources)
    : sources.reduce((acc, s) => acc + (s.title?.length ?? 0) + s.content.length, 0);
  const pasaElTope = tope !== undefined && largoTotal > tope;

  return (
    <>
      {pasaElTope && (
        <p className="mb-2 rounded-lg border border-warn-line bg-warn-surface px-2.5 py-2 text-[11px] leading-snug text-warn-ink">
          Lo pegado suma {largoTotal.toLocaleString("es-CR")} caracteres y el agente lee hasta{" "}
          {tope!.toLocaleString("es-CR")}: entran enteras las notas más nuevas y lo más viejo se
          recorta o queda afuera. Resume o quita alguna.
        </p>
      )}
      <ContextColumnList loading={loading} empty={vacio}>
        {sources.map((s) => (
          <ContextRow
            key={s.id}
            icon={CTX_ICONS.note}
            meta="Manual"
            title={s.title || "Sin título"}
            snippet={s.content.slice(0, 120)}
            onRemove={canEdit ? () => removeSource(s.id) : undefined}
            removeTitle="Quitar fuente"
          />
        ))}
      </ContextColumnList>

      {canEdit &&
        (showAdd ? (
          <div className="mt-2 space-y-1.5 rounded-lg border border-line p-2">
            <input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder={placeholderTitulo}
              className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand"
            />
            <textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              rows={3}
              placeholder={placeholder}
              className="w-full px-2 py-1.5 text-[11px] bg-surface border border-line rounded-lg text-fg focus:outline-none focus:border-brand resize-y"
            />
            <div className="flex justify-end gap-1.5">
              <button
                onClick={() => {
                  setShowAdd(false);
                  setNewTitle("");
                  setNewContent("");
                }}
                className="text-[11px] text-fg-muted hover:text-fg px-2 py-1 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={addSource}
                disabled={saving || newContent.trim().length === 0}
                className="text-[11px] font-semibold text-primary-fg bg-brand hover:bg-brand-dark disabled:opacity-40 px-2.5 py-1 rounded-lg transition-colors"
              >
                {saving ? "Agregando…" : "Agregar"}
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowAdd(true)}
            className="mt-2 w-full inline-flex items-center justify-center gap-1 text-[11px] font-medium text-fg-muted hover:text-fg-secondary border border-dashed border-line rounded-lg px-2 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {etiquetaAgregar}
          </button>
        ))}
    </>
  );
}
