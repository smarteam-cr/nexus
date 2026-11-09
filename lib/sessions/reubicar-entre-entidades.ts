/**
 * lib/sessions/reubicar-entre-entidades.ts — QUÉ SE MUEVE CUANDO UNA REUNIÓN CAMBIA DE ENTIDAD. PURO.
 *
 * Lo usa scripts/separar-en-unidades.ts (antes, separar-tec y reubicar-reuniones-compartidas, 2026-10-29): el TEC se separa en
 * «TEC · AE» y «TEC · TAE», y cada reunión pasa a la entidad que dice el resolver (lib/sessions/categorize.ts ›
 * `decidirEntreEntidades`). Lo que cuelga de la reunión (vínculos con proyectos, hechos, tareas…) tiene que ir con ella:
 * un hecho de una reunión de AE que se queda en la ficha de TAE es el contexto de una entidad alimentando a la otra.
 *
 * Reglas:
 *  · La reunión manda. Una fila que cuelga de una reunión va a la ficha dueña de la reunión, y si su proyecto es de
 *    otra ficha del grupo, al proyecto EQUIVALENTE en la nueva (`contraparteEn`).
 *  · Una reunión POR DECIDIR no alimenta a nadie: sus vínculos con proyectos se sueltan, y lo que ya dejó escrito se
 *    queda donde está y se lista (que lo mueva una persona cuando la asigne).
 *  · Una reunión de una ficha con un solo proyecto de trabajo queda vinculada a él (`vinculosQueFaltan`), como el atajo
 *    del clasificador: el proyecto lee sus reuniones por vínculo, y sin esto no vería las que nunca tuvieron uno.
 *  · Solo se toca lo que está en las fichas del grupo: `planDeFilas` nunca mueve una fila de una ficha de afuera.
 */

export interface ProyectoDelGrupo {
  id: string;
  clientId: string;
  /** «Información del cliente» (`serviceType = "__strategy__"`): cada ficha tiene la suya. */
  esDeLaCuenta: boolean;
  /** Activo y de trabajo (no la de la cuenta): el que recibe lo que venía del proyecto de trabajo de la otra ficha. */
  esDeTrabajoActivo: boolean;
}

/**
 * El proyecto de `destino` que equivale a `projectId`. El mismo, si ya es de `destino`; «Información del cliente» ↔
 * «Información del cliente»; un proyecto de trabajo ↔ el ÚNICO proyecto de trabajo activo de `destino`. Null si no hay
 * uno solo que equivalga (no se adivina: la fila se lista y la mueve una persona).
 */
export function contraparteEn(projectId: string, destino: string, proyectos: readonly ProyectoDelGrupo[]): string | null {
  const p = proyectos.find((x) => x.id === projectId);
  if (!p) return null;
  if (p.clientId === destino) return p.id;
  const delDestino = proyectos.filter((x) => x.clientId === destino);
  const iguales = p.esDeLaCuenta ? delDestino.filter((x) => x.esDeLaCuenta) : delDestino.filter((x) => x.esDeTrabajoActivo);
  return iguales.length === 1 ? iguales[0]!.id : null;
}

/**
 * ¿Una reunión de otra ficha que el resolver dejaría SIN dueña? Es el empate de una sigla nueva con un nombre («El AE,
 * Bluesat y Ministerio…»), y la separación no le quita contexto a nadie de afuera. Una que el resolver daría a OTRA ficha
 * no entra: esa es otra deriva, y sellarla la escondería de INV2.
 */
export function pierdeSuDuena(
  s: { resolvedClientId: string | null; manualClientId: string | null },
  nuevo: string | null,
  fichasDelGrupo: ReadonlySet<string>,
): boolean {
  return !s.manualClientId && !!s.resolvedClientId && !fichasDelGrupo.has(s.resolvedClientId) && nuevo === null;
}

export interface VinculoActual {
  id: string;
  sessionId: string;
  projectId: string;
  source: string;
  isPrimary: boolean;
}

export type PlanDeVinculo =
  | { id: string; accion: "mover"; de: string; a: string }
  | { id: string; accion: "soltar"; motivo: "por-decidir" | "ya-tiene-el-equivalente" | "sin-equivalente" | "de-otra-ficha" }
  /* El principal se soltó porque ya estaba el equivalente: la reunión no puede quedar sin principal. */
  | { id: string; accion: "hacer-principal" };

/**
 * Los vínculos reunión↔proyecto de las reuniones de `dueno` (sessionId → la ficha nueva, o null si queda por decidir).
 * Los que ya están en la ficha correcta no aparecen. Una reunión que entra al grupo desde otra ficha suelta el vínculo
 * con el proyecto de esa ficha (es de otro dueño: INV1); una por decidir no toca lo de afuera.
 */
