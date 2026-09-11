"use client";

/**
 * components/documentacion/EditorDePagina.tsx — el editor de bloques de una página (BlockNote).
 *
 * Se carga PEREZOSO y solo en el cliente (lo importa `PaginaCliente` con `ssr: false`): BlockNote
 * trabaja sobre el DOM, pesa, y ninguna otra pantalla de la app lo necesita.
 *
 * ── LO QUE SE RESUELVE ACÁ Y NO EN OTRO LADO ─────────────────────────────────
 *   · El TEMA: `theme` sale de `useTheme()` y los colores de `editor.css`, atados a los tokens.
 *   · El IDIOMA: el diccionario `es` de BlockNote (menú «/», barra de formato, textos de ayuda).
 *   · El ESQUEMA: `esquema-editor.ts` (sin bloques de archivo, con el aviso y el bloque vivo).
 *   · El MENÚ «/»: los de fábrica más los dos propios. Se apaga el de fábrica (`slashMenu={false}`)
 *     y se monta el controlador a mano; es la única forma de sumarle ítems.
 *
 * ⚠ `traerItems` va MEMOIZADO. El controlador registra el disparador «/» en un efecto atado a esa
 * función: una nueva en cada render lo des-registra y lo vuelve a registrar sin parar, y el menú
 * puede no estar registrado justo cuando alguien escribe «/».
 *
 * `contenidoInicial` se lee UNA vez, al crear el editor. Para mostrar otra página, el padre lo
 * remonta con `key`: así no se mezclan los historiales de deshacer de dos páginas distintas.
 */
import "@blocknote/core/style.css";
import "@blocknote/react/style.css";
import "@blocknote/mantine/style.css";
import "./editor.css";
import { useCallback } from "react";
import { filterSuggestionItems } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { useTheme } from "@/lib/theme";
import { FUENTES_VIVAS } from "@/lib/documentacion/tipos";
import { TONOS_DE_AVISO } from "./bloques/Aviso";
import { ETIQUETAS_DE_FUENTE } from "./bloques/Vivo";
import {
  esquemaDeDocumentacion,
  type BloqueDeDocumentacion,
  type BloqueParcialDeDocumentacion,
} from "./esquema-editor";

const NOMBRE_DEL_TONO: Record<string, string> = {
  info: "Aviso · dato útil",
  advertencia: "Aviso · ojo con esto",
  exito: "Aviso · así está bien",
  peligro: "Aviso · no hacer",
};

export interface EditorDePaginaProps {
  /** Los bloques guardados. Vacío = página nueva (BlockNote arranca con un párrafo en blanco). */
  contenidoInicial: BloqueParcialDeDocumentacion[];
  /** Falso = solo lectura (sin permiso de edición, o página bloqueada). */
  editable: boolean;
  /** Se llama con el documento entero en cada cambio. */
  onCambio?: (documento: BloqueDeDocumentacion[]) => void;
}

export default function EditorDePagina({ contenidoInicial, editable, onCambio }: EditorDePaginaProps) {
  const { isDark } = useTheme();
  const editor = useCreateBlockNote({
    schema: esquemaDeDocumentacion,
    dictionary: es,
    // BlockNote rechaza un arreglo vacío: sin contenido, que arranque con su párrafo en blanco.
    initialContent: contenidoInicial.length > 0 ? contenidoInicial : undefined,
  });

  const traerItems = useCallback(
    async (consulta: string) => {
      const insertar = (bloque: BloqueParcialDeDocumentacion) => {
        editor.insertBlocks([bloque], editor.getTextCursorPosition().block, "after");
      };
      const propios = [
        ...TONOS_DE_AVISO.map((tono) => ({
          title: NOMBRE_DEL_TONO[tono] ?? `Aviso · ${tono}`,
          group: "Avisos",
          subtext: "Un recuadro de color para lo que no se puede pasar por alto.",
          onItemClick: () => insertar({ type: "aviso", props: { tono }, content: "" }),
        })),
        ...FUENTES_VIVAS.map((fuente) => ({
          title: ETIQUETAS_DE_FUENTE[fuente],
          group: "Se arma solo",
          subtext: "Sale de Nexus y se actualiza solo: no se escribe a mano.",
          onItemClick: () => insertar({ type: "vivo", props: { fuente } }),
        })),
      ];
      return filterSuggestionItems(
        [...getDefaultReactSlashMenuItems(editor), ...propios],
        consulta,
      );
    },
    [editor],
  );

  return (
    <BlockNoteView
      editor={editor}
      editable={editable}
      theme={isDark ? "dark" : "light"}
      slashMenu={false}
      onChange={onCambio ? () => onCambio(editor.document) : undefined}
    >
      <SuggestionMenuController triggerCharacter="/" getItems={traerItems} />
    </BlockNoteView>
  );
}
