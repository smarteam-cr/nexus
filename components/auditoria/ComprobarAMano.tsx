"use client";

/**
 * «Comprobar a mano»: lo que la auditoría no pudo leer (con qué faltó y por qué) y lo que la API de
 * HubSpot no muestra (apps conectadas, plan, quién creó cada workflow…). Cada cosa dice dónde
 * comprobarla y, si sirve, la pregunta para Breeze, el asistente de HubSpot. Quien la revisa la
 * marca: queda con su nombre y la fecha.
 */
import { useState } from "react";
import { useToast } from "@/components/ui";
import { BotonBlanco } from "@/components/exploraciones/FranjaDeSugerencias";
import { cn } from "@/lib/cn";
import type { CosaPorComprobar } from "@/lib/auditoria-portal/comprobar";
import type { VistaDeAuditoria } from "@/lib/auditoria-portal/vista";
import type { AccionesDeLaFicha } from "./FichaDeAuditoria";
import { ChipDeEstado, Rotulo } from "./piezas";

type Props = { vista: VistaDeAuditoria; acciones: AccionesDeLaFicha };

const fecha = (iso: string) => new Date(iso).toLocaleDateString("es-ES", { day: "numeric", month: "short" });

function Pendiente({ cosa, acciones }: { cosa: CosaPorComprobar; acciones: AccionesDeLaFicha }) {
  const toast = useToast();
  const hecha = !!cosa.revision;
  const [abierta, setAbierta] = useState(!hecha);
  const copiar = async (texto: string) => {
    try {
      await navigator.clipboard.writeText(texto);
      toast.success("Pregunta copiada. Pégala en Breeze, dentro del portal.");
    } catch {
      toast.error("No se pudo copiar.");
    }
  };
  return (
    <div className={cn("rounded-xl border p-4", hecha ? "border-line bg-surface-muted" : "border-line bg-surface")}>
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={hecha}
          disabled={acciones.ocupado}
          onChange={(e) => acciones.marcar(cosa.clave, e.target.checked)}
          aria-label={hecha ? `Desmarcar «${cosa.titulo}»` : `Marcar «${cosa.titulo}» como revisado`}
          className="mt-0.5 h-4 w-4 flex-shrink-0 cursor-pointer accent-success"
        />
        <div className="min-w-0 flex-1 space-y-1.5">
          <button type="button" onClick={() => setAbierta((v) => !v)} className="flex w-full items-start justify-between gap-2 text-left">
            <span className={cn("text-sm font-semibold", hecha ? "text-fg-muted line-through" : "text-fg")}>{cosa.titulo}</span>
            <span className="flex-shrink-0 text-xs text-fg-muted">{abierta ? "Ocultar" : "Ver"}</span>
          </button>
          {hecha && cosa.revision && (
            <p className="text-xs text-success-ink">
              ✓ Lo revisó {cosa.revision.por} el {fecha(cosa.revision.en)}
              {cosa.revision.nota ? ` · ${cosa.revision.nota}` : ""}
            </p>
          )}
          {abierta && (
            <div className="space-y-2 pt-0.5">
              {cosa.porQue && <p className="text-[13px] text-fg-secondary">{cosa.porQue}</p>}
              {cosa.faltantes.length > 0 && (
                <div>
                  <p className="text-xs font-semibold text-fg">No se pudo leer:</p>
                  <ul className="mt-0.5 list-disc space-y-0.5 pl-5 text-[13px] text-fg-secondary">
                    {cosa.faltantes.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ul>
                </div>
              )}
              {cosa.consecuencia && <p className="text-[13px] text-warn-ink">{cosa.consecuencia}</p>}
              {cosa.motivos.length > 0 && (
                <ul className="space-y-0.5 text-[13px] text-fg-secondary">
                  {cosa.motivos.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              )}
              <p className="text-[13px] text-fg-secondary">
                <span className="font-semibold text-fg">Dónde comprobarlo: </span>
                {cosa.dondeComprobarlo}
              </p>
              {cosa.breeze && (
                <div className="space-y-1.5 rounded-lg border border-line bg-surface-muted px-3 py-2.5">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-semibold text-fg">Pregúntale a Breeze</span>
                    {cosa.breeze.confirmada ? (
                      <ChipDeEstado tono="bien" title="HubSpot documenta que Breeze responde esto">
                        HubSpot dice que la responde
                      </ChipDeEstado>
                    ) : (
                      <ChipDeEstado tono="punteado" title="No está documentado: pruébalo y compara con lo que ves en el portal">
                        Por probar
                      </ChipDeEstado>
                    )}
                  </div>
                  <p className="text-[13px] text-fg">«{cosa.breeze.pregunta}»</p>
                  <BotonBlanco onClick={() => void copiar(cosa.breeze!.pregunta)}>Copiar la pregunta</BotonBlanco>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ComprobarAMano({ vista, acciones }: Props) {
  const { sinLeer, api } = vista.pendientes;
  const abiertos = (l: CosaPorComprobar[]) => l.filter((c) => !c.revision).length;
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <Rotulo>{`Lo que no se pudo leer · ${sinLeer.length === 0 ? "nada" : `${abiertos(sinLeer)} de ${sinLeer.length} sin revisar`}`}</Rotulo>
        {sinLeer.length === 0 ? (
          <p className="text-[13px] text-success-ink">✓ Todas las lecturas del portal salieron bien.</p>
        ) : (
          sinLeer.map((c) => <Pendiente key={c.clave} cosa={c} acciones={acciones} />)
        )}
      </section>

      {api.length > 0 && (
        <section className="space-y-2">
          <Rotulo>{`Lo que la API de HubSpot no muestra · ${abiertos(api)} de ${api.length} sin revisar`}</Rotulo>
          <p className="text-xs text-fg-muted">
            Estas cosas no salen por ninguna API, con ningún permiso. Se miran dentro del portal, con un usuario del cliente, o se le preguntan a Breeze.
          </p>
          {api.map((c) => (
            <Pendiente key={c.clave} cosa={c} acciones={acciones} />
          ))}
        </section>
      )}
    </div>
  );
}
