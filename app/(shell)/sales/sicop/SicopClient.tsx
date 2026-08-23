"use client";

/**
 * SicopClient — el tablero de licitaciones, una sección por etapa.
 *
 * Decisiones que valen el comentario:
 *  · Las etapas VACÍAS se muestran igual (el tablero es el proceso completo), pero sin
 *    plegado: no hay nada que abrir.
 *  · Las etapas CERRADAS (`isClosed` del portal: Inicio de proyecto, Perdido) arrancan
 *    plegadas. Hoy son 41 de las 42 licitaciones: abiertas, taparían lo que está en juego.
 *  · El presupuesto se muestra SIN símbolo de moneda y SIN redondear, a propósito: la
 *    propiedad `presupuesto__sicop_` del portal es un número pelado donde conviven monedas
 *    y magnitudes (hay 17, 69,972, 39.700 y 4.476.112 cargados a mano). Poner "₡" o "$"
 *    sería inventar el dato, y redondear convertiría 69,972 en "70". Se muestra lo que hay.
 */
import { useState } from "react";
import { EmptyState, Alert, Badge } from "@/components/ui";
import { hubspotTicketUrl } from "@/lib/hubspot/urls";
import type { EtapaSicop, LicitacionSicop, TableroSicop } from "@/lib/ventas/sicop";

const numero = new Intl.NumberFormat("es-CR", { maximumFractionDigits: 2 });

function fecha(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "numeric" });
}

export default function SicopClient({ tablero }: { tablero: TableroSicop }) {
  const [plegadas, setPlegadas] = useState<Set<string>>(
    () => new Set(tablero.etapas.filter((e) => e.cerrada).map((e) => e.id)),
  );

  const alternar = (id: string) =>
    setPlegadas((prev) => {
      const siguiente = new Set(prev);
      if (siguiente.has(id)) siguiente.delete(id);
      else siguiente.add(id);
      return siguiente;
    });

  if (!tablero.soportado) {
    return (
      <Alert variant="warning" title="Falta el permiso de tickets en HubSpot">
        La app conectada no tiene autorizado el scope <code>crm.objects.tickets.read</code>, así
        que el pipeline «Gobiernos» no se puede leer. Se resuelve re-autorizando la app desde
        Configuración → Integraciones.
      </Alert>
    );
  }

  if (tablero.error) {
    return (
      <Alert variant="danger" title="No se pudo leer el pipeline «Gobiernos»">
        {tablero.error}
      </Alert>
    );
  }

  if (tablero.etapas.length === 0) {
    return (
      <EmptyState
        variant="dashed"
        title="El pipeline «Gobiernos» no devolvió etapas"
        description="Puede que lo hayan renombrado o archivado en HubSpot. Revisá el pipeline de tickets en el portal."
      />
    );
  }

  return (
    <div className="space-y-3">
      {tablero.etapas.map((etapa) => (
        <SeccionEtapa
          key={etapa.id}
          etapa={etapa}
          portalId={tablero.portalId}
          plegada={plegadas.has(etapa.id)}
          onAlternar={() => alternar(etapa.id)}
        />
      ))}
    </div>
  );
}

function SeccionEtapa({
  etapa,
  portalId,
  plegada,
  onAlternar,
}: {
  etapa: EtapaSicop;
  portalId: string | null;
  plegada: boolean;
  onAlternar: () => void;
}) {
  const vacia = etapa.licitaciones.length === 0;
  const abierta = !plegada && !vacia;

  return (
    <section className="rounded-xl border border-line bg-surface overflow-hidden">
      <button
        type="button"
        onClick={onAlternar}
        disabled={vacia}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left transition-colors ${
          vacia ? "cursor-default" : "hover:bg-surface-hover"
        }`}
      >
        <svg
          className={`w-3.5 h-3.5 flex-shrink-0 text-fg-muted transition-transform ${
            abierta ? "rotate-90" : ""
          } ${vacia ? "opacity-0" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          aria-hidden="true"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className={`text-sm font-medium truncate ${vacia ? "text-fg-muted" : "text-fg"}`}>
          {etapa.label}
        </span>
        {etapa.cerrada && (
          <Badge variant="default" size="xs">
            cierra
          </Badge>
        )}
        <span className="ml-auto text-xs tabular-nums text-fg-muted flex-shrink-0">
          {etapa.licitaciones.length}
        </span>
      </button>

      {abierta && (
        <ul className="border-t border-line divide-y divide-line">
          {etapa.licitaciones.map((l) => (
            <FilaLicitacion key={l.id} licitacion={l} portalId={portalId} />
          ))}
        </ul>
      )}
    </section>
  );
}

function FilaLicitacion({
  licitacion: l,
  portalId,
}: {
  licitacion: LicitacionSicop;
  portalId: string | null;
}) {
  const url = hubspotTicketUrl(portalId, l.id);
  const meta: string[] = [];
  if (l.tipoContratacion) meta.push(l.tipoContratacion);
  if (l.presupuesto != null) meta.push(`Presupuesto ${numero.format(l.presupuesto)}`);
  if (l.formatoEvaluacion) meta.push(l.formatoEvaluacion);
  if (l.responsable) meta.push(l.responsable);
  const actualizada = fecha(l.actualizadaEl);
  if (actualizada) meta.push(`Últ. movimiento ${actualizada}`);

  return (
    <li className="px-4 py-3 hover:bg-surface-muted transition-colors">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-sm text-fg leading-snug">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-brand transition-colors"
                title="Abrir en HubSpot"
              >
                {l.asunto}
              </a>
            ) : (
              l.asunto
            )}
          </p>
          {l.procedimiento && (
            <p className="text-2xs font-mono text-fg-muted mt-0.5 truncate">{l.procedimiento}</p>
          )}
          {meta.length > 0 && (
            <p className="text-xs text-fg-secondary mt-1">{meta.join(" · ")}</p>
          )}
          {l.motivoPerdida && (
            <p className="text-xs text-fg-muted mt-1">Motivo: {l.motivoPerdida}</p>
          )}
        </div>
        {l.fechaAclaraciones && (
          <div className="flex-shrink-0 text-right">
            <p className="text-2xs uppercase tracking-widest text-fg-muted">Aclaraciones</p>
            <p className="text-xs text-fg-secondary tabular-nums">{fecha(l.fechaAclaraciones)}</p>
          </div>
        )}
      </div>
    </li>
  );
}
