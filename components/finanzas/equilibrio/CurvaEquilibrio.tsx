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

export type SerieKey =
  | "egresos"
  | "vendido"
  | "facturado"
  | "cobrado"
  | "ingresosTotales"
  | "equilibrio"
  | "partnership";

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

/** Cómo se dibuja cada serie. Lo usan el chart, el tooltip y la leyenda. */
export const FORMA_SERIE: Record<SerieKey, "linea" | "punteada" | "barra"> = {
  egresos: "linea",
  vendido: "punteada",
  facturado: "linea",
  cobrado: "linea",
  ingresosTotales: "punteada",
  equilibrio: "punteada",
  partnership: "barra",
};

/**
 * Cómo se LLAMA cada serie. Fuente única: de acá sale la leyenda de abajo y también
 * cualquiera que tenga que nombrar una serie fuera de este archivo.
 *
 * ⚠ Dos indicadores del reporte NO se llaman como su serie: «Piso mensual» mueve la línea
 * «Punto de equilibrio» y «Margen a la fecha» mueve «Ingresos totales». Cuando el tile
 * anunciaba su propio título, prometía sacar del reporte una cosa y sacaba otra, con el
 * número del tile intacto al lado. El nombre de la serie sale de acá, siempre.
 *
 * Es un Record y no un arreglo de pares justamente para que agregar una `SerieKey` sin
 * bautizarla NO COMPILE: derivado con `Object.fromEntries` habría dado `undefined` y el
 * botón habría dicho "Sacar undefined del reporte". Verificado agregando una clave: son
 * tres errores de tsc, uno de ellos acá.
 */
export const LABEL_SERIE: Record<SerieKey, string> = {
  egresos: "Egresos",
  vendido: "Vendido",
  facturado: "Facturado",
  cobrado: "Cobrado",
  partnership: "Partnership",
  ingresosTotales: "Ingresos totales",
  equilibrio: "Punto de equilibrio",
};

/** El orden en que se leen, que es el de la leyenda: se vende, se factura, se cobra. */
const ORDEN_LEYENDA: readonly SerieKey[] = [
  "egresos",
  "vendido",
  "facturado",
  "cobrado",
  "partnership",
  "ingresosTotales",
  "equilibrio",
];

const SERIES: Array<{ key: SerieKey; label: string }> = ORDEN_LEYENDA.map((key) => ({
  key,
  label: LABEL_SERIE[key],
}));

interface Props {
  meses: MesEfectivo[];
  equilibrio: number;
  moneda: string;
  enfoque: SerieKey | null;
  pin: SerieKey | null;
  /**
   * Las series que la persona sacó del reporte. El tag cicla en tres pasos —normal,
   * marcada, fuera— y esto es el tercero: la serie deja de dibujarse y de aparecer en el
   * tooltip. No cambia ningún número: es una decisión de qué mirar, no de qué contar.
   */
  ocultas: ReadonlySet<SerieKey>;
  haySimulacion: boolean;
  onHover: (s: SerieKey | null) => void;
  onCiclar: (s: SerieKey) => void;
}

