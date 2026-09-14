"use client";

/**
 * components/documentacion/comentarios/CapaDeComentarios.tsx — lo que se pinta SOBRE la página:
 *
 *   · el número de hilos abiertos en el margen derecho de cada bloque que tiene (siempre visible);
 *   · el 💬 que aparece al pasar el mouse por un bloque, para comentar el bloque entero;
 *   · en una página de SOLO LECTURA, el botón «Comentar» sobre el texto marcado (en edición ese
 *     botón vive en la barra de formato, `BarraDeFormato.tsx`);
 *   · el compositor y el globo del hilo.
 *
 * Todo se ubica con coordenadas relativas al contenedor de la página (`.nx-doc`), leídas del propio
 * editor: no depende de si la página es editable, y un clic en el texto resaltado abre su hilo.
 * También avisa qué hilos quedaron «sin ubicar» (su texto ya no está), para el panel.
 */
import { useCallback, useEffect, useState } from "react";
import { getBlockInfo, getNearestBlockPos } from "@blocknote/core";
import { Z } from "@/lib/ui/z";
import { IconoComentario } from "../iconos";
import { anclaDe, posicionBajo, useComentarios, useSincronizarResaltado } from "./ContextoDeComentarios";
import { ubicar } from "./extension";
import Compositor from "./Compositor";
import HiloFlotante from "./HiloFlotante";

interface Marca {
  bloqueId: string;
  top: number;
  hiloIds: string[];
}

/** El elemento del contenido de un bloque (sin sus hijos), por id. */
function contenidoDelBloque(dom: HTMLElement, bloqueId: string): Element | null {
  const exterior = dom.querySelector(`.bn-block-outer[data-id="${CSS.escape(bloqueId)}"]`);
  return exterior?.querySelector("[data-content-type]") ?? null;
}

