"use client";

/**
 * components/ui/sistema.tsx — las piezas chicas del sistema «Nexus · interfaz interna» que se
 * repiten en todas las pantallas rediseñadas: los tres botones de los tableros (azul, blanco con
 * borde y de solo texto), la chispa de la IA, la franja azul de sugerencias, el recuadro «Qué
 * sigue» y el rótulo en mayúscula.
 *
 * Nacieron en la preventa (components/exploraciones/FranjaDeSugerencias.tsx) y se mudaron acá el
 * 2026-10-04, cuando las necesitó también la ficha del cliente: una misma forma no puede vivir en
 * dos copias. La preventa las re-exporta desde su archivo de siempre.
 *
 * Las medidas son las del sistema, exactas: si se cambian acá, cambian en todas las pantallas.
 */
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** El rótulo en mayúscula de 11 px sobre un bloque. Azul cuando el bloque es una sugerencia. */
export const ROTULO_DEL_SISTEMA = "text-[11px] font-semibold uppercase leading-4 tracking-[0.08em] text-fg-muted";

/** La chispa doble de la IA. Marca SOLO lo que sugirió o escribió un agente. */
export function IconoDeSugerencia({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d="M12 3l1.8 4.6L18 9l-4.2 1.4L12 15l-1.8-4.6L6 9l4.2-1.4z" />
      <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
    </svg>
  );
}

/** El botón blanco de la barra de un documento («Asistente», «Exportar PDF», «Acceso»): 13 px, con ícono de 15. */
export const BOTON_DE_HERRAMIENTA =
  "inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-2 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50";
/** El mismo, encendido (el chat abierto): azul, como lo activo en el resto del sistema. */
export const BOTON_DE_HERRAMIENTA_ACTIVO =
  "inline-flex items-center gap-1.5 rounded-lg border border-info-line bg-info-surface px-3 py-2 text-[13px] text-brand transition-colors disabled:opacity-50";

type PropsDeBoton = { children: ReactNode; onClick: () => void; disabled?: boolean; title?: string; className?: string };

/** El botón azul de los tableros: 12 px, seminegrita, esquinas de 6 px. */
export function BotonAzul({ children, onClick, disabled, title, className }: PropsDeBoton) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-primary-fg transition-colors hover:bg-primary-hover disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

/** El botón blanco con borde de los tableros. */
export function BotonBlanco({ children, onClick, disabled, title, className }: PropsDeBoton) {
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

/** El botón de solo texto («Descartar»). */
export function BotonTexto({ children, onClick, disabled, title, className }: PropsDeBoton) {
  return (
    <button type="button" title={title} disabled={disabled} onClick={onClick} className={cn("rounded px-1.5 py-[5px] text-xs text-fg-muted transition-colors hover:text-fg disabled:opacity-50", className)}>
      {children}
    </button>
  );
}

/** El botón de texto azul de las tarjetas: «Regenerar» arriba a la derecha, «Ver los 6 hallazgos». */
export function BotonEnlace({
  children,
  onClick,
  disabled,
  title,
  className,
  "aria-expanded": abierto,
}: PropsDeBoton & { "aria-expanded"?: boolean }) {
  return (
    <button
      type="button"
      aria-expanded={abierto}
      title={title}
      disabled={disabled}
      onClick={onClick}
      className={cn("rounded py-1 text-xs font-semibold text-brand transition-colors hover:text-brand-light disabled:opacity-50", className)}
    >
      {children}
    </button>
  );
}

/** La franja azul de arriba de una pieza: cuánto sugirió el agente ahí y qué hacer con todo junto. */
export function FranjaDeSugerencias({ children, acciones }: { children: ReactNode; acciones?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-[10px] border border-info-line bg-info-surface px-3.5 py-2.5">
      <IconoDeSugerencia className="h-[18px] w-[18px] flex-shrink-0 text-brand" />
      <p className="min-w-0 flex-1 text-[13px] text-brand">{children}</p>
      {acciones && <div className="flex flex-shrink-0 flex-wrap items-center gap-2">{acciones}</div>}
    </div>
  );
}

/**
 * El recuadro «Qué sigue»: lo primero del panel de contexto. Una frase y, si hay, una acción.
 * La acción del recuadro es la ÚNICA azul sólida del panel.
 */
export function QueSigue({ children, accion }: { children: ReactNode; accion?: ReactNode }) {
  return (
    <section data-recorrido="que-sigue" className="flex flex-col gap-2 rounded-xl border border-info-line bg-info-surface p-3.5">
      <p className={cn(ROTULO_DEL_SISTEMA, "text-brand")}>Qué sigue</p>
      <div className="text-sm leading-[1.4] text-fg">{children}</div>
      {accion && <div className="self-start">{accion}</div>}
    </section>
  );
}
