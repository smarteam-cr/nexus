"use client";

/**
 * components/finanzas/caja/DondeEstaLaPlata.tsx — la pantalla de la caja (2026-11-13).
 *
 * Responde, de arriba abajo: cuánto hay hoy en los bancos, cuánto está apartado, cuánto quedará libre al cierre del año
 * y si alcanza; qué se paga esta semana y la próxima según la política; y, si no alcanza, en qué orden pagar. Cada
 * número dice qué mide y de dónde sale (el ⓘ). La cuenta la arma el servidor (lib/finanzas/caja/): acá no se calcula.
 *
 * ⚠ La fecha de hoy viene del servidor (día de Costa Rica): el navegador podría estar en otro día.
 */
import { useState } from "react";
import { fetchJson } from "@/lib/api/fetch-json";
import { useToast } from "@/components/ui/Toast";
import { Alert, Button, EmptyState, Field, InfoHint, Input, Modal, PageHeader, Segmentado } from "@/components/ui";
import { fmtDiaMes, fmtMonto } from "@/components/cobranza/format";
import type { CajaDTO, CompromisoDTO, CuentaDeBancoDTO } from "@/lib/finanzas/caja/caja-server";
import { ETIQUETA_DE_CATEGORIA, ETIQUETA_DE_ESTADO, REGLA_DE_ESCENARIO } from "@/lib/finanzas/caja/politica";
import { ETIQUETA_DE_RUBRO, RUBROS_ENTRA, RUBROS_SALE, type TotalesMoneda } from "@/lib/finanzas/caja/proyeccion";
import { ETIQUETA_DE_NIVEL } from "@/lib/finanzas/caja/prioridad";
import { Cifra, DosMonedas, Seccion, fmtUsd } from "./piezas";
import FormularioDeCompromiso, { type DatosDelFormulario } from "./FormularioDeCompromiso";

interface Props {
  initial: CajaDTO;
  puedeEditar: boolean;
}

const API = "/api/finanzas/caja";

function hora(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Costa_Rica" });
}

function quien(email: string): string {
  return email.split("@")[0];
}

