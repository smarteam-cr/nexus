"use client";

/**
 * components/landing/sortable.tsx
 *
 * Drag & drop GENÉRICO para los ítems internos de una sección (tags, cards,
 * bullets, líneas de inversión…): el vendedor ordena la página para mostrar
 * primero lo más importante. Render-prop: el call-site conserva su markup y
 * coloca el `handle` (⠿, aparece al hover como el ×) dentro de cada ítem.
 *
 *   <SortableItems items={items} disabled={!editable} onReorder={(next) => set({ items: next })}
 *     container={(nodes) => <div className="stl-grid stl-grid-2">{nodes}</div>}>
 *     {(it, i, handle) => (<div className="stl-item stl-card">{handle}…</div>)}
 *   </SortableItems>
 *
 * Los ids son ESTABLES por ítem (lista paralela interna, NO el índice): si el id
 * cambiara con la posición, al soltar dnd-kit animaría el wrapper de vuelta a su
 * slot viejo (React solo intercambia el contenido) → efecto "rebota y se acomoda".
 */
import { Fragment, useRef, type CSSProperties, type ReactNode } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS as DndCss } from "@dnd-kit/utilities";

function SortableItem({
  id,
  style,
  children,
}: {
  id: string;
  style?: CSSProperties;
  children: (handle: ReactNode) => ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const handle = (
    <button
      type="button"
      className="stl-drag-item"
      title="Arrastrá para reordenar"
      aria-label="Reordenar"
      {...attributes}
      {...listeners}
    >
      ⠿
    </button>
  );
  return (
    <div
      ref={setNodeRef}
      style={{
        ...style,
        // Translate SOLO (sin scaleX/scaleY): rectSortingStrategy escala cada wrapper
        // al tamaño del rect destino — con ítems de tamaños distintos (tags anchos,
        // bullets de 2 líneas) el arrastrado se "infla" al pasar sobre uno más grande.
        transform: DndCss.Translate.toString(transform),
        transition,
        position: "relative",
        minWidth: style?.minWidth ?? 0,
        zIndex: isDragging ? 40 : undefined,
        opacity: isDragging ? 0.85 : undefined,
      }}
    >
      {children(handle)}
    </div>
  );
}

export function SortableItems<T>({
  items,
  disabled,
  onReorder,
  container,
  itemStyle,
  children,
}: {
  items: T[];
  /** true = solo lectura (render plano, sin wrappers ni handles). */
  disabled?: boolean;
  onReorder: (next: T[]) => void;
  /** Contenedor del listado (grid/flex/lista) — recibe los nodos ya envueltos. */
  container: (nodes: ReactNode) => ReactNode;
  /** Estilo del div wrapper de cada ítem (p.ej. flex del hijo cuando el
   *  container es flex/grid y el ítem trae siblings como flechas). */
  itemStyle?: CSSProperties;
  /** Render de UN ítem; colocá `handle` dentro del elemento raíz (junto al ×). */
  children: (item: T, index: number, handle: ReactNode) => ReactNode;
}) {
  // Teclado además de mouse: el handle es un botón enfocable (Enter/Space
  // levanta, flechas mueven, Enter suelta) — accesibilidad estándar de dnd-kit.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  // IDs estables por ítem. Los datos no traen id propio (strings/objetos planos,
  // puede haber duplicados), así que se mantiene una lista paralela en un ref:
  // - crece/encoge con `items` (append/trim — idempotente, StrictMode-safe);
  // - en el drop se reordena con el MISMO arrayMove que los datos, así el key/id
  //   viaja con el ítem y dnd-kit anima el drop hacia el slot NUEVO.
  // Borrar en el medio corre los ids de la cola (como un índice): sin efecto — los
  // ids son opacos y no hay animación de drop en juego en ese momento.
  const idsRef = useRef<string[]>([]);
  const idSeq = useRef(0);
  while (idsRef.current.length < items.length) idsRef.current.push(`it-${idSeq.current++}`);
  if (idsRef.current.length > items.length) idsRef.current = idsRef.current.slice(0, items.length);
  const ids = [...idsRef.current];

  if (disabled || items.length < 2) {
    return <>{container(items.map((it, i) => <Fragment key={i}>{children(it, i, null)}</Fragment>))}</>;
  }

  const onDragEnd = (e: DragEndEvent) => {
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const from = idsRef.current.indexOf(String(active.id));
    const to = idsRef.current.indexOf(String(over.id));
    if (from === -1 || to === -1) return;
    idsRef.current = arrayMove(idsRef.current, from, to);
    onReorder(arrayMove(items, from, to));
  };

  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
      <SortableContext items={ids} strategy={rectSortingStrategy}>
        {container(
          items.map((it, i) => (
            <SortableItem key={ids[i]} id={ids[i]} style={itemStyle}>
              {(handle) => children(it, i, handle)}
            </SortableItem>
          )),
        )}
      </SortableContext>
    </DndContext>
  );
}
