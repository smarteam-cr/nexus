"use client";

/**
 * components/finanzas/equilibrio/MesAMes.tsx — «Mes a mes» del punto de equilibrio (rediseño para RevOps, CFO y CEO,
 * 2026-10-05): lo que se vende, se programa, se factura, se cobra y se gasta cada mes, contra el piso.
 *
 * Las ocho series del gráfico anterior, en tres vistas: líneas, barras y tabla. La tabla no es un extra: tres de los
 * seis colores quedan bajo 3:1 sobre fondo claro, así que todo valor tiene que poder leerse sin el color.
 *
 * ── CÓMO SE MIRA ────────────────────────────────────────────────────────────────
 *  · Cada serie de la leyenda se prende o se apaga con un clic, y se pueden dejar varias a la vez (pedido de Marco y
 *    Alex, 2026-10-16: «solo se puede marcar una»). Lo que cada quien deja marcado se recuerda en ese navegador.
 *    «Sin aliados» deja lo que cubren las ventas solas: el piso contra lo facturado y lo cobrado, sin las comisiones.
 *    Pasar por una serie la resalta. Sacar una serie no cambia ningún número: es qué se mira, no qué se cuenta. Sin lo
 *    vendido la escala se ajusta sola (lo vendido de febrero aplasta todo lo demás).
 *  · Pasar por un mes lo lee entero: cada serie con su valor (el valor primero), lo facturado por servicio, lo
 *    estimado de aliados que no suma, y si cubrió su gasto. Tocarlo abre su detalle.
 *
 * ⚠ Los colores son tokens (`var(--serie-N)`, `var(--fg-muted)`): el mismo texto en el servidor y en el cliente, y el
 * tema lo resuelve CSS. Un color resuelto en JS dentro de un `style` es un error de hidratación garantizado
 * (lib/ui/chart-colors-token.test.ts cuenta el día que pasó).
 *
 * ── 2026-11-13 (pedidos de Finanzas 3, 5, 10 y 27) ────────────────────────────────
 *  · El gasto tiene dos líneas: el REAL (o registrado) de los meses que pasaron, y el PROYECTADO desde el día 1 del mes
 *    en curso y los que vienen, con lo fijo que ya se conoce (lib/finanzas/panorama.ts › gastoDelMes). La lectura de
 *    cada mes dice si es real y quién lo confirmó al cerrar.
 *  · El piso tiene dos líneas: el mínimo exacto y el mínimo con colchón; el colchón se elige acá (arranca en 15 %).
 *  · Muestra los meses que vienen del filtro de fechas de la página, no siempre los doce.
 *  · Qué mide cada línea y de dónde sale: lib/finanzas/explicaciones.ts, con el ⓘ de components/finanzas/QueMide.tsx.
 */
import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { cn } from "@/lib/cn";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { fmtFecha } from "@/components/cobranza/format";
import type { FilaMes } from "@/lib/finanzas/equilibrio";
import type { ClaveDeEstado, EstadoDeMes } from "@/lib/finanzas/lectura-equilibrio";
import { EXPLICACIONES_EQUILIBRIO, type Explicacion } from "@/lib/finanzas/explicaciones";
import { COLCHON_MAXIMO, fueraDelRangoAcordado, normalizarColchon, RANGO_COLCHON_ACORDADO, textoDeFirmeza, type GastoDelMes } from "@/lib/finanzas/panorama";
import { Input, Segmentado } from "@/components/ui";
import QueMide from "../QueMide";

type Vista = "lineas" | "barras" | "tabla";
type Clave = "vendido" | "porFacturar" | "facturado" | "cobrado" | "aliados" | "ingresos" | "gasto" | "gastoProyectado" | "piso" | "pisoColchon";
type Forma = "linea" | "punteada" | "barra" | "referencia";

interface Serie {
  clave: Clave;
  nombre: string;
  color: string;
  forma: Forma;
  /** Qué mide y de dónde sale (2026-10-16: «hace falta que se explique cómo se arma cada uno»; 2026-11-13: con su ⓘ). */
  explicacion: Explicacion;
}

