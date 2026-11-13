"use client";

/**
 * components/cobranza/SeguimientoCobranza.tsx — la pestaña «Seguimiento» de Cobranza (2026-11-13).
 *
 * Lo que Cobranza persigue y que no es una cuota de la cola:
 *  · Negocios ganados sin cobro, cada uno con su responsable (por defecto, quien cobra), hasta que se cargue su cobro o
 *    alguien lo descarte con una razón (lib/ventas/ventas-sin-cobro.ts).
 *  · Conectores en mora: Nexus propone desactivarlos y una persona confirma (lib/cobranza/conectores-en-mora.ts).
 *  · Contratos recurrentes con su fin y su renovación (lib/cobranza/contratos.ts).
 *  · El resumen del paso a producción, con el enlace a su tabla (/cobranza/production).
 *
 * Se lee al abrir la pestaña: no comparte datos con las otras.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { Alert, Button, CeldaSelect, ConfirmDialog, EmptyState, Field, Modal, Skeleton, SkeletonPanel, Table, Textarea } from "@/components/ui";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { SeguimientoDeCobranza } from "@/lib/cobranza/seguimiento-server";
import type { VentaSinCobro } from "@/lib/ventas/ventas-sin-cobro";
import type { ConectorEnMora } from "@/lib/cobranza/conectores-en-mora";
import { RESPONSABLE_DE_COBRO } from "@/lib/cobranza/responsables";
import { NOMBRE_DE_LA_RENOVACION, cuandoVence } from "@/lib/cobranza/contratos";
import { fmtFecha, fmtMonto } from "./format";

const CLASE: Record<VentaSinCobro["clase"], string> = {
  SIN_COBRANZA: "Sin nada cargado",
  PARCIAL: "Cargado de menos",
  SIN_CLIENTE: "La empresa no está en Nexus",
};

const dias = (n: number) => (n === 1 ? "1 día" : `${n} días`);

function textoDelConector(c: ConectorEnMora): string {
  const s = c.situacion;
  switch (s.clave) {
    case "proponer-desactivar":
      return `${s.cuotas === 1 ? "Una factura vencida" : `${s.cuotas} facturas vencidas`}, la más vieja hace ${dias(s.diasDeMora)}. Nexus propone desactivarlo.`;
    case "con-promesa":
      return `${dias(s.diasDeMora)} de mora, pero prometió pagar el ${fmtFecha(s.promesa)}: se espera hasta esa fecha.`;
    case "desactivado":
      return `Desactivado por ${s.por} el ${fmtFecha(s.en)}. Sigue con ${dias(s.diasDeMora)} de mora.`;
    case "proponer-reactivar":
      return `Desactivado por ${s.por} el ${fmtFecha(s.en)}, y ya no está en mora: reactívalo.`;
  }
}

export default function SeguimientoCobranza({ puedeEditar, onOpenCuenta }: { puedeEditar: boolean; onOpenCuenta: (cuentaId: string) => void }) {
  const toast = useToast();
  const [datos, setDatos] = useState<SeguimientoDeCobranza | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [descartando, setDescartando] = useState<VentaSinCobro | null>(null);
  const [motivo, setMotivo] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [conector, setConector] = useState<{ c: ConectorEnMora; desactivar: boolean } | null>(null);
  const [verDescartadas, setVerDescartadas] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await fetchJson<SeguimientoDeCobranza>("/api/cobranza/seguimiento"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar el seguimiento.");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const patchVenta = useCallback(
    async (ventaId: string, body: Record<string, unknown>, ok: string) => {
      await fetchJson(`/api/cobranza/ventas/${ventaId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      toast.success(ok);
      void cargar();
    },
    [cargar, toast],
  );

  if (error) {
    return (
      <Alert variant="danger" title="No se pudo cargar" action={<Button size="xs" onClick={() => void cargar()}>Reintentar</Button>}>
        {error}
      </Alert>
    );
  }
  if (!datos) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-4 w-64" />
        <SkeletonPanel minH="min-h-[10rem]" header>
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </SkeletonPanel>
        <Skeleton className="h-4 w-48" />
        <SkeletonPanel minH="min-h-[6rem]">
          <Skeleton className="h-3 w-2/3" />
        </SkeletonPanel>
      </div>
    );
  }
  if (datos.esquemaAtrasado) {
    return (
      <Alert variant="warning" title="Falta preparar la base">
        Esta pestaña necesita el SQL del 2026-11-13 (responsables y contratos). Avísale a quien despliega.
      </Alert>
    );
  }

  const opcionesEquipo = datos.equipo.map((p) => ({ value: p.email, label: p.nombre, hint: p.email }));
  const nombreDe = (email: string) => datos.equipo.find((p) => p.email === email)?.nombre ?? (email === RESPONSABLE_DE_COBRO.email ? RESPONSABLE_DE_COBRO.nombre : email);
  const { produccion } = datos;

  return (
    <div className="space-y-8">
      {/* ── Negocios ganados sin cobro ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Negocios ganados sin cobro</h2>
          <p className="text-xs text-fg-muted">
            Ventas de este año que todavía no tienen su cobro cargado. Salen solas de la lista cuando se carga su plan de
            cobro. Si una no genera cobro (continuidad, add-on, renovación), descártala con la razón.
          </p>
        </div>
        <Table<VentaSinCobro>
          rows={datos.ventas}
          rowKey={(v) => v.id}
          search={{ placeholder: "Buscar venta o cliente…", getText: (v) => `${v.nombre} ${v.clienteNombre ?? ""} ${nombreDe(v.responsable)}` }}
          initialSort={{ key: "descubierto", dir: "desc" }}
          empty={<EmptyState variant="dashed" title="Todas las ventas del año tienen su cobro" description="Cuando se gane un negocio nuevo y no se cargue su cobro, aparece acá." />}
          columns={[
            {
              key: "venta",
              header: "Venta",
              render: (v) => (
                <div className="min-w-0">
                  <div className="truncate text-sm text-fg">{v.nombre}</div>
                  <div className="truncate text-xs text-fg-muted">{v.clienteNombre ?? "Sin cliente en Nexus"} · {CLASE[v.clase]}</div>
                </div>
              ),
            },
            { key: "cierre", header: "Ganada", width: "w-28", render: (v) => <span className="text-xs text-fg-secondary">{fmtFecha(v.fechaCierre)}</span>, sortValue: (v) => v.fechaCierre, hideOnMobile: true },
            { key: "descubierto", header: "Sin cobro", width: "w-32", align: "right", render: (v) => <span className="text-sm text-fg">{fmtMonto(v.descubierto, "USD")}</span>, sortValue: (v) => v.descubierto },
            {
              key: "responsable",
              header: "Responsable",
              width: "w-48",
              render: (v) => (
                <CeldaSelect
                  etiqueta={`Responsable de cobrar «${v.nombre}»`}
                  opciones={opcionesEquipo}
                  seleccion={[v.responsable]}
                  puedeEditar={puedeEditar}
                  onElegir={(email) => patchVenta(v.id, { responsable: email }, `Ahora la persigue ${nombreDe(email)}.`)}
                />
              ),
            },
            ...(puedeEditar
              ? [
                  {
                    key: "acciones",
                    header: "",
                    width: "w-28",
                    align: "right" as const,
                    render: (v: VentaSinCobro) => (
                      <Button size="xs" variant="secondary" onClick={() => { setMotivo(""); setDescartando(v); }}>
                        Descartar
                      </Button>
                    ),
                  },
                ]
              : []),
          ]}
        />
        {datos.descartadas.length > 0 && (
          <div>
            <button type="button" onClick={() => setVerDescartadas((x) => !x)} className="text-xs font-medium text-brand hover:text-brand-light">
              {verDescartadas ? "Ocultar las descartadas" : `Ver las ${datos.descartadas.length} descartadas de este año`}
            </button>
            {verDescartadas && (
              <ul className="mt-2 space-y-2">
                {datos.descartadas.map((d) => (
                  <li key={d.id} className="flex items-start justify-between gap-3 rounded-lg border border-line bg-surface px-3 py-2">
                    <div className="min-w-0 text-xs">
                      <div className="text-fg">{d.nombre}{d.clienteNombre ? ` · ${d.clienteNombre}` : ""}</div>
                      <div className="text-fg-muted">
                        «{d.motivo ?? "sin razón escrita"}»{d.por ? ` · ${d.por}` : ""}{d.en ? ` · ${fmtFecha(d.en)}` : ""}
                      </div>
                    </div>
                    {puedeEditar && (
                      <Button size="xs" variant="secondary" onClick={() => void patchVenta(d.id, { devolver: true }, "Volvió a la lista.").catch((e) => toast.error(e instanceof ApiError ? e.message : "No se pudo."))}>
                        Devolver a la lista
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* ── Paso a producción ── */}
      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-fg">Paso a producción</h2>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
          <p className="text-xs text-fg-secondary">
            El cobro de un conector o de un servicio recurrente arranca cuando alguien confirma que pasó a producción.{" "}
            {produccion.faltaConfirmar + produccion.porArrancar === 0
              ? "No hay nada pendiente."
              : [
                  produccion.faltaConfirmar > 0 ? `${produccion.faltaConfirmar} por confirmar` : null,
                  produccion.porArrancar > 0 ? `${produccion.porArrancar} con el cobro por arrancar` : null,
                ]
                  .filter(Boolean)
                  .join(" · ") + "."}
          </p>
          <Link href="/cobranza/production" className="text-xs font-semibold text-brand hover:text-brand-light">
            Ver la tabla por proyecto
          </Link>
        </div>
      </section>

      {/* ── Conectores en mora ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Conectores en mora</h2>
          <p className="text-xs text-fg-muted">
            Con más de 30 días vencidos, Nexus propone desactivarlos. Nunca lo hace solo: antes de confirmar, revisa en
            Conciliación que la deuda sea real.
          </p>
        </div>
        {datos.conectores.length === 0 ? (
          <EmptyState variant="dashed" title="Ningún conector en mora" />
        ) : (
          <ul className="space-y-2">
            {datos.conectores.map((c) => (
              <li key={c.servicioId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-surface px-4 py-3">
                <div className="min-w-0">
                  <button type="button" onClick={() => onOpenCuenta(c.cuentaId)} className="text-sm font-medium text-fg hover:text-brand">
                    {c.clienteNombre}
                  </button>
                  <span className="text-xs text-fg-muted"> · {c.descripcion}</span>
                  <p className="text-xs text-fg-secondary">{textoDelConector(c)}</p>
                </div>
                {puedeEditar && c.situacion.clave === "proponer-desactivar" && (
                  <Button size="xs" variant="secondary" onClick={() => setConector({ c, desactivar: true })}>
                    Confirmar desactivación
                  </Button>
                )}
                {puedeEditar && (c.situacion.clave === "desactivado" || c.situacion.clave === "proponer-reactivar") && (
                  <Button size="xs" variant="secondary" onClick={() => setConector({ c, desactivar: false })}>
                    Reactivar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── Contratos recurrentes ── */}
      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-fg">Contratos recurrentes</h2>
          <p className="text-xs text-fg-muted">
            Customer Success recibe un aviso 30 días antes del fin. El fin y la renovación se cambian en el servicio: abre la
            cuenta.
          </p>
        </div>
        <Table
          rows={datos.contratos}
          rowKey={(k) => k.servicioId}
          onRowClick={(k) => onOpenCuenta(k.cuentaId)}
          empty={<EmptyState variant="dashed" title="No hay contratos recurrentes activos" />}
          columns={[
            {
              key: "cliente",
              header: "Contrato",
              render: (k) => (
                <div className="min-w-0">
                  <div className="truncate text-sm text-fg">{k.clienteNombre}</div>
                  <div className="truncate text-xs text-fg-muted">{k.servicio}</div>
                </div>
              ),
            },
            { key: "inicio", header: "Inicio", width: "w-28", hideOnMobile: true, render: (k) => <span className="text-xs text-fg-secondary">{k.inicio ? fmtFecha(k.inicio) : "—"}</span> },
            {
              key: "fin",
              header: "Fin",
              width: "w-36",
              sortValue: (k) => k.fin,
              render: (k) => (
                <span className="text-xs text-fg-secondary">
                  {k.fin ? fmtFecha(k.fin) : "Sin fin"}
                  {k.fin && !k.finEscrito ? <span className="text-fg-muted"> (inicio + duración)</span> : null}
                </span>
              ),
            },
            { key: "renovacion", header: "Al vencer", width: "w-36", hideOnMobile: true, render: (k) => <span className="text-xs text-fg-secondary">{k.renovacion ? NOMBRE_DE_LA_RENOVACION[k.renovacion] : "Nadie lo dijo"}</span> },
            {
              key: "aviso",
              header: "",
              width: "w-36",
              render: (k) =>
                k.aviso ? (
                  <span className={`text-xs font-medium ${k.aviso.clave === "vencido" ? "text-danger-ink" : "text-warn-ink"}`}>{cuandoVence(k.aviso)}</span>
                ) : null,
            },
          ]}
        />
      </section>

      {/* ── Descartar una venta ── */}
      <Modal
        open={!!descartando}
        onClose={() => setDescartando(null)}
        title="Descartar la venta"
        description={
          descartando
            ? `«${descartando.nombre}» no genera cobro: sale de esta lista y queda con tu nombre y la razón. Sigue contando como venta (en lo vendido, la cuota y la comisión).`
            : undefined
        }
        footer={
          <>
            <Button variant="secondary" onClick={() => setDescartando(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={guardando}
              disabled={motivo.trim().length < 5}
              onClick={async () => {
                if (!descartando) return;
                setGuardando(true);
                try {
                  await patchVenta(descartando.id, { descartar: motivo.trim() }, "Venta descartada.");
                  setDescartando(null);
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "No se pudo descartar.");
                } finally {
                  setGuardando(false);
                }
              }}
            >
              Descartar
            </Button>
          </>
        }
      >
        <Field label="¿Por qué no genera cobro?" hint="Ej. es la renovación de un contrato que ya se cobra, o un add-on incluido.">
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} maxLength={300} />
        </Field>
      </Modal>

      {/* ── Desactivar o reactivar un conector ── */}
      <ConfirmDialog
        open={!!conector}
        onCancel={() => setConector(null)}
        title={conector?.desactivar ? "Confirmar la desactivación" : "Reactivar el conector"}
        description={
          conector?.desactivar
            ? `Confirmas que la deuda de ${conector.c.clienteNombre} es real y que su conector se desactiva. Queda a tu nombre, con la fecha. Avísale a Desarrollo para que lo apague.`
            : conector
              ? `El conector de ${conector.c.clienteNombre} vuelve a estar activo. Avísale a Desarrollo para que lo encienda.`
              : undefined
        }
        confirmLabel={conector?.desactivar ? "Sí, desactivarlo" : "Reactivar"}
        variant={conector?.desactivar ? "destructive" : "default"}
        onConfirm={async () => {
          if (!conector) return;
          try {
            await fetchJson(`/api/cobranza/servicios/${conector.c.servicioId}/desactivacion`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ desactivar: conector.desactivar }),
            });
            toast.success(conector.desactivar ? "Desactivación confirmada a tu nombre." : "Conector reactivado.");
            setConector(null);
            void cargar();
          } catch (e) {
            toast.error(e instanceof ApiError ? e.message : "No se pudo guardar.");
          }
        }}
      />
    </div>
  );
}
