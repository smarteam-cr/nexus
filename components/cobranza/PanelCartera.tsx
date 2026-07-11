"use client";

/**
 * components/cobranza/PanelCartera.tsx
 *
 * La tabla de cartera (réplica operativa del Sheet de Finanzas): una fila por
 * cliente con proyecto real. Filas sin cuenta configurada se ven tenues con el
 * CTA "Configurar cuenta" (POST get-or-create + abre el drawer); las configuradas
 * abren el CuentaDrawer al click. Pestañas Todas/Configuradas/Sin configurar +
 * filtros client-side (servicio, tipo, estado, semáforo) + búsqueda por nombre.
 * Las filas viven en CobranzaClient (rows/setRows): los tabs desmontan este
 * componente y un useState local volvería stale al cambiar de tab y volver.
 * El CuentaDrawer también vive en el contenedor (lo abren la cola, esta tabla
 * y las alertas de configuración) — acá solo se pide con onOpenCuenta.
 */
import { useMemo, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { EmptyState } from "@/components/ui";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { diffDays } from "@/lib/cobranza/engine";
import type { CarteraRow } from "@/lib/cobranza";
import {
  COBRANZA_TIPOS_CUENTA,
  COBRANZA_TIPOS_SERVICIO,
  COBRANZA_ESTADOS_CUENTA,
  TIPO_CUENTA_LABEL,
  TIPO_SERVICIO_LABEL,
  ESTADO_CUENTA_LABEL,
} from "@/lib/cobranza/schema";
import Link from "next/link";
import { fmtFecha, fmtMonto, SEMAFORO_META, FILTER_SELECT_CLS } from "./format";
import NuevaEmpresaModal from "./NuevaEmpresaModal";

const ESTADO_CHIP: Record<string, string> = {
  ACTIVA: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
  CON_ATRASO: "text-red-600 bg-red-500/10 border-red-500/30",
  SUSPENDIDA: "text-fg-muted bg-surface-muted border-line",
  PENDIENTE_DATOS: "text-amber-600 bg-amber-500/10 border-amber-500/30",
  PENDIENTE_CONTRATO: "text-amber-600 bg-amber-500/10 border-amber-500/30",
};

const TH_CLS =
  "px-4 py-2.5 text-left text-[11px] font-semibold text-fg-muted uppercase tracking-wide whitespace-nowrap";

// Pestañas de vista: segmentan por estado de configuración (el resto filtra encima).
type Vista = "todas" | "configuradas" | "sin_configurar";
const VISTAS: Array<{ key: Vista; label: string }> = [
  { key: "todas", label: "Todas" },
  { key: "configuradas", label: "Configuradas" },
  { key: "sin_configurar", label: "Sin configurar" },
];

const SEMAFOROS_ORDEN = ["rojo", "amarillo", "gris", "verde"] as const;

export default function PanelCartera({
  rows,
  todayISO,
  onOpenCuenta,
  onRefresh,
}: {
  rows: CarteraRow[];
  todayISO: string;
  onOpenCuenta: (cuentaId: string) => void;
  onRefresh: () => void;
}) {
  const toast = useToast();
  const [vista, setVista] = useState<Vista>("todas");
  const [q, setQ] = useState("");
  const [fServicio, setFServicio] = useState("all");
  const [fTipo, setFTipo] = useState("all");
  const [fEstado, setFEstado] = useState("all");
  const [fSemaforo, setFSemaforo] = useState("all");
  const [configurando, setConfigurando] = useState<string | null>(null); // clientId en vuelo
  const [showNuevaEmpresa, setShowNuevaEmpresa] = useState(false);

  const conteos = useMemo(() => {
    const configuradas = rows.filter((r) => r.cuentaId !== null).length;
    return { todas: rows.length, configuradas, sin_configurar: rows.length - configuradas };
  }, [rows]);

  const visible = useMemo(() => {
    let list = rows;
    if (vista === "configuradas") list = list.filter((r) => r.cuentaId !== null);
    if (vista === "sin_configurar") list = list.filter((r) => r.cuentaId === null);
    const needle = q.trim().toLowerCase();
    if (needle) list = list.filter((r) => r.clienteNombre.toLowerCase().includes(needle));
    // Los filtros de cuenta no aplican al backlog sin configurar (tipo/estado/
    // servicios van null ahí — cualquier valor daría 0 siempre): en esa pestaña
    // se ocultan y se ignoran.
    if (vista !== "sin_configurar") {
      if (fServicio !== "all") list = list.filter((r) => r.tiposServicio.includes(fServicio));
      if (fTipo !== "all") list = list.filter((r) => r.tipo === fTipo);
      if (fEstado !== "all") list = list.filter((r) => r.estadoCuenta === fEstado);
      // El semáforo solo es real en cuentas configuradas: las filas sin cuenta
      // llevan un gris SINTÉTICO del loader que no significa "programado".
      if (fSemaforo !== "all")
        list = list.filter((r) => r.cuentaId !== null && r.semaforo === fSemaforo);
    }
    return list;
  }, [rows, vista, q, fServicio, fTipo, fEstado, fSemaforo]);

  async function configurarCuenta(clientId: string) {
    if (configurando) return;
    setConfigurando(clientId);
    try {
      // Get-or-create: si la cuenta ya existía (click previo, otra PC), el POST
      // devuelve la existente con created:false — nunca es un error re-clickear.
      const d = await fetchJson<{ cuenta: { id: string }; created: boolean }>("/api/cobranza/cuentas", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientId }),
      });
      if (d.created) toast.success("Cuenta creada. Completá los datos de cobro.");
      else toast.info("Este cliente ya tenía una cuenta — se abrió la existente.");
      onOpenCuenta(d.cuenta.id);
      onRefresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo crear la cuenta.");
      onRefresh(); // best-effort: traer el estado real de la tabla
    } finally {
      setConfigurando(null);
    }
  }

  // "Hay filtros" = solo los que realmente aplican en la pestaña actual (los
  // selects de cuenta se ignoran en "sin_configurar"); la pestaña en sí no es
  // un filtro — su estado vacío tiene copy propio abajo.
  const filtrosCuentaActivos =
    fServicio !== "all" || fTipo !== "all" || fEstado !== "all" || fSemaforo !== "all";
  const hayFiltros =
    q.trim() !== "" || (vista !== "sin_configurar" && filtrosCuentaActivos);

  const vacio = hayFiltros
    ? {
        title: "Nada matchea esos filtros",
        description: "Ajustá la búsqueda o los filtros para ver más clientes.",
      }
    : vista === "sin_configurar"
      ? {
          title: "No queda nada por configurar",
          description: "Todos los clientes con proyecto activo ya tienen su cuenta financiera.",
        }
      : vista === "configuradas"
        ? {
            title: "Todavía no hay cuentas configuradas",
            description: "Configurá la primera desde la pestaña «Sin configurar».",
          }
        : {
            title: "Todavía no hay cartera que mostrar",
            description:
              "Cuando haya clientes con proyectos activos van a aparecer acá para configurarles la cuenta.",
          };

  return (
    <div className="space-y-3">
      {/* ── Pestañas de vista (configuración) + acciones ── */}
      <div className="flex flex-wrap items-center gap-2">
      <div className="inline-flex items-center gap-0.5 rounded-lg border border-line bg-surface-muted p-0.5">
        {VISTAS.map((v) => {
          const active = vista === v.key;
          return (
            <button
              key={v.key}
              type="button"
              onClick={() => setVista(v.key)}
              className={`px-3 py-1.5 text-[11px] font-medium rounded-md border transition-colors ${
                active
                  ? "bg-surface text-fg shadow-sm border-line"
                  : "border-transparent text-fg-muted hover:text-fg-secondary"
              }`}
            >
              {v.label}
              <span className={`ml-1.5 tabular-nums ${active ? "text-fg-secondary" : "text-fg-muted"}`}>
                {conteos[v.key]}
              </span>
            </button>
          );
        })}
      </div>

        <div className="ml-auto flex items-center gap-2">
          <Link
            href="/cobranza/importar"
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
          >
            Importar CSV
          </Link>
          <button
            type="button"
            onClick={() => setShowNuevaEmpresa(true)}
            className="text-[11px] font-medium px-2.5 py-1.5 rounded-md border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
          >
            + Nueva empresa
          </button>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar cliente…"
          className="text-[11px] border border-line rounded-md px-2 py-1.5 bg-surface text-fg placeholder:text-fg-muted focus:outline-none focus:border-brand w-44"
        />
        {vista !== "sin_configurar" && (
          <>
            <select value={fServicio} onChange={(e) => setFServicio(e.target.value)} className={FILTER_SELECT_CLS}>
              <option value="all">Todo servicio</option>
              {COBRANZA_TIPOS_SERVICIO.map((t) => (
                <option key={t} value={t}>{TIPO_SERVICIO_LABEL[t] ?? t}</option>
              ))}
            </select>
            <select value={fTipo} onChange={(e) => setFTipo(e.target.value)} className={FILTER_SELECT_CLS}>
              <option value="all">Nacional e internacional</option>
              {COBRANZA_TIPOS_CUENTA.map((t) => (
                <option key={t} value={t}>{TIPO_CUENTA_LABEL[t] ?? t}</option>
              ))}
            </select>
            <select value={fEstado} onChange={(e) => setFEstado(e.target.value)} className={FILTER_SELECT_CLS}>
              <option value="all">Todo estado</option>
              {COBRANZA_ESTADOS_CUENTA.map((t) => (
                <option key={t} value={t}>{ESTADO_CUENTA_LABEL[t] ?? t}</option>
              ))}
            </select>
            <select value={fSemaforo} onChange={(e) => setFSemaforo(e.target.value)} className={FILTER_SELECT_CLS}>
              <option value="all">Todo semáforo</option>
              {SEMAFOROS_ORDEN.map((s) => (
                <option key={s} value={s}>{SEMAFORO_META[s].label}</option>
              ))}
            </select>
          </>
        )}
        <span className="text-[11px] text-fg-muted">
          {visible.length} cliente{visible.length !== 1 ? "s" : ""}
        </span>
      </div>

      {/* ── Tabla ── */}
      {visible.length === 0 ? (
        <EmptyState variant="dashed" title={vacio.title} description={vacio.description} />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-line bg-surface">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-surface-muted border-b border-line">
                <th className={TH_CLS}>Cliente</th>
                <th className={TH_CLS}>Servicios</th>
                <th className={TH_CLS}>Tipo</th>
                <th className={TH_CLS}>Último cobro</th>
                <th className={TH_CLS}>Próximo cobro</th>
                <th className={`${TH_CLS} text-right`}>Monto próximo</th>
                <th className={`${TH_CLS} text-center`}>Semáforo</th>
                <th className={TH_CLS}>Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {visible.map((r) => {
                const sinCuenta = r.cuentaId === null;
                const sem = SEMAFORO_META[r.semaforo];
                return (
                  <tr
                    key={r.clientId}
                    onClick={sinCuenta ? undefined : () => onOpenCuenta(r.cuentaId!)}
                    className={
                      sinCuenta
                        ? "opacity-60"
                        : "cursor-pointer hover:bg-surface-hover transition-colors"
                    }
                  >
                    <td className="px-4 py-3">
                      <span className="font-medium text-fg">{r.clienteNombre}</span>
                      {!r.tieneProyectoReal && (
                        <span
                          title="Empresa de cobranza sin proyecto en Nexus"
                          className="ml-2 text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted"
                        >
                          sin proyecto
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {r.tiposServicio.length === 0 ? (
                        <span className="text-fg-muted">—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {r.tiposServicio.map((t) => (
                            <span
                              key={t}
                              className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-secondary"
                            >
                              {TIPO_SERVICIO_LABEL[t] ?? t}
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">
                      {r.tipo ? TIPO_CUENTA_LABEL[r.tipo] ?? r.tipo : "—"}
                    </td>
                    <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">{fmtFecha(r.ultimoCobro)}</td>
                    <td className="px-4 py-3 text-fg-secondary whitespace-nowrap">
                      {fmtFecha(r.proximoCobro)}
                      {/* "Próximo" con fecha pasada = vencido: la fecha pelada confunde. */}
                      {r.proximoCobro && r.proximoCobro < todayISO && (
                        <span className="ml-1.5 text-red-600 font-medium">
                          · hace {diffDays(r.proximoCobro, todayISO)} d
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right text-fg whitespace-nowrap tabular-nums">
                      {fmtMonto(r.proximoMonto, r.moneda)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {sinCuenta ? (
                        // El gris del loader es sintético — sin cuenta no hay
                        // semáforo real que mostrar.
                        <span className="text-fg-muted" title="Sin configurar">—</span>
                      ) : (
                        <span
                          title={sem.label}
                          className={`inline-block w-2.5 h-2.5 rounded-full ${sem.dot}`}
                        />
                      )}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {sinCuenta ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            configurarCuenta(r.clientId);
                          }}
                          disabled={configurando !== null}
                          className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors disabled:opacity-50"
                        >
                          {configurando === r.clientId ? "Creando…" : "Configurar cuenta"}
                        </button>
                      ) : (
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border ${
                            ESTADO_CHIP[r.estadoCuenta ?? ""] ?? "text-fg-muted border-line"
                          }`}
                        >
                          {r.estadoCuenta ? ESTADO_CUENTA_LABEL[r.estadoCuenta] ?? r.estadoCuenta : "—"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <NuevaEmpresaModal
        open={showNuevaEmpresa}
        onClose={() => setShowNuevaEmpresa(false)}
        onCreated={(cuentaId) => {
          setShowNuevaEmpresa(false);
          onRefresh();
          onOpenCuenta(cuentaId); // seguir configurando servicios en el drawer
        }}
      />
    </div>
  );
}
