"use client";

/**
 * components/finanzas/TarjetasPanel.tsx
 *
 * Las tarjetas de crédito de la empresa y su capacidad disponible.
 *
 * ⚠ LO QUE ESTA PANTALLA NO PUEDE HACER, y por qué está escrito acá además de en
 * `lib/cobranza/tarjetas.ts`: el DISPONIBLE sale de `límite − saldo` y de nada
 * más. Lo asignado (la suma de los costos ligados) se muestra AL LADO, rotulado
 * como referencia, y jamás rellena un saldo faltante — un saldo es acumulado y
 * un cargo es mensual, y usar uno como proxy del otro sería inventar una
 * conciliación. Cuando falta el dato, la tarjeta lo DICE en vez de aproximar.
 *
 * Sin semáforo y sin alertas: la prohibición transversal de costos sigue en pie
 * aunque una tarjeta sí tenga fecha de corte. El ciclo (cuándo corta, cuándo
 * vence) se muestra como INFORMACIÓN y el orden hace el trabajo que en otro
 * módulo haría un color.
 *
 * ⚠ La fecha de hoy llega por prop (`todayISO`, la fecha de Costa Rica que
 * resolvió el server): calcularla en el browser daría un día distinto al del
 * ciclo que ya vino calculado en el DTO.
 */

import { useState } from "react";
import type { TarjetaDTO, TarjetaCostoDTO, CostoRecurrenteDTO } from "@/lib/cobranza";
import { diffDays } from "@/lib/cobranza/engine";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Button, PageHeader, EmptyState, Modal, Field, Input, Select, Alert } from "@/components/ui";
import { fmtDiaMes, fmtMonto, INPUT_CLS, LABEL_CLS } from "@/components/cobranza/format";
import { COBRANZA_MONEDAS } from "@/lib/cobranza/schema";

interface Props {
  initialTarjetas: TarjetaDTO[];
  costos: CostoRecurrenteDTO[];
  todayISO: string;
}

type FormState = {
  alias: string;
  emisor: string;
  ultimos4: string;
  moneda: string;
  limite: string;
  diaCorte: string;
  diaPago: string;
  notas: string;
};

const VACIO: FormState = {
  alias: "",
  emisor: "",
  ultimos4: "",
  moneda: "USD",
  limite: "",
  diaCorte: "",
  diaPago: "",
  notas: "",
};

const numeroONull = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

const FALTA_LABEL: Record<string, string> = {
  limite: "Falta el límite",
  saldo: "Falta la deuda declarada",
  ambos: "Faltan el límite y la deuda declarada",
};

/** Días con signo respecto de hoy → "hoy" · "en 20 días" · "hace 4 días". */
function enDias(dias: number): string {
  if (dias === 0) return "hoy";
  const abs = Math.abs(dias);
  const unidad = abs === 1 ? "día" : "días";
  return dias > 0 ? `en ${abs} ${unidad}` : `hace ${abs} ${unidad}`;
}

/**
 * Qué falta para poder mostrar el ciclo. Se DICE, nunca se rellena con un día
 * plausible: un vencimiento inventado es el dato por el que alguien paga tarde.
 */
function faltaCicloLabel(t: TarjetaDTO): string {
  if (t.diaCorte == null && t.diaPago == null)
    return "Sin día de corte ni día de pago: no se puede decir cuándo corta ni cuándo vence.";
  if (t.diaCorte == null) return "Falta el día de corte: sin él no hay ciclo que mostrar.";
  if (t.diaPago == null) return "Falta el día de pago: se sabe cuándo corta, no cuándo vence.";
  return "Los días cargados no son días del mes válidos.";
}

const ESTIMADO_TIP =
  "Se deduce del día de corte y el día de pago. Un banco que corta el 5 y cobra el 25 del mes siguiente no se puede escribir con esos dos números: confirma el vencimiento en el estado de cuenta.";

const esVigente = (c: TarjetaCostoDTO) => c.activo && c.finalizadoEl === null;

