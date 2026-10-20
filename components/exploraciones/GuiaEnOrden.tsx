"use client";

/**
 * GuiaEnOrden — las preguntas de la guía en «En orden», que se arrastran para ponerlas en el orden en que se van a hacer
 * (CEMACO, 2026-10-20: Liliana quiere llevarlas en su orden). dnd-kit como el resto del repo, con teclado: el asa es un
 * botón (Espacio o Enter la levanta, las flechas la mueven, Espacio o Enter la suelta, Escape cancela). Lo elegido se
 * guarda en la sesión (`ajustesDeLaGuia.orden`, operación «ordenar») y manda en «En vivo», en lo que lee el agente de la
 * reunión y en la numeración del chat (guia.ts › `ordenDeLaConversacion`).
 */
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
} from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { claveDePregunta, ordenAlSoltar } from "@/lib/exploraciones/ajustes-de-la-guia";
import type { PestanaDeSesion, PreguntaParaMostrar } from "@/lib/exploraciones/guia";
import { PreguntaDeLaGuia, useAjustarLaGuia } from "./PreguntaDeLaGuia";

function Asa({ numero, ...props }: { numero: number } & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      title="Arrastra para cambiar el orden"
      aria-label={`Mover la pregunta ${numero}`}
      className="mt-0.5 flex h-[22px] w-4 flex-none cursor-grab touch-none items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
    >
      <svg viewBox="0 0 10 16" className="h-3.5 w-2.5" fill="currentColor" aria-hidden="true">
        <circle cx="2.5" cy="3" r="1.3" />
        <circle cx="7.5" cy="3" r="1.3" />
        <circle cx="2.5" cy="8" r="1.3" />
        <circle cx="7.5" cy="8" r="1.3" />
        <circle cx="2.5" cy="13" r="1.3" />
        <circle cx="7.5" cy="13" r="1.3" />
      </svg>
    </button>
  );
}

function PreguntaQueSeMueve({ p, numero, pestana, editable }: { p: PreguntaParaMostrar; numero: number; pestana: PestanaDeSesion; editable: boolean }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: claveDePregunta(p) });
  return (
    <PreguntaDeLaGuia
      p={p}
      pestana={pestana}
      borde
      editable={editable}
      arrastre={{
        ref: setNodeRef,
        style: { transform: CSS.Translate.toString(transform), transition },
        asa: <Asa numero={numero} {...attributes} {...listeners} />,
        arrastrando: isDragging,
      }}
    />
  );
}

const INSTRUCCIONES: ScreenReaderInstructions = {
  draggable: "Para mover una pregunta, presiona Espacio o Enter. Muévela con las flechas y suéltala con Espacio o Enter. Escape cancela.",
};

/** Lo que oye quien usa un lector de pantalla mientras mueve una pregunta. */
function avisos(numeroDe: (id: string) => number, total: number): Announcements {
  return {
    onDragStart: ({ active }) => `Levantaste la pregunta ${numeroDe(String(active.id))} de ${total}.`,
    onDragOver: ({ active, over }) => (over ? `La pregunta ${numeroDe(String(active.id))} va al lugar ${numeroDe(String(over.id))}.` : "Fuera de la lista."),
    onDragEnd: ({ over }) => (over ? `Soltaste la pregunta en el lugar ${numeroDe(String(over.id))}.` : "La pregunta quedó donde estaba."),
    onDragCancel: () => "Cancelaste: la pregunta quedó donde estaba.",
  };
}

/**
 * Las preguntas en orden. `editable`: la próxima sesión y quien puede cambiarla; con una sola pregunta no hay asa (no hay
 * nada que mover).
 */
export function GuiaEnOrden({ preguntas, pestana, editable }: { preguntas: PreguntaParaMostrar[]; pestana: PestanaDeSesion; editable: boolean }) {
  const ajustar = useAjustarLaGuia(pestana);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const claves = preguntas.map(claveDePregunta);

  // Dos preguntas con la misma clave no se pueden distinguir al moverlas: se muestran sin asa.
  if (!editable || preguntas.length < 2 || new Set(claves).size !== claves.length) {
    return (
      <ol>
        {preguntas.map((p) => (
          <PreguntaDeLaGuia key={p.para} p={p} pestana={pestana} borde editable={editable} />
        ))}
      </ol>
    );
  }

  const alSoltar = (e: DragEndEvent) => {
    const nuevo = ordenAlSoltar(claves, String(e.active.id), e.over ? String(e.over.id) : null);
    if (nuevo) void ajustar({ tipo: "ordenar", claves: nuevo });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={alSoltar}
      accessibility={{ announcements: avisos((id) => claves.indexOf(id) + 1, claves.length), screenReaderInstructions: INSTRUCCIONES }}
    >
      <SortableContext items={claves} strategy={verticalListSortingStrategy}>
        <ol>
          {preguntas.map((p, i) => (
            <PreguntaQueSeMueve key={claves[i]} p={p} numero={i + 1} pestana={pestana} editable={editable} />
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}
