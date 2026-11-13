"use client";

/**
 * components/cobranza/PasoAProduccion.tsx — la tabla del paso a producción, por proyecto (2026-11-13).
 *
 * Una fila por proyecto de Desarrollo (en marcha o ya entregado) o con un servicio de cobro recurrente: quién confirma su
 * paso a producción (por defecto Alejandro Salas), quién cobra (por defecto María José Zamora) y si ya pasó, con el día y
 * quién lo confirmó. Confirmar arranca el cobro de los servicios del proyecto que todavía no tienen cuotas.
 * Sin montos: la ven personas que no ven Cobranza. Reglas: lib/cobranza/paso-a-produccion.ts.
 */
import { useCallback, useEffect, useState } from "react";
import { Alert, Button, CeldaSelect, EmptyState, Field, Modal, Skeleton, SkeletonPanel, Table } from "@/components/ui";
import DatePickerField from "@/components/ui/DatePickerField";
import { useToast } from "@/components/ui/Toast";
import { fetchJson, ApiError } from "@/lib/api/fetch-json";
import type { FilaDeProduccion } from "@/lib/cobranza/paso-a-produccion";
import { fmtFecha } from "./format";

type Fila = FilaDeProduccion & { puedeConfirmar: boolean };

interface Respuesta {
  filas: Fila[];
  equipo: Array<{ email: string; nombre: string }>;
  /** A quién se puede poner en cada selector: quien confirma ve esta pantalla; quien cobra ve Cobranza. */
  elegibles: { confirma: Array<{ email: string; nombre: string }>; cobra: Array<{ email: string; nombre: string }> };
  puedeEditar: boolean;
  esquemaAtrasado: boolean;
}

function situacion(f: Fila, nombre: (e: string) => string): { texto: string; tono: string } {
  const s = f.situacion;
  if (s.clave === "falta-confirmar") return { texto: "Terminó en HubSpot: falta confirmar que está en producción", tono: "text-warn-ink" };
  if (s.clave === "en-desarrollo") return { texto: f.hubspotPipelineStageLabel ? `En desarrollo (${f.hubspotPipelineStageLabel})` : "En desarrollo", tono: "text-fg-muted" };
  const base = `En producción desde el ${fmtFecha(s.desde)} · confirmó ${nombre(s.por)}`;
  return s.cobroArrancado ? { texto: base, tono: "text-fg-secondary" } : { texto: `${base} · falta crear su cobro en Cobranza`, tono: "text-warn-ink" };
}

