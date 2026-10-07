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

export interface DatosDeTiempos {
  periodo: PeriodoDeTiempos;
  encuestas: FilaDeEncuesta[];
  calibracion: CalibracionDeTipo[];
  documentos: FilaDeDocumento[];
  respuestasDeTareas: number;
  queSigue: string;
  /** Para «Ajustar»: a quién se le puede preguntar y en qué proyectos. */
  personas: { email: string; nombre: string; rol: string }[];
  proyectos: { id: string; nombre: string }[];
}
