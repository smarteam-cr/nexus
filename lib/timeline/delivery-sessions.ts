/**
 * lib/timeline/delivery-sessions.ts
 *
 * Cuenta, por fase del cronograma, las SESIONES DE ENTREGA DE SERVICIO realmente
 * ejecutadas: una sesión cuenta si su fecha cae en la ventana de la fase Y tiene
 * ≥1 participante del equipo de entrega (CSE ∪ Desarrollo) Y ≥1 participante del
 * cliente (externo, no interno). Es el "real ejecutado" que reemplaza al estimado
 * del agente en las fases ya iniciadas.
 *
 * Fuente de sesiones: el chokepoint `getProjectHandoffSessions` (sesiones ligadas
 * al proyecto vía SessionProject, ya filtradas por ownership del cliente) — NO se
 * re-implementa el matching sesión→cliente (invariante medular).
 *
 * Se CALCULA en lectura (GET /timeline); no se persiste. Requiere anchorStartDate.
 *
 * ── EL NÚMERO ES POR FASE, Y NO SE SUMA (2026-08-11) ─────────────────────────
 * Cuando dos fases corren en PARALELO (Nexus lo soporta a propósito vía `startWeek`)
 * una misma reunión cae en la ventana de las dos, y las dos la cuentan. Eso NO es un
 * bug: la afirmación por fase es "esto ocurrió mientras la fase estaba activa", y es
 * cierta en las dos. Sumar las once fases y comparar contra el total del proyecto sí
 * da un número inflado (Wherex: 110 sobre 65 reales), pero ese total no existe en
 * ninguna pantalla — nadie lo muestra, porque no significa nada.
 *
 * Se probó forzar "una reunión, una fase" (gana la ventana más corta) y el remedio
 * salió peor que la enfermedad: en Wherex, «Desarrollo / Integración» —22 tareas—
 * quedaba en CERO sesiones, porque cada una de sus semanas también estaba cubierta
 * por una fase más corta. Un 0 se lee como "acá no se hizo nada", que es una mentira
 * más grande que el número compartido. Se descartó.
 *
 * Lo que sí faltaba es DECIRLO: `ventanasCompartidas` marca, por fase, con cuáles
 * otras comparte semanas, y la UI lo pone en el tooltip del contador. Así el número
 * repetido deja de parecer un error de cálculo y pasa a señalar lo que de verdad
 * pasa — dos fases pisadas, que muchas veces son la MISMA fase duplicada (ver
 * scripts/fusionar-fases-cronograma.ts).
 */
import { prisma } from "@/lib/db/prisma";
import { getProjectHandoffSessions } from "@/lib/sessions/project-sources";
import { classifyTeamEmailsByArea } from "@/lib/sessions/areas";
import { soloOcurridas } from "@/lib/sessions/ocurridas";
import { addWeeks, computePhaseRanges, currentWeekIndex } from "@/lib/timeline/weeks";

interface PhaseLite {
  id: string;
  durationWeeks: number;
  startWeek?: number | null; // inicio explícito (paralelo); null = contigua
}

/** Una fase ya resuelta a semanas absolutas: `[start, end)`, en el orden del cronograma. */
export interface VentanaDeFase {
  id: string;
  start: number;
  end: number;
}

/**
 * ¿Con qué OTRAS fases comparte semanas cada una? PURA.
 *
 * Devuelve, por fase, los ids de las que se le pisan en al menos una semana — que son
 * exactamente aquellas con las que puede estar declarando las MISMAS reuniones. Es lo
 * que convierte un número repetido de "parece un error de cálculo" en "estas dos fases
 * corren encima". Vacío = la fase tiene su ventana para ella sola y su número es limpio.
 *
 * Solape = intersección no vacía de `[start, end)`. Tocarse por el borde (una termina en
 * S5 y la otra arranca en S5) NO es solape: no comparten ninguna semana.
 */
