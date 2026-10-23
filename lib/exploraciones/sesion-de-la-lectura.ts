/**
 * lib/exploraciones/sesion-de-la-lectura.ts — de qué sesión es la lectura de una reunión. PURO y sin dependencias de
 * valor: lo usan la historia de las sesiones y el plan de la guía (que no pueden importarse entre sí sin un ciclo).
 *
 * Por su reunión elegida, por su evento del calendario o, sin ninguno de los dos, por el día. Es el mismo criterio con
 * que la lectura se compara contra lo que planeó la sesión (agente.ts › `planDeLaLectura`).
 */
import type { LecturaDeReunion } from "./contenido";
import type { SesionPlaneada } from "./guia";

export function sesionDeLaLectura(clave: string, l: Pick<LecturaDeReunion, "fecha">, sesiones: readonly SesionPlaneada[]): SesionPlaneada | null {
  const porReunion = sesiones.find((s) => s.reunion && `${s.reunion.origen}:${s.reunion.id}` === clave);
  if (porReunion) return porReunion;
  const porEvento = sesiones.find((s) => s.evento && clave === `meet:gmeet_${s.evento.id}`);
  if (porEvento) return porEvento;
  const dia = l.fecha?.slice(0, 10);
  return (dia && sesiones.find((s) => !s.reunion && !s.evento && s.fecha === dia)) || null;
}
