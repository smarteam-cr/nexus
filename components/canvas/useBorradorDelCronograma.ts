"use client";

/**
 * components/canvas/useBorradorDelCronograma.ts — el estado EN PANTALLA de la revisión de la
 * propuesta de fases (E1 del borrador del cronograma, 2026-09-24).
 *
 * Lo que decide (qué se aplica, qué choca, la huella, cómo quedaría) es puro y vive en
 * lib/timeline/borrador.ts. Acá solo vive lo que es de ESTA pantalla:
 *   · lo DESMARCADO (en memoria de la pantalla: viaja como `sin`; desde E3, en un `borrador-v1` se
 *     guarda en el servidor, ver abajo);
 *   · la VISTA («Ver la propuesta» / «Ver como estaba antes») y el lugar del scroll al alternar:
 *     el mismo Gantt, sin desmontarse (las fases abiertas siguen abiertas), y la fila que se estaba
 *     mirando vuelve a quedar donde estaba, debajo de la barra fija.
 *
 * ⭐ Lo desmarcado SOBREVIVE AL REMONTE (revisión de E1, 2026-09-24): el cronograma se desmonta al
 * cambiar de canvas y se remonta al terminar «Chequear avance», y recargar empieza de cero. Se
 * recuerda por proyecto, atado a la identidad de la propuesta: en un Map del módulo (cambiar de
 * canvas) y en `localStorage` (recargar o volver otro día). Una propuesta distinta arranca de cero.
 * E4 (2026-09): la FOTO se fue. Solo servía para convertir el formato viejo, que ya no se lee: un
 * v1 trae su `desde` guardado. Lo recordado por la versión anterior (con `foto`) se sigue leyendo.
 *
 * E2a (2026-09-25): un `borrador-v1` trae su `desde` y sube `version` cada vez que el servidor lo
 * reescribe (la marca «armando» y la fusión de las tareas). Su identidad es el TOKEN
 * (`claveDeRevision`): lo desmarcado sobrevive a que lleguen las tareas, y sigue recordándose en
 * `localStorage` como en E1 (hasta E3 no viaja entre computadoras). La `version` que se ve viaja al
 * aplicar: si el servidor tiene otra, responde 409 y no se aplica algo distinto de lo que viste.
 * El estado de las tareas («armando», «faltan», «fallo», «listas») lo calcula el servidor y entra
 * acá como `tareas`: bloquea el aplicar mientras se arman y decide la confirmación.
 *
 * E2c P3 (2026-09-25): si el CSE quita un cambio de fase, las tareas de esa fase quedan DESFASADAS y
 * se recalculan solas (`useRecalculoDeLasTareas`). Acá viven dos cosas de la pantalla:
 *   · `marcasDelCse`: cuenta SOLO las casillas que toca el CSE (`marcar`, `marcarVarios`). Es lo único
 *     que arranca la espera del recálculo: nunca al abrir, al recargar ni por un cambio del cronograma;
 *   · `forzadas`: las fases de «Aplicar de todos modos», en memoria y nunca recordadas. Se vacían con
 *     otra propuesta.
 *
 * E3 P3 (2026-09-25): LO DESMARCADO SE VE EN CUALQUIER COMPUTADORA. Con un `borrador-v1` y
 * `guardarCasillas` (quien edita), lo desmarcado es el `excluidos` del servidor con los clics que todavía
 * no subieron encima (`superponerCasillas`). Cada casilla se ve al instante y va a una cola
 * (lib/timeline/cola-de-casillas.ts): los clics se juntan 250 ms y salen en UN POST encadenado; si falla,
 * vuelven a lo del servidor. `esperarCasillas()` manda ya lo encolado y espera: lo llama todo lo que
 * manda la versión (aplicar, recalcular, armar las tareas), porque cada casilla la sube.
 *   · Migración única: si el servidor todavía no guardó nada (`excluidos` ausente) y este navegador
 *     recuerda algo desmarcado de antes de E3, eso sube como un «excluir».
 *   · Lo que se recuerda en el navegador es lo desmarcado EFECTIVO: si se vuelve a E2c, la pantalla vieja
 *     arranca con lo mismo que se veía.
 * Quien solo mira sigue como en E1: lo desmarcado vive en la memoria de la pantalla.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { claveDeDesfasadas } from "@/lib/timeline/recalculo-de-tareas";
import {
  casillasAMigrar,
  crearColaDeCasillas,
  type ColaEnMarcha,
  type ResultadoDeGuardarCasillas,
} from "@/lib/timeline/cola-de-casillas";
import {
  almacenEnMemoria,
  alternarVista,
  claveDeRevision,
  debeDescartarseSolo,
  esBorradorV1,
  excluidosDelGuardado,
  leerBorrador,
  marcarCambios,
  olvidarRevision,
  planDeAplicacion,
  recordarRevision,
  recuerdoDeLaRevision,
  resumir,
  revisionPara,
  REVISION_VACIA,
  superponerCasillas,
  versionDelBorrador,
  type AlmacenDeFotos,
  type Borrador,
  type EstadoDeLasTareas,
  type EstadoDeRevision,
  type FaseDesfasada,
  type OperacionDeCasillas,
  type Proyeccion,
  type RecuerdoDeLaRevision,
  type ResumenDelBorrador,
  type VistaDelBorrador,
  type Vivo,
} from "@/lib/timeline/borrador";

// ── DÓNDE SE RECUERDA LO DESMARCADO ────────────────────────────────────────────────────────────────
/* El Map del módulo vive lo que vive la pestaña: cubre el remonte aunque el navegador no deje usar
   `localStorage`. `localStorage` cubre la recarga. Se lee primero la memoria y, si no es de esta
   propuesta, `localStorage` (otra pestaña pudo guardar la de una propuesta más nueva). */
