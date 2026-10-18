"use client";

/**
 * PanelDeContexto — la columna de la derecha del lienzo: lo que el vendedor quiere tener a la vista
 * en cualquier pieza (rediseño de escritorio, 2026-10-03). Qué sigue —y, si el agente sugirió algo,
 * un solo botón para revisarlo todo—; cómo va la arquitectura de la venta (las ocho casillas del
 * marco, en una cuadrícula que se lee de un vistazo: verde confirmado, azul sugerido, punteado falta);
 * qué falta para proponer (verde listo, azul lo que pregunta la guía de la próxima sesión: rediseño
 * de las sesiones, 2026-10-07); dónde parece estar cada área; y las objeciones que ya puso el cliente.
 *
 * No repite contenido: es un índice. Cada cosa abre su lugar (la casilla en el cajón, la pieza).
 *
 * En Exploración (etapa A, 2026-10-09) suma «Las sesiones»: cuántas hay leídas, sin leer, agendadas y
 * sin reunión (tablero Main.dc.html).
 *
 * En la exploración de un proyecto (2026-10-07) dice lo mismo con su marco: la estrategia del cliente
 * (retos, resultados, obstáculos) en vez de la arquitectura de la venta, cuánto se entiende al cliente en
 * vez de «para proponer», las áreas en juego para elegir, y sin objeciones.
 */
import Link from "next/link";
import { Button } from "@/components/ui";
import { cn } from "@/lib/cn";
import { listaParaProponer, puntoQueSePregunta, type PasoDeQueSigue } from "@/lib/exploraciones/calidad";
import { ETIQUETA_DE_LA_OBJECION, type Objecion } from "@/lib/exploraciones/casillas";
import { avanceDeLaEstrategia, escalaConEvidencia } from "@/lib/exploraciones/avance-del-proyecto";
import { conteoDeLasSesiones } from "@/lib/exploraciones/inicio";
import { definicionEnElMarco } from "@/lib/exploraciones/marco";
import { useLienzo, type PasoDelLienzoUI } from "./contexto";
import { NivelChip } from "./QueVaPrimero";
import { lineasDe } from "./Resumen";
import { IconoDeSugerencia } from "./FranjaDeSugerencias";
import { useGuiaDeLaSesion } from "./piezas-de-la-sesion";
import { useSesiones } from "./useSesiones";
import { diaConSemana } from "@/lib/exploraciones/fechas";
import { siguientePasoDeLaPreventa } from "@/lib/exploraciones/siguiente-paso-de-la-preventa";

/** A qué apuntan las preguntas de la guía de la próxima sesión: lo que «se pregunta» en ella. */
function useLoQueSePreguntaEnLaProxima() {
  const { todas, claveDeLaProxima } = useSesiones();
  const proxima = todas.find((p) => p.clave === claveDeLaProxima) ?? todas[todas.length - 1];
  const { preguntas } = useGuiaDeLaSesion(proxima, true);
  return {
    paras: new Set(preguntas.map((p) => p.para)),
    hayDimensiones: preguntas.some((p) => p.tipo === "dimension"),
    // Un dolor que se pregunta en impacto cubre «qué pasa si no actúa» (plan-de-la-guia.ts).
    hayImpacto: preguntas.some((p) => p.tipo === "dimension" && p.paso === "impacto"),
  };
}

function Bloque({ titulo, accion, children }: { titulo: string; accion?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">{titulo}</h2>
        {accion}
      </div>
      {children}
    </section>
  );
}

/**
 * Las tarjetas del marco: las ocho de la venta de a cuatro, las tres de la estrategia de a tres. Verde
 * lo confirmado, azul lo que sugirió el agente, punteado lo que falta.
 */
