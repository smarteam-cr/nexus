"use client";

/**
 * DatePickerField — selector de fecha genérico de Nexus. Mismo react-day-picker
 * (popover oscuro + título del mes alineado a la grilla) que AnchorDatePicker, pero
 * con trigger genérico para reusarlo en cualquier campo de fecha. value/onChange en
 * "yyyy-mm-dd" ("" = sin fecha; "Borrar" emite "").
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

export default function DatePickerField({
  value,
  onChange,
  placeholder = "Elegir fecha",
  /** Resalta el campo cuando el valor es un override manual (vs. derivado). */
  manual = false,
}: {
  value: string;
  onChange: (ymd: string) => void;
  placeholder?: string;
  manual?: boolean;
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
        className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1 border transition-colors hover:border-gray-600 ${
          manual ? "text-fg-secondary bg-surface-hover border-line" : "text-fg-muted bg-surface-muted border-line"
        }`}
      >
        <CalendarIcon />
        {selected ? fmtLabel(selected) : placeholder}
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1.5 z-[65] rounded-xl border border-gray-700 bg-gray-900 shadow-xl p-2">
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
