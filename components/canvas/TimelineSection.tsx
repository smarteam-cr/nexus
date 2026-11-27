"use client";

/**
 * components/canvas/TimelineSection.tsx
 *
 * Cronograma CLIENT-FACING: lo ve el cliente en su página (/external/cronograma y /external/plan), viaja dentro del
 * kickoff publicado y se imprime en el PDF del documento Cronograma. Estilos INLINE con hex literal a propósito: este
 * árbol no puede usar utilidades de gris de Tailwind (los overrides light de Nexus las pisarían — regla del design
 * system del landing).
 *
 * ── REDISEÑO DEL 27 NOV (Elías, kölbi) ───────────────────────────────────────
 * «En la imagen ni siquiera se nota cuáles tareas ya hicimos. No da sensación de avance.» Antes cada semana era una
 * píldora del color del TIPO de la fase, y lo pasado salía desvaído: la página marcaba el paso del tiempo, no lo hecho.
 * Y los loops de un plan general no tienen tipo, así que todo salía gris. Ahora, con `showProgress`:
 *   · cada semana de la fase se pinta con el estado de SUS tareas (lib/timeline/avance-por-semana.ts): hecha, en
 *     curso, por hacer, con algo atrasado, sin tareas. Verde, azul, gris y ámbar, todos APAGADOS: Elías rechazó
 *     primero los vibrantes («no colores tan vibrantes») y después pidió el verde para lo hecho («más intuitivos»);
 *   · una línea «Hoy» que cruza las fases, y lo que ya pasó con un fondo apenas más oscuro;
 *   · el % de cada fase y «x de y»; la cabecera solo con fechas (el «S#» es del equipo, no del cliente);
 *   · debajo del cronograma, «Pendiente de tu parte»; después «Qué cambió en el plan»; y AL FINAL el resumen (avance y
 *     tiempo transcurrido).
 * El tipo de actividad sigue cruzando y se ve como cuadrado junto al rango; la leyenda nombra solo los tipos que
 * aparecen. El kickoff (sin `showProgress`) no muestra estado: sus semanas van del color de su tipo, como siempre.
 *
 * `opciones` es lo que el equipo decidió de la página (lib/external/pagina-del-cliente.ts): apagar las atrasadas, quién
 * hace cada tarea y el resumen del final. «Pendiente de tu parte» siempre se ve.
 *
 * Recibe el shape EXTERNO ya filtrado por los chokepoints. JAMÁS llegan notas de tarea, source ni needsValidation; las
 * tareas SUSPENDED se excluyen del shape.
 *
 * Requisitos del contexto que la monta: wrapper .kickoff-landing + useReveal sobre el contenedor (las .reveal arrancan
 * opacity:0).
 */
import { useState } from "react";
import { useHydrated } from "@/lib/hooks/useHydrated";
import { useAnchoAngosto } from "@/lib/hooks/useAnchoAngosto";
import {
  addWeeks,
  fmtDay,
  fmtFull,
  plural,
  computePhaseRanges,
  timelineSpan,
  fmtPhaseRange,
  currentWeekIndex,
  absoluteWeek,
  projectedEnd,
  cierreParaMostrar,
} from "@/lib/timeline/weeks";
import { dondeCaeHoy, estadosDeLasSemanas, finDeLaSemana, tareaAtrasada, type EstadoDeSemana } from "@/lib/timeline/avance-por-semana";
import { collectClientBlockers } from "@/lib/timeline/client-blockers";
import { summarizeParticularidades, attributionSentence } from "@/lib/timeline/particularidades-summary";
import { clientStatusLine } from "@/lib/timeline/client-status";
import type { ExternalTimelinePhase, ExternalParticularidad } from "@/lib/external/timeline-view-types";
import { PRINT_PAGE_WIDTH, fitZoom } from "@/lib/print/page-metrics";

/**
 * Contenedor del cronograma. Es MÁS ANCHO que el de los documentos de texto (1280) porque
 * el Gantt gana con cada píxel: más semanas visibles sin scroll horizontal.
 *
 * ⚠ NO usa el token del motor (`--stl-w-pagina`) y no es un descuido: el cronograma se
 * rinde dentro de `.kickoff-landing`, FUERA del ámbito `.stl` donde ese token está
 * declarado. Al referenciarlo desde acá la variable quedaba sin definir, el `max-width`
 * inválido, y el cronograma salía al 100% del ancho de la pantalla, pegado a los bordes.
 *
 * ⚠ ERA `width: "80%"`, y el 80% de poco es menos: en un teléfono de 375px dejaba una ventana
 * de 261px para una grilla que mide 640 como mínimo. Regalaba 65px justo donde no sobra ninguno.
 *
 * Y de paso arregla una divergencia vieja: el 80% NUNCA coincidía con `--stl-w-pagina` (el ancho
 * del resto de las páginas del cliente). A 1440px el cronograma quedaba más angosto que su propia
 * página; a 1920, más ancho. Solo empataban a ~1600. Ahora es el mismo ancho que todo lo demás.
 */
export const TIMELINE_CONTAINER = {
  width: "min(100%, var(--stl-w-pagina, 1280px))",
  margin: "0 auto",
} as const;
const SECTION_PAD = "clamp(40px, 6vw, 72px) 24px";

/** Lo que el equipo decidió mostrar (lib/external/pagina-del-cliente.ts). Ausente = todo, como siempre. */
export interface OpcionesDelCronograma {
  conAtrasadas: boolean;
  conResponsables: boolean;
  conResumen: boolean;
}
const TODO_VISIBLE: OpcionesDelCronograma = { conAtrasadas: true, conResponsables: true, conResumen: true };

// El color del TIPO de actividad: el kickoff pinta sus semanas con él, y la página del cliente lo muestra como cuadrado
// junto al rango de la fase. Mismos hex que el Gantt interno en claro.
const ACTIVITY_META: Record<string, { label: string; seg: string }> = {
  EXPLORACION:   { label: "Exploración",   seg: "#0ea5e9" },
  PLANIFICACION: { label: "Planificación", seg: "#8b5cf6" },
  CONFIGURACION: { label: "Configuración", seg: "#f97316" },
  ADOPCION:      { label: "Adopción",      seg: "#10b981" },
  SEGUIMIENTO:   { label: "Seguimiento",   seg: "#d946ef" },
};
const NEUTRAL_SEG = "#b9cdf0"; // fase sin tipo en el kickoff (neutro de la familia navy de marca)

