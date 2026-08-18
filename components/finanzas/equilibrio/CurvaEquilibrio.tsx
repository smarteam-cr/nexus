"use client";

/**
 * components/finanzas/equilibrio/CurvaEquilibrio.tsx
 *
 * La curva mensual: cinco líneas (egresos, facturado, cobrado, ingresos totales y el
 * piso) más las barras del partnership. Molde: CajaNetaPanel, el único chart mixto del
 * repo.
 *
 * ⚠ TRES COSAS QUE NO SE VEN VENIR Y CUESTAN UNA TARDE:
 *
 *  1. `animation: false` es obligatorio. EChartRenderer renderiza con `notMerge`, así
 *     que cada rebuild del `option` reemplaza el gráfico entero — y el option se
 *     reconstruye con cada hover de indicador y con cada tecla del escenario. Con la
 *     animación por defecto, la curva parpadea sin parar.
 *  2. El punto de equilibrio va como SERIE de línea constante y no como `markLine`:
 *     así aparece en la leyenda y se puede enfocar desde su indicador. Visualmente es
 *     idéntico (12 puntos con el mismo y, sin símbolo, punteado).
 *  3. Las bandas de meses parciales usan índices FRACCIONARIOS (i − 0.5 → j + 0.5). En
 *     un eje categórico, de "nov" a "dic" pinta del centro de uno al centro del otro y
 *     la banda queda corrida media columna.
 *
 * El enfoque de serie nace en los indicadores (que son React) y baja como prop: el
 * renderer no expone eventos del chart, así que el gráfico es un consumidor pasivo.
 */
import { useMemo } from "react";
import EChartRenderer from "@/components/charts/EChartRenderer";
import { useChartColors } from "@/hooks/useChartColors";
import { baseTooltip, SERIES_PALETTE } from "@/components/cs/dashboard/chart-theme";
import { TIPO_SERVICIO_LABEL } from "@/lib/cobranza/schema";
import { fmtMonto } from "@/components/cobranza/format";
import type { MesEfectivo } from "@/lib/cobranza/equilibrio-escenario";

export type SerieKey = "egresos" | "facturado" | "cobrado" | "ingresosTotales" | "equilibrio" | "partnership";

const MES_CORTO = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

/** Eje Y compacto: 25000 → "25k" (espejo local, igual que en CajaNetaPanel). */
function compactNum(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `${(v / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${(v / 1_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}k`;
  return String(v);
}

/** Rachas de meses consecutivos que cumplen el predicado, como pares [desde, hasta]. */
function tramos(meses: readonly MesEfectivo[], pred: (m: MesEfectivo) => boolean): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  let inicio: number | null = null;
  meses.forEach((m, i) => {
    if (pred(m)) {
      if (inicio === null) inicio = i;
      if (i === meses.length - 1) out.push([inicio, i]);
    } else if (inicio !== null) {
      out.push([inicio, i - 1]);
      inicio = null;
    }
  });
  return out;
}

interface Props {
  meses: MesEfectivo[];
  equilibrio: number;
  moneda: string;
  enfoque: SerieKey | null;
  haySimulacion: boolean;
}

