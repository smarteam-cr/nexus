/**
 * lib/exploraciones/resumen-anterior.ts — la versión anterior que guardaba «Volver a la versión anterior» del Resumen de
 * La escala (21 nov, mañana). Se REEMPLAZÓ el mismo día por el historial de versiones (lib/versiones,
 * ./versiones-del-resumen-server.ts): ya no se escribe. La que quedó guardada en `contenido.resumenAnterior` entra al
 * historial la primera vez que se abre, con su fecha. Client-safe.
 */
import type { ResumenGuardado } from "./resumen-de-la-escala";

/** Cómo quedó guardada la anterior: al rehacer el Resumen, o al volver a la versión anterior. */
export const MOTIVOS_DE_LA_ANTERIOR = ["rehacer", "volver"] as const;
export type MotivoDeLaAnterior = (typeof MOTIVOS_DE_LA_ANTERIOR)[number];

/** El Resumen que se reemplazó, tal como estaba, con quién y cuándo lo reemplazó. DEPRECATED: solo se lee. */
export interface ResumenAnterior {
  resumen: ResumenGuardado;
  /** Cuándo se reemplazó (ISO). */
  en: string;
  /** Quién lo reemplazó (su correo). null: no se sabe. */
  por: string | null;
  motivo: MotivoDeLaAnterior;
}
