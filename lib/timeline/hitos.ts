/**
 * lib/timeline/hitos.ts — LOS HITOS DEL PROYECTO: EL KICKOFF, EL CIERRE Y LA ENTREGA (M2 P2a, 2026-09-27).
 *
 * Puro y client-safe: sin Prisma, sin servidor, y de `borrador.ts` solo tipos (`borrador.ts` importa de acá solo
 * `type Hito`: no hay ciclo en tiempo de ejecución).
 *
 * Pedido de Elías (27-09): «Regenerar todo» sumaba otro kickoff con otras palabras (Wherex terminó con tres: dos hechos
 * y uno pendiente) y nada impedía un segundo cierre o una segunda entrega. Este módulo RECONOCE los hitos por el título
 * y elige, de cada uno, el que ya está y se queda (su GUARDIÁN). La regla que los usa es R15 del paso 2
 * (lib/timeline/tareas-del-detalle.ts); lo que lee el modelo y la pantalla vienen en las partes siguientes de M2.
 *
 * ── QUÉ SE GARANTIZA (D7 de la spec del replanteo) ───────────────────────────
 *  · KICKOFF, entero: uno por proyecto. La pendiente de la IA que sobra se quita (`sobrantes`), uno nuevo no entra y,
 *    si no hay ninguno, lo agrega el sistema (`TAREA_DE_KICKOFF`). Lo hecho de más se NOMBRA, nunca se borra.
 *  · CIERRE y ENTREGA, solo contra duplicados nuevos: uno nuevo no entra si ya hay uno; nunca se quita uno existente
 *    y el sistema no agrega ninguno. Se reconocen solo en una FASE DE HITO, con tipo SESSION y título estricto: su
 *    reconocimiento por título no es tan fiable como el del kickoff.
 *  · El go-live NO es la entrega: es otro hito (en Areya habría quitado una legítima).
 *  · La entrega va una por CICLO en un proyecto recurrente (D8); en los demás, una por proyecto.
 *
 * ── EL CLASIFICADOR (medido en la cartera activa, `sintesis-hitos-2.cjs`) ────
 * 28 proyectos con algún hito; 25 con kickoff (2 con más de uno: Wherex y STL, duplicados reales); 12 con cierre y 10
 * con entrega, ninguno con dos. Ya no cuentan como cierre la «Sesión de cierre» de «Capacitación y cierre Service» (no
 * es la última fase), «Reporte de cierre al sponsor del proyecto» ni «Revisión de primeros días en producción y cierre
 * formal». Guarda: `hitos.test.ts`, sobre los títulos reales de `__fixtures__/hitos.json`.
 *
 * ── LA MARCA ─────────────────────────────────────────────────────────────────
 * `hito:kickoff` en `TimelineTask.originFingerprint`: la escribe el código solo al CREAR un kickoff (escribir-tareas.ts,
 * parte P2c) y sobrevive a renombrar y a mudar. Un id de cronograma nunca empieza con «hito:» (las particularidades
 * guardan `timelineId:KIND:huella`, particularidad-identity.ts). El cierre y la entrega NO se marcan: una marca manda
 * para siempre, y su título no es lo bastante fiable para eso.
 */
import type { ContenidoDeTareaNueva } from "./borrador";

export type Hito = "kickoff" | "cierre" | "entrega";
/** El orden en que se nombran (las observaciones y el bloque que lee el modelo). */
export const HITOS: readonly Hito[] = ["kickoff", "cierre", "entrega"];

/** La marca del kickoff que CREÓ el código. Manda sobre el título. */
export const MARCA_DE_KICKOFF = "hito:kickoff";

/** ¿La marca de la tarea dice que es EL kickoff? Solo la marca exacta: una huella de particularidad nunca lo es. */
export function esKickoffPorMarca(marca: string | null | undefined): boolean {
  return marca === MARCA_DE_KICKOFF;
}

/** El título como lo lee el clasificador: sin mayúsculas, tildes ni signos, con UN espacio (`huellaCompleta` con espacios). */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** El título acota el hito a UNA parte del proyecto («Kick-off técnico de la integración SAP», «… del Caso 1»). */
const PARTE =
  /\b(de|del) (la |el |los |las )?(fase|integracion|conector|migracion|onboarding|auditoria|capacitacion|capacitaciones|caso|backlog|dudas|gestion|deal|campana|modulo|piloto|marketing hub|sales hub|service hub|data hub|content hub|operations hub|commerce hub)\b|\b(tecnico|tecnica) de la\b/;
