"use client";

/**
 * components/cobranza/ImportWizard.tsx
 *
 * Wizard del importador CSV de cuentas (AccountSource "sheet") — flujo ON-PAGE
 * de 4 pasos (molde components/business-cases/BusinessCaseStepper.tsx):
 *   1. SUBIR   — drag&drop del CSV (POST /api/cobranza/import) o reabrir un batch.
 *   2. MAPEAR  — columna del CSV → campo canónico + preview → PATCH {mapeo}.
 *   3. REVISAR — cola de revisión: badges, errores/warnings, chip de dedup,
 *                edición inline (optimista con revert por-item), omitir/restaurar.
 *   4. APLICAR — resumen → POST aplicar → resumen final.
 * Copy en VOSEO (el módulo Cobranza está en voseo). Tokens semánticos + colores
 * de estado permitidos (emerald/amber/sky/red — patrón AlertasCobranza).
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import {
  IMPORT_CAMPOS_CANONICOS,
  IMPORT_CAMPO_LABEL,
  IMPORT_ESTADO_LABEL,
  IMPORT_FILA_ESTADO_LABEL,
  COBRANZA_TIPOS_CUENTA,
  COBRANZA_VIAS_COBRO,
  COBRANZA_MONEDAS,
  COBRANZA_TERMINOS_PAGO,
  TIPO_CUENTA_LABEL,
  type ImportCampoCanonico,
} from "@/lib/cobranza/schema";
import {
  aplicarMapeo,
  normalizarDominio,
  parseMontoLocal,
  parseFechaLocal,
  parseDiaAncla,
} from "@/lib/cobranza/import-core";
import { INPUT_CLS, SELECT_CLS, LABEL_CLS, FILTER_SELECT_CLS, VIA_COBRO_LABEL, TERMINOS_PAGO_LABEL } from "./format";

// ── Tipos DTO (espejo de las responses de /api/cobranza/import/**) ──────────────

type Mapeo = Partial<Record<ImportCampoCanonico, string | null>>;

interface DedupDTO {
  clientId: string;
  tipo: "fuente_id" | "dominio" | "nombre_exacto";
  clienteNombre: string;
}

interface FilaDTO {
  id: string;
  numFila: number;
  raw: Record<string, unknown>;
  canonico: Record<string, unknown> | null;
  estado: string;
  errores: string[] | null;
  dedup: DedupDTO | null;
  idExterno: string | null;
  aplicadoClientId: string | null;
}

interface BatchDTO {
  id: string;
  archivoNombre: string;
  estado: string;
  mapeo: Mapeo;
  columnas: string[];
  totalFilas: number;
  resumen: Resumen | null;
  filas: FilaDTO[];
}

interface BatchListItem {
  id: string;
  archivoNombre: string;
  estado: string;
  totalFilas: number;
  createdAt: string;
  resumen: Resumen | null;
}

interface Resumen {
  clientsCreados: number;
  cuentasCreadas: number;
  cuentasVinculadas: number;
  serviciosCreados: number;
  omitidas: number;
  fallidas: number;
}

// ── Metas visuales ───────────────────────────────────────────────────────────────

const STEPS = [
  { key: "subir", label: "Subir" },
  { key: "mapear", label: "Mapear" },
  { key: "revisar", label: "Revisar" },
  { key: "aplicar", label: "Aplicar" },
] as const;
type StepKey = (typeof STEPS)[number]["key"];

// Colores de estado permitidos (patrón AlertasCobranza / SEMAFORO_META).
const FILA_BADGE: Record<string, string> = {
  VALIDA: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
  REVISAR: "text-amber-600 bg-amber-500/10 border-amber-500/30",
  OMITIDA: "text-fg-muted bg-surface-muted border-line",
  APLICADA: "text-emerald-600 bg-emerald-500/10 border-emerald-500/30",
};

const BTN_PRIMARY =
  "text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 disabled:opacity-50 disabled:cursor-not-allowed";
const BTN_GHOST =
  "text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover disabled:opacity-50 disabled:cursor-not-allowed";

function fmtCelda(v: unknown): string {
  if (v == null || v === "") return "—";
  return String(v);
}

// ── Wizard ───────────────────────────────────────────────────────────────────────

export default function ImportWizard() {
  const toast = useToast();

  const [step, setStep] = useState<StepKey>("subir");
  const [batch, setBatch] = useState<BatchDTO | null>(null);
  const [filas, setFilas] = useState<FilaDTO[]>([]);
  const [mapeo, setMapeo] = useState<Mapeo>({});
  const [avisoResolver, setAvisoResolver] = useState<string[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [busy, setBusy] = useState(false);
  const [prevBatches, setPrevBatches] = useState<BatchListItem[]>([]);

  const adoptarBatch = useCallback((b: BatchDTO) => {
    setBatch(b);
    setFilas(
      (b.filas ?? []).map((f) => ({
        ...f,
        raw: (f.raw ?? {}) as Record<string, unknown>,
        canonico: (f.canonico ?? null) as Record<string, unknown> | null,
        errores: (f.errores ?? null) as string[] | null,
        dedup: (f.dedup ?? null) as DedupDTO | null,
      })),
    );
    setMapeo(b.mapeo ?? {});
    setResumen(b.resumen ?? null);
  }, []);

  // Batches previos para reabrir (el import a medias no se pierde al salir).
  useEffect(() => {
    fetchJson<{ batches: BatchListItem[] }>("/api/cobranza/import")
      .then((d) => setPrevBatches((d.batches ?? []).filter((b) => b.estado !== "DESCARTADO")))
      .catch(() => {});
  }, []);

  async function reabrir(id: string) {
    if (busy) return;
    setBusy(true);
    try {
      const data = await fetchJson<{ batch: BatchDTO }>(`/api/cobranza/import/${id}`);
      adoptarBatch(data.batch);
      setAvisoResolver([]);
      setStep(
        data.batch.estado === "BORRADOR" ? "mapear" : data.batch.estado === "EN_REVISION" ? "revisar" : "aplicar",
      );
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo reabrir el import.");
    } finally {
      setBusy(false);
    }
  }

  async function subirArchivo(file: File | null | undefined) {
    if (!file || busy) return;
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Subí un archivo .csv (exportá el sheet como CSV).");
      return;
    }
    setBusy(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const data = await fetchJson<{ batch: BatchDTO }>("/api/cobranza/import", { method: "POST", body: fd });
      adoptarBatch(data.batch);
      setAvisoResolver([]);
      setStep("mapear");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo subir el archivo.");
    } finally {
      setBusy(false);
    }
  }

  async function validarFilas() {
    if (!batch || busy) return;
    setBusy(true);
    try {
      const data = await fetchJson<{ batch: BatchDTO; avisoResolver: string[] }>(
        `/api/cobranza/import/${batch.id}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mapeo }),
        },
      );
      adoptarBatch(data.batch);
      setAvisoResolver(data.avisoResolver ?? []);
      setStep("revisar");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron validar las filas.");
    } finally {
      setBusy(false);
    }
  }

  /** PATCH de una fila, optimista con revert POR ITEM (dos saves en vuelo no se pisan). */
  async function patchFila(filaId: string, body: { canonico?: Record<string, unknown>; estado?: string }): Promise<boolean> {
    if (!batch) return false;
    const prev = filas.find((f) => f.id === filaId);
    if (!prev) return false;
    if (body.canonico) {
      setFilas((fs) => fs.map((f) => (f.id === filaId ? { ...f, canonico: body.canonico ?? f.canonico } : f)));
    } else if (body.estado) {
      setFilas((fs) => fs.map((f) => (f.id === filaId ? { ...f, estado: body.estado ?? f.estado } : f)));
    }
    try {
      const data = await fetchJson<{ fila: FilaDTO }>(`/api/cobranza/import/${batch.id}/filas/${filaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      setFilas((fs) => fs.map((f) => (f.id === filaId ? data.fila : f)));
      return true;
    } catch (e) {
      setFilas((fs) => fs.map((f) => (f.id === filaId ? prev : f)));
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la fila.");
      return false;
    }
  }

  async function aplicar() {
    if (!batch || busy) return;
    setBusy(true);
    try {
      const data = await fetchJson<{ resumen: Resumen }>(`/api/cobranza/import/${batch.id}/aplicar`, {
        method: "POST",
      });
      setResumen(data.resumen);
      setBatch((b) => (b ? { ...b, estado: "APLICADO" } : b));
      toast.success("Importación aplicada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo aplicar la importación.");
    } finally {
      setBusy(false);
    }
  }

  async function descartar() {
    if (!batch || busy) return;
    setBusy(true);
    try {
      await fetchJson(`/api/cobranza/import/${batch.id}`, { method: "DELETE" });
      setPrevBatches((bs) => bs.filter((b) => b.id !== batch.id));
      setBatch(null);
      setFilas([]);
      setResumen(null);
      setAvisoResolver([]);
      setStep("subir");
      toast.success("Import descartado.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo descartar el import.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-4xl">
      {/* Indicador de pasos (patrón BusinessCaseStepper) */}
      <div className="flex items-center gap-2 mb-6">
        {STEPS.map((s, i) => {
          const active = step === s.key;
          return (
            <div key={s.key} className="flex items-center gap-2">
              <span className={`flex items-center gap-1.5 text-xs font-medium ${active ? "text-fg" : "text-fg-muted"}`}>
                <span
                  className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold border ${
                    active ? "bg-brand/10 text-brand border-brand" : "border-line text-fg-muted"
                  }`}
                >
                  {i + 1}
                </span>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className="w-6 h-px bg-line" />}
            </div>
          );
        })}
        {batch && (
          <span className="ml-auto text-[11px] text-fg-muted truncate">
            {batch.archivoNombre} · {IMPORT_ESTADO_LABEL[batch.estado] ?? batch.estado}
          </span>
        )}
      </div>

      {step === "subir" && (
        <PasoSubir busy={busy} prevBatches={prevBatches} onFile={subirArchivo} onReabrir={reabrir} />
      )}

      {step === "mapear" && batch && (
        <PasoMapear
          batch={batch}
          filas={filas}
          mapeo={mapeo}
          setMapeo={setMapeo}
          busy={busy}
          onValidar={validarFilas}
          onDescartar={descartar}
          onAtras={() => setStep("subir")}
        />
      )}

      {step === "revisar" && batch && (
        <PasoRevisar
          filas={filas}
          avisoResolver={avisoResolver}
          aplicado={batch.estado === "APLICADO"}
          onPatchFila={patchFila}
          onAtras={() => setStep("mapear")}
          onContinuar={() => setStep("aplicar")}
        />
      )}

      {step === "aplicar" && batch && (
        <PasoAplicar
          filas={filas}
          resumen={resumen}
          aplicado={batch.estado === "APLICADO" || resumen !== null}
          busy={busy}
          onAplicar={aplicar}
          onAtras={() => setStep("revisar")}
        />
      )}
    </div>
  );
}

