/**
 * components/ui/button-variants.ts
 *
 * Las variantes del botón, en un módulo SIN "use client".
 *
 * ── POR QUÉ VIVE APARTE DE Button.tsx ───────────────────────────────────────────
 * `buttonVariants` no es un componente: es una función pura que arma un string de
 * clases. Pero mientras vivió dentro de `Button.tsx` —que sí es "use client",
 * porque el componente usa `forwardRef`— quedó marcada como función DE CLIENTE, y
 * llamarla desde un Server Component revienta la página entera:
 *
 *   Attempted to call buttonVariants() from the server but buttonVariants is on the
 *   client. It's not possible to invoke a client function from the server.
 *
 * No es teórico: rompió `/finanzas/costos/planillas` —la página le daba estilo de
 * botón secundario a un <Link> hacia el Historial— y la sección entera caía al
 * boundary de error con un digest opaco, sin decir en pantalla qué había pasado.
 * Que se llame desde un Server Component es lo NORMAL para un helper de clases: lo
 * anómalo era que estuviera del lado del cliente.
 *
 * ⚠ El barril (`components/ui/index.ts`) re-exporta desde ACÁ y no desde Button:
 * re-exportar a través de un módulo "use client" vuelve a marcar la referencia como
 * de cliente y el defecto regresa intacto. Lo sostiene `button-variants.test.ts`.
 */
import { cva, type VariantProps } from "class-variance-authority";

export const buttonVariants = cva(
  // Base
  "inline-flex items-center justify-center gap-2 font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/50 select-none",
  {
    variants: {
      variant: {
        // Acción principal — par sólido de intención (primary + su texto declarado)
        primary: "bg-primary text-primary-fg hover:bg-primary-hover",
        // Acción secundaria — superficie apoyada; el hover sube un escalón (surface-active)
        secondary:
          "bg-surface-hover text-fg-secondary border border-line hover:bg-surface-active hover:text-fg",
        // Acción sutil — brand translúcido
        ghost:
          "bg-brand/10 text-brand-light border border-brand/20 hover:bg-brand/20 hover:border-brand/40",
        // Peligro — rojo sutil
        destructive: "bg-transparent text-fg-muted hover:text-red-400 hover:bg-red-500/10",
        // Peligro sólido — par de intención (mismos valores que el viejo red-600/white)
        "destructive-solid": "bg-destructive text-destructive-fg hover:bg-destructive-hover",
        // Link / texto plano
        link: "bg-transparent text-brand-light hover:text-brand underline-offset-4 hover:underline p-0 h-auto",
      },
      size: {
        xs: "text-xs px-2.5 py-1 rounded-md",
        sm: "text-xs px-3 py-1.5 rounded-lg",
        md: "text-sm px-3 py-2 rounded-lg",
        lg: "text-sm px-4 py-2.5 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "md",
    },
  },
);

export type ButtonVariantProps = VariantProps<typeof buttonVariants>;
