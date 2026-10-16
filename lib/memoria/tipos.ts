/**
 * lib/memoria/tipos.ts — LOS TIPOS DE LA MEMORIA DE LA CUENTA Y DEL PROYECTO. PURO.
 *
 * La memoria es lo que Nexus ya sabe de una empresa y de un proyecto, armado por UN solo cargador (lib/memoria/cargar.ts)
 * para todos los agentes (DECISIONS «La memoria de la cuenta y del proyecto: un solo cargador»). Acá viven las formas:
 * qué datos recibe el armador puro (lib/memoria/armar.ts) y qué devuelve.
 *
 * ⛔ Los datos ya llegan RECORTADOS desde el cargador: nada de facturación, montos de Partner, rentabilidad, salarios,
 * montos de un pedido fuera de alcance, la cita de una tarea ni el `sourceQuote` de una desviación. Lo que no está en
 * estos tipos no puede llegar a un prompt por la memoria.
 */
import type { FichaGuardada } from "@/lib/clients/ficha";
import type { ViaDelCongelado } from "@/lib/handoff/congelado";
import type { ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import type { EtiquetaDeSala } from "@/lib/sessions/etiqueta-de-sala";

/**
 * Para quién es la memoria.
 *   · `cliente`: va a un documento que lee el cliente (kickoff, diagnóstico, entrega, propuesta, el correo…).
 *   · `sin-lo-interno`: el handoff. Es interno, pero escribe en una sola llamada secciones que leen el kickoff y el
 *     cuestionario del cliente: recibe lo propuesto con su fuente, pero nada interno.
 *   · `interno`: los agentes internos (implementación, avance, resumen del proyecto, exploración, preventa).
 */
export type AlcanceDeMemoria = "cliente" | "sin-lo-interno" | "interno";

/** Las partes de la memoria, en el orden en que se arman. */
export type ClaveDeParte =
  | "ficha"
  | "procesos"
  | "historia"
  | "fueraDeAlcance"
  | "preventa"
  | "auditoria"
  | "minutas"
  | "compromisos"
  | "desviaciones"
  | "resultados"
  | "hechos"
  | "personas"
  | "tickets"
  | "notasDelEquipo";

export interface ParteDeLaMemoria {
  clave: ClaveDeParte;
  titulo: string;
  /** Cuántos caracteres ocupa en el texto (para medir el prompt antes y después). */
  caracteres: number;
  /** Esta parte solo existe en el alcance interno (nunca llega al cliente ni al handoff). */
  interno: boolean;
}

export interface MemoriaArmada {
  /** El bloque listo para el prompt. "" si no hay nada que decir: un bloque vacío no se manda. */
  texto: string;
  partes: ParteDeLaMemoria[];
}

/** Qué se carga según el alcance (lo decide `queCargar`, en lib/memoria/consumidores.ts). */
export interface QueCargar {
  /** Lo propuesto de la ficha, con su fuente. */
  fichaPropuesta: boolean;
  /** Los campos internos de la ficha (apertura, su porqué, motivación, oportunidades). */
  camposInternos: boolean;
  /** La postura de los stakeholders. */
  posturaDeLasPersonas: boolean;
  /** Los mapas de procesos que el cliente todavía no validó (borrador, revisado, formato anterior). */
  procesosSinValidar: boolean;
  /** Los ids de trato (negocio de HubSpot) de cada proyecto. */
  idsDeTrato: boolean;
  /** Los pedidos fuera de alcance. */
  fueraDeAlcance: boolean;
  /** Lo aprendido en la preventa (con lo interno). */
  preventa: boolean;
  /** Los hallazgos confirmados de la auditoría del portal. */
  auditoria: boolean;
  /** Los compromisos abiertos del proyecto (de Tareas, por lib/tareas/para-agentes.ts). */
  compromisos: boolean;
  /** De cada reunión, la minuta entera y las notas (con riesgos); si no, solo los acuerdos y decisiones de la minuta. */
  minutaCompleta: boolean;
  /**
   * Las minutas que nadie revisó (de la IA, tal cual). Solo el alcance interno: fuera de él van solo las que revisó (o
   * editó) una persona, porque el borrador del kickoff alimenta el cuestionario que abre el cliente sin que nadie lo
   * revise, y una minuta de IA sin revisar no puede llegar ahí.
   */
  minutasSinRevisar: boolean;
  /** Las reuniones de puertas adentro (y las que no se sabe con quién fueron). */
  reunionesPuertasAdentro: boolean;
  /** Las desviaciones que el cliente no ve (o que nadie confirmó). */
  desviacionesNoVisibles: boolean;
  /** Quién causó cada desviación (es cobertura interna: GLOSSARY, vocabulario interno → cliente). */
  atribucionDeDesviaciones: boolean;
  /** Los resultados medibles que el CSE todavía no confirmó. */
  resultadosSinConfirmar: boolean;
  /**
   * Los HECHOS de las reuniones (memoria de la cuenta, etapa 6): los usados y los pendientes, rotulados como propuestos
   * por la lectura y sin revisar. Solo el alcance interno: un hecho trae lo dicho en la reunión y nadie lo revisó.
   */
  hechos: boolean;
  /**
   * Las personas del cliente y sus tickets abiertos, de la copia de HubSpot (etapa 6a de docs/mi-dia-plan.md). Solo el
   * alcance interno: la lista de contactos de HubSpot no está curada (gente que se fue, contactos de prospección).
   */
  personasYTickets: boolean;
  /**
   * Las notas del equipo (etapa 5 de docs/mi-dia-plan.md): lo que pasó por WhatsApp, una llamada o un correo. Solo el
   * alcance interno: las escribe el equipo para el equipo, sin la frontera de lo que ve el cliente.
   */
  notasDelEquipo: boolean;
}

// ── Lo que recibe el armador de la cuenta ───────────────────────────────────────────────────

/** Un proceso, resumido: la memoria no repite el mapa entero (lo leen los documentos que lo necesitan). */
export interface ProcesoDeLaMemoria {
  nombre: string;
  /** `anterior` = un mapa del formato anterior (no tiene estado de validación). */
  estado: "borrador" | "revisado" | "validado" | "anterior";
  queResuelve: string;
  /** Los dolores de HOY que dijo una reunión (como mucho 3). */
  dolores: string[];
}

export interface ProyectoDeLaHistoria {
  id: string;
  nombre: string;
  /** `serviceType`, si lo tiene. */
  tipo: string | null;
  /** active | paused | completed */
  estado: string;
  /** ISO. */
  desde: string;
  /** El negocio de HubSpot. Solo llega al alcance interno. */
  tratoId: string | null;
}

export interface PedidoDeLaMemoria {
  pedido: string;
  estado: string;
  proyecto: string | null;
  quienLoPidio: string | null;
  /** ISO. */
  fecha: string;
}

export interface PreventaDeLaMemoria {
  /** ISO: la última actividad de la preventa. */
  fecha: string;
  archivada: boolean;
  /** Ya recortado (lib/exploraciones/para-la-memoria.ts): la escala estimada y lo que dijo el cliente, más lo INTERNO. */
  texto: string;
}

export interface AuditoriaDeLaMemoria {
  nombre: string;
  /** ISO. */
  fecha: string;
  /** El titular del estado del portal, si el análisis lo dejó. */
  estado: string | null;
  /** Solo los hallazgos CONFIRMADOS por una persona. */
  hallazgos: { seccion: string; titulo: string; hallazgo: string; decision: string }[];
}

/**
 * Un hecho de una reunión, para la memoria interna (lib/seguimiento/hechos-server.ts › `hechosParaLaMemoria`): la frase,
 * sin la cita. «pendiente» = la lectura lo propuso y nadie lo revisó todavía.
 */
export interface HechoDeLaMemoria {
  tipo: string;
  tema: string | null;
  frase: string;
  estado: "usado" | "pendiente";
  reunion: { titulo: string; fecha: string } | null;
}

export interface DatosDeLaCuenta {
  cliente: { nombre: string };
  ficha: FichaGuardada;
  procesos: ProcesoDeLaMemoria[];
  proyectos: ProyectoDeLaHistoria[];
  /** La última Entrega PUBLICADA de otro proyecto del cliente (solo las secciones de historia). */
  entrega: { proyecto: string; texto: string } | null;
  fueraDeAlcance: PedidoDeLaMemoria[];
  preventa: PreventaDeLaMemoria | null;
  auditoria: AuditoriaDeLaMemoria | null;
  /** Los hechos de la CUENTA (sin proyecto). Solo el alcance interno los carga. */
  hechos?: HechoDeLaMemoria[];
  /** Las personas del cliente en HubSpot, primero quien estuvo en una reunión hace menos. Solo el alcance interno. */
  personas?: PersonaDeLaMemoria[];
  /** Los tickets abiertos del cliente en HubSpot. Solo el alcance interno. */
  tickets?: TicketDeLaMemoria[];
  /** Las notas del equipo, las más nuevas primero. Solo el alcance interno. */
  notasDelEquipo?: NotaDelEquipoDeLaMemoria[];
}

export interface NotaDelEquipoDeLaMemoria {
  /** La etiqueta del canal («WhatsApp», «Llamada»…). */
  canal: string;
  /** AAAA-MM-DD. */
  fecha: string;
  texto: string;
  autor: string;
}

export interface PersonaDeLaMemoria {
  nombre: string;
  cargo: string | null;
  /** ISO: la última reunión con el cliente en la que estuvo. */
  ultimaReunion: string | null;
}

export interface TicketDeLaMemoria {
  asunto: string;
  etapa: string | null;
  prioridad: string | null;
  /** ISO. */
  desde: string | null;
}

// ── Lo que recibe el armador del proyecto ───────────────────────────────────────────────────

export interface MinutaDeLaMemoria {
  resumen: string | null;
  acuerdos: string[];
  decisiones: string[];
  riesgos: string[];
  /** La revisó (o la editó) una persona. */
  revisada: boolean;
}

export interface ReunionDeLaMemoria {
  id: string;
  titulo: string;
  /** ISO. */
  fecha: string;
  sala: EtiquetaDeSala;
  /** Lo que dejó la reunión al leerse (minuta + notas: `resumenDeReunion`). Solo lo lee el alcance interno. */
  resumen: string;
  minuta: MinutaDeLaMemoria | null;
}

/** Un compromiso abierto (la proyección de lib/tareas/para-agentes.ts: nunca la cita, el contexto ni las notas). */
export interface CompromisoDeLaMemoria {
  titulo: string;
  venceEl: string | null;
  estado: string;
  lado: "cliente" | "smarteam";
}

export interface DesviacionDeLaMemoria {
  /** ATRASO | COMPROMISO | SOLICITUD (deprecado). */
  tipo: string;
  titulo: string;
  detalle: string | null;
  semanas: number | null;
  /** ISO. */
  fecha: string;
  visibleAlCliente: boolean;
  /** Una propuesta del agente que nadie confirmó. */
  sinConfirmar: boolean;
  cerrada: boolean;
  /** Quién la causó (CLIENTE | SMARTEAM | AMBOS | DEV). Solo llega al alcance interno. */
  quien: string;
}

export interface DatosDelProyecto {
  proyecto: { nombre: string };
  /** Las reuniones del proyecto que ya ocurrieron, la más nueva primero, con su contenido. */
  reuniones: ReunionDeLaMemoria[];
  compromisos: CompromisoDeLaMemoria[];
  desviaciones: DesviacionDeLaMemoria[];
  resultados: ResultadoMedible[];
  /** Los hechos del PROYECTO. Solo el alcance interno los carga. */
  hechos?: HechoDeLaMemoria[];
}

// ── Lo esencial de la cuenta (el pase de cuenta) ────────────────────────────────────────────

/** Una sección de lo esencial: un título y líneas cortas, para un aviso (no para un prompt). */
export interface SeccionDeLoEsencial {
  /** Qué es, para quien la resume (el pase de cuenta la cuenta en una línea). */
  clave: "ficha" | "personas" | "compromisos" | "pedidos";
  titulo: string;
  lineas: string[];
}

// ── «Lo que la IA ya sabe» ──────────────────────────────────────────────────────────────────

/** Para la página de inicio de la exploración: son CONTEOS, nunca el contenido. */
export interface LoQueSabeLaIADeLaMemoria {
  ficha: { confirmados: number; propuestos: number; propuestosPorOrigen: Record<string, number> };
  /** null fuera de un proyecto. `via`: cómo se congeló (lib/handoff/congelado.ts), null si no está congelado. */
  handoff: { hay: boolean; generadoAt: string | null; congeladoAt: string | null; via: ViaDelCongelado | null } | null;
  /** Cuántas reuniones del proyecto tienen minuta (se leyeron al llegar). null fuera de un proyecto. */
  reunionesConMinuta: number | null;
  /** En un proyecto: si la empresa tuvo una preventa (lo aprendido ahí llega a la memoria interna). null si no. */
  preventa: { fecha: string; archivada: boolean } | null;
}
