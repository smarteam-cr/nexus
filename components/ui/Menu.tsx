"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";
import { usePanelFlotante } from "./usePanelFlotante";

// ── Menu ───────────────────────────────────────────────────────────────────────
//
// Dropdown de acciones accesible — el patrón que vivía dentro de UserAvatar
// (Sidebar.tsx) extraído como primitiva. La app tenía sus dropdowns como
// `fixed inset-0` + lista de <button> sin role="menu" ni teclado; este archivo
// es la ÚNICA implementación de esa mecánica de ahora en más:
//
//   - role="menu"/"menuitem" y aria-expanded en el trigger.
//
// ⚠ LA MECÁNICA DEL PANEL YA NO VIVE ACÁ: se extrajo a `usePanelFlotante` cuando
// apareció el segundo desplegable de la app (CeldaSelect, el select editable de
// una celda de tabla). Copiar esas 40 líneas sutiles —position:fixed desde el
// trigger, el scroll externo que cierra pero el interno no, Escape que devuelve
// el foco— habría creado la segunda implementación que este encabezado juraba
// que no iba a existir. El hook las tiene, con el porqué de cada una.
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
  const {
    abierto: open,
    setAbierto: setOpen,
    alternar: toggle,
    pos,
    rootRef,
    btnRef,
    panelRef,
  } = usePanelFlotante({ side, align, selectorDeItems: '[role="menuitem"]:not([disabled])' });

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
