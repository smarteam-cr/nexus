"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useRef } from "react";
import { cn } from "@/lib/cn";

// ── Tabs ───────────────────────────────────────────────────────────────────────
//
// LA tab-bar del proyecto. Por qué existe: había ~13 implementaciones a mano con
// CERO `role="tab"` en toda la app y 4 convenciones de color activo distintas
// (blanco crudo, fg, brand, brand-light). Este archivo fija UNA convención y pone
// la accesibilidad (tablist/tab/aria-selected + flechas) donde nadie tiene que
// recordarla. El ratchet DEUDA_TABBARS frena las copias nuevas.
//
// DOS modos, según el shape de los items:
//   - ESTADO (`value` + `onChange`): tabs que cambian un panel en la misma página.
//     Semántica role="tablist"/"tab", roving tabindex, ←/→/Home/End con activación
//     automática (la selección sigue al foco — patrón APG para tabs simples).
//   - NAVEGACIÓN (todos los items traen `href`): tabs que son rutas. Renderiza
//     <nav aria-label> + <Link aria-current="page">; activo por usePathname.
//
// Las variantes espejan 1:1 a SkeletonTabs (Skeleton.tsx) — el par carga/cargado:
//   underline → subrayado border-b-2 (workspace, secciones)
//   pill      → chip rounded-lg h-[30px] (filtros tipo /clients)

export interface TabItem<K extends string = string> {
  key: K;
  label: React.ReactNode;
  /** Badge numérico a la derecha del label (patrón cobranza/clients). */
  count?: number;
  disabled?: boolean;
  /** Si TODOS los items lo traen, el componente entra en modo navegación. */
  href?: string;
}

export interface TabsProps<K extends string = string> {
  items: readonly TabItem<K>[];
  /** Modo estado (controlado). */
  value?: K;
  onChange?: (key: K) => void;
  variant?: "underline" | "pill";
  size?: "sm" | "md";
  /** Nombre accesible del grupo — obligatorio por tipo, como en IconButton. */
  "aria-label": string;
  className?: string;
}

const UNDERLINE_SIZE = {
  sm: "px-3 py-1.5 text-xs font-medium",
  md: "px-3 py-2 text-sm",
} as const;

function tabClass(variant: "underline" | "pill", size: "sm" | "md", active: boolean, disabled?: boolean) {
  if (variant === "pill") {
    return cn(
      "text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors",
      active
        ? "bg-brand/15 text-brand border-brand/30"
        : "bg-surface text-fg-muted border-line hover:text-fg-secondary",
      disabled && "opacity-50 pointer-events-none",
    );
  }
  return cn(
    "border-b-2 -mb-px transition-colors",
    UNDERLINE_SIZE[size],
    active
      ? "border-brand text-fg font-medium"
      : "border-transparent text-fg-muted hover:text-fg-secondary",
    disabled && "opacity-50 pointer-events-none",
  );
}

function containerClass(variant: "underline" | "pill", className?: string) {
  return variant === "pill"
    ? cn("flex items-center gap-2 flex-wrap", className)
    : cn("flex flex-wrap gap-1 border-b border-line", className);
}

function CountBadge({ count }: { count?: number }) {
  if (count === undefined) return null;
  return <span className="ml-1 tabular-nums opacity-70">{count}</span>;
}

export function Tabs<K extends string = string>({
  items,
  value,
  onChange,
  variant = "underline",
  size = "md",
  "aria-label": ariaLabel,
  className,
}: TabsProps<K>) {
  const pathname = usePathname();
  const refs = useRef(new Map<K, HTMLButtonElement>());
  const navMode = items.length > 0 && items.every((it) => it.href);

  if (navMode) {
    return (
      <nav aria-label={ariaLabel} className={containerClass(variant, className)}>
        {items.map((it) => {
          const active = pathname.startsWith(it.href!);
          return (
            <Link
              key={it.key}
              href={it.href!}
              aria-current={active ? "page" : undefined}
              className={tabClass(variant, size, active, it.disabled)}
            >
              {it.label}
              <CountBadge count={it.count} />
            </Link>
          );
        })}
      </nav>
    );
  }

  const enabled = items.filter((it) => !it.disabled);
  const move = (dir: 1 | -1 | "home" | "end") => {
    if (enabled.length === 0) return;
    const i = enabled.findIndex((it) => it.key === value);
    const next =
      dir === "home" ? enabled[0]
      : dir === "end" ? enabled[enabled.length - 1]
      : enabled[(i + (dir === 1 ? 1 : enabled.length - 1)) % enabled.length];
    onChange?.(next.key);
    refs.current.get(next.key)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={containerClass(variant, className)}
      onKeyDown={(e) => {
        if (e.key === "ArrowRight") { e.preventDefault(); move(1); }
        else if (e.key === "ArrowLeft") { e.preventDefault(); move(-1); }
        else if (e.key === "Home") { e.preventDefault(); move("home"); }
        else if (e.key === "End") { e.preventDefault(); move("end"); }
      }}
    >
      {items.map((it) => {
        const active = it.key === value;
        return (
          <button
            key={it.key}
            ref={(el) => {
              if (el) refs.current.set(it.key, el);
              else refs.current.delete(it.key);
            }}
            type="button"
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            disabled={it.disabled}
            onClick={() => onChange?.(it.key)}
            className={tabClass(variant, size, active, it.disabled)}
          >
            {it.label}
            <CountBadge count={it.count} />
          </button>
        );
      })}
    </div>
  );
}
