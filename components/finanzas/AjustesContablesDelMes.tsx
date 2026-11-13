"use client";

/**
 * components/finanzas/AjustesContablesDelMes.tsx — Cierre del mes › «Ajustes contables» (2026-11-13).
 *
 * Un mes con ajustes contables pendientes (períodos sin liquidar, IVA por rectificar, etiquetas mal puestas en Odoo)
 * queda marcado, para que su resultado no se lea como pérdida real. La marca la pone una persona; al lado, lo que Odoo
 * muestra del mes como indicio (lib/sociedades/ajustes-contables.ts). Odoo se lee al abrir: si no contesta, la marca
 * se puede poner igual.
 */
import { useCallback, useEffect, useState } from "react";
import { Button, Modal, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { fmtFecha } from "@/components/cobranza/format";
import type { MarcaDeAjustes, SenalContable } from "@/lib/sociedades/ajustes-contables";

interface Datos {
  marca: MarcaDeAjustes;
  senales: SenalContable[] | null;
  errorOdoo: string | null;
}

export default function AjustesContablesDelMes({ periodo, mes }: { periodo: string; mes: string }) {
  const toast = useToast();
  const [d, setD] = useState<Datos | null>(null);
  const [cargando, setCargando] = useState(true);
  const [marcando, setMarcando] = useState(false);
  const [nota, setNota] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      setD(await fetchJson<Datos>(`/api/finanzas/cierre/ajustes-contables?mes=${periodo}`));
    } catch {
      setD(null);
    } finally {
      setCargando(false);
    }
  }, [periodo]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  async function guardar(pendientes: boolean) {
    setOcupado(true);
    try {
      await fetchJson("/api/finanzas/cierre/ajustes-contables", {
        method: "POST",
        body: JSON.stringify({ periodo, pendientes, nota: pendientes ? nota : null }),
      });
      toast.success(pendientes ? `${mes[0]!.toUpperCase()}${mes.slice(1)} quedó marcado con ajustes contables pendientes.` : "Se quitó la marca.");
      setMarcando(false);
      setNota("");
      await cargar();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
    } finally {
      setOcupado(false);
    }
  }

  const marcado = !!d?.marca.pendientes;
  const senales = d?.senales ?? [];

  return (
    <section
      aria-label={`Ajustes contables de ${mes}`}
      className={`flex flex-col gap-2 rounded-xl border p-4 ${marcado ? "border-warn-line bg-warn-surface" : "border-line bg-surface"}`}
    >
      <span className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${marcado ? "text-warn-ink" : "text-fg-muted"}`}>
        Resultado operativo o contable
      </span>
      {cargando && !d ? (
        <span className="text-[13px] text-fg-muted">Mirando Odoo…</span>
      ) : marcado ? (
        <>
          <span className="text-[13px] leading-[19px] text-fg">
            ● {`${mes[0]!.toUpperCase()}${mes.slice(1)}`} tiene ajustes contables pendientes: un déficit de este mes no es una pérdida real hasta
            que se ajuste.
          </span>
          {d?.marca.nota && <span className="text-[13px] leading-[19px] text-fg-secondary">«{d.marca.nota}»</span>}
          <span className="text-xs text-fg-muted">
            Lo marcó {d?.marca.por ?? "—"} el {fmtFecha(d?.marca.en ?? null)}.
          </span>
        </>
      ) : (
        <span className="text-[13px] leading-[19px] text-fg-secondary">
          Si a {mes} le faltan ajustes contables (períodos sin liquidar, IVA por rectificar, etiquetas mal puestas en Odoo), márcalo: su
          resultado se verá como contable, no como pérdida real.
        </span>
      )}

      {senales.length > 0 && (
        <div className="space-y-1.5 border-t border-line pt-2">
          <span className="text-xs font-semibold text-fg">Lo que Odoo muestra de {mes}</span>
          {senales.map((s) => (
            <div key={s.clave} className="flex flex-col gap-0.5">
              <span className="text-[13px] font-medium leading-[18px] text-fg">{s.titulo}</span>
              <span className="text-xs leading-[17px] text-fg-muted">{s.detalle}</span>
            </div>
          ))}
          <span className="text-[11px] text-fg-muted">Son indicios: el mes no se marca solo.</span>
        </div>
      )}
      {d?.senales && d.senales.length === 0 && !marcado && (
        <span className="text-xs text-fg-muted">Odoo no muestra borradores ni líneas sueltas en {mes}.</span>
      )}
      {d?.errorOdoo && <span className="text-xs text-fg-muted">{d.errorOdoo}</span>}

      <div className="flex flex-wrap gap-2">
        {marcado ? (
          <Button variant="ghost" size="sm" disabled={ocupado} onClick={() => void guardar(false)}>
            {ocupado ? "Quitando…" : "Ya se ajustó: quitar la marca"}
          </Button>
        ) : (
          <Button variant="secondary" size="sm" disabled={ocupado || !d} onClick={() => setMarcando(true)}>
            Marcar ajustes pendientes
          </Button>
        )}
      </div>

      <Modal
        open={marcando}
        onClose={() => setMarcando(false)}
        title={`Ajustes contables pendientes en ${mes}`}
        description="El punto de equilibrio y el cierre lo muestran al lado del resultado del mes. No cambia ningún número ni reabre el mes."
        footer={
          <>
            <Button variant="secondary" onClick={() => setMarcando(false)}>
              Cancelar
            </Button>
            <Button variant="primary" disabled={ocupado} onClick={() => void guardar(true)}>
              {ocupado ? "Marcando…" : "Marcar"}
            </Button>
          </>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-fg">Qué falta ajustar (opcional)</span>
          <Textarea
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Por ejemplo: falta liquidar septiembre y rectificar el IVA de octubre."
            autoFocus
          />
        </label>
      </Modal>
    </section>
  );
}
