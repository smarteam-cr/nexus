"use client";

/**
 * components/finanzas/equilibrio/FiltroDeFechas.tsx — el filtro de fechas de los gráficos del panorama (2026-11-13,
 * pedido de Finanzas 27: «hoy filtra por año»). El año, y dentro del año, desde qué mes hasta qué mes; con atajos para
 * lo de siempre (todo el año, lo que va del año, los últimos 6 o 3 meses).
 *
 * Filtra lo que se MIRA en «Mes a mes» y «Contra el gasto»: no cambia ningún número del año (el piso, el margen y la
 * barra de arriba siguen siendo del año entero). Cambiar de año vuelve a pedir el reporte de ese año.
 */
import { Segmentado, Selector } from "@/components/ui";
import { PRESETS_DE_RANGO, type PresetDeRango, type RangoDeMeses } from "@/lib/finanzas/panorama";

const MES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

export default function FiltroDeFechas({
  anio,
  anios,
  rango,
  preset,
  cargando,
  onAnio,
  onPreset,
  onRango,
}: {
  anio: number;
  /** Los años que se pueden elegir, del más nuevo al más viejo. */
  anios: number[];
  rango: RangoDeMeses;
  /** null = un rango a mano. */
  preset: PresetDeRango | null;
  cargando: boolean;
  onAnio: (anio: number) => void;
  onPreset: (p: PresetDeRango) => void;
  onRango: (r: RangoDeMeses) => void;
}) {
  const opcionesDeMes = MES_LARGO.map((nombre, i) => ({ value: `${anio}-${String(i + 1).padStart(2, "0")}`, label: nombre }));
  return (
    <div role="group" aria-label="Fechas de los gráficos" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-line bg-surface px-4 py-3">
      <span className="text-xs font-semibold text-fg-secondary">Fechas de los gráficos</span>
      <div className="w-[110px]">
        <Selector
          etiqueta="Año"
          placeholder="Año"
          valor={String(anio)}
          disabled={cargando}
          opciones={anios.map((a) => ({ value: String(a), label: String(a) }))}
          onElegir={(v) => onAnio(Number(v))}
        />
      </div>
      <Segmentado
        etiqueta="Atajos de fechas"
        valor={preset}
        onCambio={onPreset}
        opciones={PRESETS_DE_RANGO.map((p) => ({ clave: p.clave, etiqueta: p.etiqueta }))}
      />
      <div className="flex items-center gap-1.5 text-xs text-fg-secondary">
        <span>Desde</span>
        <div className="w-[130px]">
          <Selector etiqueta="Desde qué mes" placeholder="Mes" valor={rango.desde} opciones={opcionesDeMes} onElegir={(v) => onRango({ ...rango, desde: v })} />
        </div>
        <span>hasta</span>
        <div className="w-[130px]">
          <Selector etiqueta="Hasta qué mes" placeholder="Mes" valor={rango.hasta} opciones={opcionesDeMes} onElegir={(v) => onRango({ ...rango, hasta: v })} />
        </div>
      </div>
      {cargando && <span className="text-xs text-fg-muted">Cargando {anio}…</span>}
    </div>
  );
}
