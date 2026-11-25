"use client";

/**
 * useUbicarLaEscala — «Ubicar» de La escala de la preventa, desde donde se ofrezca (25 nov): la línea de debajo de la página
 * (PasoEscala › `LineaDeLaUbicacion`) y el aviso de arriba del Resumen cuando hay respuestas que «Ubicar» no leyó
 * (PaginaDeLaEscala › `AvisoDelResumen`). Los dos lanzan el MISMO pedido: el modo «posicionar» y, en la preventa de un
 * cliente, el proyecto de contexto elegido en «Con el contexto de».
 *
 * La elección vive en lib/exploraciones/contexto-de-ubicar.ts (un almacén por exploración, con su prueba): el botón de
 * arriba usa la que se eligió abajo. Antes era un estado de la línea.
 */
import { useSyncExternalStore } from "react";
import { contextoElegido, contextoParaUbicar, elegirElContexto, suscribirseAlContexto } from "@/lib/exploraciones/contexto-de-ubicar";
import { partirDeLoQueYaSabemos } from "@/lib/exploraciones/posicionar";
import { useLienzo } from "./contexto";
import { useCorrida } from "./useCorrida";

const sinElegir = () => undefined;

export function useUbicarLaEscala() {
  const { exp, proyectosDeLaEmpresa } = useLienzo();
  const { corrida, corriendo, lanzando, lanzar } = useCorrida();
  /* La preventa de un cliente (24 nov) parte de lo que ya sabemos: se elige el proyecto que se lee como contexto (su
     handoff, cuestionarios y cronograma). De `useLienzo` y no de `exp`: la respuesta de un cambio no trae la lista. */
  const conLoQueYaSabemos = !exp.projectId && partirDeLoQueYaSabemos(exp.empresa.kind);
  const proyectos = conLoQueYaSabemos ? proyectosDeLaEmpresa : [];
  const elegido = useSyncExternalStore(suscribirseAlContexto, () => contextoElegido(exp.id), sinElegir);
  const contexto = contextoParaUbicar(elegido, proyectos);
  const elegir = (id: string | null) => elegirElContexto(exp.id, id);
  const ubicar = () => lanzar("posicionar", conLoQueYaSabemos ? { proyectoDeContexto: contexto } : {});
  return {
    conLoQueYaSabemos,
    proyectos,
    contexto,
    elegir,
    ubicar,
    /** El agente trabaja en esta preventa (cualquier modo): el botón espera. */
    corriendo,
    lanzando,
    /** Corre «Ubicar» (la corrida `posicionar`). */
    ubicando: corriendo && corrida?.modo === "posicionar",
  };
}
