"use client";

/**
 * PermissionMatrix — la matriz SECCIÓN × ACCIÓN, presentacional y reusable.
 *
 * Itera el registry client-safe (PERMISSION_SECTIONS) mostrando SOLO las
 * acciones `enforced` (nunca un switch mentiroso: lo no cableado no aparece).
 * El estado de cada celda lo decide el padre vía `getCell`:
 *   - checked: valor EFECTIVO que rige
 *   - pinned:  la celda difiere de su capa base (override de usuario, o
 *              plantilla ≠ default) → se pinta sólida con punto; heredada = tenue
 * La usan MemberPermissionsModal (tri-estado con overrides) y
 * RoleTemplatesPanel (bi-estado plantilla vs default).
 */
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";

export interface MatrixCellState {
  checked: boolean;
  pinned: boolean;
}

interface Props {
  getCell: (section: string, action: string) => MatrixCellState;
  /** Ausente = solo lectura. */
  onToggle?: (section: string, action: string) => void;
  /** "Restaurar herencia" de una sección (visible si tiene celdas pinned). */
  onResetSection?: (section: string) => void;
  disabled?: boolean;
  /** Tooltip del punto de pin (ej. "Pineado para este usuario"). */
  pinLabel?: string;
}

export default function PermissionMatrix({
  getCell,
  onToggle,
  onResetSection,
  disabled = false,
  pinLabel = "Distinto de lo heredado",
}: Props) {
  const interactive = !!onToggle && !disabled;

  return (
    <div className="divide-y divide-line rounded-lg border border-line">
      {PERMISSION_SECTIONS.map((section) => {
        const actions = section.actions.filter((a) => a.enforced);
        if (actions.length === 0) return null;
        const sectionPinned = actions.some((a) => getCell(section.key, a.key).pinned);

        return (
          <div key={section.key} className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start">
            <div className="flex w-40 flex-shrink-0 items-center gap-1.5 pt-0.5">
              <span className="text-xs font-medium text-fg-secondary">{section.label}</span>
              {sectionPinned && onResetSection && !disabled && (
                <button
                  type="button"
                  onClick={() => onResetSection(section.key)}
                  title="Restaurar herencia de esta sección"
                  className="text-[10px] text-amber-500/90 underline decoration-dotted underline-offset-2 hover:text-amber-400"
                >
                  restaurar
                </button>
              )}
            </div>
            <div className="flex flex-1 flex-wrap gap-1.5">
              {actions.map((action) => {
                const cell = getCell(section.key, action.key);
                return (
                  <button
                    key={action.key}
                    type="button"
                    disabled={!interactive}
                    onClick={() => onToggle?.(section.key, action.key)}
                    title={cell.pinned ? `${action.label} — ${pinLabel}` : action.label}
                    className={[
                      "relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] leading-none transition-colors",
                      cell.checked
                        ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-500"
                        : "border-line bg-surface-muted text-fg-muted",
                      cell.pinned ? "" : "opacity-75",
                      interactive ? "cursor-pointer hover:border-fg-muted/50" : "cursor-default",
                    ].join(" ")}
                  >
                    <span aria-hidden="true">{cell.checked ? "✓" : "✕"}</span>
                    {action.label}
                    {cell.pinned && (
                      <span
                        aria-label={pinLabel}
                        className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-amber-400 ring-2 ring-surface"
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
