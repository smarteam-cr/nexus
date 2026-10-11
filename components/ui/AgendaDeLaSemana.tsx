"use client";

/**
 * components/ui/AgendaDeLaSemana.tsx — la semana con horas: lunes a viernes, en una grilla CSS, sin librería de
 * calendario (docs/tareas-plan.md §9.5): lo ocupado en gris, lo propuesto en azul suave con borde punteado, lo que ya
 * pasó atenuado y la línea de ahora.
 *
 * Un bloque `arrastrable` se mueve de día y de hora, y su borde de abajo cambia la duración, en saltos de `paso`
 * minutos. Mientras se arrastra es una vista previa local; al soltar se avisa UNA vez (`onMover`). La medida se lee
 * viva en cada movimiento y, si la grilla mide 0×0, no se mueve nada (lib/ui/agenda-geometria.ts, pura y probada).
 * Nunca se suelta en lo que ya pasó. Esc cancela. El teclado va por los selectores de quien la usa.
 *
 * Es genérica: no sabe de tareas. Quien la usa le pasa cada bloque ya ubicado (día y fracción del alto).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/cn";
import { enMinutos, estirarBloque, mismaPosicion, moverBloque, type PosicionEnMinutos } from "@/lib/ui/agenda-geometria";

export interface BloqueDeLaAgenda {
  clave: string;
  /** 0 = lunes … 4 = viernes. */
  dia: number;
  /** De 0 a 1 desde el inicio de la grilla. */
  arriba: number;
  /** De 0 a 1. */
  alto: number;
  titulo: string;
  /** «9:30 – 10:30», debajo del título si cabe. */
  detalle?: string;
  tipo: "ocupado" | "propuesto";
  /** Un propuesto que se está mirando (la fila de la tanda con foco). */
  resaltado?: boolean;
  /** Se puede mover y estirar con el puntero. */
  arrastrable?: boolean;
}

export interface AgendaDeLaSemanaProps {
  /** El rótulo de cada día: «lun 12 oct». */
  dias: readonly string[];
  /** Las horas que se rotulan a la izquierda, de la primera a la última línea («8:00» … «18:00»). */
  horas: readonly string[];
  bloques: readonly BloqueDeLaAgenda[];
  /** Los días ocupados de punta a punta (un evento de todo el día, «Fuera de la oficina»): su rótulo, por día. */
  todoElDia?: readonly { dia: number; titulo: string }[];
  /** Hasta dónde ya pasó: los días antes de `dia` enteros y, ese día, hasta `arriba`. Null si la semana no empezó. */
  pasado?: { dia: number; arriba: number } | null;
  /** El día de hoy, para marcarlo. */
  hoy?: number | null;
  /** Alto de una hora, en px. */
  altoDeLaHora?: number;
  /** El salto del arrastre, en minutos. */
  paso?: number;
  /** Al soltar un bloque arrastrable en otro lugar: día y minutos desde la primera hora de la grilla. */
  onMover?: (clave: string, nueva: PosicionEnMinutos) => void;
  className?: string;
}

interface Arrastre {
  clave: string;
  modo: "mover" | "estirar";
  x: number;
  y: number;
  orig: PosicionEnMinutos;
  actual: PosicionEnMinutos;
}

/** Ancho de la columna de las horas, en px (también en la medida del arrastre). */
const COLUMNA_DE_HORAS = 48;

