"use client";

/**
 * components/canvas/useRecalculoDeLasTareas.ts — LA ESPERA ANTES DE RECALCULAR las tareas de las fases
 * desfasadas (E2c P3 del borrador del cronograma, 2026-09-25).
 *
 * Si el CSE quita un cambio de fase (las semanas de «Pruebas», por ejemplo), las tareas de esa fase se
 * armaron para otra forma y se recalculan solas: UNA corrida para todas, 4 s después de la última
 * casilla. Qué se decide en cada paso es puro y se prueba aparte (lib/timeline/recalculo-de-tareas.ts:
 * `trasLaMarca`, `alVencer`, `recalculoEnPantalla`); este hook lleva el reloj y arma lo que ve la barra.
 * Vive en su archivo para que el Canvas (CRLF) cambie lo mínimo, y para que sus guardas lo CORRAN
 * (lib/timeline/recalculo-en-la-pantalla.test.ts).
 *
 * ⛔ Solo una CASILLA DEL CSE arranca la espera (`marcasDelCse`): nunca al montar, al recargar, en otra
 * computadora ni por un cambio del cronograma. Al vencer se lee lo de ESE momento (`ult`), no lo del
 * render en que se armó. Si no se puede lanzar todavía (otra corrida, aplicando, guardando…), se espera
 * otra vez; si no va a poder nunca (sin tareas en pantalla), se corta. La misma forma no se relanza sola:
 * se recuerda la última forma lanzada DE CADA FASE (`lanzadas`), y tras un fallo la línea ofrece «Volver a
 * intentar» (`lanzarYa`), que sí la relanza y, si no puede todavía, espera y lanza apenas pueda.
 * Al desmontar se pierde la espera a propósito: lanzar sin nadie mirando sería una corrida sin dueño.
 *
 * Revisión de E2c (2026-09-25): lo que ve la barra (`barra`) se arma ACÁ, con el recálculo del GET
 * (`servidor`) y la espera de este hook: el Canvas solo lo pasa.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { FaseDesfasada, RecalculoEnElCable } from "@/lib/timeline/borrador";
import {
  alVencer,
  claveDeDesfasadas,
  ESPERA_DEL_RECALCULO_MS,
  formasDeDesfasadas,
  recalculoEnPantalla,
  trasLaMarca,
  type RecalculoEnPantalla,
} from "@/lib/timeline/recalculo-de-tareas";

export interface EntradaDelRecalculo {
  /** Cuántas casillas tocó el CSE (`useBorradorDelCronograma`). */
  marcasDelCse: number;
  /** Las fases desfasadas con lo marcado (`useBorradorDelCronograma`). */
  desfasadas: readonly FaseDesfasada[];
  /** El recálculo que trae el GET (su estado lo deduce el servidor de su corrida), o null. */
  servidor: RecalculoEnElCable | null;
  /** La fase que reporta la corrida que se sigue (`useAgentRun`), para la línea. */
  faseDeLaCorrida: string | null;
  /** Quien mira puede recalcular: la misma vara que «Armar las tareas». */
  puedePedir: boolean;
  /** Se puede lanzar AHORA (`puedeLanzarElRecalculo`). */
  puedeLanzar: boolean;
  /** Esperar a que se pueda sirve (hay tareas en pantalla); si no, la espera se corta. */
  puedeEsperar: boolean;
  /** Pide el recálculo. `automatico`: lo lanzó la espera (sin avisos); si no, el botón de la línea. */
  lanzar: (automatico: boolean) => Promise<void>;
}

export function useRecalculoDeLasTareas(i: EntradaDelRecalculo): {
  esperando: boolean;
  /** Lo que ve la barra del recálculo, o null si no hay fases desfasadas. */
  barra: RecalculoEnPantalla | null;
  lanzarYa: () => void;
} {
  // Lo último de la entrada: al vencer se lee de acá (crítica de datos #7).
  const ult = useRef(i);
  useEffect(() => {
    ult.current = i;
  });
  const marcasVistas = useRef(i.marcasDelCse);
  const claveVista = useRef(claveDeDesfasadas(i.desfasadas));
  const reloj = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enVuelo = useRef(false);
  // La última forma lanzada de CADA fase (revisión de E2c: antes, un solo texto con el conjunto entero).
  const lanzadas = useRef(new Map<string, string>());
  const [esperando, setEsperando] = useState(false);

  const vencer = useCallback(async function vencerAhora(aMano: boolean): Promise<void> {
    reloj.current = null;
    const u = ult.current;
    const formas = formasDeDesfasadas(u.desfasadas);
    const decision = alVencer({
      formas,
      lanzadas: lanzadas.current,
      aMano,
      enVuelo: enVuelo.current,
      puedePedir: u.puedePedir,
      puedeLanzar: u.puedeLanzar,
      puedeEsperar: u.puedeEsperar,
    });
    if (decision.que === "esperar") {
      // Todavía no se puede: otra vuelta, con la misma intención (a mano o sola).
      reloj.current = setTimeout(() => void vencerAhora(aMano), ESPERA_DEL_RECALCULO_MS);
      setEsperando(true);
      return;
    }
    if (decision.que === "nada") {
      setEsperando(enVuelo.current);
      return;
    }
    for (const [fase, forma] of formas) lanzadas.current.set(fase, forma);
    enVuelo.current = true;
    setEsperando(true);
    try {
      await u.lanzar(decision.automatico);
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
      formas: formasDeDesfasadas(i.desfasadas),
      lanzadas: lanzadas.current,
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
    claveVista.current = claveDeDesfasadas(i.desfasadas);
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

  // Lo que ve la barra: el recálculo del servidor con la espera de acá.
  const barra = recalculoEnPantalla({
    desfasadas: i.desfasadas,
    esperando,
    servidor: i.servidor,
    faseDeLaCorrida: i.faseDeLaCorrida,
  });

  return { esperando, barra, lanzarYa };
}
