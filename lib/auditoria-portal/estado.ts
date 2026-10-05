/**
 * lib/auditoria-portal/estado.ts — QUÉ SE PUEDE MOSTRAR DE UNA AUDITORÍA, SECCIÓN POR SECCIÓN.
 *
 * La foto guardada trae números leídos (`null` = no se pudo leer) y la lista de lo que falló. Esta
 * función es el ÚNICO lugar que decide si una sección está completa. La usan la pantalla y el
 * análisis con IA: si cada uno decidiera por su cuenta, uno mostraría un gráfico que el otro dio
 * por incompleto.
 *
 * La regla es «completa o nada». Un gráfico de etapas con una etapa sin leer no es un gráfico
 * incompleto: es un gráfico falso, porque esos contactos se suman a «sin etapa». Lo mismo con la
 * asignación de propietarios: un total que suma solo a los que salieron es un número inventado.
 */
import type {
  ConteoDeEtapaLeido,
  LifecycleSnapshot,
  LifecycleStageCount,
  OwnerAssignmentStats,
  PropietariosLeidos,
} from "@/lib/hubspot/portal-analyzer";
import type { LecturaFallida } from "./lecturas";

export interface EstadoDeLaAuditoria {
  /**
   * `false` en las auditorías anteriores al registro de lecturas (2026-10-03): sus números se
   * muestran como siempre, pero un cero pudo ser un error de lectura y la pantalla lo avisa.
   */
  conRegistroDeLecturas: boolean;
  /** Lecturas intentadas por la corrida (0 en las auditorías viejas). */
  intentos: number;
  totales: {
    contactos: number | null;
    empresas: number | null;
    negocios: number | null;
    tickets: number | null;
  };
  /** `null` = la sección no se puede mostrar (alguna lectura de la que depende falló). */
  contactosPorEtapa: LifecycleStageCount[] | null;
  empresasPorEtapa: LifecycleStageCount[] | null;
  /** `null` = no se pudo leer la lista de workflows. `[]` = se leyó y no hay ninguno. */
  workflowsDelCicloDeVida: string[] | null;
  /**
   * `completo` con los datos, `sin_leer` si alguna lectura falló, `no_capturado` si la auditoría
   * es de antes de que existiera esta sección.
   */
  propietarios:
    | { estado: "completo"; datos: OwnerAssignmentStats }
    | { estado: "sin_leer" }
    | { estado: "no_capturado" };
  /** Todo lo que no se pudo leer, en el orden en que pasó. */
  fallidas: LecturaFallida[];
}

function etapasCompletas(
  etapas: ConteoDeEtapaLeido[],
  total: number | null,
  etapasDelPortalLeidas: boolean,
): LifecycleStageCount[] | null {
  if (total === null || !etapasDelPortalLeidas) return null;
  const completas: LifecycleStageCount[] = [];
  for (const e of etapas) {
    if (e.count === null) return null;
    completas.push({ value: e.value, label: e.label, count: e.count });
  }
  return completas;
}

function propietariosCompletos(
  p: PropietariosLeidos,
  listaLeida: boolean,
): OwnerAssignmentStats | null {
  if (!listaLeida || p.unassigned === null) return null;
  const owners: OwnerAssignmentStats["owners"] = [];
  for (const o of p.owners) {
    if (o.contactCount === null) return null;
    owners.push({ ownerId: o.ownerId, ownerName: o.ownerName, email: o.email, contactCount: o.contactCount });
  }
  const meses = (lista: PropietariosLeidos["monthlyCreated"]) => {
    const out: OwnerAssignmentStats["monthlyCreated"] = [];
    for (const m of lista) {
      if (m.count === null) return null;
      out.push({ month: m.month, label: m.label, count: m.count });
    }
    return out;
  };
  const monthlyAssignments = meses(p.monthlyAssignments);
  const monthlyCreated = meses(p.monthlyCreated ?? []);
  if (!monthlyAssignments || !monthlyCreated) return null;
  return { owners, unassigned: p.unassigned, totalAssigned: p.totalAssigned, monthlyAssignments, monthlyCreated };
}

/** Lo que el estado necesita de una foto (la de la auditoría o una de prueba). */
export type FotoParaEstado = Pick<LifecycleSnapshot, "lifecycleStats" | "ownerStats" | "lecturas">;

export function leerEstadoDeLaAuditoria(foto: FotoParaEstado): EstadoDeLaAuditoria {
  const stats = foto.lifecycleStats;
  const fallidas = foto.lecturas?.fallidas ?? [];
  const fallo = (bloque: LecturaFallida["bloque"]) => fallidas.some((f) => f.bloque === bloque);

  const totales = {
    contactos: stats.totalContacts ?? null,
    empresas: stats.totalCompanies ?? null,
    negocios: stats.totalDeals ?? null,
    tickets: stats.totalTickets ?? null,
  };

  const etapasDelPortalLeidas = !fallo("etapas_del_portal");

  let propietarios: EstadoDeLaAuditoria["propietarios"];
  if (!foto.ownerStats) {
    propietarios = { estado: "no_capturado" };
  } else {
    // Cualquier falla del bloque deja la sección sin leer. Los conteos fallidos ya vienen en `null`,
    // pero la LISTA de propietarios que falla deja `owners: []`, y eso sin la marca se leería como
    // «nadie tiene contactos asignados».
    const datos = propietariosCompletos(foto.ownerStats, !fallo("propietarios"));
    propietarios = datos ? { estado: "completo", datos } : { estado: "sin_leer" };
  }

  return {
    conRegistroDeLecturas: !!foto.lecturas,
    intentos: foto.lecturas?.intentos ?? 0,
    totales,
    contactosPorEtapa: etapasCompletas(stats.contacts ?? [], totales.contactos, etapasDelPortalLeidas),
    empresasPorEtapa: etapasCompletas(stats.companies ?? [], totales.empresas, etapasDelPortalLeidas),
    workflowsDelCicloDeVida: stats.lifecycleWorkflows ?? null,
    propietarios,
    fallidas,
  };
}
