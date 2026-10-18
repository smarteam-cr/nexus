"use client";

/**
 * LA GUÍA DEL SERVICIO RECURRENTE en el Resumen del proyecto (roadmap «La siguiente serie», iniciativa 4, pasos 2 y 3).
 *
 * No es un sistema para llevar ciclos: es lo que el CSE necesita para llevar un servicio recurrente con cadencia. Qué se
 * entrega, con qué cadencia, qué toca ahora y las rutinas: las reuniones fijas (un enlace a Google Calendar ya armado
 * como serie: Nexus nunca escribe en el calendario) y las tareas que se repiten (Nexus las crea en Tareas, de a dos
 * meses). En SmartLoop suma el ciclo como círculo, salvo que la tarjeta de la etapa ya lo muestre.
 *
 * Sin servicio, no pinta nada: «Pasar a recurrente» vive en la tarjeta de la etapa (`BotonPasarARecurrente`).
 */
import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonBlanco, BotonEnlace, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { ETAPAS_DEL_CICLO, ETIQUETA_DE_ETAPA } from "@/lib/servicios/ciclo";
import type { GuiaDelServicioDto } from "@/lib/servicios/servicio-server";
import CicloEnCirculo from "./CicloEnCirculo";
import PasarARecurrente from "./PasarARecurrente";

