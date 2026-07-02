/**
 * lib/business-cases/use-cases.ts — dominio del checklist de casos de uso.
 *
 * Degradación elegante por DOBLE compuerta:
 *   1. Por template: `features.useCaseChecklist` (websites la apagan hasta tener
 *      sección de materialización).
 *   2. Por datos: sin filas aplicables, el checklist NI SE MONTA y el generate es
 *      byte-idéntico al flujo actual.
 * La degradación nunca es MUDA: P2021 (tabla ausente — drop dual-PC) se distingue
 * de "catálogo vacío" y la UI lo avisa.
 */
import { prisma } from "@/lib/db/prisma";
import { templateById } from "@/components/landing/configs/templates.defs";

export interface ApplicableUseCase {
  id: string;
  title: string;
  description: string;
  price: string | null;
  tags: string[];
  active: boolean;
  selected: boolean;
  priceOverride: string | null;
}

export interface UseCaseCandidates {
  /** false = checklist apagado (template) o catálogo no disponible/vacío. */
  enabled: boolean;
  /** true = la tabla no existe (drop dual-PC) — avisar, no silenciar. */
  catalogUnavailable: boolean;
  useCases: ApplicableUseCase[];
}

// Duck-typing (patrón del repo, p.ej. api/team con P2002): con driver adapters el
// instanceof puede fallar por doble copia del client, y el code alcanza.
function isTableMissing(e: unknown): boolean {
  const code = (e as { code?: string } | null)?.code;
  return code === "P2021" || code === "42P01";
}

/** Candidatos del checklist para un BC: activos aplicables al tipo + los YA
 *  seleccionados aunque estén inactivos (desactivar un caso del catálogo no debe
 *  hacerlo desaparecer en silencio de un BC en trabajo). */
export async function getUseCaseCandidates(
  businessCaseId: string,
  caseType: string | null,
  templateId: string,
): Promise<UseCaseCandidates> {
  if (templateById(templateId).features?.useCaseChecklist === false) {
    return { enabled: false, catalogUnavailable: false, useCases: [] };
  }

  try {
    const [rows, pivots] = await Promise.all([
      prisma.useCase.findMany({ orderBy: [{ order: "asc" }, { createdAt: "asc" }] }),
      prisma.businessCaseUseCase.findMany({ where: { businessCaseId } }),
    ]);
    const pivotByUseCase = new Map(pivots.map((p) => [p.useCaseId, p]));

    // Filtro EN MEMORIA (tolera caseType null → solo universales, appliesTo=[]).
    const applies = (r: { appliesTo: string[] }) =>
      r.appliesTo.length === 0 || (caseType != null && r.appliesTo.includes(caseType));

    const useCases = rows
      .filter((r) => {
        const pivot = pivotByUseCase.get(r.id);
        const isSelected = pivot?.selected === true;
        // activos aplicables + seleccionados (aunque inactivos o ya-no-aplicables)
        return (r.active && applies(r)) || isSelected;
      })
      .map((r) => {
        const pivot = pivotByUseCase.get(r.id);
        return {
          id: r.id,
          title: r.title,
          description: r.description,
          price: r.price,
          tags: r.tags,
          active: r.active,
          selected: pivot?.selected === true, // sin fila = NO seleccionado
          priceOverride: pivot?.priceOverride ?? null,
        };
      });

    return { enabled: useCases.length > 0, catalogUnavailable: false, useCases };
  } catch (e) {
    if (isTableMissing(e)) {
      return { enabled: false, catalogUnavailable: true, useCases: [] };
    }
    throw e;
  }
}

export interface SelectedUseCase {
  title: string;
  description: string;
  /** Precio efectivo: override del BC ?? precio del catálogo ?? "" */
  price: string;
}

/** Casos seleccionados de un BC (pivote selected + join catálogo). Tabla ausente /
 *  error → [] (la generación NUNCA se cae por el catálogo). */
export async function loadSelectedUseCases(businessCaseId: string): Promise<SelectedUseCase[]> {
  try {
    const pivots = await prisma.businessCaseUseCase.findMany({
      where: { businessCaseId, selected: true },
      include: { useCase: true },
      orderBy: { useCase: { order: "asc" } },
    });
    return pivots.map((p) => ({
      title: p.useCase.title,
      description: p.useCase.description,
      price: p.priceOverride ?? p.useCase.price ?? "",
    }));
  } catch {
    return [];
  }
}

/** Key de la sección de materialización (def `agentGenerated:false` del template). */
export const USE_CASES_SECTION_KEY = "casos_de_uso";

/** `data` determinístico de la sección `casos_de_uso` a partir de los seleccionados.
 *  Cero seleccionados → { items: [] } (blank → invisible interna y externamente). */
export function useCasesSectionData(selected: SelectedUseCase[]): { items: { title: string; detail: string; price: string }[] } {
  return { items: selected.map((u) => ({ title: u.title, detail: u.description, price: u.price })) };
}