/** Habla del hito pero no ES el hito («Kickoff interno», «Reunión previa al kickoff», «Minuta del kickoff»). Vale para los tres. */
const NO_ES_EL_HITO = /\b(intern[oa]|previ[oa]|pre|post|despues|seguimiento|minuta|agenda|invitacion|resumen|preparacion|prepar\w*)\b/;
const KICKOFF =
  /\b(kick ?off|re ?arranque|relanzamiento)\b|\bsesion de arranque\b|\breunion de (inicio|arranque)\b|\binicio (formal|oficial) del proyecto\b/;
/** Una última fase que nombra un hub cierra ESE hub, no el proyecto. */
const NOMBRA_UN_HUB = /\b(marketing|sales|service|data|content|operations|commerce|cms)\b/;
/** El título dice que es del proyecto entero. */
const DEL_PROYECTO = /\b(del|al) proyecto\b|\bde la implementacion\b|\b(formal|oficial|final)\b/;
const EMPIEZA_CON_SESION_DE_CIERRE = /^(sesion|reunion) de cierre\b/;
const ES_SESION_DE_CIERRE = /^(sesion|reunion) de cierre$/;
/** Un reporte, un informe, unos ajustes o una revisión «de cierre» no son la sesión de cierre. */
const NO_ES_LA_SESION_DE_CIERRE = /\b(reporte|informe|ajustes?|revision)\b/;
/**
 * «Cierre del ciclo» / «entrega del ciclo»: la ENTREGA de un ciclo de un recurrente. No es el cierre del proyecto: si
 * lo fuera, el cierre (uno por proyecto) frenaría la entrega del ciclo 2 (desvío anotado de la spec §3.2).
 */
const DEL_CICLO = /\b(cierre|entrega) del ciclo\b/;

/** ¿La fase es de cierre por su NOMBRE? Empieza con «cierre», «entrega» o «go-live». La usan M4 y el bloque de hitos. */
export function esFaseDeCierre(nombre: string): boolean {
  return /^(cierre|entrega|go ?live)\b/.test(normalizar(nombre));
}

/**
 * ¿En esta fase puede vivir el cierre o la entrega del proyecto? La de cierre por nombre, o la ÚLTIMA si no nombra un
 * hub. «Capacitación y cierre Service» (Wherex, no es la última) no lo es; «Capacitación & Go Live» (Spectrum, la
 * última) sí.
 */
export function esFaseDeHito(nombre: string, esUltima: boolean): boolean {
  return esFaseDeCierre(nombre) || (esUltima && !NOMBRA_UN_HUB.test(normalizar(nombre)));
}

/**
 * Los hitos que ES una tarea (ninguno, uno, o cierre y entrega a la vez: «Sesión de cierre y entrega del proyecto»).
 *  · kickoff: la marca, que manda; o el título, sin `PARTE` ni `NO_ES_EL_HITO` y con un tipo que no es TASK.
 *  · cierre y entrega: solo en una fase de hito y con tipo SESSION; ver las reglas arriba. El go-live no cuenta.
 */
export function hitosDeLaTarea(
  t: { title: string; type: string | null; marca?: string | null },
  fase: { name: string; esUltima: boolean },
): Hito[] {
  const n = normalizar(t.title);
  const hitos: Hito[] = [];
  const porMarca = esKickoffPorMarca(t.marca);
  if (porMarca) hitos.push("kickoff");
  if (PARTE.test(n) || NO_ES_EL_HITO.test(n)) return hitos;
  if (!porMarca && t.type !== "TASK" && KICKOFF.test(n)) hitos.push("kickoff");
  if (t.type !== "SESSION" || !esFaseDeHito(fase.name, fase.esUltima)) return hitos;
  const esCierre =
    /\bcierre\b/.test(n) &&
    !DEL_CICLO.test(n) &&
    (DEL_PROYECTO.test(n) || (esFaseDeCierre(fase.name) && EMPIEZA_CON_SESION_DE_CIERRE.test(n)) || ES_SESION_DE_CIERRE.test(n)) &&
    !/^capacitacion/.test(n) &&
    !NO_ES_LA_SESION_DE_CIERRE.test(n);
  if (esCierre) hitos.push("cierre");
  const esEntrega = ((/\bentrega\b/.test(n) && DEL_PROYECTO.test(n)) || DEL_CICLO.test(n)) && !/\bprimera semana\b/.test(n);
  if (esEntrega) hitos.push("entrega");
  return hitos;
}

