"use client";

/**
 * components/cobranza/CostosPanel.tsx — costos de REFERENCIA de dirección
 * (fase 4/4.5, solo SUPER_ADMIN). Tres vistas por pills: Costos fijos (burn +
 * lista agrupada + histórico de bajas), Gastos (puntuales) y Movimientos
 * (histórico de altas/bajas/cambios). Cifras estimadas — NO es contabilidad ni
 * tracking de pagos (un costo no vence, no hay semáforo). CRC y USD SIEMPRE
 * separados (jamás se suman). Sin update optimista: tras POST/PATCH/DELETE ok se
 * llama al callback y el contenedor re-fetchea costos/gastos + caja neta.
 * Regla del burn: solo `activo && finalizadoEl == null` quema (misma regla que
 * el engine — si divergen, los números mienten).
 */
import { useMemo, useState } from "react";
import { EmptyState } from "@/components/ui";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useToast } from "@/components/ui/Toast";
import { useMe } from "@/hooks/useMe";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { CostoRecurrenteDTO, GastoPuntualDTO } from "@/lib/cobranza";
import {
  COSTOS_CATEGORIAS,
  CATEGORIA_COSTO_LABEL,
  FRECUENCIA_COSTO_LABEL,
} from "@/lib/cobranza/schema";
import { fmtMontoVisible, fmtFecha, mensualizado, INPUT_CLS } from "./format";
import CostoForm from "./CostoForm";
import GastosSection from "./GastosSection";
import MovimientosSection from "./MovimientosSection";

const round2 = (n: number) => Math.round(n * 100) / 100;

type Vista = "fijos" | "gastos" | "movimientos";
const VISTAS: Array<[Vista, string]> = [
  ["fijos", "Costos fijos"],
  ["gastos", "Gastos"],
  ["movimientos", "Movimientos"],
];

type Accion = "pausar" | "finalizar" | "borrar" | "reactivar";
type Busy = { id: string; accion: Accion } | null;

/** Suma mensualizada por moneda de una lista de costos (solo activos-no-finalizados). */
function burnDe(costos: CostoRecurrenteDTO[]): { CRC: number; USD: number } {
  const tot = { CRC: 0, USD: 0 };
  for (const c of costos) {
    if (!c.activo || c.finalizadoEl != null) continue;
    const m = mensualizado(c.monto, c.frecuencia);
    if (c.moneda === "USD") tot.USD += m;
    else tot.CRC += m;
  }
  return { CRC: round2(tot.CRC), USD: round2(tot.USD) };
}

