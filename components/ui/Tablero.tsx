"use client";

/**
 * components/ui/Tablero.tsx — un tablero de columnas fijas con tarjetas que se arrastran de una columna a otra
 * (docs/tareas-plan.md §9.5). La mecánica es la de la Hoja de ruta de Feedback (dnd-kit): el mouse arrastra después de
 * 6 px y el dedo después de mantener apretado un momento, así deslizar sigue desplazando la página. Sin teclado: el
 * cambio de columna por teclado va por el cajón de cada tarjeta (lo dice la ayuda de quien lo usa).
 *
 * Es genérico: no sabe de tareas. Arrastrar solo AVISA (`onMover`); quien lo usa decide si se puede y escribe. Mientras
 * espera, la tarjeta ya se ve en su columna nueva si quien lo usa la mueve en su estado (optimista) y vuelve si falla.
 */
import { useState, type ReactNode } from "react";
import { DndContext, DragOverlay, MouseSensor, TouchSensor, pointerWithin, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from "@dnd-kit/core";
import { cn } from "@/lib/cn";
import { ROTULO_DEL_SISTEMA } from "./sistema";

export interface ColumnaDelTablero {
  clave: string;
  titulo: string;
  /** Lo que dice una columna vacía. */
  vacia?: string;
  /** Debajo de las tarjetas («+ Agregar»). */
  pie?: ReactNode;
  /** Junto al título (un menú, «Quitar»). */
  accion?: ReactNode;
  /** No se puede soltar acá (con su porqué en `vacia` o en la ayuda). */
  sinSoltar?: boolean;
}

export interface TableroProps<T> {
  columnas: readonly ColumnaDelTablero[];
  items: readonly T[];
  claveDe: (item: T) => string;
  columnaDe: (item: T) => string;
  tarjeta: (item: T, opciones: { levantada: boolean }) => ReactNode;
  /** Se soltó una tarjeta en otra columna. */
  onMover?: (item: T, columna: string) => void;
  /** Una tarjeta no se arrastra (no se puede cambiar). */
  fija?: (item: T) => boolean;
  etiqueta: string;
  className?: string;
}

export function Tablero<T>({ columnas, items, claveDe, columnaDe, tarjeta, onMover, fija, etiqueta, className }: TableroProps<T>) {
  const [arrastrando, setArrastrando] = useState<T | null>(null);
  const sensores = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );
  const porClave = new Map(items.map((i) => [claveDe(i), i]));

  function alEmpezar(e: DragStartEvent) {
    setArrastrando(porClave.get(String(e.active.id)) ?? null);
  }
  function alSoltar(e: DragEndEvent) {
    const item = porClave.get(String(e.active.id));
    setArrastrando(null);
    const destino = e.over ? String(e.over.id) : null;
    if (!item || !destino || destino === columnaDe(item)) return;
    if (columnas.find((c) => c.clave === destino)?.sinSoltar) return;
    onMover?.(item, destino);
  }

  return (
    <DndContext sensors={sensores} collisionDetection={pointerWithin} onDragStart={alEmpezar} onDragEnd={alSoltar} onDragCancel={() => setArrastrando(null)}>
      <div role="group" aria-label={etiqueta} className={cn("grid gap-3 md:grid-cols-2 xl:grid-cols-3", columnas.length >= 4 && "2xl:grid-cols-4", className)}>
        {columnas.map((c) => (
          <ColumnaDeTablero
            key={c.clave}
            columna={c}
            desde={arrastrando ? columnaDe(arrastrando) : null}
            items={items.filter((i) => columnaDe(i) === c.clave)}
            claveDe={claveDe}
            tarjeta={tarjeta}
            fija={fija}
            arrastrando={arrastrando ? claveDe(arrastrando) : null}
            conArrastre={!!onMover}
          />
        ))}
      </div>
      <DragOverlay dropAnimation={null}>{arrastrando && tarjeta(arrastrando, { levantada: true })}</DragOverlay>
    </DndContext>
  );
}

function ColumnaDeTablero<T>({
  columna,
  desde,
  items,
  claveDe,
  tarjeta,
  fija,
  arrastrando,
  conArrastre,
}: {
  columna: ColumnaDelTablero;
  desde: string | null;
  items: readonly T[];
  claveDe: (item: T) => string;
  tarjeta: TableroProps<T>["tarjeta"];
  fija?: (item: T) => boolean;
  arrastrando: string | null;
  conArrastre: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columna.clave, disabled: columna.sinSoltar });
  const otra = desde !== null && desde !== columna.clave && !columna.sinSoltar;
  const sobre = otra && isOver;
  return (
    <section
      ref={setNodeRef}
      aria-label={columna.titulo}
      className={cn(
        "flex min-h-[220px] flex-col gap-2.5 rounded-xl border p-3 transition-colors",
        sobre ? "border-brand bg-info-surface" : otra ? "border-dashed border-line bg-surface-muted" : "border-line bg-surface-muted",
      )}
    >
      <div className="flex items-baseline justify-between gap-2 px-0.5">
        <p className={ROTULO_DEL_SISTEMA}>
          {columna.titulo} · {items.length}
        </p>
        {columna.accion}
      </div>
      {sobre && <p className="rounded-[10px] border border-dashed border-brand bg-surface px-3 py-3 text-center text-xs font-semibold text-brand">Suelta para pasarla a «{columna.titulo}»</p>}
      {items.length === 0 && !sobre && (
        <p className="rounded-[10px] border border-dashed border-line px-3 py-4 text-center text-xs text-fg-muted">{columna.vacia ?? "Nada todavía."}</p>
      )}
      {items.map((i) => (
        <Arrastrable key={claveDe(i)} id={claveDe(i)} deshabilitado={!conArrastre || !!fija?.(i)} tenue={arrastrando === claveDe(i)}>
          {tarjeta(i, { levantada: false })}
        </Arrastrable>
      ))}
      {columna.pie}
    </section>
  );
}

function Arrastrable({ id, deshabilitado, tenue, children }: { id: string; deshabilitado: boolean; tenue: boolean; children: ReactNode }) {
  const { setNodeRef, listeners } = useDraggable({ id, disabled: deshabilitado });
  return (
    <div ref={setNodeRef} {...(deshabilitado ? {} : listeners)} className={cn(!deshabilitado && "cursor-grab", tenue && "opacity-40")}>
      {children}
    </div>
  );
}
