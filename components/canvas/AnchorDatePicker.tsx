"use client";

/**
 * AnchorDatePicker — selector de la fecha de arranque del cronograma.
 *
 * Reemplaza el <input type="date"> nativo (que no se podía estilar y cuyo
 * calendario salía blanco). Popover oscuro a tono con la app vía react-day-picker,
 * con "Hoy" y "Borrar". value/onChange en formato "yyyy-mm-dd" ("" = sin fecha),
 * para encajar con el flujo existente (onSetAnchor → setDirty → «Guardar cronograma»).
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { DayPicker } from "react-day-picker";
import { es } from "react-day-picker/locale";
import { MONTHS } from "@/lib/timeline/weeks";

function ymdToDate(ymd: string): Date | undefined {
  if (!ymd) return undefined;
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return undefined;
  return new Date(y, m - 1, d); // local, sin corrimiento de zona horaria
}
function dateToYmd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
function fmtLabel(d: Date): string {
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// Tema oscuro: variables aplicadas inline en el root del DayPicker (le ganan a
// las declaraciones de .rdp-root del CSS base).
// Solo color de acento (azul de marca) + sin margen. Los TAMAÑOS quedan en el
// default de la librería (celdas y headers internamente alineados); overridearlos
// a mano desalineaba la grilla. El fondo/texto se adaptan al tema vía globals.css.
const RDP_DARK: CSSProperties = {
  "--rdp-accent-color": "#3b82f6",
  "--rdp-accent-background-color": "rgba(59,130,246,0.22)",
  "--rdp-today-color": "#60a5fa",
  margin: "0",
} as CSSProperties;

const CalendarIcon = () => (
  <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
  </svg>
);

export default function AnchorDatePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (ymd: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = ymdToDate(value);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Fecha de arranque del cronograma (se guarda con «Guardar cronograma»)"
        className={
          value
            ? "flex items-center gap-2 text-[11px] font-semibold text-gray-300 bg-gray-800/60 border border-gray-700 rounded-lg px-2.5 py-1 transition-colors hover:border-gray-600"
            : "flex items-center gap-2 text-[11px] font-semibold text-amber-300 bg-amber-500/15 border border-amber-500/50 rounded-lg px-3 py-1.5 transition-colors hover:bg-amber-500/20"
        }
      >
        <CalendarIcon />
        {selected ? (
          <>
            <span className="text-gray-500 font-medium">Arranque:</span>
            {fmtLabel(selected)}
          </>
        ) : (
          "Fijá la fecha de arranque para ver fechas reales"
        )}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-50 rounded-xl border border-gray-700 bg-gray-900 shadow-xl p-2">
          <DayPicker
            mode="single"
            selected={selected}
            onSelect={(d) => {
              if (d) {
                onChange(dateToYmd(d));
                setOpen(false);
              }
            }}
            defaultMonth={selected ?? new Date()}
            locale={es}
            showOutsideDays
            className="text-gray-200 text-sm"
            style={RDP_DARK}
            styles={{
              // El nombre del mes alineado a la IZQUIERDA con la grilla (la regla
              // de layout de la librería le metía sangría). nav queda absolute a la derecha.
              month_caption: { justifyContent: "flex-start", margin: 0, paddingInlineStart: "0.875rem" },
            }}
          />
          <div className="flex items-center justify-between px-2 pt-1.5 mt-1 border-t border-gray-800">
            <button
              type="button"
              onClick={() => {
                onChange("");
                setOpen(false);
              }}
              className="text-xs font-medium text-gray-500 hover:text-red-400 transition-colors"
            >
              Borrar
            </button>
            <button
              type="button"
              onClick={() => {
                onChange(dateToYmd(new Date()));
                setOpen(false);
              }}
              className="text-xs font-medium text-blue-400 hover:text-blue-300 transition-colors"
            >
              Hoy
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
