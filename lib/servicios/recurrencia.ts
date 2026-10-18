/**
 * lib/servicios/recurrencia.ts — RECOMENDAR LA RECURRENCIA: cuándo Nexus le propone al CSE pasar un servicio temporal a
 * un servicio recurrente, y con qué porqué (docs/smartloop-plan.md, etapa 6). PURO y CLIENT-SAFE.
 *
 * Land and Expand: al terminar una implementación de Customer Success, Nexus propone seguir con SmartLoop. Sale en el
 * «Qué sigue» del proyecto y en «Para ti» del CSE, y es una propuesta como cualquier otra (lib/lo-propuesto): se usa o
 * se descarta, y deja de pedir revisión a los 30 días. Usarla NO escribe en HubSpot: deja una tarea al CSE o abre el
 * alta del servicio, que sigue siendo de una persona.
 *
 * Cuándo califica un proyecto (`calificaParaRecurrencia`):
 *   · es una implementación de Customer Success (el pipeline de CS; no un desarrollo, un sitio ni un recurrente);
 *   · no es de prueba ni interno;
 *   · está en «Entrega», o cerró en «Finalizado» hace 60 días o menos;
 *   · la cuenta no tiene ya un servicio recurrente vivo (un proyecto de SmartLoop abierto, uno en «Continuidad» o con
 *     la etiqueta `recurrente`): ahí no hay nada que recomendar, eso es la migración.
 *
 * El porqué se arma con datos y SIN IA: la escala de la empresa (lo que la frena y lo que sigue), lo que quedó fuera de
 * alcance, los casos de uso sugeridos (de la cuenta y del catálogo) y la adopción. La adopción sale de HubSpot Partner,
 * que solo ven la líder de Customer Success, dirección y el CSE de la cuenta: para los demás no viaja.
 */
import { pipelineByKey, resolvePipeline } from "@/lib/projects/kind";
import { RECURRENTE_TAG } from "@/lib/tags/catalog";
import type { ClaveDeServicio } from "./tipos";

/** Cuántos días después de cerrar en «Finalizado» todavía se recomienda. */
export const DIAS_DESPUES_DEL_CIERRE = 60;

/** El servicio que se recomienda hoy. Un servicio recurrente nuevo puede cambiar esta regla por tipo de proyecto. */
export const SERVICIO_RECOMENDADO: ClaveDeServicio = "smartloop";

const CS = pipelineByKey("customer-success");
const etapaPorNombre = (nombre: string) => CS.stages.find((s) => s.label === nombre)?.id ?? null;
/** Las etapas del pipeline de CS que disparan la recomendación (por nombre: los ids viven solo en la tabla). */
export const ETAPA_DE_ENTREGA = etapaPorNombre("Entrega");
export const ETAPA_FINALIZADO = etapaPorNombre("Finalizado");
export const ETAPA_CONTINUIDAD = etapaPorNombre("Continuidad");

export interface ProyectoParaRecurrencia {
  hubspotPipelineId: string | null;
  hubspotPipelineStageId: string | null;
  /** AAAA-MM-DD o ISO: desde cuándo está en la etapa de hoy (HubSpot). null = no se sabe. */
  etapaDesde: string | null;
  esPrueba: boolean;
  proyectoInterno: boolean;
}

/** Lo que importa de los OTROS proyectos de la cuenta: si ya hay un servicio recurrente vivo. */
export interface ProyectoDeLaCuenta {
  hubspotPipelineId: string | null;
  hubspotPipelineStageId: string | null;
  tags: readonly string[];
  /** Abierto en Nexus (no cerrado por su etapa ni por su estado). */
  abierto: boolean;
  esPrueba: boolean;
}

export type MotivoDeRecurrencia = "entrega" | "cierre";

export interface Calificacion {
  motivo: MotivoDeRecurrencia;
  /** AAAA-MM-DD: cuándo nació la propuesta (el día que llegó a la etapa). null = no se sabe (no vence). */
  nacio: string | null;
}

const dia = (f: string | null) => (f ? f.slice(0, 10) : null);

