"use client";

/**
 * components/finanzas/TipoDeCambioClient.tsx — Finanzas › Tipo de cambio (2026-10-05): la venta de referencia del BCCR
 * de cada día, con su histórico, y lo que se usaba antes (el ₡500 cargado a mano) para ver la diferencia.
 *
 * El gráfico es la venta (la que se usa) y la compra, día por día; pasar el mouse lee un día. La tabla de abajo es el
 * mismo histórico por mes y la forma de leerlo sin el color.
 *
 * ⚠ Los colores son tokens (`var(--serie-N)`): el tema los resuelve en CSS, nunca en JS (error de hidratación).
 */
import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, EmptyState, PageHeader, Segmentado } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { resumenPorMes, sumarDias, TIPO_CAMBIO_DESDE, DIAS_HACIA_ATRAS, type TasaDelDia } from "@/lib/finanzas/tipo-cambio";

type Rango = "90" | "365" | "todo";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MESES_CORTOS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const crc = (n: number) => `₡${n.toLocaleString("es-CR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaLarga = (f: string) => `${Number(f.slice(8, 10))} de ${MESES[Number(f.slice(5, 7)) - 1]} de ${f.slice(0, 4)}`;
const fechaCorta = (f: string) => `${Number(f.slice(8, 10))} ${MESES_CORTOS[Number(f.slice(5, 7)) - 1]}`;
const nombreMes = (p: string) => `${MESES[Number(p.slice(5, 7)) - 1]!.replace(/^./, (c) => c.toUpperCase())} ${p.slice(0, 4)}`;

interface Resultado {
  ok: boolean;
  nuevos: number;
  corregidos: number;
  faltaHistorico: boolean;
  avisos: string[];
}

export default function TipoDeCambioClient({
  dias,
  traidoEn,
  sinTabla,
  manuales,
  hoyISO,
  puedeActualizar,
}: {
  dias: TasaDelDia[];
  traidoEn: string | null;
  /** La tabla del tipo de cambio diario todavía no existe en esta base (falta el SQL). */
  sinTabla: boolean;
  manuales: Array<{ periodo: string; crcPorUsd: number; fuente: string }>;
  hoyISO: string;
  puedeActualizar: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [rango, setRango] = useState<Rango>("365");
  const [actualizando, setActualizando] = useState(false);

  const actualizar = async () => {
    setActualizando(true);
    try {
      const r = await fetchJson<Resultado>("/api/finanzas/tipo-de-cambio", { method: "POST" });
      toast.success(
        r.nuevos + r.corregidos === 0
          ? "Ya estaba al día."
          : `${r.nuevos === 1 ? "1 día nuevo" : `${r.nuevos} días nuevos`}${r.corregidos ? `, ${r.corregidos} corregidos` : ""}.`,
      );
      router.refresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo traer el tipo de cambio.");
    } finally {
      setActualizando(false);
    }
  };

  const ultimo = dias[dias.length - 1] ?? null;
  const manualDe = useMemo(() => new Map(manuales.map((m) => [m.periodo, m])), [manuales]);
  const resumen = useMemo(() => resumenPorMes(dias), [dias]);
  const periodoHoy = hoyISO.slice(0, 7);
  const delMes = resumen.find((r) => r.periodo === periodoHoy) ?? null;
  const hace30 = ultimo ? [...dias].reverse().find((d) => d.fecha <= sumarDias(ultimo.fecha, -30)) : undefined;
  const manualHoy = manualDe.get(periodoHoy) ?? null;
  const faltaHistorico = !dias[0] || dias[0].fecha > sumarDias(TIPO_CAMBIO_DESDE, DIAS_HACIA_ATRAS);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Tipo de cambio"
        description="La venta de referencia del Banco Central de Costa Rica, día por día: la que pide Hacienda y la que Nexus usa para pasar colones a dólares. Cada cobro y cada pago con fecha se convierte con la tasa de su día; lo que es de un mes entero, con el promedio del mes."
        action={
          puedeActualizar && !sinTabla ? (
            <Button variant="secondary" size="sm" onClick={() => void actualizar()} disabled={actualizando} title="Trae ahora lo que falta. Normalmente se trae solo, una vez por día.">
              {actualizando ? "Actualizando…" : "Actualizar"}
            </Button>
          ) : undefined
        }
      />

      {sinTabla ? (
        <EmptyState title="Todavía no se guarda el tipo de cambio diario" description="Falta preparar la base para guardarlo. Mientras tanto, los reportes siguen con la tasa de cada mes cargada a mano." />
      ) : !ultimo ? (
        <EmptyState
          title="Todavía no hay tipo de cambio guardado"
          description={puedeActualizar ? "«Actualizar» trae la tasa de hoy y, si el Banco Central responde, la de los meses anteriores." : "Se trae solo, una vez por día."}
        />
      ) : (
        <>
          {faltaHistorico && (
            <Alert variant="warning" title="Falta el histórico">
              Hay tasas del Banco Central desde el {fechaLarga(dias[0]!.fecha)}. Los meses anteriores siguen con la tasa cargada a mano
              {manuales.length > 0 ? ` (${[...new Set(manuales.map((m) => crc(m.crcPorUsd)))].slice(0, 2).join(", ")})` : ""} hasta traer
              el histórico, que el servicio del Banco Central da con un token que se pide una vez.
            </Alert>
          )}

          <section aria-label="El tipo de cambio de hoy" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Tile rotulo={`Venta del ${fechaCorta(ultimo.fecha)}`} valor={crc(ultimo.venta)} nota={ultimo.compra !== null ? `Compra ${crc(ultimo.compra)}` : "Sin la compra de ese día"} />
            {delMes && (
              <Tile
                rotulo={`Promedio de ${MESES[Number(periodoHoy.slice(5, 7)) - 1]}`}
                valor={crc(delMes.promedioVenta)}
                nota={`${delMes.dias === 1 ? "1 día" : `${delMes.dias} días`}: con esta se convierte lo que es del mes entero.`}
              />
            )}
            {hace30 && (
              <Tile
                rotulo="En 30 días"
                valor={`${ultimo.venta >= hace30.venta ? "+" : "−"}${crc(Math.abs(ultimo.venta - hace30.venta))}`}
                nota={`${ultimo.venta >= hace30.venta ? "+" : "−"}${Math.abs(((ultimo.venta - hace30.venta) / hace30.venta) * 100).toLocaleString("es-CR", { maximumFractionDigits: 1 })} % desde el ${fechaCorta(hace30.fecha)} (${crc(hace30.venta)}).`}
              />
            )}
            {manualHoy && Math.abs(manualHoy.crcPorUsd - ultimo.venta) > 0.5 && (
              <Tile
                rotulo="Lo que se usaba"
                valor={crc(manualHoy.crcPorUsd)}
                nota={`Cargado a mano. Con ${crc(manualHoy.crcPorUsd)}, lo que está en colones se leía ${Math.abs(Math.round((1 - ultimo.venta / manualHoy.crcPorUsd) * 1000) / 10).toLocaleString("es-CR")} % ${manualHoy.crcPorUsd > ultimo.venta ? "más barato" : "más caro"} en dólares.`}
                aviso
              />
            )}
          </section>

          <Grafico dias={dias} rango={rango} onRango={setRango} hoyISO={hoyISO} referencia={manualHoy?.crcPorUsd ?? null} />

          <section aria-label="Mes a mes" className="flex flex-col gap-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-lg font-semibold text-fg">Mes a mes</h2>
              <span className="text-xs text-fg-muted">
                {traidoEn ? `Última vez que se trajo: ${fechaLarga(traidoEn.slice(0, 10))}.` : ""} Fuente: Banco Central de Costa Rica (directo o por el API de Hacienda).
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-line bg-surface">
              <table className="w-full min-w-[680px] text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
                    <th className="px-4 py-2.5">Mes</th>
                    <th className="px-4 py-2.5 text-right">Promedio de venta</th>
                    <th className="px-4 py-2.5 text-right">Mínimo</th>
                    <th className="px-4 py-2.5 text-right">Máximo</th>
                    <th className="px-4 py-2.5 text-right">Al cierre</th>
                    <th className="px-4 py-2.5 text-right">Días</th>
                    <th className="px-4 py-2.5 text-right">Cargado a mano</th>
                  </tr>
                </thead>
                <tbody>
                  {resumen.map((m) => {
                    const manual = manualDe.get(m.periodo);
                    return (
                      <tr key={m.periodo} className="border-b border-line last:border-b-0">
                        <td className="px-4 py-2 text-fg">{nombreMes(m.periodo)}</td>
                        <td className="px-4 py-2 text-right font-semibold tabular-nums text-fg">{crc(m.promedioVenta)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-fg-secondary">{crc(m.minimo)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-fg-secondary">{crc(m.maximo)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-fg-secondary">{crc(m.alCierre)}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-fg-muted">{m.dias}</td>
                        <td className="px-4 py-2 text-right tabular-nums text-fg-muted" title={manual?.fuente}>
                          {manual ? crc(manual.crcPorUsd) : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs leading-[17px] text-fg-muted">
              «Cargado a mano» es la tasa que tenía cada mes antes de traer la del Banco Central. Ya no se usa en los meses que
              tienen días del BCCR; queda de respaldo para los que todavía no.
            </p>
          </section>
        </>
      )}
    </div>
  );
}

function Tile({ rotulo, valor, nota, aviso }: { rotulo: string; valor: string; nota: string; aviso?: boolean }) {
  return (
    <div className={`flex flex-col gap-1 rounded-xl border p-4 ${aviso ? "border-warn-line bg-warn-surface" : "border-line bg-surface"}`}>
      <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${aviso ? "text-warn-ink" : "text-fg-muted"}`}>{rotulo}</span>
      <span className="text-[22px] font-bold leading-7 tabular-nums text-fg">{valor}</span>
      <span className={`text-xs leading-[17px] ${aviso ? "text-warn-ink" : "text-fg-secondary"}`}>{nota}</span>
    </div>
  );
}

