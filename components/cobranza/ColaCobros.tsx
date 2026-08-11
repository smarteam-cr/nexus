"use client";

/**
 * components/cobranza/ColaCobros.tsx — el LANDING del módulo: la cola de trabajo
 * de quien cobra. Totales arriba (CRC y USD SIEMPRE separados — jamás se suman),
 * lista de cobros pendientes ordenada DE LO MÁS VIEJO A LO MÁS NUEVO, con las
 * acciones del día a día inline: registrar pago (1 click → diálogo), promesa y
 * borrador de correo.
 *
 * Los cards se computan de la cola COMPLETA (la verdad del día); los filtros
 * solo estrechan la LISTA. El estado (rows) vive en CobranzaClient — igual que
 * la cartera — y el registro de pago lo ejecuta el contenedor (chokepoint
 * client único para cola + buscador global).
 *
 * AGRUPACIÓN (2026-07): la decide `clasificarCobro` (lib/cobranza/antiguedad.ts),
 * no el color del semáforo. Antes se agrupaba por semáforo y, como `semaforoCobro`
 * por diseño nunca marca vencido un cobro sin factura emitida, TODO lo atrasado
 * sin facturar caía en "Esta quincena" (15 cobros el 2026-07-24, el más viejo de
 * mayo). Ahora eso tiene grupo propio y arriba de todo, y lo vencido se subdivide
 * por antigüedad 30/60/90. El semáforo sigue gobernando el color del chip.
 *
 * NOTA: los helpers se importan de lib/cobranza/engine y /antiguedad (módulos
 * puros) y NO del barrel lib/cobranza (re-exporta módulos server-only).
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/components/ui/Toast";
import { EmptyState, IconCheck } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { addDaysISO } from "@/lib/cobranza/engine";
import {
  clasificarCobro,
  resumenAntiguedad,
  estadoTanda,
  GRUPOS_ORDEN,
  BUCKET_LABEL,
  KPI_CREDITO_DIAS,
  type GrupoCobro,
  type ResumenAntiguedad,
} from "@/lib/cobranza/antiguedad";
import type { ColaCobroRow, RiesgoPagoItem } from "@/lib/cobranza";
import {
  TIPO_SERVICIO_LABEL,
  TIPO_CUENTA_LABEL,
  COBRANZA_TIPOS_CUENTA,
} from "@/lib/cobranza/schema";
import { fmtFecha, fmtMonto } from "./format";
import BorradorCobroModal from "./BorradorCobroModal";
import PromesaDialog from "./PromesaDialog";
import MarcarFacturadoDialog from "./MarcarFacturadoDialog";

type Grupo = GrupoCobro;
type FiltroMoneda = "all" | "CRC" | "USD";

const GRUPO_LABEL: Record<Grupo, string> = {
  sinFacturar: "Falta facturar",
  ...BUCKET_LABEL,
  quincena: "Esta quincena",
  adelante: "Más adelante",
};

/** Subtítulo del grupo — dice qué hacer, no solo qué es. */
const GRUPO_HINT: Partial<Record<Grupo, string>> = {
  sinFacturar:
    "El cliente todavía no debe esto: falta emitir la factura. Es trabajo de Smarteam, no mora.",
  d90mas: "Lo más viejo de la cartera — atacar primero.",
  quincena: "Programado para cobrarse en el período actual.",
};

/** Los cubos de vencido: comparten el tratamiento visual (rojo, "hace N d"). */
const ES_VENCIDO: Record<Grupo, boolean> = {
  sinFacturar: false,
  d90mas: true,
  d61_90: true,
  d31_60: true,
  d0_30: true,
  quincena: false,
  adelante: false,
};

/**
 * ¿Este cobro tiene una promesa de pago que vence dentro de la semana?
 *
 * Vive suelto y no inline porque lo consumen DOS cosas: el número de la tarjeta azul y
 * el filtro que esa misma tarjeta enciende. Con dos copias, el día que alguien mueva la
 * ventana en una, la tarjeta diría "4" y la lista mostraría 3.
 */
