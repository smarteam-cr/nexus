"use client";

/**
 * components/documentacion/comentarios/ContextoDeComentarios.tsx — los comentarios de UNA página.
 *
 * Es el dueño de todo lo que comparten las piezas de comentarios: los hilos (vienen del almacén),
 * quién soy y si puedo resolver (los decide el SERVIDOR y bajan como props, sin valor por defecto),
 * el editor y el contenedor sobre los que se ubican los globos, y qué está abierto: el borrador de
 * un comentario nuevo, el globo de un hilo o el panel.
 *
 * Después de cada cambio se recargan los hilos y se hace `router.refresh()`: los contadores del
 * árbol los pinta el servidor, y así no quedan dos verdades.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { BlockNoteEditor } from "@blocknote/core";
import { useToast } from "@/components/ui";
import type { Autor, HiloVisto } from "@/lib/documentacion/comentarios";
import { almacenDeLaApi, type AlmacenDeComentarios } from "./almacen";
import { ExtensionDeComentarios, anclaDesdeRango, ubicar, type AnclaDeHilo } from "./extension";

/** Lo que las piezas de comentarios usan del editor. No depende del esquema de bloques. */
export type EditorConComentarios = Pick<
  BlockNoteEditor,
  "prosemirrorState" | "prosemirrorView" | "domElement" | "isEditable" | "getExtension"
>;

/** Dónde va un globo, relativo al contenedor de la página. */
export interface Posicion {
  top: number;
  left: number;
}

export const ANCHO_DE_GLOBO = 320;

/** Un globo debajo de un rectángulo de la pantalla, sin salirse del contenedor. */
export function posicionBajo(rect: DOMRect, base: DOMRect): Posicion {
  const left = Math.max(8, Math.min(rect.left - base.left, base.width - ANCHO_DE_GLOBO - 8));
  return { top: rect.bottom - base.top + 6, left };
}

export type AnclaNueva = Omit<AnclaDeHilo, "id">;

interface Borrador {
  ancla: AnclaNueva;
  posicion: Posicion;
}

interface Flotante {
  hiloIds: string[];
  posicion: Posicion;
}

interface Valor {
  yo: Autor;
  puedeResolver: boolean;
  hilos: HiloVisto[];
  abiertos: HiloVisto[];
  /** Por qué no se pudieron cargar los hilos de la página, o `null` si se cargaron. */
  errorDeCarga: string | null;
  /** Hilos cuyo texto ya no está en la página (los calcula la capa sobre el editor). */
  sinUbicar: ReadonlySet<string>;
  editor: EditorConComentarios | null;
  contenedor: HTMLElement | null;
  borrador: Borrador | null;
  flotante: Flotante | null;
  panel: { abierto: boolean; hiloId: string | null };

  registrarEditor: (editor: EditorConComentarios | null) => void;
  registrarContenedor: (el: HTMLElement | null) => void;
  informarSinUbicar: (ids: string[]) => void;

  comentarRango: (desde: number, hasta: number) => void;
  comentarBloque: (bloqueId: string, rect: DOMRect) => void;
  descartarBorrador: () => void;
  abrirFlotante: (hiloIds: string[], posicion: Posicion) => void;
  cerrarFlotante: () => void;
  abrirPanel: (hiloId?: string) => void;
  cerrarPanel: () => void;
  irAlTexto: (hiloId: string) => void;

  crear: (cuerpo: string) => Promise<boolean>;
  responder: (hiloId: string, cuerpo: string) => Promise<boolean>;
  resolver: (hiloId: string, resuelto: boolean) => Promise<boolean>;
  editar: (hiloId: string, comentarioId: string, cuerpo: string) => Promise<boolean>;
  borrar: (hiloId: string, comentarioId: string) => Promise<boolean>;
}

const Contexto = createContext<Valor | null>(null);

export function useComentarios(): Valor {
  const valor = useContext(Contexto);
  if (!valor) throw new Error("useComentarios va adentro de <ProveedorDeComentarios>.");
  return valor;
}

/** El ancla de un hilo, para ubicarlo. */
export function anclaDe(h: HiloVisto): AnclaDeHilo {
  return { id: h.id, bloqueId: h.bloqueId, cita: h.cita, antes: h.antes, despues: h.despues };
}

