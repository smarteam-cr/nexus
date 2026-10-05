/**
 * components/marketing/piezas.tsx — las piezas chicas que comparten las pantallas de Marketing (rediseño del
 * 2026-10-04, sistema «Nexus · interfaz interna»): chips, rótulos en mayúscula, el avatar de la vista previa de una
 * publicación y el bloque punteado de lo que falta. Los botones del sistema (azul, blanco, texto) y la chispa de IA
 * vienen de components/ui/sistema.tsx: una sola copia.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export { diaYMesCr } from "@/lib/marketing/tanda";

/** Chip blanco: un dato (tipo, tema, destino). */
export function Chip({ children, className, title }: { children: ReactNode; className?: string; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-line bg-surface px-2.5 py-[3px] text-xs font-medium text-fg-secondary",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Chip chico gris: una cuenta al lado de una fila («12 versiones»). */
export function ChipGris({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-full border border-line bg-surface-hover px-2 py-px text-[11px] font-medium text-fg-secondary">
      {children}
    </span>
  );
}

/** Chip verde: algo hecho («✓ En HubSpot»). */
export function ChipHecho({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-success-line bg-success-surface px-2.5 py-[3px] text-xs font-medium text-success-ink">
      {children}
    </span>
  );
}

/** Chip azul: lo activo («● En campaña»). */
export function ChipActivo({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-info-line bg-info-surface px-2 py-px text-[11px] font-semibold text-brand">
      {children}
    </span>
  );
}

/** Chip ámbar: lo que es una hipótesis o pide atención. */
export function ChipAtencion({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-warn-line bg-warn-surface px-2.5 py-[3px] text-xs font-medium text-warn-ink">
      {children}
    </span>
  );
}

/** Rótulo en mayúscula sobre un bloque. Azul cuando el bloque es una sugerencia del agente. */
export function Rotulo({ children, azul, className }: { children: ReactNode; azul?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em]",
        azul ? "text-brand" : "text-fg-muted",
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Isotipo de Smarteam (las dos cápsulas). Copiado tal cual del que usaba la tarjeta de publicación. */
export function MarcaSmarteam({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="none" className={className} aria-hidden="true">
      <line x1="52" y1="30" x2="30" y2="60" stroke="#42E4B3" strokeWidth="20" strokeLinecap="round" />
      <circle cx="52" cy="30" r="12" fill="#168CF6" />
      <line x1="72" y1="45" x2="50" y2="75" stroke="#168CF6" strokeWidth="20" strokeLinecap="round" />
      <circle cx="50" cy="75" r="12" fill="#42E4B3" />
    </svg>
  );
}

/** El avatar de la vista previa: Smarteam para la página de empresa, una silueta para un perfil personal. */
export function AvatarDePublicacion({ persona }: { persona: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border border-line bg-surface-hover text-fg-muted"
    >
      {persona ? (
        <svg className="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
      ) : (
        <MarcaSmarteam className="h-5 w-5" />
      )}
    </span>
  );
}

/** Recuadro punteado: lo que todavía no existe (el concepto de imagen, que se diseña aparte). */
export function RecuadroPunteado({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-1.5 rounded-lg border border-dashed border-line bg-surface-muted p-3.5", className)}>
      {children}
    </div>
  );
}

/** El botón «claro» del encabezado de una pantalla (13 px, esquinas de 8). */
export function BotonClaro({
  children,
  onClick,
  disabled,
  title,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50"
    >
      {children}
    </button>
  );
}
