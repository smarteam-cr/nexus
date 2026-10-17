/**
 * lib/tareas/estados.ts — los catálogos de Tareas internas y las transiciones permitidas. CLIENT-SAFE y puro.
 *
 * Estados y tipos se guardan como TEXTO (sumar uno no exige un ALTER TYPE coordinado entre las dos PCs). Cada uno
 * tiene su catálogo acá, y un valor que el código no conoce se lee como el más visible, para que nunca desaparezca
 * una tarea de las listas por un dato raro.
 *
 * Una tarea es UNA sola fila de la propuesta a la lápida: aceptar una sugerencia le cambia el estado y no crea otra
 * fila, así que no se puede aprobar dos veces (docs/tareas-plan.md §2).
 */

/* ── Estados de una tarea ─────────────────────────────────────────────────────────── */

export const ESTADOS_DE_TAREA = [
  "propuesta",
  "pendiente",
  "en_curso",
  "hecha",
  "no_se_hara",
  "vencida",
  "rechazada",
  "fusionada",
] as const;
export type EstadoDeTarea = (typeof ESTADOS_DE_TAREA)[number];

/** Lo que se trabaja: aceptado y sin cerrar. */
export const ESTADOS_ABIERTOS = ["pendiente", "en_curso"] as const satisfies readonly EstadoDeTarea[];

/** Lo que nunca sale en las listas de trabajo (`donde.ts`): propuestas sin decidir y lo que ya no va. */
export const ESTADOS_FUERA_DEL_TRABAJO = ["propuesta", "vencida", "rechazada", "fusionada"] as const satisfies readonly EstadoDeTarea[];

export const NOMBRE_DEL_ESTADO: Record<EstadoDeTarea, string> = {
  propuesta: "Por decidir",
  pendiente: "Pendiente",
  en_curso: "En curso",
  hecha: "Hecha",
  no_se_hara: "Ya no se hará",
  vencida: "Nadie la decidió",
  rechazada: "Descartada",
  fusionada: "Era otra tarea",
};

/** Un estado que el código no conoce se lee como `pendiente`: así sigue a la vista. */
export function leerEstado(v: string | null | undefined): EstadoDeTarea {
  return (ESTADOS_DE_TAREA as readonly string[]).includes(v ?? "") ? (v as EstadoDeTarea) : "pendiente";
}

export function estaAbierta(estado: string): boolean {
  return (ESTADOS_ABIERTOS as readonly string[]).includes(estado);
}

/* ── Decisiones de una propuesta ──────────────────────────────────────────────────── */

export const DECISIONES = ["tal_cual", "con_cambios", "mas_adelante", "rechazada", "misma", "retirada", "vencida"] as const;
export type DecisionDeTarea = (typeof DECISIONES)[number];

/** Quien decidió algo «solo»: el job del lunes, el vencimiento. */
export const SISTEMA = "sistema";

/**
 * ¿Es una LÁPIDA? Solo lo que decidió una persona: una propuesta descartada o juntada con otra. Un texto idéntico a
 * una lápida no se vuelve a proponer por 28 días. Lo vencido (nadie decidió) y lo retirado por quien lo pidió no son
 * lápidas: si se vuelve a hablar del tema, se vuelve a proponer.
 */
export function esLapida(t: { estado: string; decision: string | null; decididaPorEmail: string | null }): boolean {
  if (t.estado !== "rechazada" && t.estado !== "fusionada") return false;
  if (t.decision === "retirada") return false;
  if (!t.decididaPorEmail || t.decididaPorEmail === SISTEMA) return false;
  return t.decision === "rechazada" || t.decision === "misma";
}

/* ── Prioridad, tipo, origen ──────────────────────────────────────────────────────── */

