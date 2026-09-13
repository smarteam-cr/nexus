"use client";

/**
 * components/cobranza/LibroAlexPanel.tsx — el libro de Alex contra Nexus (etapas 11 y 13).
 *
 * Tres pestañas sobre el lote que se subió:
 *   · «Fila por fila»: una propuesta por documento del libro (lib/cobranza/libro-alex.ts): coincide, no
 *     coincide, falta en Nexus, sin cuenta, no es cartera… y qué haría una persona.
 *   · «Números»: el número de factura propuesto para cada cuota (NumerosFacturaOdoo.tsx).
 *   · «Aplicar»: las facturas que Nexus no tiene, para cargarlas por cobrar (AplicarLibroAlex.tsx).
 *
 * ⛔ «Fila por fila» solo lee. Guardan «Es esta», en «Números», que anota el número por el PATCH del cobro con
 * la firma de quien lo toca, y «Cargar por cobrar», en «Aplicar». Ninguna de las dos pasa un cobro a Cobrado:
 * pasar a Cobrado o sacar de Cobrado sigue siendo del cronograma de la cuenta, con una persona.
 *
 * Se compara de nuevo al abrir y con «Volver a comparar»: si Alex corrigió algo en otra pestaña, la fila
 * cambia sin volver a subir el Excel.
 */
import { useEffect, useMemo, useState } from "react";
import { Alert, Tabs } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { AccionDelLibro, PropuestaDelLibro, Veredicto, ViaDeCuenta } from "@/lib/cobranza/libro-alex";
import type { RespuestaDelLibro } from "@/lib/cobranza/libro-alex-server";
import NumerosFacturaOdoo from "./NumerosFacturaOdoo";
import AplicarLibroAlex from "./AplicarLibroAlex";
import { etiquetaMes, fmtFecha, fmtMonto, INPUT_CLS } from "./format";

type Pestana = "filas" | "numeros" | "aplicar";
type Filtro = Veredicto | "TODOS";

/** Primero lo que hay que trabajar; lo que coincide, al final. */
const ORDEN: readonly Veredicto[] = ["NO_COINCIDE", "REVISAR", "FALTA_EN_NEXUS", "SIN_CUENTA", "SIN_FACTURA", "NO_ES_CARTERA", "COINCIDE"];

const VEREDICTO_META: Record<Veredicto, { label: string; chip: string }> = {
  NO_COINCIDE: { label: "No coincide", chip: "border-danger-line bg-danger-surface text-danger-ink" },
  REVISAR: { label: "Revisar", chip: "border-warn-line bg-warn-surface text-warn-ink" },
  FALTA_EN_NEXUS: { label: "Falta en Nexus", chip: "border-warn-line bg-warn-surface text-warn-ink" },
  SIN_CUENTA: { label: "Sin cuenta", chip: "border-info-line bg-info-surface text-info-ink" },
  SIN_FACTURA: { label: "Firmado sin factura", chip: "border-info-line bg-info-surface text-info-ink" },
  NO_ES_CARTERA: { label: "No es cartera", chip: "border-line bg-surface-muted text-fg-muted" },
  COINCIDE: { label: "Coincide", chip: "border-success-line bg-success-surface text-success-ink" },
};

const ACCION_LABEL: Record<AccionDelLibro, string | null> = {
  NINGUNA: null,
  SACAR_DE_COBRADO: "Sacar de Cobrado",
  REVISAR_COBRADO: "Revisar el Cobrado",
  REVISAR_PAGO: "Revisar el pago",
  MARCAR_FACTURADO: "Marcar facturado",
  AGREGAR_NUMERO: "Agregar el número",
  CARGAR_COBRO: "Cargar el cobro",
  CARGAR_CUENTA: "Cargar la cuenta",
  EMPAREJAR: "Emparejar",
  CARGAR_PLAN: "Cargar el plan",
  CONFIRMAR_IVA: "Confirmar el IVA",
  INGRESO_NO_VENTA: "Ingresos variables",
  COMISION_DE_ALIADO: "Comisión de aliado",
  ESPERA_DECISION: "Espera una decisión",
};

