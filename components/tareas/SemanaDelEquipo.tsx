"use client";

/**
 * components/tareas/SemanaDelEquipo.tsx — la semana del sprint de un equipo (docs/tareas-plan.md §9.2, básica en 1A.1).
 *
 * Arriba, la tira «Revisaron su semana» cuando ya toca revisar. Después, una columna por persona con sus horas y sus
 * tareas; lo privado de otros se ve como una fila opaca que solo dice cuánto pesa. A la derecha, «Por asignar», lo que
 * el equipo pidió a otros equipos (y qué decidieron) y los proyectos del equipo. No hay «Cerrar la semana»: la semana
 * del equipo está revisada cuando cada persona revisó la suya.
 *
 * La tarea abierta va en `?t=`, el proyecto en `?p=`, el equipo en `?equipo=` y la semana en `?semana=`. Cambiar de
 * equipo o de semana vuelve a pedir la página, y la página la monta de nuevo (`key`): sin estado viejo de la otra.
 */
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PageHeader, Segmentado, Select } from "@/components/ui";
import PanelLateral from "@/components/ui/PanelLateral";
import { BotonBlanco, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { estaAbierta } from "@/lib/tareas/estados";
import { rangoDeLaSemana, sumarSemanas } from "@/lib/tareas/semana";
import type { OpcionesDeTareas, PersonaDeLaSemana, SemanaDelEquipoDatos, TareaVista } from "@/lib/tareas/tipos";
import { apiTareas } from "./api";
import { ChipDeEstadoDelPedido, horas } from "./chips";
import { FilaDeTarea } from "./FilaDeTarea";
import { CajonDeTarea } from "./CajonDeTarea";
import { CajonDeProyecto } from "./CajonDeProyecto";
import { LeerReunion } from "./LeerReunion";
import { Agendar } from "./Agendar";
import { RevisarConElEquipo } from "./RevisaTuSemana";
import { MetricasDelEquipo } from "./MetricasDelEquipo";
import { TableroDeLaSemana as TableroDelEquipo } from "./VistasDeLaSemana";
import { BotonDelAsistente } from "./AsistenteDeTareas";

/** Las semanas que ofrece el selector: cuatro hacia atrás y dos hacia adelante (en 1A.2, `SelectorDePeriodo`). */
function semanasDelSelector(lunesDeHoy: string, elegida: string): string[] {
  const s = new Set<string>();
  for (let i = -4; i <= 2; i++) s.add(sumarSemanas(lunesDeHoy, i));
  s.add(elegida);
  return [...s].sort();
}

function porcentaje(minutos: number, disponibles: number): number {
  return Math.min(100, Math.round((minutos / Math.max(1, disponibles)) * 100));
}

function nombreCorto(nombre: string): string {
  return nombre.split(" ")[0] ?? nombre;
}

export default function SemanaDelEquipo({ inicial }: { inicial: SemanaDelEquipoDatos }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [datos, setDatos] = useState(inicial);
  const [opciones, setOpciones] = useState<OpcionesDeTareas | null>(null);
  const [leer, setLeer] = useState(false);
  const [revisarConElEquipo, setRevisarConElEquipo] = useState(false);
  const [agendar, setAgendar] = useState<TareaVista[] | null>(null);

  useEffect(() => {
    apiTareas.opciones().then(setOpciones).catch(() => undefined);
  }, []);

  const tareaAbierta = params.get("t");
  const proyectoAbierto = params.get("p");

  const ponerParametro = useCallback(
    (clave: string, valor: string | null) => {
      const p = new URLSearchParams(params.toString());
      if (valor) p.set(clave, valor);
      else p.delete(clave);
      const q = p.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [params, pathname, router],
  );

  /** Cambiar de equipo o de semana vuelve a pedir la página: el servidor decide qué se ve. */
  function irA(cambios: { equipo?: string; semana?: string }) {
    const p = new URLSearchParams();
    p.set("equipo", cambios.equipo ?? datos.equipo);
    const semana = cambios.semana ?? datos.semana;
    if (semana !== datos.lunesDeHoy) p.set("semana", semana);
    router.push(`${pathname}?${p.toString()}`);
  }

  const vista: "personas" | "tablero" | "metricas" = params.get("vista") === "tablero" ? "tablero" : params.get("vista") === "metricas" ? "metricas" : "personas";

  const refrescar = useCallback(async () => {
    try {
      setDatos(await apiTareas.equipo(datos.equipo, datos.semana));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }, [datos.equipo, datos.semana, toast]);

  /** Tablero: arrastrar cambia el estado (con las reglas del cajón); si no se puede, lo dice. */
  async function moverDeEstado(t: TareaVista, hacia: "pendiente" | "en_curso" | "hecha") {
    try {
      await apiTareas.cambiar(t.id, { accion: "estado", hacia, version: t.version });
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo mover.");
    }
  }

  async function decidir(t: TareaVista, usarClienteSugerido: boolean) {
    try {
      await apiTareas.decidir(t.id, t.version, { tipo: "usar", usarClienteSugerido });
      toast.success("Quedó en la semana.");
      ponerParametro("t", null);
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo decidir.");
    }
  }

  const esPasada = datos.semana < datos.lunesDeHoy;
  const tocaRevisar = datos.personas.some((p) => p.faltan > 0 || p.revisada);
  const totalMinutos = datos.personas.reduce((a, p) => a + p.minutos, 0);
  const totalDisponibles = datos.personas.reduce((a, p) => a + p.disponibles, 0);
  const pedidasAbiertas = datos.pedidoAOtros.filter((t) => estaAbierta(t.estado) || t.estado === "propuesta");

  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <main className={cn(SHELL_DEFAULT, "min-w-0 flex-1 space-y-5 pb-12")}>
        <PageHeader
          title="Semana del equipo"
          description={`${datos.equipoNombre} · semana del ${rangoDeLaSemana(datos.semana)}${esPasada ? " · ya pasó" : ""}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <BotonBlanco onClick={() => router.push("/tareas")}>Mis tareas</BotonBlanco>
              {datos.lideras && datos.personas.length > 0 && (
                <span data-recorrido="equipo.revisar">
                  <BotonBlanco onClick={() => setRevisarConElEquipo(true)}>Revisar con el equipo</BotonBlanco>
                </span>
              )}
              <span data-recorrido="tareas.leer">
                <BotonBlanco onClick={() => setLeer(true)}>Leer una reunión</BotonBlanco>
              </span>
              <BotonDelAsistente />
            </div>
          }
          recorrido="tareas-equipo"
        />

        <div data-recorrido="equipo.filtros" className="flex flex-wrap items-center gap-3">
          {datos.equipos.length > 1 && (
            <label className="flex items-center gap-2 text-xs text-fg-muted">
              Equipo
              <Select value={datos.equipo} onChange={(e) => irA({ equipo: e.target.value })} className="h-8 w-48 py-1 text-[13px]" aria-label="Equipo">
                {datos.equipos.map((e) => (
                  <option key={e.clave} value={e.clave}>
                    {e.nombre}
                  </option>
                ))}
              </Select>
            </label>
          )}
          <label className="flex items-center gap-2 text-xs text-fg-muted">
            Semana
            <Select value={datos.semana} onChange={(e) => irA({ semana: e.target.value })} className="h-8 w-56 py-1 text-[13px]" aria-label="Semana">
              {semanasDelSelector(datos.lunesDeHoy, datos.semana).map((s) => (
                <option key={s} value={s}>
                  {s === datos.lunesDeHoy ? `Esta semana · ${rangoDeLaSemana(s)}` : `Semana del ${rangoDeLaSemana(s)}`}
                </option>
              ))}
            </Select>
          </label>
          <span className="text-xs tabular-nums text-fg-muted">
            El equipo: {horas(totalMinutos)} de {horas(totalDisponibles)}
          </span>
          <span className="ml-auto">
            <Segmentado
              opciones={[
                { clave: "personas", etiqueta: "Personas" },
                { clave: "tablero", etiqueta: "Tablero" },
                { clave: "metricas", etiqueta: "Métricas" },
              ]}
              valor={vista}
              onCambio={(v) => ponerParametro("vista", v === "personas" ? null : v)}
              etiqueta="Cómo ver la semana del equipo"
            />
          </span>
        </div>

        {tocaRevisar && datos.personas.length > 0 && (
          <div data-recorrido="equipo.revisaron">
            <TiraDeLaRevision personas={datos.personas} />
          </div>
        )}

        {vista === "metricas" ? (
          <MetricasDelEquipo equipo={datos.equipo} semana={datos.semana} />
        ) : vista === "tablero" ? (
          <TableroDelEquipo conResponsable tareas={datos.personas.flatMap((p) => p.tareas)} onAbrir={(t) => ponerParametro("t", t.id)} onMover={(t, hacia) => void moverDeEstado(t, hacia)} />
        ) : datos.personas.length === 0 ? (
          <p className="rounded-xl border border-line bg-surface px-4 py-6 text-[13px] text-fg-muted">Este equipo no tiene personas activas en Nexus.</p>
        ) : (
          <div data-recorrido="equipo.personas" className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {datos.personas.map((p) => (
              <ColumnaDePersona key={p.persona.email} p={p} onAbrir={(t) => ponerParametro("t", t.id)} />
            ))}
          </div>
        )}
      </main>

      <PanelLateral etiqueta="El equipo" ancho="lg:w-[340px]">
        <div className="space-y-6">
          <section className="space-y-2" data-recorrido="equipo.por-asignar">
            <p className={ROTULO_DEL_SISTEMA}>Por asignar · {datos.porAsignar.length}</p>
            {datos.porAsignar.length === 0 ? (
              <p className="text-[13px] text-fg-muted">Nada sin dueño.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-surface">
                {datos.porAsignar.map((t) => (
                  <FilaDeTarea key={t.id} t={t} onAbrir={(x) => ponerParametro("t", x.id)} />
                ))}
              </ul>
            )}
            {datos.lideras && datos.porAsignar.length > 0 && <p className="text-xs text-fg-muted">Abre una para asignarla.</p>}
          </section>

          <section className="space-y-2" data-recorrido="equipo.pedido">
            <p className={ROTULO_DEL_SISTEMA}>Lo pedido a otros equipos · {pedidasAbiertas.length}</p>
            {datos.pedidoAOtros.length === 0 ? (
              <p className="text-[13px] text-fg-muted">El equipo no pidió nada a otros equipos en las últimas cuatro semanas.</p>
            ) : (
              <ul className="space-y-1.5">
                {datos.pedidoAOtros.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      onClick={() => ponerParametro("t", t.id)}
                      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-hover"
                    >
                      <span className="block text-[13px] text-fg">{t.titulo}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1 text-xs text-fg-muted">
                        <span>{t.responsable ? t.responsable.nombre : t.equipoNombre ?? "Otro equipo"}</span>
                        <ChipDeEstadoDelPedido t={t} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="space-y-2">
            <p className={ROTULO_DEL_SISTEMA}>Proyectos del equipo</p>
            {datos.proyectos.length === 0 ? (
              <p className="text-[13px] text-fg-muted">Todavía no hay proyectos.</p>
            ) : (
              <ul className="space-y-1.5">
                {datos.proyectos.map((p) => (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => ponerParametro("p", p.id)}
                      className={cn(
                        "w-full rounded-lg border px-3 py-2 text-left transition-colors",
                        p.estado === "propuesta" ? "border-info-line bg-info-surface hover:bg-info-surface/80" : "border-line bg-surface hover:bg-surface-hover",
                      )}
                    >
                      <span className={cn("block text-[13px] font-medium", p.estado === "propuesta" ? "text-brand" : "text-fg")}>
                        {p.estado === "propuesta" ? `Nexus sugiere: ${p.nombre}` : p.nombre}
                      </span>
                      <span className="text-xs text-fg-muted">
                        {p.avance.hechas} de {p.avance.total} hechas · {p.ambito.etiqueta}
                        {p.responsable ? ` · ${nombreCorto(p.responsable.nombre)}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </PanelLateral>

      <CajonDeTarea
        id={tareaAbierta}
        lunesDeHoy={datos.lunesDeHoy}
        opciones={opciones}
        onCerrar={() => ponerParametro("t", null)}
        onCambio={() => void refrescar()}
        onAgendar={(t) => setAgendar([t])}
        onDecidir={(t, usarClienteSugerido) => void decidir(t, usarClienteSugerido)}
      />
      <CajonDeProyecto id={proyectoAbierto} onCerrar={() => ponerParametro("p", null)} onAbrirTarea={(id) => ponerParametro("t", id)} onCambio={() => void refrescar()} />
      {revisarConElEquipo && (
        <RevisarConElEquipo
          semana={datos.semana}
          equipoNombre={datos.equipoNombre}
          personas={datos.personas}
          onCerrar={() => {
            setRevisarConElEquipo(false);
            void refrescar();
          }}
        />
      )}
      <LeerReunion abierto={leer} onCerrar={() => setLeer(false)} onLeida={() => void refrescar()} />
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

/** «Revisaron su semana: Lidia ✓ · Alejandra ● le faltan 2». Solo cuando ya toca revisar. */
function TiraDeLaRevision({ personas }: { personas: PersonaDeLaSemana[] }) {
  const faltan = personas.filter((p) => !p.revisada && p.faltan > 0);
  return (
    <div className={cn("flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-[13px]", faltan.length ? "border-warn-line bg-warn-surface" : "border-success-line bg-success-surface")}>
      <span className={cn("font-semibold", faltan.length ? "text-warn-ink" : "text-success-ink")}>Revisaron su semana:</span>
      {personas.map((p) => (
        <span key={p.persona.email} className="flex items-center gap-1 text-fg">
          {p.revisada ? (
            <>
              {nombreCorto(p.persona.nombre)} <span className="text-success-ink" aria-label="revisó su semana">✓</span>
            </>
          ) : p.faltan > 0 ? (
            <>
              {nombreCorto(p.persona.nombre)} <span className="text-warn-ink" aria-hidden="true">●</span>
              <span className="text-warn-ink">le {p.faltan === 1 ? "falta 1" : `faltan ${p.faltan}`}</span>
            </>
          ) : (
            <>
              {nombreCorto(p.persona.nombre)} <span className="text-fg-muted">· nada abierto</span>
            </>
          )}
        </span>
      ))}
    </div>
  );
}

function ColumnaDePersona({ p, onAbrir }: { p: PersonaDeLaSemana; onAbrir: (t: TareaVista) => void }) {
  const pct = porcentaje(p.minutos, p.disponibles);
  const lleno = p.minutos > p.disponibles;
  const abiertas = p.tareas.filter((t) => estaAbierta(t.estado));
  const hechas = p.tareas.filter((t) => t.estado === "hecha");
  return (
    <section className="flex min-w-0 flex-col rounded-xl border border-line bg-surface" aria-label={`La semana de ${p.persona.nombre}`}>
      <header className="space-y-1.5 border-b border-line px-4 py-3">
        <div className="flex items-baseline gap-2">
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold text-fg">{p.persona.nombre}</h2>
          <span className={cn("text-xs tabular-nums", lleno ? "text-warn-ink" : "text-fg-muted")}>
            {horas(p.minutos)} de {horas(p.disponibles)}
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
          <div className={cn("h-full rounded-full", lleno ? "bg-warn-ink" : "bg-brand")} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-fg-muted">
          {abiertas.length === 1 ? "1 abierta" : `${abiertas.length} abiertas`} · {hechas.length === 1 ? "1 hecha" : `${hechas.length} hechas`}
          {p.sinEstimar > 0 ? ` · ${p.sinEstimar} sin estimar` : ""}
        </p>
      </header>
      {p.tareas.length === 0 && p.opacas.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-fg-muted">Nada en esta semana.</p>
      ) : (
        <ul className="divide-y divide-line">
          {p.tareas.map((t) => (
            <FilaDeTarea key={t.id} t={t} onAbrir={onAbrir} />
          ))}
          {p.opacas.map((o, i) => (
            <li key={`opaca-${i}`} className="flex items-center gap-3 px-4 py-2.5" title="No ves su título: es privada o de un espacio privado.">
              <span className="h-[18px] w-[18px] flex-shrink-0 rounded-full border border-dashed border-line" aria-hidden="true" />
              <span className="min-w-0 flex-1 text-[13px] italic text-fg-muted">{o.titulo}</span>
              <span className="text-xs tabular-nums text-fg-muted">{o.minutos ? horas(o.minutos) : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
