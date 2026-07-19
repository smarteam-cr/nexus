"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";

// ── Menu ───────────────────────────────────────────────────────────────────────
//
// Dropdown de acciones accesible — el patrón que vivía dentro de UserAvatar
// (Sidebar.tsx) extraído como primitiva. La app tenía sus dropdowns como
// `fixed inset-0` + lista de <button> sin role="menu" ni teclado; este archivo
// es la ÚNICA implementación de esa mecánica de ahora en más:
//
//   - position:fixed calculada desde el trigger → escapa de overflow-hidden
//     (el bug del rail colapsado que recortaba el desplegable).
//   - cierre por click-afuera, Escape, resize y scroll EXTERNO (el scroll de
//     adentro del menú no lo cierra — fase de captura, conocimiento heredado).
//   - role="menu"/"menuitem", flechas ↑/↓ + Home/End, aria-expanded en el trigger.
//
// Tipos de ítem: `href` → Link · `onSelect` → button · `formAction` → POST
// (ej. /auth/signout). `keepOpen` para toggles que no deben cerrar (tema).

export interface MenuItemDef {
  key: string;
  label: React.ReactNode;
  icon?: React.ReactNode;
  onSelect?: () => void;
  /** Ítem de navegación (gana sobre onSelect). */
  href?: string;
  /** Ítem que POSTea a una ruta (ej. cerrar sesión). Gana sobre href/onSelect. */
  formAction?: string;
  /** Rojo — acciones destructivas (Cerrar sesión, Eliminar). */
  danger?: boolean;
  disabled?: boolean;
  separatorBefore?: boolean;
  /** No cierra el menú al seleccionar (toggles, ej. modo claro/oscuro). */
  keepOpen?: boolean;
}

export interface MenuProps {
  /** Contenido del trigger; recibe el estado open (para rotar un chevron). */
  trigger: React.ReactNode | ((open: boolean) => React.ReactNode);
  items: MenuItemDef[];
  /** Encabezado no-interactivo (ej. el email del usuario). */
  header?: React.ReactNode;
  /** Lado donde abre el panel relativo al trigger. */
  side?: "top" | "bottom";
  align?: "start" | "end";
  /** Clases del BOTÓN trigger (Menu renderiza su propio <button>). */
  triggerClassName?: string;
  /** Tooltip nativo del trigger (ej. el nombre cuando el rail está colapsado). */
  triggerTitle?: string;
  /** Ancho del panel (clase Tailwind). */
  panelWidth?: string;
  /** aria-label del menú cuando el trigger no tiene texto legible. */
  "aria-label"?: string;
}

export function Menu({
  trigger,
  items,
  header,
  side = "bottom",
  align = "start",
  triggerClassName,
  triggerTitle,
  panelWidth = "w-56",
  "aria-label": ariaLabel,
}: MenuProps) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<React.CSSProperties | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const computePos = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const style: React.CSSProperties = {};
    if (side === "top") style.bottom = window.innerHeight - r.top + 6;
    else style.top = r.bottom + 6;
    if (align === "start") style.left = r.left;
    else style.right = window.innerWidth - r.right;
    setPos(style);
  };

  const toggle = () => {
    if (!open) computePos();
    setOpen((p) => !p);
  };

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onScroll(e: Event) {
      // El menú es position:fixed (coords congeladas al abrir); un scroll externo lo
      // desancla → cerrar. El scroll INTERNO (maxHeight) no cuenta: es descendiente.
      if (rootRef.current && e.target instanceof Node && rootRef.current.contains(e.target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpen(false);
        btnRef.current?.focus();
        return;
      }
      if (e.key !== "ArrowDown" && e.key !== "ArrowUp" && e.key !== "Home" && e.key !== "End") return;
      const els = Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [],
      );
      if (els.length === 0) return;
      e.preventDefault();
      const i = els.indexOf(document.activeElement as HTMLElement);
      const next =
        e.key === "Home" ? 0
        : e.key === "End" ? els.length - 1
        : e.key === "ArrowDown" ? (i + 1) % els.length
        : (i - 1 + els.length) % els.length;
      els[next]?.focus();
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", computePos);
    window.addEventListener("scroll", onScroll, true);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", computePos);
      window.removeEventListener("scroll", onScroll, true);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- computePos es estable por render
  }, [open]);

  const itemClass = (it: MenuItemDef) =>
    cn(
      "w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors text-left",
      it.danger ? "text-red-400 hover:bg-red-500/10" : "text-fg-secondary hover:bg-surface-hover",
      it.disabled && "opacity-50 pointer-events-none",
    );

  const select = (it: MenuItemDef) => {
    it.onSelect?.();
    if (!it.keepOpen) setOpen(false);
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={ariaLabel}
        title={triggerTitle}
        className={triggerClassName}
      >
        {typeof trigger === "function" ? trigger(open) : trigger}
      </button>

      {open && pos && (
        <div
          ref={panelRef}
          role="menu"
          className={cn(
            "fixed z-50 bg-surface border border-line rounded-xl shadow-xl py-1.5 overflow-y-auto",
            panelWidth,
          )}
          style={{ ...pos, maxHeight: "calc(100vh - 16px)" }}
        >
          {header && <div className="px-3 py-2 border-b border-line">{header}</div>}
          {items.map((it) => {
            const inner = (
              <>
                {it.icon && <span className="flex-shrink-0">{it.icon}</span>}
                {it.label}
              </>
            );
            const sep = it.separatorBefore && <div className="my-1 border-t border-line" />;
            if (it.formAction) {
              return (
                <div key={it.key}>
                  {sep}
                  <form action={it.formAction} method="post">
                    <button type="submit" role="menuitem" disabled={it.disabled} className={itemClass(it)}>
                      {inner}
                    </button>
                  </form>
                </div>
              );
            }
            if (it.href) {
              return (
                <div key={it.key}>
                  {sep}
                  <Link href={it.href} role="menuitem" onClick={() => select(it)} className={itemClass(it)}>
                    {inner}
                  </Link>
                </div>
              );
            }
            return (
              <div key={it.key}>
                {sep}
                <button type="button" role="menuitem" disabled={it.disabled} onClick={() => select(it)} className={itemClass(it)}>
                  {inner}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
