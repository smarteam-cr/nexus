"use client";

/**
 * components/finanzas/IngresosVariablesPanel.tsx
 *
 * La plata que entró FUERA del ciclo quincenal. Tiene DOS orígenes y por eso
 * hay tres tipos de fila:
 *  · REGISTRADO — se dio de alta acá (tabla `IngresoVariable`): puede estar
 *    relacionado con un cliente o ser GENERAL. Es lo único editable.
 *  · MANUAL / RESCATE — DERIVADOS de cobros que ya existen (pago fuera de plan,
 *    o cuenta rescatada que entró con mucho atraso). Se editan en Cobranza.
 *
 * No hay doble conteo por construcción: un `IngresoVariable` nunca es un `Cobro`.
 * La regla para la persona está dicha en el banner y en el alta.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { EmptyState, PageHeader, Table, type TableColumn } from "@/components/ui";
import type { IngresoVariableRow } from "@/lib/cobranza";
import { fmtMonto, fmtFecha } from "@/components/cobranza/format";
import IngresoVariableForm from "./IngresoVariableForm";

type Filtro = "todos" | "REGISTRADO" | "MANUAL" | "RESCATE";

const FILTROS: Array<[Filtro, string]> = [
  ["todos", "Todos"],
  ["REGISTRADO", "Registrados"],
  ["MANUAL", "Pagos puntuales"],
  ["RESCATE", "Rescatados"],
];

/** Cómo se nombra cada tipo cuando la lista filtrada queda vacía. */
const FILTRO_VACIO: Record<Exclude<Filtro, "todos">, string> = {
  REGISTRADO: "ingresos registrados",
  MANUAL: "pagos puntuales",
  RESCATE: "rescatados",
};

const TIPO_CHIP: Record<IngresoVariableRow["tipo"], { label: string; cls: string }> = {
  REGISTRADO: {
    label: "Registrado",
    cls: "border-brand/30 bg-brand/10 text-brand",
  },
  MANUAL: { label: "Pago puntual", cls: "border-line text-fg-muted" },
  RESCATE: {
    label: "Rescatado",
    cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-600",
  },
};

/** Totales por moneda — CRC y USD JAMÁS se suman (regla dura del módulo). */
function totalesPorMoneda(filas: IngresoVariableRow[]): Record<string, number> {
  const acc: Record<string, number> = {};
  for (const f of filas) acc[f.moneda] = Math.round(((acc[f.moneda] ?? 0) + f.monto) * 100) / 100;
  return acc;
}

