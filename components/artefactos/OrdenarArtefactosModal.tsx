"use client";

/**
 * components/artefactos/OrdenarArtefactosModal.tsx — los documentos de un tipo, en el orden que elige la persona (etapa V3
 * de docs/artefactos-plan.md: «arrastrarlas de arriba abajo»). dnd-kit como el resto del repo, con teclado: el asa es un
 * botón (Espacio o Enter la levanta, las flechas la mueven, Espacio o Enter la suelta, Escape cancela). El orden se guarda
 * al tocar «Guardar» (`PUT /artefactos/orden`) y es el del riel.
 */
import { useEffect, useState } from "react";
import { closestCenter, DndContext, KeyboardSensor, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Modal } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/cn";
import { ROTULO_DEL_ESTADO } from "@/lib/artefactos/copias";

export interface DocumentoParaOrdenar {
  id: string;
  nombre: string;
  terminado: boolean;
}

function Fila({ d, numero }: { d: DocumentoParaOrdenar; numero: number }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: d.id });
  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn("flex items-center gap-2.5 rounded-lg border border-line bg-surface px-2.5 py-2", isDragging && "relative z-10 shadow-lg")}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        title="Arrastra para cambiar el orden"
        aria-label={`Mover «${d.nombre}», lugar ${numero}`}
        className="flex h-6 w-5 flex-none cursor-grab touch-none items-center justify-center rounded text-fg-muted hover:bg-surface-hover hover:text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand active:cursor-grabbing"
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
      <span className="min-w-0 flex-1 truncate text-sm text-fg">{d.nombre}</span>
      <span className="flex-none text-xs text-fg-muted">{ROTULO_DEL_ESTADO[d.terminado ? "terminado" : "en_construccion"]}</span>
    </li>
  );
}

export default function OrdenarArtefactosModal({
  projectId,
  tipo,
  nombreDelTipo,
  documentos,
  open,
  onClose,
  onGuardado,
}: {
  projectId: string;
  tipo: string;
  nombreDelTipo: string;
  documentos: readonly DocumentoParaOrdenar[];
  open: boolean;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const [lista, setLista] = useState<DocumentoParaOrdenar[]>([...documentos]);
  const [guardando, setGuardando] = useState(false);
  const toast = useToast();
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  useEffect(() => {
    if (open) setLista([...documentos]);
  }, [open, documentos]);

  const alSoltar = (e: DragEndEvent) => {
    if (!e.over || e.active.id === e.over.id) return;
    setLista((l) => arrayMove(l, l.findIndex((x) => x.id === e.active.id), l.findIndex((x) => x.id === e.over!.id)));
  };

  const guardar = async () => {
    setGuardando(true);
    try {
      const r = await fetch(`/api/projects/${projectId}/artefactos/orden`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tipo, ids: lista.map((x) => x.id) }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) return toast.error(j?.error ?? "No se pudo guardar el orden.");
      onGuardado();
      onClose();
    } catch {
      toast.error("Error de conexión.");
    } finally {
      setGuardando(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`El orden de ${nombreDelTipo.toLowerCase()}`}
      description="Arrástralos de arriba abajo. Es el orden de la lista y el de quien los lee."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={guardando}>
            Cancelar
          </Button>
          <Button variant="primary" loading={guardando} onClick={() => void guardar()}>
            Guardar
          </Button>
        </div>
      }
    >
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={alSoltar}>
        <SortableContext items={lista.map((x) => x.id)} strategy={verticalListSortingStrategy}>
          <ol className="space-y-1.5">
            {lista.map((d, i) => (
              <Fila key={d.id} d={d} numero={i + 1} />
            ))}
          </ol>
        </SortableContext>
      </DndContext>
    </Modal>
  );
}
