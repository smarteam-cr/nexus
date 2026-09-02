"use client";

/**
 * components/cobranza/DiferenciasOdoo.tsx
 *
 * Todo lo que no cuadra entre Nexus y Odoo, ordenado por plata. Es la agenda de la reunión
 * con el CFO: «son estas cosas, en este orden, y estas las decidís vos».
 *
 * Reusa `InconsistenciasPanel` **tal cual** —el mismo que ya usa el reporte de equilibrio—
 * porque recibe `Inconsistencia[]` y nada más. Lo que se agrega es lo que ese panel no tiene
 * y esta lista sí necesita: poder decir **«está bien así»**.
 *
 * ⚠ Por qué hace falta esa parte: el panel original no guarda estado a propósito, y eso sirve
 * cuando toda diferencia es un error. Acá NO lo es — Odoo tiene 82 clientes y Nexus 49
 * cuentas, hay notas de crédito que no corrigen ningún cobro, y va a haber redondeos que
 * alguien acepte. Sin poder cerrarlas, esas líneas vuelven en cada sesión y **a la tercera
 * nadie mira la lista**.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button, Input, Select, Spinner } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import InconsistenciasPanel from "@/components/finanzas/equilibrio/InconsistenciasPanel";
import type { Inconsistencia } from "@/lib/finanzas/inconsistencias";

interface Aceptada {
  clave: string;
  motivo: string;
  aceptadaPor: string;
  aceptadaEn: string;
}
interface Respuesta {
  inconsistencias: Inconsistencia[];
  aceptadas: Aceptada[];
  medido: { cobros: number; facturas: number; cuentasSinVinculo: number; cuentasTotales: number };
}

export default function DiferenciasOdoo() {
  const toast = useToast();
  const [data, setData] = useState<Respuesta | null>(null);
  const [cargando, setCargando] = useState(true);
  const [clave, setClave] = useState("");
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setData(await fetchJson<Respuesta>("/api/cobranza/odoo/diferencias"));
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudieron cargar las diferencias.");
    } finally {
      setCargando(false);
    }
  }, [toast]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = useCallback(
    async (body: Record<string, unknown>, exito: string) => {
      setGuardando(true);
      try {
        await fetchJson("/api/cobranza/odoo/diferencias", { method: "POST", body: JSON.stringify(body) });
        toast.success(exito);
        setClave("");
        setMotivo("");
        await cargar();
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
      } finally {
        setGuardando(false);
      }
    },
    [cargar, toast],
  );

  /* La moneda del panel es la que más plata mueve. Los montos NO se convierten: cada línea
     lleva su desglose por moneda en el detalle. */
  const moneda = useMemo(() => "USD", []);

  if (cargando && !data) {
    return (
      <div className="flex items-center gap-3 py-10 text-sm text-fg-muted">
        <Spinner /> Cruzando cobros con facturas…
      </div>
    );
  }
  if (!data) return null;

  const abiertas = data.inconsistencias.map((i) => i.codigo);

  return (
    <div className="space-y-4">
      <p className="text-xs text-fg-muted">
        Cruzado sobre {data.medido.cobros} cobros de Nexus y {data.medido.facturas} facturas de Odoo.{" "}
        {data.medido.cuentasSinVinculo > 0 && (
          <>
            Faltan emparejar {data.medido.cuentasSinVinculo} de {data.medido.cuentasTotales} cuentas, así que parte de
            lo de abajo se resuelve solo al emparejar.
          </>
        )}
      </p>

      <InconsistenciasPanel inconsistencias={data.inconsistencias} moneda={moneda} />

      {abiertas.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="text-sm font-medium text-fg">Marcar una línea como «está bien así»</div>
          {/* ⚠ El motivo es obligatorio: una aceptación sin razón escrita es indistinguible de
              un clic para sacarse la línea de encima, y a los tres meses nadie sabe cuál fue. */}
          <p className="mt-0.5 text-xs text-fg-muted">
            Se guarda con los números de hoy. Si el monto cambia, la línea vuelve sola — una aceptación no puede
            esconder un problema nuevo.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Select value={clave} onChange={(e) => setClave(e.target.value)} className="min-w-48 text-sm">
              <option value="">Elegí la línea…</option>
              {abiertas.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </Select>
            <Input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              placeholder="Por qué está bien así"
              className="min-w-64 flex-1 text-sm"
            />
            <Button
              size="sm"
              disabled={guardando || !clave || motivo.trim().length < 5}
              onClick={() => enviar({ accion: "aceptar", clave, motivo }, "Listo, esa línea queda cerrada.")}
            >
              {guardando ? "Guardando…" : "Está bien así"}
            </Button>
          </div>
        </div>
      )}

      {data.aceptadas.length > 0 && (
        <div className="rounded-lg border border-line bg-surface p-3">
          <div className="text-sm font-medium text-fg">Diferencias aceptadas ({data.aceptadas.length})</div>
          <div className="mt-1">
            {data.aceptadas.map((a) => (
              <div key={a.clave} className="flex items-start gap-3 border-b border-line py-2 last:border-0">
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-fg">{a.clave}</div>
                  <div className="text-xs text-fg-muted">
                    {a.motivo} · {a.aceptadaPor} · {a.aceptadaEn.slice(0, 10)}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={guardando}
                  onClick={() => enviar({ accion: "reabrir", clave: a.clave }, "Vuelve a la lista.")}
                >
                  Volver a abrir
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
