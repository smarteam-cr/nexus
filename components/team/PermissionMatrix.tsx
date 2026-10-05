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
 *
 * ── POR QUÉ SE PLIEGA POR ÁREA (rediseño 2026-10-05) ─────────────────────────
 * Son **24 áreas y 58 permisos**, y hasta hoy se pintaban los 58 a la vez: una pared de píldoras
 * donde las cincuenta y pico que están como corresponde pesan exactamente igual que las dos que
 * alguien cambió a mano. Encontrar en qué se aparta una persona de su rol era leerla entera.
 *
 * Casi siempre un área está ENTERA encendida o ENTERA apagada, y eso se dice con una palabra
 * («Todo», «Nada»). Las casillas aparecen donde de verdad hay mezcla —que es donde hay algo que
 * leer— o cuando alguien abre el área a propósito.
 *
 * ⚠ La mezcla decide solo cómo ARRANCA cada área (se toma una vez, al montar). Desde que alguien toca
 * la cabecera, el área es suya: una mezclada se puede plegar, y completarla desde sus casillas no la
 * cierra en la cara. La regla vive en lib/auth/permissions/matriz-plegable.ts, con su prueba.
 */
import { useState } from "react";
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";
import { alTocarCabecera, areasAbiertasAlInicio, estaAbierta } from "@/lib/auth/permissions/matriz-plegable";
import { IconCheck, IconX } from "@/components/ui";

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
  /** Cómo arranca cada área: abiertas las mezcladas AL MONTAR. Una vez; después no se recalcula. */
  const [alInicio] = useState(() =>
    areasAbiertasAlInicio(
      PERMISSION_SECTIONS.map((section) => {
        const actions = section.actions.filter((a) => a.enforced);
        return {
          key: section.key,
          encendidas: actions.filter((a) => getCell(section.key, a.key).checked).length,
          total: actions.length,
        };
      }),
    ),
  );
  /** Lo que la persona decidió al tocar la cabecera de cada área. Manda sobre cómo arrancó. */
  const [decididas, setDecididas] = useState<ReadonlyMap<string, boolean>>(() => new Map());

  return (
    <div className="divide-y divide-line rounded-lg border border-line">
      {PERMISSION_SECTIONS.map((section) => {
        const actions = section.actions.filter((a) => a.enforced);
        if (actions.length === 0) return null;
        const sectionPinned = actions.some((a) => getCell(section.key, a.key).pinned);
        const encendidas = actions.filter((a) => getCell(section.key, a.key).checked).length;
        const abierta = estaAbierta(section.key, decididas, alInicio);

        /* Poner un área entera en un valor: recorre sus acciones y toca SOLO las que hay que
           cambiar. No hay una API de «sección» más abajo, y fabricar una para esto sería inventar
           un segundo camino de escritura para el mismo dato. */
        const ponerTodas = (valor: boolean) => {
          for (const a of actions) {
            if (getCell(section.key, a.key).checked !== valor) onToggle?.(section.key, a.key);
          }
        };

        return (
          <div key={section.key} className="px-3 py-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setDecididas((prev) => alTocarCabecera(section.key, prev, alInicio))}
                className="flex flex-1 min-w-0 items-center gap-2 text-left"
                aria-expanded={abierta}
              >
                <svg
                  className={`w-3 h-3 flex-shrink-0 text-fg-muted transition-transform ${abierta ? "rotate-90" : ""}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
                <span className="text-xs font-medium text-fg-secondary truncate">{section.label}</span>
                {/* El resumen del área: una palabra donde antes había cinco píldoras. */}
                <span
                  className={[
                    "flex-shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                    encendidas === actions.length
                      ? "border-success-line bg-success-surface text-success-ink"
                      : encendidas === 0
                        ? "border-line bg-surface-muted text-fg-muted"
                        : "border-warn-line bg-warn-surface text-warn-ink",
                  ].join(" ")}
                >
                  {encendidas === actions.length
                    ? "Todo"
                    : encendidas === 0
                      ? "Nada"
                      : `${encendidas} de ${actions.length}`}
                </span>
                {sectionPinned && (
                  <span
                    aria-label={pinLabel}
                    title={pinLabel}
                    className="flex-shrink-0 h-2 w-2 rounded-full bg-warning"
                  />
                )}
              </button>

              {interactive && (
                <span className="flex-shrink-0 inline-flex rounded-lg bg-surface-hover p-0.5">
                  <button
                    type="button"
                    onClick={() => ponerTodas(false)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      encendidas === 0
                        ? "bg-surface text-fg shadow-segment"
                        : "text-fg-secondary hover:text-fg"
                    }`}
                  >
                    Nada
                  </button>
                  <button
                    type="button"
                    onClick={() => ponerTodas(true)}
                    className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                      encendidas === actions.length
                        ? "bg-surface text-fg shadow-segment"
                        : "text-fg-secondary hover:text-fg"
                    }`}
                  >
                    Todo
                  </button>
                </span>
              )}

              {sectionPinned && onResetSection && !disabled && (
                <button
                  type="button"
                  onClick={() => onResetSection(section.key)}
                  title="Restaurar herencia de esta sección"
                  className="flex-shrink-0 text-[11px] font-semibold text-brand hover:text-brand-light"
                >
                  Volver a la plantilla
                </button>
              )}
            </div>

            {/* Las casillas, solo cuando hay algo que mirar: mezcla, o alguien la abrió. */}
            {abierta && (
              <div className="mt-2 flex flex-wrap gap-1.5 pl-5">
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
                          ? "border-success-line bg-success-surface text-success-ink"
                          : "border-line bg-surface-muted text-fg-muted",
                        interactive ? "cursor-pointer hover:border-fg-muted" : "cursor-default",
                      ].join(" ")}
                    >
                      {cell.checked ? <IconCheck className="w-3 h-3" /> : <IconX className="w-3 h-3" />}
                      {action.label}
                      {cell.pinned && (
                        <span
                          aria-label={pinLabel}
                          className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-warning ring-2 ring-surface"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
