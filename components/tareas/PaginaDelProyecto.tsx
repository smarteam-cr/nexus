"use client";

/**
 * components/tareas/PaginaDelProyecto.tsx — un proyecto de tareas, en su página (docs/tareas-plan.md §5.3 y §9.2).
 *
 * Cabecera con responsable, fechas, para quién y avance. Si es un borrador (lo sugirió una reunión), una franja azul con
 * Activar o Descartar: nada entra solo. Dos vistas: **Lista** y **Tablero**, y el tablero se agrupa **por estado**
 * (Pendiente · En curso · Hecha) o **por sección** («Piezas», «Logística»…). Arrastrar una tarjeta solo cambia su estado
 * o su sección; si no se puede, vuelve y lo dice. Lo que se agrega acá nace sin semana: es el pendiente del proyecto.
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Segmentado, Tablero, type ColumnaDelTablero } from "@/components/ui";
import { BotonBlanco, BotonTexto, BotonUsar, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { NOMBRE_DEL_ESTADO, NOMBRE_DEL_ESTADO_DE_PROYECTO, estaAbierta } from "@/lib/tareas/estados";
import { diaCortoConSemana, lunesDeHoy } from "@/lib/tareas/semana";
import type { OpcionesDeTareas, ProyectoVista, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { Chip } from "./chips";
import { FilaDeTarea } from "./FilaDeTarea";
import { CajonDeTarea } from "./CajonDeTarea";
import { Agendar } from "./Agendar";
import { Vinculos } from "./VinculosDeLaTarea";
import { BotonDelAsistente } from "./AsistenteDeTareas";

type Vista = "lista" | "tablero";
type Agrupar = "estado" | "seccion";
const SIN_SECCION = "__sin__";
const COLUMNAS_DE_ESTADO = ["pendiente", "en_curso", "hecha"] as const;

export default function PaginaDelProyecto({ inicial }: { inicial: { proyecto: ProyectoVista; tareas: TareaVista[] } }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [proyecto, setProyecto] = useState(inicial.proyecto);
  const [tareas, setTareas] = useState(inicial.tareas);
  const [opciones, setOpciones] = useState<OpcionesDeTareas | null>(null);
  const [agendar, setAgendar] = useState<TareaVista[] | null>(null);
  const [nueva, setNueva] = useState("");
  const [nuevaSeccion, setNuevaSeccion] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const vista: Vista = params.get("vista") === "tablero" ? "tablero" : "lista";
  const agrupar: Agrupar = params.get("por") === "seccion" ? "seccion" : "estado";
  const tareaAbierta = params.get("t");

  const ponerParametro = useCallback(
    (cambios: Record<string, string | null>) => {
      const p = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(cambios)) {
        if (v) p.set(k, v);
        else p.delete(k);
      }
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  const refrescar = useCallback(async () => {
    try {
      const r = await apiTareas.proyecto(proyecto.id);
      setProyecto(r.proyecto);
      setTareas(r.tareas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }, [proyecto.id, toast]);

  useEffect(() => {
    apiTareas.opciones(proyecto.cliente?.id ?? null).then(setOpciones).catch(() => undefined);
  }, [proyecto.cliente?.id]);

  const p = proyecto;
  const borrador = p.estado === "propuesta";
  const propuestas = tareas.filter((t) => t.estado === "propuesta");
  const trabajo = tareas.filter((t) => t.estado !== "propuesta" && t.estado !== "no_se_hara");

  async function decidir(decision: "usar" | "descartar") {
    setOcupado(true);
    try {
      await apiTareas.decidirProyecto(p.id, { version: p.version, decision });
      toast.success(decision === "usar" ? "Proyecto activo. Cada persona decide su tarea." : "Descartado.");
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo decidir.");
    } finally {
      setOcupado(false);
    }
  }

  async function agregar(seccion: string | null) {
    const titulo = nueva.trim();
    if (!titulo) return;
    setOcupado(true);
    try {
      await apiTareas.crear({ titulo, proyectoId: p.id, cuando: "sin_semana", ...(seccion ? { seccion } : {}) });
      setNueva("");
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo agregar.");
    } finally {
      setOcupado(false);
    }
  }

  async function guardarSecciones(secciones: string[]) {
    setOcupado(true);
    try {
      const r = await apiTareas.cambiarProyecto(p.id, p.version, { secciones });
      setProyecto(r.proyecto);
      setTareas(r.tareas);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  /** Mover una tarjeta: optimista; si el servidor dice que no, vuelve y lo dice. */
  async function mover(t: TareaVista, columna: string) {
    const antes = tareas;
    if (agrupar === "estado") {
      const hacia = columna as (typeof COLUMNAS_DE_ESTADO)[number];
      setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, estado: hacia } : x)));
      try {
        await apiTareas.cambiar(t.id, { accion: "estado", hacia, version: t.version });
        await refrescar();
      } catch (e) {
        setTareas(antes);
        toast.error(e instanceof Error ? e.message : "No se pudo mover.");
      }
    } else {
      const seccion = columna === SIN_SECCION ? null : columna;
      setTareas((ts) => ts.map((x) => (x.id === t.id ? { ...x, seccion } : x)));
      try {
        await apiTareas.cambiar(t.id, { accion: "editar", cambios: { seccion }, version: t.version });
        await refrescar();
      } catch (e) {
        setTareas(antes);
        toast.error(e instanceof Error ? e.message : "No se pudo mover.");
      }
    }
  }

  const columnasDeEstado: ColumnaDelTablero[] = COLUMNAS_DE_ESTADO.map((e) => ({
    clave: e,
    titulo: NOMBRE_DEL_ESTADO[e],
    vacia: e === "hecha" ? "Lo terminado aparece acá." : "Nada en este estado.",
  }));
  const seccionesUsadas = p.secciones;
  const columnasDeSeccion: ColumnaDelTablero[] = [
    ...seccionesUsadas.map((s) => {
      const cuantas = trabajo.filter((t) => t.seccion === s).length;
      return {
        clave: s,
        titulo: s,
        vacia: "Arrastra una tarea acá.",
        accion:
          p.puedeAdministrar && cuantas === 0 ? (
            <BotonTexto onClick={() => void guardarSecciones(seccionesUsadas.filter((x) => x !== s))} disabled={ocupado}>
              Quitar
            </BotonTexto>
          ) : undefined,
      };
    }),
    { clave: SIN_SECCION, titulo: "Sin sección", vacia: "Todo tiene su sección." },
  ];
  const columnaDe = (t: TareaVista) =>
    agrupar === "estado" ? (t.estado === "en_curso" ? "en_curso" : t.estado === "hecha" ? "hecha" : "pendiente") : t.seccion && seccionesUsadas.includes(t.seccion) ? t.seccion : SIN_SECCION;

  const tarjeta = (t: TareaVista, { levantada }: { levantada: boolean }) => (
    <button
      type="button"
      onClick={() => !levantada && ponerParametro({ t: t.id })}
      className={cn(
        "w-full space-y-1.5 rounded-[10px] border border-line bg-surface px-3 py-2.5 text-left transition-colors hover:bg-surface-hover",
        levantada && "ring-1 ring-brand",
        t.estado === "hecha" && "opacity-70",
      )}
    >
      <p className={cn("text-[13px] text-fg", t.estado === "hecha" && "line-through decoration-fg-muted")}>
        {t.titulo} <span className="text-[11px] tabular-nums text-fg-muted">T-{t.numero}</span>
      </p>
      <span className="flex flex-wrap items-center gap-1">
        <Chip>{t.responsable ? t.responsable.nombre.split(" ")[0] : "Por asignar"}</Chip>
        {agrupar === "seccion" && <Chip>{NOMBRE_DEL_ESTADO[t.estado]}</Chip>}
        {t.semana && <Chip>{t.semana === lunesDeHoy() ? "Esta semana" : `Semana del ${diaCortoConSemana(t.semana)}`}</Chip>}
        {t.venceEl && <Chip tono={t.atrasada ? "rojo" : "neutro"}>Vence {diaCortoConSemana(t.venceEl)}</Chip>}
        {t.esperando.some((r) => r.abierta) && <Chip tono="ambar">Esperando a T-{t.esperando.find((r) => r.abierta)!.numero}</Chip>}
      </span>
    </button>
  );

  return (
    <div className={SHELL_DEFAULT}>
      <div className="space-y-5 pb-12">
        <PageHeader
          title={p.nombre}
          crumbs={[{ label: "Mis tareas", href: "/tareas" }, { label: p.nombre }]}
          description={`${NOMBRE_DEL_ESTADO_DE_PROYECTO[p.estado]} · ${p.espacio.nombre} · ${p.ambito.etiqueta}`}
          action={<BotonDelAsistente chip={{ tipo: "proyecto", id: p.id, etiqueta: `«${p.nombre}»` }} />}
        />

        {borrador && p.puedeDecidir && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-info-line bg-info-surface px-4 py-3">
            <p className="min-w-0 flex-1 text-[13px] text-brand">
              {p.origen === "chat"
                ? "Es el borrador de un plan armado con el asistente. Revisa sus tareas: al activarlo se reparten, y nadie recibe nada antes."
                : "Nexus sugiere este proyecto. Revisa sus tareas: al activarlo, cada persona decide la suya. Nada entra solo."}
            </p>
            <BotonTexto disabled={ocupado} onClick={() => void decidir("descartar")}>
              Descartar
            </BotonTexto>
            <BotonUsar disabled={ocupado} onClick={() => void decidir("usar")}>
              Activar
            </BotonUsar>
          </div>
        )}

        <dl className="grid gap-4 rounded-xl border border-line bg-surface px-4 py-3 text-[13px] sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className={ROTULO_DEL_SISTEMA}>Responsable</dt>
            <dd className="mt-0.5 text-fg">{p.responsable?.nombre ?? "Sin responsable"}</dd>
          </div>
          <div>
            <dt className={ROTULO_DEL_SISTEMA}>Fechas</dt>
            <dd className="mt-0.5 text-fg">
              {p.iniciaEl ? `Inicia ${diaCortoConSemana(p.iniciaEl)}` : "Sin inicio"}
              {p.venceEl ? ` · vence ${diaCortoConSemana(p.venceEl)}` : ""}
            </dd>
          </div>
          <div>
            <dt className={ROTULO_DEL_SISTEMA}>Avance</dt>
            <dd className="mt-0.5 text-fg">
              {p.avance.hechas} de {p.avance.total} hechas
              {p.avance.sumadasEstaSemana ? ` · se sumaron ${p.avance.sumadasEstaSemana} esta semana` : ""}
            </dd>
          </div>
          <div>
            <dt className={ROTULO_DEL_SISTEMA}>{p.proyectoHubspot ? "Proyecto de HubSpot" : "Para quién"}</dt>
            <dd className="mt-0.5 text-fg">
              {p.proyectoHubspot ? `${p.proyectoHubspot.nombre}${p.proyectoHubspot.cerrado ? " · cerrado" : ""}` : p.ambito.etiqueta}
            </dd>
          </div>
        </dl>

        {p.descripcion && <p className="whitespace-pre-line text-sm text-fg-secondary">{p.descripcion}</p>}

        {/* Lo que acompaña al proyecto (un negocio, un ticket, una propuesta): no cambia para quién es. */}
        {!borrador && <Vinculos dueno={{ tipo: "proyecto", id: p.id }} puedeEditar={p.puedeAdministrar} />}

        {propuestas.length > 0 && (
          <section className="space-y-1.5">
            <p className={ROTULO_DEL_SISTEMA}>Por decidir · {propuestas.length}</p>
            <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
              {propuestas.map((t) => (
                <FilaDeTarea key={t.id} t={t} conResponsable onAbrir={(x) => ponerParametro({ t: x.id })} />
              ))}
            </ul>
          </section>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Segmentado
            opciones={[
              { clave: "lista", etiqueta: "Lista" },
              { clave: "tablero", etiqueta: "Tablero" },
            ]}
            valor={vista}
            onCambio={(v) => ponerParametro({ vista: v === "lista" ? null : v })}
            etiqueta="Vista"
          />
          {vista === "tablero" && (
            <Segmentado
              opciones={[
                { clave: "estado", etiqueta: "Por estado" },
                { clave: "seccion", etiqueta: "Por sección" },
              ]}
              valor={agrupar}
              onCambio={(v) => ponerParametro({ por: v === "estado" ? null : v })}
              etiqueta="Agrupar el tablero"
            />
          )}
          {p.puedeAdministrar && (vista === "lista" || agrupar === "seccion") && !borrador && (
            nuevaSeccion === null ? (
              <BotonTexto onClick={() => setNuevaSeccion("")} disabled={seccionesUsadas.length >= 12}>
                + Sección
              </BotonTexto>
            ) : (
              <span className="flex items-center gap-1.5">
                <input
                  autoFocus
                  value={nuevaSeccion}
                  onChange={(e) => setNuevaSeccion(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && nuevaSeccion.trim() && !seccionesUsadas.includes(nuevaSeccion.trim())) {
                      void guardarSecciones([...seccionesUsadas, nuevaSeccion.trim()]).then(() => setNuevaSeccion(null));
                    }
                    if (e.key === "Escape") setNuevaSeccion(null);
                  }}
                  maxLength={60}
                  placeholder="Nombre de la sección"
                  aria-label="Nombre de la sección nueva"
                  className="h-8 w-48 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
                />
                <BotonTexto onClick={() => setNuevaSeccion(null)}>Cancelar</BotonTexto>
              </span>
            )
          )}
        </div>

        {vista === "tablero" ? (
          <>
            <Tablero
              etiqueta={agrupar === "estado" ? "Tablero por estado" : "Tablero por sección"}
              columnas={agrupar === "estado" ? columnasDeEstado : columnasDeSeccion}
              items={trabajo}
              claveDe={(t) => t.id}
              columnaDe={columnaDe}
              tarjeta={tarjeta}
              fija={(t) => (agrupar === "estado" ? !(t.acciones.empezar || t.acciones.terminar || t.acciones.reabrir) : !t.acciones.editar)}
              onMover={(t, c) => void mover(t, c)}
            />
            <p className="text-xs text-fg-muted">Arrastrar solo cambia {agrupar === "estado" ? "el estado" : "la sección"}. Con el teclado, ábrela y cámbialo en su cajón.</p>
          </>
        ) : (
          <div className="space-y-4">
            {(seccionesUsadas.length ? [...seccionesUsadas, SIN_SECCION] : [SIN_SECCION]).map((s) => {
              const enLaSeccion = trabajo.filter((t) => columnaDeSeccion(t, seccionesUsadas) === s);
              if (s === SIN_SECCION && seccionesUsadas.length && enLaSeccion.length === 0) return null;
              return (
                <section key={s} className="space-y-1.5">
                  {seccionesUsadas.length > 0 && (
                    <p className={ROTULO_DEL_SISTEMA}>
                      {s === SIN_SECCION ? "Sin sección" : s} · {enLaSeccion.length}
                    </p>
                  )}
                  {enLaSeccion.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line px-4 py-3 text-[13px] text-fg-muted">Todavía nada en esta sección.</p>
                  ) : (
                    <ul className="divide-y divide-line rounded-xl border border-line bg-surface">
                      {enLaSeccion.map((t) => (
                        <FilaDeTarea key={t.id} t={t} conResponsable onAbrir={(x) => ponerParametro({ t: x.id })} />
                      ))}
                    </ul>
                  )}
                </section>
              );
            })}
          </div>
        )}

        {!borrador && p.estado !== "descartado" && p.estado !== "terminado" && (
          <div className="flex items-center gap-2">
            <input
              value={nueva}
              onChange={(e) => setNueva(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void agregar(null)}
              placeholder="+ Agregar una tarea al proyecto (nace sin semana)"
              aria-label="Agregar una tarea al proyecto"
              className="h-9 min-w-0 flex-1 rounded-lg border border-line bg-surface px-3 text-[13px] text-fg outline-none placeholder:text-fg-muted"
            />
            <BotonBlanco disabled={!nueva.trim() || ocupado} onClick={() => void agregar(null)}>
              Agregar
            </BotonBlanco>
          </div>
        )}
        {trabajo.length > 0 && <TotalesPorEstado tareas={trabajo} />}
      </div>

      <CajonDeTarea
        id={tareaAbierta}
        lunesDeHoy={lunesDeHoy()}
        opciones={opciones}
        onCerrar={() => ponerParametro({ t: null })}
        onCambio={() => void refrescar()}
        onAgendar={(t) => setAgendar([t])}
        onDecidir={(t, usarClienteSugerido) =>
          void apiTareas
            .decidir(t.id, t.version, { tipo: "usar", usarClienteSugerido })
            .then(() => {
              ponerParametro({ t: null });
              return refrescar();
            })
            .catch((e: unknown) => toast.error(e instanceof Error ? e.message : "No se pudo decidir."))
        }
      />
      {agendar && (
        <Agendar
          tareas={agendar}
          onCerrar={() => {
            setAgendar(null);
            void refrescar();
          }}
        />
      )}
    </div>
  );
}

function columnaDeSeccion(t: TareaVista, secciones: readonly string[]): string {
  return t.seccion && secciones.includes(t.seccion) ? t.seccion : SIN_SECCION;
}

function TotalesPorEstado({ tareas }: { tareas: TareaVista[] }) {
  const abiertas = tareas.filter((t) => estaAbierta(t.estado)).length;
  const hechas = tareas.filter((t) => t.estado === "hecha").length;
  return (
    <p className="text-xs text-fg-muted">
      {abiertas === 1 ? "1 abierta" : `${abiertas} abiertas`} · {hechas === 1 ? "1 hecha" : `${hechas} hechas`}
    </p>
  );
}