export function ventanasCompartidas(ventanas: readonly VentanaDeFase[]): Map<string, string[]> {
  const out = new Map<string, string[]>(ventanas.map((v) => [v.id, []]));
  for (let i = 0; i < ventanas.length; i++) {
    for (let j = i + 1; j < ventanas.length; j++) {
      const a = ventanas[i], b = ventanas[j];
      if (Math.min(a.end, b.end) - Math.max(a.start, b.start) > 0) {
        out.get(a.id)!.push(b.id);
        out.get(b.id)!.push(a.id);
      }
    }
  }
  return out;
}

/**
 * Devuelve un Map<phaseId, number | null>:
 *  - número = sesiones de entrega ejecutadas en la ventana de la fase (fase iniciada).
 *  - null   = fase aún no iniciada (futura) → la UI usa el estimado.
 * Devuelve null entero si no hay anchorStartDate (sin ventana de fechas posible).
 */
export async function countDeliverySessionsByPhase(args: {
  projectId: string;
  anchorStartDate: Date | null;
  phases: PhaseLite[];
}): Promise<Map<string, number | null> | null> {
  const { projectId, anchorStartDate, phases } = args;
  if (!anchorStartDate || phases.length === 0) return null;

  const anchorIso = anchorStartDate.toISOString();
  const curWeek = currentWeekIndex(anchorIso);
  if (curWeek === null) return null;

  const ranges = computePhaseRanges(phases);

  const [{ sessions }, team] = await Promise.all([
    getProjectHandoffSessions(projectId),
    prisma.teamMember.findMany({ select: { email: true, area: true, roleEnum: true } }),
  ]);
  const { deliveryEmails, internalEmails } = classifyTeamEmailsByArea(team);

  /* Pre-clasificar cada sesión: ¿es de entrega (CSE/dev + cliente)? + su fecha (epoch).
     ⚠ `soloOcurridas` va PRIMERO y no es cosmético: este número se llama "el real
     ejecutado" y de acá sale al Gantt y al documento de Entrega que firma el cliente.
     La fase EN CURSO tiene su ventana abierta hacia adelante (arranca antes de hoy y
     termina después), así que sin este corte una reunión AGENDADA para el jueves caía
     adentro y se contaba como sostenida. Ver `lib/sessions/ocurridas.ts`. */
  const deliverySessions = soloOcurridas(sessions)
    .filter((s) => {
      const emails = s.participants.map((p) => p.toLowerCase());
      const hasDelivery = emails.some((e) => deliveryEmails.has(e));
      const hasClient = emails.some((e) => !internalEmails.has(e));
      return hasDelivery && hasClient;
    })
    .map((s) => s.date); // epoch ms

  const result = new Map<string, number | null>();
  phases.forEach((p, i) => {
    const range = ranges[i];
    if (range.start > curWeek) {
      result.set(p.id, null); // fase futura: sin real, la UI usa el estimado
      return;
    }
    const startMs = addWeeks(anchorIso, range.start).getTime();
    const endMs = addWeeks(anchorIso, range.end).getTime();
    const count = deliverySessions.filter((d) => d >= startMs && d < endMs).length;
    result.set(p.id, count);
  });
  return result;
}

/**
 * Las fases con las que cada una comparte semanas, ya resueltas a NOMBRES para la UI.
 * Se calcula acá (y no en el componente) porque la ventana de cada fase sale de
 * `computePhaseRanges`, la misma función que produce el conteo de arriba: si el
 * componente la recalculara por su cuenta, el aviso podría hablar de un solape que el
 * número no tiene.
 */
export function nombresDeFasesSolapadas(
  phases: readonly (PhaseLite & { name: string })[],
): Map<string, string[]> {
  const ranges = computePhaseRanges([...phases]);
  const ventanas: VentanaDeFase[] = phases.map((p, i) => ({ id: p.id, start: ranges[i].start, end: ranges[i].end }));
  const porId = new Map(phases.map((p) => [p.id, p.name]));
  const out = new Map<string, string[]>();
  for (const [id, ids] of ventanasCompartidas(ventanas)) {
    out.set(id, ids.map((x) => porId.get(x) ?? x));
  }
  return out;
}