/** En el orden en que pasan las cosas: se vende, se programa, se factura, se cobra; y contra qué se mide. */
const E = EXPLICACIONES_EQUILIBRIO;
const SERIES: readonly Serie[] = [
  { clave: "vendido", nombre: "Vendido", color: "var(--serie-2)", forma: "punteada", explicacion: E.vendido },
  { clave: "porFacturar", nombre: "Por facturar", color: "var(--serie-4)", forma: "punteada", explicacion: E.porFacturar },
  { clave: "facturado", nombre: "Facturado", color: "var(--serie-1)", forma: "linea", explicacion: E.facturado },
  { clave: "cobrado", nombre: "Cobrado", color: "var(--serie-3)", forma: "linea", explicacion: E.cobrado },
  { clave: "aliados", nombre: "Aliados", color: "var(--serie-5)", forma: "barra", explicacion: E.aliados },
  { clave: "ingresos", nombre: "Ingresos totales", color: "var(--serie-6)", forma: "punteada", explicacion: E.ingresos },
  { clave: "gasto", nombre: "Gasto del mes", color: "var(--fg-muted)", forma: "linea", explicacion: E.gasto },
  { clave: "gastoProyectado", nombre: "Gasto proyectado", color: "var(--fg-muted)", forma: "punteada", explicacion: E.gastoProyectado },
  { clave: "piso", nombre: "Piso", color: "var(--foreground)", forma: "referencia", explicacion: E.piso },
  { clave: "pisoColchon", nombre: "Piso con colchón", color: "var(--fg-secondary)", forma: "referencia", explicacion: E.pisoColchon },
];

const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MES_LARGO = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const ALTO = 300;
/** Cada mes ocupa 100 unidades del dibujo: el ancho del SVG sale de cuántos meses se ven. */
const ANCHO_MES = 100;

const CHIP: Record<ClaveDeEstado, { texto: string; cls: string }> = {
  cerrado: { texto: "✓ Cerrado", cls: "border-success-line bg-success-surface text-success-ink" },
  cambio: { texto: "Cambió", cls: "border-warn-line bg-warn-surface text-warn-ink" },
  sinCerrar: { texto: "Sin cerrar", cls: "border-warn-line bg-warn-surface text-warn-ink" },
  faltaGasto: { texto: "Falta gasto", cls: "border-dashed border-line bg-surface-muted text-fg-muted" },
  faltaPlanilla: { texto: "Falta planilla", cls: "border-dashed border-line bg-surface-muted text-fg-muted" },
  enCurso: { texto: "En curso", cls: "border-info-line bg-info-surface text-info-ink" },
  porVenir: { texto: "Por venir", cls: "border-line text-fg-muted" },
};

/**
 * El valor de cada serie en un mes. Un mes que no pasó no tiene vendido, facturado ni cobrado: es un hueco, no un cero.
 * El gasto va en UNA de sus dos líneas según su firmeza: real o registrado, o proyectado.
 */
function valoresDe(m: FilaMes, g: GastoDelMes, piso: number, pisoColchon: number): Record<Clave, number | null> {
  const proyectado = g.firmeza === "PROYECTADO";
  return {
    vendido: m.futuro ? null : m.vendido,
    porFacturar: m.pendienteFacturar,
    facturado: m.futuro ? null : m.facturado,
    cobrado: m.futuro ? null : m.cobrado,
    aliados: m.partnership,
    ingresos: m.futuro ? null : m.ingresosTotales,
    gasto: proyectado ? null : g.monto,
    gastoProyectado: proyectado ? g.monto : null,
    piso,
    pisoColchon,
  };
}

/** La escala del eje: el paso más chico que deja a lo sumo cinco tramos. */
function escala(maximo: number): { tope: number; paso: number } {
  const pasos = [1000, 2000, 5000, 10000, 20000, 25000, 50000, 100000, 200000, 250000, 500000, 1000000];
  const paso = pasos.find((p) => Math.ceil(maximo / p) <= 5) ?? pasos[pasos.length - 1]!;
  return { paso, tope: Math.max(paso, Math.ceil(maximo / paso) * paso) };
}

const compacto = (v: number) =>
  v >= 1_000_000 ? `${(v / 1_000_000).toLocaleString("es-CR", { maximumFractionDigits: 1 })}M` : v >= 1000 ? `${v / 1000}k` : String(v);

/** Lo que cada quien deja marcado, en su navegador. Si el navegador no deja guardar, el gráfico arranca con todo. */
const GUARDADO = "nexus.equilibrio.series-fuera";
const CLAVES: readonly Clave[] = ["vendido", "porFacturar", "facturado", "cobrado", "aliados", "ingresos", "gasto", "gastoProyectado", "piso", "pisoColchon"];
/** «Sin aliados»: lo que cubren las ventas solas. Fuera las comisiones y los ingresos totales, que las suman. */
const SIN_ALIADOS: readonly Clave[] = ["aliados", "ingresos"];

/* Lo guardado es un almacén externo (`useSyncExternalStore`): el servidor no ve el navegador y arranca con todo, y el
   cliente lee lo guardado sin un efecto que repinte. `enMemoria` cubre el navegador que no deja guardar. */
const oyentes = new Set<() => void>();
let enMemoria = "[]";

function leerGuardado(): string {
  try {
    return window.localStorage.getItem(GUARDADO) ?? enMemoria;
  } catch {
    return enMemoria;
  }
}

