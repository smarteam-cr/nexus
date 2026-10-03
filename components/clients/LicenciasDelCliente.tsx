"use client";

/**
 * components/clients/LicenciasDelCliente.tsx — las licencias de HubSpot del cliente (2026-10-02).
 *
 * Pedido de Liliana Moreno: fecha de compra, renovación, hubs y plan, y monto, con aviso con
 * anticipación. Lo que HubSpot Partner ya trae (plan, renovación, monto mensual por hub) se muestra
 * tal cual; la fecha de compra —que HubSpot no tiene— y lo que falta se carga a mano acá.
 */
import { useEffect, useState } from "react";
import { useToast } from "@/components/ui/Toast";
import { HUBS, NOMBRE_DEL_HUB, avisoDeRenovacion, type Hub, type LicenciaDeHub } from "@/lib/cs/licencias";

interface Datos {
  licencias: LicenciaDeHub[];
  datosDeHubspotAl: string | null;
  hoy: string;
}

interface Borrador {
  hub: Hub;
  plan: string;
  fechaCompra: string;
  fechaRenovacion: string;
  montoMensual: string;
  moneda: string;
}

const input = "w-full px-2 py-1 text-xs bg-surface border border-line rounded-md text-fg placeholder-fg-muted focus:outline-none focus:border-brand";

function fechaLarga(ymd: string | null): string {
  if (!ymd) return "—";
  return new Date(`${ymd}T12:00:00Z`).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" });
}

