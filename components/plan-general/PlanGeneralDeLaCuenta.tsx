"use client";

/**
 * PlanGeneralDeLaCuenta — «Plan general» en la ficha del cliente (2026-11-19, Elías: arriba de «Proyectos»). Los loops
 * de todos los proyectos de la cuenta en un solo gantt, editable: semanas, estado, tipo, nombre y detalle de cada
 * actividad, y «+ Actividad» en cada loop.
 *
 * No guarda nada propio: cada cambio va a la tarea en el cronograma de SU proyecto (mismas rutas y misma vara que el
 * Gantt del proyecto: guardTimelineEdit; borrar, guardTimelineDelete). Lo que se cambia acá se ve en el cronograma del
 * proyecto y al revés. El cliente ve la foto que se publica con «Publicar» (lib/plan-general/acceso.ts).
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, ConfirmDialog, Field, Input, Modal, Segmentado, Selector, Textarea, useToast } from "@/components/ui";
import { Drawer } from "@/components/ui/Drawer";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton, SkeletonPanel } from "@/components/ui/Skeleton";
import { BOTON_DE_HERRAMIENTA, BotonAzul, BotonBlanco, BotonEnlace } from "@/components/ui/sistema";
import type { EstadoDelAccesoAlPlan } from "@/lib/plan-general/acceso";
import {
  ETIQUETA_DEL_ESTADO,
  ETIQUETA_DEL_TIPO,
  rotuloDelLoop,
  TIPOS_DE_TRABAJO,
  type EstadoDelPlan,
  type GrupoDelPlan,
  type PlanGeneral,
  type TipoDeTrabajo,
} from "@/lib/plan-general/tipos";
import { semanasDeLaTarea } from "@/lib/plan-general/armar";
import GanttDelPlan from "./GanttDelPlan";

interface Borrador {
  grupo: GrupoDelPlan;
  /** null = una actividad nueva. */
  tareaId: string | null;
  titulo: string;
  tipo: TipoDeTrabajo | null;
  desde: number;
  hasta: number;
  estado: EstadoDelPlan;
  detalle: string;
}

const ESTADOS: readonly EstadoDelPlan[] = ["PENDING", "IN_PROGRESS", "DONE"];

/** «mié 19 nov, 3:40 p. m.» en hora de Costa Rica. */
function diaYHora(iso: string): string {
  return new Date(iso).toLocaleString("es-CR", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "America/Costa_Rica" });
}

async function pedir<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, { cache: "no-store", ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const j = (await r.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!r.ok || !j) throw new Error(j?.error ?? "No se pudo hacer el cambio. Vuelve a intentarlo.");
  return j;
}