export function AgendaDeLaSemana({ dias, horas, bloques, todoElDia = [], pasado = null, hoy = null, altoDeLaHora = 48, paso = 15, onMover, className }: AgendaDeLaSemanaProps) {
  const tramos = Math.max(1, horas.length - 1);
  const alto = tramos * altoDeLaHora;
  const minutosTotales = tramos * 60;
  const grilla = useRef<HTMLDivElement>(null);
  const [arrastre, setArrastre] = useState<Arrastre | null>(null);
  const pasadoEnMinutos = useMemo(() => (pasado ? { dia: pasado.dia, desde: pasado.arriba * minutosTotales } : null), [pasado, minutosTotales]);

  // Mientras se arrastra, el puntero se sigue en la ventana: el bloque cambia de columna (de padre) al moverse de día.
  useEffect(() => {
    if (!arrastre) return;
    const mover = (e: PointerEvent) => {
      const r = grilla.current?.getBoundingClientRect();
      // La medida, viva: sin ella no se mueve nada.
      const g = { ancho: r ? r.width - COLUMNA_DE_HORAS : 0, alto: r ? r.height : 0, dias: dias.length, minutosTotales, paso };
      const dx = e.clientX - arrastre.x;
      const dy = e.clientY - arrastre.y;
      const nueva = arrastre.modo === "mover" ? moverBloque(arrastre.orig, dx, dy, g, pasadoEnMinutos) : estirarBloque(arrastre.orig, dy, g);
      if (nueva && !mismaPosicion(nueva, arrastre.actual)) setArrastre({ ...arrastre, actual: nueva });
    };
    const soltar = () => {
      if (!mismaPosicion(arrastre.actual, arrastre.orig)) onMover?.(arrastre.clave, arrastre.actual);
      setArrastre(null);
    };
    const cancelar = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setArrastre(null);
    };
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", soltar);
    window.addEventListener("pointercancel", soltar);
    window.addEventListener("keydown", cancelar, true);
    return () => {
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", soltar);
      window.removeEventListener("pointercancel", soltar);
      window.removeEventListener("keydown", cancelar, true);
    };
  }, [arrastre, dias.length, minutosTotales, paso, pasadoEnMinutos, onMover]);

  function empezar(e: React.PointerEvent, b: BloqueDeLaAgenda, modo: Arrastre["modo"]) {
    if (!b.arrastrable || !onMover || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    const orig = enMinutos(b, minutosTotales, paso);
    setArrastre({ clave: b.clave, modo, x: e.clientX, y: e.clientY, orig, actual: orig });
  }

  // Lo que se arrastra se pinta donde va a quedar.
  const ubicados = bloques.map((b) =>
    arrastre && arrastre.clave === b.clave
      ? { ...b, dia: arrastre.actual.dia, arriba: arrastre.actual.desde / minutosTotales, alto: arrastre.actual.minutos / minutosTotales }
      : b,
  );

  return (
    <div className={cn("min-w-0 overflow-hidden rounded-xl border border-line bg-surface", className)} role="group" aria-label="Tu semana">
      <div className="grid border-b border-line" style={{ gridTemplateColumns: `${COLUMNA_DE_HORAS}px repeat(${dias.length}, minmax(0, 1fr))` }}>
        <span />
        {dias.map((d, i) => (
          <div key={d} className={cn("border-l border-line px-2 py-1.5 text-center text-xs", i === hoy ? "font-semibold text-brand" : "text-fg-secondary")}>
            {d}
            {todoElDia
              .filter((x) => x.dia === i)
              .map((x, k) => (
                <span key={k} className="mt-1 block truncate rounded bg-surface-hover px-1 py-[1px] text-[11px] text-fg-muted" title={x.titulo}>
                  {x.titulo}
                </span>
              ))}
          </div>
        ))}
      </div>
      <div ref={grilla} className={cn("grid", arrastre && "select-none")} style={{ gridTemplateColumns: `${COLUMNA_DE_HORAS}px repeat(${dias.length}, minmax(0, 1fr))` }}>
        <div className="relative" style={{ height: alto }}>
          {horas.map((h, i) => (
            <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-fg-muted" style={{ top: i === 0 ? 6 : i * altoDeLaHora }}>
              {h}
            </span>
          ))}
        </div>
        {dias.map((d, dia) => {
          const pasadoDelDia = !pasado ? 0 : dia < pasado.dia ? 1 : dia === pasado.dia ? pasado.arriba : 0;
          return (
            <div key={d} className="relative border-l border-line" style={{ height: alto }}>
              {Array.from({ length: tramos - 1 }, (_, i) => (
                <span key={i} className="absolute inset-x-0 border-t border-line/60" style={{ top: (i + 1) * altoDeLaHora }} aria-hidden="true" />
              ))}
              {pasadoDelDia > 0 && <span className="absolute inset-x-0 top-0 bg-surface-muted" style={{ height: `${pasadoDelDia * 100}%` }} aria-hidden="true" />}
              {ubicados
                .filter((b) => b.dia === dia)
                .map((b) => {
                  const mueve = !!b.arrastrable && !!onMover;
                  const enArrastre = arrastre?.clave === b.clave;
                  return (
                    <div
                      key={b.clave}
                      title={b.detalle ? `${b.titulo} · ${b.detalle}${mueve ? " · arrástrala para moverla" : ""}` : b.titulo}
                      onPointerDown={mueve ? (e) => empezar(e, b, "mover") : undefined}
                      className={cn(
                        "absolute inset-x-1 overflow-hidden rounded-md border px-1.5 py-0.5 text-[11px] leading-4",
                        b.tipo === "ocupado"
                          ? "border-line bg-surface-hover text-fg-muted"
                          : cn("border-dashed border-info-line bg-info-surface text-brand", (b.resaltado || enArrastre) && "border-solid ring-1 ring-brand"),
                        mueve && "touch-none",
                        mueve && (enArrastre ? "z-10 cursor-grabbing" : "cursor-grab"),
                      )}
                      style={{ top: `${b.arriba * 100}%`, height: `max(18px, ${b.alto * 100}%)` }}
                    >
                      <span className={cn("block truncate", b.tipo === "propuesto" && "font-semibold")}>{b.titulo}</span>
                      {b.detalle && b.alto * alto >= 34 && <span className="block truncate opacity-80">{b.detalle}</span>}
                      {mueve && <span aria-hidden="true" onPointerDown={(e) => empezar(e, b, "estirar")} className="absolute inset-x-0 bottom-0 h-1.5 cursor-ns-resize" />}
                    </div>
                  );
                })}
              {pasado && dia === pasado.dia && pasado.arriba > 0 && pasado.arriba < 1 && (
                <span className="absolute inset-x-0 border-t-2 border-danger-ink" style={{ top: `${pasado.arriba * 100}%` }} aria-label="Ahora" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
