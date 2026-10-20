/**
 * lib/cuentas/pase.ts — qué cambió de manos cuando cambia quien lleva una cuenta (2026-10-19). PURO.
 *
 * Una cuenta cambia de encargado de dos formas: el pase en Nexus (la celda «CSE encargado», que escribe en HubSpot) o
 * alguien lo cambia directo en HubSpot y el espejo lo trae. En las dos, lo abierto que el anterior tenía POR LLEVARLA
 * pasa al nuevo (lib/tareas/pase.ts dice qué tareas; lib/cuentas/pase-server.ts lo aplica). Acá se decide de quién a
 * quién, comparando los proyectos ANTES y DESPUÉS:
 *   · un proyecto cuyo dueño cambió (o que se fusionó en HubSpot en otro): sus tareas van del dueño de antes al de ahora;
 *   · la cuenta: quien llevaba algún proyecto de CS antes y ya no lleva ninguno le pasa lo de la cuenta al encargado
 *     nuevo (lib/cuentas/encargado.ts);
 *   · una tarea de un proyecto que su responsable SIGUE llevando no se mueve (un desarrollador que también lleva el
 *     Desarrollo de la cuenta, por ejemplo).
 * Nunca hacia alguien de baja ni hacia nadie: sin encargado nuevo, lo abierto se queda donde está.
 */
import { encargadoDeLaCuenta, proyectoQueDefine, type ProyectoQueLleva } from "./encargado";

export interface ProyectoDelPase extends ProyectoQueLleva {
  id: string;
  hubspotServiceId: string | null;
  /** El id del dueño en HubSpot («CSE Encargado», o «CSL Encargado» si está vacío). */
  ownerId?: string | null;
}

/** Una fila que el espejo dio de baja porque en HubSpot se fusionó en otro proyecto. */
export interface FusionDelPase {
  viejoProjectId: string;
  nuevoHubspotId: string;
}

export interface CambioDeManos {
  de: string;
  a: string;
}

export interface PlanDelPase {
  /** Lo de la cuenta: de quienes ya no llevan ningún proyecto de CS, al encargado nuevo. */
  cuenta: { de: string[]; a: string } | null;
  /** Por proyecto (id de Nexus): de su dueño de antes al de ahora. */
  porProyecto: Map<string, CambioDeManos>;
  /** Quién lleva cada proyecto activo después (cualquier pipeline): sus tareas no se mueven. */
  queSiguen: Map<string, string>;
}

const norm = (e: string | null | undefined) => (e ?? "").trim().toLowerCase();

export const SIN_PASE: PlanDelPase = { cuenta: null, porProyecto: new Map(), queSiguen: new Map() };

/**
 * Comparar los proyectos antes y después de la sincronización. `deBaja`: correo → nombre de quienes se fueron;
 * `activos`: los correos del equipo activo (nunca se le pasa nada a alguien que no está en Nexus).
 *
 * ⚠ Revisión del 2026-10-19: un pase automático se hace SOLO con un cambio de verdad.
 *   · Un proyecto cambió de dueño solo si cambió el id del dueño en HubSpot. Si cambió el correo con el mismo id (no se
 *     pudo leer el dueño y el espejo cayó al dueño estándar del proyecto) o el correo se perdió, la foto no es confiable
 *     y no hay pase: la sincronización siguiente lo devolvería, y la semana y la agenda ya se habrían perdido.
 *   · Lo de la cuenta pasa solo si cambió QUIÉN la lleva y el de antes ya no lleva ningún proyecto de CS: cerrar el
 *     proyecto de otra persona, o uno nuevo de otro CSE, no es un pase.
 */
