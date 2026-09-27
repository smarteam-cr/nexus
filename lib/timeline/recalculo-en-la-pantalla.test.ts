/**
 * lib/timeline/recalculo-en-la-pantalla.test.ts — la CONDUCTA del recálculo de las tareas en pantalla
 * (revisión de E2c, 2026-09-25).
 *
 * Correr: `npx vitest run lib/timeline/recalculo-en-la-pantalla.test.ts --project unit`.
 *
 * La revisión de E2c encontró cambios de una línea que dejaban el recálculo mudo o pagando de más, y que
 * pasaban la suite entera: las guardas miraban el TEXTO del cableado, no lo que hace. Estas lo CORREN:
 *   1. el pedido (`pedirElRecalculo`, con lo de la pantalla inyectado): qué espera, qué lee, qué manda y
 *      que la pantalla se entere de que la corrida arrancó;
 *   2. el hook de la espera (`useRecalculoDeLasTareas`), montado con un React mínimo y relojes falsos:
 *      cómo llega el recálculo del GET a la barra, cuándo arranca la espera, qué se relanza y qué no;
 *   3. la barra (`RevisionDeLaPropuesta`), llamada como función con el mismo React mínimo: «Aplicar de
 *      todos modos» confirma diciendo qué pasa con las tareas, y el botón no cuenta como quitadas las que
 *      esperan; y (L3 P3d, desde que las casillas de las tareas viven en el Gantt) la casilla de espera en la
 *      vista pura (`vistaDeLaPropuesta`);
 *   4. (L3 P3d) el hook de la propuesta (`useBorradorDelCronograma`) con el mismo React mínimo: el cursor de
 *      «Siguiente número» es de la propuesta en pantalla.
 * El repo no tiene jsdom ni @testing-library: el React mínimo (abajo) lleva el estado, los efectos, las
 * refs y los callbacks de UN componente, y vuelve a pintar cuando cambia el estado. Alcanza para estos
 * dos, que no usan contexto ni DOM.
 * Cada `it` nombra la edición que lo pone en rojo.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// ── EL REACT MÍNIMO: un componente, sus hooks y sus efectos ─────────────────────────────────────
const mini = vi.hoisted(() => {
  interface Celda {
    v?: unknown;
    hay?: boolean;
    deps?: readonly unknown[];
    limpiar?: void | (() => void);
    set?: (x: unknown) => void;
  }
  interface Montaje {
    celdas: Celda[];
    efectos: Array<{ i: number; fn: () => void | (() => void); deps?: readonly unknown[] }>;
    pintar: () => void;
    ocupado: boolean;
    sucio: boolean;
    vivo: boolean;
  }
  let actual: Montaje | null = null;
  let indice = 0;
  const cambiaron = (antes?: readonly unknown[], ahora?: readonly unknown[]) =>
    !antes || !ahora || antes.length !== ahora.length || antes.some((x, k) => !Object.is(x, ahora[k]));
  const celda = () => {
    if (!actual) throw new Error("un hook fuera de un montaje");
    const m = actual;
    const i = indice++;
    m.celdas[i] ??= {};
    return { m, i, c: m.celdas[i] };
  };
  return {
    useRef<T>(inicial: T) {
      const { c } = celda();
      if (!c.hay) {
        c.v = { current: inicial };
        c.hay = true;
      }
      return c.v as { current: T };
    },
    useState<T>(inicial: T | (() => T)) {
      const { m, c } = celda();
      if (!c.hay) {
        c.v = typeof inicial === "function" ? (inicial as () => T)() : inicial;
        c.hay = true;
      }
      c.set ??= (x: unknown) => {
        const nuevo = typeof x === "function" ? (x as (p: unknown) => unknown)(c.v) : x;
        if (Object.is(nuevo, c.v)) return;
        c.v = nuevo;
        if (!m.vivo) return;
        if (m.ocupado) m.sucio = true;
        else m.pintar();
      };
      return [c.v as T, c.set] as const;
    },
    useMemo<T>(f: () => T, deps: readonly unknown[]) {
      const { c } = celda();
      if (!c.hay || cambiaron(c.deps, deps)) {
        c.v = f();
        c.deps = deps;
        c.hay = true;
      }
      return c.v as T;
    },
    useCallback<T>(f: T, deps: readonly unknown[]) {
      const { c } = celda();
      if (!c.hay || cambiaron(c.deps, deps)) {
        c.v = f;
        c.deps = deps;
        c.hay = true;
      }
      return c.v as T;
    },
    useEffect(fn: () => void | (() => void), deps?: readonly unknown[]) {
      const { m, i, c } = celda();
      if (!c.hay || cambiaron(c.deps, deps)) m.efectos.push({ i, fn, deps });
    },
    montar<P, R>(componente: (p: P) => R, props: P) {
      const m: Montaje = { celdas: [], efectos: [], pintar: () => {}, ocupado: false, sucio: false, vivo: true };
      let p = props;
      let salida: R | undefined;
      m.pintar = () => {
        let vueltas = 0;
        do {
          if (++vueltas > 50) throw new Error("el montaje no se estabiliza");
          m.sucio = false;
          m.ocupado = true;
          const previo = actual;
          const previoIndice = indice;
          actual = m;
          indice = 0;
          try {
            salida = componente(p);
          } finally {
            actual = previo;
            indice = previoIndice;
          }
          for (const e of m.efectos.splice(0)) {
            const c = m.celdas[e.i];
            if (typeof c.limpiar === "function") c.limpiar();
            c.hay = true;
            c.deps = e.deps;
            c.limpiar = e.fn();
          }
          m.ocupado = false;
        } while (m.sucio);
      };
      m.pintar();
      return {
        get salida(): R {
          return salida as R;
        },
        get props(): P {
          return p;
        },
        cambiar(nuevas: Partial<P>) {
          p = { ...p, ...nuevas };
          m.pintar();
        },
        desmontar() {
          m.vivo = false;
          for (const c of m.celdas) if (c && typeof c.limpiar === "function") c.limpiar();
        },
      };
    },
  };
});

vi.mock("react", async (importOriginal) => {
  const real = await importOriginal<typeof import("react")>();
  const falsos = {
    useRef: mini.useRef,
    useState: mini.useState,
    useMemo: mini.useMemo,
    useCallback: mini.useCallback,
    useEffect: mini.useEffect,
    useLayoutEffect: mini.useEffect,
  };
  return { ...real, ...falsos, default: { ...real, ...falsos } };
});

import { useRecalculoDeLasTareas, type EntradaDelRecalculo } from "@/components/canvas/useRecalculoDeLasTareas";
import RevisionDeLaPropuesta from "@/components/canvas/RevisionDeLaPropuesta";
import LineaDeLasTareas from "@/components/canvas/LineaDeLasTareas";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Button } from "@/components/ui/Button";
import {
  claveDeTareaQueSeVa,
  FORMATO_BORRADOR,
  fotoDeTarea,
  resumir,
  type Borrador,
  type FaseDesfasada,
  type FaseViva,
  type RecalculoEnElCable,
  type TareaDelVivo,
  type Vivo,
} from "./borrador";
import {
  ACCION_APLICAR_DE_TODOS_MODOS,
  ESPERA_DEL_RECALCULO_MS,
  pedirElRecalculo,
  recalculoEnPantalla,
  type PedidoDelRecalculo,
  type RespuestaDelPedido,
} from "./recalculo-de-tareas";
import { unidadesDelSiguiente, vistaDeLaPropuesta } from "./vista-de-la-propuesta";
import { mensajeDeLaPropuesta } from "./mensaje-de-la-propuesta";
import { leerFixtureGrande, vivoDelFixture } from "./__fixtures__/propuesta-grande";
import { useBorradorDelCronograma } from "@/components/canvas/useBorradorDelCronograma";

// ── Lo común ─────────────────────────────────────────────────────────────────────────────────────

const desf = (fase: string, nombre: string, forma = 3, armada = 4): FaseDesfasada => ({
  fase,
  nombre,
  forma: { nombre, semanas: forma, sesiones: null, semanaCero: false },
  armada: { nombre, semanas: armada },
});
const P = desf("p", "Pruebas");
const Q = desf("q", "Diseño", 2, 3);
const servidor = (estado: "armando" | "fallo", fases: string[], motivo: string | null = null): RecalculoEnElCable => ({
  estado,
  corrida: `run-${estado}`,
  fases,
  nombres: fases,
  fase: null,
  motivo,
});

/** Una promesa que se resuelve a mano (un pedido «en vuelo»). */
function diferida() {
  let resolver!: () => void;
  const promesa = new Promise<void>((r) => {
    resolver = r;
  });
  return { promesa, resolver };
}

