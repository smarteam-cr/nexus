"use client";

/**
 * «PASAR A RECURRENTE» desde la ficha (roadmap «La siguiente serie», iniciativa 4, paso 5). Reemplaza el uso de
 * scripts/migrar-continuidad-a-smartloop.ts: eliges el servicio del catálogo, Nexus propone dónde va (la etapa del ciclo,
 * si avanza por ciclos) y qué hay que mover en HubSpot, y al confirmar el proyecto queda recurrente desde hoy. Lo de antes
 * queda como historia. La guía del servicio aparece en el Resumen con sus rutinas.
 *
 * ⛔ Nexus no mueve el pipeline de HubSpot: deja la tarea para una persona.
 */
import { useEffect, useState } from "react";
import { Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { ETAPAS_DEL_CICLO, ETIQUETA_DE_ETAPA, type EtapaDelCiclo } from "@/lib/servicios/ciclo";
import type { PropuestaDePaso } from "@/lib/servicios/pasar-a-recurrente";
import type { ServicioParaElCatalogo } from "@/lib/servicios/servicio-server";

export default function PasarARecurrente({
  projectId,
  catalogo,
  abierto,
  onCerrar,
  onListo,
}: {
  projectId: string;
  catalogo: ServicioParaElCatalogo[];
  abierto: boolean;
  onCerrar: () => void;
  onListo: () => void;
}) {
  const toast = useToast();
  const [clave, setClave] = useState<string>("");
  const [propuesta, setPropuesta] = useState<(PropuestaDePaso & { servicio: string }) | null>(null);
  const [etapa, setEtapa] = useState<EtapaDelCiclo | null>(null);
  const [cargando, setCargando] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => {
    if (!clave) {
      setPropuesta(null);
      return;
    }
    let vivo = true;
    setCargando(true);
    fetch(`/api/projects/${projectId}/servicio?servicio=${encodeURIComponent(clave)}`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<PropuestaDePaso & { servicio: string }>) : null))
      .catch(() => null)
      .then((p) => {
        if (!vivo) return;
        setPropuesta(p);
        setEtapa(p?.etapaDelCiclo?.etapa ?? null);
        setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [projectId, clave]);

  const confirmar = async () => {
    if (!clave || ocupado) return;
    setOcupado(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/servicio`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accion: "pasar", servicio: clave, etapa }),
      });
      const j = (await res.json().catch(() => ({}))) as { error?: string; tareaHubspot?: string | null };
      if (!res.ok) {
        toast.error(j.error ?? "No se pudo pasar a recurrente.");
        return;
      }
      toast.success(j.tareaHubspot ? "Listo. Te dejamos la tarea de moverlo en HubSpot." : "Listo: el proyecto ya es recurrente.");
      onListo();
    } finally {
      setOcupado(false);
    }
  };

  return (
    <Modal
      open={abierto}
      onClose={onCerrar}
      title="Pasar a servicio recurrente"
      description="Lo de antes queda como historia. Desde hoy, el Resumen muestra la guía del servicio y sus rutinas."
      size="lg"
      footer={
        <div className="flex justify-end gap-2">
          <BotonBlanco onClick={onCerrar}>Cancelar</BotonBlanco>
          <BotonAzul onClick={() => void confirmar()} disabled={!propuesta || !!propuesta.bloqueo || ocupado || cargando}>
            {ocupado ? "Pasando…" : "Pasar a recurrente"}
          </BotonAzul>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div role="radiogroup" aria-label="Qué servicio" className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {catalogo.map((s) => {
            const elegido = clave === s.clave;
            return (
              <button
                key={s.clave}
                type="button"
                role="radio"
                aria-checked={elegido}
                onClick={() => setClave(s.clave)}
                className={cn(
                  "flex flex-col gap-0.5 rounded-lg border p-3 text-left transition-colors",
                  elegido ? "border-brand bg-info-surface" : "border-line bg-surface hover:bg-surface-hover",
                )}
              >
                <span className="text-sm font-semibold text-fg">{s.nombre}</span>
                <span className="text-xs leading-[17px] text-fg-muted">{s.descripcion}</span>
              </button>
            );
          })}
        </div>

        {cargando && <p className="text-[13px] text-fg-muted">Mirando el proyecto…</p>}

        {propuesta && !cargando && (
          <div className="flex flex-col gap-3 rounded-lg border border-line bg-surface-muted px-3.5 py-3 text-[13px]">
            {propuesta.bloqueo ? (
              <p className="text-fg">{propuesta.bloqueo}</p>
            ) : (
              <>
                {propuesta.etapaDelCiclo && (
                  <div className="flex flex-col gap-1.5">
                    <span className="font-semibold text-fg">¿En qué etapa del ciclo arranca?</span>
                    <span className="text-xs text-fg-muted">
                      Nexus propone {ETIQUETA_DE_ETAPA[propuesta.etapaDelCiclo.etapa]}: {propuesta.etapaDelCiclo.razon}
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {ETAPAS_DEL_CICLO.map((e) => (
                        <label
                          key={e}
                          className={cn(
                            "flex cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs",
                            etapa === e ? "border-brand bg-info-surface text-fg" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
                          )}
                        >
                          <input type="radio" name="etapa" checked={etapa === e} onChange={() => setEtapa(e)} />
                          {ETIQUETA_DE_ETAPA[e]}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
                {propuesta.tareaDeHubspot ? (
                  <p className="text-fg-secondary">
                    <span className="font-semibold text-fg">En HubSpot: </span>
                    queda una tarea para el encargado del proyecto: «{propuesta.tareaDeHubspot.titulo}». Nexus no lo mueve.
                  </p>
                ) : (
                  <p className="text-fg-secondary">En HubSpot ya está donde tiene que estar.</p>
                )}
                <p className="text-fg-secondary">Después, en el Resumen: agenda las reuniones fijas en tu calendario y crea las tareas que se repiten.</p>
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