export default function PasoAProduccion({ hoyISO }: { hoyISO: string }) {
  const toast = useToast();
  const [datos, setDatos] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmando, setConfirmando] = useState<Fila | null>(null);
  const [dia, setDia] = useState(hoyISO);
  const [guardando, setGuardando] = useState(false);

  const cargar = useCallback(async () => {
    try {
      setDatos(await fetchJson<Respuesta>("/api/cobranza/produccion"));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "No se pudo cargar la tabla.");
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const enviar = useCallback(
    async (projectId: string, metodo: "PATCH" | "POST", body: Record<string, unknown>) =>
      fetchJson<{ ok: true; arrancados?: number }>(`/api/cobranza/produccion/${projectId}`, {
        method: metodo,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    [],
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
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-8 w-64" />
        <SkeletonPanel minH="min-h-[16rem]" header>
          <div className="space-y-3">
            {[0, 1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-3 w-full" />
            ))}
          </div>
        </SkeletonPanel>
      </div>
    );
  }
  if (datos.esquemaAtrasado) {
    return (
      <Alert variant="warning" title="Falta preparar la base">
        Esta tabla necesita el SQL del 2026-11-13 (responsables y contratos). Avísale a quien despliega.
      </Alert>
    );
  }

  const opcionesDe = (campo: "confirma" | "cobra") => datos.elegibles[campo].map((p) => ({ value: p.email, label: p.nombre, hint: p.email }));
  const nombre = (email: string) => datos.equipo.find((p) => p.email === email)?.nombre ?? email;
  const responsable = (f: Fila, campo: "confirma" | "cobra") => (
    <CeldaSelect
      etiqueta={`${campo === "confirma" ? "Quién confirma la producción de" : "Quién cobra"} «${f.nombre}»`}
      opciones={opcionesDe(campo)}
      seleccion={[f[campo]]}
      puedeEditar={datos.puedeEditar}
      onElegir={async (email) => {
        await enviar(f.id, "PATCH", { [campo]: email });
        toast.success("Guardado.");
        void cargar();
      }}
    />
  );

  return (
    <div className="space-y-4">
      <Table<Fila>
        rows={datos.filas}
        rowKey={(f) => f.id}
        variante="sistema"
        search={{ placeholder: "Buscar proyecto o cliente…", getText: (f) => `${f.nombre} ${f.clienteNombre}` }}
        empty={<EmptyState variant="dashed" title="No hay proyectos de desarrollo ni servicios recurrentes" />}
        columns={[
          {
            key: "proyecto",
            header: "Proyecto",
            render: (f) => (
              <div className="min-w-0">
                <div className="truncate text-sm text-fg">{f.nombre}</div>
                <div className="truncate text-xs text-fg-muted">{f.clienteNombre}</div>
              </div>
            ),
          },
          {
            key: "situacion",
            header: "Producción",
            render: (f) => {
              const s = situacion(f, nombre);
              return <span className={`text-xs ${s.tono}`}>{s.texto}</span>;
            },
          },
          { key: "confirma", header: "Confirma producción", width: "w-48", render: (f) => responsable(f, "confirma") },
          { key: "cobra", header: "Cobra", width: "w-48", render: (f) => responsable(f, "cobra") },
          {
            key: "accion",
            header: "",
            width: "w-44",
            align: "right",
            render: (f) => {
              if (!f.puedeConfirmar) return null;
              if (f.situacion.clave === "en-produccion") {
                return (
                  <Button
                    size="xs"
                    variant="secondary"
                    onClick={async () => {
                      try {
                        await enviar(f.id, "POST", { desde: null });
                        toast.success("Se quitó la confirmación. La fecha de arranque del cobro, si ya se escribió, se cambia en el servicio.");
                        void cargar();
                      } catch (e) {
                        toast.error(e instanceof ApiError ? e.message : "No se pudo.");
                      }
                    }}
                  >
                    Quitar confirmación
                  </Button>
                );
              }
              return (
                <Button size="xs" variant={f.situacion.clave === "falta-confirmar" ? "primary" : "secondary"} onClick={() => { setDia(hoyISO); setConfirmando(f); }}>
                  Confirmar producción
                </Button>
              );
            },
          },
        ]}
      />

      <Modal
        open={!!confirmando}
        onClose={() => setConfirmando(null)}
        title="Confirmar el paso a producción"
        description={confirmando ? `«${confirmando.nombre}» (${confirmando.clienteNombre}). Queda a tu nombre, con la hora.` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmando(null)}>Cancelar</Button>
            <Button
              variant="primary"
              loading={guardando}
              disabled={!dia || dia > hoyISO}
              onClick={async () => {
                if (!confirmando) return;
                setGuardando(true);
                try {
                  const r = await enviar(confirmando.id, "POST", { desde: dia });
                  toast.success(
                    r.arrancados
                      ? `Confirmado. El cobro de ${r.arrancados === 1 ? "su servicio" : `sus ${r.arrancados} servicios`} arranca el ${fmtFecha(dia)}.`
                      : "Confirmado. Finanzas recibe el aviso para arrancar su cobro.",
                  );
                  setConfirmando(null);
                  void cargar();
                } catch (e) {
                  toast.error(e instanceof ApiError ? e.message : "No se pudo confirmar.");
                } finally {
                  setGuardando(false);
                }
              }}
            >
              Confirmar
            </Button>
          </>
        }
      >
        <Field label="¿Qué día pasó a producción?" hint="Hoy o un día anterior. Desde ese día se cobra.">
          <DatePickerField value={dia} onChange={(ymd) => setDia(ymd)} placeholder="Elegir fecha" />
        </Field>
      </Modal>
    </div>
  );
}