const VIA_LABEL: Record<ViaDeCuenta, string> = {
  NUMERO: "por el número anotado",
  ODOO: "por el cliente de Odoo",
  CEDULA: "por la cédula",
  NOMBRE: "por el nombre",
  ALIAS: "por el nombre entre paréntesis",
  PARCIAL: "por parte del nombre",
  SIGLAS: "solo por las siglas",
};

const ESTADO_COBRO: Record<string, string> = { PROGRAMADO: "Programado", POR_COBRAR: "Por cobrar", COBRADO: "Cobrado", SIN_DATO: "Sin dato" };
const ESTADO_LIBRO: Record<string, string> = { PAGADO: "pagada", SIN_PAGAR: "sin pagar", ACTIVA: "activa (fecha futura)" };
const SECCION_LABEL: Record<string, string> = {
  ODOO: "Odoo",
  MERCURY: "Mercury",
  QUICKBOOKS: "QuickBooks",
  NO_INSCRITOS: "No inscritos",
  PLAN_DE_PAGO: "Plan de pagos",
  COMPENDIO: "Compendio",
};

const BTN_GHOST =
  "text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";

export default function LibroAlexPanel({ importId, onCerrar }: { importId: string; onCerrar: () => void }) {
  const toast = useToast();
  const [datos, setDatos] = useState<RespuestaDelLibro | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(true);
  const [version, setVersion] = useState(0);
  const [pestana, setPestana] = useState<Pestana>("filas");
  const [filtro, setFiltro] = useState<Filtro>("TODOS");
  const [busqueda, setBusqueda] = useState("");
  const [descartando, setDescartando] = useState(false);

  useEffect(() => {
    let vigente = true;
    (async () => {
      try {
        const d = await fetchJson<RespuestaDelLibro>(`/api/cobranza/import/${importId}/libro`);
        if (vigente) {
          setDatos(d);
          setError(null);
        }
      } catch (e) {
        if (vigente) setError(e instanceof ApiError ? e.message : "No se pudo comparar el libro.");
      } finally {
        if (vigente) setCargando(false);
      }
    })();
    return () => {
      vigente = false;
    };
  }, [importId, version]);

  const filas = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    return (datos?.comparacion.filas ?? [])
      .filter((p) => filtro === "TODOS" || p.veredicto === filtro)
      .filter((p) => !q || `${p.numero ?? ""} ${p.cliente} ${p.cuenta?.nombre ?? ""}`.toLowerCase().includes(q))
      .sort((a, b) => ORDEN.indexOf(a.veredicto) - ORDEN.indexOf(b.veredicto));
  }, [datos, filtro, busqueda]);

  function volverAComparar() {
    setCargando(true);
    setVersion((v) => v + 1);
  }

  async function descartar() {
    if (descartando) return;
    setDescartando(true);
    try {
      await fetchJson(`/api/cobranza/import/${importId}`, { method: "DELETE" });
      toast.success("Lote del libro descartado.");
      onCerrar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo descartar el lote.");
      setDescartando(false);
    }
  }

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex flex-wrap items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">El libro de Alex contra Nexus</p>
          {datos && (
            <p className="text-[11px] text-fg-muted">
              {datos.lote.archivoNombre} · lo subió {datos.lote.creadoPor} el {fmtFecha(datos.lote.createdAt.slice(0, 10))} ·{" "}
              {datos.lote.totalFilas} filas leídas
            </p>
          )}
        </div>
        <button type="button" onClick={onCerrar} className={BTN_GHOST}>
          Volver
        </button>
        <button type="button" onClick={volverAComparar} disabled={cargando} className={BTN_GHOST}>
          {cargando ? "Comparando…" : "Volver a comparar"}
        </button>
        <button type="button" onClick={() => void descartar()} disabled={descartando} className={BTN_GHOST}>
          Descartar el lote
        </button>
      </div>

      <Alert variant="info">
        <p className="text-xs">
          La comparación no escribe nada. Si Nexus y el libro no coinciden, manda el libro, pero cada corrección la hace una
          persona: los números en «Números», las facturas que faltan en «Aplicar» (entran por cobrar) y lo demás desde el
          cronograma de la cuenta. Nexus nunca pasa un cobro a Cobrado por lo que diga el Excel.
        </p>
      </Alert>

      {error && (
        <Alert variant="warning">
          <p className="text-xs">{error}</p>
        </Alert>
      )}
      {datos?.faltaSqlNumeros && (
        <Alert variant="warning">
          <p className="text-xs">
            La base todavía no tiene los números de factura de los cobros (falta el SQL de la etapa 7). La comparación anda igual,
            pero en «Números» no se puede guardar nada hasta que se corra.
          </p>
        </Alert>
      )}
      {datos && datos.lote.filasIlegibles > 0 && (
        <Alert variant="warning">
          <p className="text-xs">
            {datos.lote.filasIlegibles} filas del lote no se pudieron leer y quedaron afuera de la comparación. Volvé a subir el
            libro.
          </p>
        </Alert>
      )}

      {datos && (
        <div className="flex flex-wrap gap-1.5">
          {datos.lote.hojas.map((h) => (
            <span key={h.nombre} className="text-[10px] px-2 py-0.5 rounded-full border border-line bg-surface-muted text-fg-muted">
              {h.nombre} · {h.filas ? `${h.filas} filas` : "no aporta filas"}
            </span>
          ))}
          <span className="text-[10px] px-2 py-0.5 rounded-full border border-line bg-surface-muted text-fg-muted">
            {datos.espejoAl ? `Espejo de Odoo al ${fmtFecha(datos.espejoAl)}` : "El espejo de Odoo no tiene una lectura buena"}
          </span>
        </div>
      )}

      <Tabs<Pestana>
        aria-label="Secciones del libro"
        variant="underline"
        value={pestana}
        onChange={setPestana}
        items={[
          { key: "filas", label: "Fila por fila", count: datos?.comparacion.filas.length, title: "Cada documento del libro contra lo que tiene Nexus" },
          { key: "numeros", label: "Números", title: "El número de factura de cada cuota, sacado del libro" },
          { key: "aplicar", label: "Aplicar", title: "Cargar por cobrar las facturas del libro que Nexus no tiene" },
        ]}
      />

      {pestana === "filas" && datos && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <FiltroBoton activo={filtro === "TODOS"} onClick={() => setFiltro("TODOS")}>
              Todas <span className="tabular-nums">{datos.comparacion.filas.length}</span>
            </FiltroBoton>
            {ORDEN.filter((v) => datos.comparacion.conteo[v] > 0).map((v) => (
              <FiltroBoton key={v} activo={filtro === v} onClick={() => setFiltro(v)}>
                {VEREDICTO_META[v].label} <span className="tabular-nums">{datos.comparacion.conteo[v]}</span>
              </FiltroBoton>
            ))}
            <input
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar por cliente, cuenta o número"
              className={`${INPUT_CLS} ml-auto max-w-xs`}
            />
          </div>
          {filas.length === 0 ? (
            <p className="text-xs text-fg-muted">No hay filas con ese filtro.</p>
          ) : (
            <ul className="space-y-2">
              {filas.map((p) => (
                <FilaPropuesta key={p.clave} p={p} />
              ))}
            </ul>
          )}
        </div>
      )}

      {pestana === "numeros" && <NumerosFacturaOdoo importId={importId} />}
      {pestana === "aplicar" && <AplicarLibroAlex importId={importId} />}
    </div>
  );
}

