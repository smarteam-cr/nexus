/**
 * components/lifecycle/HealthProposalChip.tsx
 *
 * La propuesta de SALUD del vigía sobre un proyecto, en la pestaña «Proyectos» de la cuenta: «Salud: de «En fricción»
 * a «En riesgo» · lo propone el vigía · Decidir».
 *
 * Desde el 2026-10-19 NO decide acá: «Decidir» lleva a Éxito del cliente › «Propuestas del vigía», abierta en esta
 * propuesta, que es el único lugar donde se confirma o se descarta (lib/cs/propuestas-del-vigia.ts). Antes tenía
 * «Confirmar · Descartar» sueltos al lado del estado de HubSpot y de otro chip que proponía «Pasar a Retrasado» en
 * HubSpot: no se entendía qué se proponía ni de qué a qué.
 */
import Link from "next/link";
import { IconoDeSugerencia } from "@/components/ui/sistema";
import { NOMBRE_DE_LA_SALUD, rutaDeLaPropuesta, type Salud } from "@/lib/cs/propuestas-del-vigia";

export default function HealthProposalChip({
  projectId,
  actual,
  propuesta,
  reason,
}: {
  projectId: string;
  actual: Salud;
  propuesta: Salud;
  reason: string | null;
}) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded border border-info-line bg-info-surface px-1.5 py-0.5 text-[11px] font-medium text-brand"
      title={reason ? `Por qué: ${reason}` : undefined}
    >
      <IconoDeSugerencia className="h-3 w-3" />
      Salud: de «{NOMBRE_DE_LA_SALUD[actual]}» a «{NOMBRE_DE_LA_SALUD[propuesta]}» · lo propone el vigía
      <Link href={rutaDeLaPropuesta(projectId)} className="underline decoration-dotted hover:text-fg">
        Decidir
      </Link>
    </span>
  );
}
