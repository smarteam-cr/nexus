"use client";

/**
 * components/landing/inline.tsx
 *
 * Primitivas de edición INLINE del motor de landing. La edición es WYSIWYG: el
 * mismo elemento estilado se vuelve `contentEditable` en modo edición, así el CSE
 * ve el resultado final mientras escribe (no un formulario aparte).
 *
 * `Editable` es no-controlado mientras tiene foco (React no pisa el texto que se
 * está tipeando); sincroniza desde `value` solo cuando NO está enfocado. Reporta
 * el texto nuevo en `onCommit` al perder el foco (blur) — el padre lo persiste —
 * y también al DESMONTARSE si quedó texto sin blurear (toggle Editar→Listo con
 * foco adentro, cambio de tab, remonte por key): antes ese último campo se perdía.
 * NO se comitea por Enter a propósito: en prosa multilínea Enter inserta un salto
 * de línea legítimo.
 */
import { useEffect, useLayoutEffect, useRef, type ElementType } from "react";

export function Editable({
  value,
  onCommit,
  editable,
  as: Tag = "span",
  className,
  placeholder,
}: {
  value: string;
  onCommit?: (next: string) => void;
  editable?: boolean;
  as?: ElementType;
  className?: string;
  placeholder?: string;
}) {
  const ref = useRef<HTMLElement>(null);

  // Sincroniza el texto desde `value` cuando cambia externamente y el elemento no
  // está enfocado (evita pisar lo que el usuario está tipeando).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!editable || !el) return;
    if (document.activeElement !== el && el.textContent !== value) {
      el.textContent = value ?? "";
    }
  }, [value, editable]);

  // Refs "latest" (actualizadas en effect, nunca en render — regla react-hooks/refs)
  // para que el cleanup de desmontaje compare contra el value VIGENTE sin re-suscribirse.
  const onCommitRef = useRef(onCommit);
  const valueRef = useRef(value);
  useEffect(() => {
    onCommitRef.current = onCommit;
    valueRef.current = value;
  });

  // Commit al desmontar (o al salir de modo edición): si el texto difiere del value
  // vigente es que hubo tipeo sin blur — se comitea. En el 99% de los desmontes el
  // sync de arriba los mantiene iguales → no-op. Se captura `el` en el setup porque
  // en el cleanup el ref puede ya estar en null (el nodo desmontado conserva su texto).
  useEffect(() => {
    if (!editable) return;
    const el = ref.current;
    return () => {
      const txt = el?.textContent;
      if (el && txt != null && txt !== valueRef.current) onCommitRef.current?.(txt);
    };
  }, [editable]);

  if (!editable) {
    if (!value) return null;
    return (
      <Tag className={className} style={{ whiteSpace: "pre-wrap" }}>
        {value}
      </Tag>
    );
  }

  return (
    <Tag
      ref={ref}
      className={`${className ?? ""} stl-editable`.trim()}
      contentEditable
      suppressContentEditableWarning
      data-placeholder={placeholder}
      style={{ whiteSpace: "pre-wrap" }}
      onBlur={(e: React.FocusEvent<HTMLElement>) =>
        onCommit?.(e.currentTarget.textContent ?? "")
      }
    />
  );
}

/** Botón "× quitar item" (aparece al hover del .stl-item). */
export function RemoveBtn({ onClick, title = "Quitar" }: { onClick: () => void; title?: string }) {
  return (
    <button type="button" className="stl-remove" title={title} onClick={onClick} aria-label={title}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4">
        <path strokeLinecap="round" d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  );
}

/** Botón "+ agregar item". */
export function AddBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button type="button" className="stl-add" onClick={onClick}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
        <path strokeLinecap="round" d="M12 5v14M5 12h14" />
      </svg>
      {label}
    </button>
  );
}

// ── Helpers inmutables para arrays de items ──────────────────────────────────

export function replaceAt<T>(arr: T[], i: number, next: T): T[] {
  const copy = arr.slice();
  copy[i] = next;
  return copy;
}
export function removeAt<T>(arr: T[], i: number): T[] {
  return arr.filter((_, idx) => idx !== i);
}
export function appendItem<T>(arr: T[], item: T): T[] {
  return [...arr, item];
}