/* ── El AVANCE con colores que se entienden solos, APAGADOS (27 nov) ──────────────────────────────
   Hecho = verde salvia, en curso = azul suave, por hacer = gris claro, atrasado = ámbar suave. Elías: «poner verde lo
   que está hecho y usar colores un poquito más intuitivos»; lo que rechazó al principio era lo vibrante (verde, azul y
   rojo saturados), no el código de colores. Cada estado se distingue también por el PESO (el verde y el azul son más
   oscuros que el gris) y la leyenda lo dice en palabras. `marca` es el tono fuerte de lo mismo: círculos y cifras. */
const SEMANA_META: Record<EstadoDeSemana, { label: string; bg: string; border?: string; marca: string }> = {
  hecha:        { label: "Semana hecha",      bg: "#78b593", marca: "#3f8f68" },
  "en-curso":   { label: "En curso",          bg: "#9db7e3", marca: "#4f7fcf" },
  "por-hacer":  { label: "Por hacer",         bg: "#dde3ec", marca: "#b7c1d3" },
  atrasada:     { label: "Con algo atrasado", bg: "#f6e2c6", border: "#d19a55", marca: "#c2873f" },
  "sin-tareas": { label: "Sin tareas",        bg: "#f1f3f6", marca: "#e3e8f0" },
};
/** Una fase cuyo detalle no se confirmó: se ve su rango, sin estado (inventar «por hacer» acusaría al equipo). Blanca con
 *  borde punteado: no se puede confundir con el gris de «Por hacer», y la leyenda la nombra. */
const SIN_DETALLE = { label: "Sin detalle todavía", bg: "#ffffff", borde: "1px dashed #b7c1d3" };
const PASADO = "#f6f7fa"; // el fondo de lo que ya pasó, detrás de las semanas
const HOY = "#051849";
const OCRE_TEXTO = "#9a6224"; // el texto de lo atrasado: el ámbar con contraste para leerse

/** Atrasada: es ORTOGONAL al estado (una tarea en curso puede estar atrasada), así que es su propio chip. Ocre, no rojo. */
const OVERDUE_META_LIGHT = { label: "atrasada", text: OCRE_TEXTO, bg: "#fbf0e1", border: "#efd5b0" };

/**
 * El estado de la tarea como CÍRCULO a la izquierda, no como etiqueta a la derecha.
 *
 * Antes era un chip «HECHO» pegado al título. En un cronograma donde casi todo está hecho, eso
 * repite la misma palabra decenas de veces y obliga a leer cada renglón hasta el final para
 * saber si falta algo. Un círculo en una columna fija se escanea de un vistazo: lo que no está
 * cerrado salta porque es el único claro.
 *
 * Desde el 27 nov, igual que el cronograma de adentro: hecha = verde lleno con ✓ (y el título tachado), en curso =
 * aro azul con ✓, pendiente = aro gris con ✓. Estilos inline: esta vista se le comparte al cliente y se
 * imprime, así que no puede depender de las clases del tema de la app.
 *
 * ⚠ «Atrasada» NO entra acá: es ortogonal al estado (una tarea en curso puede estar atrasada)
 * y sigue siendo su propio chip. Meterla en el círculo perdería una de las dos cosas.
 */
