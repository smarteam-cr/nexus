/**
 * CabeceraDeFicha — la barra de arriba de una ficha a pantalla completa: volver, el nombre, sus chips
 * y las acciones a la derecha.
 *
 * Salió del layout del cliente (2026-10-01) para que la exploración de venta tenga el MISMO caparazón
 * que la ficha del cliente y del proyecto (pedido de Elías: «copiar la interfaz, incluso para
 * reutilizar código»). Es presentacional y sirve en un Server Component: lo que cambia entre fichas
 * entra por props.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { BotonRecorrido } from "@/components/recorridos/BotonRecorrido";

export function CabeceraDeFicha({
  volver,
  titulo,
  chips,
  acciones,
  recorrido,
}: {
  volver: { href: string; etiqueta: string };
  titulo: string;
  /** Lo que va al lado del nombre: la categoría, la empresa de HubSpot, el chip HS. */
  chips?: ReactNode;
  acciones?: ReactNode;
  /** El id del recorrido guiado de la ficha (lib/recorridos/registro.ts): «Recorrido» va primero en las acciones. */
  recorrido?: string;
}) {
  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b border-line px-4">
      <div className="flex min-w-0 items-center gap-3">
        <Link href={volver.href} className="flex flex-shrink-0 items-center gap-1 text-xs text-fg-muted transition-colors hover:text-fg">
          <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          {volver.etiqueta}
        </Link>
        <div className="h-4 w-px flex-shrink-0 bg-line" aria-hidden />
        <div className="flex min-w-0 items-center gap-2">
          <span className="truncate text-sm font-semibold text-fg">{titulo}</span>
          {chips}
        </div>
      </div>
      {(acciones || recorrido) && (
        <div className="flex flex-shrink-0 items-center gap-2">
          {recorrido && <BotonRecorrido recorrido={recorrido} variante="cabecera" />}
          {acciones}
        </div>
      )}
    </header>
  );
}

/** El chip «HS»: verde si hay HubSpot conectado; si no, gris y (con `href`) lleva a conectarlo. */
export function ChipHubspot({ conectado, title, href }: { conectado: boolean; title?: string; href?: string }) {
  const cuerpo = (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${conectado ? "bg-success" : "bg-fg-muted"}`} aria-hidden />
      HS
    </>
  );
  const clase = conectado
    ? "flex flex-shrink-0 items-center gap-1 rounded border border-success-line bg-success-surface px-1.5 py-0.5 text-2xs font-medium text-success-ink"
    : "flex flex-shrink-0 items-center gap-1 rounded border border-line bg-surface-hover px-1.5 py-0.5 text-2xs font-medium text-fg-muted transition-colors hover:text-fg";
  return href ? (
    <Link href={href} className={clase} title={title} target={/^https?:/.test(href) ? "_blank" : undefined} rel="noreferrer">
      {cuerpo}
    </Link>
  ) : (
    <span className={clase} title={title}>
      {cuerpo}
    </span>
  );
}

/** Un enlace discreto de la derecha de la cabecera («Ver portal del cliente», «Ver en HubSpot»). */
export function AccionDeCabecera({ href, children, title, externa }: { href: string; children: ReactNode; title?: string; externa?: boolean }) {
  return (
    <Link
      href={href}
      title={title}
      target={externa ? "_blank" : undefined}
      rel={externa ? "noreferrer" : undefined}
      className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-fg-muted transition-colors hover:bg-surface-hover hover:text-fg"
    >
      {children}
    </Link>
  );
}