const MEMORIA = almacenEnMemoria();

function localStorageSeguro(): AlmacenDeFotos | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null; // acceder a `localStorage` tira en algunos navegadores con el sitio bloqueado
  }
}

/** Ninguna fase forzada: una sola referencia, así vaciar lo que ya está vacío no cambia nada. */
const SIN_FORZAR: readonly string[] = [];
const SIN_DESFASADAS: FaseDesfasada[] = [];

/** E3: los clics sin confirmar, atados a la propuesta a la que pertenecen (`clave`). */
const SIN_PENDIENTES: { clave: string | null; ops: readonly OperacionDeCasillas[] } = { clave: null, ops: [] };
/** Lo que se espera después de un POST para que la pantalla adopte la versión nueva (como `esperarQueSeGuarde`). */
const unRespiro = () => new Promise<void>((r) => window.setTimeout(r, 60));

const almacenes = (): AlmacenDeFotos[] => {
  const local = localStorageSeguro();
  return local ? [MEMORIA, local] : [MEMORIA];
};

function recordado(projectId: string, revision: string): RecuerdoDeLaRevision | null {
  for (const a of almacenes()) {
    const r = recuerdoDeLaRevision(a, projectId, revision);
    if (r) return r;
  }
  return null;
}

// ── EL LUGAR DEL SCROLL AL ALTERNAR ─────────────────────────────────────────────────────────
interface AnclaDeScroll {
  /** La fila de fase que se estaba mirando (su `data-fase-key`), o null. */
  clave: string | null;
  /** A qué distancia del borde de abajo de la barra fija estaba esa fila. */
  desdeLaBarra: number;
  topDelContenedor: number;
}

/** El primer elemento con scroll vertical hacia arriba; si no hay, la ventana. */
function contenedorConScroll(el: HTMLElement): HTMLElement | Window {
  for (let n = el.parentElement; n; n = n.parentElement) {
    const overflow = getComputedStyle(n).overflowY;
    if ((overflow === "auto" || overflow === "scroll") && n.scrollHeight > n.clientHeight) return n;
  }
  return window;
}

const bordeDeLaBarra = (barra: HTMLElement | null) => (barra ? barra.getBoundingClientRect().bottom : 0);

/** La primera fila de fase que se ve debajo de la barra fija. */
function medirAncla(contenedor: HTMLElement | null, barra: HTMLElement | null): AnclaDeScroll | null {
  if (!contenedor) return null;
  const tope = bordeDeLaBarra(barra);
  const topDelContenedor = contenedor.getBoundingClientRect().top;
  for (const fila of contenedor.querySelectorAll<HTMLElement>("[data-fase-key]")) {
    const r = fila.getBoundingClientRect();
    if (r.bottom > tope) return { clave: fila.dataset.faseKey ?? null, desdeLaBarra: r.top - tope, topDelContenedor };
  }
  return { clave: null, desdeLaBarra: 0, topDelContenedor };
}

