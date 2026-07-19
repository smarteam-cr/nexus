"use client";

import { createContext, useContext, useId } from "react";
import { cn } from "@/lib/cn";

// ── Field ──────────────────────────────────────────────────────────────────────
//
// El envoltorio ESTÁNDAR de un control de formulario: label + control + error/hint,
// con el cableado de accesibilidad hecho una sola vez. Por qué existe: 13 forms
// distintos cableaban label+error a mano, cada uno con su propio criterio (o sin
// ninguno) — ningún input tenía `aria-describedby` ni `aria-invalid`.
//
// El cableado es AUTOMÁTICO, sin htmlFor manual: Field genera un id con useId y lo
// publica por contexto; Input/Textarea/Select (components/ui/Input.tsx) lo leen y
// se auto-asignan id, aria-describedby (hint/error) y aria-invalid. Fuera de un
// Field se comportan como siempre — el contexto es 100% aditivo.
//
//   <Field label="Razón social" error={errors.razonSocial} required>
//     <Input value={v} onChange={…} />
//   </Field>

export interface FieldContextValue {
  id: string;
  describedBy?: string;
  invalid: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/** Lo consumen los controles de Input.tsx; null fuera de un <Field>. */
export function useFieldContext(): FieldContextValue | null {
  return useContext(FieldContext);
}

export interface FieldProps {
  label: string;
  /** Ayuda breve bajo el control (se oculta mientras haya error). */
  hint?: string;
  /** Mensaje de error — pinta el borde del control (aria-invalid) y el texto. */
  error?: string | null;
  /** Asterisco visual; la validación real vive en Zod/el submit. */
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, error, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-xs font-medium text-fg-secondary">
        {label}
        {required && (
          <span className="ml-0.5 text-red-400" aria-hidden="true">
            *
          </span>
        )}
      </label>
      <FieldContext.Provider value={{ id, describedBy, invalid: !!error }}>
        {children}
      </FieldContext.Provider>
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-red-400">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="text-xs text-fg-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