export default function CostosPanel({
  costos,
  gastos,
  todayISO,
  onCostosChanged,
  onGastosChanged,
}: {
  costos: CostoRecurrenteDTO[];
  gastos: GastoPuntualDTO[];
  todayISO: string;
  onCostosChanged: () => void;
  onGastosChanged: () => void;
}) {
  const toast = useToast();
  const me = useMe();
  // Revelar los montos es SOLO de SUPER_ADMIN — explícito acá además del gate de página
  // (COSTOS_ROLES ya deja esta pantalla en SUPER_ADMIN, esto es defensa en profundidad y
  // hace la regla verificable en el propio componente). `me === null` = aún cargando → no
  // se revela hasta confirmar el rol.
  const puedeRevelar = me?.isSuperAdmin === true;
  const [vista, setVista] = useState<Vista>("fijos");

  const [form, setForm] = useState<{ abierto: boolean; costo: CostoRecurrenteDTO | null }>({
    abierto: false,
    costo: null,
  });
  const [busqueda, setBusqueda] = useState("");
  const [busy, setBusy] = useState<Busy>(null);

  // Confirms inline (mutuamente excluyentes por fila).
  const [confirmBorrarId, setConfirmBorrarId] = useState<string | null>(null);
  const [finalizarId, setFinalizarId] = useState<string | null>(null);
  const [finalizarFecha, setFinalizarFecha] = useState(todayISO);
  const [finalizarMotivo, setFinalizarMotivo] = useState("");

  const [historicoAbierto, setHistoricoAbierto] = useState(false);
  // Los montos de esta sección son salarios y precios de herramientas: arrancan OCULTOS
  // para que abrir la pantalla (o compartir la ventana) no los muestre de una. NO se
  // persiste a propósito — si recordáramos "visible", el próximo ingreso los volvería a
  // mostrar solos y el toggle no serviría para nada. Es máscara visual, no seguridad:
  // la barrera real es COSTOS_ROLES (ver el comentario de `fmtMontoVisible`).
  const [mostrarDatos, setMostrarDatos] = useState(false);
  // Revelar pide una 2ª confirmación (evita el reveal accidental frente a alguien);
  // OCULTAR es siempre directo (es el lado seguro, nunca se pregunta).
  const [confirmMostrar, setConfirmMostrar] = useState(false);

  function onToggleMostrar() {
    if (mostrarDatos) {
      setMostrarDatos(false);
      return;
    }
    if (!puedeRevelar) return; // solo SUPER_ADMIN
    setConfirmMostrar(true);
  }

  // Burn mensual estimado POR MONEDA (jamás sumadas): EXCLUYE finalizados y pausados.
  const burn = useMemo(() => burnDe(costos), [costos]);

  // Búsqueda por nombre/persona (case-insensitive) aplicada a todo, luego split.
  const { vigentes, historico } = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    const coincide = (c: CostoRecurrenteDTO) =>
      q === "" ||
      c.nombre.toLowerCase().includes(q) ||
      (c.teamMemberName?.toLowerCase().includes(q) ?? false);
    const filtrados = costos.filter(coincide);
    return {
      vigentes: filtrados.filter((c) => c.finalizadoEl == null),
      historico: filtrados.filter((c) => c.finalizadoEl != null),
    };
  }, [costos, busqueda]);

  // Vigentes agrupados por categoría en el orden canónico.
  const grupos = useMemo(
    () =>
      COSTOS_CATEGORIAS.map((cat) => ({
        cat,
        items: vigentes.filter((c) => c.categoria === cat),
        subtotal: burnDe(vigentes.filter((c) => c.categoria === cat)),
      })).filter((g) => g.items.length > 0),
    [vigentes],
  );

  const patchCosto = (id: string, body: Record<string, unknown>) =>
    fetchJson(`/api/cobranza/costos/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

  async function ejecutar(
    id: string,
    accion: Accion,
    req: () => Promise<unknown>,
    okMsg: string,
    errMsg: string,
  ) {
    if (busy) return;
    setBusy({ id, accion });
    try {
      await req();
      toast.success(okMsg);
      setConfirmBorrarId(null);
      setFinalizarId(null);
      onCostosChanged();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : errMsg);
    } finally {
      setBusy(null);
    }
  }

  const togglePausa = (c: CostoRecurrenteDTO) =>
    ejecutar(
      c.id,
      "pausar",
      () => patchCosto(c.id, { activo: !c.activo }),
      c.activo ? "Costo pausado." : "Costo reanudado.",
      "No se pudo cambiar el estado.",
    );

  const finalizar = (id: string) =>
    ejecutar(
      id,
      "finalizar",
      () =>
        patchCosto(id, {
          finalizadoEl: finalizarFecha,
          motivoMovimiento: finalizarMotivo.trim() ? finalizarMotivo.trim() : null,
        }),
      "Costo dado de baja.",
      "No se pudo dar de baja el costo.",
    );

  const reactivar = (id: string) =>
    ejecutar(
      id,
      "reactivar",
      () => patchCosto(id, { finalizadoEl: null }),
      "Costo reactivado.",
      "No se pudo reactivar el costo.",
    );

  const borrar = (id: string) =>
    ejecutar(
      id,
      "borrar",
      () => fetchJson(`/api/cobranza/costos/${id}`, { method: "DELETE" }),
      "Costo borrado.",
      "No se pudo borrar el costo.",
    );

  function abrirFinalizar(c: CostoRecurrenteDTO) {
    setConfirmBorrarId(null);
    setFinalizarId(c.id);
    setFinalizarFecha(todayISO);
    setFinalizarMotivo("");
  }
  function abrirBorrar(id: string) {
    setFinalizarId(null);
    setConfirmBorrarId(id);
  }

  return (
    <div className="space-y-4">
      {/* ── Naturaleza de los datos (banner ámbar) ── */}
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-600">
        Cifras estimadas — referencia para dirección, no contabilidad.
      </div>

      {/* ── Sub-navegación de vistas (pills) + toggle de montos ── */}
      <div className="flex flex-wrap items-center gap-1.5">
        {VISTAS.map(([k, lbl]) => (
          <button
            key={k}
            type="button"
            onClick={() => setVista(k)}
            aria-pressed={vista === k}
            className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              vista === k
                ? "border-brand/30 bg-brand/10 text-brand"
                : "border-transparent text-fg-muted hover:text-fg-secondary"
            }`}
          >
            {lbl}
          </button>
        ))}
        {/* Vive junto a las pills (no dentro de una vista) porque aplica a las TRES:
            costos fijos, gastos y movimientos muestran los mismos montos sensibles. */}
        <button
          type="button"
          onClick={onToggleMostrar}
          disabled={!mostrarDatos && !puedeRevelar}
          aria-pressed={mostrarDatos}
          title={
            mostrarDatos
              ? "Ocultar los montos (salarios y precios de herramientas)"
              : puedeRevelar
                ? "Mostrar los montos — pide confirmación; ojo con quién tenés al lado o si estás compartiendo pantalla"
                : "Solo un super admin puede mostrar los montos"
          }
          className="ml-auto flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-line text-fg-muted hover:text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {mostrarDatos ? (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.542-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.542 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
            </svg>
          ) : (
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
          )}
          {mostrarDatos ? "Ocultar datos" : "Mostrar datos"}
        </button>
      </div>

      {vista === "fijos" && (
        <div className="space-y-4">
          {/* ── Encabezado + CTA ── */}
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xs text-fg-muted">
              Costos de referencia: salarios all-in, herramientas y fijos de operación.
            </p>
            <button
              type="button"
              onClick={() => setForm({ abierto: true, costo: null })}
              className="ml-auto text-xs font-medium px-3 py-1.5 rounded-lg border border-brand/30 text-brand bg-brand/10 hover:bg-brand/20 transition-colors"
            >
              Agregar costo
            </button>
          </div>

          {costos.length === 0 ? (
            <EmptyState
              variant="dashed"
              title="Sin costos registrados"
              description="Todavía no registraste ningún costo. Empezá por los salarios y las herramientas fijas."
            />
          ) : (
            <>
              {/* ── Burn mensual estimado, POR MONEDA (jamás sumadas) ── */}
              <div className="grid grid-cols-2 gap-3">
                {(["CRC", "USD"] as const).map((m) => (
                  <div key={m} className="rounded-xl border border-line bg-surface px-4 py-3">
                    <p
                      className={`text-lg font-bold leading-tight tabular-nums text-fg ${
                        burn[m] === 0 ? "opacity-40" : ""
                      }`}
                    >
                      {fmtMontoVisible(burn[m], m, mostrarDatos)}
                    </p>
                    <p className="text-[11px] font-medium uppercase tracking-wide mt-1 text-fg-muted">
                      Burn mensual estimado · {m}
                    </p>
                    <p className="text-[11px] mt-0.5 text-fg-muted opacity-70">
                      vigentes activos · anual ÷ 12
                    </p>
                  </div>
                ))}
              </div>

              {/* ── Búsqueda por nombre ── */}
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscá por nombre o persona…"
                className={INPUT_CLS}
              />

              {/* ── Lista agrupada por categoría (solo vigentes) ── */}
              {grupos.length === 0 ? (
                <p className="text-xs text-fg-muted px-1 py-4">
                  {busqueda.trim()
                    ? "Ningún costo coincide con la búsqueda."
                    : "No hay costos vigentes."}
                </p>
              ) : (
                grupos.map(({ cat, items, subtotal }) => {
                  const partes: string[] = [];
                  if (subtotal.CRC > 0) partes.push(fmtMontoVisible(subtotal.CRC, "CRC", mostrarDatos));
                  if (subtotal.USD > 0) partes.push(fmtMontoVisible(subtotal.USD, "USD", mostrarDatos));
                  return (
                    <div
                      key={cat}
                      className="rounded-xl border border-line bg-surface overflow-hidden"
                    >
                      <div className="px-4 py-2.5 bg-surface-muted border-b border-line flex items-center gap-2">
                        <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
                          {CATEGORIA_COSTO_LABEL[cat] ?? cat} · {items.length}
                        </span>
                        <span className="ml-auto text-[11px] tabular-nums text-fg-secondary whitespace-nowrap">
                          {partes.length > 0 ? `${partes.join(" · ")}/mes` : "—"}
                        </span>
                      </div>
                      <ul className="divide-y divide-line">
                        {items.map((c) => (
                          <li key={c.id} className="px-4 py-2.5">
                            <div
                              className={`flex flex-wrap items-center gap-2 ${
                                c.activo ? "" : "opacity-60"
                              }`}
                            >
                              <span className="flex-1 min-w-[160px] truncate text-sm font-medium text-fg">
                                {c.nombre}
                                {c.categoria === "SALARIO" && c.teamMemberName ? (
                                  <span className="font-normal text-fg-muted">
                                    {" · "}
                                    {c.teamMemberName}
                                  </span>
                                ) : null}
                              </span>
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted whitespace-nowrap">
                                {c.frecuencia === "ANUAL"
                                  ? `Anual → ${fmtMontoVisible(mensualizado(c.monto, c.frecuencia), c.moneda, mostrarDatos)}/mes`
                                  : (FRECUENCIA_COSTO_LABEL[c.frecuencia] ?? c.frecuencia)}
                              </span>
                              {!c.activo && (
                                <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-amber-500/30 bg-amber-500/10 text-amber-600 whitespace-nowrap">
                                  Pausado
                                </span>
                              )}
                              <span className="w-32 text-right text-sm font-medium tabular-nums text-fg whitespace-nowrap">
                                {fmtMontoVisible(c.monto, c.moneda, mostrarDatos)}
                              </span>
                              <div className="flex items-center gap-1">
                                <button
                                  type="button"
                                  disabled={busy != null}
                                  onClick={() => void togglePausa(c)}
                                  className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
                                >
                                  {busy != null && busy.id === c.id && busy.accion === "pausar"
                                    ? "…"
                                    : c.activo
                                      ? "Pausar"
                                      : "Reanudar"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setForm({ abierto: true, costo: c })}
                                  className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors"
                                >
                                  Editar
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    finalizarId === c.id ? setFinalizarId(null) : abrirFinalizar(c)
                                  }
                                  className="text-[11px] font-medium px-2 py-1 rounded-md border border-amber-500/30 text-amber-600 hover:bg-amber-500/10 transition-colors"
                                >
                                  Finalizar
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    confirmBorrarId === c.id
                                      ? setConfirmBorrarId(null)
                                      : abrirBorrar(c.id)
                                  }
                                  className="text-[11px] font-medium px-2 py-1 rounded-md border border-red-500/30 text-red-600 hover:bg-red-500/10 transition-colors"
                                >
                                  Borrar
                                </button>
                              </div>
                            </div>

                            {/* Confirm inline: finalizar (baja definitiva) */}
                            {finalizarId === c.id && (
                              <div className="mt-2 rounded-lg border border-amber-500/30 bg-amber-500/5 px-3 py-2 space-y-2">
                                <p className="text-xs text-amber-600">
                                  Dar de baja definitiva. Sale del burn y va al histórico.
                                </p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[11px] font-medium text-fg-muted mb-1">
                                      Fecha de baja
                                    </label>
                                    <input
                                      type="date"
                                      value={finalizarFecha}
                                      max={todayISO}
                                      onChange={(e) => setFinalizarFecha(e.target.value)}
                                      className={INPUT_CLS}
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[11px] font-medium text-fg-muted mb-1">
                                      Motivo (opcional)
                                    </label>
                                    <input
                                      value={finalizarMotivo}
                                      onChange={(e) => setFinalizarMotivo(e.target.value)}
                                      placeholder="renuncia, desvinculación…"
                                      maxLength={500}
                                      className={INPUT_CLS}
                                    />
                                  </div>
                                </div>
                                <div className="flex items-center justify-end gap-2">
                                  <button
                                    type="button"
                                    onClick={() => setFinalizarId(null)}
                                    className="text-[11px] text-fg-muted hover:text-fg px-2 py-1"
                                  >
                                    Cancelar
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy != null || !finalizarFecha}
                                    onClick={() => void finalizar(c.id)}
                                    className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-amber-500/30 text-amber-600 bg-amber-500/10 hover:bg-amber-500/20 transition-colors disabled:opacity-50"
                                  >
                                    {busy != null && busy.id === c.id && busy.accion === "finalizar"
                                      ? "Dando de baja…"
                                      : "Dar de baja"}
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* Confirm inline: borrar (duro) */}
                            {confirmBorrarId === c.id && (
                              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2">
                                <p className="flex-1 min-w-[200px] text-xs text-red-600">
                                  ¿Borrar este costo? No se puede deshacer. Si querés conservar el
                                  histórico, usá &ldquo;Finalizar&rdquo; en vez de borrar.
                                </p>
                                <button
                                  type="button"
                                  onClick={() => setConfirmBorrarId(null)}
                                  className="text-[11px] text-fg-muted hover:text-fg px-2 py-1"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={busy != null}
                                  onClick={() => void borrar(c.id)}
                                  className="text-[11px] font-medium px-2.5 py-1 rounded-md border border-red-500/30 text-red-600 bg-red-500/10 hover:bg-red-500/20 transition-colors disabled:opacity-50"
                                >
                                  {busy != null && busy.id === c.id && busy.accion === "borrar"
                                    ? "Borrando…"
                                    : "Sí, borrar"}
                                </button>
                              </div>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })
              )}

              {/* ── Histórico (bajas definitivas) — colapsable al pie ── */}
              {historico.length > 0 && (
                <div className="rounded-xl border border-line bg-surface overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setHistoricoAbierto((v) => !v)}
                    className="w-full px-4 py-2.5 bg-surface-muted border-b border-line flex items-center gap-2 text-left hover:bg-surface-hover transition-colors"
                  >
                    <svg
                      className={`w-3 h-3 shrink-0 text-fg-muted transition-transform ${
                        historicoAbierto ? "rotate-90" : ""
                      }`}
                      viewBox="0 0 20 20"
                      fill="currentColor"
                      aria-hidden
                    >
                      <path
                        fillRule="evenodd"
                        d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z"
                        clipRule="evenodd"
                      />
                    </svg>
                    <span className="text-[11px] font-semibold text-fg-muted uppercase tracking-wide">
                      Histórico · {historico.length}
                    </span>
                  </button>
                  {historicoAbierto && (
                    <ul className="divide-y divide-line">
                      {historico.map((c) => (
                        <li key={c.id} className="px-4 py-2.5">
                          <div className="flex flex-wrap items-center gap-2 opacity-80">
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-red-500/30 bg-red-500/10 text-red-600 whitespace-nowrap">
                              Finalizado
                            </span>
                            <span className="flex-1 min-w-[160px] truncate text-sm font-medium text-fg">
                              {c.nombre}
                              {c.categoria === "SALARIO" && c.teamMemberName ? (
                                <span className="font-normal text-fg-muted">
                                  {" · "}
                                  {c.teamMemberName}
                                </span>
                              ) : null}
                            </span>
                            <span className="text-[11px] text-fg-muted whitespace-nowrap">
                              Baja: {fmtFecha(c.finalizadoEl)}
                            </span>
                            <span className="w-32 text-right text-sm font-medium tabular-nums text-fg whitespace-nowrap">
                              {fmtMontoVisible(c.monto, c.moneda, mostrarDatos)}
                            </span>
                            <button
                              type="button"
                              disabled={busy != null}
                              onClick={() => void reactivar(c.id)}
                              className="text-[11px] font-medium px-2 py-1 rounded-md border border-line text-fg-secondary hover:bg-surface-hover transition-colors disabled:opacity-50"
                            >
                              {busy != null && busy.id === c.id && busy.accion === "reactivar"
                                ? "Reactivando…"
                                : "Reactivar"}
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {vista === "gastos" && (
        <GastosSection gastos={gastos} todayISO={todayISO} onChanged={onGastosChanged} mostrarDatos={mostrarDatos} />
      )}

      {vista === "movimientos" && <MovimientosSection mostrarDatos={mostrarDatos} />}

      {form.abierto && (
        <CostoForm
          costo={form.costo}
          onClose={() => setForm({ abierto: false, costo: null })}
          onSaved={() => {
            setForm({ abierto: false, costo: null });
            onCostosChanged();
          }}
        />
      )}

      {/* 2ª confirmación antes de revelar salarios/precios en pantalla. */}
      <ConfirmDialog
        open={confirmMostrar}
        variant="default"
        title="¿Mostrar los montos?"
        description={
          <>
            Vas a revelar en pantalla los salarios y los precios de las herramientas.
            Asegurate de que nadie más los esté viendo (alguien al lado, pantalla
            compartida). Se ocultan solos al recargar.
          </>
        }
        confirmLabel="Mostrar montos"
        cancelLabel="Cancelar"
        onConfirm={() => {
          setMostrarDatos(true);
          setConfirmMostrar(false);
        }}
        onCancel={() => setConfirmMostrar(false)}
      />
    </div>
  );
}
