/**
 * components/documentacion/comentarios/extension.ts — el texto comentado, resaltado en el editor.
 *
 * ⚠ El resaltado es una DECORACIÓN, no una marca en el documento. BlockNote descarta su propia marca
 * de comentario al pasar la página a JSON (`blocknoteIgnore`), y Nexus guarda JSON: una marca se
 * perdería al guardar, y además exigiría permiso de edición para comentar. Una decoración no es
 * parte del documento: no entra al JSON, no dispara el guardado, no crea un paso de Ctrl+Z y
 * funciona igual en una página de solo lectura.
 *
 * Cómo se vuelve a encontrar lo comentado (`ubicar`):
 *   1. el bloque por su id, y adentro la cita (con su contexto antes y después);
 *   2. si el bloque ya no está o cambió su texto, la cita en TODA la página;
 *   3. si tampoco, el hilo queda «sin ubicar» (el panel lo muestra con su cita).
 * Un hilo sin cita es del bloque entero.
 *
 * El texto de un bloque se lee con un carácter por posición (las menciones y los saltos cuentan
 * como `HOJA`), así el índice de la cita es la distancia desde el inicio del bloque.
 */
import {
  createExtension,
  createStore,
  getBlockInfo,
  getNearestBlockPos,
  getNodeById,
} from "@blocknote/core";
import { Plugin, PluginKey, type EditorState } from "prosemirror-state";
import { Decoration, DecorationSet } from "prosemirror-view";
import { buscarCita, contextoDe } from "@/lib/documentacion/comentarios";

type Doc = EditorState["doc"];
type InfoDeBloque = ReturnType<typeof getBlockInfo>;

/** Lo que cuenta como un carácter en el lugar de algo que no es texto (una mención, un salto). */
export const HOJA = "￼";

/** La cita que se guarda nunca pasa de esto (lo acota también la API). */
const LARGO_MAXIMO_DE_CITA = 500;

export interface AnclaDeHilo {
  id: string;
  bloqueId: string;
  cita: string;
  antes: string;
  despues: string;
}

export type Ubicacion =
  | { tipo: "texto"; desde: number; hasta: number }
  | { tipo: "bloque"; desde: number; hasta: number };

/** El texto del contenido de un bloque y dónde empieza. `null` si el bloque no tiene texto (tabla, vivo). */
function textoDelBloque(doc: Doc, info: InfoDeBloque): { inicio: number; texto: string } | null {
  if (!info.isBlockContainer || !info.blockContent.node.inlineContent) return null;
  const inicio = info.blockContent.beforePos + 1;
  const fin = info.blockContent.afterPos - 1;
  return { inicio, texto: doc.textBetween(inicio, fin, undefined, HOJA) };
}

function citaEnBloque(doc: Doc, info: InfoDeBloque, ancla: AnclaDeHilo): Ubicacion | null {
  const bloque = textoDelBloque(doc, info);
  if (!bloque) return null;
  const i = buscarCita(bloque.texto, ancla);
  if (i < 0) return null;
  return { tipo: "texto", desde: bloque.inicio + i, hasta: bloque.inicio + i + ancla.cita.length };
}

/** Dónde está hoy lo que se comentó, o `null` si ya no está en la página. */
export function ubicar(doc: Doc, ancla: AnclaDeHilo): Ubicacion | null {
  const hallado = getNodeById(ancla.bloqueId, doc);
  if (hallado) {
    const info = getBlockInfo(hallado);
    if (!ancla.cita) return { tipo: "bloque", desde: info.bnBlock.beforePos, hasta: info.bnBlock.afterPos };
    const enSuBloque = citaEnBloque(doc, info, ancla);
    if (enSuBloque) return enSuBloque;
  }
  if (!ancla.cita) return null;

  // El bloque cambió (una siembra, una versión restaurada, alguien lo editó): la cita en toda la página.
  let encontrada: Ubicacion | null = null;
  doc.descendants((node, pos) => {
    if (encontrada) return false;
    if (node.type.name !== "blockContainer") return true;
    encontrada = citaEnBloque(doc, getBlockInfo({ posBeforeNode: pos, node }), ancla);
    return !encontrada;
  });
  return encontrada;
}

