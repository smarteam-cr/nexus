/**
 * components/manual/HubSpot.tsx — cómo se conecta Nexus con el portal.
 *
 * Abre por la pregunta que de verdad se hace el equipo ("¿qué pasa si muevo la tarjeta?") y
 * termina con los nombres internos de las propiedades. Ése apéndice SÍ va colapsado, y es la
 * única excepción de la pantalla: no es contenido comparable, es una lista que se consulta para
 * ir a buscarla a HubSpot, y la mayoría de los lectores no la necesita nunca.
 */
import {
  INTRO_HUBSPOT,
  HUBSPOT_ESCRIBE,
  HUBSPOT_NO_ESCRIBE,
} from "@/lib/manual/contenido";
import type { GrupoDePropiedades, PipelineDoc } from "@/lib/manual/armar";
import CollapsibleSection from "@/components/ui/CollapsibleSection";
import { Bloque, Pildora, Seccion } from "./Piezas";

export default function HubSpot({
  pipelines,
  grupos,
  totalProps,
}: {
  pipelines: PipelineDoc[];
  grupos: GrupoDePropiedades[];
  totalProps: number;
}) {
  return (
    <Seccion id="hubspot" titulo="HubSpot">
      <Bloque b={INTRO_HUBSPOT} />
      <Bloque b={HUBSPOT_NO_ESCRIBE} />
      <Bloque b={HUBSPOT_ESCRIBE} />

      <div className="mb-8">
        <h3 className="text-sm font-semibold text-fg mb-1">Los tipos de proyecto</h3>
        <p className="text-sm text-fg-secondary mb-3 max-w-prose">
          Cada uno es un pipeline en HubSpot, con sus propias etapas. La etapa la mueve el equipo
          allá; Nexus la refleja.
        </p>
        <div className="grid gap-4">
          {pipelines.map((p) => (
            <div key={p.label} className="rounded-lg border border-line bg-surface p-5">
              <h4 className="text-sm font-semibold text-fg">{p.label}</h4>
              <p className="text-sm text-fg-secondary leading-relaxed mt-1 max-w-prose">{p.help}</p>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {p.etapas.map((e) => (
                  <Pildora key={e.label}>
                    {e.label}
                    {e.cierra && " ·  cierra"}
                  </Pildora>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-sm font-semibold text-fg mb-1">Qué lee de cada proyecto</h3>
        <p className="text-sm text-fg-secondary mb-1 max-w-prose">
          Nexus le pide {totalProps} propiedades al objeto Proyectos: {resumenDeGrupos(grupos)}.
        </p>
        <CollapsibleSection title="Ver los nombres internos" count={totalProps} defaultOpen={false}>
          <p className="text-xs text-fg-muted mb-3 max-w-prose">
            Son los nombres que HubSpot usa por dentro, para que se puedan buscar allá.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            {grupos.map((g) => (
              <div key={g.titulo} className="rounded-lg border border-line bg-surface p-4">
                <p className="text-sm font-medium text-fg mb-2">{g.titulo}</p>
                <ul className="grid gap-1">
                  {g.props.map((p) => (
                    <li key={p} className="text-xs text-fg-muted font-mono">
                      {p}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </CollapsibleSection>
      </div>
    </Seccion>
  );
}

/** "el dueño y la empresa, las fechas, el alcance y el estado" — los grupos en una frase. */
function resumenDeGrupos(grupos: GrupoDePropiedades[]): string {
  const titulos = grupos.map((g) => g.titulo.toLowerCase());
  if (titulos.length <= 1) return titulos[0] ?? "";
  return `${titulos.slice(0, -1).join(", ")} y ${titulos[titulos.length - 1]}`;
}
