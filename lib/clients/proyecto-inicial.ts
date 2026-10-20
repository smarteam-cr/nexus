/**
 * lib/clients/proyecto-inicial.ts — en qué proyecto abre la ficha del cliente. PURO.
 *
 * Con UN proyecto real la ficha abre en él. Con varios abría siempre en la cuenta, y quien lleva uno de ellos tenía que
 * elegirlo en el riel. Cemaco (2026-10-19): llegó de HubSpot un proyecto de Desarrollo llamado «CEMACO » y la ficha dejó
 * de abrir en «Cemaco Internacional - CRM», el de Liliana Moreno. Entró al nuevo, lo vio vacío (sin cronograma, sin
 * kickoff, sin handoff) y creyó que había perdido su trabajo, que seguía intacto en el otro.
 *
 * Con varios proyectos, el orden (DECISIONS «Cada quien cae en el proyecto que le corresponde»):
 *   1. el que la persona LLEVA (encargado en HubSpot, `hubspotOwnerEmail`);
 *   2. si no lleva ninguno, o lleva varios, el del tipo de SU EQUIPO: Customer Success, los que entrega CS
 *      (implementación, SmartLoop, sitio web, y los de antes sin pipeline); Desarrollo, los de desarrollo e integración;
 *      Ventas, el que nació de una venta suya. El tipo sale de la tabla de pipelines (`equipoDeEntrega`,
 *      lib/projects/kind.ts) y el equipo, del registro de equipos (lib/equipos/registro.ts);
 *   3. si sigue habiendo varios, el más vivo: el que no está parado (en pausa o bloqueado) y, entre esos, el de actividad
 *      más reciente en HubSpot;
 *   4. dirección y la CSL ven toda la cuenta: si no llevan uno, abren en la cuenta. Lo mismo quien no tiene equipo de
 *      entrega (Marketing, Finanzas) y el vendedor sin una venta propia en la cuenta.
 * Un proyecto de prueba nunca cuenta para abrir solo. null = abrir en la cuenta.
 *
 * La elección explícita gana siempre: `?tab=` en la dirección (page.tsx y WorkspaceClient la leen antes que esto).
 */
import { equipoDeRol, type ClaveDeEquipo } from "@/lib/equipos/registro";
import { resolvePipeline } from "@/lib/projects/kind";

export interface ProyectoParaAbrir {
  id: string;
  esPrueba: boolean;
  hubspotOwnerEmail: string | null;
  /** `hs_pipeline`. Sin él (o uno que no está en la tabla) es un proyecto de Customer Success, como siempre. */
  hubspotPipelineId?: string | null;
  /** El correo de quien vendió la venta de la que nació el proyecto (`VentaGanada.vendedor` por `hubspotDealId`). */
  vendedorEmail?: string | null;
  /** `hs_status` de HubSpot: on_hold y blocked cuentan como parado. */
  hubspotStatus?: string | null;
  /** Rótulo de la etapa: «Bloqueado» también cuenta como parado. */
  hubspotPipelineStageLabel?: string | null;
  /** `hs_last_activity_date`. */
  hubspotUltimaActividad?: Date | string | null;
  createdAt?: Date | string | null;
}

export interface QuienMira {
  email: string | null | undefined;
  /** `TeamMember.roleEnum`. Sin rol se comporta como antes: solo el paso 1. */
  rol?: string | null;
}

/** Por qué la ficha abrió en ese proyecto (para la línea de la cabecera y las pruebas). */
export type MotivoDeLaFicha = "unico" | "lo-llevas" | "tu-equipo" | "tu-venta" | null;

export interface ProyectoElegido {
  id: string | null;
  motivo: MotivoDeLaFicha;
}

function normalizar(email: string | null | undefined): string {
  return String(email ?? "").trim().toLowerCase();
}

/** El equipo que trabaja un proyecto, por su pipeline. Lo que no es de Desarrollo lo entrega Customer Success. */
export function equipoDelProyecto(p: Pick<ProyectoParaAbrir, "hubspotPipelineId">): Extract<ClaveDeEquipo, "cs" | "dev"> {
  return resolvePipeline(p.hubspotPipelineId)?.equipoDeEntrega === "desarrollo" ? "dev" : "cs";
}

function parado(p: ProyectoParaAbrir): boolean {
  const s = String(p.hubspotStatus ?? "").toLowerCase();
  if (s === "on_hold" || s === "blocked") return true;
  return String(p.hubspotPipelineStageLabel ?? "").trim().toLowerCase() === "bloqueado";
}

function ms(v: Date | string | null | undefined): number {
  if (!v) return 0;
  const t = new Date(v).getTime();
  return Number.isFinite(t) ? t : 0;
}