export default function CurvaEquilibrio({ meses, equilibrio, moneda, enfoque, haySimulacion }: Props) {
  const colors = useChartColors();

  const option = useMemo(() => {
    // El "negro" del reporte original se traduce al neutro fuerte del tema: un negro
    // literal desaparece en modo oscuro.
    const COLOR: Record<SerieKey, string> = {
      egresos: colors.axisLabelStrong,
      facturado: SERIES_PALETTE[0]!,
      cobrado: SERIES_PALETTE[3]!,
      ingresosTotales: SERIES_PALETTE[1]!,
      equilibrio: SERIES_PALETTE[2]!,
      // ⚠ NO el mismo verde que `cobrado`: compartían índice de paleta y las barras del
      // aliado se confundían con la línea de la caja cobrada, que es justo la que uno
      // busca de un vistazo. El verde queda reservado a la plata que entró.
      partnership: SERIES_PALETTE[6]!,
    };
    const atenuada = (k: SerieKey) => enfoque !== null && enfoque !== k;
    /**
     * ⚠ `opts` es un objeto CERRADO de dos banderas y no un `extra` libre, a propósito.
     * La versión anterior recibía un objeto que se esparcía al final, así que un
     * `{ lineStyle: { type: "dashed" } }` REEMPLAZABA el lineStyle entero y se llevaba
     * puestas la opacidad del enfoque y el grosor. Efecto: las dos series punteadas no
     * se apagaban nunca al enfocar otra, y al enfocarlas ellas no se engrosaban —
     * mientras sus círculos, que sí conservaban la opacidad, se apagaban solos. Se veía
     * exactamente como se sentía: roto. Con dos banderas no hay forma de que vuelva.
     */
    const linea = (
      name: string,
      k: SerieKey,
      data: number[],
      opts: { punteada?: boolean; sinSimbolo?: boolean } = {},
    ) => ({
      name,
      type: "line" as const,
      data,
      // Recta, NO suavizada: entre febrero y marzo no hay nada, y una curva suave
      // dibujaba ahí un pico más alto que febrero que nunca ocurrió.
      smooth: false,
      symbolSize: 6,
      // Un mes sin dato es un HUECO, nunca un cero (misma regla que ReportesPanel).
      connectNulls: false,
      itemStyle: { color: COLOR[k], opacity: atenuada(k) ? 0.15 : 1 },
      lineStyle: {
        color: COLOR[k],
        width: enfoque === k ? 3 : 2,
        opacity: atenuada(k) ? 0.15 : 1,
        ...(opts.punteada ? { type: "dashed" as const } : {}),
      },
      ...(opts.sinSimbolo ? { symbol: "none" as const } : {}),
      z: enfoque === k ? 5 : 2,
    });

    const parciales = tramos(meses, (m) => m.estado === "PARCIAL");

    return {
      animation: false, // ⚠ ver el punto 1 de la cabecera
      tooltip: {
        ...baseTooltip(colors),
        trigger: "axis",
        confine: true,
        formatter: (params: Array<{ dataIndex?: number }>) => {
          const i = params?.[0]?.dataIndex ?? 0;
          const m = meses[i];
          if (!m) return "";
          // HTML fuera de React: los colores van INLINE con hex del tema. Una clase de
          // Tailwind acá ni siquiera se generaría.
          const tenue = `color:${colors.axisLabel};font-size:11px`;
          const fila = (etq: string, val: number | null, color?: string) =>
            `<div style="display:flex;gap:16px;justify-content:space-between">` +
            `<span>${
              color
                ? `<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${color};margin-right:6px"></span>`
                : ""
            }${etq}</span>` +
            `<b>${val === null ? "sin dato" : fmtMonto(val, moneda)}</b></div>`;

          const servicios = Object.entries(m.facturadoPorServicio)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(
              ([k, v]) =>
                `<div style="${tenue}">${TIPO_SERVICIO_LABEL[k] ?? k}: ${fmtMonto(v, moneda)}</div>`,
            )
            .join("");
          const sep = `<div style="border-top:1px solid ${colors.tooltipBorder};margin:6px 0"></div>`;

          return [
            `<div style="font-weight:600;margin-bottom:6px">${MES_CORTO[i]}`,
            m.estado === "PARCIAL" ? `<span style="${tenue}"> · egreso parcial</span>` : "",
            m.simulado ? `<span style="${tenue}"> · simulado</span>` : "",
            `</div>`,
            fila("Egresos", m.egresos, COLOR.egresos),
            fila("Facturado", m.facturadoEfectivo, COLOR.facturado),
            fila("Cobrado", m.cobrado, COLOR.cobrado),
            m.partnership > 0 ? fila("Partnership", m.partnership, COLOR.partnership) : "",
            fila("Ingresos totales", m.ingresosTotales, COLOR.ingresosTotales),
            m.pendienteFacturar > 0 ? `${sep}${fila("Pendiente de facturar", m.pendienteFacturar)}` : "",
            servicios ? `<div style="margin-top:4px">${servicios}</div>` : "",
            sep,
            fila(m.brecha >= 0 ? "Sobre los egresos" : "Brecha", m.brecha),
          ].join("");
        },
      },
      legend: { top: 0, textStyle: { color: colors.legendText, fontSize: 11 }, icon: "roundRect" },
      grid: { left: 8, right: 8, top: 34, bottom: 8, containLabel: true },
      xAxis: {
        type: "category",
        data: MES_CORTO,
        axisLabel: { color: colors.axisLabel, fontSize: 11 },
        axisLine: { lineStyle: { color: colors.gridLine } },
        axisTick: { show: false },
      },
      yAxis: {
        type: "value",
        axisLabel: { color: colors.axisLabel, fontSize: 10, formatter: (v: number) => compactNum(v) },
        splitLine: { lineStyle: { color: colors.gridLine, type: "dashed" } },
      },
      series: [
        {
          name: "Partnership",
          type: "bar",
          data: meses.map((m) => m.partnership),
          itemStyle: {
            color: COLOR.partnership,
            opacity: atenuada("partnership") ? 0.08 : 0.32,
            borderRadius: [4, 4, 0, 0],
          },
          barMaxWidth: 26,
          z: 1,
          // Las bandas viven en UNA sola serie: repetidas en cada una se pintan seis
          // veces y el gris queda seis veces más oscuro.
          markArea: {
            silent: true,
            itemStyle: { color: colors.gridLine, opacity: 0.5 },
            data: parciales.map(([i, j]) => [
              {
                xAxis: i - 0.5,
                label: {
                  show: true,
                  position: "insideTop",
                  formatter: "Parcial",
                  color: colors.axisLabel,
                  fontSize: 10,
                },
              },
              { xAxis: j + 0.5 },
            ]),
          },
        },
        linea("Egresos", "egresos", meses.map((m) => m.egresos)),
        // Punteada mientras haya escenario: el conjunto ya no es el real.
        linea("Facturado", "facturado", meses.map((m) => m.facturadoEfectivo), { punteada: haySimulacion }),
        linea("Cobrado", "cobrado", meses.map((m) => m.cobrado)),
        linea("Ingresos totales", "ingresosTotales", meses.map((m) => m.ingresosTotales), { punteada: true }),
        // El piso es una línea de REFERENCIA: sin símbolos, porque no hay un "dato de
        // marzo" que marcar — es el mismo número los doce meses.
        linea("Punto de equilibrio", "equilibrio", meses.map(() => equilibrio), {
          punteada: true,
          sinSimbolo: true,
        }),
      ],
    };
  }, [meses, equilibrio, moneda, enfoque, haySimulacion, colors]);

  return <EChartRenderer option={option} height={320} className="bg-surface" />;
}