function FiltroBoton({ activo, onClick, children }: { activo: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={`text-[11px] font-medium px-2 py-1 rounded-md border transition-colors ${
        activo ? "border-brand/30 text-brand bg-brand/10" : "border-line text-fg-secondary hover:bg-surface-hover"
      }`}
    >
      {children}
    </button>
  );
}

function FilaPropuesta({ p }: { p: PropuestaDelLibro }) {
  const meta = VEREDICTO_META[p.veredicto];
  const accion = ACCION_LABEL[p.accion];
  const monedaNexus = p.cobros[0]?.moneda ?? p.moneda;
  const sumaNexus = p.cobros.reduce((s, c) => s + c.monto, 0);
  const estados = [...new Set(p.cobros.map((c) => ESTADO_COBRO[c.estado] ?? c.estado))].join(", ");

  return (
    <li className="rounded-xl border border-line bg-surface p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${meta.chip}`}>{meta.label}</span>
        {accion && (
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-brand/30 bg-brand/10 text-brand">{accion}</span>
        )}
        <span className="text-xs font-semibold text-fg">{p.numero ?? SECCION_LABEL[p.seccion] ?? p.seccion}</span>
        <span className="min-w-0 truncate text-xs text-fg-secondary">
          {p.cliente}
          {p.proyecto ? ` · ${p.proyecto}` : ""}
        </span>
      </div>

      <div className="grid gap-3 text-[11px] sm:grid-cols-2">
        <div className="space-y-0.5">
          <p className="font-medium text-fg-muted">En el libro</p>
          <p className="text-fg">
            {fmtMonto(p.total, p.moneda)}
            {p.neto !== null && ` · ${fmtMonto(p.neto, p.moneda)} sin IVA${p.netoFuente === "IVA_13" ? " (total ÷ 1,13)" : ""}`}
            {p.estadoLibro && ` · ${ESTADO_LIBRO[p.estadoLibro] ?? p.estadoLibro}`}
            {p.periodo && ` · ${etiquetaMes(p.periodo)}`}
          </p>
          <p className="text-fg-muted">{p.fuentes.map((f) => `«${f.hoja}» fila ${f.fila}`).join(" · ")}</p>
          {p.anotacion && <p className="text-fg-secondary">«{p.anotacion}»</p>}
        </div>
        <div className="space-y-0.5">
          <p className="font-medium text-fg-muted">En Nexus</p>
          {p.cuenta ? (
            <p className="text-fg">
              {p.cuenta.nombre} <span className="text-fg-muted">({VIA_LABEL[p.cuenta.via]})</span>
            </p>
          ) : (
            <p className="text-fg-muted">
              {p.cuentasPosibles.length ? `Puede ser: ${p.cuentasPosibles.map((c) => c.nombre).join(", ")}` : "Sin cuenta"}
            </p>
          )}
          {p.cobros.length > 0 && (
            <p className="text-fg">
              {p.cobros.length === 1 ? "1 cuota" : `${p.cobros.length} cuotas`} · {fmtMonto(sumaNexus, monedaNexus)} · {estados}
            </p>
          )}
          {p.desglose && (
            <p className="text-fg-muted">
              Cuota de {fmtMonto(p.desglose.reduce((a, b) => a + b, 0), monedaNexus)} = {p.desglose.map((d) => fmtMonto(d, monedaNexus)).join(" + ")}
            </p>
          )}
        </div>
      </div>

      {p.propuesta && <p className="text-xs text-fg">{p.propuesta}</p>}
      {p.diferencias.length > 0 && (
        <ul className="list-disc space-y-0.5 pl-4 text-[11px] text-danger-ink">
          {p.diferencias.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      )}
      {p.avisos.length > 0 && (
        <ul className="space-y-0.5 text-[11px] text-warn-ink">
          {p.avisos.map((a) => (
            <li key={a}>⚠ {a}</li>
          ))}
        </ul>
      )}
    </li>
  );
}