function esPromesaDeLaSemana(r: ColaCobroRow, todayISO: string, finSemanaISO: string): boolean {
  return !!r.promesaPago && r.promesaPago >= todayISO && r.promesaPago < finSemanaISO;
}

/** Total por moneda de un set de filas — SIEMPRE separados (regla dura). */
function totalesPorMoneda(rows: ColaCobroRow[]): { CRC: number; USD: number } {
  const t = { CRC: 0, USD: 0 };
  for (const r of rows) {
    if (r.moneda === "CRC" || r.moneda === "USD") t[r.moneda] += r.monto;
  }
  return t;
}

/**
 * KPI — plata vencida que ya pasó el crédito estándar (30 días). Por moneda: CRC y
 * USD jamás se suman. El % es sobre lo vencido de ESA moneda, no sobre la cartera:
 * responde "de lo que me deben tarde, cuánto está muy tarde".
 */
function KpiVencido30({ resumen }: { resumen: ResumenAntiguedad }) {
  const lineas = Object.entries(resumen)
    .filter(([, r]) => r.vencido30mas > 0)
    .map(([moneda, r]) => ({
      moneda,
      monto: r.vencido30mas,
      pct: r.totalVencido > 0 ? Math.round((r.vencido30mas / r.totalVencido) * 100) : 0,
      n: r.n30mas,
    }));
  const nTotal = lineas.reduce((n, l) => n + l.n, 0);
  return (
    <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
      <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">
        Vencido +{KPI_CREDITO_DIAS} días · {nTotal}
      </p>
      {lineas.length === 0 ? (
        <p className="mt-1.5 flex items-center gap-1.5 text-lg font-semibold text-emerald-600 leading-tight"><IconCheck className="w-4 h-4" />Nada</p>
      ) : (
        <div className="mt-1.5 space-y-0.5">
          {lineas.map((l) => (
            <p key={l.moneda} className="text-lg font-semibold text-fg tabular-nums leading-tight">
              {fmtMonto(l.monto, l.moneda)}{" "}
              <span className="text-[11px] font-normal text-fg-muted">
                · {l.pct}% de lo vencido
              </span>
            </p>
          ))}
        </div>
      )}
      <p className="text-[11px] text-fg-muted mt-0.5">
        supera el crédito estándar de {KPI_CREDITO_DIAS} días
      </p>
    </div>
  );
}

/**
 * KPI — DSO: días promedio que la plata exigible lleva sin entrar, ponderado por
 * monto (una factura grande y vieja pesa más que una chica). Alerta si supera el
 * crédito estándar. null = no hay exigibles, y eso NO es cero (cero mentiría).
 */
function KpiDso({ resumen }: { resumen: ResumenAntiguedad }) {
  const lineas = Object.entries(resumen).filter(([, r]) => r.dso !== null);
  const excede = lineas.some(([, r]) => (r.dso ?? 0) > KPI_CREDITO_DIAS);
  return (
    <div
      className={`rounded-xl border px-4 py-3 ${
        excede ? "border-red-500/30 bg-red-500/5" : "border-line bg-surface-muted"
      }`}
    >
      <p
        className={`text-[11px] font-semibold uppercase tracking-wide ${
          excede ? "text-red-600" : "text-fg-muted"
        }`}
      >
        Promedio de cobro
      </p>
      {lineas.length === 0 ? (
        <p className="mt-1.5 text-lg font-semibold text-fg-muted leading-tight">—</p>
      ) : (
        <div className="mt-1.5 space-y-0.5">
          {lineas.map(([moneda, r]) => (
            <p key={moneda} className="text-lg font-semibold text-fg tabular-nums leading-tight">
              {r.dso} d{" "}
              {lineas.length > 1 && (
                <span className="text-[11px] font-normal text-fg-muted">{moneda}</span>
              )}
            </p>
          ))}
        </div>
      )}
      <p className="text-[11px] text-fg-muted mt-0.5">
        {excede
          ? `por encima del crédito de ${KPI_CREDITO_DIAS} días`
          : `dentro del crédito de ${KPI_CREDITO_DIAS} días`}
      </p>
    </div>
  );
}