/** Cómo está el hito que ya existe. */
export type EstadoDelHito = "hecho" | "en curso" | "pendiente";

/** El hito que ya está y se queda. `tareaId` null: uno nuevo de esta misma propuesta (R15 lo suma al entrar). */
export interface GuardianDeHito {
  hito: Hito;
  /** Solo la entrega de un recurrente: el ciclo. */
  ciclo: number | null;
  tareaId: string | null;
  faseId: string;
  titulo: string;
  estado: EstadoDelHito;
}

/** Una tarea como la mira este módulo (la cumple `TareaDelVivo`). */
export interface TareaParaHitos {
  id: string;
  title: string;
  type: string | null;
  status: string;
  source: string;
  weekIndex: number;
  marca?: string | null;
}
/** Una fase con sus tareas, en el orden del cronograma. */
export interface FaseConTareas {
  id: string;
  name: string;
  tareas: ReadonlyArray<TareaParaHitos>;
}

export interface HitosDelProyecto {
  /** Por `claveDelHito`: «kickoff», «cierre», «entrega» o, en un recurrente, «entrega:<ciclo>». */
  guardianes: Map<string, GuardianDeHito>;
  /** Solo con `recurrente`: el ciclo de cada fase, con las entregas que YA existen. */
  ciclos: Map<string, number>;
  /** SOLO kickoff: los pendientes que no escribió una persona y no son el guardián. Se quitan. */
  sobrantes: Array<{ tareaId: string; faseId: string; guardian: GuardianDeHito }>;
  /** Dos o más HECHOS del mismo hito: se nombran, nunca se borran. */
  hechosDeMas: Array<{ hito: Hito; fases: Array<{ id: string; nombre: string }>; titulos: string[] }>;
  /** SOLO kickoff: los pendientes escritos a mano que no son el guardián. Se quedan y se nombran. */
  aManoDeMas: Array<{ titulo: string; faseId: string }>;
}

/** La clave del guardián: la entrega de un recurrente va por ciclo (`ciclo` no null); lo demás, uno por proyecto. */
export function claveDelHito(hito: Hito, ciclo: number | null): string {
  return hito === "entrega" && ciclo !== null ? `entrega:${ciclo}` : hito;
}

/** Quién gana entre dos del mismo hito: el hecho, el en curso, el escrito a mano y el pendiente de la IA. Suspendida: no cuenta. */
function rangoDe(t: TareaParaHitos): number | null {
  if (t.status === "DONE") return 0;
  if (t.status === "IN_PROGRESS") return 1;
  if (t.status === "PENDING") return t.source === "HUMAN" ? 2 : 3;
  return null; // SUSPENDED: aparcada, no se hizo; no es el hito que ya está
}
const ESTADO_POR_RANGO: readonly EstadoDelHito[] = ["hecho", "en curso", "pendiente", "pendiente"];

/**
 * Los hitos que ya tiene el proyecto (D7). `fases` en el orden del cronograma, con sus tareas; la última fase es la
 * única que puede ser de hito sin llamarse «Cierre…». Guardián de cada hito: el mejor por `rangoDe` y, entre iguales,
 * el primero en el orden (fase, semana, orden). Con `recurrente`, la entrega va por ciclo: una fase con una entrega
 * cierra su ciclo y la siguiente empieza otro (acá, solo con lo que YA existe; R15 lo sigue en el recorrido).
 * `ultimaViva` (revisión de M1–M5, 2026-09-27, hallazgo 4): el id de la última fase del cronograma VIVO. Cuando `fases`
 * es la estructura supuesta y el paso 1 agregó una fase detrás de la última (o cambió el orden), la que era última dejaba
 * de ser fase de hito: su cierre o su entrega perdían al guardián y entraba un duplicado en la agregada. Una fase es de
 * hito si es la última de `fases` o la última de lo vivo.
 */
