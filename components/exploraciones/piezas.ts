/**
 * Las piezas del lienzo: su nombre y en cuál se revisa cada cosa que sugiere el agente. Lo usan la
 * barra de la izquierda, el panel de contexto y el cajón «Revisar todo», así no cuentan distinto.
 */
import { definicionDe } from "@/lib/exploraciones/casillas";
import type { DestinoDePropuesta } from "@/lib/exploraciones/contenido";
import type { PasoDelLienzoUI } from "./contexto";

export const NOMBRE_DEL_PASO: Record<PasoDelLienzoUI, string> = {
  resumen: "Resumen",
  preparacion: "Preparación",
  exploracion: "Exploración",
  informacion: "Información del cliente",
  procesos: "Procesos",
  escala: "La escala",
  casos: "Casos de uso",
  propuesta: "Propuesta",
};

/** Las piezas en el orden del recorrido, con el Resumen primero. */
export const ORDEN_DE_PIEZAS: readonly PasoDelLienzoUI[] = ["resumen", "preparacion", "exploracion", "informacion", "procesos", "escala", "casos", "propuesta"];

/**
 * En qué pieza se revisa lo que sugirió el agente: cada casilla en la suya (`paso` en casillas.ts),
 * la escala, el perfil, las áreas y los niveles en La escala, y los casos en Casos de uso.
 */
export function piezaDelDestino(d: DestinoDePropuesta): PasoDelLienzoUI {
  switch (d.tipo) {
    case "casoDeUso":
      return "casos";
    case "casilla":
      return definicionDe(d.clave).paso;
    default:
      return "escala";
  }
}