const ANCHO = 1000;
const ALTO = 260;

function Grafico({
  dias,
  rango,
  onRango,
  hoyISO,
  referencia,
}: {
  dias: TasaDelDia[];
  rango: Rango;
  onRango: (r: Rango) => void;
  hoyISO: string;
  /** La tasa cargada a mano del mes en curso, como línea de referencia. */
  referencia: number | null;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [i, setI] = useState<number | null>(null);
  const desde = rango === "todo" ? "" : sumarDias(hoyISO, -Number(rango));
  const vistos = dias.filter((d) => d.fecha >= desde);
  const valores = vistos.flatMap((d) => (d.compra !== null ? [d.venta, d.compra] : [d.venta]));
  const conRef = referencia !== null ? [...valores, referencia] : valores;
  const minimo = Math.min(...conRef);
  const maximo = Math.max(...conRef);
  const margen = Math.max(1, (maximo - minimo) * 0.08);
  const y0 = minimo - margen;
  const y1 = maximo + margen;
  const y = (v: number) => ALTO - ((v - y0) / (y1 - y0)) * ALTO;
  const x = (k: number) => (vistos.length <= 1 ? ANCHO / 2 : (k / (vistos.length - 1)) * ANCHO);
  const linea = (f: (d: TasaDelDia) => number | null) =>
    vistos
      .map((d, k) => ({ v: f(d), k }))
      .filter((p): p is { v: number; k: number } => p.v !== null)
      .map((p, n) => `${n === 0 ? "M" : "L"}${x(p.k).toFixed(1)},${y(p.v).toFixed(1)}`)
      .join(" ");
  const marcas = Array.from({ length: 4 }, (_, n) => y0 + ((y1 - y0) * (n + 0.5)) / 4);
  // Las fechas de abajo: el primer día de cada mes, salteando para que no se encimen.
  const inicios = vistos.map((d, k) => ({ d, k })).filter(({ d }, n) => n === 0 || d.fecha.slice(8, 10) === "01");
  const paso = Math.max(1, Math.ceil(inicios.length / 8));
  const etiquetas = inicios.filter((_, n) => n % paso === 0);
  const leido = i !== null ? vistos[i] : null;

  const mover = (clientX: number) => {
    const r = caja.current?.getBoundingClientRect();
    if (!r || vistos.length === 0) return;
    const k = Math.round(((clientX - r.left) / r.width) * (vistos.length - 1));
    setI(Math.max(0, Math.min(vistos.length - 1, k)));
  };

  return (
    <section aria-label="Histórico día por día" className="flex flex-col gap-3 rounded-xl border border-line bg-surface p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold text-fg">Día por día</h2>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fg-secondary">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t-2" style={{ borderColor: "var(--serie-1)" }} /> Venta (la que se usa)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden className="inline-block w-4 border-t" style={{ borderColor: "var(--serie-3)" }} /> Compra
            </span>
            {referencia !== null && (
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden className="inline-block w-4 border-t-2 border-dashed" style={{ borderColor: "var(--fg-muted)" }} /> {crc(referencia)} cargado a mano
              </span>
            )}
          </div>
        </div>
        <Segmentado
          etiqueta="Cuánto mirar"
          valor={rango}
          onCambio={(r) => {
            onRango(r);
            setI(null);
          }}
          opciones={[
            { clave: "90", etiqueta: "3 meses" },
            { clave: "365", etiqueta: "12 meses" },
            { clave: "todo", etiqueta: "Todo" },
          ]}
        />
      </div>

      {vistos.length === 0 ? (
        <p className="text-sm text-fg-muted">No hay tasas en este rango.</p>
      ) : (
        <div className="grid grid-cols-[64px_minmax(0,1fr)] gap-x-2">
          <div className="relative h-[260px]" aria-hidden>
            {marcas.map((v) => (
              <span key={v} className="absolute right-0 -translate-y-1/2 text-[11px] tabular-nums text-fg-muted" style={{ top: `${(y(v) / ALTO) * 100}%` }}>
                {crc(v).replace(/,\d+$/, "")}
              </span>
            ))}
          </div>
          <div
            ref={caja}
            className="relative h-[260px] cursor-crosshair"
            onMouseMove={(e) => mover(e.clientX)}
            onMouseLeave={() => setI(null)}
            role="img"
            aria-label={`Venta del BCCR del ${fechaLarga(vistos[0]!.fecha)} al ${fechaLarga(vistos[vistos.length - 1]!.fecha)}: entre ${crc(Math.min(...vistos.map((d) => d.venta)))} y ${crc(Math.max(...vistos.map((d) => d.venta)))}.`}
          >
            <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
              {marcas.map((v) => (
                <line key={v} x1={0} x2={ANCHO} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              ))}
              {referencia !== null && (
                <line x1={0} x2={ANCHO} y1={y(referencia)} y2={y(referencia)} stroke="var(--fg-muted)" strokeWidth={1.5} strokeDasharray="6 5" vectorEffect="non-scaling-stroke" />
              )}
              <path d={linea((d) => d.compra)} fill="none" stroke="var(--serie-3)" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
              <path d={linea((d) => d.venta)} fill="none" stroke="var(--serie-1)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
            </svg>
            {leido && i !== null && (
              <>
                <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-fg-muted" style={{ left: `${(x(i) / ANCHO) * 100}%` }} />
                <div
                  aria-hidden
                  className="pointer-events-none absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-surface"
                  style={{ left: `${(x(i) / ANCHO) * 100}%`, top: `${(y(leido.venta) / ALTO) * 100}%`, background: "var(--serie-1)" }}
                />
                <div
                  className="pointer-events-none absolute top-2 z-10 flex min-w-[170px] flex-col gap-0.5 rounded-lg border border-line bg-surface px-3 py-2 text-xs shadow-md"
                  style={x(i) > ANCHO * 0.6 ? { right: `${100 - (x(i) / ANCHO) * 100 + 1}%` } : { left: `${(x(i) / ANCHO) * 100 + 1}%` }}
                >
                  <span className="font-semibold text-fg">{fechaLarga(leido.fecha)}</span>
                  <span className="tabular-nums text-fg">
                    {crc(leido.venta)} <span className="text-fg-muted">venta</span>
                  </span>
                  {leido.compra !== null && (
                    <span className="tabular-nums text-fg-secondary">
                      {crc(leido.compra)} <span className="text-fg-muted">compra</span>
                    </span>
                  )}
                </div>
              </>
            )}
          </div>
          <div />
          <div className="relative mt-1 h-4" aria-hidden>
            {etiquetas.map(({ d, k }) => (
              <span
                key={d.fecha}
                className="absolute -translate-x-1/2 whitespace-nowrap text-[11px] text-fg-muted first:translate-x-0"
                style={{ left: `${(x(k) / ANCHO) * 100}%` }}
              >
                {MESES_CORTOS[Number(d.fecha.slice(5, 7)) - 1]}
                {d.fecha.slice(5, 7) === "01" || k === 0 ? ` ${d.fecha.slice(2, 4)}` : ""}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
