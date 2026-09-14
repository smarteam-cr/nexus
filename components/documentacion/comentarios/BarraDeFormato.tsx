"use client";

/**
 * components/documentacion/comentarios/BarraDeFormato.tsx — la barra que aparece al marcar texto,
 * con los botones de fábrica y «Comentar» al final, como en Notion.
 *
 * Solo en EDICIÓN. En solo lectura los botones de fábrica no aplican, y el «Comentar» lo pinta
 * `CapaDeComentarios` sobre la selección: así no depende de si BlockNote muestra esta barra en una
 * página que no se edita.
 */
import { FormattingToolbarExtension } from "@blocknote/core/extensions";
import {
  FormattingToolbar,
  getFormattingToolbarItems,
  useBlockNoteEditor,
  useComponentsContext,
  useExtension,
  type FormattingToolbarProps,
} from "@blocknote/react";
import { IconoComentario } from "../iconos";
import { useComentarios } from "./ContextoDeComentarios";

export default function BarraDeFormato(props: FormattingToolbarProps) {
  const editor = useBlockNoteEditor();
  const Components = useComponentsContext();
  const barra = useExtension(FormattingToolbarExtension);
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
          /* Primero se cierra la barra y en la vuelta siguiente se abre el compositor. La barra
             (Mantine) retiene el foco adentro mientras está abierta: si el compositor se abría con
             ella visible, la caja de texto tomaba el foco y la barra se lo quitaba (quedaba en
             «Párrafo»). */
          barra.store.setState(false);
          window.setTimeout(() => comentarRango(from, to), 0);
        }}
      />
    </FormattingToolbar>
  );
}
