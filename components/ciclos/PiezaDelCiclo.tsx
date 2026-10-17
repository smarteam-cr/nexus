"use client";

/**
 * Los artefactos PROPIOS del ciclo de un proyecto recurrente: Adopción y Aprendizaje (docs/smartloop-plan.md; riel del
 * 2026-10-12, pedido de Elías). Los demás artefactos del ciclo son los documentos de siempre (Exploración, Diagnóstico,
 * Planificación, Integraciones, Entrega); la etapa, las fechas y la meta del ciclo viven en la tarjeta de la etapa del
 * Resumen, y los casos de uso en «Casos de uso» de la cuenta.
 *
 * Arriba de cada uno, la GUÍA de su etapa, que sale del documento de proceso del servicio: qué haces, qué tiene que
 * quedar y la señal de que se saltó. Lo que Nexus comprueba lleva marca; lo que no puede comprobar va sin marca, nunca
 * como hecho.
 */
import Link from "next/link";
import { Alert } from "@/components/ui";
import { ROTULO_DEL_SISTEMA } from "@/components/ui/sistema";
import { cn } from "@/lib/cn";
import { ETIQUETA_DE_ETAPA, PIEZA_ADOPCION_DEL_CICLO, PIEZA_APRENDIZAJE_DEL_CICLO, etapasDeLaPieza, nombreDelCiclo, type EtapaDelCiclo } from "@/lib/servicios/ciclo";
import { guiaDeServicio } from "@/lib/servicios";
import { guiaDelCiclo } from "@/lib/servicios/guia";
import { useCiclo, type EstadoConPermiso } from "./useCiclo";
import CierreDelCiclo from "./CierreDelCiclo";
import CiclosAnteriores from "./CiclosAnteriores";

const FECHA = new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
const fecha = (iso: string | null) => (iso ? FECHA.format(new Date(`${iso}T00:00:00Z`)) : null);

export default function PiezaDelCiclo({
  projectId,
  clientId,
  slug,
  onCambio,
}: {
  projectId: string;
  clientId: string;
  /** Qué artefacto: la adopción o el aprendizaje. */
  slug: string;
  onCambio?: () => void;
}) {
  const { estado, error, enviar } = useCiclo(projectId, onCambio);

  if (error) return <Alert variant="danger">{error}</Alert>;
  if (!estado) {
    return (
      <div className="space-y-3" aria-busy="true">
        <div className="skeleton-shimmer h-10 rounded-lg" />
        <div className="skeleton-shimmer h-10 rounded-lg" />
      </div>
    );
  }
  const etapa = etapasDeLaPieza(slug)[0] ?? null;
  const ciclo = estado.abierto;

  return (
    <div className="space-y-6">
      {etapa && <Guia estado={estado} etapa={etapa} enCurso={(ciclo?.etapa ?? "diagnostico") === etapa} />}

      {slug === PIEZA_ADOPCION_DEL_CICLO && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">Cómo usa HubSpot el equipo del cliente</h2>
          <p className="text-[13px] text-fg-secondary">
            El uso, la activación de cada hub y las licencias salen de HubSpot Partner. Es lo que confirma si lo implementado se volvió
            su forma de trabajar.
          </p>
          <Link href={`/customer-success/${clientId}?pestana=adopcion`} className="inline-block text-[13px] font-medium text-brand hover:text-brand-light">
            Ver la adopción de la cuenta →
          </Link>
        </section>
      )}

      {slug === PIEZA_APRENDIZAJE_DEL_CICLO && (
        <section className="space-y-2 rounded-xl border border-line bg-surface p-5">
          <h2 className="text-sm font-semibold text-fg">La sesión de aprendizaje</h2>
          <p className="text-[13px] text-fg-secondary">{guiaDeServicio(estado.servicio)?.reglaDeCierre}</p>
          <p className="text-[13px] text-fg-muted">
            {ciclo
              ? ciclo.hasta
                ? `${nombreDelCiclo(ciclo)} termina el ${fecha(ciclo.hasta)}.`
                : "El ciclo todavía no tiene fecha de cierre: ponla en la tarjeta de la etapa, en el Resumen."
              : "No hay un ciclo abierto: el proyecto está en Diagnóstico y el siguiente ciclo se abre al cambiar su etapa o sus datos."}
          </p>
        </section>
      )}

      {slug === PIEZA_APRENDIZAJE_DEL_CICLO && ciclo && <CierreDelCiclo ciclo={ciclo} puedeEditar={estado.puedeEditar} enviar={enviar} />}

      <CiclosAnteriores projectId={projectId} cerrados={estado.cerrados} />
    </div>
  );
}

// ── La guía del CSE para una etapa ───────────────────────────────────────────

function Guia({ estado, etapa, enCurso }: { estado: EstadoConPermiso; etapa: EtapaDelCiclo; enCurso: boolean }) {
  const servicio = guiaDeServicio(estado.servicio);
  if (!servicio) return null;
  const ciclo = estado.abierto;
  const g = guiaDelCiclo(servicio, {
    etapa,
    meta: ciclo?.meta ?? null,
    desde: ciclo?.desde ?? null,
    hasta: ciclo?.hasta ?? null,
    casos: ciclo?.casos ?? [],
    aprobada: ciclo ? ciclo.versionAprobada > 0 : undefined,
    aprendizaje: ciclo ? { metaResultado: ciclo.metaResultado, siguienteCiclo: ciclo.siguienteCiclo } : undefined,
  });
  return (
    <section className="space-y-3 rounded-xl border border-line bg-surface p-5">
      <div>
        <p className={ROTULO_DEL_SISTEMA}>
          Qué haces en {ETIQUETA_DE_ETAPA[etapa]}
          {enCurso ? " · etapa en curso" : ""}
        </p>
        <p className="mt-1.5 text-[13px] leading-relaxed text-fg">{g.guia.queHaces}</p>
      </div>
      <div>
        <p className={ROTULO_DEL_SISTEMA}>Qué tiene que quedar</p>
        <ul className="mt-1.5 space-y-1">
          {g.producido.map((p) => (
            <li key={p.clave} className="flex items-start gap-2 text-[13px]">
              <span
                aria-hidden="true"
                className={cn(
                  "mt-0.5 inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px]",
                  p.hecho === true
                    ? "bg-success-surface text-success-ink"
                    : p.hecho === false
                      ? "border border-warn-line text-warn-ink"
                      : "border border-line text-fg-muted",
                )}
              >
                {p.hecho === true ? "✓" : ""}
              </span>
              <span className={p.hecho === true ? "text-fg-secondary" : "text-fg"}>
                {p.texto}
                {p.hecho === false && <span className="text-warn-ink"> · falta</span>}
              </span>
            </li>
          ))}
        </ul>
      </div>
      {enCurso && g.senalVista ? (
        <Alert variant="warning">{g.senalVista}</Alert>
      ) : (
        <p className="text-xs text-fg-muted">
          <span className="font-medium">Señal de que se saltó:</span> {g.guia.senal}
        </p>
      )}
    </section>
  );
}