export default function CapaDeComentarios() {
  const {
    editor,
    contenedor,
    hilos,
    borrador,
    comentarRango,
    comentarBloque,
    abrirFlotante,
    informarSinUbicar,
  } = useComentarios();
  useSincronizarResaltado();

  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [encima, setEncima] = useState<{ bloqueId: string; top: number } | null>(null);
  const [seleccion, setSeleccion] = useState<{ desde: number; hasta: number; top: number; left: number } | null>(null);

  /* ── Los números del margen, y qué quedó sin ubicar ───────────────────────── */
  const recalcular = useCallback(() => {
    const dom = editor?.domElement;
    if (!editor || !dom || !contenedor) return;
    const doc = editor.prosemirrorState.doc;
    const base = contenedor.getBoundingClientRect();
    const porBloque = new Map<string, string[]>();
    const perdidos: string[] = [];

    for (const h of hilos) {
      const u = ubicar(doc, anclaDe(h));
      if (!u) {
        perdidos.push(h.id);
        continue;
      }
      if (h.resueltoAt) continue;
      const info = getBlockInfo(getNearestBlockPos(doc, u.tipo === "texto" ? u.desde : u.desde + 1));
      const bloqueId = String(info.bnBlock.node.attrs.id ?? "");
      if (bloqueId) porBloque.set(bloqueId, [...(porBloque.get(bloqueId) ?? []), h.id]);
    }

    const nuevas: Marca[] = [];
    for (const [bloqueId, hiloIds] of porBloque) {
      const contenido = contenidoDelBloque(dom, bloqueId);
      if (contenido) nuevas.push({ bloqueId, hiloIds, top: contenido.getBoundingClientRect().top - base.top });
    }
    setMarcas(nuevas);
    informarSinUbicar(perdidos);
  }, [contenedor, editor, hilos, informarSinUbicar]);

  useEffect(() => {
    const dom = editor?.domElement;
    if (!dom || !contenedor) return;
    /* Una espera corta junta los cambios seguidos (escribir dispara muchos). Con `setTimeout` y no
       con `requestAnimationFrame`: el navegador pausa los cuadros de una pestaña que no se dibuja, y
       los números y el «sin ubicar» quedaban sin calcular. */
    let espera = window.setTimeout(recalcular, 0);
    const pedir = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(recalcular, 60);
    };
    // Cualquier cambio del texto o del tamaño mueve los bloques.
    const mutaciones = new MutationObserver(pedir);
    mutaciones.observe(dom, { childList: true, subtree: true, characterData: true });
    const tamano = new ResizeObserver(pedir);
    tamano.observe(contenedor);
    return () => {
      window.clearTimeout(espera);
      mutaciones.disconnect();
      tamano.disconnect();
    };
  }, [contenedor, editor, recalcular]);

  /* ── Clic en el texto resaltado → su hilo ─────────────────────────────────── */
  useEffect(() => {
    const dom = editor?.domElement;
    if (!dom || !contenedor) return;
    const alClic = (e: MouseEvent) => {
      const marca = (e.target as Element | null)?.closest?.("[data-hilo-id]");
      const id = marca?.getAttribute("data-hilo-id");
      if (!marca || !id) return;
      abrirFlotante([id], posicionBajo(marca.getBoundingClientRect(), contenedor.getBoundingClientRect()));
    };
    dom.addEventListener("click", alClic);
    return () => dom.removeEventListener("click", alClic);
  }, [abrirFlotante, contenedor, editor]);

  /* ── El 💬 del bloque que está bajo el mouse ──────────────────────────────── */
  useEffect(() => {
    const dom = editor?.domElement;
    if (!dom || !contenedor) return;
    const alMover = (e: MouseEvent) => {
      const exterior = (e.target as Element | null)?.closest?.(".bn-block-outer");
      // En el margen no hay bloque debajo: se queda el último, para poder llegar al botón.
      if (!exterior || !dom.contains(exterior)) return;
      const bloqueId = exterior.getAttribute("data-id");
      const contenido = exterior.querySelector("[data-content-type]");
      if (!bloqueId || !contenido) return;
      const top = contenido.getBoundingClientRect().top - contenedor.getBoundingClientRect().top;
      setEncima((previo) => (previo?.bloqueId === bloqueId && previo.top === top ? previo : { bloqueId, top }));
    };
    const alSalir = () => setEncima(null);
    contenedor.addEventListener("mousemove", alMover);
    contenedor.addEventListener("mouseleave", alSalir);
    return () => {
      contenedor.removeEventListener("mousemove", alMover);
      contenedor.removeEventListener("mouseleave", alSalir);
    };
  }, [contenedor, editor]);

  /* ── Solo lectura: «Comentar» sobre el texto marcado ──────────────────────── */
  useEffect(() => {
    const dom = editor?.domElement;
    if (!editor || !dom || !contenedor) return;
    const alCambiar = () => {
      const sel = window.getSelection();
      if (editor.isEditable || !sel || sel.isCollapsed || sel.rangeCount === 0 || !dom.contains(sel.anchorNode)) {
        setSeleccion(null);
        return;
      }
      try {
        const rango = sel.getRangeAt(0);
        const vista = editor.prosemirrorView;
        const a = vista.posAtDOM(rango.startContainer, rango.startOffset);
        const b = vista.posAtDOM(rango.endContainer, rango.endOffset);
        const r = rango.getBoundingClientRect();
        const base = contenedor.getBoundingClientRect();
        setSeleccion({
          desde: Math.min(a, b),
          hasta: Math.max(a, b),
          top: r.top - base.top - 36,
          left: Math.max(8, Math.min(r.left - base.left + r.width / 2 - 52, base.width - 112)),
        });
      } catch {
        setSeleccion(null);
      }
    };
    document.addEventListener("selectionchange", alCambiar);
    return () => document.removeEventListener("selectionchange", alCambiar);
  }, [contenedor, editor]);

  const conMarca = new Set(marcas.map((m) => m.bloqueId));

  return (
    <>
      {marcas.map((m) => (
        <button
          key={m.bloqueId}
          type="button"
          className="absolute right-1 flex items-center gap-1 rounded-md bg-warn-surface px-1.5 py-0.5 text-2xs font-semibold text-warn-ink transition-colors hover:bg-surface-hover"
          style={{ top: m.top }}
          title={m.hiloIds.length === 1 ? "1 comentario abierto" : `${m.hiloIds.length} comentarios abiertos`}
          aria-label={`Ver ${m.hiloIds.length} comentarios de este bloque`}
          onClick={(e) => {
            if (!contenedor) return;
            abrirFlotante(m.hiloIds, posicionBajo(e.currentTarget.getBoundingClientRect(), contenedor.getBoundingClientRect()));
          }}
        >
          <IconoComentario className="h-3 w-3" />
          {m.hiloIds.length}
        </button>
      ))}

      {encima && !conMarca.has(encima.bloqueId) && !borrador && (
        <button
          type="button"
          className="absolute right-1 rounded-md p-1 text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
          style={{ top: encima.top }}
          aria-label="Comentar este bloque"
          onClick={(e) => comentarBloque(encima.bloqueId, e.currentTarget.getBoundingClientRect())}
        >
          <IconoComentario className="h-4 w-4" />
        </button>
      )}

      {seleccion && !borrador && (
        <button
          type="button"
          className="absolute flex items-center gap-1.5 rounded-lg border border-line bg-surface px-2.5 py-1 text-xs font-medium text-fg shadow-lg transition-colors hover:bg-surface-hover"
          style={{ top: seleccion.top, left: seleccion.left, zIndex: Z.POPOVER }}
          // Sin esto, el clic borra la selección antes de leerla.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            comentarRango(seleccion.desde, seleccion.hasta);
            setSeleccion(null);
          }}
        >
          <IconoComentario className="h-3.5 w-3.5" />
          Comentar
        </button>
      )}

      {borrador && (
        <Compositor key={`${borrador.ancla.bloqueId}:${borrador.posicion.top}:${borrador.posicion.left}`} />
      )}
      <HiloFlotante />
    </>
  );
}