export function planDelPase(
  antes: readonly ProyectoDelPase[],
  despues: readonly ProyectoDelPase[],
  o: { deBaja?: ReadonlyMap<string, string>; activos?: ReadonlySet<string>; fusiones?: readonly FusionDelPase[] } = {},
): PlanDelPase {
  const deBaja = o.deBaja ?? new Map<string, string>();
  const vivo = (e: string) => !!e && !deBaja.has(e) && (!o.activos || o.activos.has(e));
  const queSiguen = new Map<string, string>();
  for (const p of despues) if (p.activo && norm(p.email)) queSiguen.set(p.id, norm(p.email));

  const antesPorId = new Map(antes.map((p) => [p.id, p]));
  const despuesPorId = new Map(despues.map((p) => [p.id, p]));
  // ¿La foto es confiable? Todo correo que cambió tiene que venir con otro id de dueño.
  for (const p of antes) {
    const d = despuesPorId.get(p.id);
    if (!d || norm(d.email) === norm(p.email)) continue;
    const otroDueno = !!p.ownerId && !!d.ownerId && p.ownerId !== d.ownerId;
    if (!otroDueno) return { ...SIN_PASE, queSiguen };
  }

  const porProyecto = new Map<string, CambioDeManos>();
  for (const p of despues) {
    if (!proyectoQueDefine(p)) continue;
    const a = norm(p.email);
    const de = norm(antesPorId.get(p.id)?.email);
    if (de && de !== a && vivo(a)) porProyecto.set(p.id, { de, a });
  }
  for (const f of o.fusiones ?? []) {
    const viejo = antesPorId.get(f.viejoProjectId);
    const nuevo = despues.find((p) => p.hubspotServiceId === f.nuevoHubspotId && proyectoQueDefine(p));
    const de = norm(viejo?.email);
    const a = norm(nuevo?.email);
    if (de && a && de !== a && vivo(a)) porProyecto.set(f.viejoProjectId, { de, a });
  }

  const despuesLleva = new Set(despues.filter(proyectoQueDefine).map((p) => norm(p.email)));
  // Quien la llevaba, aunque se haya ido: lo suyo de la cuenta pasa al nuevo (si no, el lunes iría a «Por asignar»).
  const deAntes = encargadoDeLaCuenta(antes).email;
  const deAhora = encargadoDeLaCuenta(despues, deBaja).email;
  const de = new Set<string>();
  if (deAntes && deAntes !== deAhora && !despuesLleva.has(deAntes)) de.add(deAntes);
  // El dueño de una fila fusionada en HubSpot que ya no lleva nada: lo suyo de la cuenta también pasa (Librería).
  for (const f of o.fusiones ?? []) {
    const e = norm(antesPorId.get(f.viejoProjectId)?.email);
    if (e && e !== deAhora && !despuesLleva.has(e)) de.add(e);
  }
  const cuenta = deAhora && vivo(deAhora) && de.size ? { de: [...de], a: deAhora } : null;
  return { cuenta, porProyecto, queSiguen };
}

/** El pase explícito (la celda, o una corrección a mano): todo lo de la cuenta de los anteriores al nuevo. */
export function planExplicito(de: readonly string[], a: string, queSiguen: ReadonlyMap<string, string> = new Map()): PlanDelPase {
  const nuevo = norm(a);
  const anteriores = [...new Set(de.map(norm))].filter((e) => e && e !== nuevo);
  return { cuenta: nuevo && anteriores.length ? { de: anteriores, a: nuevo } : null, porProyecto: new Map(), queSiguen: new Map(queSiguen) };
}

/** ¿Hay algo que cambie de manos? */
export function hayPase(plan: PlanDelPase): boolean {
  return !!plan.cuenta || plan.porProyecto.size > 0;
}

/** A quién va una tarea de la cuenta que se muda, o null si se queda con su responsable. */
export function destinoDelPase(plan: PlanDelPase, t: { responsableEmail: string; projectId: string | null }): string | null {
  const resp = norm(t.responsableEmail);
  if (t.projectId) {
    const cambio = plan.porProyecto.get(t.projectId);
    if (cambio && cambio.de === resp) return cambio.a;
    if (plan.queSiguen.get(t.projectId) === resp) return null;
  }
  if (plan.cuenta && plan.cuenta.de.includes(resp)) return plan.cuenta.a;
  return null;
}

/**
 * Los pares de → a de la CUENTA (para los avisos y las alertas, que son de la cuenta y no de un proyecto). Un cambio de
 * dueño de un solo proyecto no muda los avisos ni las alertas de la persona: sigue llevando la cuenta en otro proyecto.
 */
export function paresDelPase(plan: PlanDelPase): CambioDeManos[] {
  return (plan.cuenta?.de ?? []).map((de) => ({ de, a: plan.cuenta!.a }));
}
