"use client";

/**
 * CompartirEstadoDeCuenta — «Compartir estado de cuenta» en la cuenta de Cobranza (pedido 17, 2026-11-13). Crea,
 * copia, extiende y revoca el enlace con que la persona de finanzas del cliente ve SU estado de cuenta en vivo
 * (/external/estado-de-cuenta/[token]). Solo lo dibuja quien edita Cobranza; el permiso de verdad lo exige la ruta.
 * Datos: /api/cobranza/cuentas/[cuentaId]/estado-de-cuenta. Lo que ve el cliente lo decide
 * lib/external/estado-de-cuenta-view.ts.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Modal, useToast } from "@/components/ui";
import { BOTON_DE_HERRAMIENTA, BotonAzul, BotonBlanco, BotonEnlace } from "@/components/ui/sistema";
import type { EnlaceDelEstadoDeCuenta } from "@/lib/cobranza/estado-de-cuenta-compartir";
import { DIAS_DE_VIGENCIA } from "@/lib/cobranza/estado-de-cuenta";
import { crDateParts } from "@/lib/jobs/time";
import { fmtFecha } from "./format";

/** Un instante, como el día de Costa Rica en que cayó. */
const dia = (iso: string | null) => (iso ? fmtFecha(crDateParts(new Date(iso)).dateKey) : "—");

const PUNTO = { activo: "bg-success-ink", vencido: "bg-warn-ink", revocado: "bg-warn-ink" } as const;
const NOMBRE = { activo: "activo", vencido: "vencido", revocado: "revocado", "sin-generar": "sin crear" } as const;