export const PRIORIDADES = ["alta", "media", "baja"] as const;
export type Prioridad = (typeof PRIORIDADES)[number];
export const NOMBRE_DE_PRIORIDAD: Record<Prioridad, string> = { alta: "Alta", media: "Media", baja: "Baja" };
export const ORDEN_DE_PRIORIDAD: Record<Prioridad, number> = { alta: 0, media: 1, baja: 2 };
export function leerPrioridad(v: string | null | undefined): Prioridad {
  return (PRIORIDADES as readonly string[]).includes(v ?? "") ? (v as Prioridad) : "media";
}

/** `apoyo` = la pidió otro equipo: es trabajo de la persona, pero no de su puesto. */
export const TIPOS_DE_TAREA = ["puesto", "apoyo"] as const;
export type TipoDeTarea = (typeof TIPOS_DE_TAREA)[number];

/** Cómo entró la tarea. No cambia nunca: es la métrica «cómo entran». */
export const ORIGENES = ["mano", "pedido", "reunion", "notas", "chat", "plantilla", "hubspot", "paso"] as const;
export type OrigenDeTarea = (typeof ORIGENES)[number];
export const NOMBRE_DEL_ORIGEN: Record<OrigenDeTarea, string> = {
  mano: "A mano",
  pedido: "Pedido",
  reunion: "De una reunión",
  notas: "De unas notas",
  chat: "Del asistente",
  plantilla: "De una plantilla",
  hubspot: "De HubSpot",
  paso: "Siguiente paso",
};

/** Quién se comprometió (fase 0.2): hasta el 2026-10-16 vivía en el evento con que nació la tarea. */
export const LADOS = ["smarteam", "cliente"] as const;
export type LadoDeTarea = (typeof LADOS)[number];

/** Una acción o una reunión planeada (fase 0.2): la reunión lleva invitados y queda unida a la que se hizo. */
export const CLASES_DE_TAREA = ["accion", "reunion"] as const;
export type ClaseDeTarea = (typeof CLASES_DE_TAREA)[number];

/* ── Agenda ───────────────────────────────────────────────────────────────────────── */

export const ESTADOS_DE_AGENDA = ["sin_agendar", "agendada", "ya_no_esta"] as const;
export type EstadoDeAgenda = (typeof ESTADOS_DE_AGENDA)[number];
export function leerEstadoDeAgenda(v: string | null | undefined): EstadoDeAgenda {
  return (ESTADOS_DE_AGENDA as readonly string[]).includes(v ?? "") ? (v as EstadoDeAgenda) : "sin_agendar";
}

/** Un bloque de agenda: en qué calendario está (el correo de su dueña), su id y su horario. */
export interface BloqueDeAgenda {
  calendario: string;
  eventoId: string | null;
  inicio: string;
  fin: string;
}

/** Lee `agendaBloques` (Json) con tolerancia: lo que no tiene forma de bloque se descarta. */
export function leerBloques(v: unknown): BloqueDeAgenda[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((b) => {
    if (!b || typeof b !== "object") return [];
    const { calendario, eventoId, inicio, fin } = b as Record<string, unknown>;
    if (typeof calendario !== "string" || typeof inicio !== "string" || typeof fin !== "string") return [];
    return [{ calendario, eventoId: typeof eventoId === "string" ? eventoId : null, inicio, fin }];
  });
}

/**
 * Los bloques de una tarea, vistos desde un calendario: los de esa persona (los que todavía no terminaron y los que ya
 * pasaron) y los de otros calendarios (de quien la tenía antes). Nexus solo toca el calendario de quien hace clic.
 */
export function repartirBloques(bloques: readonly BloqueDeAgenda[], email: string, ahora: Date) {
  const yo = email.toLowerCase();
  const mios = bloques.filter((b) => b.calendario.toLowerCase() === yo);
  return {
    mios,
    miosQueVienen: mios.filter((b) => new Date(b.fin) > ahora),
    ajenos: bloques.filter((b) => b.calendario.toLowerCase() !== yo),
  };
}

/* ── Proyectos de tareas ──────────────────────────────────────────────────────────── */