export default function IngresosVariablesPanel({
  filas,
  clientes,
  todayISO,
  umbralRescateDias,
}: {
  filas: IngresoVariableRow[];
  /** Para relacionar el ingreso con un cliente — opcional en el alta. */
  clientes: Array<{ id: string; name: string }>;
  todayISO: string;
  umbralRescateDias: number;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<Filtro>("todos");
  /** null cerrado · "nuevo" alta · fila = edición (solo REGISTRADO). */
  const [editando, setEditando] = useState<IngresoVariableRow | "nuevo" | null>(null);

  const visibles = useMemo(
    () => (filtro === "todos" ? filas : filas.filter((f) => f.tipo === filtro)),
    [filas, filtro],
  );
  const totales = useMemo(() => totalesPorMoneda(visibles), [visibles]);
  const conteos = useMemo(
    () => ({
      todos: filas.length,
      REGISTRADO: filas.filter((f) => f.tipo === "REGISTRADO").length,
      MANUAL: filas.filter((f) => f.tipo === "MANUAL").length,
      RESCATE: filas.filter((f) => f.tipo === "RESCATE").length,
    }),
    [filas],
  );

  const columns: TableColumn<IngresoVariableRow>[] = [
    {
      key: "cliente",
      header: "Cliente",
      sortValue: (r) => r.clienteNombre,
      width: "w-48",
      render: (r) =>
        r.clientId && r.clienteNombre ? (
          <Link
            href={`/clients/${r.clientId}`}
            className="text-fg hover:text-brand transition-colors truncate block"
            onClick={(e) => e.stopPropagation()}
          >
            {r.clienteNombre}
          </Link>
        ) : (
          <span className="text-fg-muted italic">General</span>
        ),
    },
    {
      key: "concepto",
      header: "Concepto",
      sortValue: (r) => r.concepto,
      width: "w-44",
      hideOnMobile: true,
      render: (r) => <span className="text-fg-secondary truncate block">{r.concepto}</span>,
    },
    {
      key: "tipo",
      header: "Tipo",
      sortValue: (r) => r.tipo,
      width: "w-32",
      render: (r) => (
        <span
          className={`text-[10px] font-medium px-1.5 py-0.5 rounded border whitespace-nowrap ${TIPO_CHIP[r.tipo].cls}`}
        >
          {TIPO_CHIP[r.tipo].label}
        </span>
      ),
    },
    {
      key: "fechaCobro",
      header: "Entró",
      sortValue: (r) => new Date(r.fechaCobro),
      width: "w-28",
      render: (r) => (
        <span className="whitespace-nowrap text-fg-secondary">{fmtFecha(r.fechaCobro)}</span>
      ),
    },
    {
      key: "atraso",
      header: "Atraso",
      sortValue: (r) => r.diasAtraso,
      width: "w-24",
      align: "right",
      hideOnMobile: true,
      render: (r) => (
        <span
          className="tabular-nums whitespace-nowrap text-fg-muted"
          title={r.fechaProgramada ? `Programado para ${fmtFecha(r.fechaProgramada)}` : undefined}
        >
          {r.diasAtraso != null && r.diasAtraso > 0 ? `+${r.diasAtraso} d` : "—"}
        </span>
      ),
    },
    {
      key: "monto",
      header: "Monto",
      sortValue: (r) => r.monto,
      width: "w-32",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-medium text-fg whitespace-nowrap">
          {fmtMonto(r.monto, r.moneda)}
        </span>
      ),
    },
    {
      // La accion vive POR FILA y no en `onRowClick`: la Table deriva
      // `clickable` de la sola presencia del handler y le pondria cursor,
      // role="button" y tabIndex a TODAS las filas -incluidas las derivadas de
      // un Cobro, que aca no se editan. Una fila que se anuncia como boton y no
      // hace nada es peor que una fila quieta, y con la tabla nueva vacia serian
      // todas.
      key: "acciones",
      header: "",
      width: "w-20",
      align: "right",
      render: (r) =>
        r.tipo === "REGISTRADO" ? (
          <button
            type="button"
            onClick={() => setEditando(r)}
            className="text-xs text-fg-muted hover:text-brand transition-colors"
          >
            Editar
          </button>
        ) : (
          <span className="text-xs text-fg-muted" title="Se edita en Cobranza">
            —
          </span>
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="Ingresos variables"
        description="Cuentas rescatadas y pagos puntuales — lo que entró fuera del flujo constante de cobranza. Las comisiones de aliados van en Comisiones de partner."
        action={
          <button
            type="button"
            onClick={() => setEditando("nuevo")}
            className="text-sm font-medium px-4 py-2 rounded-lg bg-primary text-primary-fg hover:bg-primary-hover transition-colors"
          >
            Registrar ingreso
          </button>
        }
      />

      <div className="space-y-4">
        {/* Qué es esto y de dónde sale — honestidad de datos, igual que el resto del módulo. */}
        <div className="rounded-lg border border-line bg-surface-muted px-3 py-2 text-xs text-fg-muted">
          Dinero que entró fuera del ciclo quincenal. Los{" "}
          <strong className="text-fg-secondary">registrados</strong> se dan de alta acá (con cliente
          o generales, sin servicio contratado detrás). Los{" "}
          <strong className="text-fg-secondary">pagos puntuales</strong> y los{" "}
          <strong className="text-fg-secondary">rescatados</strong> (entraron con más de{" "}
          {umbralRescateDias} días de atraso) aparecen solos desde{" "}
          <Link href="/cobranza" className="text-brand hover:underline">
            Cobranza
          </Link>
          .
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {FILTROS.map(([k, lbl]) => (
            <button
              key={k}
              type="button"
              onClick={() => setFiltro(k)}
              aria-pressed={filtro === k}
              className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
                filtro === k
                  ? "border-brand/30 bg-brand/10 text-brand"
                  : "border-transparent text-fg-muted hover:text-fg-secondary"
              }`}
            >
              {lbl} <span className="tabular-nums opacity-70">{conteos[k]}</span>
            </button>
          ))}
          {Object.keys(totales).length > 0 && (
            <span className="ml-auto text-xs text-fg-muted">
              Total{" "}
              <span className="tabular-nums font-medium text-fg-secondary">
                {Object.entries(totales)
                  .map(([m, v]) => fmtMonto(v, m))
                  .join(" · ")}
              </span>
            </span>
          )}
        </div>

        <Table
          columns={columns}
          rows={visibles}
          rowKey={(r) => r.id}
          search={{
            placeholder: "Busca por cliente o concepto…",
            getText: (r) => `${r.clienteNombre ?? "general"} ${r.concepto}`,
          }}
          initialSort={{ key: "fechaCobro", dir: "desc" }}
          // El vacío habla del conjunto que se está mirando, no del total: con
          // un filtro activo, «todavía no entró plata» seria falso -y la Table
          // corta antes del toolbar, así que además se perdía el buscador.
          empty={
            filtro === "todos" ? (
              <EmptyState
                variant="dashed"
                title="Sin ingresos variables"
                description="Todavía no entró plata fuera del ciclo quincenal. Registra el primero con «Registrar ingreso», o espera a que se cobre una cuenta muy atrasada."
              />
            ) : (
              <EmptyState
                variant="dashed"
                title={`Sin ${FILTRO_VACIO[filtro]}`}
                description="No hay ingresos de este tipo. Mirá «Todos» para ver el resto."
              />
            )
          }
        />
      </div>

      {editando && (
        <IngresoVariableForm
          ingreso={editando === "nuevo" ? null : editando}
          clientes={clientes}
          todayISO={todayISO}
          onClose={() => setEditando(null)}
          onSaved={() => {
            setEditando(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
