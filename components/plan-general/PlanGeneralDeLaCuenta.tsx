"use client";

/**
 * PlanGeneralDeLaCuenta — «Plan general» en la ficha del cliente (2026-11-19, Elías: arriba de «Proyectos»).
 *
 * Es el MISMO cronograma de Nexus (TimelineGantt + TaskDetailDrawer) con las fases-loop de todos los proyectos de la
 * cuenta juntas, sobre el arranque común (lib/plan-general/armar.ts). No hay un gantt ni un editor propios: Elías, 19
 * nov: «todos los cronogramas usan el mismo motor».
 *
 * No guarda nada propio: cada cambio va a la tarea en el cronograma de SU proyecto, por rutas de una tarea con la misma
 * vara que el Gantt del proyecto (guardTimelineEdit; borrar, guardTimelineDelete): el estado por el PATCH de la tarea,
 * lo demás por `.../tasks/[taskId]/campos`, una tarea nueva por `.../tasks`. Lo que se cambia acá se ve en el
 * cronograma del proyecto y al revés. Las fases (nombre, semanas, arranque) se editan en el cronograma de su proyecto.
 * El cliente ve la foto que se publica con «Publicar» (lib/plan-general/acceso.ts).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Modal, useToast } from "@/components/ui";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonPanel } from "@/components/ui/Skeleton";
import { BOTON_DE_HERRAMIENTA, BotonAzul, BotonBlanco, BotonEnlace } from "@/components/ui/sistema";
import TimelineGantt, { type GanttPhase, type GanttTask, type GanttTaskStatus } from "@/components/canvas/TimelineGantt";
import TaskDetailDrawer from "@/components/canvas/TaskDetailDrawer";
import type { EstadoDelAccesoAlPlan } from "@/lib/plan-general/acceso";
import { enlaceEnEsteNavegador } from "@/lib/external/enlace-local";
import type { FaseDelPlan, PlanGeneral, TareaDelPlan } from "@/lib/plan-general/tipos";

/** Una tarea en pantalla: la del plan, o una nueva que todavía no se guardó (sin id hasta tener título). */
type Tarea = Omit<TareaDelPlan, "id"> & { id?: string; key: string };
type Fase = Omit<FaseDelPlan, "tasks"> & { tasks: Tarea[] };
type Cambio = Partial<Pick<Tarea, "title" | "notes" | "weekIndex" | "semanas" | "party" | "type" | "startDateOverride" | "dueDateOverride">>;

/** «mié 19 nov, 3:40 p. m.» en hora de Costa Rica. */
function diaYHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CR", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" });
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.error ?? "No se pudo guardar el cambio. Vuelve a intentarlo.");
  return j;
}

/** El campo de fecha del panel manda aaaa-mm-dd o null. */
const fechaParaGuardar = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