export const ESTADOS_DE_PROYECTO = ["propuesta", "activo", "en_pausa", "terminado", "descartado"] as const;
export type EstadoDeProyecto = (typeof ESTADOS_DE_PROYECTO)[number];
export const NOMBRE_DEL_ESTADO_DE_PROYECTO: Record<EstadoDeProyecto, string> = {
  propuesta: "Borrador",
  activo: "Activo",
  en_pausa: "En pausa",
  terminado: "Terminado",
  descartado: "Descartado",
};
export function leerEstadoDeProyecto(v: string | null | undefined): EstadoDeProyecto {
  return (ESTADOS_DE_PROYECTO as readonly string[]).includes(v ?? "") ? (v as EstadoDeProyecto) : "activo";
}

/* ── Resultado de una semana ──────────────────────────────────────────────────────── */

export const RESULTADOS_DE_SEMANA = ["hecha", "pasa", "mas_adelante", "no_se_hara"] as const;
export type ResultadoDeSemana = (typeof RESULTADOS_DE_SEMANA)[number];

/* ── Tablero ──────────────────────────────────────────────────────────────────────── */

export const COLUMNAS_DEL_TABLERO = ["por_decidir", "pendiente", "en_curso", "hecha"] as const;
export type ColumnaDelTablero = (typeof COLUMNAS_DEL_TABLERO)[number];

export function columnaDelTablero(estado: string): ColumnaDelTablero | null {
  switch (leerEstado(estado)) {
    case "propuesta":
      return "por_decidir";
    case "pendiente":
      return "pendiente";
    case "en_curso":
      return "en_curso";
    case "hecha":
      return "hecha";
    default:
      return null;
  }
}

/* ── Quién puede hacer qué ────────────────────────────────────────────────────────── */

export interface Quien {
  email: string;
  esSuperAdmin: boolean;
  /** Los sprints (claves) que lidera: `TeamMember.lideraEquipos`. */
  lidera: readonly string[];
}

export interface TareaParaAcciones {
  estado: string;
  responsableEmail: string | null;
  creadaPorEmail: string | null;
  pedidaPorEmail: string | null;
  equipo: string | null;
  semana: string | null;
}

export interface AccionesDeTarea {
  /** Usar · Más adelante · Descartar · No es mía (solo en una propuesta). */
  decidir: boolean;
  /** Quien la pidió retira el pedido mientras sigue sin decidir. */
  retirar: boolean;
  /** Editar título, notas, horas, prioridad, cliente, proyecto. */
  editar: boolean;
  empezar: boolean;
  terminar: boolean;
  reabrir: boolean;
  noSeHara: boolean;
  /** Cambiar la semana o mandarla a «Más adelante». */
  moverDeSemana: boolean;
  /** Cambiar el responsable (líder, o tomarla de «Por asignar»). */
  reasignar: boolean;
  /** Tomarla para sí desde «Por asignar». */
  tomar: boolean;
  /** Crear sus bloques en el calendario: solo la dueña, en la semana de hoy o una futura. */
  agendar: boolean;
  /** Marcarla «Solo para mí» (o quitárselo): solo su responsable. */
  cambiarPrivada: boolean;
}

