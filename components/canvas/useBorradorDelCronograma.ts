"use client";

/**
 * components/canvas/useBorradorDelCronograma.ts — el estado EN PANTALLA de la revisión de la
 * propuesta de fases (E1 del borrador del cronograma, 2026-09-24).
 *
 * Lo que decide (qué se aplica, qué choca, la huella, cómo quedaría) es puro y vive en
 * lib/timeline/borrador.ts. Acá solo vive lo que es de ESTA pantalla:
 *   · la FOTO contra la que se convirtió el formato viejo: la del cronograma cuando llegó la
 *     propuesta. Lo que el CSE edite después choca y queda fuera; la foto viaja al aplicar para que
 *     el servidor arme el MISMO borrador;
 *   · lo DESMARCADO (en memoria de la pantalla: viaja como `sin`, nunca se guarda en el servidor);
 *   · la VISTA («Ver la propuesta» / «Ver como estaba antes») y el lugar del scroll al alternar:
 *     el mismo Gantt, sin desmontarse (las fases abiertas siguen abiertas), y la fila que se estaba
 *     mirando vuelve a quedar donde estaba, debajo de la barra fija.
 *
 * ⭐ La foto y lo desmarcado SOBREVIVEN AL REMONTE (revisión de E1, 2026-09-24): el cronograma se
 * desmonta al cambiar de canvas y se remonta al terminar «Chequear avance», y recargar empieza de
 * cero. Con la foto solo en el estado del componente, volver tomaba una foto del cronograma YA
 * editado y una edición a mano pasaba de ⚠ a «aplica». Ahora se recuerdan por proyecto, atadas a la
 * identidad de la propuesta (token + contenido): en un Map del módulo (cambiar de canvas) y en
 * `localStorage` (recargar o volver otro día). Otro navegador toma una foto nueva: el límite del
 * formato viejo, que resuelve E2 guardando el `desde` al crear la propuesta.
 * Una propuesta distinta (otro token u otro contenido) arranca con su propia foto.
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
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import { claveDeDesfasadas } from "@/lib/timeline/recalculo-de-tareas";
import {
  almacenEnMemoria,
  alternarVista,
  claveDeRevision,
  debeDescartarseSolo,
  leerBorrador,
  marcarCambios,
  olvidarRevision,
  planDeAplicacion,
  recordarRevision,
  recuerdoDeLaRevision,
  resumir,
  revisionPara,
  REVISION_VACIA,
  versionDelBorrador,
  type AlmacenDeFotos,
  type Borrador,
  type EstadoDeLasTareas,
  type EstadoDeRevision,
  type FaseDesfasada,
  type Proyeccion,
  type RecuerdoDeLaRevision,
  type ResumenDelBorrador,
  type VistaDelBorrador,
  type Vivo,
} from "@/lib/timeline/borrador";

// ── DÓNDE SE RECUERDA LA FOTO ────────────────────────────────────────────────────────────────
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
  /** El borrador leído (formato viejo convertido contra la foto, o el nuevo), o null. */
  borrador: Borrador | null;
  /** Lo que pinta la barra. null también con un borrador SIN cambios (un v1 recién marcado
   *  «armando»): la barra no se monta vacía. */
  resumen: ResumenDelBorrador | null;
  /** Cómo quedaría el cronograma con lo marcado: la vista «Ver la propuesta» (sale del resumen). */
  proyeccion: Proyeccion | null;
  vista: VistaDelBorrador;
  sin: ReadonlySet<string>;
  /** La foto que viaja al aplicar. */
  foto: Vivo | null;
  /** La versión del `borrador-v1` que se está viendo (viaja al aplicar), o null (formato viejo). */
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
  /** E2c: cuántas casillas tocó el CSE (solo `marcar` y `marcarVarios`). Arranca la espera del recálculo. */
  marcasDelCse: number;
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
  /** Lo guardado en `pendingProposal` (o null si no es un borrador: la del modificador no lo es). */
  propuesta: unknown;
  /** La corrida que dejó la propuesta (`pendingProposalRunId`): parte de su identidad. */
  token: string | null;
  /** El cronograma de la pantalla (solo fases y tareas guardadas), memoizado por quien llama. */
  vivo: Vivo;
  /** El estado de las tareas del borrador, como lo calculó el servidor (GET del cronograma), o null
   *  si no espera tareas. */
  tareas: EstadoDeLasTareas | null;
}): BorradorEnPantalla {
  const { projectId, propuesta, token, vivo, tareas } = entrada;
  const clave = useMemo(() => claveDeRevision(propuesta, token), [propuesta, token]);
  const [revision, setRevision] = useState<EstadoDeRevision>(REVISION_VACIA);
  const [marcasDelCse, setMarcasDelCse] = useState(0);
  const [forzadasGuardadas, setForzadas] = useState<readonly string[]>(SIN_FORZAR);
  /* Una propuesta distinta: se ajusta el estado EN EL RENDER (el patrón de React para «cuando cambia
     una prop»), no en un efecto — un efecto pintaría primero la propuesta nueva con la foto vieja.
     La foto es la RECORDADA de esa misma propuesta, si la hay; si no, la de ahora. Las fases forzadas
     eran de la otra propuesta: se sueltan (E2c). */
  let actual = revision;
  let forzadas = forzadasGuardadas;
  if (revision.clave !== clave) {
    actual = revisionPara(clave, vivo, clave ? recordado(projectId, clave) : null);
    setRevision(actual);
    forzadas = SIN_FORZAR;
    if (forzadasGuardadas !== SIN_FORZAR) setForzadas(SIN_FORZAR);
  }

  // Se recuerda la foto y lo desmarcado de ESTA propuesta: el próximo montaje los encuentra.
  useEffect(() => {
    if (!actual.clave || !actual.base) return;
    const recuerdo = { foto: actual.base, sin: [...actual.sin] };
    for (const a of almacenes()) recordarRevision(a, projectId, actual.clave, recuerdo);
  }, [projectId, actual.clave, actual.base, actual.sin]);

  const olvidar = useCallback(() => {
    for (const a of almacenes()) olvidarRevision(a, projectId);
  }, [projectId]);

  const borrador = useMemo(
    () => (actual.base ? leerBorrador(propuesta, actual.base) : null),
    [propuesta, actual.base],
  );
  /* La barra solo con cambios: un v1 vacío (marcado «armando», todavía sin fases ni tareas) no monta
     una barra en blanco. La proyección sale del resumen: una evaluación del plan menos por render. */
  const resumen = useMemo(
    () => (borrador && borrador.cambios.length > 0 ? resumir(vivo, borrador, actual.sin, { tareas, forzar: forzadas }) : null),
    [vivo, borrador, actual.sin, tareas, forzadas],
  );
  const proyeccion = resumen?.proyeccion ?? null;
  /* «Nada que decidir» sale del PLAN aunque no haya cambios: `debeDescartarseSolo` sabe que uno
     vacío que espera tareas («faltan», «armando») no se descarta, y uno vacío cuya corrida falló sí. */
  const nadaQueDecidir = useMemo(() => {
    if (!borrador) return false;
    if (resumen) return debeDescartarseSolo(resumen);
    return debeDescartarseSolo(planDeAplicacion(vivo, borrador, actual.sin, { tareas, forzar: forzadas }));
  }, [borrador, resumen, vivo, actual.sin, tareas, forzadas]);
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

  /* Solo estas dos son casillas del CSE: cada una suma una marca (E2c: arranca la espera del recálculo). */
  const marcar = useCallback((c: string, incluir: boolean) => {
    setRevision((r) => marcarCambios(r, [c], incluir));
    setMarcasDelCse((n) => n + 1);
  }, []);
  const marcarVarios = useCallback((claves: readonly string[], incluir: boolean) => {
    setRevision((r) => marcarCambios(r, claves, incluir));
    setMarcasDelCse((n) => n + 1);
  }, []);
  const forzar = useCallback((fases: readonly string[]) => setForzadas(fases.length > 0 ? [...fases] : SIN_FORZAR), []);

  return {
    borrador,
    resumen,
    proyeccion,
    vista: actual.vista,
    sin: actual.sin,
    foto: actual.base,
    version,
    nadaQueDecidir,
    alternar,
    marcar,
    marcarVarios,
    olvidar,
    marcasDelCse,
    forzadas,
    forzar,
    desfasadas,
    claveDeDesfasadas: clavePorDesfasadas,
    contenedorRef,
    barraRef,
  };
}