export default function PlanGeneralDeLaCuenta({ clientId, onAbrirProyecto }: { clientId: string; onAbrirProyecto: (projectId: string) => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<PlanGeneral | null>(null);
  const [fases, setFases] = useState<Fase[]>([]);
  const [acceso, setAcceso] = useState<EstadoDelAccesoAlPlan | null>(null);
  const [puede, setPuede] = useState({ editar: false, borrar: false });
  const [error, setError] = useState<string | null>(null);
  const [abierta, setAbierta] = useState<{ phaseKey: string; taskKey: string } | null>(null);
  const fasesRef = useRef<Fase[]>([]);
  fasesRef.current = fases;
  /* Los cambios de texto se guardan con una pausa (tipear un título no es un PATCH por letra), juntos por tarea. */
  const pendientes = useRef(new Map<string, { cambio: Cambio; timer: ReturnType<typeof setTimeout> }>());
  const creando = useRef(new Set<string>());
  /** Las que se borraron mientras se creaban: apenas tienen id, se borran. */
  const borrarAlCrear = useRef(new Set<string>());
  /** id → la clave con que nació en pantalla una tarea creada acá: recargar no le cambia la clave (ni cierra su panel). */
  const clavePorId = useRef(new Map<string, string>());
  const siguiente = useRef(0);

  /* Lo del servidor, sin perder lo de la pantalla: las claves de las tareas creadas acá, los cambios que esperan su
     guardado (se ven encima de lo guardado) y las tareas nuevas que todavía no tienen título. */
  // Solo lee refs: estable de por vida.
  const aFases = useCallback((p: PlanGeneral): Fase[] => {
    const nuevas = fasesRef.current.flatMap((f) => f.tasks.filter((t) => !t.id).map((t) => ({ faseId: f.id, t })));
    return p.fases.map((f) => ({
      ...f,
      tasks: [
        ...f.tasks.map((t) => {
          const key = clavePorId.current.get(t.id) ?? t.id;
          return { ...t, key, ...(pendientes.current.get(key)?.cambio ?? {}) };
        }),
        ...nuevas.filter((n) => n.faseId === f.id).map((n) => n.t),
      ],
    }));
  }, []);

  const cargar = useCallback(async () => {
    try {
      const r = await pedir<{ plan: PlanGeneral; acceso: EstadoDelAccesoAlPlan; puede: { editar: boolean; borrar: boolean } }>(
        `/api/clients/${clientId}/plan-general`,
      );
      setPlan(r.plan);
      setFases(aFases(r.plan));
      setAcceso(r.acceso);
      setPuede(r.puede);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el plan general.");
    }
  }, [clientId, aFases]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  /** El estado del enlace (¿hay cambios sin publicar?) después de guardar algo. */
  /* Cada cambio del enlace (una relectura, «Publicar») lleva un número: una relectura que vuelve tarde no pisa lo que
     pasó después (si no, «Hay cambios que el cliente no ve» volvía justo después de publicar). */
  const turnoDelAcceso = useRef(0);
  const cambiarAcceso = useCallback((a: EstadoDelAccesoAlPlan) => {
    turnoDelAcceso.current++;
    setAcceso(a);
  }, []);
  const refrescarAcceso = useCallback(async () => {
    const turno = ++turnoDelAcceso.current;
    try {
      const r = await pedir<{ acceso: EstadoDelAccesoAlPlan }>(`/api/clients/${clientId}/plan-general`);
      if (turno === turnoDelAcceso.current) setAcceso(r.acceso);
    } catch {
      /* el botón de Publicar se corrige en la próxima carga */
    }
  }, [clientId]);

  const buscar = (taskKey: string) => {
    for (const f of fasesRef.current) {
      const t = f.tasks.find((x) => x.key === taskKey);
      if (t) return { fase: f, tarea: t };
    }
    return null;
  };

  const cambiarLocal = (taskKey: string, cambio: Partial<Tarea>) =>
    setFases((fs) => fs.map((f) => ({ ...f, tasks: f.tasks.map((t) => (t.key === taskKey ? { ...t, ...cambio } : t)) })));

  const fallo = (e: unknown) => {
    toast.error(e instanceof Error ? e.message : "No se pudo guardar el cambio.");
    void cargar();
  };

  /** Una tarea nueva se guarda cuando tiene título: POST con lo que ya tiene, y queda con su id. */
  const crear = async (taskKey: string) => {
    const hallada = buscar(taskKey);
    if (!hallada || hallada.tarea.id || creando.current.has(taskKey) || !hallada.tarea.title.trim()) return;
    creando.current.add(taskKey);
    const { fase, tarea } = hallada;
    const enviado = { title: tarea.title.trim(), weekIndex: tarea.weekIndex, semanas: tarea.semanas, party: tarea.party, type: tarea.type };
    try {
      const { task: creada } = await pedir<{ task: { id: string } }>(`/api/projects/${fase.proyectoId}/timeline/tasks`, {
        method: "POST",
        body: JSON.stringify({ phaseId: fase.id, ...enviado }),
      });
      clavePorId.current.set(creada.id, taskKey);
      // Se borró mientras se creaba: se borra ya creada (si no, volvía al recargar).
      if (borrarAlCrear.current.delete(taskKey)) {
        await pedir(`/api/projects/${fase.proyectoId}/timeline/tasks/${creada.id}/campos`, { method: "DELETE" });
        return;
      }
      cambiarLocal(taskKey, { id: creada.id });
      /* Lo que la creación no lleva (el detalle, las fechas) y lo que se cambió MIENTRAS se creaba sale en un PATCH
         aparte. Lo que quedó en espera para esta tarea ya va acá: se descarta para no mandarlo dos veces. */
      const espera = pendientes.current.get(taskKey);
      if (espera) clearTimeout(espera.timer);
      pendientes.current.delete(taskKey);
      const d = buscar(taskKey)?.tarea;
      if (d) {
        const resto: Record<string, unknown> = {};
        if (d.notes) resto.notes = d.notes;
        if (d.startDateOverride) resto.startDateOverride = fechaParaGuardar(d.startDateOverride);
        if (d.dueDateOverride) resto.dueDateOverride = fechaParaGuardar(d.dueDateOverride);
        if (d.title.trim() && d.title.trim() !== enviado.title) resto.title = d.title.trim();
        if (d.weekIndex !== enviado.weekIndex) resto.weekIndex = d.weekIndex;
        if (d.semanas !== enviado.semanas) resto.semanas = d.semanas ?? 1;
        if (d.party !== enviado.party) resto.party = d.party;
        if (d.type !== enviado.type) resto.type = d.type;
        if (Object.keys(resto).length > 0) {
          await pedir(`/api/projects/${fase.proyectoId}/timeline/tasks/${creada.id}/campos`, { method: "PATCH", body: JSON.stringify(resto) });
        }
      }
      void refrescarAcceso();
    } catch (e) {
      fallo(e);
    } finally {
      creando.current.delete(taskKey);
    }
  };

  /** El último envío de cada tarea: la respuesta de uno anterior no pisa lo que mandó el siguiente. */
  const ultimoEnvio = useRef(new Map<string, number>());
  const enviar = async (taskKey: string) => {
    const p = pendientes.current.get(taskKey);
    pendientes.current.delete(taskKey);
    const hallada = buscar(taskKey);
    if (!p || !hallada) return;
    if (!hallada.tarea.id) return void crear(taskKey);
    const { cambio } = p;
    // Un título vacío no se guarda (la tarea necesita uno): queda el que tenía hasta que se escriba otro.
    if (cambio.title !== undefined && !cambio.title.trim()) delete cambio.title;
    const cuerpo: Record<string, unknown> = { ...cambio };
    if ("startDateOverride" in cambio) cuerpo.startDateOverride = fechaParaGuardar(cambio.startDateOverride);
    if ("dueDateOverride" in cambio) cuerpo.dueDateOverride = fechaParaGuardar(cambio.dueDateOverride);
    if (Object.keys(cuerpo).length === 0) return;
    try {
      const envio = (ultimoEnvio.current.get(taskKey) ?? 0) + 1;
      ultimoEnvio.current.set(taskKey, envio);
      const r = await pedir<{ semanas: number | null; weekIndex: number }>(
        `/api/projects/${hallada.fase.proyectoId}/timeline/tasks/${hallada.tarea.id}/campos`,
        { method: "PATCH", body: JSON.stringify(cuerpo) },
      );
      // El servidor recorta la duración a lo que cabe en la fase: la pantalla muestra lo que quedó guardado. Salvo que
      // ya haya otro cambio esperando: esta respuesta es vieja y pisaría lo nuevo.
      if (!pendientes.current.has(taskKey) && ultimoEnvio.current.get(taskKey) === envio)
        cambiarLocal(taskKey, { semanas: r.semanas, weekIndex: r.weekIndex, needsValidation: false });
      void refrescarAcceso();
    } catch (e) {
      fallo(e);
    }
  };

  /** Ojo con desmontar con cambios en espera: se mandan igual. */
  useEffect(() => {
    const enEspera = pendientes.current;
    return () => {
      for (const key of [...enEspera.keys()]) {
        clearTimeout(enEspera.get(key)!.timer);
        void enviar(key);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- solo al desmontar
  }, []);

  const actualizar = (_phaseKey: string, taskKey: string, cambio: Cambio) => {
    cambiarLocal(taskKey, cambio);
    const antes = pendientes.current.get(taskKey);
    if (antes) clearTimeout(antes.timer);
    // Texto: con pausa. Semana, duración, responsable, tipo y fechas: casi enseguida (un clic es una decisión).
    const soloTexto = Object.keys(cambio).every((k) => k === "title" || k === "notes");
    const timer = setTimeout(() => void enviar(taskKey), soloTexto ? 700 : 150);
    pendientes.current.set(taskKey, { cambio: { ...(antes?.cambio ?? {}), ...cambio }, timer });
  };

  const cambiarEstado = async (taskId: string, next: GanttTaskStatus) => {
    const hallada = fasesRef.current.flatMap((f) => f.tasks.map((t) => ({ f, t }))).find((x) => x.t.id === taskId);
    if (!hallada) return;
    /* Optimista, como el cronograma del proyecto: la tarea y, por coherencia, su fase (todas resueltas → hecha; deja de
       estarlo y estaba hecha → en curso). El servidor hace lo mismo; si falla, se relee. Sin releer todo: un texto que
       espera su guardado en otra tarea no se pierde de la pantalla. */
    setFases((fs) =>
      fs.map((f) => {
        if (f.id !== hallada.f.id) return f;
        const tasks = f.tasks.map((t) => (t.id === taskId ? { ...t, status: next } : t));
        // Las que existen: una tarea nueva sin guardar no cuenta (el servidor tampoco la tiene).
        const guardadas = tasks.filter((t) => t.id);
        const resueltas = guardadas.length > 0 && guardadas.every((t) => t.status === "DONE" || t.status === "SUSPENDED");
        const status = resueltas ? "DONE" : f.status === "DONE" ? "IN_PROGRESS" : f.status;
        return { ...f, tasks, status };
      }),
    );
    try {
      await pedir(`/api/projects/${hallada.f.proyectoId}/timeline/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify({ status: next }) });
      void refrescarAcceso();
    } catch (e) {
      fallo(e);
    }
  };

  const agregar = (phaseKey: string, weekIndex: number) => {
    const key = `n:${++siguiente.current}`;
    setFases((fs) =>
      fs.map((f) =>
        f.id === phaseKey
          ? {
              ...f,
              tasks: [
                ...f.tasks,
                {
                  key, title: "", weekIndex, semanas: null, order: f.tasks.length, status: "PENDING", notes: null, needsValidation: false,
                  source: "HUMAN", statusSource: null, statusChangedByEmail: null, statusChangedAt: null, party: "SMARTEAM", type: "TASK",
                  startDateOverride: null, dueDateOverride: null,
                },
              ],
            }
          : f,
      ),
    );
    setAbierta({ phaseKey, taskKey: key });
  };

  const quitar = async (_phaseKey: string, taskKey: string) => {
    const hallada = buscar(taskKey);
    if (!hallada) return;
    const p = pendientes.current.get(taskKey);
    if (p) clearTimeout(p.timer);
    pendientes.current.delete(taskKey);
    setFases((fs) => fs.map((f) => ({ ...f, tasks: f.tasks.filter((t) => t.key !== taskKey) })));
    if (!hallada.tarea.id) {
      if (creando.current.has(taskKey)) borrarAlCrear.current.add(taskKey);
      return;
    }
    try {
      await pedir(`/api/projects/${hallada.fase.proyectoId}/timeline/tasks/${hallada.tarea.id}/campos`, { method: "DELETE" });
      void refrescarAcceso();
    } catch (e) {
      fallo(e);
    }
  };

  const mover = async (taskKey: string, toPhaseKey: string, toWeekIndex: number, toOrder: number) => {
    const hallada = buscar(taskKey);
    const destino = fasesRef.current.find((f) => f.id === toPhaseKey);
    if (!hallada?.tarea.id || !destino) return;
    if (destino.proyectoId !== hallada.fase.proyectoId) {
      toast.error("Una tarea no pasa de un proyecto a otro: créala en el loop de destino.");
      return;
    }
    try {
      await pedir(`/api/projects/${hallada.fase.proyectoId}/timeline/tasks/${hallada.tarea.id}/campos`, {
        method: "PATCH",
        body: JSON.stringify({ phaseId: toPhaseKey, weekIndex: toWeekIndex, order: toOrder }),
      });
      await cargar();
    } catch (e) {
      fallo(e);
    }
  };

  const ganttPhases: GanttPhase[] = useMemo(
    () =>
      fases.map((f) => ({
        key: f.id,
        id: f.id,
        name: f.name,
        durationWeeks: f.durationWeeks,
        startWeek: f.startWeek,
        sessionCount: f.sessionCount,
        activityType: f.activityType,
        status: f.status,
        needsValidation: f.needsValidation,
        loopNumero: f.loopNumero,
        proyecto: f.proyectoNombre,
        tasks: f.tasks.map(
          (t): GanttTask => ({
            key: t.key,
            id: t.id,
            title: t.title,
            weekIndex: t.weekIndex,
            semanas: t.semanas,
            status: t.status,
            notes: t.notes,
            needsValidation: t.needsValidation,
            source: t.source,
            statusSource: t.statusSource ?? undefined,
            statusChangedByEmail: t.statusChangedByEmail,
            statusChangedAt: t.statusChangedAt,
            party: t.party,
            type: t.type,
            startDateOverride: t.startDateOverride,
            dueDateOverride: t.dueDateOverride,
          }),
        ),
      })),
    [fases],
  );

  if (error && !plan) {
    return (
      <div className="px-8 pb-10 pt-6">
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }
  if (!plan) {
    return (
      <div className="space-y-4 px-8 pb-10 pt-6" aria-busy="true">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-4 w-96" />
        <SkeletonPanel minH="min-h-80">
          <div className="space-y-3">
            {Array.from({ length: 8 }, (_, i) => (
              <div key={i} className="flex items-center gap-3">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
    );
  }

  const ancla = plan.ancla ? plan.ancla.slice(0, 10) : null;
  const faseAbierta = abierta ? ganttPhases.find((f) => f.key === abierta.phaseKey) : undefined;
  const tareaAbierta = faseAbierta?.tasks.find((t) => t.key === abierta?.taskKey) ?? null;
  const todas = ganttPhases.flatMap((f) => f.tasks.map((t) => ({ phaseKey: f.key, taskKey: t.key })));
  const lugar = abierta ? todas.findIndex((x) => x.taskKey === abierta.taskKey) : -1;
  const sinDetalle = plan.proyectos.filter((p) => !p.detalleConfirmado);

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-fg">Plan general</h2>
          <p className="max-w-2xl text-xs text-fg-muted">
            El cronograma de los loops de {plan.proyectos.length === 1 ? "su proyecto" : `sus ${plan.proyectos.length} proyectos`}, juntos. Cada
            tarea es la de su proyecto: lo que cambias aquí cambia en su cronograma, y al revés. Las fases se editan en el cronograma de
            cada proyecto.
          </p>
          {plan.proyectos.length > 0 && (
            <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fg-muted">
              <span>Proyectos:</span>
              {plan.proyectos.map((p) => (
                <BotonEnlace key={p.id} onClick={() => onAbrirProyecto(p.id)}>
                  {p.nombre}
                </BotonEnlace>
              ))}
            </p>
          )}
        </div>
        {acceso && puede.editar && <AccesoAlPlan clientId={clientId} acceso={acceso} onCambio={cambiarAcceso} />}
      </div>

      {sinDetalle.length > 0 && (
        <Alert variant="warning">
          El cliente ve los loops de {sinDetalle.map((p) => `«${p.nombre}»`).join(", ")} sin sus tareas: falta confirmar el detalle en el
          cronograma de ese proyecto (lo mismo que en su cronograma compartible).
        </Alert>
      )}

      {ganttPhases.length === 0 ? (
        <EmptyState
          title="Todavía no hay loops"
          description="Un loop es una fase del cronograma de un proyecto marcada con su número. Cuando algún proyecto los tenga, aparecen aquí juntos."
        />
      ) : (
        <TimelineGantt
          anchor={ancla}
          phases={ganttPhases}
          readOnly={!puede.editar}
          canDelete={puede.borrar}
          onToggleStatus={(id, next) => void cambiarEstado(id, next)}
          onUpdateTask={actualizar}
          onAddTask={agregar}
          onMoveTask={(tk, ph, w, o) => void mover(tk, ph, w, o)}
          onOpenTask={(pk, tk) => setAbierta({ phaseKey: pk, taskKey: tk })}
        />
      )}

      <TaskDetailDrawer
        open={!!tareaAbierta}
        task={tareaAbierta}
        phaseKey={abierta?.phaseKey ?? null}
        phaseName={faseAbierta ? `${String(faseAbierta.loopNumero).padStart(2, "0")} · ${faseAbierta.name} · ${faseAbierta.proyecto}` : ""}
        phaseDurationWeeks={faseAbierta?.durationWeeks ?? 1}
        absolutePhaseStart={faseAbierta?.startWeek ?? 0}
        anchor={ancla}
        onClose={() => {
          // Una tarea nueva que se cierra sin título no queda: el cronograma no guarda tareas en blanco.
          if (abierta && tareaAbierta && !tareaAbierta.id && !tareaAbierta.title.trim()) void quitar(abierta.phaseKey, abierta.taskKey);
          setAbierta(null);
        }}
        onToggleStatus={(id, next) => void cambiarEstado(id, next)}
        onUpdateTask={actualizar}
        onRemoveTask={(pk, tk) => void quitar(pk, tk)}
        canDelete={puede.borrar}
        onNavigate={(dir) => {
          const otra = todas[lugar + dir];
          if (otra) setAbierta(otra);
        }}
        hasPrev={lugar > 0}
        hasNext={lugar >= 0 && lugar < todas.length - 1}
      />
    </div>
  );
}

const PUNTO = { activo: "bg-success-ink", revocado: "bg-warn-ink" } as const;

/** «Acceso» y «Publicar» del plan, como los de La escala: el cliente ve la foto publicada en su enlace. */
function AccesoAlPlan({ clientId, acceso, onCambio }: { clientId: string; acceso: EstadoDelAccesoAlPlan; onCambio: (a: EstadoDelAccesoAlPlan) => void }) {
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [revocando, setRevocando] = useState(false);
  const url = `/api/clients/${clientId}/plan-general/acceso`;

  const hacer = async (method: "POST" | "PATCH" | "DELETE") => {
    setTrabajando(true);
    setError(null);
    setRevocando(false);
    try {
      onCambio(await pedir<EstadoDelAccesoAlPlan>(url, { method }));
      if (method === "PATCH") toast.success("Publicado: el cliente ya ve esta versión.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer el cambio.");
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async (enlace: string) => {
    try {
      await navigator.clipboard.writeText(enlace);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar: selecciónalo y cópialo a mano.");
    }
  };

  const punto = acceso.estado === "sin-generar" ? null : PUNTO[acceso.estado];
  // En local, el enlace del .env (3004) se pasa a la dirección que se está mirando (lib/external/enlace-local.ts).
  const enlace = acceso.enlace ? enlaceEnEsteNavegador(acceso.enlace, typeof window === "undefined" ? null : window.location.origin) : null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {acceso.estado === "activo" && (
        <span className="text-xs text-fg-muted">
          {acceso.sinPublicar ? "Hay cambios que el cliente no ve." : acceso.publicadoEn ? `Publicado el ${diaYHora(acceso.publicadoEn)}.` : ""}
        </span>
      )}
      {acceso.estado === "activo" && acceso.sinPublicar && (
        <BotonAzul onClick={() => void hacer("PATCH")} disabled={trabajando}>
          Publicar
        </BotonAzul>
      )}
      <button type="button" onClick={() => setAbierto(true)} className={BOTON_DE_HERRAMIENTA} title="Acceso del cliente al plan general">
        {punto ? (
          <span className={`h-2 w-2 flex-shrink-0 rounded-full ${punto}`} aria-hidden="true" />
        ) : (
          <svg className="h-[15px] w-[15px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        )}
        Acceso
      </button>
      <Modal
        open={abierto}
        onClose={() => {
          setAbierto(false);
          setRevocando(false);
        }}
        title="Acceso del cliente al plan general"
        description="La misma página del cronograma compartible, con los loops de todos los proyectos como un solo plan y sin los proyectos de adentro. Quien tenga el enlace la ve."
      >
        <div className="space-y-3">
          {error && <Alert variant="danger">{error}</Alert>}
          {enlace ? (
            <>
              <input
                readOnly
                value={enlace}
                aria-label="Enlace para el cliente"
                onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-[13px] text-fg-secondary"
              />
              <p className="text-xs text-fg-muted">
                {acceso.ultimaVista ? `Se abrió por última vez el ${diaYHora(acceso.ultimaVista)}.` : "Todavía nadie lo ha abierto."}{" "}
                {acceso.publicadoEn
                  ? `El cliente ve lo que se publicó el ${diaYHora(acceso.publicadoEn)}${acceso.sinPublicar ? ": lo que cambiaste después le llega con «Publicar»" : ""}.`
                  : "El cliente todavía no ve nada: falta publicar."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <BotonAzul onClick={() => void copiar(enlace)}>Copiar enlace</BotonAzul>
                <a href={enlace} target="_blank" rel="noreferrer" className={BOTON_DE_HERRAMIENTA}>
                  Abrir la página
                </a>
                {acceso.sinPublicar && (
                  <BotonBlanco onClick={() => void hacer("PATCH")} disabled={trabajando}>
                    Publicar
                  </BotonBlanco>
                )}
                {!revocando && <BotonEnlace onClick={() => setRevocando(true)}>Revocar el acceso</BotonEnlace>}
              </div>
              {revocando && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
                  <p className="text-[13px] text-fg-secondary">El enlace dejará de abrir para quien ya lo tiene, y uno nuevo será otra dirección.</p>
                  <BotonBlanco disabled={trabajando} onClick={() => void hacer("DELETE")}>
                    Sí, revocar
                  </BotonBlanco>
                  <BotonEnlace onClick={() => setRevocando(false)}>Cancelar</BotonEnlace>
                </div>
              )}
            </>
          ) : (
            <div className="flex items-center gap-2">
              {acceso.estado === "revocado" && <p className="text-xs text-fg-muted">El enlace anterior ya no abre. El nuevo será otro.</p>}
              <BotonBlanco disabled={trabajando} onClick={() => void hacer("POST")}>
                {acceso.estado === "revocado" ? "Crear un enlace nuevo" : "Crear el acceso"}
              </BotonBlanco>
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}