/** Lo que `quien` puede hacer con una tarea que YA ve. La pantalla pinta los botones con esto y el servidor lo exige. */
export function accionesDe(t: TareaParaAcciones, q: Quien, opciones: { lunesDeHoy: string; esMiembroDelEspacioLibre?: boolean } = { lunesDeHoy: "" }): AccionesDeTarea {
  const yo = q.email.toLowerCase();
  const estado = leerEstado(t.estado);
  const esResponsable = !!t.responsableEmail && t.responsableEmail.toLowerCase() === yo;
  const lidera = !!t.equipo && q.lidera.includes(t.equipo);
  const manda = esResponsable || lidera || q.esSuperAdmin;
  const sinResponsable = !t.responsableEmail;
  const deMiEquipoSinDueno = sinResponsable && (lidera || !!opciones.esMiembroDelEspacioLibre);
  const abierta = estado === "pendiente" || estado === "en_curso";
  const pidio = !!t.pedidaPorEmail && t.pedidaPorEmail.toLowerCase() === yo;
  const creo = !!t.creadaPorEmail && t.creadaPorEmail.toLowerCase() === yo;

  const ninguna: AccionesDeTarea = {
    decidir: false,
    retirar: false,
    editar: false,
    empezar: false,
    terminar: false,
    reabrir: false,
    noSeHara: false,
    moverDeSemana: false,
    reasignar: false,
    tomar: false,
    agendar: false,
    cambiarPrivada: false,
  };

  if (estado === "propuesta") {
    return {
      ...ninguna,
      // Decide quien la recibe. Una propuesta sin responsable (un pedido a un equipo) la reparte su líder.
      decidir: esResponsable || (sinResponsable && (lidera || q.esSuperAdmin)),
      retirar: pidio && !esResponsable,
      editar: esResponsable || pidio || creo || lidera || q.esSuperAdmin,
      reasignar: lidera || q.esSuperAdmin,
      cambiarPrivada: esResponsable,
    };
  }

  if (abierta) {
    const semanaViva = !!t.semana && (!opciones.lunesDeHoy || t.semana >= opciones.lunesDeHoy);
    return {
      ...ninguna,
      editar: manda || creo || deMiEquipoSinDueno,
      empezar: estado === "pendiente" && (manda || deMiEquipoSinDueno),
      terminar: manda,
      noSeHara: manda,
      moverDeSemana: manda,
      reasignar: lidera || q.esSuperAdmin || esResponsable || !!opciones.esMiembroDelEspacioLibre,
      tomar: sinResponsable && (deMiEquipoSinDueno || t.equipo !== null),
      agendar: esResponsable && semanaViva,
      cambiarPrivada: esResponsable,
    };
  }

  if (estado === "hecha" || estado === "no_se_hara") {
    return { ...ninguna, reabrir: manda, editar: manda, cambiarPrivada: esResponsable };
  }

  return ninguna;
}

/* ── ¿Nace como propuesta? ────────────────────────────────────────────────────────── */

export interface ContextoDeNacimiento {
  /** El equipo de casa del responsable (su sprint). */
  equipoDelResponsable: string | null;
  /** Quien crea es líder de ese equipo. */
  creadorLideraEseEquipo: boolean;
  /** Los dos son miembros del espacio LIBRE del proyecto de la tarea. */
  ambosEnElEspacioLibre: boolean;
}

/**
 * Lo que le pones a otra persona nace como propuesta y lo decide ella (R3: «sugerir una tarea para una persona»).
 * Asigna directo solo el líder de su sprint, o un compañero del mismo espacio libre (entrar a un espacio es aceptar
 * que te asignen ahí, como en Trello). Lo tuyo y «Por asignar» nacen aceptados. Nexus nunca asigna directo.
 */
export function nacePropuesta(creadorEmail: string | null, responsableEmail: string | null, ctx: ContextoDeNacimiento): boolean {
  if (!creadorEmail) return true; // lo propone Nexus
  if (!responsableEmail) return false; // «Por asignar» o «Sin responsable»: nace aceptada, sin semana
  if (creadorEmail.toLowerCase() === responsableEmail.toLowerCase()) return false;
  if (ctx.creadorLideraEseEquipo) return false;
  if (ctx.ambosEnElEspacioLibre) return false;
  return true;
}

/** Los SQL de Tareas, en el orden en que se aplican. Sin ellos (o con el cliente de Prisma de antes), el módulo dice qué falta. */
export const SQLS_DE_TAREAS = ["scripts/sql/2026-10-09-tareas.sql", "scripts/sql/2026-10-09-tareas2-contexto.sql"] as const;
export const SQL_DE_TAREAS = SQLS_DE_TAREAS.join(" y ");
