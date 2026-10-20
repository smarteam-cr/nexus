/**
 * components/para-ti/inicio/piezas.tsx — las clases y piezas chicas del inicio (ficha D, 2026-10-17), medida por
 * medida del diseño «Para ti · Ventas y CSE». Solo tokens semánticos.
 */
import Link from "next/link";
import type { MouseEvent, ReactNode } from "react";
import { cn } from "@/lib/cn";

/** La tarjeta blanca con borde del diseño (`.card`). */
export const TARJETA = "rounded-xl border border-line bg-surface";
/** El título de una tarjeta. */
export const TITULO = "text-[15px] font-semibold leading-5 text-fg";
/** Un enlace con forma de botón blanco (`.btnb`). */
export const ENLACE_BOTON =
  "inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line bg-surface px-2.5 py-[5px] text-xs font-medium text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg";
/** Un enlace azul de texto. */
export const ENLACE = "text-[13px] font-medium text-brand transition-colors hover:text-brand-light";

const esExterno = (href: string) => /^https?:\/\//.test(href);

/** Un enlace a Nexus o, si es de afuera (Google Calendar, HubSpot), en una pestaña nueva. */
export function EnlaceDelInicio({
  href,
  className,
  children,
  title,
  onClick,
}: {
  href: string;
  className?: string;
  children: ReactNode;
  title?: string;
  onClick?: (e: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return esExterno(href) ? (
    <a href={href} target="_blank" rel="noreferrer" className={className} title={title} onClick={onClick}>
      {children}
    </a>
  ) : (
    <Link href={href} className={className} title={title} onClick={onClick}>
      {children}
    </Link>
  );
}

/** El punto de color (8 px). */
export function Punto({ className }: { className: string }) {
  return <span aria-hidden className={cn("inline-block h-2 w-2 flex-none rounded-full", className)} />;
}

/** El color del punto de cada salud de cuenta. */
export const PUNTO_DE_SALUD: Record<string, string> = {
  riesgo: "bg-destructive",
  senales: "bg-warning",
  bien: "bg-success",
  espera: "bg-fg-muted",
  "sin-datos": "border-[1.5px] border-line bg-transparent",
};

export const NOMBRE_DE_SALUD: Record<string, string> = {
  riesgo: "Riesgo alto",
  senales: "Señales de riesgo",
  bien: "Va bien",
  espera: "En espera del cliente",
  "sin-datos": "Sin datos",
};