function Arquitectura() {
  const { exp, marco, pendientesPara, abrirCasilla } = useLienzo();
  const { paras } = useLoQueSePreguntaEnLaProxima();
  const confirmadas = marco.tarjetas.filter((c) => lineasDe(c, exp.estado.contenido.casillas[c]).length > 0).length;
  return (
    <Bloque titulo={marco.nombre} accion={<span className="text-[11px] text-fg-muted">{confirmadas} de {marco.tarjetas.length}</span>}>
      <div data-recorrido="preventa.panel.marco" className={cn("grid gap-1.5", marco.tarjetas.length === 3 ? "grid-cols-3" : "grid-cols-4")}>
        {marco.tarjetas.map((clave) => {
          const lleno = lineasDe(clave, exp.estado.contenido.casillas[clave]).length > 0;
          const propuestas = pendientesPara((d) => d.tipo === "casilla" && d.clave === clave).length;
          const etiqueta = definicionEnElMarco(clave, marco).etiqueta;
          return (
            <button
              key={clave}
              type="button"
              onClick={() => abrirCasilla(clave)}
              title={`${etiqueta}: ${lleno ? "confirmado" : propuestas > 0 ? `${propuestas} ${propuestas === 1 ? "sugerida" : "sugeridas"} por el agente` : paras.has(clave) ? "falta · se pregunta en la próxima sesión" : "falta"}`}
              className={cn(
                "relative flex h-[46px] flex-col items-center justify-center rounded-lg border text-xs font-bold transition-colors",
                lleno
                  ? "border-transparent bg-success-surface text-success-ink"
                  : propuestas > 0
                    ? "border-transparent bg-info-surface text-brand"
                    : "border-dashed border-line text-fg-muted hover:bg-surface-hover",
              )}
            >
              {!lleno && propuestas > 0 && <IconoDeSugerencia className="absolute right-[3px] top-[3px] h-3 w-3" />}
              {marco.letras[clave]?.letra ?? etiqueta.charAt(0)}
              <span className="w-full truncate px-1 text-center text-[10px] font-medium leading-tight">{etiqueta}</span>
            </button>
          );
        })}
      </div>
      <p className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-fg-muted">
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-success" aria-hidden="true" /> confirmado
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-brand" aria-hidden="true" /> sugerido
        </span>
        <span className="flex items-center gap-1">
          <span className="h-2 w-2 rounded-full border border-dashed border-line" aria-hidden="true" /> falta
        </span>
      </p>
    </Bloque>
  );
}

/**
 * Lo que falta para proponer el land, en siete trazos y siete chips: verde lo listo, azul lo que
 * pregunta la guía de la próxima sesión, punteado lo que ninguna sesión planeada pregunta.
 */
function ParaProponer() {
  const { exp, chequeo, irA } = useLienzo();
  const { paras, hayDimensiones, hayImpacto } = useLoQueSePreguntaEnLaProxima();
  const puntos = listaParaProponer(exp.estado, chequeo);
  const listos = puntos.filter((p) => p.cumplido).length;
  const estado = (p: (typeof puntos)[number]) => (p.cumplido ? "listo" : puntoQueSePregunta(p.id, paras, hayDimensiones, hayImpacto) ? "hoy" : "falta");
  return (
    <Bloque
      titulo="Para proponer"
      accion={
        <button type="button" className="text-[11px] text-fg-muted hover:text-fg" onClick={() => irA("propuesta")}>
          {listos} de {puntos.length}
        </button>
      }
    >
      <div className="grid grid-cols-7 gap-[3px]" aria-hidden="true">
        {puntos.map((p) => (
          <span key={p.id} className={cn("h-[5px] rounded-[3px]", { listo: "bg-success", hoy: "bg-info-line", falta: "bg-line" }[estado(p)])} />
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {puntos.map((p) => {
          const e = estado(p);
          return (
            <span
              key={p.id}
              title={p.titulo}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11.5px]",
                e === "listo" && "border-success-line bg-success-surface text-success-ink",
                e === "hoy" && "border-info-line bg-info-surface text-brand",
                e === "falta" && "border-dashed border-line text-fg-muted",
              )}
            >
              {e === "listo" && "✓ "}
              {p.corto}
            </span>
          );
        })}
      </div>
      <p className="text-[11px] text-fg-muted">Verde: listo · azul: se pregunta en la próxima sesión</p>
    </Bloque>
  );
}

/**
 * En un proyecto: cuánto se entiende al cliente. La estrategia (las tres tarjetas, verde lo confirmado,
 * azul lo que pregunta la guía de la próxima sesión) y cuántas dimensiones ya tienen evidencia.
 */
