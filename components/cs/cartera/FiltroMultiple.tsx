"use client";

/**
 * Un filtro de varios valores a la vez (2026-10-09, la pestaña «Cartera»): un botón blanco con el nombre y cuántos
 * valores lleva, y un menú con una casilla por valor y cuántas cuentas lo tienen. El menú no se cierra al marcar.
 */
import { Menu, type MenuItemDef } from "@/components/ui";
import { cn } from "@/lib/cn";

export interface OpcionDeFiltro {
  clave: string;
  nombre: string;
  cuenta?: number;
}

function Casilla({ marcada }: { marcada: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "flex h-3.5 w-3.5 items-center justify-center rounded-[4px] border",
        marcada ? "border-brand bg-brand text-primary-fg" : "border-line bg-surface",
      )}
    >
      {marcada && (
        <svg viewBox="0 0 12 12" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M2.5 6.2l2.2 2.2 4.8-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
  );
}

export default function FiltroMultiple({
  nombre,
  opciones,
  valor,
  onCambio,
}: {
  nombre: string;
  opciones: readonly OpcionDeFiltro[];
  valor: readonly string[];
  onCambio: (v: string[]) => void;
}) {
  const elegidos = new Set(valor);
  const items: MenuItemDef[] = [
    ...(valor.length > 0
      ? [{ key: "__quitar", label: "Quitar el filtro", keepOpen: false, onSelect: () => onCambio([]) } satisfies MenuItemDef]
      : []),
    ...opciones.map(
      (o, i): MenuItemDef => ({
        key: o.clave,
        keepOpen: true,
        separatorBefore: i === 0 && valor.length > 0,
        icon: <Casilla marcada={elegidos.has(o.clave)} />,
        label: (
          <span className="flex w-full items-center justify-between gap-3">
            <span>{o.nombre}</span>
            {o.cuenta !== undefined && <span className="text-[11px] tabular-nums text-fg-muted">{o.cuenta}</span>}
          </span>
        ),
        onSelect: () => onCambio(elegidos.has(o.clave) ? valor.filter((x) => x !== o.clave) : [...valor, o.clave]),
      }),
    ),
  ];
  const resumen =
    valor.length === 0 ? null : valor.length === 1 ? (opciones.find((o) => o.clave === valor[0])?.nombre ?? valor[0]) : `${valor.length}`;
  return (
    <Menu
      align="start"
      panelWidth="w-64"
      items={items}
      triggerClassName={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] transition-colors",
        valor.length > 0 ? "border-info-line bg-info-surface text-brand" : "border-line bg-surface text-fg-secondary hover:bg-surface-hover",
      )}
      trigger={(abierto) => (
        <>
          {nombre}
          {resumen && <b className="max-w-[140px] truncate font-semibold">{resumen}</b>}
          <svg viewBox="0 0 12 12" aria-hidden className={cn("h-3 w-3 transition-transform", abierto && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="1.6">
            <path d="M3 4.5l3 3 3-3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </>
      )}
    />
  );
}
