"use client";

/**
 * components/documentacion/comentarios/BarraDeFormato.tsx — la barra que aparece al marcar texto,
 * con los botones de fábrica y «Comentar» al final, como en Notion.
 *
 * Solo en EDICIÓN. En solo lectura los botones de fábrica no aplican, y el «Comentar» lo pinta
 * `CapaDeComentarios` sobre la selección: así no depende de si BlockNote muestra esta barra en una
 * página que no se edita.
 */
import {
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  type FormattingToolbarProps,
} from "@blocknote/react";
import { IconoComentario } from "../iconos";
import { useComentarios } from "./ContextoDeComentarios";

export default function BarraDeFormato(props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();
  const { comentarRango } = useComentarios();

  if (!editor.isEditable || !Components) return null;

  return (
    <FormattingToolbar {...props}>
      {getFormattingToolbarItems(props.blockTypeSelectItems)}
      <Components.FormattingToolbar.Button
        key="comentar"
        mainTooltip="Comentar"
        label="Comentar"
        icon={<IconoComentario className="h-4 w-4" />}
        onClick={() => {
          const { from, to } = editor.prosemirrorState.selection;
          comentarRango(from, to);
        }}
      />
    </FormattingToolbar>
  );
}