function AvanceDelProyecto() {
  const { exp, chequeo } = useLienzo();
  const { paras } = useLoQueSePreguntaEnLaProxima();
  const puntos = avanceDeLaEstrategia(exp.estado);
  const { con, de } = escalaConEvidencia(chequeo);
  const estado = (p: (typeof puntos)[number]) => (p.cumplido ? "listo" : paras.has(p.id) ? "hoy" : "falta");
  return (
    <Bloque titulo="Cuánto se entiende" accion={<span className="text-[11px] text-fg-muted">{puntos.filter((p) => p.cumplido).length} de {puntos.length}</span>}>
      <div className="flex flex-wrap gap-1.5">
        {puntos.map((p) => {
          const e = estado(p);
          return (
            <span
              key={p.id}
              title={p.titulo}
              className={cn(
                "rounded-full border px-2 py-0.5 text-[11.5px]",
                e === "listo" && "border-success-line bg-success-surface text-success-ink",
                e === "hoy" && "border-info-line bg-info-surface text-brand",
                e === "falta" && "border-dashed border-line text-fg-muted",
              )}
            >
              {e === "listo" && "✓ "}
              {p.corto}
            </span>
          );
        })}
      </div>
      <p className="text-[12.5px] text-fg-secondary">
        Escala: {de === 0 ? "elige las áreas en juego" : `${con} de ${de} dimensiones con evidencia`}
      </p>
      <p className="text-[11px] text-fg-muted">Verde: confirmado · azul: se pregunta en la próxima sesión</p>
    </Bloque>
  );
}

/** En un proyecto: las áreas en juego, para sumar o sacar (la guía pregunta por sus dimensiones). */
function AreasEnJuego() {
  const { exp, escala, puedeEditar, guardando, cambiar } = useLienzo();
  const enJuego = new Set(exp.estado.areas);
  const alternar = (id: string) => {
    const areas = enJuego.has(id) ? exp.estado.areas.filter((a) => a !== id) : [...exp.estado.areas, id];
    void cambiar([{ op: "areas", areas }]);
  };
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Áreas en juego">
      {escala.areas.map((a) => {
        const activa = enJuego.has(a.id);
        return (
          <button
            key={a.id}
            type="button"
            disabled={!puedeEditar || guardando}
            aria-pressed={activa}
            onClick={() => alternar(a.id)}
            className={cn(
              "rounded-full border px-2.5 py-0.5 text-[12px] transition-colors disabled:opacity-60",
              activa ? "border-info-line bg-info-surface font-semibold text-brand" : "border-line text-fg-muted hover:bg-surface-hover hover:text-fg",
            )}
          >
            {activa ? "✓ " : "+ "}
            {a.nombre}
          </button>
        );
      })}
    </div>
  );
}