export default function LicenciasDelCliente({ clientId }: { clientId: string }) {
  const toast = useToast();
  const [datos, setDatos] = useState<Datos | null>(null);
  const [editando, setEditando] = useState<Borrador | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/clients/${clientId}/licencias`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null)
      .then((d) => {
        if (vivo) setDatos(d ?? { licencias: [], datosDeHubspotAl: null, hoy: new Date().toISOString().slice(0, 10) });
      });
    return () => {
      vivo = false;
    };
  }, [clientId]);

  if (!datos) return <div className="text-xs text-fg-muted">Cargando licencias…</div>;

  const editar = (l: LicenciaDeHub | null, hub?: Hub) =>
    setEditando({
      hub: l?.hub ?? hub ?? "marketing",
      plan: l?.plan ?? "",
      fechaCompra: l?.fechaCompra ?? "",
      fechaRenovacion: l?.fuenteRenovacion === "manual" ? (l.renovacion ?? "") : "",
      montoMensual: l?.montoMensual ? String(l.montoMensual) : "",
      moneda: l?.moneda ?? "",
    });

  const guardar = async () => {
    if (!editando) return;
    setGuardando(true);
    const r = await fetch(`/api/clients/${clientId}/licencias`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        hub: editando.hub,
        plan: editando.plan,
        fechaCompra: editando.fechaCompra || null,
        fechaRenovacion: editando.fechaRenovacion || null,
        montoMensual: editando.montoMensual ? Number(editando.montoMensual) : null,
        moneda: editando.moneda,
      }),
    }).catch(() => null);
    const d = r ? await r.json().catch(() => null) : null;
    setGuardando(false);
    if (!r?.ok) return toast.error(d?.error ?? "No se pudo guardar la licencia.");
    setDatos(d);
    setEditando(null);
  };

  const sinLicencia = HUBS.filter((h) => !datos.licencias.some((l) => l.hub === h));

  return (
    <div className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[11px] text-fg-muted">
          {datos.datosDeHubspotAl
            ? `Plan, renovación y monto vienen de HubSpot (copia del ${fechaLarga(datos.datosDeHubspotAl.slice(0, 10))}). La fecha de compra se carga a mano.`
            : "HubSpot no trae licencias de este cliente (Smarteam no administra su cuenta): cárgalas a mano."}
        </p>
      </div>

      {datos.licencias.length > 0 ? (
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-wider text-fg-muted">
              <th className="py-1 pr-2">Hub</th>
              <th className="py-1 pr-2">Plan</th>
              <th className="py-1 pr-2">Compra</th>
              <th className="py-1 pr-2">Renovación</th>
              <th className="py-1 pr-2">Monto mensual</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {datos.licencias.map((l) => {
              const aviso = avisoDeRenovacion(l.renovacion, datos.hoy);
              return (
                <tr key={l.hub} className="border-t border-line align-top">
                  <td className="py-1.5 pr-2 font-medium text-fg">{NOMBRE_DEL_HUB[l.hub]}</td>
                  <td className="py-1.5 pr-2 text-fg-secondary">{l.plan ?? "—"}</td>
                  <td className="py-1.5 pr-2 text-fg-secondary">{fechaLarga(l.fechaCompra)}</td>
                  <td className="py-1.5 pr-2 text-fg-secondary">
                    {fechaLarga(l.renovacion)}
                    {l.fuenteRenovacion === "manual" && <span className="ml-1 text-[10px] text-fg-muted">(a mano)</span>}
                    {aviso && (
                      <span className="ml-1.5 rounded-full border border-info-line bg-info-surface px-1.5 py-0.5 text-[10px] font-semibold text-info-ink">
                        en {aviso.dias} días
                      </span>
                    )}
                  </td>
                  <td className="py-1.5 pr-2 text-fg-secondary">
                    {l.montoMensual ? `${l.montoMensual.toLocaleString("es-CR")} ${l.moneda ?? ""}` : "—"}
                  </td>
                  <td className="py-1.5 text-right">
                    <button type="button" onClick={() => editar(l)} className="text-[11px] text-brand hover:underline">Editar</button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      ) : (
        <p className="text-xs text-fg-muted">Todavía no hay licencias cargadas.</p>
      )}

      {editando ? (
        <div className="rounded-lg border border-line bg-surface-muted p-3 space-y-2">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            <label className="block text-[10px] text-fg-muted">
              Hub
              <select className={input} value={editando.hub} onChange={(e) => setEditando({ ...editando, hub: e.target.value as Hub })}>
                {HUBS.map((h) => (
                  <option key={h} value={h}>{NOMBRE_DEL_HUB[h]}</option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] text-fg-muted">
              Fecha de compra
              <input type="date" className={input} value={editando.fechaCompra} onChange={(e) => setEditando({ ...editando, fechaCompra: e.target.value })} />
            </label>
            <label className="block text-[10px] text-fg-muted">
              Renovación (si HubSpot no la trae)
              <input type="date" className={input} value={editando.fechaRenovacion} onChange={(e) => setEditando({ ...editando, fechaRenovacion: e.target.value })} />
            </label>
            <label className="block text-[10px] text-fg-muted">
              Plan
              <input className={input} value={editando.plan} placeholder="Professional" onChange={(e) => setEditando({ ...editando, plan: e.target.value })} />
            </label>
            <label className="block text-[10px] text-fg-muted">
              Monto mensual
              <input className={input} inputMode="decimal" value={editando.montoMensual} onChange={(e) => setEditando({ ...editando, montoMensual: e.target.value })} />
            </label>
            <label className="block text-[10px] text-fg-muted">
              Moneda
              <input className={input} value={editando.moneda} placeholder="USD" onChange={(e) => setEditando({ ...editando, moneda: e.target.value })} />
            </label>
          </div>
          <p className="text-[10px] text-fg-muted">Lo que trae HubSpot manda: lo que cargas acá completa lo que falta.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditando(null)} className="text-xs px-3 py-1.5 rounded-lg border border-line text-fg-secondary hover:bg-surface-hover">Cancelar</button>
            <button type="button" onClick={guardar} disabled={guardando} className="text-xs font-semibold px-3 py-1.5 rounded-lg bg-brand text-primary-fg hover:bg-brand-dark disabled:opacity-50">
              {guardando ? "Guardando…" : "Guardar"}
            </button>
          </div>
        </div>
      ) : (
        sinLicencia.length > 0 && (
          <button type="button" onClick={() => editar(null, sinLicencia[0])} className="text-xs text-brand hover:underline">
            + Cargar una licencia a mano
          </button>
        )
      )}
      <p className="text-[10px] text-fg-muted">Nexus avisa en Éxito del cliente a 90, 60 y 30 días de cada renovación.</p>
    </div>
  );
}