/** Deja la misma fila a la misma distancia de la barra (o, si en esta vista no existe, el Gantt
 *  donde estaba). Contra la barra y no contra la ventana: su texto cambia con la vista, y una
 *  barra más alta taparía la fila que se estaba mirando. */
function restaurarAncla(contenedor: HTMLElement | null, barra: HTMLElement | null, a: AnclaDeScroll): void {
  if (!contenedor) return;
  const fila = a.clave
    ? Array.from(contenedor.querySelectorAll<HTMLElement>("[data-fase-key]")).find((f) => f.dataset.faseKey === a.clave)
    : undefined;
  const delta = fila
    ? fila.getBoundingClientRect().top - (bordeDeLaBarra(barra) + a.desdeLaBarra)
    : contenedor.getBoundingClientRect().top - a.topDelContenedor;
  if (Math.abs(delta) < 1) return;
  contenedorConScroll(contenedor).scrollBy({ top: delta });
}

export interface BorradorEnPantalla {
  /** El `borrador-v1` leído, o null (no hay, o no se sabe leer). */
  borrador: Borrador | null;
  /** Lo que pinta la barra. null también con un borrador SIN cambios (un v1 recién marcado
   *  «armando»): la barra no se monta vacía. */
  resumen: ResumenDelBorrador | null;
  /** Cómo quedaría el cronograma con lo marcado: la vista «Ver la propuesta» (sale del resumen). */
  proyeccion: Proyeccion | null;
  vista: VistaDelBorrador;
  /** Lo desmarcado que se VE (y viaja al aplicar). E3: en un `borrador-v1` que se edita, el `excluidos`
   *  del servidor con los clics pendientes encima. */
  sin: ReadonlySet<string>;
  /** E3: manda ya las casillas encoladas y espera a que se guarden (y la pantalla adopte la versión que
   *  subieron). null = todo guardado; si no, el motivo (ya dicho al CSE): quien llama no sigue. */
  esperarCasillas: () => Promise<string | null>;
  /** La versión del `borrador-v1` que se está viendo (viaja al aplicar), o null (no es un v1). */
  version: number | null;
  /** Todo lo que propone ya está así: no hay nada que decidir (se descarta sola). Sale del plan
   *  aunque el borrador no tenga cambios: uno vacío cuya corrida falló se descarta, uno que espera
   *  tareas no. */
  nadaQueDecidir: boolean;
  alternar: () => void;
  marcar: (clave: string, incluir: boolean) => void;
  /** La casilla de un grupo de tareas: marca o desmarca todas las claves de una vez. */
  marcarVarios: (claves: readonly string[], incluir: boolean) => void;
  /** La propuesta se resolvió (aplicada o descartada): se borra lo que se recordaba de ella. */
  olvidar: () => void;
  /** E2c: cuántas casillas tocó el CSE (solo `marcar` y `marcarVarios`). Arranca la espera del recálculo.
   *  E3 P5: y lo que el chat pasó a la propuesta (`contarMarcaDelChat`). */
  marcasDelCse: number;
  /** E3 P5: el chat pasó algo a la propuesta: cuenta como una marca (puede desfasar tareas). */
  contarMarcaDelChat: () => void;
  /** E2c: las fases de «Aplicar de todos modos» (en memoria; nunca se recuerdan). */
  forzadas: readonly string[];
  /** E2c: fuerza esas fases (`[]` las suelta). */
  forzar: (fases: readonly string[]) => void;
  /** E2c: las fases desfasadas con lo marcado. */
  desfasadas: FaseDesfasada[];
  /** E2c: su identidad (`claveDeDesfasadas`): si no cambia, no hay nada nuevo que recalcular. */
  claveDeDesfasadas: string;
  /** Envuelve la barra fija, la lista y el Gantt: con él se mide y se restaura el lugar del scroll,
   *  y es el bloque dentro del que la barra queda fija. */
  contenedorRef: RefObject<HTMLDivElement | null>;
  /** La barra fija: lo que queda debajo de ella es lo que se está mirando. */
  barraRef: RefObject<HTMLDivElement | null>;
}

