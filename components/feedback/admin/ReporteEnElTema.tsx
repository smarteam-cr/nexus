"use client";

/**
 * Un reporte abierto dentro del panel de su tema, en la hoja de ruta (2026-10-06, pedido de Elías).
 *
 * Lo que está en la hoja de ruta salió de la Bandeja: acá se ve entero, con las MISMAS piezas que la Bandeja
 * (DetalleDelReporte.tsx): lo que se leía en la escala, la captura con sus marcas, lo que se mandó con el
 * reporte y la conversación, donde se le contesta a quien lo mandó. Abrirlo lo deja leído (GET /api/feedback/[id]).
 * «Devolver a la Bandeja» lo saca del tema y lo vuelve a «Sin revisar», para decidir de nuevo.
 */
import { useCallback, useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/Skeleton";
import { useToast } from "@/components/ui/Toast";
import type { ReporteDetalle } from "@/lib/feedback/queries";
import { haceCuanto, numeroDeReporte, TIPO } from "@/lib/feedback/reglas";
import { IconoDeTipo, Iniciales } from "../piezas";
import { Captura, Conversacion, LoQueSeLeia, LoQueSeMando, postJson } from "./DetalleDelReporte";

export default function ReporteEnElTema({
  id,
  teRespondio,
  onCambio,
  onDevuelto,
}: {
  id: string;
  /** La persona te volvió a escribir: al abrirlo queda leído y la tarjeta del tema tiene que enterarse. */
  teRespondio: boolean;
  /** Algo cambió (una respuesta, una lectura): el tema y la hoja de ruta se vuelven a leer. */
  onCambio: () => void;
  /** Salió del tema (volvió a la Bandeja). */
  onDevuelto: () => void;
}) {
  const toast = useToast();
  const [detalle, setDetalle] = useState<ReporteDetalle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const r = await fetch(`/api/feedback/${id}`, { cache: "no-store" });
      const d = (await r.json().catch(() => null)) as { reporte?: ReporteDetalle; error?: string } | null;
      if (r.ok && d?.reporte) {
        setDetalle(d.reporte);
        setError(null);
      } else setError(d?.error ?? "No se pudo leer el reporte.");
    } catch {
      setError("No hay conexión.");
    }
  }, [id]);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/feedback/${id}`, { cache: "no-store" })
      .then(async (r) => ({ ok: r.ok, d: (await r.json().catch(() => null)) as { reporte?: ReporteDetalle; error?: string } | null }))
      .then(({ ok, d }) => {
        if (!vivo) return;
        if (ok && d?.reporte) {
          setDetalle(d.reporte);
          if (teRespondio) onCambio(); // quedó leído: la tarjeta deja de decir «Te respondió»
        } else setError(d?.error ?? "No se pudo leer el reporte.");
      })
      .catch(() => {
        if (vivo) setError("No hay conexión.");
      });
    return () => {
      vivo = false;
    };
    // Una vez por reporte: `teRespondio` y `onCambio` cambian con cada lectura del tema y no tienen que repetirla.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const devolver = async () => {
    if (devolviendo) return;
    setDevolviendo(true);
    const r = await postJson(`/api/feedback/${id}/decision`, { accion: "deshacer" });
    setDevolviendo(false);
    if (!r.ok) {
      toast.error(r.error ?? "No se pudo devolver.");
      return;
    }
    toast.success("Volvió a la Bandeja, en «Sin revisar».");
    onDevuelto();
  };

  if (error) {
    return (
      <p className="rounded-lg border border-danger-line bg-danger-surface px-3 py-2.5 text-[13px] text-danger-ink">
        {error}{" "}
        <button type="button" onClick={() => void cargar()} className="font-semibold underline">
          Reintentar
        </button>
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {detalle ? (
        <div className="space-y-2.5">
          <div className="flex flex-wrap items-center gap-2.5">
            <Iniciales texto={detalle.autor.iniciales} className="h-8 w-8 text-[11px]" />
            <div className="min-w-0">
              <p className="text-sm font-semibold text-fg">{detalle.autor.nombre}</p>
              <p className="text-xs text-fg-muted">
                {detalle.autor.rol} · {haceCuanto(detalle.creado)} · {numeroDeReporte(detalle.numero)}
              </p>
            </div>
            <span className="flex-1" />
            <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-fg-secondary">
              <IconoDeTipo tipo={detalle.tipo} />
              {TIPO[detalle.tipo].nombre}
            </span>
            {detalle.tipo === "falla" && detalle.meFrena && (
              <span className="rounded-full border border-warn-line bg-warn-surface px-2.5 py-0.5 text-xs font-semibold text-warn-ink">Le frena el trabajo</span>
            )}
          </div>
          <p className="whitespace-pre-wrap break-words text-[15px] leading-[1.55] text-fg">«{detalle.cuerpo}»</p>
        </div>
      ) : (
        <div className="space-y-2.5" aria-hidden="true">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8" rounded="full" />
            <div className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-3 w-44" />
            </div>
          </div>
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-3/4" />
        </div>
      )}

      {detalle?.escala && <LoQueSeLeia detalle={detalle} />}
      <Captura detalle={detalle} />
      <LoQueSeMando detalle={detalle} />
      {detalle && (
        <Conversacion
          detalle={detalle}
          nombre={detalle.autor.nombre.split(" ")[0]}
          onEnviado={async () => {
            await cargar();
            onCambio();
          }}
          // Responder y cerrar es de lo que está sin revisar: un reporte en un tema no lo ofrece.
          onResponderYCerrar={async () => false}
        />
      )}

      {detalle && (
        <div className="space-y-1 border-t border-line pt-4">
          <button
            type="button"
            disabled={devolviendo}
            onClick={() => void devolver()}
            className="rounded-lg border border-line bg-surface px-3 py-[7px] text-[13px] font-semibold text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
          >
            {devolviendo ? "Devolviendo…" : "Devolver a la Bandeja"}
          </button>
          <p className="text-xs text-fg-muted">Sale de este tema y vuelve a «Sin revisar», para decidir de nuevo qué hacer con él.</p>
        </div>
      )}
    </div>
  );
}
