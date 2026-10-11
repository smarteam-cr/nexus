"use client";

/**
 * useSesiones — las sesiones de la exploración tal como se muestran: la barra de la izquierda, la página
 * de inicio y Exploración leen de acá, así no pueden contar sesiones distintas.
 *
 * La exploración son sus SESIONES (etapa A, 2026-10-09). En un prospecto, cada reunión con la empresa
 * que no está en una sesión entra sola como sesión (`automaticas`), menos las que alguien sacó
 * (`contenido.fuera`); en un cliente o un proyecto nada entra solo: se agrega con «+ Agregar sesión».
 * Sin una sesión por delante, la próxima existe igual (`nueva`): es la que se prepara, y no se lista.
 */
import {
  estadoDeLaReunionDeLaSesion,
  estadoDeLaSesion,
  MAX_SESIONES,
  nuevoIdDeSesion,
  opcionesDeLasPestanas,
  pestanasDeSesiones,
  proximaReunion,
  reunionesFueraDeLaExploracion,
  type PestanaDeSesion,
  type SesionPlaneada,
} from "@/lib/exploraciones/guia";
import { hoyEnCostaRica } from "@/lib/exploraciones/fechas";
import { useLienzo, type MomentoDeLaSesion } from "./contexto";

export { nuevoIdDeSesion };

export function useSesiones() {
  const { exp, cambiar, reuniones, sesion } = useLienzo();
  const sesiones = exp.estado.contenido.sesiones;
  const hoy = hoyEnCostaRica();
  const opciones = opcionesDeLasPestanas(exp.automaticas, exp.estado.contenido.fuera);
  const pestanas = pestanasDeSesiones(sesiones, reuniones, hoy, opciones);
  // Las que entraron solas (un prospecto) y ya pasaron también cuentan para el número de la próxima.
  const pasadasSinSesion = pestanas.filter((p) => !p.sesion && p.hecha).length;
  const proxima = proximaReunion(sesiones, exp.leido.agenda, hoy, { pasadasSinSesion });
  /** «Fuera de la exploración»: lo que alguien sacó (un prospecto) o lo leído antes que no es sesión (un cliente). */
  const fuera = reunionesFueraDeLaExploracion(sesiones, reuniones, opciones);

  const virtual: PestanaDeSesion = { clave: "nueva", numero: pestanas.length + 1, sesion: null, reunion: null, fecha: null, hecha: false };
  const todas = proxima.sesionId ? pestanas : [...pestanas, virtual];
  const claveDeLaProxima = proxima.sesionId ?? "nueva";

  const activa = todas.find((p) => p.clave === sesion.elegida) ?? todas.find((p) => p.clave === claveDeLaProxima) ?? todas[0];
  const esLaProxima = activa.clave === claveDeLaProxima;
  const estadoDe = (p: PestanaDeSesion) => estadoDeLaSesion(p, claveDeLaProxima);
  /** En qué está la reunión de una sesión (los estados del tablero Sesion.dc.html). */
  const estadoDeLaReunion = (p: PestanaDeSesion) => estadoDeLaReunionDeLaSesion(p);
  /* Lo que ya ocurrió se mira en el «después»; lo que no, se prepara en el «antes» (la próxima y las
     que vienen detrás: hasta el 2026-10-06 una sesión de más adelante abría en el «después», y ahí se
     veía lo que salió de OTRA reunión como si fuera suyo). Una reunión que ya empezó y espera su
     transcripción, o terminó sin texto, también abre en el «después». */
  const yaEmpezo = (p: PestanaDeSesion) => ["esperando", "sinTexto"].includes(estadoDeLaReunion(p));
  const momento: MomentoDeLaSesion = sesion.momentos[activa.clave] ?? (estadoDe(activa) === "ocurrio" || yaEmpezo(activa) ? "despues" : "antes");

  const guardar = (lista: SesionPlaneada[]) => cambiar([{ op: "sesiones", sesiones: lista }]);

  /** «Sin reunión todavía»: una sesión vacía, para preparar la guía antes de agendarla. Se abre en su preparación. */
  const agregar = () => {
    if (sesiones.length >= MAX_SESIONES) return;
    const id = nuevoIdDeSesion();
    void cambiar([{ op: "agregarSesion", sesion: { id } }]);
    sesion.elegir(id);
    sesion.ponerMomento(id, "antes");
  };

  return { sesiones, hoy, pestanas, todas, proxima, claveDeLaProxima, activa, esLaProxima, estadoDe, estadoDeLaReunion, yaEmpezo, momento, guardar, agregar, fuera };
}
