"use client";

/**
 * components/clients/PersonasYTickets.tsx — La cuenta › Personas y tickets (etapa 6a de docs/mi-dia-plan.md).
 *
 * Quiénes son las personas del cliente (de HubSpot), cuándo estuvo cada una en una reunión por última vez, y los
 * tickets abiertos. Solo lectura: se cambian en HubSpot, y la copia de cada hora los trae.
 *
 * Datos: GET /api/clients/[id]/personas. Reglas: lib/contactos/.
 */
import { useEffect, useState } from "react";
import { Alert, EmptyState } from "@/components/ui";
import { SkeletonPanel, SkeletonText } from "@/components/ui/Skeleton";
import { cn } from "@/lib/cn";
import { hubspotRecordUrl } from "@/lib/hubspot/urls";
import type { PersonasYTickets as Datos } from "@/lib/contactos/lectura-server";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** La fecha en la hora de Costa Rica (UTC-6), armada a mano: así servidor y navegador dicen lo mismo. */
function fecha(iso: string, hoy = new Date()): string {
  const d = new Date(new Date(iso).getTime() - 6 * 3_600_000);
  const h = new Date(hoy.getTime() - 6 * 3_600_000);
  const anio = d.getUTCFullYear() !== h.getUTCFullYear() ? ` ${d.getUTCFullYear()}` : "";
  return `${d.getUTCDate()} ${MESES[d.getUTCMonth()]}${anio}`;
}

const PRIORIDAD: Record<string, string> = { URGENT: "Urgente", HIGH: "Alta", MEDIUM: "Media", LOW: "Baja" };

