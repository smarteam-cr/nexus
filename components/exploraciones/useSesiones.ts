"use client";

/**
 * useSesiones — las sesiones de la exploración tal como se muestran: la barra de la izquierda las
 * lista y Exploración abre la elegida. Las dos leen de acá, así no pueden contar sesiones distintas.
 *
 * Sin sesiones planeadas, la primera existe igual (`nueva`): es la que se prepara. Una reunión que
 * no quedó en ninguna sesión aparece como propia, para no perderla.
 */
import { estadoDeLaSesion, MAX_SESIONES, pestanasDeSesiones, proximaReunion, type PestanaDeSesion, type SesionPlaneada } from "@/lib/exploraciones/guia";
import { hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";

export const nuevoIdDeSesion = () => `s-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function useSesiones() {
  const { exp, cambiar, reuniones, sesion } = useLienzo();
  const sesiones = exp.estado.contenido.sesiones;
  const hoy = hoyEnCostaRica();
  const pestanas = pestanasDeSesiones(sesiones, reuniones, hoy);
  const proxima = proximaReunion(sesiones, exp.leido.agenda, hoy, exp.estado.propuesta.leidas.sesiones.length);

  const virtual: PestanaDeSesion = { clave: "nueva", numero: pestanas.length + 1, sesion: null, reunion: null, fecha: null, hecha: false };
  const todas = proxima.sesionId ? pestanas : [...pestanas, virtual];
  const claveDeLaProxima = proxima.sesionId ?? "nueva";

  const activa = todas.find((p) => p.clave === sesion.elegida) ?? todas.find((p) => p.clave === claveDeLaProxima) ?? todas[0];
  const esLaProxima = activa.clave === claveDeLaProxima;
  const estadoDe = (p: PestanaDeSesion) => estadoDeLaSesion(p, claveDeLaProxima);
  // Lo que ya ocurrió se mira en el «después»; lo que no, se prepara en el «antes» (la próxima y las
  // que vienen detrás: hasta el 2026-10-06 una sesión de más adelante abría en el «después», y ahí se
  // veía lo que salió de OTRA reunión como si fuera suyo).
  const momento: MomentoDeLaSesion = sesion.momentos[activa.clave] ?? (estadoDe(activa) === "ocurrio" ? "despues" : "antes");

  const guardar = (lista: SesionPlaneada[]) => cambiar([{ op: "sesiones", sesiones: lista }]);

  const agregar = () => {
    if (sesiones.length >= MAX_SESIONES) return;
    const id = nuevoIdDeSesion();
    void guardar([...sesiones, { id }]);
    sesion.elegir(id);
    sesion.ponerMomento(id, "antes");
  };

  return { sesiones, hoy, pestanas, todas, proxima, claveDeLaProxima, activa, esLaProxima, estadoDe, momento, guardar, agregar };
}
