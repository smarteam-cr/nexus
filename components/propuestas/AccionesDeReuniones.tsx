"use client";

/**
 * components/propuestas/AccionesDeReuniones.tsx — sacar reuniones del contexto de una propuesta de a
 * muchas, y deshacerlo (2026-10-08, F-4 de Feedback).
 *
 * Lo pidió Ventas: «para una nueva propuesta de un cliente con el que ya tenemos muchas sesiones debo
 * excluirlas una a una». Elías sumó «vaciar todo y luego buscar», elegir VARIAS y Ctrl+Z. Tres formas
 * de quitar —la X de una fila, las elegidas con su casilla, o todas— y UN historial para deshacerlas:
 * Ctrl+Z (o «Volver a…») devuelve lo último que se quitó, paso por paso, hasta que se recarga.
 *
 * Es un hook y no un componente porque la casilla vive en cada FILA de la columna
 * (`ContextRow.seleccion`) y la barra arriba: los dos leen el mismo estado. Escribe por la MISMA
 * ruta que siempre, en su forma de lista (POST /api/business-cases/[id]/sessions con `sessionIds`):
 * una sola transacción por paso.
 *
 * ⚠ Ctrl+Z solo actúa con el paso Contexto A LA VISTA y sin el foco en un campo de texto: en un campo
 * deshace lo que se escribió, y en el paso Propuesta el documento tiene su propio deshacer.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";

const BOTON = "font-semibold transition-colors disabled:opacity-40";

/** ¿El foco está en algo que tiene su propio deshacer? */
function escribiendo(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  return el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName);
}

export function useAccionesDeReuniones({
  bcId,
  incluidas,
  onCambio,
  onBuscar,
}: {
  bcId: string;
  /** Las reuniones que hoy alimentan la propuesta. */
  incluidas: { sessionId: string }[];
  /** Releer la columna después de escribir. */
  onCambio: () => Promise<void> | void;
  /** Abrir «Buscar» (después de vaciar). */
  onBuscar: () => void;
}) {
  const toast = useToast();
  const [trabajando, setTrabajando] = useState(false);
  const [elegidasCrudas, setElegidas] = useState<Set<string>>(new Set());
  /** Lo que se fue quitando, del más viejo al más nuevo: cada paso de deshacer devuelve el último. */
  const [historial, setHistorial] = useState<string[][]>([]);
  const barraRef = useRef<HTMLDivElement>(null);

  const ids = incluidas.map((s) => s.sessionId);
  // Una elegida que ya no está (la quitó la X, otra pestaña) deja de contar sola.
  const elegidas = ids.filter((id) => elegidasCrudas.has(id));

  const escribir = useCallback(
    async (sessionIds: string[], included: boolean): Promise<boolean> => {
      setTrabajando(true);
      try {
        await fetchJson(`/api/business-cases/${bcId}/sessions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sessionIds, included }),
        });
        await onCambio();
        return true;
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudieron cambiar las reuniones.");
        return false;
      } finally {
        setTrabajando(false);
      }
    },
    [bcId, onCambio, toast],
  );

  /** Quita estas reuniones y deja el paso en el historial. La X de una fila también pasa por acá. */
  const quitar = useCallback(
    async (aQuitar: string[]): Promise<boolean> => {
      if (aQuitar.length === 0 || trabajando) return false;
      const ok = await escribir(aQuitar, false);
      if (ok) {
        setHistorial((h) => [...h, aQuitar]);
        setElegidas(new Set());
        if (aQuitar.length > 1) toast.info(`Se quitaron ${aQuitar.length} reuniones. Ctrl+Z las devuelve.`);
      }
      return ok;
    },
    [escribir, trabajando, toast],
  );

  const deshacer = useCallback(async () => {
    const ultimo = historial[historial.length - 1];
    if (!ultimo || trabajando) return;
    if (await escribir(ultimo, true)) {
      setHistorial((h) => h.slice(0, -1));
      toast.info(ultimo.length === 1 ? "Volvió la reunión." : `Volvieron las ${ultimo.length} reuniones.`);
    }
  }, [historial, trabajando, escribir, toast]);

  // Ctrl+Z / ⌘Z con el paso Contexto a la vista y sin el foco en un campo de texto.
  useEffect(() => {
    if (historial.length === 0) return;
    const alTeclear = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.shiftKey || e.altKey || e.key.toLowerCase() !== "z") return;
      if (escribiendo(e.target) || escribiendo(document.activeElement)) return;
      if (!barraRef.current || barraRef.current.offsetParent === null) return; // el paso está escondido
      e.preventDefault();
      void deshacer();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [historial.length, deshacer]);

  const alternar = (id: string) =>
    setElegidas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /** La casilla de cada fila. */
  const seleccionDe = (id: string, titulo: string) => ({
    marcada: elegidasCrudas.has(id),
    onCambiar: () => alternar(id),
    etiqueta: `Elegir «${titulo}»`,
  });

  const ultimo = historial[historial.length - 1];
  const hayAlgo = ids.length > 0 || !!ultimo;

  const barra: ReactNode = hayAlgo ? (
    <div ref={barraRef} className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {elegidas.length > 0 ? (
        <>
          <button type="button" disabled={trabajando} onClick={() => void quitar(elegidas)} className={`${BOTON} text-brand hover:text-brand-dark`}>
            {elegidas.length === 1 ? "Quitar la elegida" : `Quitar las ${elegidas.length} elegidas`}
          </button>
          {elegidas.length < ids.length && (
            <button type="button" disabled={trabajando} onClick={() => setElegidas(new Set(ids))} className={`${BOTON} text-fg-muted hover:text-fg`}>
              Elegir todas
            </button>
          )}
          <button type="button" disabled={trabajando} onClick={() => setElegidas(new Set())} className={`${BOTON} text-fg-muted hover:text-fg`}>
            Ninguna
          </button>
        </>
      ) : (
        ids.length > 0 && (
          <>
            <button type="button" disabled={trabajando} onClick={() => void quitar(ids)} className={`${BOTON} text-fg-muted hover:text-fg`}>
              {ids.length === 1 ? "Quitarla" : `Quitar las ${ids.length}`}
            </button>
            <button
              type="button"
              disabled={trabajando}
              onClick={() => void quitar(ids).then((ok) => ok && onBuscar())}
              className={`${BOTON} text-brand hover:text-brand-dark`}
            >
              Vaciar y buscar
            </button>
          </>
        )
      )}
      {ultimo && (
        <button
          type="button"
          disabled={trabajando}
          onClick={() => void deshacer()}
          title="También con Ctrl+Z"
          className={`${BOTON} ml-auto text-brand hover:text-brand-dark`}
        >
          {ultimo.length === 1 ? "Deshacer · Ctrl+Z" : `Volver las ${ultimo.length} · Ctrl+Z`}
        </button>
      )}
    </div>
  ) : null;

  return { barra, seleccionDe, quitar, trabajando };
}