// ── Paso 1: SUBIR ────────────────────────────────────────────────────────────────

function PasoSubir({
  busy,
  prevBatches,
  onFile,
  onReabrir,
}: {
  busy: boolean;
  prevBatches: BatchListItem[];
  onFile: (file: File | null | undefined) => void;
  onReabrir: (id: string) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  return (
    <div className="space-y-4">
      <label
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setDragOver(false);
          onFile(e.dataTransfer.files?.[0]);
        }}
        className={`flex flex-col items-center justify-center gap-2 px-4 py-10 border-2 border-dashed rounded-xl cursor-pointer transition-colors ${
          dragOver ? "border-brand bg-brand/5" : "border-line bg-surface hover:border-brand/50 hover:bg-surface-hover"
        }`}
      >
        <svg className="w-6 h-6 text-fg-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
          />
        </svg>
        <p className="text-sm text-fg-secondary">
          {busy ? "Subiendo…" : "Arrastrá el CSV acá o hacé clic para elegirlo"}
        </p>
        <p className="text-[11px] text-fg-muted">Solo .csv (exportá el sheet de Finanzas como CSV) · Máx 5 MB</p>
        <input
          type="file"
          accept=".csv"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            onFile(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
      </label>

      {prevBatches.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-4 space-y-2">
          <p className="text-xs font-semibold text-fg">Imports anteriores</p>
          <p className="text-[11px] text-fg-muted">Retomá uno a medias o revisá el resumen de uno aplicado.</p>
          <div className="space-y-1.5">
            {prevBatches.map((b) => (
              <div key={b.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-muted">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-fg truncate">{b.archivoNombre}</p>
                  <p className="text-[10px] text-fg-muted">
                    {b.totalFilas} filas ·{" "}
                    {new Date(b.createdAt).toLocaleDateString("es-CR", { day: "numeric", month: "short" })}
                  </p>
                </div>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${b.estado === "APLICADO" ? FILA_BADGE.APLICADA : "text-fg-muted bg-surface border-line"}`}>
                  {IMPORT_ESTADO_LABEL[b.estado] ?? b.estado}
                </span>
                <button onClick={() => onReabrir(b.id)} disabled={busy} className={BTN_GHOST}>
                  {b.estado === "APLICADO" ? "Ver resumen" : "Reabrir"}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Paso 2: MAPEAR ───────────────────────────────────────────────────────────────

function PasoMapear({
  batch,
  filas,
  mapeo,
  setMapeo,
  busy,
  onValidar,
  onDescartar,
  onAtras,
}: {
  batch: BatchDTO;
  filas: FilaDTO[];
  mapeo: Mapeo;
  setMapeo: (m: Mapeo) => void;
  busy: boolean;
  onValidar: () => void;
  onDescartar: () => void;
  onAtras: () => void;
}) {
  const camposMapeados = IMPORT_CAMPOS_CANONICOS.filter((c) => mapeo[c]);
  const preview = filas.slice(0, 5).map((f) => aplicarMapeo(f.raw, mapeo));

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-5 space-y-4">
        <div>
          <p className="text-sm font-semibold text-fg">¿Qué columna alimenta cada campo?</p>
          <p className="text-xs text-fg-muted mt-0.5">
            Sugerimos el mapeo desde los encabezados del CSV — corregí lo que haga falta. Los campos sin mapear
            quedan vacíos.
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {IMPORT_CAMPOS_CANONICOS.map((campo) => (
            <div key={campo}>
              <label className={LABEL_CLS}>{IMPORT_CAMPO_LABEL[campo]}</label>
              <select
                value={mapeo[campo] ?? ""}
                onChange={(e) => setMapeo({ ...mapeo, [campo]: e.target.value || null })}
                className={SELECT_CLS}
              >
                <option value="">— sin mapear —</option>
                {batch.columnas.map((col) => (
                  <option key={col} value={col}>
                    {col}
                  </option>
                ))}
              </select>
            </div>
          ))}
        </div>
      </div>

      {camposMapeados.length > 0 && (
        <div className="rounded-2xl border border-line bg-surface p-5 space-y-3">
          <p className="text-xs font-semibold text-fg">
            Así se van a leer las primeras {preview.length} filas (ya normalizadas)
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead>
                <tr className="text-left text-fg-muted border-b border-line">
                  <th className="py-1.5 pr-3 font-medium">#</th>
                  {camposMapeados.map((c) => (
                    <th key={c} className="py-1.5 pr-3 font-medium whitespace-nowrap">
                      {IMPORT_CAMPO_LABEL[c].split(" (")[0]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.map((row, i) => (
                  <tr key={i} className="border-b border-line last:border-0 text-fg-secondary">
                    <td className="py-1.5 pr-3 text-fg-muted">{filas[i]?.numFila}</td>
                    {camposMapeados.map((c) => (
                      <td key={c} className="py-1.5 pr-3 whitespace-nowrap max-w-[220px] truncate">
                        {fmtCelda(row[c])}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={onAtras} disabled={busy} className={BTN_GHOST}>
            Atrás
          </button>
          <button onClick={onDescartar} disabled={busy} className="text-xs font-medium px-3 py-1.5 rounded-lg border border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-50">
            Descartar import
          </button>
        </div>
        <button onClick={onValidar} disabled={busy || !mapeo.clienteNombre} className={BTN_PRIMARY}>
          {busy ? "Validando…" : "Validar filas"}
        </button>
      </div>
      {!mapeo.clienteNombre && (
        <p className="text-[11px] text-amber-600">Mapeá al menos el nombre del cliente para validar.</p>
      )}
    </div>
  );
}

// ── Paso 3: REVISAR ──────────────────────────────────────────────────────────────

function PasoRevisar({
  filas,
  avisoResolver,
  aplicado,
  onPatchFila,
  onAtras,
  onContinuar,
}: {
  filas: FilaDTO[];
  avisoResolver: string[];
  aplicado: boolean;
  onPatchFila: (filaId: string, body: { canonico?: Record<string, unknown>; estado?: string }) => Promise<boolean>;
  onAtras: () => void;
  onContinuar: () => void;
}) {
  const [filtro, setFiltro] = useState<string>("all");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const counts = {
    VALIDA: filas.filter((f) => f.estado === "VALIDA").length,
    REVISAR: filas.filter((f) => f.estado === "REVISAR").length,
    OMITIDA: filas.filter((f) => f.estado === "OMITIDA").length,
    APLICADA: filas.filter((f) => f.estado === "APLICADA").length,
  };
  const visibles = filtro === "all" ? filas : filas.filter((f) => f.estado === filtro);

  return (
    <div className="space-y-4">
      {avisoResolver.length > 0 && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700 space-y-1">
          <p className="font-semibold">Ojo con el matcheo de sesiones</p>
          <p>
            Si se crean estos clientes, estas palabras quedarían repetidas entre 2+ empresas y dejarían de servir
            para resolver sesiones por título: <span className="font-medium">{avisoResolver.join(", ")}</span>.
            Revisá que no sean duplicados de un cliente existente antes de aplicar.
          </p>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <select value={filtro} onChange={(e) => setFiltro(e.target.value)} className={FILTER_SELECT_CLS}>
          <option value="all">Todas las filas</option>
          <option value="VALIDA">Válidas ({counts.VALIDA})</option>
          <option value="REVISAR">Por revisar ({counts.REVISAR})</option>
          <option value="OMITIDA">Omitidas ({counts.OMITIDA})</option>
          {counts.APLICADA > 0 && <option value="APLICADA">Aplicadas ({counts.APLICADA})</option>}
        </select>
        <span className="text-[11px] text-fg-muted">
          {counts.VALIDA} válidas · {counts.REVISAR} por revisar · {counts.OMITIDA} omitidas
        </span>
      </div>

      <div className="space-y-2">
        {visibles.length === 0 && (
          <p className="text-xs text-fg-muted border border-line rounded-xl px-4 py-3 bg-surface">
            No hay filas con ese filtro.
          </p>
        )}
        {visibles.map((fila) => (
          <FilaCard
            key={fila.id}
            fila={fila}
            expanded={expandedId === fila.id}
            readonly={aplicado || fila.estado === "APLICADA"}
            onToggle={() => setExpandedId((id) => (id === fila.id ? null : fila.id))}
            onPatch={async (body) => {
              const ok = await onPatchFila(fila.id, body);
              if (ok && body.canonico) setExpandedId(null);
              return ok;
            }}
          />
        ))}
      </div>

      <div className="flex items-center justify-between">
        <button onClick={onAtras} className={BTN_GHOST}>
          Atrás (mapeo)
        </button>
        <button onClick={onContinuar} className={BTN_PRIMARY}>
          Continuar
        </button>
      </div>
    </div>
  );
}

function DedupChip({ dedup }: { dedup: DedupDTO | null }) {
  if (!dedup) return null;
  if (dedup.tipo === "nombre_exacto") {
    return (
      <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-amber-600 bg-amber-500/10 border-amber-500/30">
        posible duplicado: {dedup.clienteNombre}
      </span>
    );
  }
  return (
    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border text-sky-600 bg-sky-500/10 border-sky-500/30">
      actualizará: {dedup.clienteNombre}
    </span>
  );
}

function FilaCard({
  fila,
  expanded,
  readonly,
  onToggle,
  onPatch,
}: {
  fila: FilaDTO;
  expanded: boolean;
  readonly: boolean;
  onToggle: () => void;
  onPatch: (body: { canonico?: Record<string, unknown>; estado?: string }) => Promise<boolean>;
}) {
  const nombre =
    (typeof fila.canonico?.clienteNombre === "string" && fila.canonico.clienteNombre) || `Fila ${fila.numFila}`;
  const errores = fila.errores ?? [];
  const duros = errores.filter((e) => !e.startsWith("⚠"));
  const warnings = errores.filter((e) => e.startsWith("⚠"));
  const omitida = fila.estado === "OMITIDA";

  return (
    <div className={`rounded-xl border border-line bg-surface ${omitida ? "opacity-60" : ""}`}>
      <div className="flex items-center gap-2 px-4 py-2.5">
        <span className="text-[10px] text-fg-muted w-8 flex-shrink-0">#{fila.numFila}</span>
        <span className="text-sm font-medium text-fg truncate">{nombre}</span>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full border flex-shrink-0 ${FILA_BADGE[fila.estado] ?? FILA_BADGE.OMITIDA}`}>
          {IMPORT_FILA_ESTADO_LABEL[fila.estado] ?? fila.estado}
        </span>
        <DedupChip dedup={fila.dedup} />
        <span className="flex-1" />
        {!readonly && !omitida && (
          <button onClick={onToggle} className="text-[11px] text-brand hover:underline flex-shrink-0">
            {expanded ? "Cerrar" : "Editar"}
          </button>
        )}
        {!readonly && (
          <button
            onClick={() => onPatch({ estado: omitida ? "REVISAR" : "OMITIDA" })}
            className="text-[11px] text-fg-muted hover:text-fg flex-shrink-0"
          >
            {omitida ? "Restaurar" : "Omitir"}
          </button>
        )}
      </div>

      {(duros.length > 0 || warnings.length > 0) && !omitida && (
        <div className="px-4 pb-2.5 space-y-0.5">
          {duros.map((e, i) => (
            <p key={`e${i}`} className="text-[11px] text-red-600">
              {e}
            </p>
          ))}
          {warnings.map((w, i) => (
            <p key={`w${i}`} className="text-[11px] text-amber-600">
              {w}
            </p>
          ))}
        </div>
      )}

      {expanded && !omitida && !readonly && (
        <div className="border-t border-line px-4 py-3">
          <FilaForm fila={fila} onSave={(canonico) => onPatch({ canonico })} onCancel={onToggle} />
        </div>
      )}
    </div>
  );
}

// ── Mini-form inline de una fila ─────────────────────────────────────────────────

interface FormFila {
  clienteNombre: string;
  dominio: string;
  correoCobro: string;
  idExterno: string;
  tipo: string;
  viaCobro: string;
  moneda: string;
  terminosPago: string;
  diaCobroAncla: string;
  suscripcionMonto: string;
  suscripcionMoneda: string;
  suscripcionInicio: string;
  notas: string;
}

function formDesdeCanonico(c: Record<string, unknown> | null): FormFila {
  const s = (k: string) => {
    const v = c?.[k];
    return v == null ? "" : String(v);
  };
  return {
    clienteNombre: s("clienteNombre"),
    dominio: s("dominio"),
    correoCobro: s("correoCobro"),
    idExterno: s("idExterno"),
    tipo: s("tipo"),
    viaCobro: s("viaCobro"),
    moneda: s("moneda"),
    terminosPago: s("terminosPago"),
    diaCobroAncla: s("diaCobroAncla"),
    suscripcionMonto: s("suscripcionMonto"),
    suscripcionMoneda: s("suscripcionMoneda"),
    suscripcionInicio: s("suscripcionInicio"),
    notas: s("notas"),
  };
}

function FilaForm({
  fila,
  onSave,
  onCancel,
}: {
  fila: FilaDTO;
  onSave: (canonico: Record<string, unknown>) => Promise<boolean>;
  onCancel: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState<FormFila>(() => formDesdeCanonico(fila.canonico));
  const [saving, setSaving] = useState(false);
  const set = (k: keyof FormFila) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function guardar() {
    if (saving) return;
    // Normalización local (mismos helpers puros del server) con feedback temprano.
    if (form.dominio.trim() && !normalizarDominio(form.dominio)) {
      toast.error("El dominio no parece válido (ej. empresa.com).");
      return;
    }
    if (form.suscripcionMonto.trim() && parseMontoLocal(form.suscripcionMonto) == null) {
      toast.error("No entendí el monto — probá con un número (ej. 1.500.000,00).");
      return;
    }
    if (form.suscripcionInicio.trim() && !parseFechaLocal(form.suscripcionInicio)) {
      toast.error("No entendí la fecha de inicio — usá AAAA-MM-DD o DD/MM/AAAA.");
      return;
    }
    if (form.diaCobroAncla.trim() && parseDiaAncla(form.diaCobroAncla) == null) {
      toast.error("El día de cobro va de 1 a 31.");
      return;
    }
    const canonico: Record<string, unknown> = {
      clienteNombre: form.clienteNombre.trim(),
      dominio: normalizarDominio(form.dominio),
      correoCobro: form.correoCobro.trim().toLowerCase() || null,
      idExterno: form.idExterno.trim() || null,
      tipo: form.tipo || null,
      viaCobro: form.viaCobro || null,
      moneda: form.moneda || null,
      terminosPago: form.terminosPago || null,
      diaCobroAncla: parseDiaAncla(form.diaCobroAncla),
      suscripcionMonto: parseMontoLocal(form.suscripcionMonto),
      suscripcionMoneda: form.suscripcionMoneda || null,
      suscripcionInicio: parseFechaLocal(form.suscripcionInicio),
      notas: form.notas.trim() || null,
    };
    setSaving(true);
    await onSave(canonico);
    setSaving(false);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className={LABEL_CLS}>Nombre del cliente</label>
          <input type="text" value={form.clienteNombre} onChange={set("clienteNombre")} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Dominio</label>
          <input type="text" value={form.dominio} onChange={set("dominio")} placeholder="empresa.com" className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Correo de cobro</label>
          <input type="text" value={form.correoCobro} onChange={set("correoCobro")} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Id externo</label>
          <input type="text" value={form.idExterno} onChange={set("idExterno")} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Tipo</label>
          <select value={form.tipo} onChange={set("tipo")} className={SELECT_CLS}>
            <option value="">— sin dato —</option>
            {COBRANZA_TIPOS_CUENTA.map((t) => (
              <option key={t} value={t}>
                {TIPO_CUENTA_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Vía de cobro</label>
          <select value={form.viaCobro} onChange={set("viaCobro")} className={SELECT_CLS}>
            <option value="">— sin dato —</option>
            {COBRANZA_VIAS_COBRO.map((v) => (
              <option key={v} value={v}>
                {VIA_COBRO_LABEL[v] ?? v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Moneda</label>
          <select value={form.moneda} onChange={set("moneda")} className={SELECT_CLS}>
            <option value="">— sin dato —</option>
            {COBRANZA_MONEDAS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Términos de pago</label>
          <select value={form.terminosPago} onChange={set("terminosPago")} className={SELECT_CLS}>
            <option value="">— sin dato —</option>
            {COBRANZA_TERMINOS_PAGO.map((t) => (
              <option key={t} value={t}>
                {TERMINOS_PAGO_LABEL[t] ?? t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Día de cobro (1–31)</label>
          <input type="text" value={form.diaCobroAncla} onChange={set("diaCobroAncla")} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Monto mensual (suscripción)</label>
          <input type="text" value={form.suscripcionMonto} onChange={set("suscripcionMonto")} className={INPUT_CLS} />
        </div>
        <div>
          <label className={LABEL_CLS}>Moneda de la suscripción</label>
          <select value={form.suscripcionMoneda} onChange={set("suscripcionMoneda")} className={SELECT_CLS}>
            <option value="">— igual a la cuenta —</option>
            {COBRANZA_MONEDAS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL_CLS}>Inicio de la suscripción</label>
          <input type="text" value={form.suscripcionInicio} onChange={set("suscripcionInicio")} placeholder="AAAA-MM-DD" className={INPUT_CLS} />
        </div>
        <div className="sm:col-span-2 lg:col-span-3">
          <label className={LABEL_CLS}>Notas</label>
          <input type="text" value={form.notas} onChange={set("notas")} className={INPUT_CLS} />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <button onClick={onCancel} disabled={saving} className={BTN_GHOST}>
          Cancelar
        </button>
        <button onClick={guardar} disabled={saving} className={BTN_PRIMARY}>
          {saving ? "Guardando…" : "Guardar y revalidar"}
        </button>
      </div>
    </div>
  );
}

// ── Paso 4: APLICAR ──────────────────────────────────────────────────────────────

function PasoAplicar({
  filas,
  resumen,
  aplicado,
  busy,
  onAplicar,
  onAtras,
}: {
  filas: FilaDTO[];
  resumen: Resumen | null;
  aplicado: boolean;
  busy: boolean;
  onAplicar: () => void;
  onAtras: () => void;
}) {
  if (aplicado && resumen) {
    return (
      <div className="rounded-2xl border border-line bg-surface p-6 space-y-4">
        <p className="text-sm font-semibold text-emerald-600">Importación aplicada ✓</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Empresas creadas" value={resumen.clientsCreados} />
          <Stat label="Cuentas creadas" value={resumen.cuentasCreadas} />
          <Stat label="Cuentas vinculadas" value={resumen.cuentasVinculadas} />
          <Stat label="Suscripciones pre-armadas" value={resumen.serviciosCreados} />
          <Stat label="Filas omitidas" value={resumen.omitidas} />
          <Stat label="Filas fallidas" value={resumen.fallidas} tone={resumen.fallidas > 0 ? "bad" : undefined} />
        </div>
        {resumen.fallidas > 0 && (
          <p className="text-[11px] text-amber-600">
            Las filas fallidas quedaron marcadas con su error — revisalas en el paso anterior.
          </p>
        )}
        <Link href="/cobranza" className={`${BTN_PRIMARY} inline-block`}>
          Volver al panel de Cobranza
        </Link>
      </div>
    );
  }

  const nRevisar = filas.filter((f) => f.estado === "REVISAR").length;
  const validas = filas.filter((f) => f.estado === "VALIDA");
  const nVincula = validas.filter((f) => f.dedup).length;
  const nCrea = validas.length - nVincula;
  const nOmitidas = filas.filter((f) => f.estado === "OMITIDA").length;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-line bg-surface p-6 space-y-4">
        <p className="text-sm font-semibold text-fg">¿Listo para aplicar?</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Stat label="Empresas nuevas a crear" value={nCrea} />
          <Stat label="Cuentas a vincular/actualizar" value={nVincula} />
          <Stat label="Filas omitidas" value={nOmitidas} />
        </div>
        {nRevisar > 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-xs text-amber-700">
            Quedan <span className="font-semibold">{nRevisar}</span> filas por revisar — corregilas u omitilas antes
            de aplicar.
          </div>
        ) : (
          <p className="text-xs text-fg-muted">
            Se crean las empresas y cuentas nuevas, se completan las existentes (sin pisar lo curado a mano) y se
            pre-arman las suscripciones con su cronograma de cobros.
          </p>
        )}
      </div>
      <div className="flex items-center justify-between">
        <button onClick={onAtras} disabled={busy} className={BTN_GHOST}>
          Atrás (revisión)
        </button>
        <button onClick={onAplicar} disabled={busy || nRevisar > 0 || validas.length === 0} className={BTN_PRIMARY}>
          {busy ? "Aplicando…" : `Aplicar ${validas.length} filas`}
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "bad" }) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
      <p className={`text-lg font-semibold ${tone === "bad" ? "text-red-600" : "text-fg"}`}>{value}</p>
      <p className="text-[10px] text-fg-muted">{label}</p>
    </div>
  );
}