/** Los elementos de un árbol (sin pintar los componentes hijos) que cumplen `pred`. */
function buscar(nodo: unknown, pred: (el: ReactElement<Record<string, unknown>>) => boolean): Array<ReactElement<Record<string, unknown>>> {
  const out: Array<ReactElement<Record<string, unknown>>> = [];
  const visitar = (n: unknown) => {
    if (Array.isArray(n)) return n.forEach(visitar);
    if (!n || typeof n !== "object" || !("props" in n)) return;
    const el = n as ReactElement<Record<string, unknown>>;
    if (pred(el)) out.push(el);
    visitar(el.props.children);
  };
  visitar(nodo);
  return out;
}
const textoDe = (nodo: ReactNode) =>
  renderToStaticMarkup(createElement("div", null, nodo))
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 1 · EL PEDIDO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("1 · pedirElRecalculo: qué espera, qué lee, qué manda y que la pantalla se entere", () => {
  function pantalla(o: { respuesta?: RespuestaDelPedido | Error; sinGuardar?: string | null; sinCasillas?: string | null; desfasadas?: FaseDesfasada[] } = {}) {
    const pasos: string[] = [];
    const estado = { token: "tok-1" as string | null, sePuedePedir: true };
    const respuesta = o.respuesta ?? { ok: true, status: 202, json: async () => ({ runId: "run-r" }) };
    const p = {
      clientId: "cli-1",
      projectId: "pro-1",
      propuesta: vi.fn(() => ({ ...estado })),
      esperarQueSeGuarde: vi.fn(async () => {
        pasos.push("guardar");
        return o.sinGuardar ?? null;
      }),
      esperarCasillas: vi.fn(async () => {
        pasos.push("casillas");
        return o.sinCasillas ?? null;
      }),
      revision: vi.fn(() => {
        pasos.push("leer");
        return { sin: new Set(["fase:p:durationWeeks"]), version: 7, desfasadas: o.desfasadas ?? [P] };
      }),
      fetch: vi.fn<PedidoDelRecalculo["fetch"]>(async () => {
        pasos.push("pedir");
        if (respuesta instanceof Error) throw respuesta;
        return respuesta;
      }),
      traerPropuesta: vi.fn(async () => {
        pasos.push("traer");
      }),
      recargar: vi.fn(async () => {
        pasos.push("recargar");
      }),
      avisar: vi.fn(),
    } satisfies PedidoDelRecalculo;
    return { p, pasos, estado };
  }
  const conflicto = (error: string, message = "La propuesta cambió.") => ({ ok: false, status: 409, json: async () => ({ error, message }) });

  it("⭐ espera lo editado y lo marcado, lee lo de ESE momento, manda `recalcular: { sin }` y TRAE la propuesta", () => {
    /* Revisión de E2c (hallazgo «alta» de guardas, punto 4): sin traer la propuesta después de lanzar, la
       pantalla no se enteraba de que la corrida arrancó (ni «Recalculando…» ni el seguimiento). Las otras
       ediciones que la ponen en rojo: pedir sin esperar el guardado o las casillas (el servidor calcularía
       contra otra base u otra versión), leer lo desmarcado antes, o no mandarlo. */
    const { p, pasos } = pantalla();
    return pedirElRecalculo(p, true).then(() => {
      expect(pasos, "el orden: guardar, casillas, leer, pedir y traer").toEqual(["guardar", "casillas", "leer", "pedir", "traer"]);
      const [url, init] = p.fetch.mock.calls[0];
      expect(url).toBe("/api/clients/cli-1/analyze");
      const cuerpo = JSON.parse(init.body);
      expect(cuerpo).toMatchObject({ agentId: "agent-timeline-detail", projectId: "pro-1", async: true });
      expect(cuerpo.borrador).toEqual({ token: "tok-1", version: 7, recalcular: { sin: ["fase:p:durationWeeks"] } });
      expect(p.avisar).not.toHaveBeenCalled();
    });
  });

  it("⭐ no pide si ya no hay nada que recalcular, si la propuesta cambió en el medio o si no se puede pedir", async () => {
    /* La edición que la pone en rojo: quitar el corte por token (una corrida pagada sobre otra propuesta) o
       por desfasadas (nada que recalcular), o pedir sobre la vista previa o descartando. */
    const vacia = pantalla({ desfasadas: [] });
    await pedirElRecalculo(vacia.p, true);
    expect(vacia.p.fetch, "pidió sin nada que recalcular").not.toHaveBeenCalled();

    const otra = pantalla();
    otra.p.esperarQueSeGuarde.mockImplementation(async () => {
      otra.estado.token = "tok-2"; // entró otra propuesta mientras se guardaba
      return null;
    });
    await pedirElRecalculo(otra.p, true);
    expect(otra.p.fetch, "pidió sobre otra propuesta").not.toHaveBeenCalled();

    const descartando = pantalla();
    descartando.p.esperarCasillas.mockImplementation(async () => {
      descartando.estado.sePuedePedir = false;
      return null;
    });
    await pedirElRecalculo(descartando.p, true);
    expect(descartando.p.fetch, "pidió mientras se descartaba").not.toHaveBeenCalled();

    const nunca = pantalla();
    nunca.estado.sePuedePedir = false;
    await pedirElRecalculo(nunca.p, false);
    expect(nunca.pasos, "con la vista previa ni siquiera guarda").toEqual([]);
  });

  it("⭐ si no se pudo guardar: el botón lo dice, la espera calla; y sin las casillas no pide", async () => {
    const aMano = pantalla({ sinGuardar: "No se pudo guardar." });
    await pedirElRecalculo(aMano.p, false);
    expect(aMano.p.avisar).toHaveBeenCalledWith("error", "No se pudo guardar.");
    expect(aMano.p.fetch).not.toHaveBeenCalled();
    const sola = pantalla({ sinGuardar: "No se pudo guardar." });
    await pedirElRecalculo(sola.p, true);
    expect(sola.p.avisar, "la espera avisa un guardado que nadie pidió").not.toHaveBeenCalled();
    const sinCasillas = pantalla({ sinCasillas: "No se guardó lo que marcaste." });
    await pedirElRecalculo(sinCasillas.p, false);
    expect(sinCasillas.p.fetch, "pidió con lo marcado sin guardar").not.toHaveBeenCalled();
  });

  it("⭐ el 409: NADA_QUE_RECALCULAR relee lo vivo; siempre trae la propuesta; solo el botón avisa lo que no es «en curso»", async () => {
    const nada = pantalla({ respuesta: conflicto("NADA_QUE_RECALCULAR") });
    await pedirElRecalculo(nada.p, false);
    expect(nada.pasos.slice(-2), "no relee lo vivo").toEqual(["recargar", "traer"]);
    expect(nada.p.avisar).not.toHaveBeenCalled();

    const enCurso = pantalla({ respuesta: conflicto("TAREAS_EN_CURSO") });
    await pedirElRecalculo(enCurso.p, false);
    expect(enCurso.p.traerPropuesta).toHaveBeenCalledTimes(1);
    expect(enCurso.p.avisar).not.toHaveBeenCalled();

    const otra = pantalla({ respuesta: conflicto("PROPUESTA_CAMBIO", "Cambió la propuesta.") });
    await pedirElRecalculo(otra.p, false);
    expect(otra.p.avisar).toHaveBeenCalledWith("info", "Cambió la propuesta.");
    const otraSola = pantalla({ respuesta: conflicto("PROPUESTA_CAMBIO") });
    await pedirElRecalculo(otraSola.p, true);
    expect(otraSola.p.avisar).not.toHaveBeenCalled();
    expect(otraSola.p.traerPropuesta).toHaveBeenCalledTimes(1);
  });

  it("un error del servidor o de la red se dice siempre (también en la automática)", async () => {
    const cae = pantalla({ respuesta: { ok: false, status: 500, json: async () => ({}) } });
    await pedirElRecalculo(cae.p, true);
    expect(cae.p.avisar).toHaveBeenCalledWith("error", "No se pudieron recalcular las tareas.");
    const red = pantalla({ respuesta: new Error("red") });
    await pedirElRecalculo(red.p, true);
    expect(red.p.avisar).toHaveBeenCalledWith("error", "Error de conexión al recalcular las tareas.");
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 2 · EL HOOK DE LA ESPERA, MONTADO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("2 · useRecalculoDeLasTareas: la barra, la espera y lo que se relanza", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  type Montado = ReturnType<typeof mini.montar<EntradaDelRecalculo, ReturnType<typeof useRecalculoDeLasTareas>>>;
  function montar(o: Partial<EntradaDelRecalculo> = {}) {
    const lanzar = vi.fn<EntradaDelRecalculo["lanzar"]>(async () => {});
    const h: Montado = mini.montar(useRecalculoDeLasTareas, {
      marcasDelCse: 0,
      desfasadas: [],
      servidor: null,
      faseDeLaCorrida: null,
      puedePedir: true,
      puedeLanzar: true,
      puedeEsperar: true,
      lanzar,
      ...o,
    });
    /** Una casilla del CSE que deja estas desfasadas. */
    const marcar = (desfasadas: FaseDesfasada[], mas: Partial<EntradaDelRecalculo> = {}) =>
      h.cambiar({ marcasDelCse: h.props.marcasDelCse + 1, desfasadas, ...mas });
    return { h, marcar, lanzar: (o.lanzar as typeof lanzar | undefined) ?? lanzar };
  }
  const esperar = (ms = ESPERA_DEL_RECALCULO_MS) => vi.advanceTimersByTimeAsync(ms);

  it("⭐ la barra sale del recálculo del GET: «armando» mientras corre y «fallo» con «Aplicar de todos modos»", () => {
    /* Revisión de E2c (hallazgo «alta» de guardas, punto 1): con `servidor: null` al armar la barra, la
       línea nunca decía «Recalculando…» ni «No se pudieron recalcular», y «Aplicar de todos modos» no
       aparecía nunca (exige «fallo»). La edición que la pone en rojo: no pasarle el recálculo del GET. */
    const { h } = montar({ desfasadas: [P], servidor: servidor("armando", ["p"]), faseDeLaCorrida: "Leyendo las reuniones" });
    expect(h.salida.barra).toEqual({ que: "armando", fases: [{ id: "p", nombre: "Pruebas" }], despues: [], fase: "Leyendo las reuniones", motivo: null });
    h.cambiar({ servidor: servidor("fallo", ["p"], "se cortó") });
    expect(h.salida.barra).toMatchObject({ que: "fallo", motivo: "se cortó" });
    h.desmontar();
  });

  it("⭐ una casilla que desfasa una fase: la barra dice «Recalculando…» durante la espera y lanza UNA, automática", async () => {
    /* Revisión de E2c (hallazgo «alta» de guardas, punto 3, y «media», punto 3): con `esperando: false` la
       línea ofrecía el botón en los 4 s en vez de «Recalculando…»; con `lanzar(aMano)` la automática
       avisaba y el botón callaba. Las ediciones que la ponen en rojo: esas dos. */
    const { h, marcar, lanzar } = montar();
    expect(h.salida.barra, "al montar sin desfasadas").toBeNull();
    marcar([P]);
    expect(h.salida.esperando).toBe(true);
    expect(h.salida.barra?.que, "la espera no se ve").toBe("esperando");
    await esperar(ESPERA_DEL_RECALCULO_MS - 1);
    expect(lanzar).not.toHaveBeenCalled();
    await esperar(1);
    expect(lanzar.mock.calls, "la espera no lanza como automática").toEqual([[true]]);
    expect(h.salida.esperando, "terminó el pedido y sigue «esperando»").toBe(false);
    h.desmontar();
  });

  it("⭐ tras un fallo, «Volver a intentar» relanza la MISMA forma (y avisa: no es automática)", async () => {
    /* Revisión de E2c (hallazgo «media» de guardas, punto 1): con `ultimaLanzada` sin mirar si es a mano,
       «Volver a intentar» no hacía nada (la misma forma daba «nada»). Con el recálculo fallido es una de
       las dos únicas salidas de la línea. La edición que la pone en rojo: que el botón no pase `aMano`. */
    const { h, marcar, lanzar } = montar();
    marcar([P]);
    await esperar();
    expect(lanzar).toHaveBeenCalledTimes(1);
    h.cambiar({ servidor: servidor("fallo", ["p"]) });
    expect(h.salida.barra?.que).toBe("fallo");
    h.salida.lanzarYa();
    await vi.advanceTimersByTimeAsync(0);
    expect(lanzar.mock.calls, "«Volver a intentar» no relanzó, o lo hizo como automática").toEqual([[true], [false]]);
    h.desmontar();
  });

  it("⭐ al recargar con una fase desfasada pendiente, una casilla que no la cambia NO lanza nada", async () => {
    /* Revisión de E2c (hallazgo «media» de guardas, punto 2): con `esperando: true` fijo, tocar la casilla
       de otra fase lanzaba una corrida pagada que nadie pidió (D7: nada se lanza al recargar). La edición
       que la pone en rojo: arrancar la espera sin que cambie lo que hay que recalcular. */
    const { h, marcar, lanzar } = montar({ desfasadas: [P] });
    expect(h.salida.barra?.que, "al montar").toBe("pendiente");
    marcar([P]);
    expect(h.salida.esperando, "arrancó la espera sin nada nuevo").toBe(false);
    await esperar(3 * ESPERA_DEL_RECALCULO_MS);
    expect(lanzar, "lanzó una corrida que nadie pidió").not.toHaveBeenCalled();
    h.desmontar();
  });

  it("⭐ con un pedido en vuelo, el botón espera a que termine (nunca dos a la vez)", async () => {
    /* Revisión de E2c (hallazgo «media» de guardas, de menor impacto): sin mirar el pedido en vuelo, el
       botón lanzaba un segundo pedido encima del primero. La edición que la pone en rojo: no pasarle
       `enVuelo` a la decisión. */
    const vuelo = diferida();
    const lanzar = vi.fn<EntradaDelRecalculo["lanzar"]>(async () => vuelo.promesa);
    const { h, marcar } = montar({ lanzar });
    marcar([P]);
    await esperar();
    expect(lanzar).toHaveBeenCalledTimes(1);
    h.salida.lanzarYa();
    await esperar(2 * ESPERA_DEL_RECALCULO_MS);
    expect(lanzar, "dos pedidos a la vez").toHaveBeenCalledTimes(1);
    expect(h.salida.esperando).toBe(true);
    vuelo.resolver();
    await esperar();
    expect(lanzar.mock.calls, "el botón no lanzó al terminar el primero").toEqual([[true], [false]]);
    h.desmontar();
  });

  it("⭐ «Pruebas» y «Diseño» fallaron juntas: desmarcar las tareas de «Pruebas» NO relanza «Diseño» sola", async () => {
    /* Revisión de E2c (hallazgo de costo): la clave pasaba de «Pruebas|Diseño» a «Diseño», salía «nueva» y
       a los 4 s se pagaba otra corrida para la forma que acababa de fallar; mientras corría, «Aplicar de
       todos modos» desaparecía. La edición que la pone en rojo: recordar lo lanzado como el conjunto
       entero, o no recordarlo por fase. */
    const { h, marcar, lanzar } = montar();
    marcar([P, Q]);
    await esperar();
    expect(lanzar).toHaveBeenCalledTimes(1);
    h.cambiar({ servidor: servidor("fallo", ["p", "q"]) });
    marcar([Q]);
    expect(h.salida.esperando, "arrancó la espera").toBe(false);
    expect(h.salida.barra?.que, "no ofrece «Aplicar de todos modos»").toBe("fallo");
    await esperar(3 * ESPERA_DEL_RECALCULO_MS);
    expect(lanzar, "se volvió a pagar la forma que falló").toHaveBeenCalledTimes(1);
    // Una fase NUEVA sí lanza (una corrida: el servidor recalcula todas las desfasadas).
    marcar([Q, desf("r", "Piloto", 1, 2)]);
    await esperar();
    expect(lanzar).toHaveBeenCalledTimes(2);
    h.desmontar();
  });

  it("⭐ tras un fallo, marcar y desmarcar el mismo cambio no dice «Recalculando…» (no se va a lanzar nada)", async () => {
    /* Revisión de E2c (la línea que promete, punto b): arrancaban los 4 s con dos spinners y al vencer no se
       lanzaba nada. La edición que la pone en rojo: arrancar la espera con lo que ya se lanzó. */
    const { h, marcar, lanzar } = montar();
    marcar([P]);
    await esperar();
    h.cambiar({ servidor: servidor("fallo", ["p"]) });
    marcar([]);
    marcar([P]);
    expect(h.salida.barra?.que, "dice «Recalculando…» sin corrida").toBe("fallo");
    await esperar(2 * ESPERA_DEL_RECALCULO_MS);
    expect(lanzar).toHaveBeenCalledTimes(1);
    h.desmontar();
  });

  it("⭐ sin tareas en pantalla (se resolvió en otra pestaña), la espera se corta en vez de decir «Recalculando…» para siempre", async () => {
    /* Revisión de E2c (la línea que promete, punto c). La edición que la pone en rojo: seguir esperando sin
       mirar si esperar sirve. */
    const { h, marcar, lanzar } = montar({ puedeLanzar: false, puedeEsperar: false });
    marcar([P]);
    expect(h.salida.barra?.que).toBe("esperando");
    await esperar();
    expect(h.salida.esperando, "sigue «esperando» algo que no va a pasar").toBe(false);
    expect(h.salida.barra?.que).toBe("pendiente");
    await esperar(3 * ESPERA_DEL_RECALCULO_MS);
    expect(lanzar).not.toHaveBeenCalled();
    h.desmontar();
  });

  it("⭐ «después, «Diseño»» solo con una espera viva: al recargar a mitad de camino no se promete", async () => {
    /* Revisión de E2c (la línea que promete, punto a): la línea armaba «después» con lo desfasado, sin mirar
       si alguien la iba a lanzar. Al recargar no hay espera: nadie lanza «Diseño». La edición que la pone
       en rojo: armar `despues` sin la espera. */
    const { h, marcar, lanzar } = montar({ desfasadas: [P, Q], servidor: servidor("armando", ["p"]), puedeLanzar: false });
    expect(h.salida.barra).toMatchObject({ que: "armando", despues: [] });
    // Una casilla que desfasa «Diseño» con otra forma: ahora sí hay espera, y la línea lo promete.
    const Q2 = desf("q", "Diseño", 1, 3);
    marcar([P, Q2]);
    expect(h.salida.barra).toMatchObject({ que: "armando", despues: [{ id: "q", nombre: "Diseño" }] });
    await esperar();
    expect(lanzar, "lanzó con otra corrida en curso").not.toHaveBeenCalled();
    // Termina la de «Pruebas»: la espera la lanza sola.
    h.cambiar({ servidor: null, puedeLanzar: true, desfasadas: [Q2] });
    await esperar();
    expect(lanzar.mock.calls).toEqual([[true]]);
    h.desmontar();
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 3 · LA BARRA Y EL GRUPO
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("3 · la barra: «Aplicar de todos modos» confirma qué pasa con las tareas, y lo que espera no cuenta", () => {
  // Una propuesta de «Regenerar todo» con «Pruebas» de 3 → 4 semanas y sus tareas armadas para 4.
  const tarea = (id: string, title: string, weekIndex: number): TareaDelVivo => ({
    id,
    title,
    weekIndex,
    notes: null,
    party: "SMARTEAM",
    type: "TASK",
    status: "PENDING",
    source: "AGENT",
    inicioFijado: null,
    finFijado: null,
  });
  const fase = (id: string, name: string, durationWeeks: number, tareas: TareaDelVivo[]): FaseViva => ({
    id,
    name,
    durationWeeks,
    startWeek: null,
    sessionCount: null,
    notes: null,
    activityType: null,
    tareas,
  });
  const C1 = tarea("c1", "Probar flujos", 2);
  const D1 = tarea("d1", "Mapear procesos", 0);
  const VIVO: Vivo = { ancla: "2026-10-05", fases: [fase("d", "Diseño", 2, [D1]), fase("c", "Pruebas", 3, [C1])] };
  const BORRADOR: Borrador = {
    formato: FORMATO_BORRADOR,
    version: 2,
    origen: "contexto",
    observaciones: [],
    pedido: "regenerar",
    tareas: { corrida: "run-2", listas: true },
    tareasArmadasPara: { d: { nombre: "Diseño", semanas: 2 }, c: { nombre: "Pruebas", semanas: 4 } },
    cambios: [
      { tipo: "fase-cambia", clave: "fase:c:durationWeeks", faseId: "c", fase: "Pruebas", campo: "durationWeeks", desde: 3, a: 4 },
      { tipo: "tarea-se-va", clave: claveDeTareaQueSeVa(C1.id), tareaId: C1.id, faseId: "c", desde: fotoDeTarea(C1) },
      {
        tipo: "tarea-nueva",
        clave: "t:c-1",
        fase: "c",
        tarea: { title: "Pruebas de aceptación", weekIndex: 3, notes: null, party: "SMARTEAM", type: "TASK", needsValidation: false, motivoPorValidar: null, fuga: null },
      },
    ],
  };
  const SIN = ["fase:c:durationWeeks"];
  type Props = Parameters<typeof RevisionDeLaPropuesta>[0];
  const noop = () => {};
  const propsCon = (o: Partial<Props>): Props => ({
    resumen: resumir(VIVO, BORRADOR, SIN, { tareas: "listas" }),
    // L4: la barra pinta el mensaje de arriba (su título y su tono salen del nivel de la propuesta ENTERA).
    mensaje: mensajeDeLaPropuesta({
      vivo: VIVO,
      borrador: BORRADOR,
      r: resumir(VIVO, BORRADOR, SIN, { tareas: "listas" }),
      entera: resumir(VIVO, BORRADOR, [], { tareas: "listas" }),
      referencias: null,
      atrasos: [],
      cierreFijado: null,
      hoy: null,
    }),
    vista: "antes",
    onAlternar: noop,
    // L3 P3d: la barra ya no tiene casillas (viven en el Gantt): sin `onMarcar`/`onMarcarVarios`; suma «Siguiente número».
    onSiguiente: noop,
    posicion: { actual: null, total: 0, primero: null },
    onAplicar: noop,
    onDescartar: noop,
    desde: "desde el handoff",
    tareas: null,
    enCurso: null,
    cierreFijado: null,
    barraRef: { current: null },
    ...o,
  });
  const botonDeAplicar = (arbol: unknown) => buscar(arbol, (el) => el.type === Button && el.props.variant === "primary")[0];
  const dialogo = (arbol: unknown) => buscar(arbol, (el) => el.type === ConfirmDialog)[0];

  it("⭐ «Aplicar de todos modos» abre la confirmación que dice a qué semana pasan las tareas; cancelar suelta la fuerza", () => {
    /* Revisión de E2c (hallazgo «media» de guardas): la guarda solo pedía que apareciera el nombre de la
       función. Con `resumen.desfasadas` en vez de `resumen.forzadas` (compila igual) o con `{false && …}`,
       el diálogo quedaba mudo: al forzar, la fase sale de las desfasadas y la lista queda vacía. Las
       ediciones que la ponen en rojo: esas dos, abrir sin forzar antes, o cancelar sin soltar la fuerza. */
    const forzar = vi.fn();
    const primero = resumir(VIVO, BORRADOR, SIN, { tareas: "listas" });
    const recalculo = recalculoEnPantalla({ desfasadas: primero.desfasadas, esperando: false, servidor: servidor("fallo", ["c"], "se cortó"), faseDeLaCorrida: null });
    expect(recalculo?.que).toBe("fallo");
    const h = mini.montar(
      RevisionDeLaPropuesta,
      propsCon({ resumen: primero, recalculo, onRecalcular: noop, onForzar: forzar }),
    );
    forzar.mockImplementation((fases: readonly string[]) => h.cambiar({ resumen: resumir(VIVO, BORRADOR, SIN, { tareas: "listas", forzar: fases }) }));
    expect(dialogo(h.salida).props.open, "abierta sin pedirla").toBe(false);
    const linea = buscar(h.salida, (el) => el.type === LineaDeLasTareas && !!el.props.recalculo)[0];
    (linea.props.onSecundaria as () => void)();
    expect(forzar).toHaveBeenCalledWith(["c"]);
    const d = dialogo(h.salida);
    expect(d.props.open).toBe(true);
    expect(d.props.title).toBe("¿Aplicar sin recalcular?");
    expect(d.props.confirmLabel).toBe(ACCION_APLICAR_DE_TODOS_MODOS);
    expect(textoDe(d.props.description as ReactNode), "el diálogo no dice qué pasa con las tareas").toContain(
      "Las tareas de «Pruebas» se armaron para 4 semanas: las que caían después pasan a la semana 3.",
    );
    (d.props.onCancel as () => void)();
    expect(forzar, "cancelar deja la fuerza puesta").toHaveBeenLastCalledWith([]);
    expect(dialogo(h.salida).props.open).toBe(false);
    h.desmontar();
  });

  it("⭐ mientras sus tareas esperan el recálculo, el botón dice «Aplicar» (sin «N de M») y está apagado", () => {
    /* Revisión de E2c (las tareas en espera no cuentan): decía «Aplicar 0 de 10» con todas las casillas
       marcadas, como si el CSE las hubiera quitado. La edición que la pone en rojo: volver a contarlas. */
    const resumen = resumir(VIVO, BORRADOR, SIN, { tareas: "listas" });
    const recalculo = recalculoEnPantalla({ desfasadas: resumen.desfasadas, esperando: true, servidor: null, faseDeLaCorrida: null });
    const h = mini.montar(RevisionDeLaPropuesta, propsCon({ resumen, recalculo }));
    const boton = botonDeAplicar(h.salida);
    expect(boton.props.children).toBe("Aplicar");
    expect(boton.props.disabled).toBe(true);
    // Sin desfasadas, el de siempre.
    h.cambiar({ resumen: resumir(VIVO, BORRADOR, [], { tareas: "listas" }), recalculo: null });
    expect(botonDeAplicar(h.salida).props.children).toBe("Aplicar todo");
    h.desmontar();
  });

  it("⭐ las tareas en espera se ven marcadas en su fila del Gantt y se pueden desmarcar; el grupo las cuenta", () => {
    /* ⚠ REESCRITA en L3 P3d (2026-09-26), con esta razón: pintaba el grupo de TareasDeLaPropuesta.tsx, que se
       BORRÓ: las casillas de las tareas viven en el Gantt y lo que pintan sale de la vista pura
       (`vistaDeLaPropuesta`). Pasa a probar la casilla de espera en la vista (spec §4.7): la que se quita sigue en
       su fila de hoy con la marca «espera» (sin tachar: todavía no se aplica); la nueva, fantasma con «espera el
       recálculo»; las dos marcadas y desmarcables, y el grupo las cuenta como marcadas. Lo que decía el grupo de
       cada fase desfasada («recalculando…», solo con dos o más) se pinta ahora al lado de la casilla del grupo, en
       el Gantt: su guarda, en gantt-de-la-propuesta.test.ts. Las ediciones que la ponen en rojo: pintar las que
       esperan desmarcadas (parecería que el CSE las quitó), trabarlas, tachar la que todavía no se quita, o
       contarlas fuera del grupo (quedaría a medias). */
    const resumen = resumir(VIVO, BORRADOR, SIN, { tareas: "listas" });
    const v = vistaDeLaPropuesta(VIVO, BORRADOR, resumen, null);
    expect(resumen.desfasadas.map((d) => d.fase)).toEqual(["c"]);
    const seVa = v.marcas.get(C1.id);
    expect(seVa, "la que se quita en espera no tiene su marca en su fila de hoy").toMatchObject({
      tipo: "espera",
      marcada: true,
      seMarca: true,
      tachada: false,
      conCasilla: true,
    });
    const semanasDeC = v.porFase.get("c")!.semanas.flat();
    expect(semanasDeC.filter((x) => x.clave === C1.id), "la que se quita en espera aparece dos veces").toHaveLength(1);
    const nueva = semanasDeC.find((x) => x.extra?.clave === "t:c-1")?.extra;
    expect(nueva?.marca, "la nueva en espera no es un fantasma marcado").toMatchObject({
      tipo: "espera",
      marcada: true,
      seMarca: true,
      fantasma: true,
      chip: "espera el recálculo",
    });
    const grupo = v.porFase.get("c")!.grupo!;
    expect(grupo.desfasada).toBe(true);
    expect([grupo.marcadas, grupo.marcables], "el grupo cuenta las que esperan como desmarcadas").toEqual([2, 2]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────────
// 4 · «SIGUIENTE NÚMERO» EN EL HOOK DE LA PROPUESTA (L3 P3d)
// ─────────────────────────────────────────────────────────────────────────────────────────────────

describe("4 · «Siguiente número»: el hook recorre los números del Gantt de ESTA propuesta", () => {
  /* El hook de la propuesta (`useBorradorDelCronograma`), montado con el mismo React mínimo, sobre la propuesta grande
     anonimizada (__fixtures__/propuesta-grande.json, leída, nunca importada). Lo puro (qué recorre, a dónde va, qué
     dice) se prueba en vista-de-la-propuesta.test.ts; acá, el cursor del hook: de qué propuesta es y cuándo vuelve a
     cero. */
  const F = leerFixtureGrande();
  const VIVO_G = vivoDelFixture(F);
  type Entrada = Parameters<typeof useBorradorDelCronograma>[0];
  const entrada: Entrada = { projectId: "p-siguiente", propuesta: F.borrador, token: "tok-1", vivo: VIVO_G, tareas: "listas", hoy: null };

  it("⭐ recorre los 14 números en orden, da la vuelta y va atrás; otra propuesta arranca de cero", () => {
    /* Las ediciones que la ponen en rojo: un cursor que no es de la propuesta (con otra propuesta, «Siguiente» seguiría
       en el 7 de la anterior), que no avance su posición (el botón diría siempre «Recorrer…»), o que recorra lo que la
       vista no numera. */
    const h = mini.montar(useBorradorDelCronograma, entrada);
    const esperados = unidadesDelSiguiente(h.salida.resumen!.indice).map((u) => u.numero);
    expect(esperados).toHaveLength(14);
    expect(h.salida.vistaDelGantt, "sin la vista del Gantt").not.toBeNull();
    expect(h.salida.posicion).toEqual({ actual: null, total: 14, primero: esperados[0] });
    const recorridos: number[] = [];
    for (let i = 0; i < 14; i++) {
      recorridos.push(h.salida.siguiente(1)!.numero);
      expect(h.salida.posicion.actual, `después del clic ${i + 1}`).toBe(i + 1);
    }
    expect(recorridos).toEqual(esperados);
    // La vuelta, y atrás.
    expect(h.salida.siguiente(1)!.numero).toBe(esperados[0]);
    expect(h.salida.posicion.actual).toBe(1);
    expect(h.salida.siguiente(-1)!.numero).toBe(esperados[13]);
    expect(h.salida.posicion.actual).toBe(14);
    // Otra propuesta (otro token): el cursor vuelve a cero.
    h.cambiar({ token: "tok-2" });
    expect(h.salida.posicion.actual, "el cursor de la otra propuesta sigue puesto").toBeNull();
    expect(h.salida.siguiente(1)!.numero).toBe(esperados[0]);
    h.desmontar();
  });

  it("sin propuesta no hay números: «Siguiente» no va a ningún lado", () => {
    const h = mini.montar(useBorradorDelCronograma, { ...entrada, propuesta: null, token: null });
    expect(h.salida.vistaDelGantt).toBeNull();
    expect(h.salida.posicion).toEqual({ actual: null, total: 0, primero: null });
    expect(h.salida.siguiente(1)).toBeNull();
    h.desmontar();
  });
});