function LineasMoneda({ totales }: { totales: { CRC: number; USD: number } }) {
  return (
    <div className="space-y-0.5">
      <p className="text-lg font-semibold text-fg tabular-nums leading-tight">
        {totales.CRC > 0 ? fmtMonto(totales.CRC, "CRC") : "₡0"}
      </p>
      <p className="text-lg font-semibold text-fg tabular-nums leading-tight">
        {totales.USD > 0 ? fmtMonto(totales.USD, "USD") : "$0"}
      </p>
    </div>
  );
}

export default function ColaCobros({
  rows,
  setRows,
  riesgo,
  todayISO,
  onRegistrarPago,
  onOpenCuenta,
}: {
  rows: ColaCobroRow[];
  setRows: Dispatch<SetStateAction<ColaCobroRow[]>>;
  riesgo: RiesgoPagoItem[];
  todayISO: string;
  onRegistrarPago: (row: ColaCobroRow) => void;
  onOpenCuenta: (cuentaId: string) => void;
}) {
  const toast = useToast();
  const [q, setQ] = useState("");
  const [fMoneda, setFMoneda] = useState<FiltroMoneda>("all");
  /* Nacional / Internacional: la plataforma de facturación depende de esto (Odoo lo
     nacional, Mercury lo internacional), así que procesarlos juntos obliga a saltear
     filas a ojo. Mismo control y mismo vocabulario que la pestaña Clientes. */
  const [fTipo, setFTipo] = useState<string>("all");
  /* Filtro de promesas: lo enciende la tarjeta azul, no un control aparte — ver el
     comentario de la tarjeta. */
  const [soloPromesas, setSoloPromesas] = useState(false);
  const [verAdelante, setVerAdelante] = useState(false);
  const [promesaCobro, setPromesaCobro] = useState<ColaCobroRow | null>(null);
  const [borradorCobro, setBorradorCobro] = useState<ColaCobroRow | null>(null);
  const [facturarCobro, setFacturarCobro] = useState<ColaCobroRow | null>(null);

  const riesgoSet = useMemo(() => new Set(riesgo.map((r) => r.cobroId)), [riesgo]);
  const finSemana = useMemo(() => addDaysISO(todayISO, 7), [todayISO]);
  const tanda = useMemo(() => estadoTanda(todayISO), [todayISO]);

  // Agrupación por ANTIGÜEDAD (helper puro con tests). Lo viejo primero; dentro de
  // cada grupo, lo más atrasado arriba.
  const grupos = useMemo(() => {
    const out = Object.fromEntries(GRUPOS_ORDEN.map((g) => [g, [] as ColaCobroRow[]])) as Record<
      Grupo,
      ColaCobroRow[]
    >;
    for (const r of rows) out[clasificarCobro(r, todayISO)].push(r);
    for (const g of GRUPOS_ORDEN) {
      // Vencidos y sin facturar: el más viejo arriba. Lo futuro ya viene por fecha
      // ascendente del server (lo próximo primero), que ahí es lo correcto.
      if (g !== "quincena" && g !== "adelante") {
        out[g].sort((a, b) => b.diasAtraso - a.diasAtraso || a.id.localeCompare(b.id));
      }
    }
    return out;
  }, [rows, todayISO]);

  // Resumen por moneda para los KPI — de la cola COMPLETA, sin filtros.
  const resumen = useMemo(() => resumenAntiguedad(rows, todayISO), [rows, todayISO]);

  const vencidos = useMemo(
    () => GRUPOS_ORDEN.filter((g) => ES_VENCIDO[g]).flatMap((g) => grupos[g]),
    [grupos],
  );

  // Cards: SIEMPRE de la cola completa — los filtros no cambian la verdad del día.
  const cards = useMemo(
    () => ({
      vencido: totalesPorMoneda(vencidos),
      nVencidos: vencidos.length,
      quincena: totalesPorMoneda(grupos.quincena),
      nQuincena: grupos.quincena.length,
      sinFacturar: totalesPorMoneda(grupos.sinFacturar),
      nSinFacturar: grupos.sinFacturar.length,
      promesas: rows.filter((r) => esPromesaDeLaSemana(r, todayISO, finSemana)).length,
    }),
    [grupos, vencidos, rows, todayISO, finSemana],
  );

  const filtra = (list: ColaCobroRow[]) => {
    let out = list;
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((r) => r.clienteNombre.toLowerCase().includes(needle));
    if (fMoneda !== "all") out = out.filter((r) => r.moneda === fMoneda);
    if (fTipo !== "all") out = out.filter((r) => r.tipoCuenta === fTipo);
    // El MISMO predicado que cuenta la tarjeta: si divergieran, el número diría 4 y
    // la lista mostraría 3, que es peor que no tener el filtro.
    if (soloPromesas) out = out.filter((r) => esPromesaDeLaSemana(r, todayISO, finSemana));
    return out;
  };
  const visibles = Object.fromEntries(
    GRUPOS_ORDEN.map((g) => [g, filtra(grupos[g])]),
  ) as Record<Grupo, ColaCobroRow[]>;
  const hayFiltros = q.trim() !== "" || fMoneda !== "all" || fTipo !== "all" || soloPromesas;
  const totalVisible = GRUPOS_ORDEN.reduce((n, g) => n + visibles[g].length, 0);

  // Promesa desde la cola: PATCH optimista sobre las filas (patrón applyPromesa).
  async function applyPromesa(row: ColaCobroRow, promesaPago: string | null) {
    const prev = row.promesaPago;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, promesaPago } : r)));
    try {
      await fetchJson(`/api/cobranza/cobros/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ promesaPago }),
      });
      toast.success(
        promesaPago
          ? "Promesa registrada — sus alertas se callan hasta esa fecha."
          : "Promesa retirada — sus alertas vuelven al feed.",
      );
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, promesaPago: prev } : r)));
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la promesa.");
    }
  }

  // Marcar facturado / revertir: PATCH optimista sobre las filas (mismo patrón que applyPromesa).
  async function applyFacturar(row: ColaCobroRow, fechaEmision: string | null) {
    const prev = row.fechaEmision;
    setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, fechaEmision } : r)));
    try {
      await fetchJson(`/api/cobranza/cobros/${row.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fechaEmision }),
      });
      toast.success(fechaEmision ? "Marcado como facturado." : "Factura revertida.");
    } catch (e) {
      setRows((rs) => rs.map((r) => (r.id === row.id ? { ...r, fechaEmision: prev } : r)));
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la factura.");
    }
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="No hay cobros pendientes"
        description="Todo lo generado ya está cobrado. Cuando un plan genere cuotas nuevas van a aparecer acá."
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* ── Tanda de cobro: Smarteam cobra del 1 al 5 y del 15 al 20. Es una VENTANA
             DE TRABAJO — no mueve la fecha de ningún cobro, solo dice si hoy toca. ── */}
      <div
        className={`rounded-xl border px-4 py-2.5 text-[11px] ${
          tanda.activa
            ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700"
            : "border-line bg-surface-muted text-fg-muted"
        }`}
      >
        {tanda.activa ? (
          <>
            <span className="font-semibold">Tanda de cobro abierta</span> · {tanda.activa.label}
          </>
        ) : (
          <>
            Fuera de tanda · la próxima abre el día {tanda.proximaDesde}
            {tanda.diasParaProxima > 0 && ` (en ${tanda.diasParaProxima} día${tanda.diasParaProxima !== 1 ? "s" : ""})`}
          </>
        )}
      </div>

      {/* ── Cards de resumen (la verdad del día — no las tocan los filtros) ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">
            Vencido · {cards.nVencidos} cobro{cards.nVencidos !== 1 ? "s" : ""}
          </p>
          <div className="mt-1.5">
            <LineasMoneda totales={cards.vencido} />
          </div>
        </div>

        {/* KPI 1 — la plata que ya pasó el crédito estándar de la casa. */}
        <KpiVencido30 resumen={resumen} />

        {/* KPI 2 — cuánto tarda en entrar la plata (DSO). */}
        <KpiDso resumen={resumen} />

        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">
            Por cobrar esta quincena · {cards.nQuincena}
          </p>
          <div className="mt-1.5">
            <LineasMoneda totales={cards.quincena} />
          </div>
        </div>
      </div>

      {/* Segunda fila: lo que depende de Smarteam y las promesas. */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-warn-line bg-warn-surface px-4 py-3">
          <p className="text-[11px] font-semibold text-warn-ink uppercase tracking-wide">
            Falta facturar · {cards.nSinFacturar}
          </p>
          <div className="mt-1.5">
            <LineasMoneda totales={cards.sinFacturar} />
          </div>
          <p className="text-[11px] text-fg-muted mt-0.5">
            {cards.nSinFacturar === 0
              ? "todo lo vencido ya tiene factura emitida"
              : "atrasado por facturar — no es mora del cliente"}
          </p>
        </div>
        {/* La ÚNICA tarjeta que además filtra, y es a propósito: su número es una lista de
            trabajo concreta ("a estos cuatro les toca hoy"), no un total de plata. Antes
            obligaba a bajar leyendo la cola entera buscando los chips de promesa.
            El conteo sigue saliendo de la cola COMPLETA — la doctrina no se mueve. */}
        <button
          type="button"
          onClick={() => setSoloPromesas((v) => !v)}
          disabled={cards.promesas === 0}
          aria-pressed={soloPromesas}
          className={`rounded-xl border px-4 py-3 text-left transition-colors ${
            soloPromesas
              ? "border-sky-500 bg-sky-500/10 ring-1 ring-sky-500/40"
              : "border-sky-500/30 bg-sky-500/5"
          } ${cards.promesas === 0 ? "cursor-default opacity-70" : "hover:bg-sky-500/10"}`}
        >
          <p className="text-[11px] font-semibold text-sky-600 uppercase tracking-wide">
            Promesas esta semana
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums leading-tight">
            {cards.promesas}
          </p>
          <p className="text-[11px] text-fg-muted">
            {cards.promesas === 0
              ? "sin promesas por vencer"
              : soloPromesas
                ? "mostrando solo estas — clic para ver todo"
                : "clic para ver solo estos cobros"}
          </p>
        </button>
      </div>

      {/* ── Filtros (solo estrechan la lista) ── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="text-[11px] border border-line rounded-md px-2 py-1.5 bg-surface text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand w-44"
        />
        <div className="inline-flex rounded-md border border-line overflow-hidden">
          {(["all", "CRC", "USD"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setFMoneda(m)}
              aria-pressed={fMoneda === m}
              className={`px-2.5 py-1 text-[11px] font-medium transition-colors ${
                fMoneda === m
                  ? "bg-brand/10 text-brand"
                  : "bg-surface text-fg-muted hover:bg-surface-hover hover:text-fg-secondary"
              }`}
            >
              {m === "all" ? "Todas" : m === "CRC" ? "₡ CRC" : "$ USD"}
            </button>
          ))}
        </div>
        {/* Nacional / Internacional — mismo control y mismas etiquetas que la pestaña
            Clientes, para que el vocabulario no cambie entre pestañas. Separa la pasada
            de facturación de Odoo (nacional) de la de Mercury (internacional). */}
        <select
          value={fTipo}
          onChange={(e) => setFTipo(e.target.value)}
          aria-label="Tipo de cuenta"
          className="text-[11px] border border-line rounded-md px-2 py-1.5 bg-surface text-fg focus:outline-none focus:border-brand"
        >
          <option value="all">Nacional e internacional</option>
          {COBRANZA_TIPOS_CUENTA.map((t) => (
            <option key={t} value={t}>
              {TIPO_CUENTA_LABEL[t] ?? t}
            </option>
          ))}
        </select>
        <span className="text-[11px] text-fg-muted">
          {totalVisible} cobro{totalVisible !== 1 ? "s" : ""} pendiente{totalVisible !== 1 ? "s" : ""}
        </span>
        {soloPromesas && (
          <button
            type="button"
            onClick={() => setSoloPromesas(false)}
            className="text-[11px] font-medium text-brand hover:opacity-80"
          >
            Quitar filtro de promesas
          </button>
        )}
      </div>

      {/* ── Grupos ── */}
      {hayFiltros && totalVisible === 0 ? (
        <EmptyState
          variant="dashed"
          title="Nada matchea esos filtros"
          description="Ajustá la búsqueda, la moneda, el tipo de cuenta o quitá el filtro de promesas."
        />
      ) : (
        GRUPOS_ORDEN.map((g) => {
          const list = visibles[g];
          if (g === "adelante") {
            return (
              <div key={g}>
                <button
                  type="button"
                  onClick={() => setVerAdelante((v) => !v)}
                  className="flex items-center gap-1.5 text-[11px] font-semibold text-fg-muted uppercase tracking-widest hover:text-fg-secondary transition-colors"
                >
                  <span className={`transition-transform ${verAdelante ? "rotate-90" : ""}`}>▸</span>
                  {GRUPO_LABEL[g]} ({list.length})
                </button>
                {verAdelante && <ListaGrupo grupo={g} list={list} />}
              </div>
            );
          }
          // Un cubo de antigüedad vacío no aporta nada: se omite (con filtros
          // activos también, para no llenar la pantalla de encabezados en cero).
          // Y CON filtros puestos se omite cualquier grupo vacío, no solo los de
          // vencido: filtrar por promesas dejaba "Esta quincena · 0" en pantalla,
          // que es justo el ruido que el filtro venía a sacar.
          if (list.length === 0 && (hayFiltros || ES_VENCIDO[g] || g === "sinFacturar")) return null;
          const totales = totalesPorMoneda(list);
          return (
            <div key={g}>
              <div className="flex items-baseline gap-2 flex-wrap">
                <p
                  className={`text-[11px] font-semibold uppercase tracking-widest ${
                    g === "sinFacturar"
                      ? "text-warn-ink"
                      : ES_VENCIDO[g]
                        ? "text-red-600"
                        : "text-fg-muted"
                  }`}
                >
                  {GRUPO_LABEL[g]} ({list.length})
                </p>
                {(totales.CRC > 0 || totales.USD > 0) && (
                  <span className="text-[11px] text-fg-muted tabular-nums">
                    {[totales.CRC > 0 ? fmtMonto(totales.CRC, "CRC") : null,
                      totales.USD > 0 ? fmtMonto(totales.USD, "USD") : null]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                )}
              </div>
              {GRUPO_HINT[g] && (
                <p className="mt-0.5 text-[11px] text-fg-muted">{GRUPO_HINT[g]}</p>
              )}
              {g === "quincena" && list.length === 0 && !hayFiltros ? (
                <p className="mt-1.5 flex items-center gap-1 text-xs text-emerald-600"><IconCheck className="w-3 h-3" />Nada pendiente en este período</p>
              ) : (
                <ListaGrupo grupo={g} list={list} />
              )}
            </div>
          );
        })
      )}

      {promesaCobro && (
        <PromesaDialog
          cobro={promesaCobro}
          onCancel={() => setPromesaCobro(null)}
          onSave={async (promesaPago) => {
            const row = promesaCobro;
            setPromesaCobro(null);
            await applyPromesa(row, promesaPago);
          }}
        />
      )}

      {borradorCobro && (
        <BorradorCobroModal cobro={borradorCobro} onClose={() => setBorradorCobro(null)} />
      )}

      {facturarCobro && (
        <MarcarFacturadoDialog
          cobro={facturarCobro}
          todayISO={todayISO}
          onCancel={() => setFacturarCobro(null)}
          onConfirm={async ({ fechaEmision }) => {
            const row = facturarCobro;
            setFacturarCobro(null);
            await applyFacturar(row, fechaEmision);
          }}
        />
      )}
    </div>
  );

  // ── Fila de cobro (definida inline para cerrar sobre los handlers) ─────────────
  function ListaGrupo({ grupo, list }: { grupo: Grupo; list: ColaCobroRow[] }) {
    if (list.length === 0) {
      return <p className="mt-1.5 text-xs text-fg-muted">Sin cobros en este grupo.</p>;
    }
    return (
      <ul className="mt-1.5 space-y-1.5">
        {list.map((r) => (
          <li key={r.id} className="rounded-lg border border-line bg-surface px-3 py-2">
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => onOpenCuenta(r.cuentaId)}
                title="Abrir la cuenta del cliente"
                className="text-xs font-medium text-fg hover:underline flex-shrink-0"
              >
                {r.clienteNombre}
              </button>
              <span className="text-[11px] text-fg-muted truncate max-w-[16rem]">
                {TIPO_SERVICIO_LABEL[r.servicioTipo] ?? r.servicioTipo}
                {r.servicioDescripcion ? ` · ${r.servicioDescripcion}` : ""}
              </span>
              <span className="text-[11px] text-fg-muted flex-shrink-0">
                {r.numCuota != null ? `#${r.numCuota} · ` : ""}
                {r.periodo}
              </span>
              {ES_VENCIDO[grupo] || grupo === "sinFacturar" ? (
                <span className="text-[11px] flex-shrink-0">
                  <span
                    className={`font-semibold ${grupo === "sinFacturar" ? "text-warn-ink" : "text-red-600"}`}
                  >
                    hace {r.diasAtraso} d
                  </span>{" "}
                  <span className="text-fg-muted">({fmtFecha(r.fechaProgramada)})</span>
                </span>
              ) : (
                <span className="text-[11px] text-fg-secondary flex-shrink-0">
                  {fmtFecha(r.fechaProgramada)}
                </span>
              )}
              <span className="text-xs text-fg tabular-nums flex-shrink-0">
                {fmtMonto(r.monto, r.moneda)}
              </span>
              {r.origen === "CATCH_UP" && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-amber-600 bg-amber-500/10 border-amber-500/30 flex-shrink-0">
                  catch-up
                </span>
              )}
              {r.estado === "SIN_DATO" && (
                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line bg-surface-muted text-fg-muted flex-shrink-0">
                  sin dato
                </span>
              )}
              {r.promesaPago && (
                <span
                  title={
                    r.promesaPago >= todayISO
                      ? "Promesa vigente: sus alertas están calladas hasta esa fecha"
                      : "Promesa incumplida: la fecha pasó sin cobro"
                  }
                  className={`text-[10px] font-medium px-1.5 py-0.5 rounded border flex-shrink-0 ${
                    r.promesaPago >= todayISO
                      ? "text-sky-600 bg-sky-500/10 border-sky-500/30"
                      : "text-red-600 bg-red-500/10 border-red-500/30"
                  }`}
                >
                  prometió {fmtFecha(r.promesaPago)}
                </span>
              )}
              {riesgoSet.has(r.id) && (
                <span
                  title="En riesgo: el atraso supera el comportamiento histórico de esta cuenta"
                  className="text-[10px] font-medium px-1.5 py-0.5 rounded border text-red-600 bg-red-500/10 border-red-500/30 flex-shrink-0"
                >
                  en riesgo
                </span>
              )}
              <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                {r.fechaEmision ? (
                  <button
                    type="button"
                    onClick={() => applyFacturar(r, null)}
                    title="Revertir la marca de facturado"
                    className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
                  >
                    Revertir factura
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => setFacturarCobro(r)}
                    title="Marcar que ya se emitió la factura de este cobro"
                    className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
                  >
                    Marcar facturado
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setPromesaCobro(r)}
                  title="Registrar la fecha en que el cliente prometió pagar"
                  className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
                >
                  Promesa
                </button>
                <button
                  type="button"
                  onClick={() => setBorradorCobro(r)}
                  title="Generar borrador de correo de cobro (lo revisás y lo enviás vos)"
                  className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors whitespace-nowrap"
                >
                  Borrador
                </button>
                <button
                  type="button"
                  onClick={() => onRegistrarPago(r)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors whitespace-nowrap"
                >
                  Registrar pago
                </button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    );
  }
}