export function hitosDelProyecto(i: {
  fases: ReadonlyArray<FaseConTareas>;
  recurrente: boolean;
  ultimaViva?: string | null;
}): HitosDelProyecto {
  interface Candidata {
    hito: Hito;
    ciclo: number | null;
    tarea: TareaParaHitos;
    fase: FaseConTareas;
    rango: number;
  }
  const candidatas: Candidata[] = [];
  const ciclos = new Map<string, number>();
  let ciclo = 1;
  i.fases.forEach((f, k) => {
    if (i.recurrente) ciclos.set(f.id, ciclo);
    let conEntrega = false;
    // Estable: las del vivo ya vienen por semana y orden; esto solo asegura la semana.
    const enOrden = [...f.tareas].sort((a, b) => a.weekIndex - b.weekIndex);
    for (const t of enOrden) {
      const rango = rangoDe(t);
      if (rango === null) continue;
      const esUltima = k === i.fases.length - 1 || (!!i.ultimaViva && f.id === i.ultimaViva);
      for (const hito of hitosDeLaTarea(t, { name: f.name, esUltima })) {
        candidatas.push({ hito, ciclo: hito === "entrega" && i.recurrente ? ciclo : null, tarea: t, fase: f, rango });
        if (hito === "entrega") conEntrega = true;
      }
    }
    if (conEntrega) ciclo++;
  });

  const porClave = new Map<string, Candidata[]>();
  for (const c of candidatas) {
    const clave = claveDelHito(c.hito, c.ciclo);
    porClave.set(clave, [...(porClave.get(clave) ?? []), c]);
  }
  const guardianes = new Map<string, GuardianDeHito>();
  const elegidas = new Map<string, Candidata>();
  for (const [clave, cs] of porClave) {
    const mejor = cs.reduce((a, b) => (b.rango < a.rango ? b : a));
    elegidas.set(clave, mejor);
    guardianes.set(clave, {
      hito: mejor.hito,
      ciclo: mejor.ciclo,
      tareaId: mejor.tarea.id,
      faseId: mejor.fase.id,
      titulo: mejor.tarea.title,
      estado: ESTADO_POR_RANGO[mejor.rango],
    });
  }
  /** Una tarea que guarda CUALQUIER hito no se quita por otro («Sesión de kickoff y cierre» sería las dos cosas). */
  const guardan = new Set([...elegidas.values()].map((c) => c.tarea.id));

  const sobrantes: HitosDelProyecto["sobrantes"] = [];
  const aManoDeMas: HitosDelProyecto["aManoDeMas"] = [];
  const kickoffs = porClave.get("kickoff") ?? [];
  const guardianDelKickoff = guardianes.get("kickoff");
  for (const c of kickoffs) {
    if (!guardianDelKickoff || guardan.has(c.tarea.id) || c.tarea.status !== "PENDING") continue;
    if (c.tarea.source === "HUMAN") aManoDeMas.push({ titulo: c.tarea.title, faseId: c.fase.id });
    else sobrantes.push({ tareaId: c.tarea.id, faseId: c.fase.id, guardian: guardianDelKickoff });
  }

  const hechosDeMas: HitosDelProyecto["hechosDeMas"] = [];
  for (const cs of porClave.values()) {
    const hechas = cs.filter((c) => c.tarea.status === "DONE");
    if (hechas.length < 2) continue;
    const fases = [...new Map(hechas.map((c) => [c.fase.id, { id: c.fase.id, nombre: c.fase.name }])).values()];
    hechosDeMas.push({ hito: hechas[0].hito, fases, titulos: hechas.map((c) => c.tarea.title) });
  }
  hechosDeMas.sort((a, b) => HITOS.indexOf(a.hito) - HITOS.indexOf(b.hito));

  return { guardianes, ciclos, sobrantes, hechosDeMas, aManoDeMas };
}

/** El kickoff que agrega el sistema cuando el proyecto no tiene ninguno (en la Semana 0, si no pasó). */
export const TAREA_DE_KICKOFF: Readonly<ContenidoDeTareaNueva> = Object.freeze<ContenidoDeTareaNueva>({
  title: "Sesión de kickoff del proyecto",
  weekIndex: 0,
  notes: null,
  party: "AMBOS",
  type: "SESSION",
  needsValidation: false,
  motivoPorValidar: null,
  fuga: null,
  hito: ["kickoff"],
});

