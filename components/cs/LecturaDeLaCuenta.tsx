"use client";

/**
 * components/cs/LecturaDeLaCuenta.tsx — el chip «Cómo está la cuenta» de la cabecera de la ficha del cliente (2026-10-16,
 * fase 1.2 de docs/nexus-sistema-de-trabajo-plan.md): el color y, al abrirlo, hasta tres motivos.
 *
 * Se pide al montar (`/api/clients/[id]/lectura`), no en el servidor de la cabecera: armar la cuenta son varias consultas
 * y la cabecera no tiene que esperarlas. Sin lectura (la cuenta no está en la cartera, o quien mira no es su CSE ni quien
 * lidera Customer Success) no se pinta nada.
 */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { usePanelFlotante } from "@/components/ui/usePanelFlotante";
import type { LecturaDeLaCuenta as Lectura } from "@/lib/cs/lectura-de-la-cuenta";
import { META_DE_SALUD, Punto } from "./piezas";

interface Respuesta {
  lectura: Lectura | null;
  /** Quien lidera Customer Success abre la cuenta en Éxito del cliente; el CSE no tiene esa pantalla. */
  verEnExito: boolean;
}

export function LecturaDeLaCuenta({ clientId }: { clientId: string }) {
  const [r, setR] = useState<Respuesta | null>(null);
  const { abierto, alternar, pos, rootRef, btnRef, panelRef } = usePanelFlotante({ side: "bottom", align: "start", selectorDeItems: "a" });

  useEffect(() => {
    let vivo = true;
    fetch(`/api/clients/${encodeURIComponent(clientId)}/lectura`)
      .then((res) => (res.ok ? (res.json() as Promise<Respuesta>) : null))
      .then((d) => {
        if (vivo) setR(d);
      })
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, [clientId]);

  const l = r?.lectura;
  if (!l) return null;
  const m = META_DE_SALUD[l.salud];

  return (
    <div ref={rootRef} className="flex-shrink-0">
      <button
        ref={btnRef}
        type="button"
        onClick={alternar}
        aria-expanded={abierto}
        aria-haspopup="dialog"
        title={l.porque ? `${m.texto}: ${l.porque}` : m.texto}
        className="inline-flex items-center gap-1.5 rounded border border-line bg-surface px-1.5 py-0.5 text-2xs font-medium text-fg-secondary hover:bg-surface-hover"
      >
        <Punto color={m.color} />
        {m.texto}
        {l.motivos.length > 0 && <span className="text-fg-muted">· {l.motivos.length + l.mas}</span>}
      </button>
      {abierto && pos && (
        <div
          ref={panelRef}
          role="dialog"
          aria-label="Cómo está la cuenta"
          className="fixed z-50 flex w-[360px] max-w-[calc(100vw-24px)] flex-col gap-3 overflow-y-auto rounded-xl border border-line bg-surface p-4 text-[13px] leading-[19px] shadow-xl"
          style={pos}
        >
          <div className="flex items-center gap-2">
            <Punto color={m.color} />
            <span className="font-semibold text-fg">{m.texto}</span>
            {l.corregidoPor && <span className="text-xs text-fg-muted">· lo corrigió {l.corregidoPor}</span>}
          </div>
          {l.motivos.length === 0 ? (
            <p className="text-fg-secondary">{l.porque || "Nada pide atención en esta cuenta."}</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {l.motivos.map((x, i) => (
                <li key={x.alertaId ?? `razon-${i}`} className="flex gap-2">
                  <span aria-hidden className={cn("mt-[7px] h-1.5 w-1.5 flex-shrink-0 rounded-full", x.roja ? "bg-destructive" : "bg-warning")} />
                  <span className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-fg">
                      {x.texto}
                      {x.delAgente && (
                        <span title="Lo vio la IA" className="ml-1 inline-flex translate-y-[1px] text-brand">
                          <IconoDeSugerencia className="h-3 w-3" />
                        </span>
                      )}
                    </span>
                    {x.detalle && <span className="text-xs text-fg-muted">{x.detalle}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}
          {(l.mas > 0 || l.sugerencias > 0) && (
            <p className="text-xs text-fg-muted">
              {[
                l.mas > 0 ? `${l.mas} ${l.mas === 1 ? "motivo más" : "motivos más"}` : null,
                l.sugerencias > 0 ? `${l.sugerencias} ${l.sugerencias === 1 ? "sugerencia" : "sugerencias"} del vigía` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          )}
          {r?.verEnExito && (
            <a href={`/customer-success/${encodeURIComponent(clientId)}`} className="text-xs font-medium text-brand hover:underline">
              Ver la cuenta en Éxito del cliente →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
