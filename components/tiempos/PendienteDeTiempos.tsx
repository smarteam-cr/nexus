"use client";

/**
 * components/tiempos/PendienteDeTiempos.tsx — en «Para ti», lo que quedó sin anotar de «¿cuánto te tomó?» (2026-10-05).
 *
 * Es UN pendiente con la misma fila que los demás de «Para ti», pero se contesta ahí mismo: «Anotar» lo abre con
 * cada tarea o documento y sus opciones de un clic. Llegar con `?tiempos=1` (el enlace del pendiente) lo abre solo.
 */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/ui/Toast";
import { fetchJson } from "@/lib/api/fetch-json";
import { BotonTexto } from "@/components/ui/sistema";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Pendiente } from "@/lib/para-ti/tipos";
import type { PreguntaParaResponder } from "@/lib/tiempos/tipos";
import { avisarCambioDeParaTi } from "@/components/para-ti/cuenta";
import PreguntaDeTiempo, { enviarRespuesta } from "./PreguntaDeTiempo";

const BOTON_BLANCO =
  "shrink-0 rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";

export default function PendienteDeTiempos({ item }: { item: Pendiente }) {
  const router = useRouter();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [preguntas, setPreguntas] = useState<PreguntaParaResponder[] | null>(null);
  const [respondidas, setRespondidas] = useState<Set<string>>(new Set());
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (new URL(window.location.href).searchParams.get("tiempos") === "1") setAbierto(true);
  }, []);

  useEffect(() => {
    if (!abierto || preguntas !== null) return;
    let vivo = true;
    fetchJson<{ preguntas: PreguntaParaResponder[] }>("/api/tiempos/mias")
      .then((d) => vivo && setPreguntas(d.preguntas))
      .catch(() => vivo && setPreguntas([]));
    return () => {
      vivo = false;
    };
  }, [abierto, preguntas]);

  const quedan = (preguntas ?? []).filter((p) => !respondidas.has(p.id));

  const terminar = () => {
    avisarCambioDeParaTi();
    router.refresh();
  };

  const marcar = (id: string) => {
    setRespondidas((s) => {
      const n = new Set(s).add(id);
      if (preguntas && preguntas.every((p) => n.has(p.id))) window.setTimeout(terminar, 1500);
      return n;
    });
  };

  const omitirTodas = async (motivo: "omitir" | "no_lo_hice") => {
    setGuardando(true);
    try {
      await Promise.all(quedan.map((p) => enviarRespuesta(p.id, { tipo: "omitida", motivo })));
      terminar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 border-t border-line px-4 py-3">
        <span aria-hidden className="h-2 w-2 flex-none rounded-full bg-warning" />
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-0.5">
          <span className="text-sm font-semibold leading-5 text-fg">{item.titulo}</span>
          <span className="text-[13px] leading-[19px] text-fg-secondary">{item.detalle}</span>
          <span className="text-xs leading-4 text-fg-muted">{item.meta}</span>
        </div>
        <button type="button" aria-expanded={abierto} onClick={() => setAbierto((v) => !v)} className={BOTON_BLANCO}>
          {abierto ? "Ocultar" : item.accion}
        </button>
      </div>
      {abierto && (
        <div className="mx-4 mb-3 border-t border-line pl-[22px]">
          {preguntas === null ? (
            <div className="space-y-2 py-3" aria-busy="true">
              <Skeleton className="h-3.5 w-64 max-w-full" />
              <Skeleton className="h-7 w-96 max-w-full" delay={40} />
            </div>
          ) : preguntas.length === 0 ? (
            <p className="py-3 text-xs text-fg-muted">No queda nada sin anotar.</p>
          ) : (
            <>
              <div className="divide-y divide-line">
                {preguntas.map((p) => (
                  <PreguntaDeTiempo key={p.id} pregunta={p} variante="lista" onListo={() => marcar(p.id)} />
                ))}
              </div>
              {quedan.length > 1 && (
                <div className="flex justify-end gap-1 pt-1">
                  <BotonTexto disabled={guardando} onClick={() => void omitirTodas("no_lo_hice")}>
                    No las hice yo
                  </BotonTexto>
                  <BotonTexto disabled={guardando} onClick={() => void omitirTodas("omitir")}>
                    Omitir las {quedan.length}
                  </BotonTexto>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