export default function PlanGeneralDeLaCuenta({ clientId, onAbrirProyecto }: { clientId: string; onAbrirProyecto: (projectId: string) => void }) {
  const toast = useToast();
  const [plan, setPlan] = useState<PlanGeneral | null>(null);
  const [acceso, setAcceso] = useState<EstadoDelAccesoAlPlan | null>(null);
  const [puede, setPuede] = useState<{ editar: boolean; borrar: boolean }>({ editar: false, borrar: false });
  const [error, setError] = useState<string | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [borrando, setBorrando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      const j = await pedir<{ plan: PlanGeneral; acceso: EstadoDelAccesoAlPlan; puede: { editar: boolean; borrar: boolean } }>(
        `/api/clients/${clientId}/plan-general`,
      );
      setPlan(j.plan);
      setAcceso(j.acceso);
      setPuede(j.puede);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo leer el plan.");
    }
  }, [clientId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const grupos = useMemo(
    () =>
      (plan?.grupos ?? []).map((g) => ({
        key: g.faseId,
        loopNumero: g.loopNumero,
        nombre: g.nombre,
        proyecto: g.detalleConfirmado ? g.proyectoNombre : `${g.proyectoNombre} · el cliente no lo ve: falta confirmar el detalle del cronograma`,
        filas: g.filas.map((f) => ({ key: f.tareaId, titulo: f.titulo, tipo: f.tipo, desde: f.desde, hasta: f.hasta, estado: f.estado, porValidar: f.porValidar })),
      })),
    [plan],
  );
  const proyectos = useMemo(() => new Set((plan?.grupos ?? []).map((g) => g.proyectoId)).size, [plan]);

  const abrir = (grupoKey: string, filaKey: string) => {
    const g = plan?.grupos.find((x) => x.faseId === grupoKey);
    const f = g?.filas.find((x) => x.tareaId === filaKey);
    if (!g || !f) return;
    setBorrador({ grupo: g, tareaId: f.tareaId, titulo: f.titulo, tipo: f.tipo, desde: f.desde, hasta: f.hasta, estado: f.estado, detalle: f.detalle ?? "" });
  };
  const agregar = (grupoKey: string) => {
    const g = plan?.grupos.find((x) => x.faseId === grupoKey);
    if (!g) return;
    setBorrador({ grupo: g, tareaId: null, titulo: "", tipo: null, desde: g.faseDesde, hasta: g.faseDesde, estado: "PENDING", detalle: "" });
  };

  const guardar = async () => {
    if (!borrador || !plan) return;
    const b = borrador;
    if (!b.titulo.trim()) return toast.error("La actividad necesita un nombre.");
    const base = `/api/projects/${b.grupo.proyectoId}/timeline/tasks`;
    const antesDeGuardar = b.tareaId ? b.grupo.filas.find((f) => f.tareaId === b.tareaId) : null;
    const cambianLasSemanas = !antesDeGuardar || b.desde !== antesDeGuardar.desde || b.hasta !== antesDeGuardar.hasta;
    // La MISMA regla que prueba armar.test.ts: de semanas del plan a las de la tarea dentro de su loop. Solo si cambian:
    // una actividad que ya se salía (el loop se acortó en el Gantt) se puede renombrar o revisar igual.
    const enLaTarea = cambianLasSemanas ? semanasDeLaTarea(b.grupo, b.desde, b.hasta) : null;
    if (cambianLasSemanas && !enLaTarea) return toast.error("Esas semanas se salen del loop.");
    const weekIndex = enLaTarea?.weekIndex ?? 0;
    const semanas = enLaTarea?.semanas ?? 1;
    setGuardando(true);
    try {
      let tareaId = b.tareaId;
      const antes = tareaId ? b.grupo.filas.find((f) => f.tareaId === tareaId) : null;
      if (!tareaId) {
        const j = await pedir<{ task: { id: string } }>(base, {
          method: "POST",
          body: JSON.stringify({ phaseId: b.grupo.faseId, title: b.titulo.trim(), weekIndex, semanas, tipoDeTrabajo: b.tipo }),
        });
        tareaId = j.task.id;
        // Ya existe: si algo de lo que sigue falla, «Guardar» otra vez la edita en vez de crear otra igual.
        const creada = tareaId;
        setBorrador((prev) => (prev ? { ...prev, tareaId: creada } : prev));
        if (b.detalle.trim()) {
          await pedir(`${base}/${tareaId}/campos`, { method: "PATCH", body: JSON.stringify({ notes: b.detalle }) });
        }
      } else {
        const cambios: Record<string, unknown> = {};
        if (b.titulo.trim() !== antes?.titulo) cambios.title = b.titulo.trim();
        if (b.tipo !== (antes?.tipo ?? null)) cambios.tipoDeTrabajo = b.tipo;
        if ((b.detalle.trim() || null) !== (antes?.detalle ?? null)) cambios.notes = b.detalle;
        if (enLaTarea && (b.desde !== antes?.desde || b.hasta !== antes?.hasta)) {
          cambios.weekIndex = weekIndex;
          cambios.semanas = semanas;
        }
        // Guardar una «por validar» es revisarla: aunque no cambie nada, la ruta le quita la marca.
        if (antes?.porValidar && Object.keys(cambios).length === 0) cambios.title = b.titulo.trim();
        if (Object.keys(cambios).length > 0) {
          await pedir(`${base}/${tareaId}/campos`, { method: "PATCH", body: JSON.stringify(cambios) });
        }
      }
      if (b.estado !== (antes?.estado ?? "PENDING")) {
        await pedir(`${base}/${tareaId}`, { method: "PATCH", body: JSON.stringify({ status: b.estado }) });
      }
      setBorrador(null);
      toast.success(b.tareaId ? "Actividad guardada." : "Actividad agregada.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setGuardando(false);
      void cargar();
    }
  };

  const borrar = async () => {
    if (!borrador?.tareaId) return;
    try {
      await pedir(`/api/projects/${borrador.grupo.proyectoId}/timeline/tasks/${borrador.tareaId}/campos`, { method: "DELETE" });
      setBorrando(false);
      setBorrador(null);
      toast.success("Actividad eliminada.");
      void cargar();
    } catch (e) {
      setBorrando(false);
      toast.error(e instanceof Error ? e.message : "No se pudo eliminar.");
    }
  };

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
                <Skeleton className="h-4 w-56" />
                <Skeleton className="h-3 flex-1" />
              </div>
            ))}
          </div>
        </SkeletonPanel>
      </div>
    );
  }

  // Las semanas del loop, más las que la actividad tiene hoy aunque se salgan (el loop se acortó después).
  const semanasDelLoop = borrador
    ? [...new Set([...Array.from({ length: borrador.grupo.faseSemanas }, (_, i) => borrador.grupo.faseDesde + i), borrador.desde, borrador.hasta])].sort(
        (a, b) => a - b,
      )
    : [];

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h2 className="text-sm font-semibold text-fg">Plan general</h2>
          <p className="max-w-2xl text-xs text-fg-muted">
            Los loops de {proyectos === 1 ? "su proyecto" : `sus ${proyectos} proyectos`} en un solo plan. Lo que cambias aquí cambia en el
            cronograma de cada proyecto, y al revés.{puede.editar ? " Haz clic en una actividad o en su barra para moverla de semana o cambiarle el estado." : ""}
            {plan.grupos.some((g) => g.filas.some((f) => f.porValidar)) &&
              " Las marcadas «por validar» las sugirió un agente: el cliente no las ve hasta que alguien las revisa y las guarda."}
          </p>
        </div>
        {acceso && puede.editar && <AccesoAlPlan clientId={clientId} acceso={acceso} onCambio={setAcceso} />}
      </div>

      {plan.grupos.length === 0 ? (
        <EmptyState
          title="Todavía no hay loops"
          description="Un loop es una fase del cronograma de un proyecto marcada con su número. Cuando algún proyecto los tenga, aparecen aquí juntos."
        />
      ) : (
        <div className="rounded-xl border border-line bg-surface p-4">
          <GanttDelPlan
            grupos={grupos}
            semanas={plan.semanas}
            arranque={plan.arranque}
            tema="interno"
            onElegirFila={puede.editar ? abrir : undefined}
            onAgregar={puede.editar ? agregar : undefined}
          />
        </div>
      )}

      <Drawer
        open={!!borrador}
        onClose={() => !guardando && setBorrador(null)}
        title={borrador?.tareaId ? "Editar la actividad" : "Nueva actividad"}
        description={borrador ? `${rotuloDelLoop(borrador.grupo.loopNumero, borrador.grupo.nombre)} · ${borrador.grupo.proyectoNombre}` : undefined}
        footer={
          borrador && (
            <div className="flex w-full flex-wrap items-center gap-2">
              <BotonAzul onClick={() => void guardar()} disabled={guardando}>
                {guardando ? "Guardando…" : "Guardar"}
              </BotonAzul>
              <BotonBlanco onClick={() => setBorrador(null)} disabled={guardando}>
                Cancelar
              </BotonBlanco>
              {borrador.tareaId && puede.borrar && (
                <BotonEnlace onClick={() => setBorrando(true)} className="ml-auto">
                  Eliminar
                </BotonEnlace>
              )}
            </div>
          )
        }
      >
        {borrador && (
          <div className="space-y-4">
            <Field label="Actividad" required>
              <Input value={borrador.titulo} onChange={(e) => setBorrador({ ...borrador, titulo: e.target.value })} placeholder="Revisión de campañas y activos" autoFocus />
            </Field>
            <Field label="Tipo">
              <Selector
                etiqueta="Tipo de la actividad"
                placeholder="Sin tipo"
                valor={borrador.tipo ?? ""}
                opciones={[{ value: "", label: "Sin tipo" }, ...TIPOS_DE_TRABAJO.map((t) => ({ value: t, label: ETIQUETA_DEL_TIPO[t] }))]}
                onElegir={(v) => setBorrador({ ...borrador, tipo: v ? (v as TipoDeTrabajo) : null })}
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Desde la semana">
                <Selector
                  etiqueta="Semana en que empieza"
                  placeholder="Semana"
                  valor={String(borrador.desde)}
                  opciones={semanasDelLoop.map((s) => ({ value: String(s), label: `S${s}` }))}
                  onElegir={(v) => {
                    const d = Number(v);
                    setBorrador({ ...borrador, desde: d, hasta: Math.max(d, borrador.hasta) });
                  }}
                />
              </Field>
              <Field label="Hasta la semana">
                <Selector
                  etiqueta="Semana en que termina"
                  placeholder="Semana"
                  valor={String(borrador.hasta)}
                  opciones={semanasDelLoop.filter((s) => s >= borrador.desde).map((s) => ({ value: String(s), label: `S${s}` }))}
                  onElegir={(v) => setBorrador({ ...borrador, hasta: Number(v) })}
                />
              </Field>
            </div>
            <Field label="Estado">
              <Segmentado
                etiqueta="Estado de la actividad"
                opciones={ESTADOS.map((e) => ({ clave: e, etiqueta: ETIQUETA_DEL_ESTADO[e] }))}
                valor={borrador.estado}
                onCambio={(e) => setBorrador({ ...borrador, estado: e })}
              />
            </Field>
            <Field label="Detalle" hint="La acción, el entregable y quiénes participan. Es interno: el cliente no lo ve en el plan.">
              <Textarea rows={5} value={borrador.detalle} onChange={(e) => setBorrador({ ...borrador, detalle: e.target.value })} />
            </Field>
            <button
              type="button"
              onClick={() => {
                const id = borrador.grupo.proyectoId;
                setBorrador(null);
                onAbrirProyecto(id);
              }}
              className="text-xs font-medium text-brand hover:underline"
            >
              Abrir el proyecto «{borrador.grupo.proyectoNombre}»
            </button>
          </div>
        )}
      </Drawer>

      <ConfirmDialog
        open={borrando}
        onCancel={() => setBorrando(false)}
        onConfirm={borrar}
        title="¿Eliminar la actividad?"
        description="Sale del plan y del cronograma de su proyecto. Si solo no se va a hacer, mejor márcala en el cronograma del proyecto como suspendida."
        confirmLabel="Eliminar"
        variant="destructive"
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
        description="Una página con el plan como un solo gantt, sin los proyectos de adentro ni el detalle de cada actividad. Quien tenga el enlace la ve."
      >
        <div className="space-y-3">
          {error && <Alert variant="danger">{error}</Alert>}
          {acceso.enlace ? (
            <>
              <input
                readOnly
                value={acceso.enlace}
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
                <BotonAzul onClick={() => void copiar(acceso.enlace!)}>Copiar enlace</BotonAzul>
                <a href={acceso.enlace} target="_blank" rel="noreferrer" className={BOTON_DE_HERRAMIENTA}>
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
