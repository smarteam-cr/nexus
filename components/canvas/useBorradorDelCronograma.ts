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
 *   · lo DESMARCADO (en memoria: viaja como `sin`);
 *   · la VISTA («Ver la propuesta» / «Ver como estaba antes») y el lugar del scroll al alternar:
 *     el mismo Gantt, sin desmontarse (las fases abiertas siguen abiertas), y la fila que se estaba
 *     mirando vuelve a quedar donde estaba.
 * Una propuesta distinta (otro contenido) arranca de cero: foto nueva, nada desmarcado y «Ver la
 * propuesta».
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  alternarVista,
  claveDeRevision,
  debeDescartarseSolo,
  leerBorrador,
  marcarCambio,
  proyectar,
  resumir,
  revisionPara,
  REVISION_VACIA,
  type Borrador,
  type EstadoDeRevision,
  type Proyeccion,
  type ResumenDelBorrador,
  type VistaDelBorrador,
  type Vivo,
} from "@/lib/timeline/borrador";

interface AnclaDeScroll {
  /** La fila de fase que se estaba mirando (su `data-fase-key`), o null. */
  clave: string | null;
  top: number;
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

/** La primera fila de fase que se ve debajo de la barra fija. */
function medirAncla(contenedor: HTMLElement | null, barra: HTMLElement | null): AnclaDeScroll | null {
  if (!contenedor) return null;
  const tope = barra ? barra.getBoundingClientRect().bottom : 0;
  const topDelContenedor = contenedor.getBoundingClientRect().top;
  for (const fila of contenedor.querySelectorAll<HTMLElement>("[data-fase-key]")) {
    const r = fila.getBoundingClientRect();
    if (r.bottom > tope) return { clave: fila.dataset.faseKey ?? null, top: r.top, topDelContenedor };
  }
  return { clave: null, top: topDelContenedor, topDelContenedor };
}

/** Deja la misma fila en el mismo lugar de la pantalla (o, si en esta vista no existe, el Gantt). */
function restaurarAncla(contenedor: HTMLElement | null, a: AnclaDeScroll): void {
  if (!contenedor) return;
  const fila = a.clave
    ? Array.from(contenedor.querySelectorAll<HTMLElement>("[data-fase-key]")).find((f) => f.dataset.faseKey === a.clave)
    : undefined;
  const delta = fila ? fila.getBoundingClientRect().top - a.top : contenedor.getBoundingClientRect().top - a.topDelContenedor;
  if (Math.abs(delta) < 1) return;
  contenedorConScroll(contenedor).scrollBy({ top: delta });
}

export interface BorradorEnPantalla {
  /** El borrador leído (formato viejo convertido contra la foto, o el nuevo), o null. */
  borrador: Borrador | null;
  resumen: ResumenDelBorrador | null;
  /** Cómo quedaría el cronograma con lo marcado: la vista «Ver la propuesta». */
  proyeccion: Proyeccion | null;
  vista: VistaDelBorrador;
  sin: ReadonlySet<string>;
  /** La foto que viaja al aplicar. */
  foto: Vivo | null;
  /** Todo lo que propone ya está así: no hay nada que decidir (se descarta sola). */
  nadaQueDecidir: boolean;
  alternar: () => void;
  marcar: (clave: string, incluir: boolean) => void;
  /** Envuelve el Gantt: con él se mide y se restaura el lugar del scroll. */
  contenedorRef: RefObject<HTMLDivElement | null>;
  /** La barra fija: lo que queda debajo de ella es lo que se está mirando. */
  barraRef: RefObject<HTMLDivElement | null>;
}

export function useBorradorDelCronograma(entrada: {
  /** Lo guardado en `pendingProposal` (o la propuesta del modificador, que NO es un borrador). */
  propuesta: unknown;
  /** El cronograma de la pantalla (solo fases guardadas), memoizado por quien llama. */
  vivo: Vivo;
}): BorradorEnPantalla {
  const { propuesta, vivo } = entrada;
  /* La identidad es el CONTENIDO: el token (la corrida) vive en un ref de la pantalla y se lee al
     aplicar. Dos propuestas idénticas con otro token son, para quien revisa, la misma. */
  const clave = useMemo(() => claveDeRevision(propuesta, null), [propuesta]);
  const [revision, setRevision] = useState<EstadoDeRevision>(REVISION_VACIA);
  /* Una propuesta distinta: se ajusta el estado EN EL RENDER (el patrón de React para «cuando cambia
     una prop»), no en un efecto — un efecto pintaría primero la propuesta nueva con la foto vieja. */
  if (revision.clave !== clave) setRevision(revisionPara(clave, vivo));
  const actual = revision.clave === clave ? revision : revisionPara(clave, vivo);

  const borrador = useMemo(
    () => (actual.base ? leerBorrador(propuesta, actual.base) : null),
    [propuesta, actual.base],
  );
  const resumen = useMemo(() => (borrador ? resumir(vivo, borrador, actual.sin) : null), [vivo, borrador, actual.sin]);
  const proyeccion = useMemo(
    () => (borrador ? proyectar(vivo, borrador, actual.sin) : null),
    [vivo, borrador, actual.sin],
  );

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
    if (a) restaurarAncla(contenedorRef.current, a);
  }, [actual.vista]);

  const marcar = useCallback((c: string, incluir: boolean) => setRevision((r) => marcarCambio(r, c, incluir)), []);

  return {
    borrador,
    resumen,
    proyeccion,
    vista: actual.vista,
    sin: actual.sin,
    foto: actual.base,
    nadaQueDecidir: resumen ? debeDescartarseSolo(resumen) : false,
    alternar,
    marcar,
    contenedorRef,
    barraRef,
  };
}