export default function CompartirEstadoDeCuenta({ cuentaId, tituloCls }: { cuentaId: string; tituloCls: string }) {
  const toast = useToast();
  const [enlace, setEnlace] = useState<EnlaceDelEstadoDeCuenta | null>(null);
  const [abierto, setAbierto] = useState(false);
  const [trabajando, setTrabajando] = useState(false);
  const [revocando, setRevocando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pedir = useCallback(
    async (method: "GET" | "POST" | "DELETE", body?: { accion: "extender" }) => {
      const r = await fetch(`/api/cobranza/cuentas/${cuentaId}/estado-de-cuenta`, {
        method,
        cache: "no-store",
        headers: body ? { "Content-Type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const j = (await r.json().catch(() => null)) as (EnlaceDelEstadoDeCuenta & { error?: string }) | null;
      if (!r.ok || !j) throw new Error(j?.error ?? "No se pudo hacer el cambio.");
      return j;
    },
    [cuentaId],
  );

  useEffect(() => {
    let vivo = true;
    pedir("GET")
      .then((j) => vivo && setEnlace(j))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudo leer el enlace."));
    return () => {
      vivo = false;
    };
  }, [pedir]);

  const hacer = async (method: "POST" | "DELETE", body?: { accion: "extender" }) => {
    setTrabajando(true);
    setError(null);
    setRevocando(false);
    try {
      setEnlace(await pedir(method, body));
      if (body?.accion === "extender") toast.success(`Listo: el enlace abre ${DIAS_DE_VIGENCIA} días más, con la misma dirección.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo hacer el cambio.");
    } finally {
      setTrabajando(false);
    }
  };

  const copiar = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Enlace copiado.");
    } catch {
      toast.error("No se pudo copiar: selecciónalo y cópialo a mano.");
    }
  };

  const estado = enlace?.estado ?? "sin-generar";
  const punto = estado === "sin-generar" ? null : PUNTO[estado];

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className={tituloCls}>Estado de cuenta para el cliente</h3>
          <p className="mt-1 text-xs text-fg-muted">
            Un enlace para su persona de finanzas: lo facturado, lo pagado y lo vencido, al día. Nada interno.
          </p>
        </div>
        <button
          type="button"
          disabled={!enlace && !error}
          onClick={() => setAbierto(true)}
          className={BOTON_DE_HERRAMIENTA}
          title={`Enlace del estado de cuenta: ${NOMBRE[estado]}`}
        >
          {punto && <span className={`h-2 w-2 flex-shrink-0 rounded-full ${punto}`} aria-hidden="true" />}
          Compartir estado de cuenta
        </button>
      </div>

      <Modal
        open={abierto}
        onClose={() => {
          setAbierto(false);
          setRevocando(false);
        }}
        title="Compartir estado de cuenta"
        description="Una página con lo facturado, lo pagado, lo pendiente y lo vencido de esta cuenta, por moneda, y sus facturas. Se actualiza sola. Quien tenga el enlace la ve: no muestra notas, promesas, alertas ni responsables."
      >
        <div className="space-y-3">
          {error && <Alert variant="danger">{error}</Alert>}
          {estado === "vencido" && (
            <Alert variant="warning">
              Este enlace venció el {dia(enlace?.venceEn ?? null)}: quien lo abre ve que venció. Extiéndelo para que vuelva a abrir con la misma dirección.
            </Alert>
          )}
          {enlace?.enlace && (
            <>
              <input
                readOnly
                value={enlace.enlace}
                aria-label="Enlace para el cliente"
                onFocus={(e) => e.target.select()}
                className="w-full rounded-md border border-line bg-surface-muted px-2.5 py-1.5 text-[13px] text-fg-secondary"
              />
              <p className="text-xs text-fg-muted">
                {estado === "activo" && `Abre hasta el ${dia(enlace.venceEn)}. `}
                {enlace.creadoPor ? `Lo creó ${enlace.creadoPor} el ${dia(enlace.creadoEn)}. ` : ""}
                {enlace.ultimaVista
                  ? `Se abrió ${enlace.vistas} ${enlace.vistas === 1 ? "vez" : "veces"}; la última, el ${dia(enlace.ultimaVista)}.`
                  : "Todavía nadie lo ha abierto."}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {estado === "activo" && <BotonAzul onClick={() => void copiar(enlace.enlace!)}>Copiar enlace</BotonAzul>}
                {estado === "activo" && (
                  <a href={enlace.enlace} target="_blank" rel="noreferrer" className={BOTON_DE_HERRAMIENTA}>
                    Ver lo que ve el cliente
                  </a>
                )}
                <BotonBlanco disabled={trabajando} onClick={() => void hacer("POST", { accion: "extender" })}>
                  Extender {DIAS_DE_VIGENCIA} días
                </BotonBlanco>
                {!revocando && <BotonEnlace onClick={() => setRevocando(true)}>Revocar el enlace</BotonEnlace>}
              </div>
              {revocando && (
                <div className="flex flex-wrap items-center gap-2 rounded-lg border border-line bg-surface-muted px-3 py-2">
                  <p className="text-[13px] text-fg-secondary">El enlace dejará de abrir para quien ya lo tiene, y uno nuevo será otra dirección.</p>
                  <BotonBlanco disabled={trabajando} onClick={() => void hacer("DELETE")}>
                    Sí, revocar
                  </BotonBlanco>
                  <BotonEnlace onClick={() => setRevocando(false)}>Cancelar</BotonEnlace>
                </div>
              )}
            </>
          )}
          {enlace && !enlace.enlace && (
            <div className="flex flex-wrap items-center gap-2">
              {estado === "revocado" && <p className="text-xs text-fg-muted">El enlace anterior ya no abre. El nuevo será otra dirección.</p>}
              <BotonAzul disabled={trabajando} onClick={() => void hacer("POST")}>
                {estado === "revocado" ? "Crear un enlace nuevo" : "Crear el enlace"}
              </BotonAzul>
              <p className="w-full text-xs text-fg-muted">Abre {DIAS_DE_VIGENCIA} días; después lo puedes extender sin cambiar la dirección.</p>
            </div>
          )}
        </div>
      </Modal>
    </section>
  );
}