/** Paso 3: el más vivo. No parado primero, después la actividad más reciente, después el más nuevo. */
function elMasVivo(candidatos: ProyectoParaAbrir[]): ProyectoParaAbrir {
  return [...candidatos].sort((a, b) => {
    const pa = parado(a) ? 1 : 0;
    const pb = parado(b) ? 1 : 0;
    if (pa !== pb) return pa - pb;
    const act = ms(b.hubspotUltimaActividad) - ms(a.hubspotUltimaActividad);
    if (act !== 0) return act;
    const nuevo = ms(b.createdAt) - ms(a.createdAt);
    if (nuevo !== 0) return nuevo;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  })[0];
}

/** Los que ven toda la cuenta: si no llevan un proyecto, abren en la cuenta. */
const VEN_LA_CUENTA = new Set(["SUPER_ADMIN", "CSL"]);

/** En qué proyecto abre la ficha y por qué. */
export function elegirProyectoDeLaFicha(proyectos: ProyectoParaAbrir[], quien: QuienMira): ProyectoElegido {
  const reales = proyectos.filter((p) => !p.esPrueba);
  if (reales.length === 0) return { id: null, motivo: null };
  if (reales.length === 1) return { id: reales[0].id, motivo: "unico" };

  const yo = normalizar(quien.email);
  const rol = quien.rol ?? null;

  // 1. El que lleva.
  const mios = yo ? reales.filter((p) => normalizar(p.hubspotOwnerEmail) === yo) : [];
  if (mios.length === 1) return { id: mios[0].id, motivo: "lo-llevas" };

  // Sin rol: el comportamiento de antes (solo el paso 1).
  if (!rol) return { id: null, motivo: null };

  // 2. Con varios propios se elige entre ellos; sin ninguno, entre todos los de la cuenta.
  const base = mios.length > 1 ? mios : reales;
  if (mios.length === 0 && VEN_LA_CUENTA.has(rol)) return { id: null, motivo: null };

  const equipo = equipoDeRol(rol)?.clave ?? null;
  let candidatos: ProyectoParaAbrir[] = [];
  let motivo: MotivoDeLaFicha = mios.length > 1 ? "lo-llevas" : "tu-equipo";
  if (equipo === "cs" || equipo === "dev") {
    candidatos = base.filter((p) => equipoDelProyecto(p) === equipo);
  } else if (equipo === "ventas") {
    candidatos = yo ? base.filter((p) => normalizar(p.vendedorEmail) === yo) : [];
    if (mios.length === 0) motivo = "tu-venta";
  }
  // Varios propios y ninguno del tipo del equipo (o un rol sin tipo): el más vivo de los propios.
  if (candidatos.length === 0 && mios.length > 1) candidatos = mios;
  if (candidatos.length === 0) return { id: null, motivo: null };

  // 3. El más vivo.
  return { id: elMasVivo(candidatos).id, motivo };
}

/** El id del proyecto en que abre la ficha, o null para abrir en la cuenta. */
export function proyectoQueAbreLaFicha(proyectos: ProyectoParaAbrir[], quien: QuienMira | string | null | undefined): string | null {
  const q: QuienMira = typeof quien === "object" && quien !== null ? quien : { email: quien };
  return elegirProyectoDeLaFicha(proyectos, q).id;
}

export interface OtroProyecto {
  id: string;
  nombre: string;
  /** El tipo en pocas palabras («Desarrollo e integración»), de la tabla de pipelines. */
  tipo: string;
  /** El primer nombre del encargado en HubSpot, si hay. */
  encargado: string | null;
}

/**
 * Los OTROS proyectos reales de la cuenta, para la línea «Esta cuenta tiene otro proyecto» arriba del proyecto abierto.
 * Sin ella, quien cae en un proyecto que no es el suyo lo ve vacío y cree que perdió su trabajo (Cemaco, 2026-10-19).
 */
export function otrosProyectosDeLaCuenta(
  proyectos: Array<{ id: string; name: string; esPrueba?: boolean; hubspotPipelineId?: string | null; hubspotOwnerName?: string | null }>,
  abiertoId: string | null,
): OtroProyecto[] {
  if (!abiertoId || !proyectos.some((p) => p.id === abiertoId)) return [];
  return proyectos
    .filter((p) => p.id !== abiertoId && !p.esPrueba)
    .map((p) => ({
      id: p.id,
      nombre: p.name.trim() || "Sin nombre",
      tipo: resolvePipeline(p.hubspotPipelineId)?.label ?? "Implementación de HubSpot",
      encargado: (p.hubspotOwnerName ?? "").trim().split(/\s+/)[0] || null,
    }));
}
