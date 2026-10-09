"use client";

/**
 * components/propuestas/AccionesDeReuniones.tsx — quitar todas las reuniones del contexto de una
 * propuesta de una vez, o vaciarlo y buscar la que sirve (2026-10-08, F-4 de Feedback).
 *
 * Lo pidió Ventas: «para una nueva propuesta de un cliente con el que ya tenemos muchas sesiones debo
 * excluirlas una a una; solo quiero que tome la última». Y Elías: «una opción para vaciar todo y luego
 * buscar». Quitar es reversible en el acto: hasta que se recarga, «Volver a las N de antes» las
 * devuelve —sacar 23 reuniones por un clic equivocado no puede costar 23 clics—.
 *
 * Escribe por la MISMA ruta que la X de cada fila, en su forma de lista
 * (POST /api/business-cases/[id]/sessions con `sessionIds`): una sola transacción.
 */
import { useState } from "react";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";

export default function AccionesDeReuniones({
  bcId,
  incluidas,
  onCambio,
  onBuscar,
}: {
  bcId: string;
  /** Las reuniones que hoy alimentan la propuesta. */
  incluidas: string[];
  /** Releer la columna después de escribir. */
  onCambio: () => Promise<void> | void;
  /** Abrir «Buscar» (después de vaciar). */
  onBuscar: () => void;
}) {
  const toast = useToast();
  const [trabajando, setTrabajando] = useState(false);
  /** Las que se acaban de quitar, para devolverlas. */
  const [antes, setAntes] = useState<string[] | null>(null);

  const escribir = async (sessionIds: string[], included: boolean): Promise<boolean> => {
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
  };

  const quitarTodas = async (yBuscar: boolean) => {
    const ids = incluidas;
    if (ids.length === 0) {
      if (yBuscar) onBuscar();
      return;
    }
    if (await escribir(ids, false)) {
      setAntes(ids);
      toast.info(`${ids.length === 1 ? "Se quitó la reunión" : `Se quitaron las ${ids.length} reuniones`}: ya no alimentan la propuesta.`);
      if (yBuscar) onBuscar();
    }
  };

  const devolver = async () => {
    if (!antes) return;
    if (await escribir(antes, true)) setAntes(null);
  };

  if (incluidas.length === 0 && !antes) return null;

  return (
    <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
      {incluidas.length > 0 && (
        <>
          <button
            type="button"
            disabled={trabajando}
            onClick={() => void quitarTodas(false)}
            className="font-semibold text-fg-muted transition-colors hover:text-fg disabled:opacity-40"
          >
            {incluidas.length === 1 ? "Quitarla" : `Quitar las ${incluidas.length}`}
          </button>
          <button
            type="button"
            disabled={trabajando}
            onClick={() => void quitarTodas(true)}
            className="font-semibold text-brand transition-colors hover:text-brand-dark disabled:opacity-40"
          >
            Vaciar y buscar
          </button>
        </>
      )}
      {antes && (
        <button
          type="button"
          disabled={trabajando}
          onClick={() => void devolver()}
          className="font-semibold text-brand transition-colors hover:text-brand-dark disabled:opacity-40"
        >
          {antes.length === 1 ? "Volver a la de antes" : `Volver a las ${antes.length} de antes`}
        </button>
      )}
    </div>
  );
}
