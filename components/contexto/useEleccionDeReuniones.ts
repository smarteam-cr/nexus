"use client";

/**
 * components/contexto/useEleccionDeReuniones.ts — elegir reuniones, quitarlas y deshacerlo (2026-10-09).
 *
 * El hook de la lista de reuniones de todo «Contexto adicional» (components/contexto/ListaDeReuniones.tsx):
 * la propuesta, los proyectos (handoff, cronograma, documentos) y la preventa. Salió de
 * `useAccionesDeReuniones` de la propuesta (F-4 de Feedback); lo único propio de cada lugar es la
 * función que ESCRIBE —`escribir(ids, incluir)`, con su ruta— y el hook no sabe nada de rutas.
 *
 * Deshacer: cada quitar deja un paso en el historial del bloque, y deshacer lo devuelve paso por paso
 * hasta que se recarga. Ctrl+Z (⌘Z) solo con el bloque A LA VISTA y sin el foco en un campo de texto
 * —ahí, y en el documento del paso de al lado, manda su propio deshacer—. Si en la misma pantalla hay
 * dos bloques con algo para deshacer (el handoff y el cronograma de un proyecto), deshace el paso MÁS
 * RECIENTE de los dos: un solo escucha de teclado para todos, que compara la hora de cada paso.
 * Un deshacer que falla igual saca su paso (el aviso ya lo dijo y la lista se releyó): si se quedara,
 * cada Ctrl+Z volvería a intentarlo y a fallar, y taparía el deshacer del resto de la pantalla. Y una
 * reunión que vuelve a la lista por otro camino («Volver a incluir», «Reincluir» o «Agregar» en el
 * buscador) sale del historial: la franja cuenta solo lo que sigue afuera.
 *
 * ⚠ Convive con el deshacer GLOBAL (components/ui/UndoProvider.tsx, que escucha en `window`): este
 * escucha en `document`, que en el burbujeo pasa antes, y cancela la tecla solo si deshizo algo. Así
 * una sola tecla nunca deshace dos cosas (el global respeta `defaultPrevented`). Y si en la pila global
 * hay algo a la vista hecho DESPUÉS del último quitar (una tarea del Gantt, en el cronograma), la tecla
 * es del global; y si estás trabajando en una superficie con deshacer propio (un diagrama, marcado con
 * `data-deshacer-propio`), es de ella. Ctrl+Z deshace siempre lo último que hiciste. La regla vive en
 * `listaQueDeshace` (lib/contexto/lista-de-reuniones.ts), con su prueba; las de atajo y de campo de
 * texto, en lib/ui/deshacer.ts.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useUndo } from "@/components/ui/UndoProvider";
import { listaQueDeshace } from "@/lib/contexto/lista-de-reuniones";
import { esAtajoDeshacer, esCampoDeTexto } from "@/lib/ui/deshacer";

/** Escribe: quita (`incluir` false) o devuelve (`incluir` true) esas reuniones. true = salió bien. */
export type EscribirReuniones = (ids: string[], incluir: boolean) => Promise<boolean>;

/**
 * Restaura lo quitado (deshacer). Por defecto es `escribir(ids, true)`; un lugar donde «quitar» pisó
 * un valor que no era «incluida a mano» (la sugerida del handoff o de un documento) pasa la suya, para
 * que deshacer deje la reunión como estaba y no forzada.
 */
export type RestaurarReuniones = (ids: string[]) => Promise<boolean>;

/** Un paso del historial: lo que se quitó junto, y cuándo (para saber cuál es el último). */
interface Paso {
  ids: string[];
  ts: number;
}

interface BloqueRegistrado {
  visible: () => boolean;
  /** La hora del último paso que tiene para deshacer, o 0 si no tiene nada. */
  ultimaQuita: () => number;
  /** La hora de lo que deshace ahora el global (0 = nada a la vista). */
  ultimaDelGlobal: () => number;
  deshacer: () => void;
}

/* ── El registro de la pantalla: un escucha para todos los bloques ─────────────────────────── */
const bloques = new Map<string, BloqueRegistrado>();
let escuchando = false;
/** Dónde cayó el último clic: si fue en una superficie con deshacer propio, Ctrl+Z es de ella. */
let ultimoClic: Element | null = null;

function alPresionar(e: PointerEvent) {
  ultimoClic = e.target instanceof Element ? e.target : null;
}

/** Una superficie con su propia pila de deshacer (el diagrama). */
const conDeshacerPropio = (el: Element | null | undefined) => !!el?.closest?.("[data-deshacer-propio]");

function alTeclear(e: KeyboardEvent) {
  if (e.defaultPrevented || !esAtajoDeshacer(e)) return;
  // Una casilla con el foco no es un campo de texto: Ctrl+Z ahí también deshace lo quitado.
  const enfocado = document.activeElement as HTMLElement | null;
  const esCasilla = enfocado instanceof HTMLInputElement && enfocado.type === "checkbox";
  if (!esCasilla && esCampoDeTexto(enfocado)) return;
  // El bloque a la vista con el paso más reciente, si lo último no fue otra cosa de la pantalla.
  const lista = [...bloques.values()];
  const i = listaQueDeshace(
    lista.map((b) => {
      const ultimaQuita = b.ultimaQuita();
      return { ultimaQuita, visible: ultimaQuita > 0 && b.visible() };
    }),
    {
      ultimaDelGlobal: lista[0]?.ultimaDelGlobal() ?? 0,
      // El global no atiende con el foco en un campo (una casilla cuenta): ahí no se le cede la tecla.
      elGlobalAtiende: !esCampoDeTexto(enfocado),
      enSuperficieConDeshacerPropio: conDeshacerPropio(ultimoClic) || conDeshacerPropio(enfocado),
    },
  );
  if (i < 0) return;
  e.preventDefault();
  lista[i].deshacer();
}