function diasEntre(desde: string, hasta: string): number {
  const a = Date.parse(`${desde}T00:00:00Z`);
  const b = Date.parse(`${hasta}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/** ¿La cuenta ya tiene un servicio recurrente vivo? (SmartLoop abierto, «Continuidad» o la etiqueta `recurrente`.) */
export function tieneServicioRecurrente(otros: readonly ProyectoDeLaCuenta[]): boolean {
  return otros.some(
    (p) =>
      p.abierto &&
      !p.esPrueba &&
      (!!resolvePipeline(p.hubspotPipelineId)?.servicioRecurrente ||
        (!!ETAPA_CONTINUIDAD && p.hubspotPipelineStageId === ETAPA_CONTINUIDAD) ||
        p.tags.includes(RECURRENTE_TAG)),
  );
}

/** ¿Este proyecto pide la recomendación hoy? null = no. */
export function calificaParaRecurrencia(
  p: ProyectoParaRecurrencia,
  otros: readonly ProyectoDeLaCuenta[],
  hoyISO: string,
): Calificacion | null {
  if (p.esPrueba || p.proyectoInterno) return null;
  if (resolvePipeline(p.hubspotPipelineId)?.key !== "customer-success") return null;
  if (tieneServicioRecurrente(otros)) return null;
  const desde = dia(p.etapaDesde);
  if (ETAPA_DE_ENTREGA && p.hubspotPipelineStageId === ETAPA_DE_ENTREGA) return { motivo: "entrega", nacio: desde };
  if (ETAPA_FINALIZADO && p.hubspotPipelineStageId === ETAPA_FINALIZADO) {
    // Sin la fecha del cierre no se sabe si es de hace una semana o de hace dos años: no se recomienda.
    if (!desde) return null;
    const dias = diasEntre(desde, hoyISO.slice(0, 10));
    if (dias < 0 || dias > DIAS_DESPUES_DEL_CIERRE) return null;
    return { motivo: "cierre", nacio: desde };
  }
  return null;
}

// ── El porqué ────────────────────────────────────────────────────────────────

export interface AreaDelPorque {
  area: string;
  /** El nombre del nivel de hoy («Inicial»). null = sin ubicar. */
  nivel: string | null;
  /** Adónde se empuja («Funcional»). null = sostener. */
  siguiente: string | null;
  /** Las dimensiones que lo frenan. */
  frenan: string[];
}

export interface CasoDelPorque {
  titulo: string;
  /** Por qué calza (del camino de la escala) o el resultado que persigue. */
  razon: string | null;
  /** De la cuenta (un caso sugerido o en el plan) o de la biblioteca de Smarteam. */
  deDonde: "cuenta" | "catalogo";
}

export interface PorqueDeRecurrencia {
  escala: AreaDelPorque[];
  fueraDeAlcance: { pedido: string; estado: string }[];
  /** Cuántos pedidos fuera de alcance abiertos hay en total (la lista trae como mucho 5). */
  fueraDeAlcanceTotal: number;
  casos: CasoDelPorque[];
  /** De HubSpot Partner. null = no hay datos o quien mira no puede verlos. */
  adopcion: { uso: number | null; activacion: number | null; semana: string } | null;
}

export const PORQUE_VACIO: PorqueDeRecurrencia = { escala: [], fueraDeAlcance: [], fueraDeAlcanceTotal: 0, casos: [], adopcion: null };

/** El umbral bajo el cual el uso de HubSpot se lee como «bajo» (el mismo corte de Éxito del cliente). */
export const USO_BAJO = 50;

const enLista = (xs: readonly string[]) => (xs.length <= 1 ? (xs[0] ?? "") : `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`);

/** Las líneas del porqué, en el orden en que se leen. Vacío = no hay datos para armarlo. */
export function lineasDelPorque(p: PorqueDeRecurrencia): string[] {
  const lineas: string[] = [];
  const conNivel = p.escala.filter((a) => a.nivel);
  for (const a of conNivel.slice(0, 2)) {
    const frenan = a.frenan.length ? `; la frena${a.frenan.length > 1 ? "n" : ""} ${enLista(a.frenan.slice(0, 2).map((d) => `«${d}»`))}` : "";
    lineas.push(a.siguiente ? `${a.area} está en ${a.nivel}${frenan}: lo que sigue es llevarla a ${a.siguiente}.` : `${a.area} está en ${a.nivel}: lo que sigue es sostenerla.`);
  }
  if (p.fueraDeAlcanceTotal > 0) {
    const primero = p.fueraDeAlcance[0]?.pedido;
    const n = p.fueraDeAlcanceTotal;
    lineas.push(`${n === 1 ? "Quedó 1 pedido" : `Quedaron ${n} pedidos`} fuera de alcance${primero ? `, como «${primero}»` : ""}: un ciclo los puede tomar.`);
  }
  if (p.casos.length) {
    lineas.push(`Casos de uso para el primer ciclo: ${enLista(p.casos.slice(0, 3).map((c) => `«${c.titulo}»`))}.`);
  }
  if (p.adopcion && p.adopcion.uso !== null) {
    lineas.push(
      p.adopcion.uso < USO_BAJO
        ? `El uso de HubSpot está bajo (${Math.round(p.adopcion.uso)} de 100): la adopción necesita acompañamiento.`
        : `El uso de HubSpot va en ${Math.round(p.adopcion.uso)} de 100: hay base para crecer.`,
    );
  }
  return lineas;
}

/** El texto del «Qué sigue» y de «Para ti». */
export function textoDeLaRecomendacion(o: { motivo: MotivoDeRecurrencia; empresa: string; servicio: string }): string {
  return o.motivo === "entrega"
    ? `El proyecto llegó a su entrega: propónle a ${o.empresa} seguir con ${o.servicio}.`
    : `El proyecto cerró: propónle a ${o.empresa} seguir con ${o.servicio} antes de que se enfríe la cuenta.`;
}

/** El título de la tarea que deja «Dejar la tarea». */
export function tituloDeLaTarea(o: { empresa: string; servicio: string }): string {
  return `Proponerle ${o.servicio} a ${o.empresa}`;
}

/** El contexto de esa tarea: el porqué en una o dos frases (va en `Tarea.contexto` vía `notas`). */
export function notasDeLaTarea(p: PorqueDeRecurrencia): string | null {
  const l = lineasDelPorque(p);
  return l.length ? l.join("\n") : null;
}

/** La dirección del alta del servicio en Nexus: abre «Nuevo proyecto» con el tipo elegido y la empresa buscada. */
export function urlDelAlta(o: { dominio: string | null; servicio: ClaveDeServicio }): string {
  const q = new URLSearchParams({ alta: o.servicio });
  if (o.dominio) q.set("dominio", o.dominio);
  return `/clients?${q.toString()}`;
}

// ── Quién decide ─────────────────────────────────────────────────────────────

/** La deciden Customer Success y dirección: es el siguiente servicio de la cuenta. */
export const ROLES_QUE_DECIDEN = ["CSE", "CSL", "SUPER_ADMIN"] as const;

export function puedeDecidirRecurrencia(rol: string | null | undefined): boolean {
  return !!rol && (ROLES_QUE_DECIDEN as readonly string[]).includes(rol);
}

export type AccionDeRecurrencia = "tarea" | "alta" | "descartar";

export function esAccionDeRecurrencia(v: unknown): v is AccionDeRecurrencia {
  return v === "tarea" || v === "alta" || v === "descartar";
}
