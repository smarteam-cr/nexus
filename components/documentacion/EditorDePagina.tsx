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
 *   · El MENÚ «@»: enlazar a otra página de la base —o CREARLA con ese nombre y enlazarla de una,
 *     como en Notion. Inserta el ID de la página, no su nombre: el título se resuelve al pintar, y
 *     por eso un renombre no deja rastros viejos.
 *
 * ⚠ Los dos `getItems` van MEMOIZADOS. El controlador registra su disparador en un efecto: una
 * función nueva en cada render lo des-registra y lo vuelve a registrar sin parar.
 *
 * `contenidoInicial` se lee UNA vez, al crear el editor. Para mostrar otra página, el padre lo
 * remonta con `key`: así no se mezclan los historiales de deshacer de dos páginas distintas.
 */
import "@blocknote/core/style.css";
import "@blocknote/react/style.css";
import "@blocknote/mantine/style.css";
import "./editor.css";
import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { filterSuggestionItems } from "@blocknote/core";
import { es } from "@blocknote/core/locales";
import {
  SuggestionMenuController,
  getDefaultReactSlashMenuItems,
  useCreateBlockNote,
} from "@blocknote/react";
import { BlockNoteView } from "@blocknote/mantine";
import { fetchJson } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui";
import { useTheme } from "@/lib/theme";
import { COLUMNAS_DE_TARJETAS, FUENTES_VIVAS } from "@/lib/documentacion/tipos";
import { TONOS_DE_AVISO } from "./bloques/Aviso";
import { ETIQUETAS_DE_FUENTE } from "./bloques/Vivo";
import { ETIQUETAS_DE_COLUMNAS } from "./bloques/Tarjetas";
import { usePaginasEnlazables } from "./ContextoDePaginas";
import {
  esquemaDeDocumentacion,
  type BloqueDeDocumentacion,
  type BloqueParcialDeDocumentacion,
} from "./esquema-editor";

/** Una tarjeta lista para escribir: el título en la línea del bloque y el cuerpo como hijo. */
const tarjetaEnBlanco = (): BloqueParcialDeDocumentacion => ({
  type: "tarjeta",
  content: "",
  children: [{ type: "paragraph", content: "" }],
});

const NOMBRE_DEL_TONO: Record<string, string> = {
  info: "Aviso · dato útil",
  advertencia: "Aviso · ojo con esto",
  exito: "Aviso · así está bien",
  peligro: "Aviso · no hacer",
};

export interface EditorDePaginaProps {
  /** La página que se está editando: el «@» crea las subpáginas nuevas adentro de ésta. */
  paginaId: string;
  /** Los bloques guardados. Vacío = página nueva (BlockNote arranca con un párrafo en blanco). */
  contenidoInicial: BloqueParcialDeDocumentacion[];
  /** Falso = solo lectura (sin permiso de edición, o página bloqueada). */
  editable: boolean;
  /** Se llama con el documento entero en cada cambio. */
  onCambio?: (documento: BloqueDeDocumentacion[]) => void;
}