/** El id del bloque de BlockNote (el nodo que lo tiene es `bnBlock`). */
function idDelBloque(info: InfoDeBloque): string {
  return String(info.bnBlock.node.attrs.id ?? "");
}

/**
 * El ancla de un pedazo marcado: el bloque donde EMPIEZA la selección y el texto marcado dentro de
 * él (una selección que cruza bloques se corta al final del primero). En un bloque sin texto, el
 * ancla es el bloque entero.
 */
export function anclaDesdeRango(doc: Doc, desde: number, hasta: number): Omit<AnclaDeHilo, "id"> | null {
  const info = getBlockInfo(getNearestBlockPos(doc, desde));
  const bloqueId = idDelBloque(info);
  if (!bloqueId) return null;
  const bloque = textoDelBloque(doc, info);
  if (!bloque) return { bloqueId, cita: "", antes: "", despues: "" };

  const a = Math.max(0, desde - bloque.inicio);
  const b = Math.min(bloque.texto.length, hasta - bloque.inicio, a + LARGO_MAXIMO_DE_CITA);
  if (b <= a) return { bloqueId, cita: "", antes: "", despues: "" };
  return { bloqueId, cita: bloque.texto.slice(a, b), ...contextoDe(bloque.texto, a, b) };
}

/** Cómo se muestra una cita: los marcadores de menciones y saltos, como «…». */
export function citaParaMostrar(cita: string): string {
  return cita.split(HOJA).join("…");
}

export interface EstadoDeResaltado {
  /** Los hilos ABIERTOS de la página: los resueltos no se resaltan. */
  anclas: AnclaDeHilo[];
  /** El hilo que está abierto en pantalla: se resalta más fuerte. */
  activo: string | null;
}

const CLAVE = new PluginKey<DecorationSet>("nx-comentarios");

/**
 * La extensión del editor. Recibe las anclas por su `store` (lo llena el contexto de comentarios)
 * y vuelve a pintar cuando cambian o cuando cambia el documento. El repintado viaja en una
 * transacción SIN pasos: no entra al historial de deshacer ni dispara el guardado.
 */
export const ExtensionDeComentarios = createExtension(({ editor }) => {
  const store = createStore<EstadoDeResaltado>(
    { anclas: [], activo: null },
    { onUpdate: () => editor.transact((tr) => tr.setMeta(CLAVE, true)) },
  );

  const pintar = (doc: Doc): DecorationSet => {
    const { anclas, activo } = store.state;
    const decoraciones: Decoration[] = [];
    for (const ancla of anclas) {
      const u = ubicar(doc, ancla);
      if (!u) continue;
      const activa = ancla.id === activo;
      if (u.tipo === "texto") {
        decoraciones.push(
          Decoration.inline(u.desde, u.hasta, {
            class: activa ? "nx-comentario nx-comentario-activo" : "nx-comentario",
            "data-hilo-id": ancla.id,
          }),
        );
      } else {
        decoraciones.push(
          Decoration.node(u.desde, u.hasta, {
            class: activa ? "nx-comentario-bloque nx-comentario-activo" : "nx-comentario-bloque",
          }),
        );
      }
    }
    return DecorationSet.create(doc, decoraciones);
  };

  return {
    key: "nxComentarios",
    store,
    prosemirrorPlugins: [
      new Plugin<DecorationSet>({
        key: CLAVE,
        state: {
          init: (_config, estado) => pintar(estado.doc),
          apply: (tr, previo, _antes, estado) =>
            tr.docChanged || tr.getMeta(CLAVE) ? pintar(estado.doc) : previo,
        },
        props: {
          decorations: (estado) => CLAVE.getState(estado),
        },
      }),
    ],
  } as const;
});
