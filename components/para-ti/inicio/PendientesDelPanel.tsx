"use client";

/**
 * PendientesDelPanel — lo pendiente con la cuenta, en el panel de la reunión (2026-10-20, decisión de Elías): cada uno
 * se marca «Hecha», se desestima con su motivo o se agenda en tu agenda, sin salir de «Para ti». Lo que espera una
 * decisión (lo que propuso Nexus al leer una reunión) no se decide acá: se cuenta y lleva a Tareas.
 *
 * Datos: las tareas de la cuenta que ves (`apiTareas.deLaCuenta`, la regla de visibilidad de todas las listas) y los
 * botones que te deja cada una (`acciones`, que el servidor vuelve a exigir). Una reunión planeada no es un pendiente.
 */
import Link from "next/link";
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { useToast } from "@/components/ui/Toast";
import { BotonAzul, BotonTexto, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { apiTareas, ErrorDeApi } from "@/components/tareas/api";
import { MINUTOS_DEL_BORRADOR } from "@/lib/mi-dia/agenda-borrador";
import { tituloDelBloque } from "@/lib/tareas/titulo-corto";
import type { TareaVista } from "@/lib/tareas/tipos";
import { crearBorrador, primeraHoraLibre } from "./borradores";
import { Punto } from "./piezas";

/** Cuántos pendientes muestra el panel; los demás están en la cuenta. */
const TOPE = 5;

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const diaYMes = (ymd: string) => `${Number(ymd.slice(8, 10))} ${MESES[Number(ymd.slice(5, 7)) - 1]}`;

function cuandoVence(t: TareaVista, hoy: string): string {
  if (!t.venceEl) return "sin fecha";
  if (t.venceEl < hoy) return `venció el ${diaYMes(t.venceEl)}`;
  if (t.venceEl === hoy) return "vence hoy";
  return `para el ${diaYMes(t.venceEl)}`;
}

const esPendiente = (t: TareaVista) => (t.estado === "pendiente" || t.estado === "en_curso") && t.clase !== "reunion";

export default function PendientesDelPanel({
  clientId,
  empresa,
  correo,
  onAgendado,
}: {
  clientId: string;
  empresa: string;
  correo: string;
  /** Después de dejar el borrador en la agenda: el panel se cierra para que se vea. */
  onAgendado: () => void;
}) {
  const toast = useToast();
  const [datos, setDatos] = useState<{ clientId: string; hoy: string; tareas: TareaVista[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [desestimando, setDesestimando] = useState<string | null>(null);
  const [motivo, setMotivo] = useState("");
  const [ocupada, setOcupada] = useState<string | null>(null);
  const [recargar, setRecargar] = useState(0);

  useEffect(() => {
    let vivo = true;
    apiTareas
      .deLaCuenta(clientId)
      .then((d) => vivo && setDatos({ clientId, hoy: d.hoy, tareas: d.tareas }))
      .catch((e) => vivo && setError(e instanceof Error ? e.message : "No se pudieron leer los pendientes."));
    return () => {
      vivo = false;
    };
  }, [clientId, recargar]);

  if (error) return <p className="text-[13px] text-danger-ink">{error}</p>;
  if (!datos || datos.clientId !== clientId) return null;

  const pendientes = datos.tareas.filter(esPendiente);
  // Solo las que te tocan decidir a ti: las propuestas de otra persona no son tuyas.
  const porDecidir = datos.tareas.filter((t) => t.estado === "propuesta" && t.acciones.decidir).length;
  if (pendientes.length === 0 && porDecidir === 0) return null;

  const quitar = (id: string) => setDatos((d) => (d ? { ...d, tareas: d.tareas.filter((t) => t.id !== id) } : d));
  const fallo = (e: unknown, por: string) => {
    toast.error(e instanceof Error ? e.message : por);
    // Otra persona la cambió: se vuelve a leer la lista.
    if (e instanceof ErrorDeApi && e.status === 409) setRecargar((n) => n + 1);
  };

  async function hecha(t: TareaVista) {
    setOcupada(t.id);
    try {
      await apiTareas.cambiar(t.id, { accion: "estado", version: t.version, hacia: "hecha" });
      quitar(t.id);
      toast.success("Marcada como hecha.");
    } catch (e) {
      fallo(e, "No se pudo marcar como hecha.");
    } finally {
      setOcupada(null);
    }
  }

  async function desestimar(t: TareaVista) {
    if (!motivo.trim()) return;
    setOcupada(t.id);
    try {
      await apiTareas.cambiar(t.id, { accion: "estado", version: t.version, hacia: "no_se_hara", motivo: motivo.trim() });
      quitar(t.id);
      setDesestimando(null);
      setMotivo("");
      toast.success("Desestimada.");
    } catch (e) {
      fallo(e, "No se pudo desestimar.");
    } finally {
      setOcupada(null);
    }
  }

  function agendar(t: TareaVista) {
    const minutos = Math.min(Math.max(t.minutosEstimados ?? MINUTOS_DEL_BORRADOR, 30), 180);
    const h = primeraHoraLibre(correo, new Date(), minutos);
    crearBorrador({
      correo,
      inicio: h.inicio,
      fin: h.fin,
      titulo: tituloDelBloque({ titulo: t.titulo, tituloCorto: t.tituloCorto, empresa: t.cliente?.nombre ?? empresa, ambito: t.ambito.nombre }),
      cuenta: { id: clientId, nombre: empresa },
      tarea: { id: t.id, numero: t.numero },
      origen: "agenda",
      enfocar: true,
    });
    onAgendado();
  }

  return (
    <div className="flex flex-col gap-2">
      <p className={ROTULO_DEL_SISTEMA}>Pendiente</p>
      {pendientes.slice(0, TOPE).map((t) => (
        <div key={t.id} className="flex flex-col gap-1.5">
          <div className="flex gap-2 text-[13px] leading-[19px]">
            <Punto className={cn("mt-1.5", t.atrasada ? "bg-warning" : t.lado === "cliente" ? "bg-primary" : "bg-success")} />
            <span className="flex-1 text-fg">
              {t.lado === "cliente" ? "El cliente: " : ""}
              {t.titulo}
            </span>
            <span className={cn("whitespace-nowrap text-xs font-semibold", t.atrasada ? "text-warn-ink" : "text-fg-muted")}>{cuandoVence(t, datos.hoy)}</span>
          </div>
          {desestimando === t.id ? (
            <div className="flex flex-col gap-1.5 pl-4">
              <label htmlFor={`motivo-${t.id}`} className="text-xs text-fg-muted">
                ¿Por qué ya no va?
              </label>
              <input
                id={`motivo-${t.id}`}
                autoFocus
                maxLength={500}
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") void desestimar(t);
                  if (e.key === "Escape") setDesestimando(null);
                }}
                className="w-full rounded-lg border border-line bg-surface px-2.5 py-1.5 text-[13px] text-fg"
              />
              <div className="flex gap-2">
                <BotonAzul onClick={() => void desestimar(t)} disabled={!motivo.trim() || ocupada === t.id}>
                  Desestimar
                </BotonAzul>
                <BotonTexto onClick={() => setDesestimando(null)}>Cancelar</BotonTexto>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-x-3 pl-4">
              {t.acciones.terminar && (
                <button type="button" disabled={ocupada === t.id} onClick={() => void hecha(t)} className="text-xs font-medium text-brand transition-colors hover:text-brand-light disabled:opacity-50">
                  ✓ Hecha
                </button>
              )}
              <button type="button" onClick={() => agendar(t)} className="text-xs font-medium text-brand transition-colors hover:text-brand-light">
                Agendar
              </button>
              {t.acciones.noSeHara && (
                <button
                  type="button"
                  disabled={ocupada === t.id}
                  onClick={() => {
                    setMotivo("");
                    setDesestimando(t.id);
                  }}
                  className="text-xs font-medium text-fg-muted transition-colors hover:text-fg disabled:opacity-50"
                >
                  Desestimar
                </button>
              )}
            </div>
          )}
        </div>
      ))}
      <div className="flex flex-wrap gap-x-3 text-xs">
        {pendientes.length > TOPE && (
          <Link href={`/clients/${encodeURIComponent(clientId)}?tab=__tareas__`} className="font-medium text-brand hover:text-brand-light">
            Ver los {pendientes.length} pendientes de la cuenta
          </Link>
        )}
        {porDecidir > 0 && (
          <Link href="/tareas" className="font-medium text-brand hover:text-brand-light">
            {porDecidir === 1 ? "1 tarea por decidir en Tareas" : `${porDecidir} tareas por decidir en Tareas`}
          </Link>
        )}
      </div>
    </div>
  );
}