/** Dónde parece estar cada área en juego, y si sale de evidencia o de hipótesis. */
function LaEscala() {
  const { mapa, marco, irA } = useLienzo();
  const areas = mapa.chequeo.areas;
  const enProyecto = marco.clave === "cs";
  return (
    <Bloque
      titulo="La escala"
      accion={
        enProyecto ? undefined : (
          <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => irA("escala")}>
            Ver el mapa
          </button>
        )
      }
    >
      {enProyecto && <AreasEnJuego />}
      {areas.length === 0 ? (
        <p data-recorrido="preventa.panel.escala" className="text-xs text-fg-muted">
          {enProyecto ? "Elige arriba las áreas en juego." : "Elige las áreas en juego en «La escala»."}
        </p>
      ) : (
        <ul data-recorrido="preventa.panel.escala" className="space-y-1.5 rounded-xl border border-line bg-surface px-3 py-2.5">
          {areas.map((a) => {
            const hipotesis = a.dimensiones.some((d) => d.aplica && mapa.posiciones[d.id]?.clase === "hipotesis");
            return (
              <li key={a.id} className="flex items-center justify-between gap-2 text-[13px]">
                <span className="min-w-0 truncate font-medium text-fg">{a.nombre}</span>
                <span className="flex flex-shrink-0 items-center gap-1.5">
                  {a.nivel ? <NivelChip nivel={a.nivel} className="text-[13px]" /> : <span className="text-[11px] text-fg-muted">falta ubicar {a.faltan.length}</span>}
                  {a.nivel && hipotesis && <span className="text-[11px] text-warn-ink">hipótesis</span>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </Bloque>
  );
}

function Objeciones() {
  const { exp, pendientesPara, abrirCasilla, abrirObjeciones } = useLienzo();
  const dichas = (exp.estado.contenido.casillas.objeciones as Objecion[] | undefined) ?? [];
  const propuestas = pendientesPara((d) => d.tipo === "casilla" && d.clave === "objeciones").length;
  if (dichas.length === 0 && propuestas === 0) return null;
  return (
    <Bloque
      titulo="Ya objetó"
      accion={
        <button type="button" className="text-[11px] text-brand hover:underline" onClick={() => abrirCasilla("objeciones")}>
          {propuestas > 0 ? `${propuestas} ${propuestas === 1 ? "sugerida" : "sugeridas"}` : "Ver todas"}
        </button>
      }
    >
      <ul className="space-y-1.5">
        {dichas.slice(0, 3).map((o, i) => (
          <li key={i} className="rounded-xl border border-line bg-surface px-3 py-2.5" title={`${ETIQUETA_DE_LA_OBJECION[o.clase]} · ${o.respuesta ? "respondida" : "abierta"}`}>
            <p className="line-clamp-2 text-[13.5px] text-fg">«{o.texto}»</p>
            <button type="button" className="mt-1 text-[12.5px] text-brand hover:underline" onClick={abrirObjeciones}>
              Cómo responder
            </button>
          </li>
        ))}
        {dichas.length > 3 && <li className="text-[11px] text-fg-muted">y {dichas.length - 3} más</li>}
      </ul>
    </Bloque>
  );
}

/** «Las sesiones»: en qué está la reunión de cada una, contado (lo que no hay no se dice). */
function LasSesiones() {
  const { pestanas, estadoDeLaReunion } = useSesiones();
  if (pestanas.length === 0) return null;
  const c = conteoDeLasSesiones(pestanas.map(estadoDeLaReunion));
  const filas: { n: number; marca: string; clase: string; texto: string }[] = [
    { n: c.leidas, marca: "●", clase: "text-success-ink", texto: c.leidas === 1 ? "leída" : "leídas" },
    { n: c.sinLeer, marca: "●", clase: "text-warning", texto: "sin leer" },
    { n: c.atencion, marca: "●", clase: "text-warning", texto: c.atencion === 1 ? "pide atención" : "piden atención" },
    { n: c.agendadas, marca: "●", clase: "text-fg-muted", texto: c.agendadas === 1 ? "agendada" : "agendadas" },
    { n: c.sinReunion, marca: "○", clase: "text-fg-muted", texto: "sin reunión" },
  ];
  return (
    <Bloque titulo="Las sesiones">
      <ul className="space-y-1.5">
        {filas
          .filter((f) => f.n > 0)
          .map((f) => (
            <li key={f.texto} className="text-[13px] text-fg-secondary">
              <span className={f.clase} aria-hidden>
                {f.marca}
              </span>{" "}
              {f.n} {f.texto}
            </li>
          ))}
      </ul>
    </Bloque>
  );
}

function Proyectos() {
  const { proyectos } = useLienzo();
  if (proyectos.length === 0) return null;
  return (
    <p className="text-2xs text-fg-muted">
      Le llega al handoff de{" "}
      {proyectos.map((p, i) => (
        <span key={p.id}>
          {i > 0 && ", "}
          <Link href={`/clients/${p.clientId}?tab=${p.id}`} className="text-brand hover:underline">
            {p.nombre}
          </Link>
        </span>
      ))}
      , marcada como estimada: le dice al CSE dónde mirar.
    </p>
  );
}

/**
 * El siguiente paso de la exploración (ficha B, 2026-10-17, roadmap «Ventas», paso 3): agendar la próxima sesión o, si
 * ya está agendada, planificarla (lib/exploraciones/siguiente-paso-de-la-preventa.ts). Agendar arma el evento en Google
 * Calendar por enlace: lo guarda la persona y Google manda la invitación; después se une a la sesión.
 */
function SiguientePaso() {
  const { exp, irA, sesion, puedeEditar } = useLienzo();
  const { sesiones, hoy, pestanas } = useSesiones();
  const paso = siguientePasoDeLaPreventa({
    sesiones,
    agenda: exp.leido.agenda,
    guias: exp.estado.propuesta.guias,
    hoy,
    empresa: exp.empresa.nombre,
    pasadasSinSesion: pestanas.filter((p) => !p.sesion && p.hecha).length,
    dia: (v) => diaConSemana(v.length === 10 ? v + "T12:00:00-06:00" : v),
    enProyecto: exp.marco === "cs",
  });
  const planificar = (id: string | null) => {
    irA("exploracion");
    if (!id) return sesion.buscarReunion({ tipo: "nueva", ver: "agendadas" });
    sesion.elegir(id);
    sesion.ponerMomento(id, "antes");
  };
  return (
    <section data-recorrido="preventa.siguiente-paso" className="flex flex-col gap-2 rounded-xl border border-line bg-surface p-3.5">
      <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-fg-muted">Siguiente sesión</h2>
      <p className="text-[13px] leading-[1.45] text-fg">{paso.texto}</p>
      {paso.tipo === "agendar" && (
        <div className="flex flex-wrap gap-2">
          <a
            href={paso.enlace}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
          >
            Crear el evento en Google Calendar
          </a>
          {puedeEditar && (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                irA("exploracion");
                sesion.buscarReunion({ tipo: "nueva", ver: "agendadas" });
              }}
            >
              Unirla a la sesión
            </Button>
          )}
        </div>
      )}
      {paso.tipo === "planificar" && (
        <Button size="sm" variant="secondary" className="self-start" onClick={() => planificar(paso.sesionId)}>
          {paso.sesionId ? "Planificar la sesión " + paso.numero : "Unirla a una sesión"}
        </Button>
      )}
      {paso.tipo === "lista" && paso.sesionId && (
        <button type="button" className="self-start text-xs font-semibold text-brand hover:underline" onClick={() => planificar(paso.sesionId)}>
          Ver su preparación
        </button>
      )}
    </section>
  );
}

export default function PanelDeContexto({
  sigue,
  nombreDelPaso,
  paso,
}: {
  sigue: { texto: string; paso: PasoDeQueSigue | null };
  nombreDelPaso: (p: PasoDelLienzoUI) => string;
  /** La pieza abierta: en «La escala» no se repite dónde está cada área (tablero del 2026-10-05). */
  paso: PasoDelLienzoUI;
}) {
  const { irA, revisables, abrirRevision, marco } = useLienzo();
  const enProyecto = marco.clave === "cs";
  return (
    <div className="space-y-6">
      <section data-recorrido="que-sigue" className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface p-3.5">
        <h2 className="text-2xs font-semibold uppercase tracking-[0.08em] text-brand">Qué sigue</h2>
        <p className="text-sm leading-[1.4] text-fg">{sigue.texto}</p>
        {sigue.paso ? (
          <Button size="sm" variant="primary" className="self-start rounded-md font-semibold" onClick={() => irA(sigue.paso!)}>
            Ir a «{nombreDelPaso(sigue.paso)}»
          </Button>
        ) : (
          revisables.length > 0 && (
            <Button size="sm" variant="primary" className="self-start rounded-md font-semibold" onClick={() => abrirRevision()}>
              Revisar {revisables.length === 1 ? "la sugerencia" : `las ${revisables.length}`} →
            </Button>
          )
        )}
      </section>
      <SiguientePaso />
      {paso === "exploracion" && <LasSesiones />}
      <Arquitectura />
      {enProyecto ? <AvanceDelProyecto /> : <ParaProponer />}
      {paso !== "escala" && <LaEscala />}
      {marco.conObjeciones && <Objeciones />}
      {!enProyecto && <Proyectos />}
    </div>
  );
}
