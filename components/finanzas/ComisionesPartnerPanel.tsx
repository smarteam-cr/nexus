"use client";

/**
 * components/finanzas/ComisionesPartnerPanel.tsx
 *
 * Lo que Smarteam GANA de cada aliado comercial. Es un INGRESO: superficie ADMIN
 * (gate `cobranza.read`), al lado de Ingresos variables.
 *
 * ⚠ Este panel NUNCA muestra comisiones de VENDEDOR. Son remuneración de una
 * persona, viven en otra ruta con otro guard y las carga otro loader.
 *
 * ⚠ Los totales van por moneda SEPARADA, también los de cada partner: CRC y USD
 * no se suman en ningún lado del módulo.
 */

import { useState } from "react";
import type { ComisionesPartnerDTO } from "@/lib/cobranza";
// ⚠ El VALOR se importa del modulo puro, NO del barrel: @/lib/cobranza reexporta
// queries.ts, que arrastra Prisma. Un Client Component que lo importe como valor
// mete el server en el bundle. Los TIPOS si pueden venir del barrel (se borran).
import { FRECUENCIAS_PARTNER } from "@/lib/cobranza/partners";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import {
  Button,
  PageHeader,
  EmptyState,
  Modal,
  ConfirmDialog,
  Field,
  Input,
  Select,
} from "@/components/ui";
import { fmtFecha, fmtMonto } from "@/components/cobranza/format";
import ComisionesDeAliado from "@/components/cobranza/ComisionesDeAliado";
import type { ComisionPartnerDTO } from "@/lib/cobranza";
import type { CorteDeMoneda } from "@/lib/cobranza/comisiones-partner";

/**
 * Cuántas comisiones hay de un lado del corte, sumando todas las monedas.
 *
 * El CONTEO sí cruza monedas —son cuántas cosas, no cuánta plata— y por eso vive acá
 * y no en el módulo de totales, donde la regla es que CRC y USD jamás se mezclan.
 */
function cuantas(totales: readonly CorteDeMoneda[], campo: "cuantasCobradas" | "cuantasEsperadas"): number {
  return totales.reduce((n, t) => n + t[campo], 0);
}
import { COBRANZA_MONEDAS } from "@/lib/cobranza/schema";

interface ClienteLite {
  id: string;
  name: string;
  kind: string;
}

interface Props {
  initial: ComisionesPartnerDTO;
  clientes: ClienteLite[];
  /** Hoy, por parámetro: la alerta de vencidas no lee el reloj. */
  todayISO: string;
}

const TH = "px-3 py-2 text-left text-[11px] font-medium uppercase tracking-widest text-fg-muted";
const TD = "px-3 py-2 text-xs text-fg";

type FormState = {
  partner: string;
  partnerId: string;
  concepto: string;
  monto: string;
  moneda: string;
  fecha: string;
  clientId: string;
  notas: string;
};

type AliadoForm = { id: string | null; nombre: string; frecuenciaMeses: string; notas: string };