function EstadoCirculo({ status, size = 17 }: { status: string; size?: number }) {
  if (status === "DONE") {
    return (
      <span
        aria-hidden
        style={{
          width: size, height: size, borderRadius: "50%", background: SEMANA_META.hecha.marca,
          display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
        }}
      >
        <svg width={size * 0.6} height={size * 0.6} fill="none" viewBox="0 0 24 24">
          <path stroke="#ffffff" strokeLinecap="round" strokeLinejoin="round" strokeWidth={3.5} d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  // En curso y pendiente: el aro con su ✓, como en el cronograma de adentro (27 nov, Elías): azul si está en curso,
  // gris si falta. Solo la hecha va llena y en verde.
  const enCurso = status === "IN_PROGRESS";
  const suspendida = status === "SUSPENDED";
  const color = enCurso ? SEMANA_META["en-curso"].marca : suspendida ? "#b45309" : "#a3aec0";
  const grosor = enCurso ? 2.5 : 2;
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="9" strokeWidth={grosor} />
      {suspendida
        ? <path strokeLinecap="round" strokeWidth={grosor} d="M8.5 12h7" />
        : <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={grosor} d="M8.5 12.5l2.5 2.5 4.5-5" />}
    </svg>
  );
}

/** El texto accesible del estado — el círculo es `aria-hidden`, así que alguien lo tiene que decir. */
const ESTADO_TEXTO: Record<string, string> = {
  DONE: "Hecha",
  IN_PROGRESS: "En curso",
  SUSPENDED: "Aparcada",
  PENDING: "Pendiente",
};
// Tipo de tarea: solo se muestra cuando es SESIÓN (las TAREAS no muestran nada).
const SESSION_META_LIGHT = { label: "Sesión", text: "#051849", bg: "#eef3fc", border: "#dbe4f3" };
/** Una tarea de varias semanas (2026-11-19): chip neutro con la duración. */
const DURACION_META_LIGHT = { label: "", text: "#475569", bg: "#f8fafc", border: "#e2e8f0" };
/** Quién hace la tarea: en palabras y sin color (27 nov: el color queda para el avance). */
const PARTY_LABEL: Record<string, string> = { CLIENTE: "Cliente", SMARTEAM: "Smarteam", AMBOS: "Ambos", DEV: "Dev" };
const chipStyle = (m: { text: string; bg: string; border: string }): React.CSSProperties => ({
  fontSize: 9,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.04em",
  padding: "1px 6px",
  borderRadius: 6,
  color: m.text,
  background: m.bg,
  border: `1px solid ${m.border}`,
  flexShrink: 0,
  whiteSpace: "nowrap",
});

/** Visible solo para lectores de pantalla: el círculo de estado es `aria-hidden`. */
const SR_ONLY: React.CSSProperties = {
  position: "absolute",
  width: 1,
  height: 1,
  overflow: "hidden",
  clip: "rect(0 0 0 0)",
  whiteSpace: "nowrap",
};

const SUB_LABEL: React.CSSProperties = {
  fontSize: 10,
  fontWeight: 700,
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  color: "var(--text-muted)",
};

// Tipo de PARTICULARIDAD, tema light. Etiquetas en LENGUAJE CLIENTE: el interno dice "Atraso /
// Compromiso" (vocabulario de equipo); acá se dice qué le pasó al plan, en verbo y sin jerga.
const KIND_META_LIGHT: Record<string, { label: string; text: string; bg: string; border: string }> = {
  ATRASO:     { label: "Se atrasó", text: OCRE_TEXTO, bg: "#fbf0e1", border: "#efd5b0" },
  SOLICITUD:  { label: "En espera", text: OCRE_TEXTO, bg: "#fbf0e1", border: "#efd5b0" }, // legacy
  COMPROMISO: { label: "Acordado",  text: "#2f7a55", bg: "#ecf6f0", border: "#c4e2d1" },
  AVISO:      { label: "Aviso",     text: "#41527a", bg: "#f6f7fa", border: "#e3e8f0" }, // no es atraso ni acuerdo, no mueve fechas
};

/** Las tareas de una fase, agrupadas por semana. Tipo derivado para no re-declararlo. */
type TareasDeFase = NonNullable<ExternalTimelinePhase["tasks"]>;

/** «2 – 8 nov» / «30 nov – 6 dic»: la semana con su último día, no con el primero de la siguiente. */
function rangoDeLaSemana(anchor: string, w: number): string {
  const desde = addWeeks(anchor, w);
  const hasta = finDeLaSemana(anchor, w);
  return desde.getUTCMonth() === hasta.getUTCMonth()
    ? `${desde.getUTCDate()} – ${fmtDay(hasta)}`
    : `${fmtDay(desde)} – ${fmtDay(hasta)}`;
}

/** Las celdas de las semanas de una fase (las usan la grilla y la lista). */
function colorDeLaSemana(
  estado: EstadoDeSemana | null,
  tipo: string | null,
  showProgress: boolean,
): { bg: string; borde?: string; title: string } {
  if (!showProgress) {
    const meta = tipo ? ACTIVITY_META[tipo] : null;
    return { bg: meta?.seg ?? NEUTRAL_SEG, title: meta?.label ?? "" };
  }
  if (!estado) return { bg: SIN_DETALLE.bg, borde: SIN_DETALLE.borde, title: SIN_DETALLE.label };
  const m = SEMANA_META[estado];
  return { bg: m.bg, borde: m.border ? `1.5px solid ${m.border}` : undefined, title: m.label };
}

/**
 * Lo que se ve al desplegar una fase: sus notas y sus acciones semana por semana.
 *
 * Vive fuera del render principal porque lo usan las DOS vistas —la grilla de escritorio y la
 * lista de pantallas angostas— y duplicarlo garantizaba que se separaran: el día que alguien
 * agregue un dato por tarea, lo agregaría en una sola.
 */
function DetalleDeFase({
  notas,
  durationWeeks,
  tasksByWeek,
  rangeStart,
  anchor,
  showProgress,
  opciones,
  now,
}: {
  notas: string | null | undefined;
  durationWeeks: number;
  tasksByWeek: Map<number, TareasDeFase>;
  rangeStart: number;
  anchor: string | null;
  showProgress: boolean;
  opciones: OpcionesDelCronograma;
  now: Date | null;
}) {
  return (
    <>
      {notas?.trim() && (
        <p style={{ margin: 0, fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.55 }}>{notas}</p>
      )}
      {Array.from({ length: durationWeeks }).map((_, relWeek) => {
        const weekTasks = tasksByWeek.get(relWeek) ?? [];
        if (weekTasks.length === 0) return null;
        const absW = absoluteWeek(rangeStart, relWeek);
        return (
          <div key={relWeek}>
            {/* «Semana 2 · 9 – 15 nov»: la semana de la fase y sus fechas. El «S#» del proyecto es del equipo. */}
            <div style={{ ...SUB_LABEL, borderBottom: "1px dashed var(--border)", paddingBottom: 5, marginBottom: 10 }}>
              Semana {relWeek + 1}
              {anchor && <span style={{ fontWeight: 600, marginLeft: 6, opacity: 0.8, textTransform: "none", letterSpacing: 0 }}>{rangoDeLaSemana(anchor, absW)}</span>}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 12 }}>
              {weekTasks.map((t, ti) => {
                // Solo los estados que sabemos dibujar; uno desconocido no pinta círculo.
                const conEstado = showProgress && !!t.status && t.status in ESTADO_TEXTO;
                const overdue = showProgress && opciones.conAtrasadas && tareaAtrasada(t, rangeStart, anchor, now);
                const quien = showProgress && opciones.conResponsables && t.party ? PARTY_LABEL[t.party] : null;
                return (
                  /* `flex-start` y no `center`: con el círculo a la izquierda, un título de dos
                     líneas dejaría el check flotando en el medio. */
                  <li key={ti} style={{ color: "var(--text)", fontSize: 13.5, lineHeight: 1.5, display: "flex", alignItems: "flex-start", flexWrap: "wrap", gap: 8 }}>
                    {conEstado && (
                      <span style={{ display: "inline-flex", alignItems: "center", height: "1.5em", flexShrink: 0 }}>
                        <EstadoCirculo status={t.status!} />
                        <span style={SR_ONLY}>{ESTADO_TEXTO[t.status!] ?? ""}: </span>
                      </span>
                    )}
                    {/* La hecha, tachada y apagada: como en el cronograma de adentro. */}
                    <span style={{ flex: "1 1 220px", minWidth: 0, ...(t.status === "DONE" && showProgress ? { color: "var(--text-muted)", textDecoration: "line-through" } : {}) }}>{t.title}</span>
                    {(t.semanas ?? 1) > 1 && (
                      <span style={chipStyle(DURACION_META_LIGHT)} title={`Corre de la semana ${relWeek + 1} a la ${relWeek + t.semanas!} de esta fase`}>
                        {t.semanas} semanas
                      </span>
                    )}
                    {overdue && <span style={chipStyle(OVERDUE_META_LIGHT)}>{OVERDUE_META_LIGHT.label}</span>}
                    {showProgress && t.type === "SESSION" && <span style={chipStyle(SESSION_META_LIGHT)}>{SESSION_META_LIGHT.label}</span>}
                    {quien && <span style={{ fontSize: 12, color: "var(--text-muted)", minWidth: 64 }}>{quien}</span>}
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </>
  );
}

export default function TimelineSection({
  phases,
  anchor,
  showHeader = true,
  showProgress = false,
  particularidades,
  titulo,
  rotulo,
  pdf = false,
  opciones = TODO_VISIBLE,
}: {
  phases: ExternalTimelinePhase[];
  anchor: string | null;
  /** false = sin eyebrow/título propios (la página standalone pone el suyo). */
  showHeader?: boolean;
  /**
   * ⭐ El título y el rótulo chico que resolvió el MOTOR (lo que el CSE renombró y, si no, lo que
   * declara la definición: «Cronograma del proyecto» / «Hoja de ruta»).
   *
   * Estaban escritos a mano acá mientras la definición ya los declaraba, así que renombrar la
   * sección desde el chat o desde el editor no se veía. Ausentes → los textos históricos, que son
   * los que la definición trae por defecto: la página del cliente no cambia.
   */
  titulo?: string;
  rotulo?: string;
  /** true = muestra el avance (estado por semana y por tarea, atrasadas, responsable, resumen). Solo el cronograma compartible. */
  showProgress?: boolean;
  /** Desviaciones curadas visibles al cliente (visibleExternal=true, ya filtradas en el chokepoint).
   *  Solo se renderiza con showProgress (el cronograma compartible, no el kickoff embebido). */
  particularidades?: ExternalParticularidad[];
  /**
   * Modo impresión. En pantalla la grilla scrollea de lado; en papel un scroller imprime
   * SOLO su primer viewport, así que un cronograma de más de ~14 semanas salía cortado a la
   * derecha sin ningún indicio de que faltaba algo. Acá no scrollea: se encoge hasta caber.
   */
  pdf?: boolean;
  /** Lo que el equipo decidió mostrar en la página del cliente. Ausente = todo. */
  opciones?: OpcionesDelCronograma;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  // "Hoy" es hora de pared del USUARIO: calcularlo en el server rompería la
  // hidratación (lo evalúa en otro instante y en otra zona horaria, y `curInRange`
  // gatea nodos → cambia la ESTRUCTURA, no solo el texto). SSR y primer paint pintan
  // la variante neutra (sin línea de hoy, sin estados que dependan de la fecha).
  const hydrated = useHydrated();
  const now = hydrated ? new Date() : null;
  /* ⚠ `!pdf` PRIMERO, y no es cosmético: el PDF se compone contra 920px de papel, no contra una
     pantalla, y ya tiene su propio encogido por `zoom`. Si la lista se colara ahí, el cronograma
     impreso cambiaría de forma sin que nadie lo pida — y nadie lo vería hasta abrir un PDF. */
  const anchoAngosto = useAnchoAngosto(); // SIEMPRE se llama: un hook detrás de un `&&` es un bug.
  const enLista = !pdf && anchoAngosto;

  if (!phases.length) return null;
  const sorted = [...phases].sort((a, b) => a.order - b.order);
  const ranges = computePhaseRanges(sorted);
  const total = timelineSpan(sorted);
  if (total === 0) return null;

  const curWeek = now ? currentWeekIndex(anchor, now) : null;
  const hoy = dondeCaeHoy(anchor, now, total);

  // ── El avance, una sola cuenta para la grilla, la lista y el resumen ──────────────────────────
  const avance = sorted.map((p, i) => {
    const tasks = p.tasks ?? [];
    const hechas = tasks.filter((t) => t.status === "DONE").length;
    // Las vencidas de verdad (la frase de estado las necesita aunque estén apagadas) y las que se muestran.
    const vencidas = showProgress ? tasks.filter((t) => tareaAtrasada(t, ranges[i].start, anchor, now)).length : 0;
    const atrasadas = opciones.conAtrasadas ? vencidas : 0;
    const semanas = showProgress ? estadosDeLasSemanas(p, ranges[i].start, anchor, now, opciones.conAtrasadas) : null;
    return { tasks, hechas, vencidas, atrasadas, semanas };
  });
  const allTasks = avance.flatMap((a) => a.tasks);
  const tasksDone = avance.reduce((n, a) => n + a.hechas, 0);
  const tasksOverdue = avance.reduce((n, a) => n + a.vencidas, 0);

  // ── Estado del proyecto en lenguaje cliente ──────────────────────────────────
  // Esta línea existe SIEMPRE que el proyecto arrancó (avance + si vamos al día) y vive en el resumen del final.
  // Con tareas atrasadas a la vista no dice «al día»: el cliente las ve marcadas arriba.
  const desvioSemanas = summarizeParticularidades(particularidades ?? []).totalWeeks;
  const statusLine = showProgress
    ? clientStatusLine({
        curWeek, totalWeeks: total, tasksDone, tasksTotal: allTasks.length, delayWeeks: desvioSemanas,
        tasksOverdue, mostrarAtrasadas: opciones.conAtrasadas,
      })
    : null;
  // Fecha de cierre proyectada: convierte un número de atraso en un compromiso. Sale de lo que ya
  // está en pantalla (anchor + span), sin datos nuevos ni cambios en lo que cruza al cliente.
  // Desde la Tanda J la fórmula tiene UN dueño (`projectedEnd`, lib/timeline/weeks.ts): acá se
  // consume, no se recalcula, para que el cierre que ve el equipo y el que ve el cliente no puedan
  // divergir. ⚠ Al cliente se le dice SOLO dentro de la frase de atraso (lib/timeline/fin-solo-equipo.test.ts).
  // 2026-11-19: el último día de la última semana, el mismo que el Gantt del equipo y el aviso de «Lo acordado».
  const closingDate = cierreParaMostrar(projectedEnd(anchor, sorted)).label;

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  /* La leyenda nombra solo lo que aparece: los tipos de las fases que tienen uno (con los loops de un plan, ninguno) y,
     con el avance, los estados que se ven en las semanas (más «Sin detalle todavía» si alguna fase no lo tiene). */
  const tiposPresentes = Object.entries(ACTIVITY_META).filter(([k]) => sorted.some((p) => p.activityType === k)).map(([, m]) => m);
  const estadosVistos = new Set(avance.flatMap((a) => a.semanas ?? []));
  const estadosDeLaLeyenda: EstadoDeSemana[] = (["hecha", "en-curso", "por-hacer", "atrasada", "sin-tareas"] as const).filter((e) =>
    estadosVistos.has(e),
  );
  const hayFasesSinDetalle = showProgress && avance.some((a) => a.semanas === null);

  /* En papel la columna de fases se achica —el nombre sigue leyéndose— para dejarle todo el
     ancho posible a las semanas, que es lo que se pierde primero al encoger. */
  /* El piso de la columna de fase. Bajarlo NO recorta nada desde que el nombre envuelve —
     y le devuelve ancho a las semanas, que es lo que se apretaba en pantallas chicas. */
  const anchoFase = pdf ? "minmax(120px, 170px)" : "minmax(170px, 280px)";
  const filaCols = { gridTemplateColumns: `${anchoFase} minmax(0, 1fr)` };
  const semanasCols = { gridTemplateColumns: `repeat(${total}, minmax(0, 1fr))` };
  /* Ancho que la grilla NECESITA para no apretarse, y cuánto hay que encogerla para que
     entre. El disponible sale de la hoja: `TIMELINE_CONTAINER` ocupa el 100% del ancho en
     impresión, menos el padding de la sección y el de la caja. Ver lib/print/page-metrics.ts
     para por qué es `zoom` y no `transform`. */
  const anchoGrilla = Math.max(640, (pdf ? 170 : 300) + total * 34);
  const zoomImpresion = pdf ? fitZoom(anchoGrilla, PRINT_PAGE_WIDTH - 48 - 32) : 1;

  /** Lo pasado y la línea de hoy, detrás y encima de las semanas de una fila (el rótulo «HOY» va en la cabecera). */
  const marcasDeHoy = () =>
    hoy !== null && (
      <>
        <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: 0, width: `${hoy * 100}%`, background: PASADO, pointerEvents: "none" }} />
        <div aria-hidden style={{ position: "absolute", top: 0, bottom: 0, left: `${hoy * 100}%`, borderLeft: `1.5px solid ${HOY}`, zIndex: 2, pointerEvents: "none" }} />
      </>
    );

  const celdas = (i: number, alto: number) => {
    const p = sorted[i];
    const range = ranges[i];
    const estados = avance[i].semanas;
    return Array.from({ length: total }).map((_, w) => {
      const inRange = w >= range.start && w < range.end;
      if (!inRange) return <div key={w} />;
      const c = colorDeLaSemana(estados ? estados[w - range.start] : null, p.activityType, showProgress);
      return (
        <div
          key={w}
          title={c.title || undefined}
          style={{
            position: "relative", zIndex: 1, height: alto, borderRadius: 3, background: c.bg,
            boxSizing: "border-box", ...(c.borde ? { border: c.borde } : {}),
          }}
        />
      );
    });
  };

  return (
    <section className="section-light" style={{ padding: SECTION_PAD }}>
      <div style={pdf ? { ...TIMELINE_CONTAINER, width: "100%" } : TIMELINE_CONTAINER}>
        {showHeader && (
          <>
            <span className="eyebrow reveal">{rotulo?.trim() || "Hoja de ruta"}</span>
            <h2 className="font-display display-tight reveal" data-stagger="1" style={{ fontSize: "clamp(24px, 3.4vw, 34px)", color: "var(--text)", lineHeight: 1.15, marginTop: 8, marginBottom: 24 }}>
              {(() => {
                /* La última palabra va en itálica azul — es el lenguaje de los títulos del motor.
                   Se calcula en vez de estar partida a mano para que un título renombrado conserve
                   el mismo tratamiento en vez de perderlo. Con una sola palabra, va entera. */
                const palabras = (titulo?.trim() || "Cronograma del proyecto").split(/\s+/);
                const ultima = palabras.pop() ?? "";
                return (
                  <>
                    {palabras.length > 0 && `${palabras.join(" ")} `}
                    <span className="display-italic" style={{ color: "var(--brand-blue)" }}>{ultima}</span>
                  </>
                );
              })()}
            </h2>
          </>
        )}

        {/* Leyenda: solo lo que aparece. Y si el proyecto todavía no arrancó, cuándo arranca. */}
        <div className="reveal" data-stagger="2" style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "8px 16px", marginBottom: 14 }}>
          {anchor && curWeek !== null && curWeek < 0 && (
            <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-secondary)" }}>El proyecto arranca el {fmtFull(anchor)}</span>
          )}
          <span style={{ marginLeft: "auto", display: "flex", flexWrap: "wrap", alignItems: "center", gap: "4px 16px" }}>
            {estadosDeLaLeyenda.map((e) => (
              <span key={e} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 16, height: 10, borderRadius: 3, boxSizing: "border-box", background: SEMANA_META[e].bg, ...(SEMANA_META[e].border ? { border: `1.5px solid ${SEMANA_META[e].border}` } : {}) }} />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{SEMANA_META[e].label}</span>
              </span>
            ))}
            {hayFasesSinDetalle && (
              <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: 16, height: 10, borderRadius: 3, boxSizing: "border-box", background: SIN_DETALLE.bg, border: SIN_DETALLE.borde }} />
                <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{SIN_DETALLE.label}</span>
              </span>
            )}
            {tiposPresentes.map((m) => (
              <span key={m.label} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span style={{ width: showProgress ? 8 : 24, height: showProgress ? 8 : 6, borderRadius: showProgress ? 2 : 3, background: m.seg, display: "inline-block" }} />
                <span style={SUB_LABEL}>{m.label}</span>
              </span>
            ))}
          </span>
        </div>

        {/* ── Pantallas angostas: LISTA, no grilla ──────────────────────────────────────
            Una grilla de «fase + N semanas» necesita ancho, y en un teléfono no hay: con la
            columna de fase y 20 semanas, el cliente abría el enlace y veía nombres y CASI
            NINGUNA barra, con scroll horizontal y sin nada que se lo indicara. Así que en angosto
            se muestra OTRA COSA — la misma información, apilada: cada fase con sus semanas en una
            tira propia. Sin scroll de lado en ningún lado. */}
        {enLista ? (
          <div className="reveal" data-stagger="3" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {sorted.map((p, i) => {
              const range = ranges[i];
              const meta = p.activityType ? ACTIVITY_META[p.activityType] : null;
              const { tasks, hechas, atrasadas, semanas } = avance[i];
              const hasDetail = tasks.length > 0 || !!p.notes?.trim();
              const isOpen = expanded.has(p.id);
              const pct = showProgress && tasks.length > 0 ? Math.round((hechas / tasks.length) * 100) : null;

              const tasksByWeek = new Map<number, typeof tasks>();
              for (const t of tasks) {
                const arr = tasksByWeek.get(t.weekIndex) ?? [];
                arr.push(t);
                tasksByWeek.set(t.weekIndex, arr);
              }

              return (
                <div
                  key={p.id}
                  style={{ border: "1px solid var(--border)", borderRadius: 14, background: "var(--bg)", padding: "12px 14px" }}
                >
                  <div
                    onClick={() => hasDetail && toggleExpand(p.id)}
                    style={{ cursor: hasDetail ? "pointer" : "default", display: "flex", alignItems: "flex-start", gap: 8 }}
                  >
                    {hasDetail ? (
                      <svg
                        style={{ width: 12, height: 12, marginTop: 4, color: "var(--text-muted)", flexShrink: 0, transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "none" }}
                        fill="none" viewBox="0 0 24 24" stroke="currentColor"
                      >
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                      </svg>
                    ) : (
                      <span style={{ width: 12, flexShrink: 0 }} />
                    )}
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                        <div style={{ flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflowWrap: "anywhere" }}>
                          {p.name}
                        </div>
                        {pct !== null && <span style={{ fontSize: 13, fontWeight: 600, color: pct ? "var(--text)" : "var(--text-muted)" }}>{pct}%</span>}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {meta && (
                          <span title={meta.label} aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: meta.seg, flexShrink: 0 }} />
                        )}
                        <span>
                          {meta && <span style={SR_ONLY}>{meta.label}. </span>}
                          {fmtPhaseRange(anchor, range)}
                          {tasks.length > 0 && ` · ${showProgress ? `${hechas} de ${tasks.length}` : plural(tasks.length, "tarea", "tareas")}`}
                        </span>
                        {atrasadas > 0 && <span style={{ color: OCRE_TEXTO, fontWeight: 600 }}>· {plural(atrasadas, "atrasada", "atrasadas")}</span>}
                      </div>
                      {/* Sus semanas en una tira: lo mismo que la grilla, sin el eje de las demás fases. */}
                      {showProgress && (
                        <div
                          role="img"
                          aria-label={pct !== null ? `${pct}% de las tareas completadas` : "Semanas de la fase"}
                          style={{ marginTop: 8, display: "grid", gridTemplateColumns: `repeat(${p.durationWeeks}, minmax(0, 1fr))`, gap: 2 }}
                        >
                          {Array.from({ length: p.durationWeeks }).map((_, w) => {
                            const c = colorDeLaSemana(semanas ? semanas[w] : null, p.activityType, showProgress);
                            return <div key={w} style={{ height: 6, borderRadius: 2, boxSizing: "border-box", background: c.bg, ...(c.borde ? { border: c.borde } : {}) }} />;
                          })}
                        </div>
                      )}
                    </div>
                  </div>

                  {isOpen && hasDetail && (
                    <div style={{ marginTop: 12, marginBottom: 6, borderLeft: "2px solid var(--border)", paddingLeft: 12, display: "flex", flexDirection: "column", gap: 16 }}>
                      <DetalleDeFase
                        notas={p.notes}
                        durationWeeks={p.durationWeeks}
                        tasksByWeek={tasksByWeek}
                        rangeStart={range.start}
                        anchor={anchor}
                        showProgress={showProgress}
                        opciones={opciones}
                        now={now}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ) : (
        <div className="reveal" data-stagger="3" style={{ border: "1px solid var(--border)", borderRadius: 16, background: "var(--bg)", overflowX: pdf ? "visible" : "auto" }}>
          <div style={{ minWidth: anchoGrilla, ...(zoomImpresion < 1 ? { zoom: zoomImpresion } : {}) }}>
            {/* Cabecera de semanas: solo fechas. Con el rótulo «HOY» sobre su línea. */}
            <div style={{ ...filaCols, display: "grid", alignItems: "end", padding: "34px 18px 8px", borderBottom: "1px solid var(--border)" }}>
              <div style={SUB_LABEL}>Fase</div>
              <div style={{ ...semanasCols, display: "grid", position: "relative" }}>
                {Array.from({ length: total }).map((_, w) => {
                  const isCur = curWeek === w;
                  return (
                    <div key={w} style={{ textAlign: "center", fontSize: 10.5, fontWeight: isCur ? 700 : 500, color: isCur ? "var(--text)" : "var(--text-muted)" }}>
                      {anchor ? fmtDay(addWeeks(anchor, w)) : `Sem. ${w + 1}`}
                    </div>
                  );
                })}
                {hoy !== null && (
                  <div aria-hidden style={{ position: "absolute", top: -24, bottom: -8, left: `${hoy * 100}%`, borderLeft: `1.5px solid ${HOY}`, pointerEvents: "none" }}>
                    {now && (
                      <span
                        style={{
                          position: "absolute", top: 0, left: 0,
                          transform: hoy < 0.08 ? "translateX(-2px)" : hoy > 0.92 ? "translateX(calc(-100% + 2px))" : "translateX(-50%)",
                          fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", whiteSpace: "nowrap",
                          color: "#ffffff", background: HOY, borderRadius: 999, padding: "2px 8px",
                        }}
                      >
                        HOY · {fmtDay(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))).toUpperCase()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Filas de fases */}
            <div style={{ padding: "0 18px 8px" }}>
              {sorted.map((p, i) => {
                const range = ranges[i];
                const meta = p.activityType ? ACTIVITY_META[p.activityType] : null;
                /* En papel TODO va abierto: la fila se despliega con un clic y en un PDF nadie
                   puede hacerlo. Sin esto se imprimían las barras de colores y CERO tareas —
                   sin notas de fase, sin acciones por semana, sin responsables. Un documento
                   que no da error y no dice nada. */
                const isOpen = pdf || expanded.has(p.id);
                const { tasks, hechas, atrasadas } = avance[i];
                const hasDetail = tasks.length > 0 || !!p.notes?.trim();
                const pct = showProgress && tasks.length > 0 ? Math.round((hechas / tasks.length) * 100) : null;

                const tasksByWeek = new Map<number, typeof tasks>();
                for (const t of tasks) {
                  const arr = tasksByWeek.get(t.weekIndex) ?? [];
                  arr.push(t);
                  tasksByWeek.set(t.weekIndex, arr);
                }

                return (
                  <div key={p.id} style={{ borderBottom: i < sorted.length - 1 ? "1px solid #f0f2f6" : "none" }}>
                    <div
                      onClick={() => hasDetail && toggleExpand(p.id)}
                      style={{ ...filaCols, display: "grid", alignItems: "stretch", cursor: hasDetail ? "pointer" : "default" }}
                    >
                      <div style={{ minWidth: 0, padding: "10px 14px 10px 0", display: "flex", alignItems: "flex-start", gap: 7 }}>
                        {hasDetail ? (
                          <svg
                            style={{ width: 11, height: 11, marginTop: 4, color: "var(--text-muted)", flexShrink: 0, transition: "transform 0.15s", transform: isOpen ? "rotate(90deg)" : "none" }}
                            fill="none" viewBox="0 0 24 24" stroke="currentColor"
                          >
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                          </svg>
                        ) : (
                          <span style={{ width: 11, flexShrink: 0 }} />
                        )}
                        <div style={{ minWidth: 0, flex: 1 }}>
                          {/* El nombre tiene el renglón PARA ÉL (con el % al final): envuelve en vez de
                              recortarse. Antes era `nowrap` + ellipsis y el cliente leía «Audit…» / «Sem…»,
                              que no le dice NADA sobre qué se hizo esa semana. `overflowWrap` es la red
                              para un nombre genuinamente largo. */}
                          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text)", lineHeight: 1.3, overflowWrap: "anywhere", minWidth: 0 }}>{p.name}</span>
                          {/* El tipo de actividad vive ACÁ, como cuadrado de color — la palabra está en
                              la leyenda. Esta línea es un `div` block: lo que se agrega acá no le comprime
                              el ancho a nadie. */}
                          <div style={{ marginTop: 2, fontSize: 11.5, color: "var(--text-muted)", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                            {meta && (
                              <span title={meta.label} aria-hidden style={{ width: 8, height: 8, borderRadius: 2, background: meta.seg, flexShrink: 0 }} />
                            )}
                            <span>
                              {meta && <span style={SR_ONLY}>{meta.label}. </span>}
                              {fmtPhaseRange(anchor, range)}
                              {tasks.length > 0 && ` · ${showProgress ? `${hechas} de ${tasks.length}` : plural(tasks.length, "tarea", "tareas")}`}
                            </span>
                            {atrasadas > 0 && <span style={{ color: OCRE_TEXTO, fontWeight: 600 }}>· {plural(atrasadas, "atrasada", "atrasadas")}</span>}
                          </div>
                        </div>
                        {pct !== null && (
                          <span style={{ fontSize: 13, fontWeight: 600, color: pct ? "var(--text)" : "var(--text-muted)", fontVariantNumeric: "tabular-nums" }}>{pct}%</span>
                        )}
                      </div>

                      {/* Las semanas: cada una con el estado de sus tareas (con el avance) o del color de su tipo. */}
                      <div style={{ ...semanasCols, display: "grid", gap: 3, alignItems: "center", position: "relative" }}>
                        {marcasDeHoy()}
                        {celdas(i, 12)}
                      </div>
                    </div>

                    {/* Expandido: notas de fase + acciones por semana (read-only) */}
                    {isOpen && hasDetail && (
                      <div style={{ marginLeft: 18, marginRight: 8, marginTop: 8, marginBottom: 22, borderLeft: "1px solid var(--border)", paddingLeft: 16, paddingTop: 4, paddingBottom: 4, display: "flex", flexDirection: "column", gap: 18 }}>
                        <DetalleDeFase
                          notas={p.notes}
                          durationWeeks={p.durationWeeks}
                          tasksByWeek={tasksByWeek}
                          rangeStart={range.start}
                          anchor={anchor}
                          showProgress={showProgress}
                          opciones={opciones}
                          now={now}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        )}

        {/* Pendiente de tu parte — tareas del CLIENTE atrasadas, pegado debajo del cronograma (27 nov). Solo con
            showProgress (cronograma vivo, no el kickoff) y tras hidratar (necesita el "hoy" del cliente). Se ve
            aunque el equipo apague las atrasadas: es lo que el cliente tiene que hacer. Sin atrasos → no se muestra. */}
        {showProgress && (() => {
          const blockers = collectClientBlockers(phases, anchor, now);
          if (blockers.length === 0) return null;
          return (
            <div
              className="reveal"
              style={{ marginTop: 16, padding: "18px 20px", borderRadius: 16, background: "#fbf8f2", border: "1px solid #ece2d0" }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Pendiente de tu parte</div>
              <p style={{ margin: "4px 0 12px", fontSize: 13, color: "var(--text-secondary)", lineHeight: 1.5 }}>
                Para seguir avanzando necesitamos esto de tu parte:
              </p>
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 8 }}>
                {blockers.map((b, i) => (
                  <li key={i} style={{ display: "flex", alignItems: "baseline", flexWrap: "wrap", gap: "4px 12px", fontSize: 13.5, color: "var(--text)" }}>
                    <span style={{ fontWeight: 600 }}>{b.task.title}</span>
                    <span style={{ fontSize: 12, color: "var(--text-muted)" }}>{b.phaseName}</span>
                    {b.dueDateIso && (
                      <span style={{ fontSize: 12, color: OCRE_TEXTO, fontWeight: 600 }}>
                        vencía el {fmtFull(b.dueDateIso)}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          );
        })()}

        {/* Particularidades — por qué y quién movió el cronograma. Resumen con atribución
            (corrimiento acumulado por responsable) + bitácora legible. Solo con showProgress
            (el cronograma compartible) y solo las visibleExternal (ya filtradas en el chokepoint).
            SOLICITUD queda como fallback de render para filas legacy. */}
        {showProgress && (() => {
          const parts = particularidades ?? [];
          if (parts.length === 0) return null;
          const summary = summarizeParticularidades(parts);
          // audience "cliente": SIN reparto de responsables, y cerrando con la fecha nueva — un número
          // de atraso sin fecha de cierre es ansiedad sin salida; con fecha, es un compromiso.
          const sentence = attributionSentence(summary, { audience: "cliente", closingDate });
          return (
            <div
              className="reveal"
              style={{ marginTop: 16, padding: "18px 20px", borderRadius: 16, background: "#f8fafc", border: "1px solid var(--border)" }}
            >
              <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)" }}>Qué cambió en el plan</div>
              {sentence && (
                <p style={{ margin: "6px 0 14px", fontSize: 14, color: "var(--text)", lineHeight: 1.55, fontWeight: 500 }}>{sentence}</p>
              )}
              <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 10 }}>
                {parts.map((pt, i) => {
                  const kMeta = KIND_META_LIGHT[pt.kind] ?? { label: pt.kind, text: "var(--text-muted)", bg: "#f1f5f9", border: "var(--border)" };
                  // SIN chip de responsable: acá `party` es "quién causó el atraso" y del lado del
                  // cliente eso es un marcador de faltas. La atribución queda interna.
                  return (
                    <li key={i} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      <div style={{ display: "flex", alignItems: "center", flexWrap: "wrap", gap: 8, fontSize: 13, color: "var(--text)" }}>
                        <span style={chipStyle(kMeta)}>{kMeta.label}</span>
                        <span style={{ fontWeight: 600 }}>{pt.title}</span>
                        {pt.weeksImpact != null && pt.weeksImpact > 0 && (
                          <span style={{ fontSize: 12, color: OCRE_TEXTO, fontWeight: 600 }}>
                            +{pt.weeksImpact} {pt.weeksImpact === 1 ? "semana" : "semanas"}
                          </span>
                        )}
                        {/* ⚠ Una desviación RESUELTA se sigue mostrando, marcada — no se esconde.
                            Esconderla dejaría el cronograma corrido con una explicación menos, y
                            si se cerraran todas, el bloque entero desaparecería y con él la única
                            frase donde el cliente ve la fecha de cierre nueva. */}
                        {pt.estado === "CERRADA" && (
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#2f7a55", border: "1px solid #9fcdb3", borderRadius: 4, padding: "1px 6px" }}>
                            Resuelta
                          </span>
                        )}
                      </div>
                      {pt.detail && (
                        <p style={{ margin: 0, paddingLeft: 2, fontSize: 12.5, color: "var(--text-secondary)", lineHeight: 1.5 }}>{pt.detail}</p>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })()}

        {/* El resumen, AL FINAL (Elías, 27 nov): cuánto se hizo y cuánto tiempo pasó, lado a lado. Lo puede
            apagar el equipo. Sin fecha de cierre: al cliente se le dice solo con atraso, en la frase de arriba. */}
        {showProgress && opciones.conResumen && (allTasks.length > 0 || hoy !== null) && (() => {
          const pctHecho = allTasks.length > 0 ? Math.round((tasksDone / allTasks.length) * 100) : null;
          const pctTiempo = hoy !== null ? Math.round(hoy * 100) : curWeek !== null && curWeek >= total ? 100 : null;
          const cifra = (rotuloCifra: string, valor: number, color: string, pie: string | null) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, minWidth: 0 }}>
              <span style={{ ...SUB_LABEL, color: "#8a96b3" }}>{rotuloCifra}</span>
              <span style={{ fontSize: 28, fontWeight: 300, letterSpacing: "-0.02em", color: "var(--text)", fontVariantNumeric: "tabular-nums" }}>{valor}%</span>
              <div style={{ height: 4, borderRadius: 2, background: "#e9edf4", overflow: "hidden" }}>
                <div style={{ width: `${valor}%`, height: "100%", background: color }} />
              </div>
              {pie && <span style={{ fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45 }}>{pie}</span>}
            </div>
          );
          return (
            <div
              className="reveal"
              style={{ marginTop: 28, paddingTop: 24, borderTop: "1px solid var(--border)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 28 }}
            >
              {pctHecho !== null && cifra("Avance del plan", pctHecho, SEMANA_META.hecha.marca, statusLine ?? `${tasksDone} de ${allTasks.length} tareas hechas`)}
              {pctTiempo !== null && cifra("Tiempo transcurrido", pctTiempo, "#8a96b3", anchor ? `Desde el ${fmtFull(anchor)}` : null)}
            </div>
          );
        })()}
      </div>
    </section>
  );
}
