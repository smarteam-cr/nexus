"use client";

/**
 * El esqueleto de las cuatro pestañas de /feedback (2026-10-06, diseño «Feedback · rediseño completo» en Claude
 * Design): el mismo de Clientes y Preventa. A la izquierda el título, las pestañas, una fila de herramientas
 * (filtros o resumen a la izquierda, acciones a la derecha) y el contenido; a la derecha el panel, a toda la
 * altura y con su flechita para plegarlo.
 *
 * Antes cada pestaña ponía su panel DEBAJO de las pestañas, en una franja de borde a borde (`-mx-6`) que se
 * cortaba donde terminaba el contenido: con la Bandeja vacía, media pantalla quedaba en blanco.
 *
 * Cada pestaña es un componente de cliente que pinta el esqueleto entero, porque lo que va en el panel depende de
 * lo que se eligió (el reporte de la Bandeja, el tema de la hoja de ruta).
 */
import type { ReactNode } from "react";
import { Input } from "@/components/ui/Input";
import { Menu } from "@/components/ui/Menu";
import PanelLateral from "@/components/ui/PanelLateral";
import { cn } from "@/lib/cn";
import { SHELL_DEFAULT } from "@/lib/ui/page-shell";

export function DisposicionDeFeedback({
  encabezado,
  herramientas,
  panel,
  etiquetaPanel,
  anchoPanel = "lg:w-[340px]",
  children,
}: {
  /** El título y las pestañas (los arma la página). */
  encabezado: ReactNode;
  /** La fila de herramientas: los filtros o el resumen, y las acciones. */
  herramientas?: ReactNode;
  panel: ReactNode;
  /** El nombre del panel: lo dice la flechita al plegarlo («Ocultar decidir»). */
  etiquetaPanel: string;
  /** El ancho del panel abierto. Se anima al cambiar (la hoja de ruta lo ensancha al abrir un tema). */
  anchoPanel?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col lg:min-h-screen lg:flex-row">
      <main className={cn(SHELL_DEFAULT, "min-w-0 flex-1 space-y-5 pb-12")}>
        {encabezado}
        {herramientas && <div className="flex flex-wrap items-center justify-between gap-3">{herramientas}</div>}
        {children}
      </main>
      <PanelLateral etiqueta={etiquetaPanel} ancho={anchoPanel} gap="gap-5">
        {panel}
      </PanelLateral>
    </div>
  );
}

/** Un filtro de la fila de herramientas: el botón blanco con su flecha, como el resto de Nexus. */
export function FiltroDeMenu<K extends string>({
  etiqueta,
  valor,
  opciones,
  onCambio,
}: {
  /** Qué filtra («Tipo»): va en el title del botón. */
  etiqueta: string;
  valor: K;
  opciones: readonly { clave: K; nombre: string }[];
  onCambio: (k: K) => void;
}) {
  const actual = opciones.find((o) => o.clave === valor)?.nombre ?? etiqueta;
  return (
    <Menu
      align="end"
      triggerTitle={etiqueta}
      triggerClassName="inline-flex items-center gap-1.5 rounded-lg border border-line bg-surface py-[7px] pl-3 pr-2.5 text-[13px] text-fg-secondary transition-colors hover:bg-surface-hover hover:text-fg"
      trigger={(abierto) => (
        <>
          {actual}
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={cn("h-3.5 w-3.5 text-fg-muted transition-transform", abierto && "rotate-180")}
            aria-hidden="true"
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </>
      )}
      items={opciones.map((o) => ({
        key: o.clave,
        label: (
          <span className="flex w-full items-center justify-between gap-3">
            <span>{o.nombre}</span>
            {o.clave === valor && <span className="text-brand">✓</span>}
          </span>
        ),
        onSelect: () => onCambio(o.clave),
      }))}
    />
  );
}

/** El buscador de la fila de herramientas. */
export function Buscador({ valor, onCambio, placeholder, etiqueta }: { valor: string; onCambio: (v: string) => void; placeholder: string; etiqueta: string }) {
  return (
    <span className="relative block">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-fg-muted"
        aria-hidden="true"
      >
        <path d="M21 21l-4.35-4.35M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14z" />
      </svg>
      <Input
        value={valor}
        onChange={(e) => onCambio(e.target.value)}
        placeholder={placeholder}
        aria-label={etiqueta}
        className="w-full bg-surface py-[7px] pl-8 pr-2.5 text-[13px] sm:w-[260px]"
      />
    </span>
  );
}
