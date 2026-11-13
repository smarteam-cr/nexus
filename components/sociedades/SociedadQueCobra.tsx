"use client";

/**
 * components/sociedades/SociedadQueCobra.tsx — qué sociedad de Smarteam le cobra a esta cuenta (2026-11-13).
 *
 * Casi todas siguen su vía (Odoo → CR Smarteam, Mercury → la LLC) y no hay nada que tocar. Una cuenta de Smart Agro,
 * que cobra con el mismo flujo de la principal, se elige acá. ⚠ No es a quién se le factura del lado del cliente (eso
 * son las «Sociedades que facturan», justo abajo).
 */
import { useCallback, useEffect, useState } from "react";
import { Selector } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { SociedadDeLaCuentaDTO } from "@/lib/sociedades/sociedades";

export default function SociedadQueCobra({
  cuentaId,
  puedeEditar,
  tituloCls,
}: {
  cuentaId: string;
  /** `cobranza.write`: decide qué se dibuja. El permiso de verdad lo exige el endpoint. */
  puedeEditar: boolean;
  tituloCls: string;
}) {
  const toast = useToast();
  const [d, setD] = useState<SociedadDeLaCuentaDTO | null>(null);

  const cargar = useCallback(async () => {
    const r = await fetchJson<SociedadDeLaCuentaDTO>(`/api/cobranza/cuentas/${cuentaId}/sociedad-propia`).catch(() => null);
    /* Sin esto la ficha anda igual: la cuenta sigue siendo de la sociedad de su vía. */
    setD(r);
  }, [cuentaId]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga un recurso remoto al montar; el estado cambia después del await
    void cargar();
  }, [cargar]);

  if (!d) return null;
  const activas = d.sociedades.filter((s) => s.activa);
  const efectiva = activas.find((s) => s.id === d.efectiva);
  const porVia = activas.find((s) => s.id === d.porSuVia);

  async function elegir(id: string) {
    try {
      await fetchJson(`/api/cobranza/cuentas/${cuentaId}/sociedad-propia`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sociedadId: id }),
      });
      toast.success(`Esta cuenta la cobra ${activas.find((s) => s.id === id)?.nombre ?? "la sociedad elegida"}.`);
      await cargar();
    } catch (e) {
      throw new Error(e instanceof ApiError ? e.message : "No se pudo cambiar la sociedad.");
    }
  }

  return (
    <section className="space-y-2">
      <h3 className={tituloCls}>Sociedad de Smarteam que cobra</h3>
      {puedeEditar ? (
        <Selector
          etiqueta="Sociedad de Smarteam que cobra"
          placeholder="Elige la sociedad"
          valor={d.efectiva}
          opciones={activas.map((s) => ({
            value: s.id,
            label: s.nombre,
            marca: s.id === d.porSuVia ? "la de su vía" : undefined,
          }))}
          onElegir={elegir}
        />
      ) : (
        <p className="text-sm text-fg">{efectiva?.nombre ?? "—"}</p>
      )}
      <p className="text-[11px] leading-4 text-fg-muted">
        {d.puesta
          ? `Elegida a mano. Por su vía de cobro sería ${porVia?.nombre ?? "la principal"}.`
          : `La de su vía de cobro. Cámbiala solo si esta cuenta la cobra otra sociedad (por ejemplo, Smart Agro).`}
      </p>
    </section>
  );
}