export function planDeVinculos(
  vinculos: readonly VinculoActual[],
  dueno: ReadonlyMap<string, string | null>,
  proyectos: readonly ProyectoDelGrupo[],
): PlanDeVinculo[] {
  const clienteDe = new Map(proyectos.map((p) => [p.id, p.clientId]));
  /* Lo que cada reunión tendrá al terminar: los que se quedan y los que llegan por este plan. */
  const tendra = new Set(
    vinculos
      .filter((v) => dueno.has(v.sessionId) && clienteDe.get(v.projectId) === dueno.get(v.sessionId))
      .map((v) => `${v.sessionId}|${v.projectId}`),
  );
  const plan: PlanDeVinculo[] = [];
  const porPromover: { sessionId: string; projectId: string }[] = [];
  for (const v of [...vinculos].sort((a, b) => a.id.localeCompare(b.id))) {
    if (!dueno.has(v.sessionId)) continue;
    const nuevo = dueno.get(v.sessionId) ?? null;
    if (!clienteDe.has(v.projectId)) {
      if (nuevo !== null) plan.push({ id: v.id, accion: "soltar", motivo: "de-otra-ficha" });
      continue;
    }
    if (nuevo === null) {
      plan.push({ id: v.id, accion: "soltar", motivo: "por-decidir" });
      continue;
    }
    if (clienteDe.get(v.projectId) === nuevo) continue;
    const a = contraparteEn(v.projectId, nuevo, proyectos);
    if (!a) {
      plan.push({ id: v.id, accion: "soltar", motivo: "sin-equivalente" });
      continue;
    }
    const llave = `${v.sessionId}|${a}`;
    if (tendra.has(llave)) {
      plan.push({ id: v.id, accion: "soltar", motivo: "ya-tiene-el-equivalente" });
      if (v.isPrimary) porPromover.push({ sessionId: v.sessionId, projectId: a });
      continue;
    }
    tendra.add(llave);
    plan.push({ id: v.id, accion: "mover", de: v.projectId, a });
  }
  /* Después de mover y soltar: una reunión que perdió su principal lo recupera en el vínculo equivalente. */
  const soltados = new Set(plan.filter((p) => p.accion === "soltar").map((p) => p.id));
  const movidos = new Map(plan.flatMap((p) => (p.accion === "mover" ? [[p.id, p.a] as const] : [])));
  for (const { sessionId, projectId } of porPromover) {
    const quedan = vinculos.filter((v) => v.sessionId === sessionId && !soltados.has(v.id));
    if (quedan.some((v) => v.isPrimary)) continue;
    const equivalente = quedan.find((v) => (movidos.get(v.id) ?? v.projectId) === projectId);
    if (equivalente) plan.push({ id: equivalente.id, accion: "hacer-principal" });
  }
  return plan;
}

/**
 * Las reuniones con dueña que, después de `plan`, no quedan vinculadas al proyecto de trabajo de su ficha. Solo si la
 * ficha tiene UNO: con varios, decidir cuál es del clasificador. Un vínculo apagado por una persona cuenta como vínculo
 * (no se reabre lo que alguien excluyó).
 */
export function vinculosQueFaltan(
  vinculos: readonly VinculoActual[],
  plan: readonly PlanDeVinculo[],
  dueno: ReadonlyMap<string, string | null>,
  proyectos: readonly ProyectoDelGrupo[],
): { sessionId: string; projectId: string }[] {
  const soltados = new Set(plan.filter((p) => p.accion === "soltar").map((p) => p.id));
  const movidos = new Map(plan.flatMap((p) => (p.accion === "mover" ? [[p.id, p.a] as const] : [])));
  const tiene = new Set(
    vinculos.filter((v) => !soltados.has(v.id)).map((v) => `${v.sessionId}|${movidos.get(v.id) ?? v.projectId}`),
  );
  const out: { sessionId: string; projectId: string }[] = [];
  for (const [sessionId, clientId] of dueno) {
    if (!clientId) continue;
    const deTrabajo = proyectos.filter((p) => p.clientId === clientId && p.esDeTrabajoActivo);
    if (deTrabajo.length !== 1) continue;
    if (!tiene.has(`${sessionId}|${deTrabajo[0]!.id}`)) out.push({ sessionId, projectId: deTrabajo[0]!.id });
  }
  return out;
}

export interface FilaQueCuelga {
  id: string;
  clientId: string;
  projectId: string | null;
  sessionId: string | null;
}

export type PlanDeFila =
  | { id: string; accion: "mover"; clientId: string; projectId: string | null }
  | { id: string; accion: "queda"; motivo: "por-decidir" | "sin-equivalente" };

/**
 * Las filas de una tabla con `clientId` que cuelgan de una reunión del grupo. `projectIdObligatorio`: la columna no
 * acepta null, así que sin proyecto equivalente la fila se queda (y se lista). Las que ya están bien no aparecen, y una
 * fila de una ficha de afuera del grupo tampoco: el `clientId` de otra empresa no se reescribe nunca.
 */
export function planDeFilas(
  filas: readonly FilaQueCuelga[],
  dueno: ReadonlyMap<string, string | null>,
  proyectos: readonly ProyectoDelGrupo[],
  projectIdObligatorio: boolean,
  fichasDelGrupo: ReadonlySet<string>,
): PlanDeFila[] {
  const clienteDe = new Map(proyectos.map((p) => [p.id, p.clientId]));
  const plan: PlanDeFila[] = [];
  for (const f of filas) {
    if (!f.sessionId || !dueno.has(f.sessionId) || !fichasDelGrupo.has(f.clientId)) continue;
    const nuevo = dueno.get(f.sessionId) ?? null;
    const proyectoBien = f.projectId === null || clienteDe.get(f.projectId) === nuevo;
    if (nuevo !== null && f.clientId === nuevo && proyectoBien) continue;
    if (nuevo === null) {
      plan.push({ id: f.id, accion: "queda", motivo: "por-decidir" });
      continue;
    }
    let projectId: string | null = f.projectId;
    if (f.projectId !== null && !proyectoBien) {
      const delGrupo = clienteDe.has(f.projectId);
      projectId = delGrupo ? contraparteEn(f.projectId, nuevo, proyectos) : null;
      /* Un proyecto de afuera del grupo no se adivina; uno obligatorio sin equivalente, tampoco. */
      if (projectId === null && (projectIdObligatorio || !delGrupo)) {
        plan.push({ id: f.id, accion: "queda", motivo: "sin-equivalente" });
        continue;
      }
    }
    plan.push({ id: f.id, accion: "mover", clientId: nuevo, projectId });
  }
  return plan;
}
