"use client";

/**
 * components/ui/PantallaCompleta.tsx — UNA HERRAMIENTA QUE OCUPA TODA LA PANTALLA.
 *
 * Nació para el editor del mapa de un proceso (components/procesos/EditorDelMapa.tsx). No es un
 * `Modal`: no hay fondo detrás, no se cierra tocando afuera y Esc NO la cierra (se perdería lo que se
 * está editando: Esc es del navegador, para salir de SU pantalla completa, y de la herramienta, para
 * soltar lo elegido). Lo que sí trae, como `Modal`: portal a document.body, role="dialog" con
 * aria-modal, el foco adentro (Tab da la vuelta), el scroll de la página bloqueado y el foco de
 * vuelta donde estaba al cerrar.
 *
 * La pantalla completa del NAVEGADOR va aparte (`pedirPantallaCompletaDelNavegador`) y es de la
 * página entera, no de este panel: así los avisos y los diálogos, que viven en document.body, se
 * siguen viendo. El navegador solo la da en un gesto de la persona: se pide en el mismo clic que abre.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/cn";
import { zClass } from "@/lib/ui/z";

/** Pide la pantalla completa del navegador para la página entera. Llamarla en el clic. */
export function pedirPantallaCompletaDelNavegador() {
  if (typeof document === "undefined" || document.fullscreenElement) return;
  void document.documentElement.requestFullscreen?.().catch(() => {});
}

export function salirDePantallaCompletaDelNavegador() {
  if (typeof document !== "undefined" && document.fullscreenElement) void document.exitFullscreen?.().catch(() => {});
}

/** Si el navegador está en pantalla completa (cambia con Esc, F11 o los botones). */
export function useEnPantallaCompletaDelNavegador(): boolean {
  const [activa, setActiva] = useState(false);
  useEffect(() => {
    const seguir = () => setActiva(!!document.fullscreenElement);
    seguir();
    document.addEventListener("fullscreenchange", seguir);
    return () => document.removeEventListener("fullscreenchange", seguir);
  }, []);
  return activa;
}

const ENFOCABLES = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export interface PantallaCompletaProps {
  /** Nombre accesible de la herramienta («Editar el mapa de Admisión»). */
  etiqueta: string;
  children: ReactNode;
  className?: string;
  /** Al cerrarla, también sale de la pantalla completa del navegador (por defecto, sí). */
  soltarElNavegador?: boolean;
}

export function PantallaCompleta({ etiqueta, children, className, soltarElNavegador = true }: PantallaCompletaProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    const scroll = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    ref.current?.focus();
    return () => {
      document.body.style.overflow = scroll;
      if (soltarElNavegador) salirDePantallaCompletaDelNavegador();
      antes?.focus?.();
    };
  }, [soltarElNavegador]);

  // El foco no se va a la página de abajo: Tab da la vuelta adentro.
  const alTeclear = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Tab" || !ref.current) return;
    const todos = [...ref.current.querySelectorAll<HTMLElement>(ENFOCABLES)].filter((el) => el.offsetParent !== null);
    if (todos.length === 0) return;
    const primero = todos[0];
    const ultimo = todos[todos.length - 1];
    const activo = document.activeElement;
    if (e.shiftKey && (activo === primero || activo === ref.current)) {
      e.preventDefault();
      ultimo.focus();
    } else if (!e.shiftKey && activo === ultimo) {
      e.preventDefault();
      primero.focus();
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(
    <div
      ref={ref}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-label={etiqueta}
      onKeyDown={alTeclear}
      // Con portal, los clics de adentro burbujean por el árbol de React hasta quien lo abrió.
      onClick={(e) => e.stopPropagation()}
      className={cn("fixed inset-0 bg-surface-muted text-fg outline-none", zClass("MODAL"), className)}
    >
      {children}
    </div>,
    document.body,
  );
}