export default function ComisionesPartnerPanel({ initial, clientes, todayISO }: Props) {
  const toast = useToast();
  const [data, setData] = useState(initial);
  const [form, setForm] = useState<FormState | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [aliado, setAliado] = useState<AliadoForm | null>(null);
  // Borrar un aliado le saca la cadencia a TODO su historial y no hay deshacer:
  // pide confirmacion, como el resto de los borrados del modulo.
  const [borrandoAliado, setBorrandoAliado] = useState<{ id: string; nombre: string } | null>(null);

  async function refrescar() {
    try {
      const r = await fetchJson<{ data: ComisionesPartnerDTO }>("/api/cobranza/comisiones-partner");
      setData(r.data);
    } catch {
      toast.error("No se pudo refrescar la lista. Recargá la página.");
    }
  }

  async function guardar() {
    if (!form) return;
    const monto = Number(form.monto);
    if (!Number.isFinite(monto) || monto <= 0) {
      toast.error("El monto tiene que ser un número positivo.");
      return;
    }
    const body = {
      partner: form.partner.trim(),
      partnerId: form.partnerId || null,
      concepto: form.concepto.trim() || null,
      monto,
      moneda: form.moneda,
      fecha: form.fecha,
      clientId: form.clientId || null,
      notas: form.notas.trim() || null,
    };
    setGuardando(true);
    try {
      await fetchJson(
        editandoId
          ? `/api/cobranza/comisiones-partner/${editandoId}`
          : "/api/cobranza/comisiones-partner",
        {
          method: editandoId ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
      );
      setForm(null);
      setEditandoId(null);
      await refrescar();
      toast.success(editandoId ? "Comisión actualizada." : "Comisión registrada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la comisión.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrar(id: string) {
    try {
      await fetchJson(`/api/cobranza/comisiones-partner/${id}`, { method: "DELETE" });
      await refrescar();
      toast.success("Comisión eliminada.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo eliminar la comisión.");
    }
  }

  const ALIADOS = "/api/cobranza/comisiones-partner/aliados";

  async function guardarAliado() {
    if (!aliado) return;
    const frecuenciaMeses = Number(aliado.frecuenciaMeses);
    if (!Number.isInteger(frecuenciaMeses) || frecuenciaMeses < 1 || frecuenciaMeses > 24) {
      toast.error("La frecuencia va entre 1 y 24 meses.");
      return;
    }
    setGuardando(true);
    try {
      await fetchJson(aliado.id ? `${ALIADOS}/${aliado.id}` : ALIADOS, {
        method: aliado.id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nombre: aliado.nombre.trim(),
          frecuenciaMeses,
          notas: aliado.notas.trim() || null,
        }),
      });
      setAliado(null);
      await refrescar();
      toast.success(aliado.id ? "Aliado actualizado." : "Aliado creado.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar el aliado.");
    } finally {
      setGuardando(false);
    }
  }

  async function borrarAliado(id: string) {
    try {
      await fetchJson(`${ALIADOS}/${id}`, { method: "DELETE" });
      await refrescar();
      toast.success("Aliado borrado. Sus pagos quedan; se pierde la frecuencia.");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo borrar el aliado.");
    }
  }

  const hoy = new Date().toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Comisiones de partner"
        description="Lo que Smarteam gana con cada aliado comercial. Es un ingreso — no entra a la caja neta todavía."
        action={
          <Button
            onClick={() => {
              setEditandoId(null);
              setForm({
                partner: "",
                partnerId: "",
                concepto: "",
                monto: "",
                moneda: "USD",
                fecha: hoy,
                clientId: "",
                notas: "",
              });
            }}
          >
            Registrar comisión
          </Button>
        }
      />

      {/* ── Lo que entró, y después lo que falta ──────────────────────────
          El orden es la decisión: ARRIBA la plata que está en el banco, ABAJO la que
          se espera. Antes había un solo «Total acumulado» que sumaba las dos cosas sin
          decirlo — con la proyección de noviembre adentro— y ese número no se podía
          llevar a ninguna reunión. */}
      {data.totales.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-xl border border-line bg-surface px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-fg-muted">Cobrado en el año</p>
            <p className="mt-1 text-xl font-bold text-fg tabular-nums">
              {data.totales.map((t) => fmtMonto(t.cobrado, t.moneda as "CRC" | "USD")).join(" · ")}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              {cuantas(data.totales, "cuantasCobradas")} confirmada
              {cuantas(data.totales, "cuantasCobradas") === 1 ? "" : "s"} · plata en el banco
            </p>
          </div>
          <div className="rounded-xl border border-line border-dashed bg-surface px-4 py-3">
            <p className="text-[10px] uppercase tracking-wide text-fg-muted">Por venir a fin de año</p>
            <p className="mt-1 text-xl font-semibold text-fg-secondary tabular-nums">
              {data.totales.map((t) => fmtMonto(t.esperado, t.moneda as "CRC" | "USD")).join(" · ")}
            </p>
            <p className="mt-0.5 text-[11px] text-fg-muted">
              {cuantas(data.totales, "cuantasEsperadas")} esperada
              {cuantas(data.totales, "cuantasEsperadas") === 1 ? "" : "s"} · el monto se confirma al entrar
            </p>
          </div>
        </div>
      )}

      {data.porPartner.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {data.porPartner.map((p) => (
            <div
              key={`${p.partner}-${p.moneda}`}
              className="rounded-xl border border-line bg-surface px-3 py-2"
            >
              <p className="text-[11px] font-medium text-fg-secondary truncate">{p.partner}</p>
              <p className="mt-0.5 text-sm text-fg tabular-nums">
                {fmtMonto(p.cobrado, p.moneda as "CRC" | "USD")}
              </p>
              <p className="text-[11px] text-fg-muted">
                {p.esperado > 0
                  ? `+ ${fmtMonto(p.esperado, p.moneda as "CRC" | "USD")} por venir · ${p.moneda}`
                  : `${p.cuantasCobradas} pago${p.cuantasCobradas === 1 ? "" : "s"} · ${p.moneda}`}
              </p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-lg border border-line bg-surface-muted px-3 py-2">
        <p className="text-[11px] text-fg-muted">
          Las comisiones de aliados son un INGRESO, pero no entran al total de facturación: esa cifra
          es solo servicios. · CRC y USD nunca se suman entre sí.
        </p>
      </div>

      {/* ── Historial por aliado, a SU cadencia ───────────────────────────── */}
      {data.historial.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-fg">Historial</h2>
          <p className="text-[11px] text-fg-muted">
            Cada aliado agrupado a su propia frecuencia — estos pagos no son mensuales, así que
            leerlos mes a mes solo mostraría meses vacíos.
          </p>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
            {data.historial.map((h) => (
              <div key={h.nombre} className="rounded-xl border border-line bg-surface p-3">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="text-xs font-medium text-fg">{h.nombre}</p>
                  <span className="text-[11px] text-fg-muted">{h.frecuenciaLabel}</span>
                  {h.frecuenciaMeses === null && (
                    <button
                      type="button"
                      className="text-[11px] text-brand hover:underline"
                      onClick={() =>
                        setAliado({ id: null, nombre: h.nombre, frecuenciaMeses: "3", notas: "" })
                      }
                    >
                      configurar
                    </button>
                  )}
                </div>
                <ul className="mt-2 space-y-1">
                  {h.periodos.map((b) => (
                    <li
                      key={`${b.clave}-${b.moneda}`}
                      className="flex items-baseline justify-between gap-2 text-xs"
                    >
                      <span className="text-fg-secondary">{b.etiqueta}</span>
                      <span className="tabular-nums text-fg">
                        {fmtMonto(b.total, b.moneda as "CRC" | "USD")}
                        {b.cuantos > 1 && (
                          <span className="ml-1 text-fg-muted">({b.cuantos} pagos)</span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
                {h.proximo && (
                  <div className="mt-2 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <p className="text-[11px] text-fg-muted">
                      El próximo caería en {h.proximo.etiqueta}
                      {/* El monto SUGERIDO sale de la última confirmada — un hecho, no un
                          promedio: la comisión sube con cuentas nuevas y baja con churn, y
                          promediar suaviza justo la señal que importa. Sin ninguna
                          confirmada no se sugiere nada, porque no habría de dónde. */}
                      {h.proximo.montoSugerido !== null && (
                        <>
                          {" · "}
                          <span className="text-fg-secondary tabular-nums">
                            ~{fmtMonto(h.proximo.montoSugerido, h.proximo.moneda as "CRC" | "USD")}
                          </span>{" "}
                          según la última confirmada ({fmtFecha(h.proximo.segun!)})
                        </>
                      )}
                    </p>
                    {h.proximo.montoSugerido !== null && (
                      <Button
                        variant="secondary"
                        size="xs"
                        onClick={() => {
                          setEditandoId(null);
                          setForm({
                            partner: h.nombre,
                            partnerId: h.partnerId ?? "",
                            concepto: `Comisión ${h.proximo!.etiqueta}`,
                            monto: String(h.proximo!.montoSugerido),
                            moneda: h.proximo!.moneda ?? "USD",
                            fecha: "",
                            clientId: "",
                            notas: `Estimada a partir de la comisión confirmada del ${h.proximo!.segun}.`,
                          });
                        }}
                      >
                        Anotar la próxima
                      </Button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {data.comisiones.length === 0 ? (
        <EmptyState
          title="Todavía no hay comisiones registradas"
          description="Registrá lo que cada aliado te paga y aparece acá, agrupado por partner."
        />
      ) : (
        <ComisionesDeAliado
          comisiones={data.comisiones}
          todayISO={todayISO}
          onCambio={refrescar}
          extraAcciones={(c: ComisionPartnerDTO) => (
            <>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => {
                  setEditandoId(c.id);
                  setForm({
                    partner: c.partner,
                    partnerId: c.partnerId ?? "",
                    concepto: c.concepto ?? "",
                    monto: String(c.monto),
                    moneda: c.moneda,
                    fecha: c.fecha,
                    clientId: c.clientId ?? "",
                    notas: c.notas ?? "",
                  });
                }}
              >
                Editar
              </Button>
              <Button variant="secondary" size="sm" onClick={() => borrar(c.id)}>
                Eliminar
              </Button>
            </>
          )}
        />
      )}

      {/* ── Aliados: quién nos paga y cada cuánto ─────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">Aliados</h2>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => setAliado({ id: null, nombre: "", frecuenciaMeses: "3", notas: "" })}
          >
            Nuevo aliado
          </Button>
        </div>
        {data.partners.length === 0 ? (
          <EmptyState
            title="Sin aliados configurados"
            description="Configurá cada cuánto te paga cada aliado y el historial se agrupa a esa frecuencia en vez de mes a mes."
          />
        ) : (
          <div className="rounded-xl border border-line bg-surface overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="bg-surface-muted border-b border-line">
                <tr>
                  <th className={TH}>Aliado</th>
                  <th className={TH}>Frecuencia</th>
                  <th className={TH}>Pagos ligados</th>
                  <th className={TH}></th>
                </tr>
              </thead>
              <tbody>
                {data.partners.map((p) => (
                  <tr key={p.id} className="border-b border-line last:border-b-0">
                    <td className={TD}>
                      {p.nombre}
                      {!p.activo && <span className="ml-1.5 text-fg-muted">· inactivo</span>}
                    </td>
                    <td className={`${TD} text-fg-secondary`}>{p.frecuenciaLabel}</td>
                    <td className={`${TD} text-fg-muted tabular-nums`}>{p.cuantasComisiones}</td>
                    <td className={`${TD} text-right whitespace-nowrap`}>
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() =>
                            setAliado({
                              id: p.id,
                              nombre: p.nombre,
                              frecuenciaMeses: String(p.frecuenciaMeses),
                              notas: p.notas ?? "",
                            })
                          }
                        >
                          Editar
                        </Button>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => setBorrandoAliado({ id: p.id, nombre: p.nombre })}
                        >
                          Borrar
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {borrandoAliado && (
        <ConfirmDialog
          open
          title={`¿Borrar ${borrandoAliado.nombre}?`}
          description="Sus pagos NO se borran: quedan con el nombre escrito. Lo que se pierde es la frecuencia, y su historial vuelve a leerse mes a mes."
          confirmLabel="Borrar aliado"
          onCancel={() => setBorrandoAliado(null)}
          onConfirm={async () => {
            const id = borrandoAliado.id;
            setBorrandoAliado(null);
            await borrarAliado(id);
          }}
        />
      )}

      {aliado && (
        <Modal
          open
          onClose={() => setAliado(null)}
          title={aliado.id ? "Editar aliado" : "Nuevo aliado"}
          description="Cada cuánto te paga. Con eso el historial se agrupa a su ritmo y Nexus sabe cuándo esperar el próximo."
        >
          <div className="space-y-3">
            <Field label="Nombre">
              <Input
                value={aliado.nombre}
                onChange={(e) => setAliado({ ...aliado, nombre: e.target.value })}
                placeholder="Ej. HubSpot"
              />
            </Field>
            <Field label="Frecuencia">
              <Select
                value={aliado.frecuenciaMeses}
                onChange={(e) => setAliado({ ...aliado, frecuenciaMeses: e.target.value })}
              >
                {FRECUENCIAS_PARTNER.map((f) => (
                  <option key={f.meses} value={String(f.meses)}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Notas">
              <Input
                value={aliado.notas}
                onChange={(e) => setAliado({ ...aliado, notas: e.target.value })}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-1">
              <Button variant="secondary" onClick={() => setAliado(null)}>
                Cancelar
              </Button>
              <Button onClick={guardarAliado} disabled={guardando || !aliado.nombre.trim()}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}

      {form && (
        <Modal
          open
          onClose={() => {
            setForm(null);
            setEditandoId(null);
          }}
          title={editandoId ? "Editar comisión" : "Registrar comisión de partner"}
          description="Lo que te pagó un aliado comercial. Si el aliado no está en la cartera, dejá el cliente vacío."
        >
          <div className="space-y-3">
            <Field
              label="Aliado"
              hint="Si lo elegís de la lista, el pago hereda su frecuencia y entra al historial con esa cadencia."
            >
              <Select
                value={form.partnerId}
                onChange={(e) => {
                  const p = data.partners.find((x) => x.id === e.target.value);
                  // Elegir un aliado también completa el nombre: el string es el
                  // snapshot de la fila y tiene que decir lo mismo que el vínculo.
                  setForm({
                    ...form,
                    partnerId: e.target.value,
                    partner: p ? p.nombre : form.partner,
                  });
                }}
              >
                <option value="">Sin aliado configurado — escribí el nombre abajo</option>
                {data.partners.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nombre} · {p.frecuenciaLabel}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Nombre del partner">
              <Input
                value={form.partner}
                onChange={(e) => setForm({ ...form, partner: e.target.value })}
                placeholder="Ej. HubSpot"
              />
            </Field>
            <Field label="Concepto">
              <Input
                value={form.concepto}
                onChange={(e) => setForm({ ...form, concepto: e.target.value })}
                placeholder="Ej. Comisión Q1"
              />
            </Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Monto">
                <Input
                  value={form.monto}
                  onChange={(e) => setForm({ ...form, monto: e.target.value })}
                  inputMode="decimal"
                />
              </Field>
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
              <Field label="Fecha">
                <Input
                  type="date"
                  value={form.fecha}
                  onChange={(e) => setForm({ ...form, fecha: e.target.value })}
                />
              </Field>
            </div>
            <Field label="Cliente (opcional)" hint="Solo si el aliado ya existe en la cartera.">
              <Select
                value={form.clientId}
                onChange={(e) => setForm({ ...form, clientId: e.target.value })}
              >
                <option value="">Sin ligar a un cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.kind === "ALIADO" ? " (aliado)" : ""}
                  </option>
                ))}
              </Select>
            </Field>
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
              <Button onClick={guardar} disabled={guardando || !form.partner.trim()}>
                {guardando ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
