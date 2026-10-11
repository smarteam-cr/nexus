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
 *
 * ── EL FORMULARIO DE LA PREVENTA (2026-10-07) ────────────────────────────────
 * Pedido de Elías: el mismo botón y la misma forma en todo «Contexto adicional». El «Agregar fuente»
 * punteado se fue: al pie va «+ Sumar una sesión o un documento» (`SumarFuente`), que pega el texto o
 * sube un archivo. El archivo queda en Información del cliente › Documentos (`adjunto.origen`) y su
 * texto, como una fuente más de esta columna.
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import SumarFuente, { fechaDeLaFuente, tituloConFecha, type DatosPegados, type DatosSubidos } from "@/components/contexto/SumarFuente";
import { subirAdjuntoDelProyecto } from "@/lib/documents/subir-adjunto";
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

/** El vacío de toda columna de fuentes manuales: el mismo de la preventa. */
export const VACIO_DE_LAS_FUENTES =
  "Nada sumado. Una llamada de Gong, una minuta o el resumen del Smartflow: súmalo y el agente lo lee como una transcripción.";

export default function FuentesManualesColumn({
  endpoint,
  canEdit,
  onCount,
  tope,
  largoQueLee,
  adjunto,
}: {
  /** Base de la API: GET/POST acá y DELETE en `${endpoint}/${id}`. */
  endpoint: string;
  canEdit: boolean;
  /** Dónde queda un archivo subido: el proyecto y desde qué pieza (lib/documents/origen-del-adjunto.ts). */
  adjunto: { projectId: string; origen: string };
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
}) {
  const toast = useToast();
  const [sources, setSources] = useState<FuenteManual[]>([]);
  const [loading, setLoading] = useState(true);

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

  /** Guarda una fuente. Devuelve el error para mostrar en el formulario, o null. */
  const guardar = useCallback(
    async (title: string | null, content: string): Promise<string | null> => {
      try {
        const r = await fetch(endpoint, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title || undefined, content }),
        });
        if (!r.ok) return await motivo(r, "No se pudo guardar la fuente.");
        await fetchSources();
        return null;
      } catch {
        return "No se pudo guardar la fuente: revisa la conexión.";
      }
    },
    [endpoint, fetchSources],
  );

  const alPegar = useCallback(
    (d: DatosPegados) => guardar(tituloConFecha(d.titulo, d.fecha), d.texto),
    [guardar],
  );

  /* El archivo va primero a los documentos de la empresa (queda ahí pase lo que pase) y su texto, después,
     a esta columna. Si el texto no entra, el archivo igual quedó guardado: el error lo dice. */
  const alSubir = useCallback(
    async (d: DatosSubidos): Promise<string | null> => {
      const r = await subirAdjuntoDelProyecto({ ...adjunto, archivo: d.archivo, titulo: d.titulo });
      if (!r.ok) return r.error;
      if (!r.texto) {
        return "No se pudo sacar texto de ese archivo (¿es un PDF escaneado o una imagen?). Quedó en Información del cliente › Documentos; pega aquí el texto.";
      }
      const e = await guardar(tituloConFecha(d.titulo || r.nombre.replace(/\.[^.]+$/, ""), d.fecha), r.texto);
      return e ? `${e} El archivo quedó en Información del cliente › Documentos.` : null;
    },
    [adjunto, guardar],
  );

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
      <div className="flex flex-1 flex-col gap-2">
        <ContextColumnList loading={loading} empty={VACIO_DE_LAS_FUENTES}>
          {sources.map((s) => (
            <ContextRow
              key={s.id}
              icon={CTX_ICONS.note}
              meta={`Sumado el ${fechaDeLaFuente(s.createdAt, false)}`}
              title={s.title || "Sin título"}
              snippet={s.content.slice(0, 120)}
              onRemove={canEdit ? () => removeSource(s.id) : undefined}
              removeTitle="Quitar fuente"
            />
          ))}
        </ContextColumnList>
        {canEdit && <SumarFuente alPegar={alPegar} alSubir={alSubir} />}
      </div>
    </>
  );
}