export default function CurvaEquilibrio({
  meses,
  equilibrio,
  moneda,
  enfoque,
  pin,
  ocultas,
  haySimulacion,
  onHover,
  onCiclar,
}: Props) {
  const colors = useChartColors();

  // Fuera del useMemo del chart porque la leyenda de abajo pinta los mismos colores:
  // duplicarlos era garantizar que un día dejaran de coincidir.
  const COLOR = useMemo<Record<SerieKey, string>>(
    () => ({
      // El "negro" del reporte original se traduce al neutro fuerte del tema: un negro
      // literal desaparece en modo oscuro.
      egresos: colors.axisLabelStrong,
      facturado: SERIES_PALETTE[0]!,
      cobrado: SERIES_PALETTE[3]!,
      ingresosTotales: SERIES_PALETTE[1]!,
      equilibrio: SERIES_PALETTE[2]!,
      // ⚠ NO el mismo verde que `cobrado`: compartían índice de paleta y las barras del
      // aliado se confundían con la línea de la caja cobrada, que es justo la que uno
      // busca de un vistazo. El verde queda reservado a la plata que entró.
      partnership: SERIES_PALETTE[6]!,
      // Lo vendido es el eje de ORIGEN, no de plata movida: color propio para que no se
      // lea como una variante de lo facturado.
      vendido: SERIES_PALETTE[4]!,
    }),
    [colors],
  );

  /**
   * Los mismos colores, pero como VALOR CSS, para el único lugar donde un color aterriza
   * en HTML: el swatch de la leyenda.
   *
   * ⚠ ESTO EXISTE POR UN ERROR DE HIDRATACIÓN REAL. `colors` sale de useChartColors, que
   * mira `document` — o sea que en el servidor NO puede saber el tema y devuelve el
   * oscuro, mientras el layout renderiza `<html class="light">` (el default del producto
   * es claro). El servidor mandaba borderTopColor #9ca3af y el cliente hidrataba con
   * #6b7280: React tiraba el árbol entero. Le pasaba a todos, no a una minoría.
   *
   * La regla que lo evita: en HTML, el tema lo resuelve CSS, nunca JS. Un hex resuelto en
   * JS dentro de un style inline es mismatch garantizado en cualquier componente cliente.
   *
   * Solo `egresos` cambia: es la única entrada que depende del tema. Las otras seis son
   * hex estáticos de SERIES_PALETTE y sirven igual de los dos lados. Va por spread sobre
   * COLOR justamente para que agregar una serie no obligue a acordarse de este mapa.
   *
   * El `option` de ECharts sigue usando COLOR: el canvas no resuelve var().
   */
  const COLOR_CSS = useMemo<Record<SerieKey, string>>(() => ({ ...COLOR, egresos: "var(--fg-muted)" }), [COLOR]);

  const option = useMemo(() => {
    const atenuada = (k: SerieKey) => enfoque !== null && enfoque !== k;
    /** Sigue en el reporte. Una serie fuera no se dibuja ni entra al tooltip. */
    const vive = (k: SerieKey) => !ocultas.has(k);
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
      // Un mes sin dato es un HUECO, nunca un cero (misma regla que ReportesPanel).
      connectNulls: false,
      // La enfocada crece de 2 a 5 y sus puntos también: el enfoque tiene que
      // notarse de reojo, sin buscar cuál cambió.
      symbolSize: enfoque === k ? 9 : 6,
      itemStyle: { color: COLOR[k], opacity: atenuada(k) ? 0.15 : 1 },
      lineStyle: {
        color: COLOR[k],
        width: enfoque === k ? 5 : 2,
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
          /**
           * El marcador dice QUÉ FORMA tiene esa serie en el gráfico: un punto para las
           * líneas llenas, una raya punteada para las punteadas y un bloque para las
           * barras. Con un círculo para todas —como estaba— el tooltip no dejaba
           * emparejar la fila con la línea que uno está mirando.
           */
          const marca = (color: string, forma: "punto" | "punteada" | "barra") => {
            const base = "display:inline-block;margin-right:6px;vertical-align:middle";
            if (forma === "punteada") {
              return `<span style="${base};width:14px;height:0;border-top:2px dashed ${color}"></span>`;
            }
            if (forma === "barra") {
              return `<span style="${base};width:10px;height:10px;border-radius:2px;background:${color};opacity:.55"></span>`;
            }
            return `<span style="${base};width:8px;height:8px;border-radius:50%;background:${color}"></span>`;
          };
          const fila = (
            etq: string,
            val: number | null,
            color?: string,
            forma: "punto" | "punteada" | "barra" = "punto",
          ) =>
            `<div style="display:flex;gap:16px;justify-content:space-between">` +
            `<span>${color ? marca(color, forma) : ""}${etq}</span>` +
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
            // ⚠ El tooltip respeta lo que se sacó del reporte. Si una serie desaparece
            // del gráfico pero sigue en el tooltip, el tag no "quita" nada: solo esconde
            // la línea y deja el número donde estaba.
            vive("egresos") ? fila("Egresos", m.egresos, COLOR.egresos) : "",
            vive("vendido") && m.vendido > 0 ? fila("Vendido", m.vendido, COLOR.vendido, "punteada") : "",
            vive("facturado") ? fila("Facturado", m.facturadoEfectivo, COLOR.facturado) : "",
            vive("cobrado") ? fila("Cobrado", m.cobrado, COLOR.cobrado) : "",
            vive("partnership") && m.partnership > 0
              ? fila("Partnership", m.partnership, COLOR.partnership, "barra")
              : "",
            vive("ingresosTotales")
              ? fila("Ingresos totales", m.ingresosTotales, COLOR.ingresosTotales, "punteada")
              : "",
            // El piso va en el tooltip aunque sea el mismo número los doce meses: es
            // contra esta línea que se lee si el mes se sostiene, y tenerla que buscar
            // en el eje mientras el tooltip tapa el gráfico no ayuda a nadie.
            vive("equilibrio") ? fila("Punto de equilibrio", equilibrio, COLOR.equilibrio, "punteada") : "",
            m.pendienteFacturar > 0 ? `${sep}${fila("Pendiente de facturar", m.pendienteFacturar)}` : "",
            // ⚠ El desglose por servicio es el FACTURADO desarmado en sus partes. Con
            // Facturado fuera del reporte desaparecía la fila del total pero quedaban
            // las partes, y la suma de lo que seguía a la vista era exactamente el
            // número que la persona acababa de sacar.
            servicios && vive("facturado") ? `<div style="margin-top:4px">${servicios}</div>` : "",
            sep,
            fila(m.brecha >= 0 ? "Sobre los egresos" : "Brecha", m.brecha),
          ].join("");
        },
      },
      // Sin leyenda de ECharts: la de abajo es propia, con tags seleccionables que
      // comparten el enfoque con los indicadores de arriba. Dos leyendas que hacen
      // cosas distintas sobre el mismo gráfico confunden más de lo que ayudan.
      legend: { show: false },
      grid: { left: 8, right: 8, top: 12, bottom: 8, containLabel: true },
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
        /**
         * Las bandas de meses parciales viven en su PROPIA serie, invisible.
         *
         * ⚠ Antes colgaban de la de partnership, y al poder sacar series del reporte eso
         * se volvió una trampa: quitar Partnership se llevaba puesto el aviso de "estos
         * meses tienen el gasto incompleto", que es la advertencia que evita leer una
         * brecha como si fuera buena. Doce nulls: ocupa el eje entero y no dibuja nada.
         *
         * Sigue habiendo UNA sola serie con markArea a propósito: repetido en cada una,
         * el gris se pinta encima de sí mismo y queda seis veces más oscuro.
         */
        {
          name: "Meses parciales",
          type: "line",
          data: meses.map(() => null),
          silent: true,
          showSymbol: false,
          lineStyle: { opacity: 0 },
          tooltip: { show: false },
          z: 0,
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
        vive("partnership")
          ? {
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
            }
          : null,
        vive("egresos") ? linea("Egresos", "egresos", meses.map((m) => m.egresos)) : null,
        // Punteada porque NO es plata movida: es el compromiso que después se factura.
        vive("vendido") ? linea("Vendido", "vendido", meses.map((m) => m.vendido), { punteada: true }) : null,
        // Punteada mientras haya escenario: el conjunto ya no es el real.
        vive("facturado")
          ? linea("Facturado", "facturado", meses.map((m) => m.facturadoEfectivo), { punteada: haySimulacion })
          : null,
        vive("cobrado") ? linea("Cobrado", "cobrado", meses.map((m) => m.cobrado)) : null,
        vive("ingresosTotales")
          ? linea("Ingresos totales", "ingresosTotales", meses.map((m) => m.ingresosTotales), { punteada: true })
          : null,
        // El piso es una línea de REFERENCIA: sin símbolos, porque no hay un "dato de
        // marzo" que marcar — es el mismo número los doce meses.
        vive("equilibrio")
          ? linea("Punto de equilibrio", "equilibrio", meses.map(() => equilibrio), {
              punteada: true,
              sinSimbolo: true,
            })
          : null,
      ].filter(Boolean),
    };
  }, [meses, equilibrio, moneda, enfoque, ocultas, haySimulacion, colors, COLOR]);

  return (
    <>
      <EChartRenderer option={option} height={320} className="bg-surface" />

      {/* La leyenda: cada tag CICLA en tres pasos con clics sucesivos —normal, marcada,
          fuera del reporte, y vuelta a normal—. Cada uno lleva el mismo trazo que dibuja
          su serie —línea llena, punteada o bloque— para poder emparejarlo con el gráfico
          sin adivinar. Comparten estado con los indicadores de arriba: tocar cualquiera
          de los dos hace lo mismo.

          Marcar es EXCLUSIVO (una sola serie a la vez, si no "enfocar" no enfoca nada);
          sacar del reporte es acumulativo, porque descartar de a una hasta quedarse con
          las dos que se quieren comparar es justamente el uso. */}
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3 pt-1">
        {SERIES.map((s) => {
          const forma = FORMA_SERIE[s.key];
          const fijado = pin === s.key;
          const fuera = ocultas.has(s.key);
          const apagada = !fuera && enfoque !== null && enfoque !== s.key;
          return (
            <button
              key={s.key}
              type="button"
              // Una serie que no está en el gráfico no se puede enfocar: pasar el mouse
              // por su tag no debe apagar a las que sí están.
              onMouseEnter={() => onHover(fuera ? null : s.key)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(fuera ? null : s.key)}
              onBlur={() => onHover(null)}
              onClick={() => onCiclar(s.key)}
              aria-pressed={fijado}
              // El título dice qué hace el PRÓXIMO clic. Un ciclo de tres pasos sin eso
              // se descubre a los tropiezos.
              //
              // ⚠ "Enfocar" y no "Marcar": bajo el mismo ítem de menú vive el botón
              // «Marcar facturado» de la cola de cobros, que EMITE LA FACTURA. Con la
              // serie «Facturado» en la leyenda, este tag habría dicho literalmente
              // "Marcar Facturado" al lado de una acción que escribe en producción.
              title={
                fuera
                  ? `Devolver ${s.label} al reporte`
                  : fijado
                    ? `Sacar ${s.label} del reporte`
                    : `Enfocar ${s.label}`
              }
              // ⚠ aria-pressed solo tiene dos valores y este control tiene tres: "fuera"
              // se anunciaba igual que "normal", que es justo lo contrario de lo que pasa.
              // El estado va en el nombre accesible, que es lo único que un lector lee —
              // el tachado y el borde punteado no los expone ninguna tecnología de apoyo.
              aria-label={fuera ? `${s.label} — fuera del reporte` : s.label}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[11px] transition-colors ${
                fuera
                  ? "border-line border-dashed text-fg-muted line-through hover:bg-surface-hover"
                  : fijado
                    ? "border-brand bg-brand/10 text-fg font-medium"
                    : "border-line text-fg-secondary hover:bg-surface-hover"
              } ${apagada ? "opacity-45" : ""}`}
            >
              <span
                aria-hidden
                className={`inline-block flex-shrink-0 ${fuera ? "opacity-30" : ""}`}
                style={
                  forma === "barra"
                    ? { width: 12, height: 12, borderRadius: 3, background: COLOR_CSS[s.key], opacity: 0.55 }
                    : {
                        width: 16,
                        height: 0,
                        borderTopWidth: enfoque === s.key ? 4 : 2,
                        borderTopStyle: forma === "punteada" ? "dashed" : "solid",
                        borderTopColor: COLOR_CSS[s.key],
                      }
                }
              />
              {s.label}
            </button>
          );
        })}
      </div>
    </>
  );
}
