"use client";

/**
 * components/finanzas/RevisionDelEquipo.tsx — Supervisión › «Trabajo del equipo por revisar» (rediseño de Finanzas,
 * 2026-10-03, etapa «Revisión»).
 *
 * Los pagos que alguien del equipo dio por cobrados y los gastos que anotó, con «Está bien» y «Devolver». Lo devuelto le
 * llega a quien lo registró en su Pendientes, con el comentario; cuando lo corrige, vuelve acá marcado. Un «Está bien»
 * vale para los números que se vieron: si cambian, el registro vuelve con el aviso (lib/finanzas/revision.ts).
 */
import Link from "next/link";
import { useCallback, useState } from "react";
import { Button, ConfirmDialog, Modal, Segmentado, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { ApiError, fetchJson } from "@/lib/api/fetch-json";
import { fmtMontoLibro } from "@/lib/cobranza/montos";
import { diaCorto, ETIQUETA_EN_REVISION, type TipoRevisado } from "@/lib/finanzas/revision";
import type { DatosDeRevision, FilaDeRevision } from "@/lib/finanzas/revision-server";

const CHIP_AVISO = "inline-flex rounded-full border border-warn-line bg-warn-surface px-2 py-px text-[11px] text-warn-ink";
const CHIP_INFO = "inline-flex rounded-full border border-info-line bg-info-surface px-2 py-px text-[11px] text-fg-secondary";

/** «Dinia» si todo lo registró la misma persona; si no, «el equipo». */
function quienRegistro(filas: readonly FilaDeRevision[]): string {
  const nombres = new Set(filas.map((f) => f.registradoPor));
  return nombres.size === 1 ? [...nombres][0]! : "el equipo";
}

export default function RevisionDelEquipo({ inicial }: { inicial: DatosDeRevision }) {
  const toast = useToast();
  const [datos, setDatos] = useState(inicial);
  const [tipo, setTipo] = useState<TipoRevisado>(inicial.pagos.length || !inicial.gastos.length ? "PAGO" : "GASTO");
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [devolviendo, setDevolviendo] = useState<FilaDeRevision | null>(null);
  const [comentario, setComentario] = useState("");
  const [confirmarTodos, setConfirmarTodos] = useState(false);

  const filas = tipo === "PAGO" ? datos.pagos : datos.gastos;
  const clave = (f: Pick<FilaDeRevision, "tipo" | "id">) => `${f.tipo}:${f.id}`;

  const recargar = useCallback(async () => {
    try {
      setDatos(await fetchJson<DatosDeRevision>("/api/finanzas/revision"));
    } catch {}
  }, []);

  const deshacer = useCallback(
    async (f: FilaDeRevision) => {
      try {
        await fetchJson("/api/finanzas/revision", { method: "DELETE", body: JSON.stringify({ tipo: f.tipo, id: f.id }) });
        toast.success("Deshecho: vuelve a estar por revisar.");
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : "No se pudo deshacer.");
      }
      void recargar();
    },
    [toast, recargar],
  );

  /** Saca filas de la lista que se ve (y las devueltas van a su bloque). */
  const quitar = (ids: Set<string>, devuelta?: FilaDeRevision) =>
    setDatos((d) => ({
      pagos: d.pagos.filter((f) => !ids.has(clave(f))),
      gastos: d.gastos.filter((f) => !ids.has(clave(f))),
      devueltos: devuelta ? [devuelta, ...d.devueltos] : d.devueltos,
    }));

  async function marcarBien(items: FilaDeRevision[]) {
    const ids = new Set(items.map(clave));
    setOcupado(items.length === 1 ? clave(items[0]!) : "todos");
    try {
      await fetchJson("/api/finanzas/revision", {
        method: "POST",
        body: JSON.stringify({ accion: "BIEN", items: items.map((f) => ({ tipo: f.tipo, id: f.id })) }),
      });
      quitar(ids);
      if (items.length === 1) {
        toast.success("Revisado.", { action: { label: "Deshacer", onClick: () => void deshacer(items[0]!) } });
      } else {
        toast.success(`${items.length} revisados.`);
      }
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo guardar la revisión.");
      void recargar();
    } finally {
      setOcupado(null);
    }
  }

  async function devolver() {
    const f = devolviendo;
    if (!f || !comentario.trim()) return;
    setOcupado(clave(f));
    try {
      await fetchJson("/api/finanzas/revision", {
        method: "POST",
        body: JSON.stringify({ accion: "DEVOLVER", items: [{ tipo: f.tipo, id: f.id }], comentario: comentario.trim() }),
      });
      quitar(new Set([clave(f)]), { ...f, estado: "DEVUELTO", comentario: comentario.trim() });
      toast.success(`Devuelto: le llega a ${f.registradoPor} en Pendientes.`);
      setDevolviendo(null);
      setComentario("");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : "No se pudo devolver.");
    } finally {
      setOcupado(null);
    }
  }

  const todas = [...datos.pagos, ...datos.gastos];
  const quien = quienRegistro(todas.length ? todas : datos.devueltos);
  const esPago = tipo === "PAGO";

  return (
    <section id="revision" aria-label="Trabajo del equipo por revisar" className="rounded-xl border border-line bg-surface">
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2.5 px-4 pb-2.5 pt-3.5">
        <h2 className="text-[15px] font-semibold text-fg">Trabajo del equipo por revisar</h2>
        <Segmentado
          etiqueta="Qué revisar"
          valor={tipo}
          onCambio={setTipo}
          opciones={[
            { clave: "PAGO", etiqueta: `Pagos registrados · ${datos.pagos.length}` },
            { clave: "GASTO", etiqueta: `Gastos anotados · ${datos.gastos.length}` },
          ]}
        />
        {filas.length > 1 && (
          <Button variant="primary" className="ml-auto" onClick={() => setConfirmarTodos(true)} disabled={ocupado !== null}>
            Dar por buenos los {filas.length}
          </Button>
        )}
      </div>

      {filas.length === 0 ? (
        <p className="border-t border-line px-4 py-4 text-[13px] text-fg-muted">
          {esPago ? "No hay pagos por revisar." : "No hay gastos por revisar."} Lo que registre {quien} aparece acá.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] border-collapse text-[13px] leading-[19px]">
            <thead>
              <tr className="text-left text-[11px] uppercase tracking-[0.08em] text-fg-muted">
                <th className="px-4 py-2 font-semibold">{esPago ? "Cliente" : "Gasto"}</th>
                <th className="px-4 py-2 font-semibold">{esPago ? "Cuota" : "Detalle"}</th>
                <th className="px-4 py-2 text-right font-semibold">Monto</th>
                <th className="px-4 py-2 font-semibold">{esPago ? "Entró" : "Fecha"}</th>
                <th className="px-4 py-2 font-semibold">{esPago ? "Registró" : "Anotó"}</th>
                <th className="px-4 py-2 font-semibold">
                  <span className="sr-only">Revisión</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => (
                <tr key={clave(f)}>
                  <td className="border-t border-line px-4 py-2.5 align-top font-semibold text-fg">
                    <Link href={f.href} className="hover:text-brand">
                      {f.titulo}
                    </Link>
                  </td>
                  <td className="border-t border-line px-4 py-2.5 align-top text-fg-secondary">{f.detalle}</td>
                  <td className="border-t border-line px-4 py-2.5 text-right align-top tabular-nums text-fg">
                    {fmtMontoLibro(f.monto, f.moneda)}
                  </td>
                  <td className="border-t border-line px-4 py-2.5 align-top text-fg-secondary">{f.fecha ? diaCorto(f.fecha) : "—"}</td>
                  <td className="border-t border-line px-4 py-2.5 align-top text-fg-secondary">
                    <span className="flex flex-col items-start gap-1">
                      <span>
                        {f.registradoPor} · {diaCorto(f.registradoEn)}
                      </span>
                      {f.estado === "CAMBIO" && <span className={CHIP_AVISO}>{ETIQUETA_EN_REVISION.CAMBIO}</span>}
                      {f.estado === "CORREGIDO" && (
                        <span className={CHIP_INFO} title={f.comentario ? `Lo devolviste con: «${f.comentario}»` : undefined}>
                          {ETIQUETA_EN_REVISION.CORREGIDO}
                        </span>
                      )}
                      {f.avisos.map((a) => (
                        <span key={a} className={CHIP_AVISO}>
                          {a}
                        </span>
                      ))}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-t border-line px-4 py-2.5 text-right align-top">
                    <Button variant="secondary" size="sm" onClick={() => void marcarBien([f])} disabled={ocupado !== null}>
                      {ocupado === clave(f) ? "Guardando…" : "✓ Está bien"}
                    </Button>{" "}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setDevolviendo(f);
                        setComentario("");
                      }}
                      disabled={ocupado !== null}
                    >
                      Devolver
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="border-t border-line px-4 py-2.5 text-xs text-fg-muted">
        «Devolver» le llega a {quien} en Pendientes, con tu comentario. Lo que registra un Super Admin no pasa por acá.
      </div>

      {datos.devueltos.length > 0 && (
        <div className="border-t border-line bg-surface-muted px-4 py-3">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-fg-muted">
            Devuelto, esperando a {quienRegistro(datos.devueltos)} · {datos.devueltos.length}
          </span>
          <ul className="mt-2 space-y-2">
            {datos.devueltos.map((f) => (
              <li key={clave(f)} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
                <span className="font-semibold text-fg">{f.titulo}</span>
                <span className="tabular-nums text-fg-secondary">{fmtMontoLibro(f.monto, f.moneda)}</span>
                <span className="min-w-0 flex-[1_1_240px] text-fg-secondary">«{f.comentario}»</span>
                <button
                  type="button"
                  className="text-[13px] font-semibold text-brand hover:text-brand-light"
                  onClick={() => void deshacer(f)}
                >
                  Deshacer la devolución
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Modal
        open={devolviendo !== null}
        onClose={() => setDevolviendo(null)}
        title={devolviendo ? `Devolver: ${devolviendo.titulo}` : "Devolver"}
        description={
          devolviendo
            ? `${fmtMontoLibro(devolviendo.monto, devolviendo.moneda)} · ${devolviendo.detalle}. Le llega a ${devolviendo.registradoPor} en Pendientes con lo que escribas. No se deshace nada: solo se le pide que lo mire.`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDevolviendo(null)}>
              Cancelar
            </Button>
            <Button variant="primary" onClick={() => void devolver()} disabled={!comentario.trim() || ocupado !== null}>
              {ocupado ? "Devolviendo…" : "Devolver"}
            </Button>
          </>
        }
      >
        <label className="block space-y-1.5">
          <span className="text-[13px] font-medium text-fg">Qué hay que corregir</span>
          <Textarea
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Por ejemplo: la plata entró el 3 de julio, no el 30 de septiembre."
            autoFocus
          />
        </label>
      </Modal>

      <ConfirmDialog
        open={confirmarTodos}
        onCancel={() => setConfirmarTodos(false)}
        onConfirm={async () => {
          setConfirmarTodos(false);
          await marcarBien(filas);
        }}
        title={`Dar por buenos los ${filas.length} ${esPago ? "pagos" : "gastos"}`}
        description="Quedan revisados con los números de hoy. Si alguno cambia después, vuelve a aparecer."
        confirmLabel="Dar por buenos"
      />
    </section>
  );
}