export function useBorradorDelCronograma(entrada: {
  projectId: string;
  /** Lo guardado en `pendingProposal` (si no es un `borrador-v1`, no hay borrador que revisar). */
  propuesta: unknown;
  /** La corrida que dejó la propuesta (`pendingProposalRunId`): parte de su identidad. */
  token: string | null;
  /** El cronograma de la pantalla (solo fases y tareas guardadas), memoizado por quien llama. */
  vivo: Vivo;
  /** El estado de las tareas del borrador, como lo calculó el servidor (GET del cronograma), o null
   *  si no espera tareas. */
  tareas: EstadoDeLasTareas | null;
  /** E3: guarda unas casillas en el servidor (POST /borrador/operaciones, origen «casillas») y adopta la
   *  respuesta. `token`: el de la propuesta en la que se clicaron (si entró otra en el medio, la ruta
   *  responde 409 y nada cae sobre la nueva). Sin él (quien solo mira), lo desmarcado queda en la memoria
   *  de la pantalla, como en E1. */
  guardarCasillas?: (ops: OperacionDeCasillas[], token: string) => Promise<ResultadoDeGuardarCasillas>;
}): BorradorEnPantalla {
  const { projectId, propuesta, token, vivo, tareas } = entrada;
  const clave = useMemo(() => claveDeRevision(propuesta, token), [propuesta, token]);
  const [revision, setRevision] = useState<EstadoDeRevision>(REVISION_VACIA);
  const [marcasDelCse, setMarcasDelCse] = useState(0);
  const [forzadasGuardadas, setForzadas] = useState<readonly string[]>(SIN_FORZAR);
  /* E3: los clics que todavía no confirmó el servidor (de ESTA propuesta), y desde cuándo manda el
     servidor aunque no tenga `excluidos` (un POST ya entró: «ausente» es «nada desmarcado»). */
  const [pendientesDe, setPendientesDe] = useState(SIN_PENDIENTES);
  const [servidorMandaEn, setServidorMandaEn] = useState<string | null>(null);
  /* Una propuesta distinta: se ajusta el estado EN EL RENDER (el patrón de React para «cuando cambia
     una prop»), no en un efecto — un efecto pintaría primero la propuesta nueva con lo desmarcado de
     la vieja. Lo desmarcado es lo RECORDADO de esa misma propuesta, si lo hay. Las fases forzadas
     eran de la otra propuesta: se sueltan (E2c). */
  let actual = revision;
  let forzadas = forzadasGuardadas;
  if (revision.clave !== clave) {
    actual = revisionPara(clave, clave ? recordado(projectId, clave) : null);
    setRevision(actual);
    forzadas = SIN_FORZAR;
    if (forzadasGuardadas !== SIN_FORZAR) setForzadas(SIN_FORZAR);
  }

  /* ── E3: LAS CASILLAS COMPARTIDAS ─────────────────────────────────────────────────────────────
     Solo con un `borrador-v1` y `guardarCasillas`. Lo que se ve es lo del servidor con lo pendiente
     encima. Mientras el servidor no guardó nada (`excluidos` ausente y ningún POST entró todavía), «lo del
     servidor» es lo que este navegador recordaba: la migración lo sube con el primer POST. */
  const compartidas = esBorradorV1(propuesta) && !!entrada.guardarCasillas;
  const pendientes = pendientesDe.clave === clave ? pendientesDe.ops : SIN_PENDIENTES.ops;
  const servidorManda = servidorMandaEn !== null && servidorMandaEn === clave;
  const excluidosDelServidor = useMemo(() => excluidosDelGuardado(propuesta), [propuesta]);
  const sin: ReadonlySet<string> = useMemo(
    () => (compartidas ? superponerCasillas(excluidosDelServidor ?? (servidorManda ? [] : actual.sin), pendientes) : actual.sin),
    [compartidas, excluidosDelServidor, servidorManda, actual.sin, pendientes],
  );

  /* Se recuerda lo desmarcado de ESTA propuesta: el próximo montaje lo encuentra. E3: lo desmarcado
     EFECTIVO (lo que se ve). E4: solo `sin`; la foto se fue. */
  useEffect(() => {
    if (!actual.clave) return;
    const recuerdo = { sin: [...sin] };
    for (const a of almacenes()) recordarRevision(a, projectId, actual.clave, recuerdo);
  }, [projectId, actual.clave, sin]);

  /* La cola (lib/timeline/cola-de-casillas.ts): UNA por propuesta, fuera del render (en su reloj de
     250 ms y en su cadena de POST). Lo que necesita de ESTE render lo lee de `paraEnviarRef`. */
  const colaRef = useRef<{ clave: string; cola: ColaEnMarcha } | null>(null);
  const servidorMandaRef = useRef<string | null>(null);
  const migradaRef = useRef<string | null>(null);
  const paraEnviarRef = useRef({
    clave,
    token,
    compartidas,
    excluidos: excluidosDelServidor,
    local: actual.sin,
    guardar: entrada.guardarCasillas,
  });
  useEffect(() => {
    paraEnviarRef.current = {
      clave,
      token,
      compartidas,
      excluidos: excluidosDelServidor,
      local: actual.sin,
      guardar: entrada.guardarCasillas,
    };
  });
  /** La cola de la propuesta en pantalla (la crea la primera vez; la de otra propuesta se suelta). */
  const colaDeAhora = useCallback((): ColaEnMarcha | null => {
    const { clave: k, token: t } = paraEnviarRef.current;
    if (!k || !t) return null;
    if (colaRef.current?.clave === k) return colaRef.current.cola;
    colaRef.current?.cola.soltar();
    const cola = crearColaDeCasillas({
      guardar: (ops) => {
        const guardar = paraEnviarRef.current.guardar;
        return guardar ? guardar(ops, t) : Promise.resolve({ ok: false as const, motivo: "Solo quien edita guarda lo que marca." });
      },
      alCambiar: (ops) => setPendientesDe({ clave: k, ops }),
      alConfirmar: () => {
        servidorMandaRef.current = k;
        setServidorMandaEn(k);
      },
      // La migración única: mientras el servidor no guardó nada, lo recordado sube delante (repetido no cambia nada).
      migracion: () => (servidorMandaRef.current === k ? null : casillasAMigrar(paraEnviarRef.current.excluidos, paraEnviarRef.current.local)),
    });
    colaRef.current = { clave: k, cola };
    return cola;
  }, []);
  const esperarCasillas = useCallback(async (): Promise<string | null> => {
    const k = paraEnviarRef.current.clave;
    const actualDeLaCola = colaRef.current;
    if (!k || !actualDeLaCola || actualDeLaCola.clave !== k) return null;
    const { motivo, mando } = await actualDeLaCola.cola.esperar();
    if (motivo) return motivo;
    if (mando) await unRespiro(); // que la pantalla adopte la versión que subieron las casillas
    return null;
  }, []);
  /* La migración única (una vez por propuesta y por montaje): solo con `excluidos` AUSENTE. Si el servidor
     ya tiene el campo —aunque esté vacío—, otra computadora decidió y lo recordado acá no sube. */
  useEffect(() => {
    if (!compartidas || !clave || migradaRef.current === clave) return;
    migradaRef.current = clave;
    const migrar = casillasAMigrar(excluidosDelServidor, actual.sin);
    const cola = migrar ? colaDeAhora() : null;
    if (!migrar || !cola) return;
    cola.clic(migrar.claves, false);
    void cola.mandar();
  }, [compartidas, clave, excluidosDelServidor, actual.sin, colaDeAhora]);
  // Llegó otra propuesta (o ninguna): los clics de la anterior no salen ni caen sobre la nueva.
  useEffect(() => {
    if (colaRef.current && colaRef.current.clave !== clave) {
      colaRef.current.cola.soltar();
      colaRef.current = null;
    }
  }, [clave]);
  // Al desmontar (cambiar de pieza) lo encolado sale igual: un clic no se pierde por irse rápido.
  useEffect(
    () => () => {
      const cola = colaRef.current?.cola;
      if (cola?.esperandoElReloj()) void cola.mandar();
    },
    [],
  );

  const olvidar = useCallback(() => {
    for (const a of almacenes()) olvidarRevision(a, projectId);
  }, [projectId]);

  const borrador = useMemo(() => leerBorrador(propuesta), [propuesta]);
  /* La barra solo con cambios: un v1 vacío (marcado «armando», todavía sin fases ni tareas) no monta
     una barra en blanco. La proyección sale del resumen: una evaluación del plan menos por render. */
  const resumen = useMemo(
    () => (borrador && borrador.cambios.length > 0 ? resumir(vivo, borrador, sin, { tareas, forzar: forzadas }) : null),
    [vivo, borrador, sin, tareas, forzadas],
  );
  const proyeccion = resumen?.proyeccion ?? null;
  /* «Nada que decidir» sale del PLAN aunque no haya cambios: `debeDescartarseSolo` sabe que uno
     vacío que espera tareas («faltan», «armando») no se descarta, y uno vacío cuya corrida falló sí. */
  const nadaQueDecidir = useMemo(() => {
    if (!borrador) return false;
    if (resumen) return debeDescartarseSolo(resumen);
    return debeDescartarseSolo(planDeAplicacion(vivo, borrador, sin, { tareas, forzar: forzadas }));
  }, [borrador, resumen, vivo, sin, tareas, forzadas]);
  const desfasadas = resumen?.desfasadas ?? SIN_DESFASADAS;
  const clavePorDesfasadas = useMemo(() => claveDeDesfasadas(desfasadas), [desfasadas]);
  const version = useMemo(() => versionDelBorrador(propuesta), [propuesta]);

  const contenedorRef = useRef<HTMLDivElement | null>(null);
  const barraRef = useRef<HTMLDivElement | null>(null);
  const anclaRef = useRef<AnclaDeScroll | null>(null);
  const alternar = useCallback(() => {
    anclaRef.current = medirAncla(contenedorRef.current, barraRef.current);
    setRevision((r) => alternarVista(r));
  }, []);
  // Después de pintar la otra vista y antes de que se vea: la misma fila, en el mismo lugar.
  useLayoutEffect(() => {
    const a = anclaRef.current;
    anclaRef.current = null;
    if (a) restaurarAncla(contenedorRef.current, barraRef.current, a);
  }, [actual.vista]);

  /* E3: con las casillas compartidas el clic va a la cola (se ve al instante y sube al servidor); si no,
     queda en la memoria de la pantalla, como en E1. */
  const tocar = useCallback(
    (claves: readonly string[], incluir: boolean) => {
      const cola = paraEnviarRef.current.compartidas ? colaDeAhora() : null;
      if (cola) cola.clic(claves, incluir);
      else setRevision((r) => marcarCambios(r, claves, incluir));
    },
    [colaDeAhora],
  );
  /* Solo estas dos son casillas del CSE: cada una suma una marca (E2c: arranca la espera del recálculo). */
  const marcar = useCallback(
    (c: string, incluir: boolean) => {
      tocar([c], incluir);
      setMarcasDelCse((n) => n + 1);
    },
    [tocar],
  );
  const marcarVarios = useCallback(
    (claves: readonly string[], incluir: boolean) => {
      tocar(claves, incluir);
      setMarcasDelCse((n) => n + 1);
    },
    [tocar],
  );
  const forzar = useCallback((fases: readonly string[]) => setForzadas(fases.length > 0 ? [...fases] : SIN_FORZAR), []);
  /* E3 P5: lo que el chat pasó a la propuesta cuenta como una marca (puede dejar tareas desfasadas: el
     chat quitó un cambio de fase, o cambió la forma de una). Es la tercera y última vía de la marca. */
  const contarMarcaDelChat = useCallback(() => setMarcasDelCse((n) => n + 1), []);

  return {
    borrador,
    resumen,
    proyeccion,
    vista: actual.vista,
    sin,
    esperarCasillas,
    version,
    nadaQueDecidir,
    alternar,
    marcar,
    marcarVarios,
    olvidar,
    marcasDelCse,
    contarMarcaDelChat,
    forzadas,
    forzar,
    desfasadas,
    claveDeDesfasadas: clavePorDesfasadas,
    contenedorRef,
    barraRef,
  };
}
