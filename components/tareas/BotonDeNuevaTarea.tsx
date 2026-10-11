"use client";

/**
 * components/tareas/BotonDeNuevaTarea.tsx — «+ Tarea», en el pie del menú (docs/tareas-plan.md §9.4).
 *
 * Anota una tarea desde cualquier pantalla, sin salir de lo que estás mirando: abre un diálogo con la MISMA línea de
 * Mis tareas («¿Es T-12?», «Para…», la semana y la prioridad). Lo que necesita (tus abiertas, las personas y los
 * equipos) se pide recién al abrirlo. Al anotar, avisa a Mis tareas si está abierta en otra parte de la pantalla.
 */
import { useCallback, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { estaAbierta } from "@/lib/tareas/estados";
import type { MisTareasDatos, OpcionesDeTareas, TareaVista } from "@/lib/tareas/tipos";
import { LineaParaAgregar, type NuevaDesdeLaLinea } from "./LineaParaAgregar";
import { apiTareas, avisarQueCambiaronLasTareas } from "./api";
import { useAsistenteDeTareas } from "./AsistenteDeTareas";

const ICONO_MAS = "M12 5v14 M5 12h14";

export default function BotonDeNuevaTarea({ isOpen }: { isOpen: boolean }) {
  const toast = useToast();
  const asistente = useAsistenteDeTareas();
  const [escrito, setEscrito] = useState("");
  const [abierto, setAbierto] = useState(false);
  const [mias, setMias] = useState<MisTareasDatos | null>(null);
  const [opciones, setOpciones] = useState<OpcionesDeTareas | null>(null);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const [m, o] = await Promise.all([apiTareas.mias(), apiTareas.opciones()]);
      setMias(m);
      setOpciones(o);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar.");
    }
  }, []);

  function abrir() {
    setEscrito("");
    setAbierto(true);
    void cargar();
  }

  async function crear(n: NuevaDesdeLaLinea) {
    try {
      const r = await apiTareas.crear({ titulo: n.titulo, para: n.para, paraEquipo: n.paraEquipo, cuando: n.cuando, prioridad: n.prioridad, privada: n.privada });
      if (r.yaExistia) toast.info("Ya estaba sugerida: le sumamos la mención.");
      else if (r.estado === "propuesta") toast.success("Le llegó como propuesta. Decide esa persona.");
      else toast.success(`Anotada: T-${r.numero}.`);
      avisarQueCambiaronLasTareas();
      setAbierto(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anotar.");
      throw e;
    }
  }

  async function esEsa(t: TareaVista) {
    if (mias && t.semana !== mias.lunesDeHoy && t.acciones.moverDeSemana) {
      try {
        await apiTareas.cambiar(t.id, { accion: "semana", destino: mias.lunesDeHoy, version: t.version });
        toast.success(`T-${t.numero} pasó a esta semana.`);
        avisarQueCambiaronLasTareas();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo mover.");
        return;
      }
    } else {
      toast.info(`T-${t.numero} ya está en tu semana.`);
    }
    setAbierto(false);
  }

  const abiertas = mias ? [...mias.estaSemana, ...mias.masAdelante].filter((t) => estaAbierta(t.estado)) : [];

  return (
    <>
      <button
        type="button"
        data-recorrido="tareas.nueva"
        onClick={abrir}
        title={isOpen ? "Anotar una tarea sin salir de esta pantalla" : "Nueva tarea"}
        className={cn(
          "flex w-full items-center rounded-lg text-sm text-fg-secondary transition-colors hover:bg-surface-muted hover:text-fg",
          isOpen ? "gap-2.5 px-3 py-2" : "justify-center p-2.5",
        )}
      >
        <svg className="h-4 w-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
          <path d={ICONO_MAS} />
        </svg>
        {isOpen && <span className="truncate">Nueva tarea</span>}
      </button>

      <Modal
        open={abierto}
        onClose={() => setAbierto(false)}
        title="Nueva tarea"
        description="Queda en tu semana. Con «Para…», le llega como propuesta a esa persona."
        size="lg"
        closeOnBackdrop={false}
      >
        <div className="space-y-3">
          {error ? (
            <p className="text-sm text-danger-ink">
              {error}{" "}
              <button type="button" onClick={() => void cargar()} className="font-medium text-brand hover:underline">
                Reintentar
              </button>
            </p>
          ) : !mias ? (
            <div className="h-11 rounded-xl border border-line bg-surface-muted skeleton-shimmer" aria-label="Cargando" />
          ) : (
            <LineaParaAgregar
              yo={mias.yo.email}
              personas={opciones?.personas ?? []}
              equipos={opciones?.equiposConLider ?? []}
              abiertas={abiertas}
              onCrear={crear}
              onEsEsa={esEsa}
              onTitulo={setEscrito}
            />
          )}
          <p className="text-xs text-fg-muted">
            El cliente, el proyecto y la agenda se eligen después, en la tarea.{" "}
            <Link href="/tareas" onClick={() => setAbierto(false)} className="font-medium text-brand hover:underline">
              Ir a Mis tareas
            </Link>
            {asistente ? (
              <>
                {" · "}
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(false);
                    // Lo que ya escribiste va al chat (para que no lo tipees de nuevo), sin el chip de otra pantalla.
                    asistente.abrir({ chip: null, ...(escrito.trim() ? { borrador: escrito.trim() } : {}) });
                  }}
                  className="font-medium text-brand hover:underline"
                >
                  o pídeselo al asistente
                </button>
              </>
            ) : null}
          </p>
        </div>
      </Modal>
    </>
  );
}