// ── LOS TEXTOS (tuteo, cortos: Elías pidió menos texto) ─────────────────────

const NOMBRE_DEL_HITO: Record<Hito, string> = { kickoff: "el kickoff", cierre: "el cierre", entrega: "la entrega" };
const HECHOS_DEL_HITO: Record<Hito, string> = { kickoff: "kickoffs hechos", cierre: "cierres hechos", entrega: "entregas hechas" };

/** ««A»», ««A» y «B»», ««A», «B» y «C»». */
function citados(textos: readonly string[]): string {
  const c = textos.map((t) => `«${t}»`);
  return c.length <= 1 ? (c[0] ?? "") : `${c.slice(0, -1).join(", ")} y ${c[c.length - 1]}`;
}

/** El motivo de la fila que quita un kickoff que sobra (la dice el sistema, nunca «Según la IA»). */
export function motivoDelSobrante(guardian: GuardianDeHito): string {
  return `Ya hay un kickoff ${guardian.estado}: «${guardian.titulo}».`;
}

/** El motivo de la fila que crea el kickoff que faltaba. */
export const MOTIVO_DEL_KICKOFF_QUE_FALTA = "Faltaba el kickoff: lo agrega el sistema.";

/** Observación 1: la IA propuso un hito que ya tiene quien lo guarde (uno por hito). */
export function observacionDeHitoQueNoEntra(hito: Hito, guardian: GuardianDeHito): string {
  if (guardian.tareaId === null) return `La IA propuso ${NOMBRE_DEL_HITO[hito]} más de una vez: entra solo «${guardian.titulo}».`;
  return `La IA volvió a proponer ${NOMBRE_DEL_HITO[hito]}: no se suma, ya está «${guardian.titulo}» (${guardian.estado}).`;
}

/** Observación 2: dos o más hechos del mismo hito. Se nombran; borrar uno es decisión del CSE. */
export function observacionDeHechosDeMas(x: HitosDelProyecto["hechosDeMas"][number]): string {
  const accion =
    x.titulos.length === 2
      ? "Si son la misma sesión, borra la segunda desde su fila del cronograma."
      : "Si son la misma sesión, deja la primera y borra las demás desde su fila del cronograma.";
  return `Hay ${x.titulos.length} ${HECHOS_DEL_HITO[x.hito]} en ${citados(x.fases.map((f) => f.nombre))}: ${citados(x.titulos)}. ${accion}`;
}

/** Observación 3: un kickoff pendiente de más que escribió una persona. */
export function observacionDeKickoffAMano(titulo: string): string {
  return `«${titulo}» repite el kickoff, pero la escribió una persona: no se quita.`;
}

/** Observación 4: falta el kickoff y su Semana 0 ya empezó (o pasó): el sistema no lo agrega. */
export const OBSERVACION_SIN_KICKOFF = "El cronograma no tiene sesión de kickoff: si ya se hizo, agrégala como hecha.";

/**
 * Observación 5 (R14; M3 suma las del pasado): las tareas de la IA que no entran. Solo las partes que no son cero; con
 * una sola parte, sin repetir el número. null si no hay ninguna.
 */
export function observacionDeLasQueNoEntran(i: { repiten: number; enElPasado?: number }): string | null {
  const pasado = i.enElPasado ?? 0;
  const total = i.repiten + pasado;
  if (total === 0) return null;
  const cabeza = total === 1 ? "No entra 1 tarea de la IA" : `No entran ${total} tareas de la IA`;
  const delPasado = (n: number) => (n === 1 ? "cae en una semana que ya pasó" : "caen en semanas que ya pasaron");
  const repetidas = (n: number) => (n === 1 ? "repite una que ya está" : "repiten una que ya está");
  if (pasado > 0 && i.repiten > 0) return `${cabeza}: ${pasado} ${delPasado(pasado)} y ${i.repiten} ${repetidas(i.repiten)}.`;
  return `${cabeza}: ${pasado > 0 ? delPasado(pasado) : repetidas(i.repiten)}.`;
}
