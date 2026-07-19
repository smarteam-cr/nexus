"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

// ── BackLink ───────────────────────────────────────────────────────────────────
//
// EL "← volver" del proyecto. Convivían 3 patrones (Link-a-padre-fijo con "← X",
// router.back() con "← Volver", "Volver a lista") en tipografías distintas; esto
// fija UNO: chevron + destino, text-xs, fg-muted→fg. Con `href` navega al padre
// fijo (preferido: siempre aterriza donde dice); con `onClick` es un botón
// (para el caso history-back de /sessions).
//
// Regla de profundidad (§1-UI): detalle a profundidad 1 → BackLink;
// profundidad 2+ → <Breadcrumbs>.

const CLS =
  "inline-flex items-center gap-1 text-xs text-fg-muted hover:text-fg transition-colors";

const Chevron = () => (
  <svg className="w-3 h-3 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
  </svg>
);

export interface BackLinkProps {
  href?: string;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function BackLink({ href, onClick, children, className }: BackLinkProps) {
  if (href) {
    return (
      <Link href={href} className={cn(CLS, className)}>
        <Chevron />
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cn(CLS, className)}>
      <Chevron />
      {children}
    </button>
  );
}