export function ProveedorDeComentarios({
  paginaId,
  yo,
  puedeResolver,
  almacen = almacenDeLaApi,
  children,
}: {
  paginaId: string;
  yo: Autor;
  puedeResolver: boolean;
  /** Solo la página de prueba local lo cambia: el resto habla con la API. */
  almacen?: AlmacenDeComentarios;
  children: ReactNode;
}) {
  const router = useRouter();
  const toast = useToast();
  const [hilos, setHilos] = useState<HiloVisto[]>([]);
  const [errorDeCarga, setErrorDeCarga] = useState<string | null>(null);
  const [sinUbicar, setSinUbicar] = useState<ReadonlySet<string>>(new Set());
  const [editor, setEditor] = useState<EditorConComentarios | null>(null);
  const [contenedor, setContenedor] = useState<HTMLElement | null>(null);
  const [borrador, setBorrador] = useState<Borrador | null>(null);
  const [flotante, setFlotante] = useState<Flotante | null>(null);
  const [panel, setPanel] = useState<{ abierto: boolean; hiloId: string | null }>({
    abierto: false,
    hiloId: null,
  });
  const abrioDelEnlace = useRef(false);

  /** Después de un cambio: los hilos de nuevo (el error lo avisa quien corre el cambio). */
  const recargar = useCallback(async () => {
    setHilos(await almacen.listar(paginaId));
  }, [almacen, paginaId]);

  /* La carga al abrir la página. El estado se escribe cuando llega la respuesta, no en el cuerpo
     del efecto. Un enlace a un hilo (`?hilo=<id>`, lo arma la lista de toda la base) abre el panel
     con ese hilo desplegado, una sola vez: responder después no lo vuelve a abrir. */
  useEffect(() => {
    let vigente = true;
    almacen
      .listar(paginaId)
      .then((lista) => {
        if (!vigente) return;
        setHilos(lista);
        setErrorDeCarga(null);
        if (abrioDelEnlace.current) return;
        abrioDelEnlace.current = true;
        const id = new URLSearchParams(window.location.search).get("hilo");
        if (id && lista.some((h) => h.id === id)) setPanel({ abierto: true, hiloId: id });
      })
      /* Sin aviso emergente: una carga que falla (por ejemplo, la base todavía sin las tablas de
         comentarios) saltaba en CADA página que se abría, sobre una página que funciona. Queda
         en la consola y el panel lo explica; lo que falla al comentar, responder o resolver sí
         avisa, porque ahí la persona está esperando una respuesta. */
      .catch((e: unknown) => {
        if (!vigente) return;
        console.warn("[comentarios] no se pudieron cargar los de esta página", e);
        setErrorDeCarga(e instanceof Error ? e.message : "No se pudieron cargar los comentarios.");
      });
    return () => {
      vigente = false;
    };
  }, [almacen, paginaId]);

  /** Corre un cambio, avisa si falla, y deja todo al día (hilos y contadores del árbol). */
  const correr = useCallback(
    async (accion: () => Promise<unknown>) => {
      try {
        await accion();
        await recargar();
        router.refresh();
        return true;
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "No se pudo completar la acción.");
        return false;
      }
    },
    [recargar, router, toast],
  );

  const informarSinUbicar = useCallback((ids: string[]) => {
    setSinUbicar((previo) => {
      const iguales = previo.size === ids.length && ids.every((id) => previo.has(id));
      return iguales ? previo : new Set(ids);
    });
  }, []);

  const empezar = useCallback(
    (ancla: AnclaNueva, rect: DOMRect) => {
      if (!contenedor) return;
      setFlotante(null);
      setBorrador({ ancla, posicion: posicionBajo(rect, contenedor.getBoundingClientRect()) });
    },
    [contenedor],
  );

  const comentarRango = useCallback(
    (desde: number, hasta: number) => {
      if (!editor || desde === hasta) return;
      const ancla = anclaDesdeRango(editor.prosemirrorState.doc, desde, hasta);
      if (!ancla) return;
      const fin = editor.prosemirrorView.coordsAtPos(hasta);
      const inicio = editor.prosemirrorView.coordsAtPos(desde);
      empezar(ancla, new DOMRect(inicio.left, fin.top, 0, fin.bottom - fin.top));
    },
    [editor, empezar],
  );

  const comentarBloque = useCallback(
    (bloqueId: string, rect: DOMRect) => empezar({ bloqueId, cita: "", antes: "", despues: "" }, rect),
    [empezar],
  );

  const irAlTexto = useCallback(
    (hiloId: string) => {
      const hilo = hilos.find((h) => h.id === hiloId);
      const dom = editor?.domElement;
      if (!hilo || !editor || !dom || !contenedor) return;
      setPanel({ abierto: false, hiloId: null });
      const u = ubicar(editor.prosemirrorState.doc, anclaDe(hilo));
      if (!u) return;
      // El elemento más preciso que haya: el texto resaltado, o el bloque.
      const resaltado = dom.querySelector(`[data-hilo-id="${CSS.escape(hiloId)}"]`);
      const nodo = editor.prosemirrorView.domAtPos(u.tipo === "texto" ? u.desde : u.desde + 1).node;
      const elemento = resaltado ?? (nodo instanceof Element ? nodo : nodo.parentElement);
      if (!elemento) return;
      elemento.scrollIntoView({ block: "center", behavior: "smooth" });
      // El globo se ubica cuando termina el desplazamiento.
      window.setTimeout(() => {
        setFlotante({
          hiloIds: [hiloId],
          posicion: posicionBajo(elemento.getBoundingClientRect(), contenedor.getBoundingClientRect()),
        });
      }, 450);
    },
    [contenedor, editor, hilos],
  );

  const valor = useMemo<Valor>(
    () => ({
      yo,
      puedeResolver,
      hilos,
      abiertos: hilos.filter((h) => !h.resueltoAt),
      errorDeCarga,
      sinUbicar,
      editor,
      contenedor,
      borrador,
      flotante,
      panel,
      registrarEditor: setEditor,
      registrarContenedor: setContenedor,
      informarSinUbicar,
      comentarRango,
      comentarBloque,
      descartarBorrador: () => setBorrador(null),
      abrirFlotante: (hiloIds, posicion) => {
        setBorrador(null);
        setFlotante({ hiloIds, posicion });
      },
      cerrarFlotante: () => setFlotante(null),
      abrirPanel: (hiloId) => setPanel({ abierto: true, hiloId: hiloId ?? null }),
      cerrarPanel: () => setPanel({ abierto: false, hiloId: null }),
      irAlTexto,
      crear: async (cuerpo) => {
        if (!borrador) return false;
        let creado: HiloVisto | null = null;
        const ok = await correr(async () => {
          creado = await almacen.crear(paginaId, { ...borrador.ancla, cuerpo });
        });
        if (ok && creado) {
          const { posicion } = borrador;
          setBorrador(null);
          setFlotante({ hiloIds: [(creado as HiloVisto).id], posicion });
        }
        return ok;
      },
      responder: (hiloId, cuerpo) => correr(() => almacen.responder(hiloId, cuerpo)),
      resolver: (hiloId, resuelto) =>
        correr(async () => {
          await almacen.resolver(hiloId, resuelto);
          toast.success(resuelto ? "Comentario resuelto." : "Comentario reabierto.");
        }),
      editar: (hiloId, comentarioId, cuerpo) => correr(() => almacen.editar(hiloId, comentarioId, cuerpo)),
      borrar: (hiloId, comentarioId) => correr(() => almacen.borrar(hiloId, comentarioId)),
    }),
    [
      almacen,
      borrador,
      comentarBloque,
      comentarRango,
      contenedor,
      correr,
      editor,
      errorDeCarga,
      flotante,
      hilos,
      informarSinUbicar,
      irAlTexto,
      paginaId,
      panel,
      puedeResolver,
      sinUbicar,
      toast,
      yo,
    ],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/** El resaltado del editor, al día con los hilos abiertos y el globo que está a la vista. */
export function useSincronizarResaltado() {
  const { editor, abiertos, flotante } = useComentarios();
  useEffect(() => {
    const extension = editor?.getExtension(ExtensionDeComentarios);
    if (!extension) return;
    extension.store.setState({
      anclas: abiertos.map(anclaDe),
      activo: flotante?.hiloIds[0] ?? null,
    });
  }, [editor, abiertos, flotante]);
}
