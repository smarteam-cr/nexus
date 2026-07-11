"use client";

/**
 * components/cobranza/ColaCobros.tsx — el LANDING del módulo: la cola de trabajo
 * de quien cobra. Totales arriba (CRC y USD SIEMPRE separados — jamás se suman),
 * lista de cobros pendientes agrupada por urgencia (Vencidos → Esta quincena →
 * Más adelante) con las acciones del día a día inline: registrar pago (1 click
 * → diálogo), promesa y borrador de correo.
 *
 * Los cards se computan de la cola COMPLETA (la verdad del día); los filtros
 * solo estrechan la LISTA. El estado (rows) vive en CobranzaClient — igual que
 * la cartera — y el registro de pago lo ejecuta el contenedor (chokepoint
 * client único para cola + buscador global).
 *
 * NOTA: `semaforoCobro`/`finQuincenaISO` se importan de lib/cobranza/engine
 * (motor puro) y NO del barrel lib/cobranza (re-exporta módulos server-only).
 */
import { useMemo, useState, type Dispatch, type SetStateAction } from "react";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { addDaysISO, finQuincenaISO, semaforoCobro } from "@/lib/cobranza/engine";
import type { ColaCobroRow, RiesgoPagoItem } from "@/lib/cobranza";
import { TIPO_SERVICIO_LABEL } from "@/lib/cobranza/schema";
import { fmtFecha, fmtMonto } from "./format";
import BorradorCobroModal from "./BorradorCobroModal";
import PromesaDialog from "./PromesaDialog";

type Grupo = "vencidos" | "quincena" | "adelante";
type FiltroMoneda = "all" | "CRC" | "USD";

const GRUPO_LABEL: Record<Grupo, string> = {
  vencidos: "Vencidos",
  quincena: "Esta quincena",
  adelante: "Más adelante",
};

/** Total por moneda de un set de filas — SIEMPRE separados (regla dura). */
function totalesPorMoneda(rows: ColaCobroRow[]): { CRC: number; USD: number } {
  const t = { CRC: 0, USD: 0 };
  for (const r of rows) {
    if (r.moneda === "CRC" || r.moneda === "USD") t[r.moneda] += r.monto;
  }
  return t;
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
  const [verAdelante, setVerAdelante] = useState(false);
  const [promesaCobro, setPromesaCobro] = useState<ColaCobroRow | null>(null);
  const [borradorCobro, setBorradorCobro] = useState<ColaCobroRow | null>(null);

  const riesgoSet = useMemo(() => new Set(riesgo.map((r) => r.cobroId)), [riesgo]);
  const finQuincena = useMemo(() => finQuincenaISO(todayISO), [todayISO]);
  const finSemana = useMemo(() => addDaysISO(todayISO, 7), [todayISO]);

  // Agrupación con la regla canónica del semáforo: rojo (= vencido, >3 días) →
  // Vencidos; el resto por fecha (la gracia de 0-3 días cae en Esta quincena).
  const grupos = useMemo(() => {
    const out: Record<Grupo, ColaCobroRow[]> = { vencidos: [], quincena: [], adelante: [] };
    for (const r of rows) {
      const sem = semaforoCobro({ estado: r.estado, fechaProgramadaISO: r.fechaProgramada }, todayISO);
      if (sem === "rojo") out.vencidos.push(r);
      else if (r.fechaProgramada <= finQuincena) out.quincena.push(r);
      else out.adelante.push(r);
    }
    out.vencidos.sort((a, b) => b.diasAtraso - a.diasAtraso || a.id.localeCompare(b.id));
    return out; // quincena/adelante ya vienen por fecha asc del server
  }, [rows, todayISO, finQuincena]);

  // Cards: SIEMPRE de la cola completa — los filtros no cambian la verdad del día.
  const cards = useMemo(
    () => ({
      vencido: totalesPorMoneda(grupos.vencidos),
      nVencidos: grupos.vencidos.length,
      quincena: totalesPorMoneda(grupos.quincena),
      nQuincena: grupos.quincena.length,
      promesas: rows.filter((r) => r.promesaPago && r.promesaPago >= todayISO && r.promesaPago < finSemana).length,
    }),
    [grupos, rows, todayISO, finSemana],
  );

  const filtra = (list: ColaCobroRow[]) => {
    let out = list;
    const needle = q.trim().toLowerCase();
    if (needle) out = out.filter((r) => r.clienteNombre.toLowerCase().includes(needle));
    if (fMoneda !== "all") out = out.filter((r) => r.moneda === fMoneda);
    return out;
  };
  const visibles: Record<Grupo, ColaCobroRow[]> = {
    vencidos: filtra(grupos.vencidos),
    quincena: filtra(grupos.quincena),
    adelante: filtra(grupos.adelante),
  };
  const hayFiltros = q.trim() !== "" || fMoneda !== "all";
  const totalVisible = visibles.vencidos.length + visibles.quincena.length + visibles.adelante.length;

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
      {/* ── Cards de resumen (la verdad del día — no las tocan los filtros) ── */}
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 px-4 py-3">
          <p className="text-[11px] font-semibold text-red-600 uppercase tracking-wide">
            Vencido · {cards.nVencidos} cobro{cards.nVencidos !== 1 ? "s" : ""}
          </p>
          <div className="mt-1.5">
            <LineasMoneda totales={cards.vencido} />
          </div>
        </div>
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <p className="text-[11px] font-semibold text-amber-600 uppercase tracking-wide">
            Por cobrar esta quincena · {cards.nQuincena}
          </p>
          <div className="mt-1.5">
            <LineasMoneda totales={cards.quincena} />
          </div>
        </div>
        <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 px-4 py-3">
          <p className="text-[11px] font-semibold text-sky-600 uppercase tracking-wide">
            Promesas esta semana
          </p>
          <p className="mt-1.5 text-lg font-semibold text-fg tabular-nums leading-tight">
            {cards.promesas}
          </p>
          <p className="text-[11px] text-fg-muted">
            {cards.promesas === 0 ? "sin promesas por vencer" : "cliente(s) que prometieron pagar"}
          </p>
        </div>
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
        <span className="text-[11px] text-fg-muted">
          {totalVisible} cobro{totalVisible !== 1 ? "s" : ""} pendiente{totalVisible !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Grupos ── */}
      {hayFiltros && totalVisible === 0 ? (
        <EmptyState
          variant="dashed"
          title="Nada matchea esa búsqueda"
          description="Ajustá la búsqueda o el filtro de moneda."
        />
      ) : (
        (["vencidos", "quincena", "adelante"] as const).map((g) => {
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
          return (
            <div key={g}>
              <p className="text-[11px] font-semibold text-fg-muted uppercase tracking-widest">
                {GRUPO_LABEL[g]} ({list.length})
              </p>
              {g === "vencidos" && list.length === 0 && !hayFiltros ? (
                <p className="mt-1.5 text-xs text-emerald-600">✓ Nada vencido</p>
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
              {grupo === "vencidos" ? (
                <span className="text-[11px] flex-shrink-0">
                  <span className="text-red-600 font-semibold">hace {r.diasAtraso} d</span>{" "}
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
