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

  /* Blindaje contra el texto-que-no-era-texto. El tipo dice `string`, pero la data de
     una sección viene de la base y de la IA, y los tipos no existen en tiempo de
     ejecución: si un llamador pasa un objeto, el navegador lo pinta como
     "[object Object]" y —porque este campo comitea su propio texto al perder el foco—
     ESA CADENA SE GUARDA, pisando el contenido real. Pasó de verdad: dos portadas de
     un proyecto quedaron con "[object Object]" de título tras una recarga en caliente
     con un valor mal armado.
     Convertir a "" es lo correcto: un campo vacío muestra su ayuda y se arregla
     escribiendo; una cadena basura se ve como contenido y se propaga al PDF y al
     cliente. */
  const safeValue = typeof value === "string" ? value : "";

  // Sincroniza el texto desde `value` cuando cambia externamente y el elemento no
  // está enfocado (evita pisar lo que el usuario está tipeando).
  useLayoutEffect(() => {
    const el = ref.current;
    if (!editable || !el) return;
    if (document.activeElement !== el && el.textContent !== safeValue) {
      el.textContent = safeValue;
    }
  }, [safeValue, editable]);

  // Refs "latest" (actualizadas en effect, nunca en render — regla react-hooks/refs)
  // para que el cleanup de desmontaje compare contra el value VIGENTE sin re-suscribirse.
  const onCommitRef = useRef(onCommit);
  const valueRef = useRef(safeValue);
  useEffect(() => {
    onCommitRef.current = onCommit;
    valueRef.current = safeValue;
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
    if (!safeValue) return null;
    return (
      <Tag className={className} style={{ whiteSpace: "pre-wrap" }}>
        {safeValue}
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
      /* Comitea SOLO si el texto cambió — la misma comparación que ya hacía el commit al
         desmontar (arriba). Antes comiteaba en CADA blur, y eso era inocuo mientras el
         campo leyera y escribiera la misma clave: blur sin tipear = guardar lo mismo.
         Dejó de serlo cuando una portada empezó a mostrar un valor DERIVADO y a escribir
         en otra clave: entrar a la bajada y salir sin tocar nada guardaba "" sobre el
         titular del documento y lo destruía, sin deshacer y en documentos que el cliente
         ve. La comparación cuesta nada y cierra la clase entera de ese error. */
      onBlur={(e: React.FocusEvent<HTMLElement>) => {
        const txt = e.currentTarget.textContent ?? "";
        if (txt !== safeValue) onCommit?.(txt);
      }}
    />
  );
}

// ── Controles de VOCABULARIO CERRADO (desplegable y casilla) ─────────────────
//
// `Editable` cubre texto libre. Cuando el campo tiene un conjunto ACOTADO de valores
// (dirección de un dato, tipo de campo, sí/no), escribirlo a mano garantiza que cada
// quien lo escriba distinto ("entra" / "Entrada" / "inbound") y que después no se
// pueda filtrar ni contar. Estos dos controles fijan el vocabulario en la UI.
//
// REGLA DE ORO — nunca pierden un valor desconocido: el agente puede emitir
// `⚠️ Por validar` (o un valor que el vocabulario no contempla todavía) y editar OTRA
// celda de la fila no puede borrarlo en silencio. `InlineSelect` inyecta el valor
// vigente como opción extra si no está en la lista, así siempre round-trippea.
//
// Los valores viajan como STRING a propósito: `coerceToSchema` (lib/ai/section-schema)
// aplana todo el output del agente a string, así que un boolean real nunca sobreviviría
// — por eso las casillas hablan "si"/"no" y no true/false.

/** Valores que cuentan como "sí" al leer una casilla (tolerante a lo que emita el agente). */
export function isSi(v: string | undefined | null): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "si" || s === "sí" || s === "true" || s === "1" || s === "x";
}

export interface InlineOption {
  value: string;
  label: string;
}

/** Desplegable de vocabulario cerrado. En lectura pinta el label; en edición, un `<select>`. */
export function InlineSelect({
  value,
  options,
  onCommit,
  editable,
  placeholder = "—",
  ariaLabel,
}: {
  value: string;
  options: readonly InlineOption[];
  onCommit?: (next: string) => void;
  editable?: boolean;
  placeholder?: string;
  ariaLabel: string;
}) {
  const actual = (value ?? "").trim();
  const conocido = options.some((o) => o.value === actual);
  // Valor fuera del vocabulario (típico: "⚠️ Por validar" del agente) → entra como opción
  // para que quede seleccionado y NO se pierda al tocar otra celda de la misma fila.
  const opciones: readonly InlineOption[] =
    actual && !conocido ? [{ value: actual, label: actual }, ...options] : options;

  if (!editable) {
    const label = options.find((o) => o.value === actual)?.label ?? actual;
    return <span className="stl-cell-ro">{label || placeholder}</span>;
  }

  return (
    <select
      className="stl-select"
      value={actual}
      aria-label={ariaLabel}
      onChange={(e) => onCommit?.(e.target.value)}
    >
      <option value="">{placeholder}</option>
      {opciones.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Casilla sí/no. Persiste "si"/"no" (string — ver la nota de `coerceToSchema` arriba). */
export function InlineCheck({
  value,
  onCommit,
  editable,
  ariaLabel,
}: {
  value: string;
  onCommit?: (next: string) => void;
  editable?: boolean;
  ariaLabel: string;
}) {
  const on = isSi(value);

  if (!editable) {
    // En lectura una casilla vacía no dice nada útil: se pinta un check o una raya.
    return (
      <span className={on ? "stl-flag-on" : "stl-cell-ro"} aria-label={on ? "Sí" : "No"}>
        {on ? "✓" : "—"}
      </span>
    );
  }

  return (
    <input
      type="checkbox"
      className="stl-check"
      checked={on}
      aria-label={ariaLabel}
      onChange={(e) => onCommit?.(e.target.checked ? "si" : "no")}
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