/** El desglose de un total por rubro, para el título de la celda. */
function desglose(rubros: readonly string[], porRubro: Record<string, TotalesMoneda>): string {
  return rubros
    .map((r) => {
      const t = porRubro[r];
      const partes = (["USD", "CRC"] as const).filter((m) => t[m] !== 0).map((m) => fmtMonto(t[m], m));
      return partes.length ? `${ETIQUETA_DE_RUBRO[r as keyof typeof ETIQUETA_DE_RUBRO]}: ${partes.join(" + ")}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

export default function DondeEstaLaPlata({ initial, puedeEditar }: Props) {
  const toast = useToast();
  const [caja, setCaja] = useState(initial);
  const [saldoDe, setSaldoDe] = useState<CuentaDeBancoDTO | null>(null);
  const [cuentaNueva, setCuentaNueva] = useState(false);
  const [form, setForm] = useState<{ inicial: CompromisoDTO | null; tipo: "PAGO" | "RESERVA" } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const p = caja.proyeccion;
  const tc = caja.tipoDeCambio;
  const conTc = (t: TotalesMoneda) => (tc ? fmtUsd(t.USD + t.CRC / tc.crcPorUsd) : null);

  async function refrescar() {
    try {
      const d = await fetchJson<{ caja: CajaDTO }>(API);
      setCaja(d.caja);
    } catch {
      toast.error("No se pudo actualizar la pantalla. Recarga la página.");
    }
  }

  async function enviar(url: string, method: "POST" | "PATCH", body: unknown, ok: string) {
    setOcupado(true);
    try {
      await fetchJson(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      toast.success(ok);
      await refrescar();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "No se pudo guardar.");
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function guardarCompromiso(d: DatosDelFormulario) {
    const editando = form?.inicial;
    const url = editando ? `${API}/compromisos/${editando.id}` : `${API}/compromisos`;
    const body = editando ? { accion: "editar", datos: d } : d;
    // El formulario muestra el error si falla: por eso acá se lanza en vez de solo avisar.
    await fetchJson(url, { method: editando ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    toast.success(d.tipo === "RESERVA" ? "Plata apartada." : "Pago anotado.");
    setForm(null);
    await refrescar();
  }

  const pagos = caja.compromisos.filter((c) => c.tipo === "PAGO" && c.estado === "PENDIENTE");
  const reservas = caja.compromisos.filter((c) => c.tipo === "RESERVA" && c.estado === "PENDIENTE");
  const pagadosHace = caja.compromisos.filter((c) => c.estado === "PAGADO");
  const faltante = p.primerFaltante;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Dónde está la plata"
        description="Lo que hay hoy en los bancos, lo que va a entrar y salir hasta el cierre del año, y los pagos de cada semana."
        action={
          puedeEditar ? (
            <Button variant={caja.revision.hoy ? "secondary" : "primary"} size="lg" disabled={ocupado} onClick={() => enviar(`${API}/revision`, "POST", {}, "Anotado: la caja de hoy está revisada.")}>
              {caja.revision.hoy ? "Revisada hoy" : "Marcar la caja de hoy como revisada"}
            </Button>
          ) : undefined
        }
      />

      <p className="text-[13px] text-fg-secondary">
        {caja.revision.hoy
          ? `Revisada hoy por ${quien(caja.revision.hoy.por)} a las ${hora(caja.revision.hoy.en)}.`
          : caja.revision.ultima
            ? `Hoy nadie la ha revisado. La última revisión fue el ${fmtDiaMes(caja.revision.ultima.fechaISO)}, de ${quien(caja.revision.ultima.por)}.`
            : "Nadie la ha revisado todavía. La revisión es diaria: mira los saldos, los pagos de la semana y si alcanza."}
      </p>

      {p.cuentasSinSaldo.length > 0 && (
        <Alert variant="warning">
          {p.cuentasSinSaldo.length === 1 ? "Una cuenta no tiene saldo" : `${p.cuentasSinSaldo.length} cuentas no tienen saldo`} ({p.cuentasSinSaldo.join(", ")}): cuentan
          como cero hasta que se cargue. Todo lo de abajo queda corto.
        </Alert>
      )}

      {/* ── Los cuatro números ── */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Cifra
          titulo="En los bancos hoy"
          explicacion={`La suma del último saldo de cada cuenta. Mercury lo trae solo cada día (el disponible, que descuenta lo enviado que todavía no se asentó); las demás, el último que se cargó a mano.${tc ? ` En dólares, los colones pasan con el tipo de cambio de venta del BCCR del ${fmtDiaMes(tc.fechaISO)} (₡${tc.crcPorUsd.toLocaleString("es-CR")}).` : ""}`}
          valor={conTc(p.saldoHoy) ?? <DosMonedas t={p.saldoHoy} />}
          detalle={tc ? <DosMonedas t={p.saldoHoy} className="flex-row gap-2" /> : undefined}
        />
        <Cifra
          titulo="Apartado"
          explicacion="Las reservas: plata que ya tiene destino (por ejemplo, para diciembre). Deja de contar como libre desde hoy, aunque salga del banco el día que es para."
          valor={conTc(p.apartadoHoy) ?? <DosMonedas t={p.apartadoHoy} />}
          detalle={`${reservas.length === 1 ? "1 reserva" : `${reservas.length} reservas`}. Libre hoy: ${conTc(p.libreHoy) ?? "en dos monedas"}`}
        />
        <Cifra
          titulo={p.llegaAlCierre ? "Libre al cierre del año" : `Libre al ${fmtDiaMes(p.hastaISO)}`}
          explicacion={`Lo libre hoy, más lo que falta cobrar a los clientes (la misma proyección de la caja neta) y las comisiones de aliados por cobrar, menos la planilla, las herramientas y los costos fijos recurrentes, los gastos anotados, los pagos comprometidos y las comisiones de vendedor, hasta el ${fmtDiaMes(p.hastaISO)}. No cuenta lo vencido ni lo que falta facturar: está abajo, aparte.`}
          valor={p.alCierre.libreEnUsd !== null ? fmtUsd(p.alCierre.libreEnUsd) : <DosMonedas t={p.alCierre.libre} />}
          detalle={p.alCierre.libreEnUsd !== null ? <DosMonedas t={p.alCierre.libre} className="flex-row gap-2" /> : undefined}
          tono={p.alCierre.libreEnUsd !== null && p.alCierre.libreEnUsd < 0 ? "mal" : "normal"}
        />
        <Cifra
          titulo="¿Alcanza?"
          explicacion="Mira quincena por quincena si lo libre queda bajo cero, juntando las dos monedas en dólares (o cada una por su lado si no hay tipo de cambio)."
          valor={faltante ? `Falta en ${faltante.etiqueta}` : "Alcanza"}
          detalle={faltante ? `Quedaría ${faltante.libreEnUsd !== null ? fmtUsd(faltante.libreEnUsd) : "bajo cero"}. Abajo, el orden en que se paga.` : `Hasta el ${fmtDiaMes(p.hastaISO)}, sin quedar bajo cero.`}
          tono={faltante ? "mal" : "bien"}
        />
      </div>

      {/* ── Cuentas ── */}
      <Seccion
        titulo="Las cuentas"
        explicacion="El saldo de cada cuenta de banco. Mercury se lee solo con su copia diaria; las demás se cargan a mano, con su fecha. Un saldo de más de 3 días se marca: lo que pasó después no está en la cuenta."
        accion={
          puedeEditar ? (
            <Button size="sm" variant="secondary" onClick={() => setCuentaNueva(true)}>
              Agregar cuenta
            </Button>
          ) : undefined
        }
      >
        {caja.cuentas.length === 0 ? (
          <EmptyState title="No hay cuentas" description="Agrega las cuentas de banco para empezar con su saldo." />
        ) : (
          <div className="divide-y divide-line">
            {caja.cuentas.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <div className="flex min-w-0 flex-[1_1_220px] flex-col">
                  <span className="text-sm font-medium text-fg">{c.nombre}</span>
                  <span className="text-xs text-fg-muted">
                    {c.origen === "MERCURY" ? "Mercury, automático" : "A mano"}
                    {c.sociedad ? ` · ${c.sociedad}` : ""}
                  </span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-sm font-semibold tabular-nums text-fg">{c.saldo === null ? "Sin saldo" : fmtMonto(c.saldo, c.moneda)}</span>
                  {c.saldoContable !== null && c.saldoContable !== c.saldo && (
                    <span className="text-xs tabular-nums text-fg-muted" title="El saldo contable de Mercury: incluye lo enviado que todavía no se asentó.">
                      Contable {fmtMonto(c.saldoContable, c.moneda)}
                    </span>
                  )}
                </div>
                <span className={`w-28 text-right text-xs ${c.viejo ? "text-warn-ink" : "text-fg-muted"}`}>
                  {c.fechaISO ? (c.diasDelSaldo === 0 ? "Hoy" : `Al ${fmtDiaMes(c.fechaISO)}`) : "—"}
                  {c.viejo ? " · viejo" : ""}
                </span>
                {puedeEditar && c.origen === "MANUAL" && (
                  <Button size="xs" variant="secondary" onClick={() => setSaldoDe(c)}>
                    Cargar saldo
                  </Button>
                )}
              </div>
            ))}
          </div>
        )}
      </Seccion>

      {/* ── Pagos de la semana ── */}
      {caja.semanas.map((s) => (
        <Seccion
          key={s.desdeISO}
          titulo={s.esLaDeHoy ? `Pagos de esta semana (${fmtDiaMes(s.desdeISO)} al ${fmtDiaMes(s.hastaISO)})` : `La próxima semana (${fmtDiaMes(s.desdeISO)} al ${fmtDiaMes(s.hastaISO)})`}
          explicacion="Según la política aprobada: servicios profesionales y outsourcing facturan del 1 al 3 y se pagan el 7 si el cliente ya pagó; artículos físicos los viernes, con corte el miércoles y hasta 50 % de adelanto; comisionistas, mes vencido. Más la planilla de la quincena (sumada), las comisiones de vendedor y los gastos anotados con día. Las herramientas y costos fijos no van acá: no tienen día anotado."
          accion={<DosMonedas t={s.total} className="items-end text-sm font-semibold" />}
        >
          {s.pagos.length === 0 && s.esperando.length === 0 ? (
            <p className="text-[13px] text-fg-muted">Nada que pagar esta semana.</p>
          ) : (
            <div className="divide-y divide-line">
              {s.pagos.map((x) => (
                <div key={x.clave} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                  <span className={`w-16 text-xs ${x.atrasado ? "font-semibold text-danger-ink" : "text-fg-secondary"}`}>{x.atrasado ? "Atrasado" : fmtDiaMes(x.fechaISO)}</span>
                  <div className="flex min-w-0 flex-[1_1_240px] flex-col">
                    <span className="text-sm text-fg">
                      {x.concepto}
                      {x.beneficiario ? <span className="text-fg-muted"> · {x.beneficiario}</span> : null}
                    </span>
                    <span className="text-xs text-fg-muted">
                      {x.tipo} · {x.porQue}
                    </span>
                  </div>
                  <span className="text-sm font-semibold tabular-nums text-fg">{fmtMonto(x.monto, x.moneda)}</span>
                  {puedeEditar && x.compromisoId && (
                    <Button
                      size="xs"
                      variant="secondary"
                      disabled={ocupado}
                      onClick={() =>
                        enviar(
                          `${API}/compromisos/${x.compromisoId}`,
                          "PATCH",
                          { accion: x.parte === "ADELANTO" ? "pagarAdelanto" : "pagar", fecha: caja.hoyISO },
                          x.parte === "ADELANTO" ? "Adelanto marcado como pagado." : "Marcado como pagado.",
                        )
                      }
                    >
                      {x.parte === "ADELANTO" ? "Adelanto pagado" : "Pagado"}
                    </Button>
                  )}
                </div>
              ))}
              {s.esperando.length > 0 && (
                <div className="pt-2.5">
                  <span className="text-xs font-semibold text-fg-muted">Esperando algo para poder pagarse</span>
                  {s.esperando.map((x) => (
                    <div key={x.clave} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                      <span className="w-16 text-xs text-fg-muted">~{fmtDiaMes(x.fechaEstimadaISO)}</span>
                      <span className="min-w-0 flex-[1_1_240px] text-[13px] text-fg-secondary">
                        {x.concepto} · {ETIQUETA_DE_ESTADO[x.estado]}. {x.porQue}
                      </span>
                      <span className="text-[13px] tabular-nums text-fg-secondary">{fmtMonto(x.monto, x.moneda)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </Seccion>
      ))}

      {/* ── Si no alcanza ── */}
      {caja.orden && faltante && (
        <Seccion
          titulo={`La plata no alcanza en ${faltante.etiqueta}: este es el orden de pago`}
          explicacion="Primero la planilla, después los impuestos y las cargas sociales, después los proveedores y demás pagos, y las herramientas al final; dentro de cada nivel, lo que vence antes. El orden es estricto: si un pago no alcanza, los de después tampoco se pagan, aunque uno más chico entrara. Lo disponible es lo libre de hoy más lo que entra hasta esa quincena."
        >
          <p className="text-[13px] text-fg-secondary">
            Disponible hasta {faltante.etiqueta}: {caja.orden.disponibleEnUsd !== null ? fmtUsd(caja.orden.disponibleEnUsd) : <DosMonedas t={caja.orden.disponible} />}. Falta:{" "}
            {caja.orden.faltanteEnUsd !== null ? fmtUsd(caja.orden.faltanteEnUsd) : <DosMonedas t={caja.orden.faltante} />}.
          </p>
          <div className="divide-y divide-line">
            {caja.orden.pagos.map((x, i) => {
              const nuevoNivel = i === 0 || caja.orden!.pagos[i - 1].nivel !== x.nivel;
              return (
                <div key={`${x.corteKey}:${x.concepto}:${i}`}>
                  {nuevoNivel && <div className="pb-1 pt-3 text-xs font-semibold text-fg-muted">{ETIQUETA_DE_NIVEL[x.nivel]}</div>}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 py-1.5">
                    <span className={`w-20 text-xs font-semibold ${x.alcanza ? "text-success-ink" : "text-danger-ink"}`}>{x.alcanza ? "Alcanza" : "No alcanza"}</span>
                    <span className="min-w-0 flex-[1_1_240px] text-[13px] text-fg">
                      {x.concepto}
                      {x.fechaISO ? <span className="text-fg-muted"> · {fmtDiaMes(x.fechaISO)}</span> : null}
                    </span>
                    <span className="text-[13px] tabular-nums text-fg">{fmtMonto(x.monto, x.moneda)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Seccion>
      )}

      {/* ── Quincena por quincena ── */}
      <Seccion
        titulo="Quincena por quincena hasta el cierre"
        explicacion="Los mismos cortes que la caja neta. Entra: cobros a clientes y comisiones de aliados. Sale: planilla, impuestos, pagos comprometidos, comisiones de vendedor, gastos anotados, costos fijos y herramientas (pasa el mouse por la cifra para ver el detalle). Lo libre al final ya descuenta lo apartado. Lo vencido de la quincena anterior y no pagado se cuenta en la primera."
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-[13px]">
            <thead>
              <tr className="text-left text-xs text-fg-muted">
                <th className="py-2 pr-3 font-medium">Período</th>
                <th className="py-2 pr-3 text-right font-medium">Entra</th>
                <th className="py-2 pr-3 text-right font-medium">Sale</th>
                <th className="py-2 pr-3 text-right font-medium">Sale lo apartado</th>
                <th className="py-2 text-right font-medium">Libre al final</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {p.cortes.map((c) => (
                <tr key={c.key} className={faltante?.key === c.key ? "bg-danger-surface" : undefined}>
                  <td className="py-2 pr-3 text-fg">{c.etiqueta}</td>
                  <td className="py-2 pr-3 text-right" title={desglose(RUBROS_ENTRA, c.entra)}>
                    <DosMonedas t={c.entraTotal} className="items-end" />
                  </td>
                  <td className="py-2 pr-3 text-right" title={desglose(RUBROS_SALE, c.sale)}>
                    <DosMonedas t={c.saleTotal} className="items-end" />
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <DosMonedas t={c.reservasQueSalen} className="items-end" />
                  </td>
                  <td className="py-2 text-right font-semibold">
                    {c.libreEnUsd !== null ? <span className={c.libreEnUsd < 0 ? "text-danger-ink" : "text-fg"}>{fmtUsd(c.libreEnUsd)}</span> : <DosMonedas t={c.libreAlFinal} className="items-end" />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.fueraDelCierre > 0 && <p className="text-xs text-fg-muted">{p.fueraDelCierre} movimientos con fecha después del {fmtDiaMes(p.hastaISO)} no entran a la cuenta.</p>}
      </Seccion>

      {/* ── Pagos comprometidos y reservas ── */}
      <Seccion
        titulo="Pagos comprometidos y plata apartada"
        explicacion="Lo que ya se sabe que hay que pagar y no está en los recurrentes ni en los gastos (proveedores, impuestos, artículos), y la plata apartada. Cada pago trae cuándo sale según la política."
        accion={
          puedeEditar ? (
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setForm({ inicial: null, tipo: "RESERVA" })}>
                Apartar plata
              </Button>
              <Button size="sm" variant="primary" onClick={() => setForm({ inicial: null, tipo: "PAGO" })}>
                Anotar un pago
              </Button>
            </div>
          ) : undefined
        }
      >
        {pagos.length === 0 && reservas.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No hay pagos comprometidos ni plata apartada.</p>
        ) : (
          <div className="divide-y divide-line">
            {[...reservas, ...pagos].map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <div className="flex min-w-0 flex-[1_1_260px] flex-col">
                  <span className="text-sm text-fg">
                    {c.tipo === "RESERVA" ? "Apartado: " : ""}
                    {c.concepto}
                    {c.beneficiario ? <span className="text-fg-muted"> · {c.beneficiario}</span> : null}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {c.tipo === "RESERVA"
                      ? `Sale del banco el ${fmtDiaMes(c.fechaISO)}`
                      : `${ETIQUETA_DE_CATEGORIA[c.categoria]} · ${
                          c.proximaCuota
                            ? c.proximaCuota.fechaISO
                              ? `${c.proximaCuota.atrasado ? "Atrasado desde el" : "Se paga el"} ${fmtDiaMes(c.proximaCuota.fechaISO)}`
                              : `${ETIQUETA_DE_ESTADO[c.proximaCuota.estado]} (estimado ${fmtDiaMes(c.proximaCuota.fechaEstimadaISO)})`
                            : ""
                        }`}
                    {c.cobroEtiqueta ? ` · espera: ${c.cobroEtiqueta}` : ""}
                    {c.sociedad ? ` · ${c.sociedad}` : ""}
                  </span>
                </div>
                <span className="text-sm font-semibold tabular-nums text-fg">{fmtMonto(c.monto, c.moneda)}</span>
                {puedeEditar && (
                  <div className="flex gap-1.5">
                    <Button size="xs" variant="secondary" onClick={() => setForm({ inicial: c, tipo: c.tipo })}>
                      Editar
                    </Button>
                    {c.tipo === "PAGO" && (
                      <Button size="xs" variant="secondary" disabled={ocupado} onClick={() => enviar(`${API}/compromisos/${c.id}`, "PATCH", { accion: "pagar", fecha: caja.hoyISO }, "Marcado como pagado.")}>
                        Pagado
                      </Button>
                    )}
                    <Button size="xs" variant="destructive" disabled={ocupado} onClick={() => enviar(`${API}/compromisos/${c.id}`, "PATCH", { accion: "anular" }, c.tipo === "RESERVA" ? "Reserva liberada." : "Pago anulado.")}>
                      {c.tipo === "RESERVA" ? "Liberar" : "Anular"}
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
        {pagadosHace.length > 0 && (
          <details className="text-[13px]">
            <summary className="cursor-pointer text-fg-secondary">Pagados en los últimos 30 días ({pagadosHace.length})</summary>
            <div className="mt-2 divide-y divide-line">
              {pagadosHace.map((c) => (
                <div key={c.id} className="flex flex-wrap items-center gap-x-4 py-1.5 text-fg-secondary">
                  <span className="w-16 text-xs">{fmtDiaMes(c.pagadoISO)}</span>
                  <span className="min-w-0 flex-[1_1_240px]">{c.concepto}</span>
                  <span className="tabular-nums">{fmtMonto(c.monto, c.moneda)}</span>
                  {puedeEditar && (
                    <Button size="xs" variant="secondary" disabled={ocupado} onClick={() => enviar(`${API}/compromisos/${c.id}`, "PATCH", { accion: "reabrir" }, "Vuelve a estar pendiente.")}>
                      No se pagó
                    </Button>
                  )}
                </div>
              ))}
            </div>
          </details>
        )}
      </Seccion>

      {/* ── Lo que no entra a la cuenta ── */}
      <Seccion
        titulo="Lo que no entra a la cuenta"
        explicacion="Plata que podría entrar pero no tiene fecha creíble. No suma a lo libre: si entra, mejora el cierre."
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              Vencido sin cobrar ({caja.aparte.vencidos.count})
              <InfoHint text="Facturas con el crédito ya consumido: el mismo «vencido» de Cobranza." />
            </span>
            <DosMonedas t={caja.aparte.vencidos.totales} className="text-sm font-semibold" />
          </div>
          <div className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              Atrasado sin facturar ({caja.aparte.porFacturar.count})
              <InfoHint text="Cuotas cuya fecha pasó y todavía no tienen factura: sin factura no hay fecha de pago." />
            </span>
            <DosMonedas t={caja.aparte.porFacturar.totales} className="text-sm font-semibold" />
          </div>
          <div className="space-y-1">
            <span className="flex items-center gap-1.5 text-xs text-fg-muted">
              Comisiones de aliados atrasadas ({caja.aparte.comisionesAtrasadas.count})
              <InfoHint text="Comisiones por cobrar cuya fecha ya pasó: Finanzas › Comisiones de aliados." />
            </span>
            <DosMonedas t={caja.aparte.comisionesAtrasadas.totales} className="text-sm font-semibold" />
          </div>
        </div>
      </Seccion>

      <Seccion titulo="La política de pagos" explicacion="Cómo se fecha cada pago comprometido. Cambiar la regla de los comisionistas es un ajuste de una línea en el código.">
        <ul className="space-y-1 text-[13px] text-fg-secondary">
          <li>
            <span className="font-medium text-fg">Servicios profesionales y outsourcing:</span> {REGLA_DE_ESCENARIO.A}
          </li>
          <li>
            <span className="font-medium text-fg">Artículos físicos:</span> {REGLA_DE_ESCENARIO.B}
          </li>
          <li>
            <span className="font-medium text-fg">Comisionistas:</span>{" "}
            {caja.comisionistasElDia7 ? REGLA_DE_ESCENARIO.A : `${REGLA_DE_ESCENARIO.MES_VENCIDO} El día 7 queda pendiente de que lo confirme Alex Arrieta.`}
          </li>
          <li>
            <span className="font-medium text-fg">Planilla, impuestos, herramientas y otros:</span> {REGLA_DE_ESCENARIO.FECHA_FIJA}
          </li>
        </ul>
      </Seccion>

      {saldoDe && (
        <SaldoModal
          cuenta={saldoDe}
          hoyISO={caja.hoyISO}
          onCerrar={() => setSaldoDe(null)}
          onGuardar={async (fecha, monto, nota) => {
            const ok = await enviar(`${API}/saldos`, "POST", { cuentaId: saldoDe.id, fecha, monto, nota }, "Saldo guardado.");
            if (ok) setSaldoDe(null);
          }}
        />
      )}
      {cuentaNueva && (
        <CuentaModal
          onCerrar={() => setCuentaNueva(false)}
          onGuardar={async (nombre, moneda, sociedad) => {
            const ok = await enviar(`${API}/cuentas`, "POST", { nombre, moneda, sociedad }, "Cuenta agregada.");
            if (ok) setCuentaNueva(false);
          }}
        />
      )}
      {form && (
        <FormularioDeCompromiso
          abierto
          inicial={form.inicial}
          tipoNuevo={form.tipo}
          cobros={caja.cobrosParaAtar}
          comisionistasElDia7={caja.comisionistasElDia7}
          onCerrar={() => setForm(null)}
          onGuardar={guardarCompromiso}
        />
      )}
    </div>
  );
}

function SaldoModal({
  cuenta,
  hoyISO,
  onCerrar,
  onGuardar,
}: {
  cuenta: CuentaDeBancoDTO;
  hoyISO: string;
  onCerrar: () => void;
  onGuardar: (fecha: string, monto: number, nota: string | null) => Promise<void>;
}) {
  const [fecha, setFecha] = useState(hoyISO);
  const [monto, setMonto] = useState("");
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal
      open
      onClose={onCerrar}
      title={`Saldo de ${cuenta.nombre}`}
      description="El saldo disponible ese día, como lo dice el banco. Uno por día: si ya había uno, lo corrige."
      footer={
        <div className="flex items-center justify-end gap-2">
          {error && <span className="mr-auto text-xs text-danger-ink">{error}</span>}
          <Button variant="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button
            variant="primary"
            onClick={() => {
              const n = Number(monto.replace(/,/g, ""));
              if (!monto.trim() || !Number.isFinite(n)) return setError("Escribe el saldo.");
              if (!fecha) return setError("Elige la fecha.");
              void onGuardar(fecha, n, nota.trim() || null);
            }}
          >
            Guardar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={`Saldo (${cuenta.moneda === "USD" ? "dólares" : "colones"})`} required>
            <Input value={monto} onChange={(e) => setMonto(e.target.value)} inputMode="decimal" placeholder="0" autoFocus />
          </Field>
          <Field label="Al día" required>
            <Input type="date" value={fecha} max={hoyISO} onChange={(e) => setFecha(e.target.value)} />
          </Field>
        </div>
        <Field label="Nota">
          <Input value={nota} onChange={(e) => setNota(e.target.value)} placeholder="Opcional" />
        </Field>
      </div>
    </Modal>
  );
}

function CuentaModal({ onCerrar, onGuardar }: { onCerrar: () => void; onGuardar: (nombre: string, moneda: "CRC" | "USD", sociedad: string | null) => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  const [moneda, setMoneda] = useState<"CRC" | "USD">("CRC");
  const [sociedad, setSociedad] = useState("");
  return (
    <Modal
      open
      onClose={onCerrar}
      title="Agregar una cuenta"
      description="Una cuenta cuyo saldo se carga a mano. Las de Mercury aparecen solas con su copia diaria."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onCerrar}>
            Cancelar
          </Button>
          <Button variant="primary" disabled={!nombre.trim()} onClick={() => void onGuardar(nombre.trim(), moneda, sociedad.trim() || null)}>
            Agregar
          </Button>
        </div>
      }
    >
      <div className="space-y-3">
        <Field label="Nombre" required>
          <Input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. BAC colones" autoFocus />
        </Field>
        <Field label="Moneda">
          <Segmentado
            etiqueta="Moneda"
            valor={moneda}
            onCambio={setMoneda}
            opciones={[
              { clave: "CRC", etiqueta: "Colones" },
              { clave: "USD", etiqueta: "Dólares" },
            ]}
          />
        </Field>
        <Field label="Sociedad" hint="La dueña de la cuenta, si aplica.">
          <Input value={sociedad} onChange={(e) => setSociedad(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