function guardar(fuera: ReadonlySet<Clave>) {
  enMemoria = JSON.stringify([...fuera]);
  try {
    window.localStorage.setItem(GUARDADO, enMemoria);
  } catch {
    /* Sin almacenamiento (ventana privada): se mira igual, solo no se recuerda. */
  }
  for (const o of oyentes) o();
}

function suscribir(o: () => void) {
  oyentes.add(o);
  window.addEventListener("storage", o);
  return () => {
    oyentes.delete(o);
    window.removeEventListener("storage", o);
  };
}

function interpretar(crudo: string): ReadonlySet<Clave> {
  try {
    const lista = JSON.parse(crudo) as unknown;
    return new Set(Array.isArray(lista) ? lista.filter((x): x is Clave => CLAVES.includes(x as Clave)) : []);
  } catch {
    return new Set();
  }
}

export default function MesAMes({
  meses,
  estados,
  gastos,
  piso,
  pisoColchon,
  colchonPct,
  onColchon,
  moneda,
  etiquetasDeServicio,
  onAbrirMes,
}: {
  /** Los meses del filtro de fechas, en orden. */
  meses: FilaMes[];
  /** El estado de cada mes, en el mismo orden (lib/finanzas/lectura-equilibrio.ts › estadoDelMes). */
  estados: EstadoDeMes[];
  /** El gasto de cada mes con su firmeza, en el mismo orden (lib/finanzas/panorama.ts › gastoDelMes). */
  gastos: GastoDelMes[];
  /** El mínimo exacto. */
  piso: number;
  /** El mínimo con colchón. */
  pisoColchon: number;
  colchonPct: number;
  onColchon: (pct: number) => void;
  moneda: string;
  /** Los nombres de los tipos de servicio («IMPLEMENTACION» → «Implementación»), resueltos en el servidor. */
  etiquetasDeServicio: Record<string, string>;
  onAbrirMes: (periodo: string) => void;
}) {
  const [vista, setVista] = useState<Vista>("lineas");
  const [enfoque, setEnfoque] = useState<Clave | null>(null);
  const crudo = useSyncExternalStore(suscribir, leerGuardado, () => "[]");
  const fuera = useMemo(() => interpretar(crudo), [crudo]);
  const [mes, setMes] = useState<number | null>(null);
  /** El colchón mientras se escribe (null = no se está escribiendo: se ve el elegido). */
  const [textoColchon, setTextoColchon] = useState<string | null>(null);
  const cambiarFuera = (nuevo: ReadonlySet<Clave>) => guardar(nuevo);

  const usd = (n: number) => fmtMontoLibro(Math.round(n), moneda);
  const visible = (k: Clave) => !fuera.has(k);
  const activa = enfoque !== null && visible(enfoque) ? enfoque : null;
  const opacidad = (k: Clave) => (activa && activa !== k ? 0.15 : 1);
  const enBarras = vista === "barras";
  const valores = meses.map((m, i) => valoresDe(m, gastos[i]!, piso, pisoColchon));
  const n = Math.max(1, meses.length);
  const anchoSvg = n * ANCHO_MES;
  const columnas: CSSProperties = { gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` };
  /** El centro de la columna del mes `i`, en % del ancho. */
  const centro = (i: number) => `${((i + 0.5) / n) * 100}%`;

  let maximo = 0;
  for (const s of SERIES) {
    if (!visible(s.clave)) continue;
    for (const v of valores) {
      const x = v[s.clave];
      if (x !== null && x > maximo) maximo = x;
    }
  }
  const { tope, paso } = escala(Math.max(maximo, 1));
  const yPx = (v: number) => (v / tope) * ALTO;
  const marcas: number[] = [];
  for (let v = 0; v <= tope; v += paso) marcas.push(v);

  const alternar = (k: Clave) => {
    const nuevo = new Set(fuera);
    if (nuevo.has(k)) nuevo.delete(k);
    else nuevo.add(k);
    cambiarFuera(nuevo);
  };
  const sinAliados = SIN_ALIADOS.every((k) => fuera.has(k));

  /** Una línea del gráfico: rectas entre meses, y un hueco donde no hay dato. */
  const camino = (k: Clave) => {
    let d = "";
    let abierto = false;
    valores.forEach((v, i) => {
      const x = v[k];
      if (x === null) {
        abierto = false;
        return;
      }
      d += `${abierto ? " L" : " M"}${(i + 0.5) * ANCHO_MES} ${(ALTO - yPx(x)).toFixed(1)}`;
      abierto = true;
    });
    return d.trim();
  };

  const muestra = (s: Serie): CSSProperties => {
    const enBloque = s.forma === "barra" || (enBarras && s.forma !== "referencia" && s.clave !== "ingresos");
    if (enBloque && (s.clave === "porFacturar" || s.clave === "gastoProyectado")) return { width: 12, height: 12, borderRadius: 3, border: `1.5px dashed ${s.color}` };
    if (enBloque) return { width: 12, height: 12, borderRadius: 3, background: s.color };
    return { width: 18, height: 0, borderTop: `${activa === s.clave ? 4 : 2}px ${s.forma === "linea" ? "solid" : s.clave === "pisoColchon" ? "dotted" : "dashed"} ${s.color}` };
  };

  const hayMes = mes !== null && vista !== "tabla";

  return (
    <section
      data-recorrido="fin.equilibrio.tabla"
      aria-label="Mes a mes"
      className="flex flex-col gap-3.5 rounded-xl border border-line bg-surface p-5"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5">
        <div className="flex min-w-0 flex-[1_1_360px] flex-col gap-0.5">
          <h2 className="text-lg font-semibold text-fg">Mes a mes: se vende, se factura, se cobra y se gasta</h2>
          <p className="text-xs leading-[17px] text-fg-muted">
            Toca cada serie para prenderla o apagarla: puedes dejar las que quieras, y quedan así la próxima vez. Pasa por
            un mes para leerlo entero, o tócalo para ver de qué está hecho.
          </p>
        </div>
        <label className="inline-flex flex-wrap items-center gap-1.5 text-xs text-fg-secondary">
          <span>Colchón del piso</span>
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={COLCHON_MAXIMO}
            step={1}
            value={textoColchon ?? String(colchonPct)}
            onFocus={() => setTextoColchon(String(colchonPct))}
            onChange={(e) => {
              /* Mientras se escribe, el texto es de quien escribe: borrar para poner «10» no salta a 15. */
              setTextoColchon(e.target.value);
              if (e.target.value.trim() !== "") onColchon(normalizarColchon(e.target.value));
            }}
            onBlur={() => setTextoColchon(null)}
            aria-describedby="colchon-rango"
            className="w-16 px-2 py-1 text-right tabular-nums"
          />
          <span>%</span>
          <QueMide explicacion={E.pisoColchon} titulo="Piso con colchón" />
          <span id="colchon-rango" className={cn("text-[11px]", fueraDelRangoAcordado(colchonPct) ? "text-warn-ink" : "text-fg-muted")}>
            {fueraDelRangoAcordado(colchonPct)
              ? `fuera del rango acordado (${RANGO_COLCHON_ACORDADO.desde} a ${RANGO_COLCHON_ACORDADO.hasta} %)`
              : `rango acordado: ${RANGO_COLCHON_ACORDADO.desde} a ${RANGO_COLCHON_ACORDADO.hasta} %`}
          </span>
        </label>
        <Segmentado
          etiqueta="Cómo verlo"
          valor={vista}
          onCambio={(v) => {
            setVista(v);
            setMes(null);
          }}
          opciones={[
            { clave: "lineas", etiqueta: "Líneas" },
            { clave: "barras", etiqueta: "Barras" },
            { clave: "tabla", etiqueta: "Tabla" },
          ]}
        />
      </div>

      {vista !== "tabla" && (
        <div role="group" aria-label="Series" className="flex flex-wrap items-center gap-1.5">
          {SERIES.map((s) => {
            const estaFuera = !visible(s.clave);
            const apagada = !estaFuera && activa !== null && activa !== s.clave;
            return (
              <button
                key={s.clave}
                type="button"
                onMouseEnter={() => setEnfoque(s.clave)}
                onMouseLeave={() => setEnfoque(null)}
                onFocus={() => setEnfoque(s.clave)}
                onBlur={() => setEnfoque(null)}
                onClick={() => alternar(s.clave)}
                aria-pressed={!estaFuera}
                aria-label={estaFuera ? `${s.nombre}, fuera del gráfico` : `${s.nombre}, en el gráfico`}
                title={`${s.explicacion.queMide} · ${estaFuera ? `Clic para mostrar ${s.nombre}` : `Clic para sacar ${s.nombre} del gráfico`}`}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition-opacity",
                  estaFuera
                    ? "border-dashed border-line bg-surface text-fg-muted"
                    : "border-brand bg-info-surface font-semibold text-fg hover:bg-surface-hover",
                  apagada && "opacity-45",
                )}
              >
                <span aria-hidden className={cn("inline-block shrink-0", estaFuera && "opacity-30")} style={muestra(s)} />
                <span className={cn(estaFuera && "line-through")}>{s.nombre}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => cambiarFuera(sinAliados ? new Set([...fuera].filter((k) => !SIN_ALIADOS.includes(k))) : new Set([...fuera, ...SIN_ALIADOS]))}
            aria-pressed={sinAliados}
            title="Sin las comisiones de los aliados ni los ingresos totales: lo que cubren las ventas solas."
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-semibold",
              sinAliados ? "bg-info-surface text-fg" : "text-brand hover:text-brand-light",
            )}
          >
            {sinAliados ? "Con aliados" : "Sin aliados"}
          </button>
          {fuera.size > 0 && (
            <button
              type="button"
              onClick={() => {
                setEnfoque(null);
                cambiarFuera(new Set());
              }}
              className="rounded-md px-2.5 py-1 text-xs font-semibold text-brand hover:text-brand-light"
            >
              Ver todas
            </button>
          )}
        </div>
      )}

      {/* Qué mide cada línea y de dónde sale, a la vista: la leyenda sola dice el nombre, no cómo se arma. */}
      <details className="group rounded-lg border border-line bg-surface-muted px-3 py-2 text-sm">
        <summary className="cursor-pointer select-none text-xs font-semibold text-fg-secondary">¿Qué mide cada línea y de dónde sale?</summary>
        <dl className="mt-2 grid gap-3 sm:grid-cols-2">
          {SERIES.map((s) => (
            <div key={s.clave} className="flex gap-2">
              <span aria-hidden className="mt-1.5 inline-block shrink-0" style={muestra(s)} />
              <div className="min-w-0">
                <dt className="text-xs font-semibold text-fg">{s.nombre}</dt>
                <dd className="text-xs text-fg-secondary">
                  <span className="font-semibold text-fg-muted">Qué mide: </span>
                  {s.explicacion.queMide}
                </dd>
                <dd className="text-xs text-fg-secondary">
                  <span className="font-semibold text-fg-muted">De dónde sale: </span>
                  {s.explicacion.deDondeSale}
                </dd>
              </div>
            </div>
          ))}
        </dl>
      </details>

      {vista !== "tabla" ? (
        <>
          <div className="overflow-x-auto">
            <div data-recorrido="fin.equilibrio.curva" className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2" style={{ minWidth: Math.max(320, n * 72) }}>
              <div className="relative" style={{ height: ALTO }}>
                {marcas.map((v) => (
                  <span
                    key={v}
                    className="absolute right-0 text-[11px] tabular-nums text-fg-muted"
                    style={{ bottom: yPx(v) - 7 }}
                  >
                    {v === 0 ? "0" : compacto(v)}
                  </span>
                ))}
              </div>
              <div className="relative border-b border-line" style={{ height: ALTO }}>
                {/* Los meses que ya pasaron con el gasto incompleto, en gris; el mes leído, en azul suave (barras). */}
                <div aria-hidden className="absolute inset-0 grid" style={columnas}>
                  {meses.map((m, i) => (
                    <div
                      key={m.periodo}
                      className={cn(enBarras && hayMes && mes === i ? "bg-info-surface" : estados[i]?.incompleto && "bg-surface-hover")}
                    />
                  ))}
                </div>
                {marcas.map((v) => (
                  <div key={v} aria-hidden className="absolute inset-x-0 border-t border-surface-hover" style={{ bottom: yPx(v) }} />
                ))}

                {/* Aliados como barras (vista de líneas). */}
                {!enBarras && visible("aliados") && (
                  <div aria-hidden className="absolute inset-0 grid items-end" style={columnas}>
                    {valores.map((v, i) => (
                      <div key={i} className="flex h-full items-end justify-center">
                        {(v.aliados ?? 0) > 0 && (
                          <span
                            className="block w-[18px] rounded-t"
                            style={{ height: yPx(v.aliados!), background: "var(--serie-5)", opacity: opacidad("aliados") }}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {/* Las barras de cada mes (vista de barras). */}
                {enBarras && (
                  <div aria-hidden className="absolute inset-0 grid items-end" style={columnas}>
                    {valores.map((v, i) => (
                      <div key={i} className="flex h-full items-end justify-center gap-[3px]">
                        <BarrasDelMes v={v} estado={estados[i]!} yPx={yPx} visible={visible} opacidad={opacidad} />
                      </div>
                    ))}
                  </div>
                )}

                <svg aria-hidden viewBox={`0 0 ${anchoSvg} ${ALTO}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
                  {SERIES.filter((s) => s.forma !== "barra" && visible(s.clave) && (!enBarras || s.forma === "referencia")).map((s) => {
                    const ref = s.clave === "pisoColchon" ? pisoColchon : piso;
                    return (
                    <path
                      key={s.clave}
                      d={s.forma === "referencia" ? `M0 ${(ALTO - yPx(ref)).toFixed(1)} L${anchoSvg} ${(ALTO - yPx(ref)).toFixed(1)}` : camino(s.clave)}
                      fill="none"
                      stroke={s.color}
                      strokeWidth={activa === s.clave ? 3.5 : 2}
                      strokeDasharray={s.forma === "linea" ? undefined : s.clave === "pisoColchon" ? "2 4" : s.forma === "referencia" ? "8 5" : "5 4"}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity={opacidad(s.clave)}
                      vectorEffect="non-scaling-stroke"
                    />
                    );
                  })}
                </svg>
                {visible("piso") && (
                  <span
                    className="absolute right-1 bg-surface px-1 text-[11px] font-semibold text-fg"
                    style={{ bottom: yPx(piso) + 4, opacity: opacidad("piso") }}
                  >
                    Mínimo exacto {usd(piso)}
                  </span>
                )}
                {visible("pisoColchon") && pisoColchon !== piso && (
                  <span
                    className="absolute left-1 bg-surface px-1 text-[11px] font-semibold text-fg-secondary"
                    style={{ bottom: yPx(pisoColchon) + 4, opacity: opacidad("pisoColchon") }}
                  >
                    Con colchón del {colchonPct} %: {usd(pisoColchon)}
                  </span>
                )}

                {/* La lectura de un mes: línea vertical y un punto por serie (vista de líneas). */}
                {hayMes && !enBarras && (
                  <>
                    <div aria-hidden className="absolute inset-y-0 border-l border-fg-muted" style={{ left: centro(mes!) }} />
                    {SERIES.filter((s) => (s.forma === "linea" || s.forma === "punteada") && visible(s.clave) && valores[mes!]![s.clave] !== null).map(
                      (s) => (
                        <span
                          key={s.clave}
                          aria-hidden
                          className="absolute block h-2.5 w-2.5 -translate-x-1/2 translate-y-1/2 rounded-full border-2 border-surface"
                          style={{
                            left: centro(mes!),
                            bottom: yPx(valores[mes!]![s.clave]!),
                            background: s.color,
                            opacity: opacidad(s.clave),
                          }}
                        />
                      ),
                    )}
                  </>
                )}

                {/* Los meses se pueden tocar: abren su detalle. */}
                <div className="absolute inset-0 grid" style={columnas}>
                  {meses.map((m, i) => (
                    <button
                      key={m.periodo}
                      type="button"
                      aria-label={`${MES_LARGO[m.mes - 1]}: ver de qué está hecho`}
                      onMouseEnter={() => setMes(i)}
                      onMouseLeave={() => setMes(null)}
                      onFocus={() => setMes(i)}
                      onBlur={() => setMes(null)}
                      onClick={() => onAbrirMes(m.periodo)}
                      className="h-full w-full cursor-pointer focus-visible:outline-2 focus-visible:outline-brand"
                    />
                  ))}
                </div>

                {hayMes && (
                  <LecturaDelMes
                    i={mes!}
                    n={n}
                    m={meses[mes!]!}
                    g={gastos[mes!]!}
                    v={valores[mes!]!}
                    estado={estados[mes!]!}
                    visible={visible}
                    usd={usd}
                    etiquetasDeServicio={etiquetasDeServicio}
                  />
                )}
              </div>

              <div />
              <div className="grid pt-2" style={columnas}>
                {meses.map((m, i) => {
                  const e = estados[i]!;
                  return (
                    <button
                      key={m.periodo}
                      type="button"
                      onClick={() => onAbrirMes(m.periodo)}
                      title={e.detalle}
                      className="flex flex-col items-center gap-1 rounded-lg py-1 hover:bg-surface-hover"
                    >
                      <span className="text-xs font-semibold text-fg">{MES_CORTO[m.mes - 1]}</span>
                      <span className={cn("whitespace-nowrap rounded-full border px-1.5 py-px text-[11px]", CHIP[e.clave].cls)}>
                        {CHIP[e.clave].texto}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
          <p className="text-xs leading-[17px] text-fg-muted">
            {enBarras
              ? "Cada mes: lo vendido; la pila de lo facturado, los aliados y lo programado sin factura, con la raya de los ingresos totales; lo cobrado; y el gasto, punteado si está incompleto."
              : "Lo vendido, lo programado, los ingresos totales y el gasto proyectado van punteados: no son plata que se movió en ese mes."}{" "}
            Los meses en gris ya pasaron con el gasto incompleto. Todo sin IVA.
          </p>
        </>
      ) : (
        <TablaDelAnio meses={meses} gastos={gastos} valores={valores} estados={estados} usd={usd} onAbrirMes={onAbrirMes} />
      )}
    </section>
  );
}

/** Las hasta cuatro barras de un mes en la vista de barras. */
function BarrasDelMes({
  v,
  estado,
  yPx,
  visible,
  opacidad,
}: {
  v: Record<Clave, number | null>;
  estado: EstadoDeMes;
  yPx: (n: number) => number;
  visible: (k: Clave) => boolean;
  opacidad: (k: Clave) => number;
}) {
  const sola = (k: Clave, color: string) => {
    const x = v[k];
    if (!visible(k) || x === null || x <= 0) return null;
    return (
      <div className="flex w-3.5 flex-col-reverse">
        <span className="block rounded-t" style={{ height: yPx(x), background: color, opacity: opacidad(k) }} />
      </div>
    );
  };
  const pila = (
    [
      ["facturado", { background: "var(--serie-1)" }],
      ["aliados", { background: "var(--serie-5)" }],
      ["porFacturar", { border: "1.5px dashed var(--serie-4)", borderBottom: 0 }],
    ] as Array<[Clave, CSSProperties]>
  ).filter(([k]) => visible(k) && (v[k] ?? 0) > 0);
  const ingresos = v.ingresos;
  const conRaya = visible("ingresos") && ingresos !== null && ingresos > 0 && (visible("facturado") || visible("aliados"));
  const completo = estado.clave === "cerrado" || estado.clave === "cambio" || estado.clave === "sinCerrar";
  return (
    <>
      {sola("vendido", "var(--serie-2)")}
      {(pila.length > 0 || conRaya) && (
        <div className="relative flex w-3.5 flex-col-reverse gap-0.5">
          {pila.map(([k, estilo], j) => (
            <span
              key={k}
              className={cn("block box-border", j === pila.length - 1 && "rounded-t")}
              style={{ height: yPx(v[k]!), opacity: opacidad(k), ...estilo }}
            />
          ))}
          {conRaya && (
            <span
              className="absolute -inset-x-1 block"
              style={{ bottom: yPx(ingresos!), borderTop: "2px dashed var(--serie-6)", opacity: opacidad("ingresos") }}
            />
          )}
        </div>
      )}
      {sola("cobrado", "var(--serie-3)")}
      {visible("gasto") && (v.gasto ?? 0) > 0 && (
        <div className="flex w-3.5 flex-col-reverse">
          <span
            className="block box-border rounded-t"
            style={{
              height: yPx(v.gasto!),
              opacity: opacidad("gasto"),
              ...(completo ? { background: "var(--fg-muted)" } : { border: "1.5px dashed var(--fg-muted)", borderBottom: 0 }),
            }}
          />
        </div>
      )}
      {visible("gastoProyectado") && (v.gastoProyectado ?? 0) > 0 && (
        <div className="flex w-3.5 flex-col-reverse">
          <span
            className="block box-border rounded-t"
            style={{ height: yPx(v.gastoProyectado!), opacity: opacidad("gastoProyectado"), border: "1.5px dashed var(--fg-muted)", borderBottom: 0 }}
          />
        </div>
      )}
    </>
  );
}

/** La lectura de un mes al pasar el mouse: todas las series a la vista, el valor primero. */
function LecturaDelMes({
  i,
  n,
  m,
  g,
  v,
  estado,
  visible,
  usd,
  etiquetasDeServicio,
}: {
  i: number;
  /** Cuántos meses se ven: decide de qué lado del mes sale la lectura. */
  n: number;
  m: FilaMes;
  g: GastoDelMes;
  v: Record<Clave, number | null>;
  estado: EstadoDeMes;
  visible: (k: Clave) => boolean;
  usd: (n: number) => string;
  etiquetasDeServicio: Record<string, string>;
}) {
  const filas: Array<{ s: Serie; valor: number; nota: string }> = [];
  for (const s of SERIES) {
    if (!visible(s.clave)) continue;
    const x = v[s.clave];
    if (x === null) continue;
    if ((s.clave === "vendido" || s.clave === "porFacturar" || s.clave === "aliados") && x === 0 && !(s.clave === "aliados" && m.partnershipProyectado > 0)) continue;
    let nota = "";
    if (s.clave === "facturado") {
      nota = Object.entries(m.facturadoPorServicio)
        .filter(([, n]) => n > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k, n]) => `${etiquetasDeServicio[k] ?? k} ${usd(n).replace(/^US\$|^₡/, "")}`)
        .join(" · ");
    }
    if (s.clave === "aliados" && m.partnershipProyectado > 0) nota = `Y ${usd(m.partnershipProyectado)} estimados, que no suman`;
    if (s.clave === "aliados" && m.partnership > 0 && m.partnershipEnIngresos === 0) nota = "No suma a los ingresos: así lo decidió dirección";
    if (s.clave === "gasto" || s.clave === "gastoProyectado") nota = textoDeFirmeza(g, usd, fmtFecha);
    if (s.clave === "gasto" && estado.incompleto) nota = `${estado.detalle} ${nota}`;
    filas.push({ s, valor: x, nota });
  }
  const completo = estado.clave === "cerrado" || estado.clave === "cambio" || estado.clave === "sinCerrar";
  const brecha = m.ingresosTotales - m.egresos;
  const cierre = completo
    ? brecha >= 0
      ? `Cubrió su gasto y le sobraron ${usd(brecha)}.`
      : `No cubrió su gasto: le faltaron ${usd(-brecha)}.`
    : estado.clave === "porVenir"
      ? "Todavía no pasó: solo hay lo programado."
      : "Con el gasto incompleto no se puede decir si cubrió.";
  const izquierda = i < Math.ceil(n * 0.58);
  return (
    <div
      role="tooltip"
      className="pointer-events-none absolute top-2 z-10 flex w-[300px] flex-col gap-1.5 rounded-[10px] border border-line bg-surface px-3.5 py-3"
      style={izquierda ? { left: `calc(${((i + 1) / n) * 100}% + 8px)` } : { right: `calc(${((n - i) / n) * 100}% + 8px)` }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 border-b border-line pb-1.5">
        <span className="text-[13px] font-semibold text-fg">
          {MES_LARGO[m.mes - 1]} {m.periodo.slice(0, 4)}
        </span>
        <span className="text-[11px] text-fg-muted">{estado.etiqueta}</span>
      </div>
      {filas.map(({ s, valor, nota }) => (
        <div key={s.clave} className="flex flex-col gap-px">
          <div className="flex items-center gap-2">
            <span
              aria-hidden
              className="inline-block shrink-0"
              style={
                s.forma === "barra"
                  ? { width: 10, height: 10, borderRadius: 2, background: s.color }
                  : { width: 14, height: 0, borderTop: `2px ${s.forma === "linea" ? "solid" : "dashed"} ${s.color}` }
              }
            />
            <span className="min-w-[84px] text-right text-[13px] font-bold tabular-nums text-fg">{usd(valor)}</span>
            <span className="text-xs text-fg-secondary">{s.nombre}</span>
          </div>
          {nota && <span className="pl-[116px] text-[11px] leading-[15px] text-fg-muted">{nota}</span>}
        </div>
      ))}
      <div className="border-t border-line pt-1.5 text-xs leading-[17px] text-fg">{cierre}</div>
      <span className="text-[11px] text-fg-muted">Toca el mes para ver de qué está hecho.</span>
    </div>
  );
}

/** El año en tabla: todo valor del gráfico se puede leer sin el color. */
function TablaDelAnio({
  meses,
  gastos,
  valores,
  estados,
  usd,
  onAbrirMes,
}: {
  meses: FilaMes[];
  gastos: GastoDelMes[];
  valores: Array<Record<Clave, number | null>>;
  estados: EstadoDeMes[];
  usd: (n: number) => string;
  onAbrirMes: (periodo: string) => void;
}) {
  const celda = (x: number | null) => (x === null ? "—" : usd(x));
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-collapse text-[13px] leading-[19px] tabular-nums">
        <thead>
          <tr className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            <th className="px-2 py-1.5 text-left font-semibold">Mes</th>
            {["Vendido", "Por facturar", "Facturado", "Cobrado", "Aliados", "Ingresos", "Gasto", "Sobre el gasto"].map((c) => (
              <th key={c} className="px-2 py-1.5 text-right font-semibold">
                {c}
              </th>
            ))}
            <th className="px-2 py-1.5 text-left font-semibold">Estado</th>
          </tr>
        </thead>
        <tbody>
          {meses.map((m, i) => {
            const v = valores[i]!;
            const e = estados[i]!;
            const completo = e.clave === "cerrado" || e.clave === "cambio" || e.clave === "sinCerrar";
            const brecha = m.ingresosTotales - m.egresos;
            return (
              <tr key={m.periodo}>
                <td className="border-t border-line px-2 py-2">
                  <button type="button" onClick={() => onAbrirMes(m.periodo)} className="font-semibold text-fg hover:text-brand">
                    {MES_LARGO[m.mes - 1]}
                  </button>
                </td>
                {[v.vendido, v.porFacturar, v.facturado, v.cobrado, v.aliados, v.ingresos].map((x, j) => (
                  <td key={j} className="border-t border-line px-2 py-2 text-right text-fg-secondary">
                    {celda(x)}
                  </td>
                ))}
                <td className="border-t border-line px-2 py-2 text-right text-fg-secondary" title={textoDeFirmeza(gastos[i]!, usd, fmtFecha)}>
                  {usd(gastos[i]!.monto)}
                  {gastos[i]!.firmeza === "PROYECTADO" && <span className="ml-1 text-[11px] text-fg-muted">proy.</span>}
                  {gastos[i]!.firmeza === "REAL" && <span className="ml-1 text-[11px] text-success-ink">real</span>}
                </td>
                <td className={cn("border-t border-line px-2 py-2 text-right", completo ? (brecha >= 0 ? "text-success-ink" : "text-danger-ink") : "text-fg-muted")}>
                  {completo ? `${brecha >= 0 ? "+" : "−"}${usd(Math.abs(brecha))}` : "—"}
                </td>
                <td className="border-t border-line px-2 py-2">
                  <span className={cn("whitespace-nowrap rounded-full border px-1.5 py-px text-[11px]", CHIP[e.clave].cls)}>{CHIP[e.clave].texto}</span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