export default function PersonasYTickets({ clientId }: { clientId: string }) {
  const [datos, setDatos] = useState<(Datos & { portalId: string | null }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verCerrados, setVerCerrados] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetch(`/api/clients/${clientId}/personas`, { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? "No se pudieron cargar las personas.");
        return r.json();
      })
      .then((d) => vivo && setDatos(d))
      .catch((e: unknown) => vivo && setError(e instanceof Error ? e.message : "No se pudieron cargar las personas."));
    return () => {
      vivo = false;
    };
  }, [clientId]);

  const encabezado = (
    <div>
      <h2 className="text-[22px] font-bold leading-tight text-fg">Personas y tickets</h2>
      <p className="mt-1 text-[13px] text-fg-muted">
        Las personas del cliente y sus tickets, como están en HubSpot. Se cambian allá: Nexus los trae cada hora.
        {datos?.copiadoAt && <> Última copia: {fecha(datos.copiadoAt)}.</>}
      </p>
    </div>
  );

  if (error) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado}
        <Alert variant="danger">{error}</Alert>
      </div>
    );
  }
  if (!datos) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6" aria-busy="true">
        {encabezado}
        <SkeletonPanel minH="min-h-[260px]">
          <SkeletonText lines={6} />
        </SkeletonPanel>
      </div>
    );
  }
  if (!datos.hayTabla) {
    return (
      <div className="space-y-6 px-8 pb-10 pt-6">
        {encabezado}
        <EmptyState title="Todavía no hay copia" description="Falta la tabla de la copia de HubSpot en la base (scripts/sql/2026-10-16-contactos-y-tickets.sql)." />
      </div>
    );
  }

  const enlace = (objeto: "0-1" | "0-5", id: string) => (datos.portalId ? hubspotRecordUrl(datos.portalId, objeto, id) : null);
  const abiertos = datos.tickets.filter((t) => t.abierto);
  const cerrados = datos.tickets.filter((t) => !t.abierto);

  return (
    <div className="space-y-6 px-8 pb-10 pt-6">
      {encabezado}

      <section className="space-y-2" aria-labelledby="personas-del-cliente">
        <div className="flex items-baseline gap-2">
          <h3 id="personas-del-cliente" className="text-sm font-semibold text-fg">
            Personas
          </h3>
          <span className="text-xs text-fg-muted">{datos.personas.length} · primero quien estuvo en una reunión hace menos</span>
        </div>
        {datos.personas.length === 0 ? (
          <EmptyState title="Sin contactos en HubSpot" description="La empresa no tiene contactos asociados en HubSpot." />
        ) : (
          <div className="divide-y divide-line rounded-xl border border-line bg-surface">
            {datos.personas.map((p) => {
              const url = enlace("0-1", p.hubspotId);
              return (
                <div key={p.id} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4 py-2.5 text-[13px]">
                  <span className="min-w-0">
                    {url ? (
                      <a href={url} target="_blank" rel="noreferrer" className="font-semibold text-fg transition-colors hover:text-brand">
                        {p.nombre}
                      </a>
                    ) : (
                      <span className="font-semibold text-fg">{p.nombre}</span>
                    )}
                    <span className="block truncate text-xs text-fg-muted">{[p.cargo, p.email].filter(Boolean).join(" · ") || "Sin cargo ni correo"}</span>
                  </span>
                  <span className="text-fg-secondary">
                    {p.ultimaReunion ? (
                      <>
                        Última reunión: {fecha(p.ultimaReunion)}
                        {p.reuniones90 > 0 && (
                          <span className="block text-xs text-fg-muted">
                            {p.reuniones90} {p.reuniones90 === 1 ? "reunión" : "reuniones"} en 90 días
                          </span>
                        )}
                      </>
                    ) : (
                      <span className="text-fg-muted">Sin reuniones en el último año</span>
                    )}
                  </span>
                  <span className="text-xs text-fg-muted">
                    {p.ultimoContactoEnHubspot ? `En HubSpot: ${fecha(p.ultimoContactoEnHubspot)}` : "Sin contacto registrado en HubSpot"}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="space-y-2" aria-labelledby="tickets-del-cliente">
        <div className="flex items-baseline gap-2">
          <h3 id="tickets-del-cliente" className="text-sm font-semibold text-fg">
            Tickets abiertos
          </h3>
          <span className="text-xs text-fg-muted">{abiertos.length}</span>
        </div>
        {abiertos.length === 0 ? (
          <p className="text-[13px] text-fg-muted">No hay tickets abiertos.</p>
        ) : (
          <ListaDeTickets tickets={abiertos} enlace={(id) => enlace("0-5", id)} />
        )}
        {cerrados.length > 0 && (
          <div>
            <button type="button" onClick={() => setVerCerrados((v) => !v)} className="text-xs font-semibold text-brand transition-colors hover:text-brand-light" aria-expanded={verCerrados}>
              {verCerrados ? "Ocultar" : "Ver"} los {cerrados.length} cerrados en los últimos 90 días
            </button>
            {verCerrados && (
              <div className="mt-2">
                <ListaDeTickets tickets={cerrados} enlace={(id) => enlace("0-5", id)} />
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}

function ListaDeTickets({ tickets, enlace }: { tickets: Datos["tickets"]; enlace: (id: string) => string | null }) {
  return (
    <div className="divide-y divide-line rounded-xl border border-line bg-surface">
      {tickets.map((t) => {
        const url = enlace(t.hubspotId);
        const urgente = t.abierto && (t.prioridad === "URGENT" || t.prioridad === "HIGH");
        return (
          <div key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-4 py-2.5 text-[13px]">
            <span className="min-w-0">
              {url ? (
                <a href={url} target="_blank" rel="noreferrer" className="font-medium text-fg transition-colors hover:text-brand">
                  {t.asunto}
                </a>
              ) : (
                <span className="font-medium text-fg">{t.asunto}</span>
              )}
              <span className="block text-xs text-fg-muted">{[t.pipeline, t.etapa].filter(Boolean).join(" · ")}</span>
            </span>
            <span className="flex items-center gap-3 text-xs">
              {t.prioridad && <span className={cn(urgente ? "font-semibold text-warn-ink" : "text-fg-muted")}>{PRIORIDAD[t.prioridad] ?? t.prioridad}</span>}
              <span className="text-fg-muted">
                {t.abierto ? (t.creado ? `Desde el ${fecha(t.creado)}` : "") : t.cerrado ? `Cerrado el ${fecha(t.cerrado)}` : "Cerrado"}
              </span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
