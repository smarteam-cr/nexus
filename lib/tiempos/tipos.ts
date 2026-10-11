/**
 * lib/tiempos/tipos.ts — las formas que cruzan del servidor a la pantalla. CLIENT-SAFE.
 */
import type { CalibracionDeTipo, ConfigDeEncuesta, Documento, ModoDeEstimacion, Momento, OpcionDeTiempo, Tasa } from "./reglas";

/** Una pregunta lista para mostrar: en el cronograma, al publicar o en «Para ti». */
export interface PreguntaParaResponder {
  id: string;
  momento: Momento;
  pregunta: string;
  /** La tarea o el documento. */
  titulo: string;
  /** Dónde y cuándo: «Grupo Inve · Configuración · marcada el miércoles». */
  contexto: string;
  opciones: OpcionDeTiempo[];
  /** Lo que supone la carga y cuándo se ve. `texto` null = no hay con qué comparar. */
  estimacion: { modo: ModoDeEstimacion; texto: string | null };
  taskId: string | null;
  /** Las de un mismo avance aplicado comparten lote. */
  lote: string | null;
  venceAt: string;
}

export type PeriodoDeTiempos = "30" | "56" | "todo";

export interface FilaDeEncuesta {
  momento: Momento;
  nombre: string;
  cuando: string;
  disponible: boolean;
  motivoNoDisponible: string | null;
  activa: boolean;
  /** Nunca se guardó: está apagada con la configuración por defecto. */
  sinGuardar: boolean;
  config: ConfigDeEncuesta;
  /** A quién y cada cuánto, en una línea. */
  resumen: string;
  preguntas: number;
  tasa: Tasa;
}

export interface FilaDeDocumento {
  documento: Documento;
  nombre: string;
  preguntas: number;
  respuestas: number;
  mediana: number | null;
}

/** Una tarea clave en Feedback › Encuestas: cuántas hay en los cronogramas y qué dijo el equipo. */
export interface FilaDeFamilia {
  clave: string;
  nombre: string;
  seReconocePor: string;
  /** Tareas de Smarteam o compartidas en los cronogramas (sin las sesiones). */
  tareas: number;
  hechas: number;
  proyectos: number;
  /** Lo que dijo el equipo en la encuesta de arranque. La mediana, desde MINIMO_DEL_ARRANQUE respuestas. */
  arranque: { respuestas: number; mediana: number | null; noLaHacen: number };
  /** Lo que se respondió al terminarlas. La mediana, desde MINIMO_PARA_MEDIANA respuestas. */
  alTerminar: { respuestas: number; mediana: number | null };
  /** Las horas propias que usa hoy la carga, o null: cuenta como su tipo de fase. */
  supuestoHoras: number | null;
}

/** Cómo va la encuesta de arranque. Nunca dice quién contestó qué. */
export interface EstadoDelArranque {
  mandadaEl: string | null;
  /** A quién le llega, en una línea («CSE y CSL»). */
  aQuien: string;
  personas: number;
  /** Contestaron todas sus preguntas (con una hora o «No la hago»). */
  completas: number;
  aMedias: number;
  sinEmpezar: number;
  /** Las que vencieron sin contestar. */
  vencidas: number;
}

export interface DatosDeTiempos {
  periodo: PeriodoDeTiempos;
  encuestas: FilaDeEncuesta[];
  arranque: EstadoDelArranque;
  familias: FilaDeFamilia[];
  calibracion: CalibracionDeTipo[];
  documentos: FilaDeDocumento[];
  respuestasDeTareas: number;
  queSigue: string;
  /** Para «Ajustar»: a quién se le puede preguntar y en qué proyectos. */
  personas: { email: string; nombre: string; rol: string }[];
  proyectos: { id: string; nombre: string }[];
}