export default function EditorDePagina({
  paginaId,
  contenidoInicial,
  editable,
  onCambio,
}: EditorDePaginaProps) {
  const { isDark } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const { lista: paginas } = usePaginasEnlazables();

  const editor = useCreateBlockNote({
    schema: esquemaDeDocumentacion,
    dictionary: es,
    /* ⚠ Sin los estilos de fábrica. Esa clase hace DOS cosas: fija la tipografía del editor (Inter
       16px, que la app ya define) y —lo importante— resetea `p, h1-h6, li` a `margin:0; padding:0;
       font-size:inherit` para TODO lo que viva adentro. Los bloques vivos meten componentes de la
       app ahí adentro, y ese reset les borraba el tamaño y el aire: el recorrido perdía la sangría
       y el número de la etapa se montaba sobre el título. El reset equivalente lo pone el preflight
       de Tailwind, que sí respeta las clases del componente; el tamaño base se fija en
       `editor.css`. */
    defaultStyles: false,
    // BlockNote rechaza un arreglo vacío: sin contenido, que arranque con su párrafo en blanco.
    initialContent: contenidoInicial.length > 0 ? contenidoInicial : undefined,
  });

  /** El menú «/»: los bloques de fábrica más los dos propios (avisos y los que se arman solos). */
  const traerItems = useCallback(
    async (consulta: string) => {
      /**
       * Inserta el bloque debajo del actual y deja el cursor donde se escribe.
       *
       * ⚠ `cursor` NO es un detalle: el cursor solo puede ir a un bloque que acepte texto. La
       * rejilla de tarjetas y el bloque vivo no aceptan —la rejilla ordena a sus hijas, el vivo se
       * arma solo—, así que en la rejilla el cursor va a su primera tarjeta y en el vivo se queda
       * donde estaba.
       */
      const insertar = (
        bloque: BloqueParcialDeDocumentacion,
        cursor: "propio" | "primera-hija" | "no" = "propio",
      ) => {
        const [insertado] = editor.insertBlocks(
          [bloque],
          editor.getTextCursorPosition().block,
          "after",
        );
        if (cursor === "no" || !insertado) return;
        const destino = cursor === "primera-hija" ? insertado.children?.[0] : insertado;
        if (destino) editor.setTextCursorPosition(destino, "end");
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
          onItemClick: () => insertar({ type: "vivo", props: { fuente } }, "no"),
        })),
        /* La rejilla nace CON dos tarjetas escritas: una rejilla vacía es una zona muerta donde
           no se sabe dónde escribir. Cada tarjeta trae su párrafo de cuerpo ya anidado. */
        ...COLUMNAS_DE_TARJETAS.map((columnas) => ({
          title: ETIQUETAS_DE_COLUMNAS[columnas],
          group: "Tarjetas",
          subtext: "Un grupo de recuadros, uno al lado del otro: título arriba y explicación abajo.",
          onItemClick: () =>
            insertar(
              {
                type: "tarjetas",
                props: { columnas },
                children: [tarjetaEnBlanco(), tarjetaEnBlanco()],
              },
              "primera-hija",
            ),
        })),
        {
          title: "Una tarjeta más",
          group: "Tarjetas",
          subtext: "Se agrega adentro de una rejilla que ya exista.",
          onItemClick: () => insertar(tarjetaEnBlanco()),
        },
      ];
      return filterSuggestionItems(
        [...getDefaultReactSlashMenuItems(editor), ...propios],
        consulta,
      );
    },
    [editor],
  );

  /**
   * El menú «@»: enlazar a una página que ya existe, o CREARLA con ese nombre y enlazarla de una.
   *
   * Lo segundo es lo que hace que escribir no se corte: nombrás algo que todavía no está escrito,
   * la página queda creada en su lugar del árbol y seguís en la frase. Es como funciona Notion.
   */
  const traerPaginas = useCallback(
    async (consulta: string) => {
      const texto = consulta.trim();
      const q = texto.toLowerCase();

      const enlazar = (p: { id: string; slug: string; titulo: string; icono: string | null }) => {
        editor.insertInlineContent([
          {
            type: "mencion",
            props: { paginaId: p.id, slug: p.slug, titulo: p.titulo, icono: p.icono ?? "" },
          },
          " ",
        ]);
      };

      const crearYEnlazar = async (parentId: string | null) => {
        try {
          const r = await fetchJson<{
            pagina: { id: string; slug: string; titulo: string };
          }>("/api/documentacion/paginas", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ titulo: texto, parentId }),
          });
          enlazar({ ...r.pagina, icono: null });
          toast.success(`Página «${r.pagina.titulo}» creada.`);
          router.refresh();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : "No se pudo crear la página.");
        }
      };

      const existentes = paginas
        .filter((p) => !q || p.titulo.toLowerCase().includes(q))
        .slice(0, 20)
        .map((p) => ({
          title: p.titulo,
          group: "Enlazar a una página",
          /* Dónde vive: dos páginas se pueden llamar igual en ramas distintas. */
          subtext: p.ruta.length > 0 ? p.ruta.join(" / ") : "Nivel más alto",
          icon: <span aria-hidden="true">{p.icono ?? "📄"}</span>,
          onItemClick: () => enlazar(p),
        }));

      if (!texto) return existentes;

      return [
        ...existentes,
        {
          title: `Nueva subpágina «${texto}»`,
          group: "Crear",
          subtext: "Se crea adentro de esta página y queda enlazada acá.",
          icon: <span aria-hidden="true">＋</span>,
          onItemClick: () => void crearYEnlazar(paginaId),
        },
        {
          title: `Nueva página «${texto}»`,
          group: "Crear",
          subtext: "Se crea en el nivel más alto del árbol.",
          icon: <span aria-hidden="true">↗</span>,
          onItemClick: () => void crearYEnlazar(null),
        },
      ];
    },
    [editor, paginas, paginaId, router, toast],
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
      <SuggestionMenuController triggerCharacter="@" getItems={traerPaginas} />
    </BlockNoteView>
  );
}