export default function TarjetasPanel({ initialTarjetas, costos, todayISO }: Props) {
  const toast = useToast();
  const [tarjetas, setTarjetas] = useState(initialTarjetas);
  const [form, setForm] = useState<FormState | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [saldoDe, setSaldoDe] = useState<TarjetaDTO | null>(null);
  const [asignarA, setAsignarA] = useState<TarjetaDTO | null>(null);
  const [guardando, setGuardando] = useState(false);

  async function refrescar() {
    try {
      const data = await fetchJson<{ tarjetas: TarjetaDTO[] }>("/api/cobranza/costos/tarjetas");
      setTarjetas(data.tarjetas);
    } catch {
      // Best-effort: si el refresco falla, lo escrito ya está en la base.
      toast.error("No se pudo refrescar la lista. Recargá la página.");
    }
  }

  async function guardarTarjeta() {
    if (!form) return;
    const body = {
      alias: form.alias.trim(),
      emisor: form.emisor.trim() || null,
      ultimos4: form.ultimos4.trim() || null,
      moneda: form.moneda,
      limite: numeroONull(form.limite),
      diaCorte: numeroONull(form.diaCorte),
      diaPago: numeroONull(form.diaPago),
      notas: form.notas.trim() || null,
    };
    setGuardando(true);
    try {
      if (editandoId) {
        await fetchJson(`/api/cobranza/costos/tarjetas/${editandoId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        await fetchJson("/api/cobranza/costos/tarjetas", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      }
      setForm(null);
      setEditandoId(null);
      await refrescar();
      toast.success(editandoId ? "Tarjeta actualizada." : "Tarjeta agregada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la tarjeta.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarTarjeta(t: TarjetaDTO) {
    try {
      await fetchJson(`/api/cobranza/costos/tarjetas/${t.id}`, { method: "DELETE" });
      await refrescar();
      toast.success("Tarjeta eliminada. Los costos que tenía asignados siguen vivos.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar la tarjeta.");
    }
  }

  async function toggleCosto(tarjeta: TarjetaDTO, costoId: string, asignar: boolean) {
    try {
      await fetchJson(`/api/cobranza/costos/tarjetas/${tarjeta.id}/costos`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ costoId, asignar }),
      });
      await refrescar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo actualizar la asignación.");
    }
  }

  const activas = tarjetas.filter((t) => t.activa);
  const inactivas = tarjetas.filter((t) => !t.activa);
  const conAviso = tarjetas.filter((t) => t.noCabeElProximoMes);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tarjetas de crédito"
        description="Las tarjetas de la empresa y cuánto queda disponible en cada una."
        action={
          <Button
            onClick={() => {
              setEditandoId(null);
              setForm(VACIO);
            }}
          >
            Agregar tarjeta
          </Button>
        }
      />

      {conAviso.length > 0 && (
        <Alert variant="warning">
          {conAviso.length === 1
            ? `En ${conAviso[0]!.alias} el disponible no alcanza para el próximo mes de cargos.`
            : `En ${conAviso.length} tarjetas el disponible no alcanza para el próximo mes de cargos.`}
        </Alert>
      )}

      {tarjetas.length === 0 ? (
        <EmptyState
          title="Todavía no hay tarjetas"
          description="Agregá las tarjetas que maneja la empresa para ver su capacidad disponible."
        />
      ) : (
        <div className="space-y-3">
          {[...activas, ...inactivas].map((t) => (
            <TarjetaCard
              key={t.id}
              t={t}
              todayISO={todayISO}
              onEditar={() => {
                setEditandoId(t.id);
                setForm({
                  alias: t.alias,
                  emisor: t.emisor ?? "",
                  ultimos4: t.ultimos4 ?? "",
                  moneda: t.moneda,
                  limite: t.limite != null ? String(t.limite) : "",
                  diaCorte: t.diaCorte != null ? String(t.diaCorte) : "",
                  diaPago: t.diaPago != null ? String(t.diaPago) : "",
                  notas: t.notas ?? "",
                });
              }}
              onSaldo={() => setSaldoDe(t)}
              onAsignar={() => setAsignarA(t)}
              onBorrar={() => borrarTarjeta(t)}
            />
          ))}
        </div>
      )}

      {form && (
        <Modal
          open
          onClose={() => {
            setForm(null);
            setEditandoId(null);
          }}
          title={editandoId ? "Editar tarjeta" : "Agregar tarjeta"}
          description="El saldo no se carga acá: va con su fecha de corte, en «Registrar saldo»."
        >
          <div className="space-y-3">
            <Field label="Alias">
              <Input
                value={form.alias}
                onChange={(e) => setForm({ ...form, alias: e.target.value })}
                placeholder="Ej. VISA de Alexander"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Emisor">
                <Input
                  value={form.emisor}
                  onChange={(e) => setForm({ ...form, emisor: e.target.value })}
                  placeholder="Ej. BAC"
                />
              </Field>
              <Field
                label="Últimos 4 dígitos"
                hint="Solo los últimos cuatro — el número completo no se guarda."
              >
                <Input
                  value={form.ultimos4}
                  onChange={(e) => setForm({ ...form, ultimos4: e.target.value })}
                  inputMode="numeric"
                  maxLength={4}
                  placeholder="8511"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Moneda">
                <Select
                  value={form.moneda}
                  onChange={(e) => setForm({ ...form, moneda: e.target.value })}
                >
                  {COBRANZA_MONEDAS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Límite" hint="Se puede dejar vacío y cargarlo después.">
                <Input
                  value={form.limite}
                  onChange={(e) => setForm({ ...form, limite: e.target.value })}
                  inputMode="decimal"
                  placeholder="5000"
                />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Día de corte">
                <Input
                  value={form.diaCorte}
                  onChange={(e) => setForm({ ...form, diaCorte: e.target.value })}
                  inputMode="numeric"
                  placeholder="15"
                />
              </Field>
              <Field label="Día de pago">
                <Input
                  value={form.diaPago}
                  onChange={(e) => setForm({ ...form, diaPago: e.target.value })}
                  inputMode="numeric"
                  placeholder="30"
                />
              </Field>
            </div>
            <Field label="Notas">
              <Input
                value={form.notas}
                onChange={(e) => setForm({ ...form, notas: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button
                variant="secondary"
                onClick={() => {
                  setForm(null);
                  setEditandoId(null);
                }}
              >
                Cancelar
              </Button>
              <Button onClick={guardarTarjeta} disabled={guardando || !form.alias.trim()}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {saldoDe && (
        <SaldoModal
          tarjeta={saldoDe}
          todayISO={todayISO}
          onClose={() => setSaldoDe(null)}
          onGuardado={async () => {
            setSaldoDe(null);
            await refrescar();
          }}
        />
      )}

      {asignarA && (
        <AsignarModal
          tarjeta={tarjetas.find((t) => t.id === asignarA.id) ?? asignarA}
          costos={costos}
          onToggle={(costoId, asignar) => toggleCosto(asignarA, costoId, asignar)}
          onClose={() => setAsignarA(null)}
        />
      )}
    </div>
  );
}

// ── Una tarjeta ────────────────────────────────────────────────────────────────

function TarjetaCard({
  t,
  todayISO,
  onEditar,
  onSaldo,
  onAsignar,
  onBorrar,
}: {
  t: TarjetaDTO;
  todayISO: string;
  onEditar: () => void;
  onSaldo: () => void;
  onAsignar: () => void;
  onBorrar: () => void;
}) {
  const moneda = t.moneda as "CRC" | "USD";
  // Los que SÍ suman al cargo del ciclo van juntos; los de otra moneda se
  // cuentan aparte y se declaran (CRC y USD nunca se suman en este módulo).
  const enSuMoneda = t.costos.filter((c) => c.moneda === t.moneda);
  const enOtraMoneda = t.costos.filter((c) => c.moneda !== t.moneda);
  return (
    <div className="rounded-xl border border-line bg-surface p-4 space-y-3">
      <div className="flex items-start gap-2 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium text-fg">{t.alias}</p>
            {t.ultimos4 && (
              <span className="text-[11px] text-fg-muted tabular-nums">•••• {t.ultimos4}</span>
            )}
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line text-fg-muted">
              {t.moneda}
            </span>
            {!t.activa && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded border border-line bg-surface-muted text-fg-muted">
                Inactiva
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] text-fg-muted">
            {[t.emisor, t.titularNombre].filter(Boolean).join(" · ") || "Sin emisor ni titular"}
          </p>
          {/* El ciclo VIVO. Antes acá iban "corta el 15 · se paga el 30", que es
              el dato crudo del formulario y no responde la pregunta real:
              cuándo cae el próximo y cuánto falta. */}
          <p className="mt-0.5 text-[11px] text-fg-secondary">
            {t.ciclo ? (
              <>
                Próximo corte: {fmtDiaMes(t.ciclo.proximoCorte)} · {enDias(t.ciclo.diasAlCorte)} ·
                se paga el {fmtDiaMes(t.ciclo.fechaLimitePago)}{" "}
                <span className="text-fg-muted underline decoration-dotted" title={ESTIMADO_TIP}>
                  (estimado)
                </span>
              </>
            ) : (
              <span className="text-fg-muted">{faltaCicloLabel(t)}</span>
            )}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
          <Button variant="secondary" size="sm" onClick={onSaldo}>
            Registrar saldo
          </Button>
          <Button variant="secondary" size="sm" onClick={onAsignar}>
            Asignar costos
          </Button>
          <Button variant="secondary" size="sm" onClick={onEditar}>
            Editar
          </Button>
          <Button variant="secondary" size="sm" onClick={onBorrar}>
            Eliminar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Dato
          titulo="Disponible"
          valor={t.disponible != null ? fmtMonto(t.disponible, moneda) : "—"}
          detalle={
            t.faltaDato
              ? FALTA_LABEL[t.faltaDato]
              : t.limite != null && t.saldoUsado != null
                ? `${fmtMonto(t.limite, moneda)} de límite − ${fmtMonto(t.saldoUsado, moneda)} usados`
                : undefined
          }
          alerta={t.faltaDato !== null}
        />
        {/* «Deuda declarada» y no «Saldo al corte»: este número es el que
            `calcularTarjeta` usa como la deuda de HOY para pintar el disponible.
            Llamarlo "al corte" hacía creer que era una foto vieja y sin efecto,
            cuando es el único insumo del disponible. La antigüedad va al lado
            justamente para que se vea cuán vieja es esa declaración. */}
        <Dato
          titulo="Deuda declarada"
          valor={t.saldoUsado != null ? fmtMonto(t.saldoUsado, moneda) : "—"}
          detalle={
            t.saldoAlDia
              ? `al ${fmtDiaMes(t.saldoAlDia)} · ${enDias(diffDays(todayISO, t.saldoAlDia))}${
                  t.saldoPorEmail ? ` · ${t.saldoPorEmail}` : ""
                }`
              : "Nadie la ha registrado todavía"
          }
        />
        <Dato
          titulo="Cargado por mes"
          // Rótulo explícito: esto NO es el saldo ni lo aproxima.
          valor={fmtMonto(t.cargadoMensual, moneda)}
          detalle={`Referencia · ${t.costos.length} costo${t.costos.length === 1 ? "" : "s"} asignado${
            t.costos.length === 1 ? "" : "s"
          }${t.cargadoEnOtraMoneda > 0 ? ` · ${t.cargadoEnOtraMoneda} en otra moneda, sin sumar` : ""}`}
        />
      </div>

      {t.noCabeElProximoMes && (
        <p className="text-[11px] text-warn-ink">
          El disponible no alcanza para el próximo mes de cargos.
        </p>
      )}

      {/* El monto de cada costo vivía escondido en un `title=""`: es el dato más
          útil que esta sección ya tenía y no mostraba. Acá se ve, y la suma es
          exactamente `cargadoMensual` (misma regla: solo vigentes y solo en la
          moneda de la tarjeta). */}
      {t.costos.length > 0 && (
        <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
          <p className="text-[10px] font-medium uppercase tracking-widest text-fg-muted">
            Lo que se le carga en este ciclo
          </p>

          {enSuMoneda.length > 0 && (
            <ul className="mt-1.5 space-y-1">
              {enSuMoneda.map((c) => {
                const vigente = esVigente(c);
                return (
                  <li key={c.id} className="flex items-baseline gap-2 text-[11px]">
                    <span className={vigente ? "text-fg-secondary" : "text-fg-muted line-through"}>
                      {c.nombre}
                    </span>
                    {c.frecuencia === "ANUAL" && (
                      <span className="text-[10px] text-fg-muted flex-shrink-0">anual ÷ 12</span>
                    )}
                    {!vigente && (
                      <span className="text-[10px] text-fg-muted flex-shrink-0">
                        {c.finalizadoEl ? "dado de baja · no se le carga" : "pausado · no se le carga"}
                      </span>
                    )}
                    <span
                      className={`ml-auto tabular-nums flex-shrink-0 ${
                        vigente ? "text-fg" : "text-fg-muted line-through"
                      }`}
                    >
                      {fmtMonto(c.montoMensual, moneda)}
                    </span>
                  </li>
                );
              })}
              <li className="flex items-baseline gap-2 border-t border-line pt-1 text-[11px]">
                <span className="text-fg-secondary">Total por mes</span>
                <span className="ml-auto tabular-nums font-medium text-fg">
                  {fmtMonto(t.cargadoMensual, moneda)}
                </span>
              </li>
            </ul>
          )}

          {enOtraMoneda.length > 0 && (
            <div className="mt-1.5 border-t border-line pt-1.5">
              <p className="text-[11px] text-fg-muted">
                {enOtraMoneda.length === 1 ? "Un costo está" : `${enOtraMoneda.length} costos están`}{" "}
                en otra moneda que la tarjeta y NO se suman:
              </p>
              <ul className="mt-1 space-y-0.5">
                {enOtraMoneda.map((c) => (
                  <li key={c.id} className="flex items-baseline gap-2 text-[11px] text-fg-muted">
                    <span className={esVigente(c) ? "" : "line-through"}>{c.nombre}</span>
                    <span className="ml-auto tabular-nums flex-shrink-0">
                      {fmtMonto(c.montoMensual, c.moneda as "CRC" | "USD")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Dato({
  titulo,
  valor,
  detalle,
  alerta,
}: {
  titulo: string;
  valor: string;
  detalle?: string;
  alerta?: boolean;
}) {
  return (
    <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-widest text-fg-muted">{titulo}</p>
      <p className="mt-0.5 text-sm text-fg tabular-nums">{valor}</p>
      {detalle && (
        <p className={`mt-0.5 text-[11px] ${alerta ? "text-warn-ink" : "text-fg-muted"}`}>
          {detalle}
        </p>
      )}
    </div>
  );
}

// ── Registrar saldo ────────────────────────────────────────────────────────────

function SaldoModal({
  tarjeta,
  todayISO,
  onClose,
  onGuardado,
}: {
  tarjeta: TarjetaDTO;
  todayISO: string;
  onClose: () => void;
  onGuardado: () => void;
}) {
  const toast = useToast();
  const [saldo, setSaldo] = useState(tarjeta.saldoUsado != null ? String(tarjeta.saldoUsado) : "");
  const [fecha, setFecha] = useState(tarjeta.saldoAlDia ?? todayISO);
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const n = Number(saldo);
    if (!Number.isFinite(n) || n < 0) {
      toast.error("El saldo tiene que ser un número mayor o igual a cero.");
      return;
    }
    setGuardando(true);
    try {
      await fetchJson(`/api/cobranza/costos/tarjetas/${tarjeta.id}/saldo`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ saldoUsado: n, saldoAlDia: fecha }),
      });
      toast.success("Saldo registrado a tu nombre.");
      onGuardado();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo registrar el saldo.");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Saldo de ${tarjeta.alias}`}
      description="Cuánto se debe y a qué día. Es la única verdad del disponible: Nexus no lo deduce de los costos asignados."
    >
      <div className="space-y-3">
        <Field label={`Saldo usado (${tarjeta.moneda})`}>
          <Input
            value={saldo}
            onChange={(e) => setSaldo(e.target.value)}
            inputMode="decimal"
            placeholder="1250"
          />
        </Field>
        {/* No es "la fecha de corte" (esa la define el día de corte de la
            tarjeta): es a qué día está declarada esta deuda. Con el rótulo viejo,
            un saldo consultado hoy se cargaba con la fecha del corte anterior. */}
        <Field
          label="¿A qué día corresponde este saldo?"
          hint="Normalmente hoy, si acabas de consultarlo en el banco."
        >
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={guardar} disabled={guardando || !saldo.trim()}>
            {guardando ? "Guardando…" : "Registrar"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// ── Asignar costos ─────────────────────────────────────────────────────────────

function AsignarModal({
  tarjeta,
  costos,
  onToggle,
  onClose,
}: {
  tarjeta: TarjetaDTO;
  costos: CostoRecurrenteDTO[];
  onToggle: (costoId: string, asignar: boolean) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");
  const asignados = new Set(tarjeta.costos.map((c) => c.id));
  const vigentes = costos.filter((c) => c.finalizadoEl === null);
  const lista = q.trim()
    ? vigentes.filter((c) => c.nombre.toLowerCase().includes(q.trim().toLowerCase()))
    : vigentes;

  return (
    <Modal
      open
      onClose={onClose}
      title={`Costos de ${tarjeta.alias}`}
      description="Lo que se paga con esta tarjeta. Sirve para saber cuánto le cargan por mes — no calcula el saldo."
    >
      <div className="space-y-3">
        <div>
          <label className={LABEL_CLS}>Buscar</label>
          <input
            className={INPUT_CLS}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Nombre del costo…"
          />
        </div>
        <div className="max-h-80 overflow-y-auto space-y-1 pr-1">
          {lista.length === 0 ? (
            <p className="text-xs text-fg-muted py-4 text-center">Nada que coincida.</p>
          ) : (
            lista.map((c) => {
              const puesto = asignados.has(c.id);
              const otraMoneda = c.moneda !== tarjeta.moneda;
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => onToggle(c.id, !puesto)}
                  className={`w-full text-left flex items-center gap-2 rounded-lg border px-2.5 py-1.5 transition-colors ${
                    puesto
                      ? "border-brand/30 bg-brand/10"
                      : "border-line bg-surface hover:bg-surface-hover"
                  }`}
                >
                  <span className="text-xs text-fg truncate">{c.nombre}</span>
                  <span className="ml-auto text-[11px] text-fg-muted tabular-nums flex-shrink-0">
                    {fmtMonto(c.monto, c.moneda as "CRC" | "USD")}
                  </span>
                  {otraMoneda && (
                    <span
                      className="text-[10px] text-warn-ink flex-shrink-0"
                      title="Está en otra moneda que la tarjeta: no se suma al cargo mensual"
                      >
                      otra moneda
                    </span>
                  )}
                </button>
              );
            })
          )}
        </div>
        <div className="flex justify-end pt-1">
          <Button variant="secondary" onClick={onClose}>
            Listo
          </Button>
        </div>
      </div>
    </Modal>
  );
}