function registrar(id: string, b: BloqueRegistrado) {
  bloques.set(id, b);
  if (!escuchando && typeof document !== "undefined") {
    document.addEventListener("keydown", alTeclear);
    document.addEventListener("pointerdown", alPresionar, true);
    escuchando = true;
  }
}

function desregistrar(id: string) {
  bloques.delete(id);
  if (bloques.size === 0 && escuchando) {
    document.removeEventListener("keydown", alTeclear);
    document.removeEventListener("pointerdown", alPresionar, true);
    ultimoClic = null;
    escuchando = false;
  }
}

export function useEleccionDeReuniones({
  ids,
  escribir,
  restaurar,
}: {
  /** Las reuniones que se pueden elegir y quitar (las de la lista que llevan casilla). */
  ids: string[];
  escribir: EscribirReuniones;
  restaurar?: RestaurarReuniones;
}) {
  const bloqueId = useId();
  const { ultimaVisible } = useUndo();
  const [crudas, setCrudas] = useState<Set<string>>(new Set());
  const [historial, setHistorial] = useState<Paso[]>([]);
  const [trabajando, setTrabajando] = useState(false);
  /** El contenedor del bloque: Ctrl+Z solo actúa si está a la vista. */
  const contenedor = useRef<HTMLDivElement | null>(null);

  // Una elegida que ya no está (la quitó otra mano, se recargó) deja de contar sola.
  const elegidas = ids.filter((id) => crudas.has(id));

  /* Una reunión quitada que vuelve a la lista por otro camino («Volver a incluir», «Reincluir» o
     «Agregar» en el buscador) sale del historial: deshacerla sería una escritura sin efecto, y la
     franja seguiría diciendo que la quitaste. Solo cambia los pasos que la tienen (los demás quedan
     idénticos, y deshacer los saca por identidad). */
  const clave = ids.join("|");
  useEffect(() => {
    const vuelta = new Set(clave ? clave.split("|") : []);
    setHistorial((h) => {
      if (!h.some((p) => p.ids.some((id) => vuelta.has(id)))) return h;
      return h
        .map((p) => (p.ids.some((id) => vuelta.has(id)) ? { ...p, ids: p.ids.filter((id) => !vuelta.has(id)) } : p))
        .filter((p) => p.ids.length > 0);
    });
  }, [clave]);

  const quitar = useCallback(
    async (aQuitar: string[]): Promise<boolean> => {
      if (aQuitar.length === 0 || trabajando) return false;
      setTrabajando(true);
      try {
        const ok = await escribir(aQuitar, false);
        if (ok) {
          setHistorial((h) => [...h, { ids: aQuitar, ts: Date.now() }]);
          setCrudas(new Set());
        }
        return ok;
      } finally {
        setTrabajando(false);
      }
    },
    [escribir, trabajando],
  );

  const deshacer = useCallback(async () => {
    const ultimo = historial[historial.length - 1];
    if (!ultimo || trabajando) return;
    setTrabajando(true);
    try {
      await (restaurar ?? ((x: string[]) => escribir(x, true)))(ultimo.ids);
      /* Salga bien o mal, el paso se va (ver la cabecera). Por identidad y no «el último»: si la
         relectura ya lo sacó (volvieron a la lista), no se lleva otro. */
      setHistorial((h) => h.filter((p) => p !== ultimo));
    } finally {
      setTrabajando(false);
    }
  }, [historial, trabajando, escribir, restaurar]);

  /**
   * «Volver a incluir» desde las excluidas: pasa por el mismo candado que quitar y deshacer, y lo que
   * vuelve sale del historial (la franja cuenta solo lo que sigue afuera).
   */
  const devolver = useCallback(
    async (aDevolver: string[]): Promise<boolean> => {
      if (aDevolver.length === 0 || trabajando) return false;
      setTrabajando(true);
      try {
        const ok = await escribir(aDevolver, true);
        if (ok) {
          setHistorial((h) =>
            h.map((p) => ({ ...p, ids: p.ids.filter((id) => !aDevolver.includes(id)) })).filter((p) => p.ids.length > 0),
          );
        }
        return ok;
      } finally {
        setTrabajando(false);
      }
    },
    [escribir, trabajando],
  );

  /* El registro lee siempre lo último por referencia: el escucha es uno solo y vive fuera de React. */
  const ultimaHora = historial.length ? historial[historial.length - 1].ts : 0;
  const vivo = useRef({ deshacer, ultimaHora, ultimaVisible });
  useEffect(() => {
    vivo.current = { deshacer, ultimaHora, ultimaVisible };
  });
  useEffect(() => {
    registrar(bloqueId, {
      visible: () => !!contenedor.current && contenedor.current.offsetParent !== null,
      ultimaQuita: () => vivo.current.ultimaHora,
      ultimaDelGlobal: () => vivo.current.ultimaVisible(),
      deshacer: () => void vivo.current.deshacer(),
    });
    return () => desregistrar(bloqueId);
  }, [bloqueId]);

  const alternar = useCallback((id: string) => {
    setCrudas((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  return {
    contenedor,
    elegidas,
    esElegida: (id: string) => crudas.has(id) && ids.includes(id),
    alternar,
    /** «Elegir todas» con todas elegidas las suelta; si no, las elige todas. */
    alternarTodas: () => setCrudas(elegidas.length > 0 && elegidas.length === ids.length ? new Set() : new Set(ids)),
    soltar: () => setCrudas(new Set()),
    quitar,
    deshacer,
    devolver,
    /** Lo último que se quitó (lo que devuelve deshacer), o null. */
    ultimo: historial.length ? historial[historial.length - 1].ids : null,
    trabajando,
  };
}