/** La guía del servicio del proyecto. `null` mientras carga o si falló (no se pinta nada). */
export function useServicioDelProyecto(projectId: string, refresco: unknown) {
  const [datos, setDatos] = useState<GuiaDelServicioDto | null>(null);
  const [vuelta, setVuelta] = useState(0);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/projects/${projectId}/servicio`, { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<GuiaDelServicioDto>) : null))
      .catch(() => null)
      .then((d) => {
        if (vivo) setDatos(d);
      });
    return () => {
      vivo = false;
    };
  }, [projectId, refresco, vuelta]);
  const recargar = useCallback(() => setVuelta((n) => n + 1), []);
  return { datos, recargar };
}

const diaCorto = (iso: string) => {
  const [a, m, d] = iso.slice(0, 10).split("-");
  return `${Number(d)}/${Number(m)}/${a.slice(2)}`;
};

async function enviar(projectId: string, cuerpo: Record<string, unknown>): Promise<{ ok: boolean; error?: string; datos?: Record<string, unknown> }> {
  const res = await fetch(`/api/projects/${projectId}/servicio`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  const j = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return res.ok ? { ok: true, datos: j } : { ok: false, error: typeof j.error === "string" ? j.error : "No se pudo." };
}

export default function GuiaDelServicio({
  projectId,
  datos,
  onCambio,
  mostrarCiclo,
}: {
  projectId: string;
  datos: GuiaDelServicioDto | null;
  onCambio: () => void;
  /** false si la tarjeta de la etapa ya dibuja el ciclo (el proyecto ya está en el pipeline del servicio). */
  mostrarCiclo: boolean;
}) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState<string | null>(null);
  const s = datos?.servicio;
  if (!datos || !s) return null;

  const accion = async (clave: string, cuerpo: Record<string, unknown>, exito: (d: Record<string, unknown>) => string) => {
    setOcupado(clave);
    try {
      const r = await enviar(projectId, cuerpo);
      if (!r.ok) toast.error(r.error ?? "No se pudo.");
      else {
        toast.success(exito(r.datos ?? {}));
        onCambio();
      }
    } finally {
      setOcupado(null);
    }
  };

  const etapaActual = datos.ciclo ? ETAPAS_DEL_CICLO.indexOf(datos.ciclo.etapa) : null;
  const toca = datos.queToca;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface px-5 py-4 lg:col-span-2" data-recorrido="ficha.servicio">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="flex flex-wrap items-baseline gap-2.5">
          <span className={ROTULO_DEL_SISTEMA}>Servicio recurrente</span>
          <span className="text-[15px] font-semibold text-fg">{s.nombre}</span>
          {datos.desde && <span className="text-xs text-fg-muted">desde el {diaCorto(datos.desde)}</span>}
        </div>
        {!s.validado && (
          <span className="text-[11px] text-fg-muted" title="La cadencia y las rutinas de este servicio todavía son una propuesta de Nexus.">
            Cadencia y rutinas a validar
          </span>
        )}
      </div>

      {toca && (
        <p className={`rounded-lg px-3 py-2 text-[13px] ${toca.tipo === "al-dia" ? "bg-surface-muted text-fg-secondary" : "border border-info-line bg-info-surface text-fg"}`}>
          <span className="font-semibold">Qué toca ahora: </span>
          {toca.texto}
        </p>
      )}
      {datos.pendienteEnHubspot && <p className="text-xs text-fg-muted">{datos.pendienteEnHubspot}</p>}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className="text-xs text-fg-muted">Qué se entrega</span>
          <ul className="flex flex-col gap-1 text-[13px] text-fg-secondary">
            {s.incluye.map((x) => (
              <li key={x}>· {x}</li>
            ))}
          </ul>
          <span className="pt-1 text-xs text-fg-muted">Cadencia</span>
          <p className="text-[13px] text-fg-secondary">{s.cadencia}</p>
        </div>
        {s.conCiclo && mostrarCiclo && (
          <div className="flex flex-col items-center gap-1">
            <CicloEnCirculo
              etapas={ETAPAS_DEL_CICLO.map((e) => ETIQUETA_DE_ETAPA[e])}
              actual={etapaActual !== null && etapaActual >= 0 ? etapaActual : null}
              centro={datos.ciclo ? `Ciclo ${datos.ciclo.numero}` : "Sin ciclo"}
            />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-2 border-t border-line pt-3">
        <span className="text-xs text-fg-muted">Reuniones fijas · se guardan en tu Google Calendar</span>
        {s.reuniones.map((r) => (
          <div key={r.clave} className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
            <span className="min-w-0">
              <span className="font-semibold text-fg">{r.titulo}</span>
              <span className="text-fg-muted">
                {" "}
                · {r.cada} · {r.duracionMin} min · {r.conQuien}
              </span>
            </span>
            {r.agendada ? (
              <span className="text-xs text-success-ink">✓ Agendada el {diaCorto(r.agendada.at)}</span>
            ) : datos.puedeEditar ? (
              <span className="flex items-center gap-3">
                <a href={r.enlace} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-brand hover:text-brand-dark">
                  Agendar en Calendar ↗
                </a>
                <BotonEnlace
                  disabled={ocupado !== null}
                  onClick={() => void accion(`r:${r.clave}`, { accion: "agendada", clave: r.clave }, () => `«${r.titulo}» quedó como agendada.`)}
                >
                  Ya la agendé
                </BotonEnlace>
              </span>
            ) : (
              <span className="text-xs text-fg-muted">Sin agendar</span>
            )}
          </div>
        ))}
      </div>

      {s.tareas.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-line pt-3">
          <span className="text-xs text-fg-muted">Tareas que se repiten · van a tus Tareas</span>
          <ul className="flex flex-col gap-1 text-[13px] text-fg-secondary">
            {s.tareas.map((t) => (
              <li key={t.clave}>
                · {t.titulo} <span className="text-fg-muted">({t.cada.toLowerCase()})</span>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-fg-muted">
              {datos.tareas?.hasta ? `Creadas hasta la semana del ${diaCorto(datos.tareas.hasta)}.` : "Todavía no se crearon."}
            </span>
            {datos.puedeEditar && datos.tareas && datos.tareas.siguientes > 0 && (() => {
              const props = {
                disabled: ocupado !== null,
                onClick: () => void accion("tareas", { accion: "tareas" }, (d) => `Listo: ${Number(d.creadas ?? 0)} tareas en tus semanas.`),
              };
              const texto = ocupado === "tareas" ? "Creando…" : `Crear las ${datos.tareas.siguientes} de los próximos dos meses`;
              // La primera vez es lo que toca (azul); renovar la ventana es secundario.
              return datos.tareas.hasta ? <BotonBlanco {...props}>{texto}</BotonBlanco> : <BotonAzul {...props}>{texto}</BotonAzul>;
            })()}
          </div>
        </div>
      )}
    </section>
  );
}

/** «Pasar a recurrente» en la tarjeta de la etapa: solo si el proyecto todavía no es recurrente y quien mira decide. */
export function BotonPasarARecurrente({ projectId, datos, onCambio }: { projectId: string; datos: GuiaDelServicioDto | null; onCambio: () => void }) {
  const [abierto, setAbierto] = useState(false);
  if (!datos || datos.servicio || datos.catalogo.length === 0) return null;
  return (
    <>
      <BotonEnlace onClick={() => setAbierto(true)}>Pasar a recurrente</BotonEnlace>
      <PasarARecurrente
        projectId={projectId}
        catalogo={datos.catalogo}
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        onListo={() => {
          setAbierto(false);
          onCambio();
        }}
      />
    </>
  );
}
