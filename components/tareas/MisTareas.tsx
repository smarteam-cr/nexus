"use client";

/**
 * components/tareas/MisTareas.tsx — la pantalla «Mis tareas» (docs/tareas-plan.md §9.2).
 *
 * Arriba y una vez: las semanas sin revisar y lo que espera tu decisión (en azul, con la chispa). Después, tu semana
 * por prioridad, lo que viene, «Por asignar» de tu equipo, lo que pediste y lo hecho. A la derecha, «Qué sigue» con
 * el ÚNICO botón azul de la pantalla, tus horas y tus proyectos.
 *
 * El cajón de una tarea va en `?t=<id>`, el de un proyecto en `?p=<id>`, y `?revisar=AAAA-MM-DD` abre la revisión.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { EmptyState, PageHeader, Segmentado } from "@/components/ui";
import PanelLateral from "@/components/ui/PanelLateral";
import { BotonAzul, BotonBlanco, BotonEnlace, BotonTexto, BotonUsar, FranjaDeSugerencias, QueSigue, ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";
import { estaAbierta } from "@/lib/tareas/estados";
import { NOMBRE_DEL_AMBITO, type Ambito } from "@/lib/tareas/ambito";
import { rangoDeLaSemana } from "@/lib/tareas/semana";
import type { EspacioEnLista, MisTareasDatos, OpcionesDeTareas, ProyectoVista, TareaVista } from "@/lib/tareas/tipos";
import Link from "next/link";
import { apiTareas, EVENTO_TAREAS_CAMBIARON } from "./api";
import { horas } from "./chips";
import { FilaDeTarea } from "./FilaDeTarea";
import { PropuestaDeTarea, type DecisionEnPantalla } from "./PropuestaDeTarea";
import { CajonDeTarea } from "./CajonDeTarea";
import { CajonDeProyecto } from "./CajonDeProyecto";
import { LineaParaAgregar, type NuevaDesdeLaLinea } from "./LineaParaAgregar";
import { InicioDeTareas } from "./InicioDeTareas";
import { LeerReunion } from "./LeerReunion";
import { RevisaTuSemana } from "./RevisaTuSemana";
import { NuevoEspacio } from "./NuevoEspacio";
import { CalendarioDeLaSemana, TableroDeLaSemana } from "./VistasDeLaSemana";
import { Agendar } from "./Agendar";
import { BotonDelAsistente } from "./AsistenteDeTareas";

type FiltroPara = "todos" | Ambito;

function Seccion({
  titulo,
  cuenta,
  minutos,
  children,
  plegada = false,
  accion,
}: {
  titulo: string;
  cuenta: number;
  minutos?: number;
  children: React.ReactNode;
  plegada?: boolean;
  accion?: React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(!plegada);
  return (
    <section className="rounded-xl border border-line bg-surface">
      <header className="flex items-center gap-2 border-b border-line px-4 py-2.5">
        <button type="button" aria-expanded={abierta} onClick={() => setAbierta((x) => !x)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
          <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 text-fg-muted transition-transform", abierta && "rotate-90")} fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M9 6l6 6-6 6" />
          </svg>
          <h2 className="text-sm font-semibold text-fg">{titulo}</h2>
          <span className="text-xs tabular-nums text-fg-muted">
            {cuenta}
            {minutos ? ` · ${horas(minutos)}` : ""}
          </span>
        </button>
        {accion}
      </header>
      {abierta && children}
    </section>
  );
}

export default function MisTareas({ inicial }: { inicial: MisTareasDatos }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [datos, setDatos] = useState(inicial);
  const [opciones, setOpciones] = useState<OpcionesDeTareas | null>(null);
  const [ocupadas, setOcupadas] = useState<Set<string>>(new Set());
  const [filtro, setFiltro] = useState<FiltroPara>("todos");
  const [busqueda, setBusqueda] = useState("");
  const [leer, setLeer] = useState(false);
  const [agendar, setAgendar] = useState<TareaVista[] | null>(null);
  const [verInicio, setVerInicio] = useState(inicial.primeraVez);
  const [espacios, setEspacios] = useState<EspacioEnLista[] | null>(null);
  const [nuevoEspacio, setNuevoEspacio] = useState(false);

  const tareaAbierta = params.get("t");
  const vista: "lista" | "tablero" | "calendario" = params.get("vista") === "tablero" ? "tablero" : params.get("vista") === "calendario" ? "calendario" : "lista";
  const proyectoAbierto = params.get("p");
  const revisar = params.get("revisar");

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

  const refrescar = useCallback(async () => {
    try {
      setDatos(await apiTareas.mias());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo actualizar.");
    }
  }, [toast]);

  useEffect(() => {
    apiTareas.opciones().then(setOpciones).catch(() => undefined);
    // Que Nexus mire si terminó una reunión de los sprints (ficha A: el servidor lo hace como mucho cada 10 minutos).
    apiTareas.mirarSeries().catch(() => undefined);
    apiTareas.espacios().then((r) => setEspacios(r.espacios)).catch(() => setEspacios([]));
  }, []);

  // «+ Tarea» del menú anota sin pasar por esta pantalla: se vuelve a pedir lo tuyo.
  useEffect(() => {
    const alCambiar = () => void refrescar();
    window.addEventListener(EVENTO_TAREAS_CAMBIARON, alCambiar);
    return () => window.removeEventListener(EVENTO_TAREAS_CAMBIARON, alCambiar);
  }, [refrescar]);

  async function conTarea<T>(id: string, fn: () => Promise<T>): Promise<T | undefined> {
    setOcupadas((s) => new Set(s).add(id));
    try {
      return await fn();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo completar.");
      return undefined;
    } finally {
      setOcupadas((s) => {
        const n = new Set(s);
        n.delete(id);
        return n;
      });
    }
  }

  async function decidir(t: TareaVista, d: DecisionEnPantalla) {
    const ok = await conTarea(t.id, () => apiTareas.decidir(t.id, t.version, d as Record<string, unknown>));
    if (ok) {
      const texto: Record<DecisionEnPantalla["tipo"], string> = {
        usar: "Quedó en tu semana.",
        mas_adelante: "Quedó para más adelante.",
        rechazar: "Descartada.",
        no_es_mia: "Se la pasaste. Le llega como propuesta.",
        misma: "Listo: era la misma tarea.",
        retirar: "Retiraste el pedido.",
      };
      toast.success(texto[d.tipo]);
      await refrescar();
    }
  }

  async function terminar(t: TareaVista) {
    const hacia = t.estado === "hecha" ? "pendiente" : "hecha";
    const ok = await conTarea(t.id, () => apiTareas.cambiar(t.id, { accion: "estado", hacia, version: t.version }));
    if (ok) await refrescar();
  }

  /** Tablero: arrastrar cambia el estado; si el servidor dice que no, vuelve y lo dice. */
  async function moverDeEstado(t: TareaVista, hacia: "pendiente" | "en_curso" | "hecha") {
    const ok = await conTarea(t.id, () => apiTareas.cambiar(t.id, { accion: "estado", hacia, version: t.version }));
    if (ok) await refrescar();
  }

  async function crear(n: NuevaDesdeLaLinea) {
    try {
      const r = await apiTareas.crear({ titulo: n.titulo, para: n.para, paraEquipo: n.paraEquipo, cuando: n.cuando, prioridad: n.prioridad, privada: n.privada });
      if (r.yaExistia) toast.info("Ya estaba sugerida: le sumamos la mención.");
      else if (r.estado === "propuesta") toast.success("Le llegó como propuesta. Decide esa persona.");
      else toast.success(`Anotada: T-${r.numero}.`);
      await refrescar();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo anotar.");
      throw e;
    }
  }

  async function esEsa(t: TareaVista) {
    if (t.semana !== datos.lunesDeHoy && t.acciones.moverDeSemana) {
      await conTarea(t.id, () => apiTareas.cambiar(t.id, { accion: "semana", destino: datos.lunesDeHoy, version: t.version }));
      toast.success(`T-${t.numero} pasó a esta semana.`);
      await refrescar();
    } else {
      toast.info(`T-${t.numero} ya está en tu semana.`);
    }
  }

  const pasaFiltro = useCallback(
    (t: TareaVista) => {
      if (filtro !== "todos" && t.ambito.ambito !== filtro) return false;
      const q = busqueda.trim().toLowerCase();
      if (!q) return true;
      if (/^t-?\d+$/.test(q)) return `t-${t.numero}` === q.replace(/^t-?/, "t-");
      if (q.startsWith("#")) return t.etiquetas.some((e) => e.includes(q.slice(1)));
      return t.titulo.toLowerCase().includes(q) || (t.notas ?? "").toLowerCase().includes(q) || (t.contexto ?? "").toLowerCase().includes(q) || t.etiquetas.some((e) => e.includes(q));
    },
    [filtro, busqueda],
  );

  const estaSemana = datos.estaSemana.filter(pasaFiltro);
  const semanaConHechas = [...estaSemana, ...datos.hechas.filter((t) => t.semana === datos.lunesDeHoy && pasaFiltro(t))];
  const abiertasSemana = estaSemana.filter((t) => estaAbierta(t.estado));
  const sinAgendar = datos.estaSemana.filter((t) => estaAbierta(t.estado) && t.agenda.estado !== "agendada" && t.acciones.agendar);
  const porDecidir = datos.porDecidir;
  const conteos = useMemo(() => {
    const c = new Map<Ambito, number>();
    for (const t of [...datos.estaSemana, ...datos.masAdelante]) c.set(t.ambito.ambito, (c.get(t.ambito.ambito) ?? 0) + 1);
    return c;
  }, [datos]);

  // «Qué sigue»: UN solo azul, en este orden: revisar una semana pasada, decidir, revisar esta semana, agendar.
  const queSigue = (() => {
    const pasada = datos.semanasSinRevisar[0];
    if (pasada) {
      return {
        texto: `Te falta revisar la semana del ${rangoDeLaSemana(pasada.semana)}: ${pasada.abiertas === 1 ? "1 tarea" : `${pasada.abiertas} tareas`} sin marcar.`,
        boton: "Revisar esa semana",
        accion: () => ponerParametro("revisar", pasada.semana),
      };
    }
    if (porDecidir.length) {
      return { texto: `Tienes ${porDecidir.length === 1 ? "1 tarea" : `${porDecidir.length} tareas`} por decidir.`, boton: null, accion: null };
    }
    if (datos.enVentanaDeRevision && abiertasSemana.length) {
      return { texto: `Es viernes: revisa tu semana. Tienes ${abiertasSemana.length === 1 ? "1 tarea" : `${abiertasSemana.length} tareas`} sin marcar.`, boton: "Revisar mi semana", accion: () => ponerParametro("revisar", datos.lunesDeHoy) };
    }
    if (sinAgendar.length) {
      return { texto: `${sinAgendar.length === 1 ? "1 tarea de esta semana no está" : `${sinAgendar.length} tareas de esta semana no están`} en tu agenda.`, boton: `Agendar ${sinAgendar.length === 1 ? "la tarea" : `las ${sinAgendar.length}`}`, accion: () => setAgendar(sinAgendar) };
    }
    if (!datos.estaSemana.length && !datos.masAdelante.length) return { texto: "No tienes tareas abiertas. Anota una o lee la reunión de tu equipo.", boton: null, accion: null };
    return { texto: "Tu semana está al día.", boton: null, accion: null };
  })();

  const personas = opciones?.personas ?? [];

  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <main className={cn(SHELL_DEFAULT, "min-w-0 flex-1 space-y-5 pb-12")}>
        <PageHeader
          title="Mis tareas"
          description={`${datos.yo.equipoNombre} · semana del ${rangoDeLaSemana(datos.lunesDeHoy)}`}
          action={
            <div className="flex flex-wrap items-center gap-2">
              <BotonTexto onClick={() => setVerInicio((x) => !x)}>Cómo funciona</BotonTexto>
              <BotonBlanco onClick={() => router.push("/tareas/equipo")}>Semana del equipo</BotonBlanco>
              <BotonBlanco onClick={() => router.push("/tareas/planificar")}>Planifica tu semana</BotonBlanco>
              <span data-recorrido="tareas.leer">
                <BotonBlanco onClick={() => setLeer(true)}>Leer una reunión</BotonBlanco>
              </span>
              <BotonDelAsistente />
            </div>
          }
          recorrido="tareas"
        />

        {verInicio && <InicioDeTareas onEmpezar={() => setVerInicio(false)} onLeer={() => setLeer(true)} />}

        {datos.cerradaPorElSistema && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-4 py-3">
            <p className="min-w-0 flex-1 text-[13px] text-fg-secondary">
              El sistema pasó {datos.cerradaPorElSistema.pasadas === 1 ? "1 tarea" : `${datos.cerradaPorElSistema.pasadas} tareas`} de la semana del{" "}
              {rangoDeLaSemana(datos.cerradaPorElSistema.semana)} a esta semana. ¿Terminaste alguna?
            </p>
            <BotonBlanco onClick={() => ponerParametro("revisar", datos.cerradaPorElSistema!.semana)}>Revisar</BotonBlanco>
          </div>
        )}

        {datos.semanasSinRevisar.length > 0 && (
          <div data-recorrido="tareas.sin-revisar" className="flex flex-wrap items-center gap-2 rounded-xl border border-warn-line bg-warn-surface px-4 py-3">
            <p className="min-w-0 flex-1 text-[13px] text-warn-ink">
              <span className="font-semibold">Semanas sin revisar:</span>{" "}
              {datos.semanasSinRevisar.map((s) => `semana del ${rangoDeLaSemana(s.semana)} · ${s.abiertas === 1 ? "1 tarea" : `${s.abiertas} tareas`}`).join(" · ")}
            </p>
            {datos.semanasSinRevisar.map((s) => (
              <BotonBlanco key={s.semana} onClick={() => ponerParametro("revisar", s.semana)}>
                Revisar la del {rangoDeLaSemana(s.semana).split(" al ")[0]}
              </BotonBlanco>
            ))}
          </div>
        )}

        {(porDecidir.length > 0 || datos.proyectosPorDecidir.length > 0) && (
          <section className="space-y-2" data-recorrido="tareas.por-decidir">
            <FranjaDeSugerencias>
              {porDecidir.length > 0 ? `${porDecidir.length === 1 ? "1 tarea espera" : `${porDecidir.length} tareas esperan`} tu decisión. Nada entra solo.` : "Nexus sugiere un proyecto."}
            </FranjaDeSugerencias>
            {datos.proyectosPorDecidir.map((p) => (
              <ProyectoPorDecidir key={p.id} p={p} onDecidido={refrescar} onAbrir={() => ponerParametro("p", p.id)} />
            ))}
            <ul className="space-y-1.5">
              {porDecidir.map((t) => (
                <PropuestaDeTarea key={t.id} t={t} personas={personas} ocupada={ocupadas.has(t.id)} onDecidir={decidir} onAbrir={(x) => ponerParametro("t", x.id)} />
              ))}
            </ul>
          </section>
        )}

        <LineaParaAgregar
          yo={datos.yo.email}
          personas={personas}
          equipos={opciones?.equiposConLider ?? []}
          abiertas={[...datos.estaSemana, ...datos.masAdelante].filter((t) => estaAbierta(t.estado))}
          onCrear={crear}
          onEsEsa={esEsa}
        />

        <div data-recorrido="tareas.filtro" className="flex flex-wrap items-center gap-2">
          <input
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            placeholder="Buscar por texto, T-# o #etiqueta"
            aria-label="Buscar tareas"
            className="h-8 w-56 rounded-md border border-line bg-surface px-2.5 text-[13px] text-fg outline-none placeholder:text-fg-muted"
          />
          <span className="text-xs text-fg-muted">Para quién:</span>
          {(["todos", "cliente", "interno", "prospecto", "aliado", "sin_clasificar"] as const).map((f) =>
            f === "todos" || conteos.get(f) ? (
              <button
                key={f}
                type="button"
                onClick={() => setFiltro(f)}
                className={cn(
                  "rounded-full border px-2.5 py-[3px] text-xs transition-colors",
                  filtro === f ? "border-info-line bg-info-surface font-semibold text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
                )}
              >
                {f === "todos" ? "Todos" : `${NOMBRE_DEL_AMBITO[f]} · ${conteos.get(f)}`}
              </button>
            ) : null,
          )}
          <span className="ml-auto" data-recorrido="tareas.vistas">
            <Segmentado
              opciones={[
                { clave: "lista", etiqueta: "Lista" },
                { clave: "tablero", etiqueta: "Tablero" },
                { clave: "calendario", etiqueta: "Calendario" },
              ]}
              valor={vista}
              onCambio={(v) => ponerParametro("vista", v === "lista" ? null : v)}
              etiqueta="Cómo ver tu semana"
            />
          </span>
        </div>

        {vista === "tablero" && (
          <TableroDeLaSemana tareas={semanaConHechas} onAbrir={(x) => ponerParametro("t", x.id)} onMover={(t, hacia) => void moverDeEstado(t, hacia)} />
        )}
        {vista === "calendario" && (
          <CalendarioDeLaSemana lunes={datos.lunesDeHoy} tareas={semanaConHechas} onAbrir={(x) => ponerParametro("t", x.id)} onAgendar={(ts) => ts.length && setAgendar(ts)} />
        )}

        {vista === "lista" && (
        <div data-recorrido="tareas.esta-semana">
        <Seccion
          titulo="Esta semana"
          cuenta={abiertasSemana.length}
          minutos={abiertasSemana.reduce((a, t) => a + (t.minutosEstimados ?? 0), 0)}
          accion={
            abiertasSemana.length > 0 ? (
              <BotonEnlace onClick={() => ponerParametro("revisar", datos.lunesDeHoy)}>Revisar mi semana</BotonEnlace>
            ) : undefined
          }
        >
          {estaSemana.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-fg-muted">Nada para esta semana todavía.</p>
          ) : (
            <ul className="divide-y divide-line">
              {estaSemana.map((t) => (
                <FilaDeTarea key={t.id} t={t} conAgenda ocupada={ocupadas.has(t.id)} onAbrir={(x) => ponerParametro("t", x.id)} onTerminar={terminar} />
              ))}
            </ul>
          )}
        </Seccion>
        </div>
        )}

        {datos.porAsignar.length > 0 && (
          <Seccion titulo={`Por asignar · ${datos.yo.equipoNombre}`} cuenta={datos.porAsignar.length}>
            <ul className="divide-y divide-line">
              {datos.porAsignar.filter(pasaFiltro).map((t) => (
                <FilaDeTarea key={t.id} t={t} ocupada={ocupadas.has(t.id)} onAbrir={(x) => ponerParametro("t", x.id)} />
              ))}
            </ul>
          </Seccion>
        )}

        <Seccion titulo="Más adelante" cuenta={datos.masAdelante.filter(pasaFiltro).length} plegada={datos.masAdelante.length > 8}>
          {datos.masAdelante.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-fg-muted">Nada para más adelante.</p>
          ) : (
            <ul className="divide-y divide-line">
              {datos.masAdelante.filter(pasaFiltro).map((t) => (
                <FilaDeTarea key={t.id} t={t} ocupada={ocupadas.has(t.id)} onAbrir={(x) => ponerParametro("t", x.id)} onTerminar={terminar} />
              ))}
            </ul>
          )}
        </Seccion>

        {datos.loQuePediste.length > 0 && (
          <Seccion
            titulo="Lo que pediste"
            cuenta={datos.loQuePediste.length}
            plegada
            accion={
              <Link href="/tareas/delegadas" className="text-xs font-medium text-brand hover:underline">
                Ver cómo va
              </Link>
            }
          >
            <ul className="divide-y divide-line">
              {datos.loQuePediste.map((t) => (
                <FilaDeTarea key={t.id} t={t} conResponsable sinPedida onAbrir={(x) => ponerParametro("t", x.id)} />
              ))}
            </ul>
          </Seccion>
        )}

        <Seccion titulo="Hechas (2 semanas)" cuenta={datos.hechas.length} plegada>
          {datos.hechas.length === 0 ? (
            <p className="px-4 py-4 text-[13px] text-fg-muted">Todavía nada hecho en estas dos semanas.</p>
          ) : (
            <ul className="divide-y divide-line">
              {datos.hechas.map((t) => (
                <FilaDeTarea key={t.id} t={t} onAbrir={(x) => ponerParametro("t", x.id)} onTerminar={terminar} />
              ))}
            </ul>
          )}
        </Seccion>
      </main>

      <PanelLateral etiqueta="Tu semana" ancho="lg:w-[320px]">
        <div className="space-y-6">
          <QueSigue accion={queSigue.boton && queSigue.accion ? <BotonAzul onClick={queSigue.accion}>{queSigue.boton}</BotonAzul> : undefined}>{queSigue.texto}</QueSigue>
          <section className="space-y-2" data-recorrido="tareas.horas">
            <p className={ROTULO_DEL_SISTEMA}>Tu semana en horas</p>
            <p className="text-2xl font-semibold tabular-nums text-fg">
              {horas(datos.horas.minutos)} <span className="text-sm font-normal text-fg-muted">de {horas(datos.horas.disponibles)}</span>
            </p>
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-hover">
              <div className="h-full rounded-full bg-brand" style={{ width: `${Math.min(100, Math.round((datos.horas.minutos / Math.max(1, datos.horas.disponibles)) * 100))}%` }} />
            </div>
            {datos.horas.sinEstimar > 0 && <p className="text-xs text-fg-muted">+{datos.horas.sinEstimar} sin estimar</p>}
          </section>
          {datos.proyectos.length > 0 && (
            <section className="space-y-2">
              <p className={ROTULO_DEL_SISTEMA}>Tus proyectos</p>
              <ul className="space-y-1.5">
                {datos.proyectos.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => ponerParametro("p", p.id)} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-left transition-colors hover:bg-surface-hover">
                      <span className="block text-[13px] font-medium text-fg">{p.nombre}</span>
                      <span className="text-xs text-fg-muted">
                        {p.avance.hechas} de {p.avance.total} hechas · {p.ambito.etiqueta}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="space-y-2" data-recorrido="tareas.espacios">
            <div className="flex items-baseline justify-between gap-2">
              <p className={ROTULO_DEL_SISTEMA}>Tus espacios</p>
              <BotonTexto onClick={() => setNuevoEspacio(true)}>+ Nuevo espacio</BotonTexto>
            </div>
            {espacios === null ? null : espacios.length === 0 ? (
              <p className="text-xs text-fg-muted">Para un trabajo que junta a varios equipos (un evento, una campaña).</p>
            ) : (
              <ul className="space-y-1.5">
                {espacios.map((e) => (
                  <li key={e.id}>
                    <Link href={`/tareas/espacios/${e.id}`} className="block rounded-lg border border-line bg-surface px-3 py-2 transition-colors hover:bg-surface-hover">
                      <span className="block text-[13px] font-medium text-fg">{e.nombre}</span>
                      <span className="text-xs text-fg-muted">{e.proyectosActivos === 1 ? "1 proyecto activo" : `${e.proyectosActivos} proyectos activos`}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {!datos.estaSemana.length && !datos.porDecidir.length && !datos.masAdelante.length && (
            <EmptyState title="Empieza por tu reunión" description="Lee el planning de tu equipo: Nexus te propone tus tareas y tú decides." />
          )}
        </div>
      </PanelLateral>

      <CajonDeTarea
        id={tareaAbierta}
        lunesDeHoy={datos.lunesDeHoy}
        opciones={opciones}
        onCerrar={() => ponerParametro("t", null)}
        onCambio={() => void refrescar()}
        onAgendar={(t) => setAgendar([t])}
        onDecidir={(t, usarClienteSugerido) =>
          void decidir(t, { tipo: "usar", usarClienteSugerido }).then(() => ponerParametro("t", null))
        }
      />
      <CajonDeProyecto id={proyectoAbierto} onCerrar={() => ponerParametro("p", null)} onAbrirTarea={(id) => ponerParametro("t", id)} onCambio={() => void refrescar()} />
      <LeerReunion abierto={leer} onCerrar={() => setLeer(false)} onLeida={() => void refrescar()} />
      {nuevoEspacio && <NuevoEspacio yo={datos.yo.email} onCerrar={() => setNuevoEspacio(false)} />}
      {revisar && (
        <RevisaTuSemana
          semana={revisar}
          onCerrar={() => {
            ponerParametro("revisar", null);
            void refrescar();
          }}
          onAgendar={(ts) => {
            ponerParametro("revisar", null);
            setAgendar(ts);
          }}
        />
      )}
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

function ProyectoPorDecidir({ p, onDecidido, onAbrir }: { p: ProyectoVista; onDecidido: () => Promise<void>; onAbrir: () => void }) {
  const toast = useToast();
  const [ocupado, setOcupado] = useState(false);
  async function decidir(decision: "usar" | "descartar") {
    setOcupado(true);
    try {
      await apiTareas.decidirProyecto(p.id, { version: p.version, decision });
      toast.success(decision === "usar" ? `«${p.nombre}» quedó activo. Cada persona decide su tarea.` : "Descartado. Sus tareas siguen como propuestas sueltas.");
      await onDecidido();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo decidir.");
    } finally {
      setOcupado(false);
    }
  }
  const origen = p.salioDe?.visible ? `del ${p.salioDe.titulo}` : p.salioDe ? p.salioDe.texto.toLowerCase() : "";
  return (
    <div className="flex flex-wrap items-center gap-2.5 rounded-lg border border-info-line bg-info-surface py-2.5 pl-3 pr-2.5">
      <p className="min-w-0 flex-1 text-sm text-fg">
        Nexus sugiere un proyecto: <span className="font-semibold">«{p.nombre}»</span>
        <span className="text-[13px] text-fg-secondary">
          {" "}
          · {p.avance.propuestas + p.avance.total === 1 ? "1 tarea" : `${p.avance.propuestas + p.avance.total} tareas`} {origen}
        </span>
      </p>
      {p.puedeDecidir && (
        <span className="flex items-center gap-1">
          <BotonTexto disabled={ocupado} onClick={() => void decidir("descartar")}>
            Descartar
          </BotonTexto>
          <BotonTexto disabled={ocupado} onClick={onAbrir}>
            Ver
          </BotonTexto>
          <BotonUsar disabled={ocupado} onClick={() => void decidir("usar")} />
        </span>
      )}
    </div>
  );
}
