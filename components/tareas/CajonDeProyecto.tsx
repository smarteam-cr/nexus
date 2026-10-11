"use client";

/**
 * components/tareas/CajonDeProyecto.tsx — un proyecto de tareas en su cajón (`?p=<id>`, Drawer lg; su página entera es
 * /tareas/proyectos/[id]). Muestra solo las tareas que ves («ves 1 de 4»), el avance, para quién y «+ Agregar» (nace sin semana: es el
 * pendiente del proyecto).
 */
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Drawer } from "@/components/ui";
import { BotonBlanco, BotonTexto, BotonUsar, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { NOMBRE_DEL_ESTADO_DE_PROYECTO } from "@/lib/tareas/estados";
import type { ProyectoVista, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { FilaDeTarea } from "./FilaDeTarea";
import { useAsistenteDeTareas } from "./AsistenteDeTareas";

export function CajonDeProyecto({
  id,
  onCerrar,
  onAbrirTarea,
  onCambio,
}: {
  id: string | null;
  onCerrar: () => void;
  onAbrirTarea: (id: string) => void;
  onCambio: () => void;
}) {
  const toast = useToast();
  const asistente = useAsistenteDeTareas();
  const [proyecto, setProyecto] = useState<ProyectoVista | null>(null);
  const [tareas, setTareas] = useState<TareaVista[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [nueva, setNueva] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) return;
    try {
      const r = await apiTareas.proyecto(id);
      setProyecto(r.proyecto);
      setTareas(r.tareas);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo abrir el proyecto.");
    }
  }, [id]);

  useEffect(() => {
    setProyecto(null);
    void cargar();
  }, [cargar]);

  async function agregar() {
    if (!proyecto || !nueva.trim()) return;
    setOcupado(true);
    try {
      await apiTareas.crear({ titulo: nueva.trim(), proyectoId: proyecto.id, cuando: "sin_semana" });
      setNueva("");
      await cargar();
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setOcupado(false);
    }
  }

  async function decidir(decision: "usar" | "descartar") {
    if (!proyecto) return;
    setOcupado(true);
    try {
      await apiTareas.decidirProyecto(proyecto.id, { version: proyecto.version, decision });
      await cargar();
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo decidir.");
    } finally {
      setOcupado(false);
    }
  }

  async function cambiarEstado(estado: "activo" | "en_pausa" | "terminado") {
    if (!proyecto) return;
    setOcupado(true);
    try {
      const r = await apiTareas.cambiarProyecto(proyecto.id, proyecto.version, { estado });
      setProyecto(r.proyecto);
      setTareas(r.tareas);
      onCambio();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  const p = proyecto;
  const propuestas = tareas.filter((t) => t.estado === "propuesta");
  const resto = tareas.filter((t) => t.estado !== "propuesta");

  return (
    <Drawer
      open={!!id}
      onClose={onCerrar}
      size="lg"
      title={p?.nombre ?? "Proyecto"}
      description={p ? `${NOMBRE_DEL_ESTADO_DE_PROYECTO[p.estado]} · ${p.espacio.nombre}` : undefined}
      footer={
        p && asistente ? (
          <BotonTexto
            onClick={() => {
              asistente.abrir({ chip: { tipo: "proyecto", id: p.id, etiqueta: `«${p.nombre}»` } });
              onCerrar();
            }}
          >
            Preguntarle al asistente
          </BotonTexto>
        ) : undefined
      }
    >
      {error && <p className="text-sm text-danger-ink">{error}</p>}
      {!p && !error && <p className="text-sm text-fg-muted">Abriendo…</p>}
      {p && (
        <div className="space-y-5">
          <Link href={`/tareas/proyectos/${p.id}`} className="inline-block text-[13px] font-medium text-brand hover:underline">
            Abrir la página del proyecto (lista y tablero) →
          </Link>
          {p.estado === "propuesta" && p.puedeDecidir && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-info-line bg-info-surface px-3 py-2.5">
              <p className="min-w-0 flex-1 text-[13px] text-brand">Nexus sugiere este proyecto. Si lo usas, cada persona decide su tarea.</p>
              <BotonTexto disabled={ocupado} onClick={() => void decidir("descartar")}>
                Descartar
              </BotonTexto>
              <BotonUsar disabled={ocupado} onClick={() => void decidir("usar")} />
            </div>
          )}
          <dl className="grid grid-cols-2 gap-3 text-[13px]">
            <div>
              <dt className={ROTULO_DEL_SISTEMA}>Responsable</dt>
              <dd className="text-fg">{p.responsable?.nombre ?? "Sin responsable"}</dd>
            </div>
            <div>
              <dt className={ROTULO_DEL_SISTEMA}>Para quién</dt>
              <dd className="text-fg">{p.ambito.etiqueta}</dd>
            </div>
            <div>
              <dt className={ROTULO_DEL_SISTEMA}>Avance</dt>
              <dd className="text-fg">
                {p.avance.hechas} de {p.avance.total} hechas
                {p.avance.sumadasEstaSemana ? ` · se sumaron ${p.avance.sumadasEstaSemana} esta semana` : ""}
              </dd>
            </div>
            {p.proyectoHubspot && (
              <div>
                <dt className={ROTULO_DEL_SISTEMA}>Proyecto de HubSpot</dt>
                <dd className="text-fg">
                  {p.proyectoHubspot.nombre}
                  {p.proyectoHubspot.cerrado ? " · cerrado en HubSpot" : ""}
                </dd>
              </div>
            )}
          </dl>
          {p.salioDe?.visible && p.salioDe.cita && (
            <div className="rounded-lg border border-line bg-surface-muted px-3 py-2.5 text-xs text-fg-secondary">
              <p className="font-medium text-fg">De «{p.salioDe.titulo}»</p>
              <p className="mt-1 whitespace-pre-line italic">{p.salioDe.cita}</p>
            </div>
          )}

          {propuestas.length > 0 && (
            <section className="space-y-1.5">
              <p className={ROTULO_DEL_SISTEMA}>Por decidir · {propuestas.length}</p>
              <ul className="divide-y divide-line rounded-lg border border-line">
                {propuestas.map((t) => (
                  <FilaDeTarea key={t.id} t={t} conResponsable onAbrir={(x) => onAbrirTarea(x.id)} />
                ))}
              </ul>
            </section>
          )}

          <section className="space-y-1.5">
            <p className={ROTULO_DEL_SISTEMA}>
              Tareas · {resto.length}
              {p.avance.queVes < p.avance.total ? ` (ves ${p.avance.queVes} de ${p.avance.total})` : ""}
            </p>
            {resto.length === 0 ? (
              <p className="text-[13px] text-fg-muted">Todavía no tiene tareas aceptadas.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line">
                {resto.map((t) => (
                  <FilaDeTarea key={t.id} t={t} conResponsable onAbrir={(x) => onAbrirTarea(x.id)} />
                ))}
              </ul>
            )}
            {p.estado !== "propuesta" && (
              <div className="flex items-center gap-2">
                <input
                  value={nueva}
                  onChange={(e) => setNueva(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void agregar()}
                  placeholder="+ Agregar una tarea al proyecto"
                  aria-label="Agregar una tarea al proyecto"
                  className="h-8 min-w-0 flex-1 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
                />
                <BotonBlanco disabled={!nueva.trim() || ocupado} onClick={() => void agregar()}>
                  Agregar
                </BotonBlanco>
              </div>
            )}
          </section>

          {p.puedeAdministrar && p.estado !== "propuesta" && p.estado !== "descartado" && (
            <div className="flex flex-wrap gap-2 border-t border-line pt-4">
              {p.estado === "activo" && (
                <BotonTexto disabled={ocupado} onClick={() => void cambiarEstado("en_pausa")}>
                  Pausar
                </BotonTexto>
              )}
              {p.estado === "en_pausa" && (
                <BotonTexto disabled={ocupado} onClick={() => void cambiarEstado("activo")}>
                  Reanudar
                </BotonTexto>
              )}
              {p.estado !== "terminado" && (
                <BotonTexto disabled={ocupado} onClick={() => void cambiarEstado("terminado")}>
                  Darlo por terminado
                </BotonTexto>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
