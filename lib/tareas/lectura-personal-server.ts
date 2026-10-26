/**
 * lib/tareas/lectura-personal-server.ts — la lectura sola de las reuniones internas de cada persona del piloto (roadmap
 * H1 y P5, 2026-10-27; las reglas en lib/tareas/lectura-personal.ts). SERVIDOR.
 *
 * Lo corre el job `tareas-n2-lectura-personal` cada tick, como mucho una vez cada 10 minutos por proceso y nunca dos a la
 * vez. Lee como la persona (`getReunionesParaTareas` solo devuelve las reuniones donde estuvo, por el chokepoint) y pide
 * la lectura de siempre (`pedirLectura` + `procesarLectura`, con su tope de 10 por día), atada a su fuente personal: la
 * lectura sabe así que lo que salga es solo para ella. Nunca corre la sincronización de Meet: lee lo que ya llegó.
 *
 * Sin `TAREAS_LECTURA_PERSONAL` no hace nada.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getReunionesParaTareas } from "@/lib/sessions/reuniones-para-tareas";
import { MINUTOS_ENTRE_MIRADAS } from "./fuentes";
import { HORAS_PARA_LEERLA_SOLA, REUNIONES_POR_PASADA, SERIE_PERSONAL, TITULO_DE_LA_FUENTE_PERSONAL, personasDelPiloto, seLeePersonal } from "./lectura-personal";
import { contextoDeTareas, miembrosActivos } from "./servidor";
import { clientesQueVesParaTareas } from "./clientes";
import { pedirLectura, procesarLectura } from "./lectura";
import { asegurarFuentePersonal } from "./mutaciones";

export interface ResultadoDeLaLecturaPersonal {
  personas: number;
  pedidas: number;
  omitida?: "reciente" | "sin_piloto" | "sin_tabla";
}

let ultimaMirada = 0;
let mirando: Promise<ResultadoDeLaLecturaPersonal> | null = null;

/** NUNCA lanza: lo que falla queda en la lectura o en el log. */
export function mirarLasReunionesPersonales(ahora = new Date(), forzar = false): Promise<ResultadoDeLaLecturaPersonal> {
  const piloto = personasDelPiloto();
  if (!piloto.length) return Promise.resolve({ personas: 0, pedidas: 0, omitida: "sin_piloto" });
  if (mirando) return mirando;
  if (!forzar && +ahora - ultimaMirada < MINUTOS_ENTRE_MIRADAS * 60_000) return Promise.resolve({ personas: 0, pedidas: 0, omitida: "reciente" });
  ultimaMirada = +ahora;
  mirando = mirar(piloto, ahora)
    .catch((e) => {
      if (esquemaDesactualizado(e)) return { personas: 0, pedidas: 0, omitida: "sin_tabla" as const };
      console.error("[tareas/personal] no se pudieron mirar las reuniones:", e instanceof Error ? e.message : e);
      return { personas: 0, pedidas: 0 };
    })
    .finally(() => {
      mirando = null;
    });
  return mirando;
}

async function mirar(piloto: readonly string[], ahora: Date): Promise<ResultadoDeLaLecturaPersonal> {
  const activos = new Set((await miembrosActivos()).map((m) => m.email.toLowerCase()));
  // Las series que ya lee un sprint: esas las lee el sprint (la lectura es una sola por reunión).
  const seriesDeSprint = new Set((await prisma.fuenteDeTareas.findMany({ where: { activa: true, equipo: { not: null } }, select: { serie: true } })).map((f) => f.serie));
  let personas = 0;
  let pedidas = 0;
  for (const email of piloto) {
    if (!activos.has(email)) continue;
    try {
      const tm = await prisma.teamMember.findFirst({ where: { email: { equals: email, mode: "insensitive" }, deactivatedAt: null } });
      if (!tm) continue;
      const fuente = await asegurarFuentePersonal(email, SERIE_PERSONAL, TITULO_DE_LA_FUENTE_PERSONAL);
      if (!fuente.activa) continue;
      personas++;
      const [ctx, clientes] = await Promise.all([contextoDeTareas({ teamMember: tm }), clientesQueVesParaTareas(tm)]);
      const desde = new Date(Math.max(+fuente.createdAt - 86_400_000, +ahora - (HORAS_PARA_LEERLA_SOLA + 6) * 3_600_000));
      const reuniones = await getReunionesParaTareas({ quien: { email: ctx.email, esSuperAdmin: false, clientes }, desde, tope: 60 });
      const nuevas = reuniones.filter((r) => seLeePersonal(r, seriesDeSprint, fuente.createdAt, ahora));
      if (!nuevas.length) continue;
      const yaLeidas = await prisma.lecturaDeReunion.findMany({ where: { sessionId: { in: nuevas.map((r) => r.id) } }, select: { sessionId: true, estado: true, fuenteId: true } });
      const yaDe = new Map(yaLeidas.map((l) => [l.sessionId, l]));
      let enEstaPasada = 0;
      for (const r of nuevas) {
        if (enEstaPasada >= REUNIONES_POR_PASADA) break;
        const ya = yaDe.get(r.id);
        // Lo que ya se leyó (la leyó un sprint, otra persona a mano o esta misma lectura) no se vuelve a leer. Una sin texto
        // se vuelve a mirar solo si es de esta misma lectura personal (`pedirLectura` la retoma si llegaron las notas): la
        // de otra persona no se vuelve personal.
        if (ya && (ya.estado !== "sin_texto" || ya.fuenteId !== fuente.id)) continue;
        try {
          const l = await pedirLectura(ctx, clientes, { sessionId: r.id, rol: "planning", equipo: ctx.equipo, fuenteId: fuente.id }, ahora);
          if (!l.yaLeida && l.estado === "leyendo") {
            await procesarLectura(l.id, ahora);
            pedidas++;
            enEstaPasada++;
          }
        } catch (e) {
          // El tope del día de la persona, o la reunión dejó de verse: se intenta en la mirada siguiente.
          console.error(`[tareas/personal] no se pudo leer ${r.id} para ${email}:`, e instanceof Error ? e.message : e);
        }
      }
    } catch (e) {
      console.error(`[tareas/personal] la lectura de ${email} falló:`, e instanceof Error ? e.message : e);
    }
  }
  return { personas, pedidas };
}
