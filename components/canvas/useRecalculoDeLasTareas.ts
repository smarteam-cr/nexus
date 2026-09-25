"use client";

/**
 * components/canvas/useRecalculoDeLasTareas.ts — LA ESPERA ANTES DE RECALCULAR las tareas de las fases
 * desfasadas (E2c P3 del borrador del cronograma, 2026-09-25).
 *
 * Si el CSE quita un cambio de fase (las semanas de «Pruebas», por ejemplo), las tareas de esa fase se
 * armaron para otra forma y se recalculan solas: UNA corrida para todas, 4 s después de la última
 * casilla. Qué se decide en cada paso es puro y se prueba aparte (lib/timeline/recalculo-de-tareas.ts:
 * `trasLaMarca`, `alVencer`); este hook solo lleva el reloj. Vive en su archivo para que el Canvas (CRLF)
 * cambie lo mínimo.
 *
 * ⛔ Solo una CASILLA DEL CSE arranca la espera (`marcasDelCse`): nunca al montar, al recargar, en otra
 * computadora ni por un cambio del cronograma. Al vencer se lee lo de ESE momento (`ult`), no lo del
 * render en que se armó. Si no se puede lanzar todavía (otra corrida, aplicando, guardando…), se espera
 * otra vez. La misma forma no se relanza sola: tras un fallo, la línea ofrece «Volver a intentar»
 * (`lanzarYa`), que sí la relanza y, si no puede todavía, espera y lanza apenas pueda.
 * Al desmontar se pierde la espera a propósito: lanzar sin nadie mirando sería una corrida sin dueño.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { alVencer, ESPERA_DEL_RECALCULO_MS, trasLaMarca } from "@/lib/timeline/recalculo-de-tareas";

export interface EntradaDelRecalculo {
  /** Cuántas casillas tocó el CSE (`useBorradorDelCronograma`). */
  marcasDelCse: number;
  /** Lo que hay que recalcular con lo marcado (`claveDeDesfasadas`); "" = nada. */
  claveDeDesfasadas: string;
  /** Quien mira puede recalcular: la misma vara que «Armar las tareas». */
  puedePedir: boolean;
  /** Se puede lanzar AHORA (sin otra corrida, sin aplicar ni descartar, con las tareas listas). */
  puedeLanzar: boolean;
  /** Pide el recálculo. `automatico`: lo lanzó la espera (sin avisos); si no, el botón de la línea. */
  lanzar: (automatico: boolean) => Promise<void>;
}

export function useRecalculoDeLasTareas(i: EntradaDelRecalculo): { esperando: boolean; lanzarYa: () => void } {
  // Lo último de la entrada: al vencer se lee de acá (crítica de datos #7).
  const ult = useRef(i);
  useEffect(() => {
    ult.current = i;
  });
  const marcasVistas = useRef(i.marcasDelCse);
  const claveVista = useRef(i.claveDeDesfasadas);
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVuelo = useRef(false);
  const ultimaLanzada = useRef<string | null>(null);
  const [esperando, setEsperando] = useState(false);

  const vencer = useCallback(async function vencerAhora(aMano: boolean): Promise<void> {
    reloj.current = null;
    const u = ult.current;
    const que = alVencer({
      clave: u.claveDeDesfasadas,
      ultimaLanzada: aMano ? null : ultimaLanzada.current,
      puedePedir: u.puedePedir,
      puedeLanzar: u.puedeLanzar && !enVuelo.current,
    });
    if (que === "esperar") {
      // Todavía no se puede: otra vuelta, con la misma intención (a mano o sola).
      reloj.current = setTimeout(() => void vencerAhora(aMano), ESPERA_DEL_RECALCULO_MS);
      setEsperando(true);
      return;
    }
    if (que === "nada") {
      setEsperando(enVuelo.current);
      return;
    }
    ultimaLanzada.current = u.claveDeDesfasadas;
    enVuelo.current = true;
    setEsperando(true);
    try {
      await u.lanzar(!aMano);
    } finally {
      enVuelo.current = false;
      setEsperando(reloj.current !== null);
    }
  }, []);

  // ⛔ Solo una casilla del CSE arranca (o vuelve a empezar) la espera.
  useEffect(() => {
    if (i.marcasDelCse === marcasVistas.current) return; // al montar, nada
    marcasVistas.current = i.marcasDelCse;
    const arranca = trasLaMarca({
      antes: claveVista.current,
      ahora: i.claveDeDesfasadas,
      esperando: reloj.current !== null,
      puedePedir: i.puedePedir,
    });
    if (!arranca) return;
    if (reloj.current !== null) clearTimeout(reloj.current);
    reloj.current = setTimeout(() => void vencer(false), ESPERA_DEL_RECALCULO_MS);
    setEsperando(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- a propósito: SOLO la marca del CSE
  }, [i.marcasDelCse]);

  // Después del de la marca: la clave con la que se compara la próxima marca es la de este render.
  useEffect(() => {
    claveVista.current = i.claveDeDesfasadas;
  });

  // Al desmontar, la espera se pierde a propósito.
  useEffect(
    () => () => {
      if (reloj.current !== null) clearTimeout(reloj.current);
      reloj.current = null;
    },
    [],
  );

  /** «Recalcular las tareas» / «Volver a intentar»: ya, aunque sea la misma forma; si no se puede
   *  todavía, espera y lanza apenas pueda. */
  const lanzarYa = useCallback(() => {
    if (reloj.current !== null) clearTimeout(reloj.current);
    reloj.current = null;
    void vencer(true);
  }, [vencer]);

  return { esperando, lanzarYa };
}
