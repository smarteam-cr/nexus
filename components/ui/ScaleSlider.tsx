"use client";

/**
 * ScaleSlider — barra de porcentaje. El PRIMER `input type="range"` del repo, así que
 * fija el patrón para los que vengan.
 *
 * ── EL PROBLEMA QUE RESUELVE ─────────────────────────────────────────────────
 * Un range dispara `onChange` en CADA píxel del arrastre. Guardar ahí serían ~40
 * requests por gesto. Acá el arrastre solo PINTA (estado local + `onPreview`, cero red) y
 * se guarda UNA vez al soltar.
 *
 * El commit se dispara en `pointerUp` + `keyUp` (las flechas del teclado no producen
 * pointerUp) + `blur`, deduplicado contra el último valor guardado. `blur` es la misma
 * doctrina que ya usan `Editable` y `PopInput` del motor de landing — y es lo que hace que
 * cerrar un popover con clic afuera no pierda el valor.
 *
 * Sin debounce con timer a propósito: un timer se pierde al desmontar y hay que acordarse
 * de limpiarlo. "Al soltar" es además lo que el usuario espera de una barra.
 */
import { useEffect, useRef, useState } from "react";

export function ScaleSlider({
  value,
  base,
  min,
  max,
  step,
  onPreview,
  onCommit,
  label,
  resetLabel,
  disabled,
}: {
  /** Valor actual. `null` = sin configurar → se muestra `base`. */
  value: number | null;
  /** Qué significa `null` (la base heredada, o el default del sistema). */
  base: number;
  min: number;
  max: number;
  step: number;
  /** Se llama en cada movimiento. Solo para pintar — NUNCA para guardar. */
  onPreview?: (pct: number) => void;
  /** Se llama al soltar. `null` = volver al valor heredado (BORRA, no iguala). */
  onCommit: (pct: number | null) => void;
  label: string;
  /** Si se pasa, aparece un botón que devuelve el control al valor heredado. */
  resetLabel?: string;
  disabled?: boolean;
}) {
  const efectivo = value ?? base;
  const [draft, setDraft] = useState(efectivo);

  // Re-sync cuando el valor cambia DESDE AFUERA (otro control, un fetch). Con ESTADO y no
  // con un ref: el patrón oficial de "ajustar estado durante el render", igual que
  // `PopInput` del motor de landing. Un ref leído en render viola la regla de React
  // ("Cannot access refs during render") y además puede no re-renderizar.
  const [prevEfectivo, setPrevEfectivo] = useState(efectivo);
  if (prevEfectivo !== efectivo) {
    setPrevEfectivo(efectivo);
    setDraft(efectivo);
  }

  // Último valor que YA se guardó: evita mandar dos veces el mismo (pointerUp y blur se
  // disparan los dos al soltar sobre el control). Solo se toca en handlers y efectos.
  const guardado = useRef(efectivo);
  useEffect(() => {
    guardado.current = efectivo;
  }, [efectivo]);

  // El preview vive en el padre (una variable CSS): si el componente se desmonta a mitad
  // de un arrastre sin soltar, hay que devolver lo pintado al valor real.
  useEffect(() => () => onPreview?.(guardado.current), [onPreview]);

  const commit = () => {
    if (draft === guardado.current) return;
    guardado.current = draft;
    onCommit(draft);
  };

  const reset = () => {
    guardado.current = base;
    setDraft(base);
    onPreview?.(base);
    onCommit(null); // null = BORRAR el valor propio, no igualarlo al heredado
  };

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <label htmlFor="scale-slider" className="text-xs font-medium text-fg-secondary">
          {label}
        </label>
        <span className="text-xs tabular-nums text-fg-muted">{draft}%</span>
      </div>
      <input
        id="scale-slider"
        type="range"
        className="stl-range w-full"
        min={min}
        max={max}
        step={step}
        value={draft}
        disabled={disabled}
        aria-label={label}
        onChange={(e) => {
          const n = Number(e.target.value);
          setDraft(n);
          onPreview?.(n); // solo pinta
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-[11px] text-fg-muted">chico</span>
        {resetLabel && value !== null && (
          <button type="button" onClick={reset} className="text-[11px] text-brand hover:underline">
            {resetLabel}
          </button>
        )}
        <span className="text-[11px] text-fg-muted">grande</span>
      </div>
    </div>
  );
}
