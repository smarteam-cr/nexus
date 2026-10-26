/**
 * lib/google/reunion-movida.ts — una reunión que ya se intentó leer, sin nada, y después la reprograman al futuro
 * vuelve sola a «no leída» (aprobado por Elías el 2026-10-26).
 *
 * El caso (KNOWN-ERRORS, INV16 a): la lectura corre en la fecha vieja, no encuentra material y sella la fila vacía;
 * después mueven el evento y la sync de Meet le pone la fecha nueva (`cambiosDeSesion`). Como la pasada solo toma
 * `enrichedAt: null`, la reunión nunca se volvía a leer. Ahora, cuando la sync le pone una fecha futura a una fila
 * ya intentada, la devuelve a «no leída» como el rescate (`datosDeReset`). «Ya intentada» es sellada o con reintentos
 * en curso: los reintentos (`drenarReintentos`) no esperan a que la reunión termine, así que una que esperaba material
 * gastaba el último en medio de la reunión nueva y quedaba sellada vacía igual.
 *
 * Además le borra lo de la fecha vieja: la conferencia (la revisión de conferencias solo mira las que no están cerradas,
 * y los Docs que Meet dio eran de aquel día), el motivo de por qué no hay texto (el job `reuniones-motivos` lo vuelve a
 * calcular cuando pase la fecha nueva) y la asistencia (quién entró aquel día no estuvo en la reunión nueva).
 *
 * Solo si no tiene NADA leído: ni texto, ni resumen, ni minuta, ni hechos, ni tareas, ni frases. El otro caso conocido
 * (la fila con el texto de otro día) no se toca acá: ese texto alimentó la minuta y lo demás, y decidir qué se
 * conserva es otra cosa. Lo decide la base en el mismo UPDATE, así una lectura que termina antes no se pisa.
 *
 * ⚠ Riesgo aceptado: una lectura manual («re-enriquecer») o una revisión de conferencias que empezó antes del cambio de
 * fecha y termina en esos mismos segundos escribe sus resultados sin mirar la fecha, y puede volver a sellarla. Hacen
 * falta las dos cosas en la misma ventana; si pasa, INV16 (a) la muestra y el rescate `--solo-futuras` la devuelve.
 */
import { Prisma, type PrismaClient } from "@prisma/client";
import type { CambiosDeSesion } from "./meet-sync-cambios";

/** ¿La sync le pone a una fila ya intentada una fecha que todavía no llega? Puro: lo que hay en la fila lo mira la base. */
export function seMovioAlFuturoYaLeida(
  guardada: { enrichedAt: Date | null; enrichAttempts: number },
  cambios: CambiosDeSesion | null,
  ahora: Date,
): boolean {
  const yaIntentada = guardada.enrichedAt !== null || guardada.enrichAttempts > 0;
  return !!cambios?.date && cambios.date.getTime() > ahora.getTime() && yaIntentada;
}

/** La fila no tiene nada leído que se pueda perder. */
export const SIN_NADA_LEIDO = {
  transcript: null,
  summary: { equals: Prisma.AnyNull },
  minute: { is: null },
  hechos: { none: {} },
  tareas: { none: {} },
  frases: { none: {} },
} satisfies Prisma.FirefliesSessionWhereInput;

/** «No leída», como la deja el rescate, y sin la conferencia ni el motivo de la fecha vieja. */
export const DATOS_DE_NO_LEIDA = {
  enrichedAt: null,
  enrichAttempts: 0,
  enrichError: null,
  estadoDeConferencia: null,
  conferenciaInicio: null,
  conferenciaFin: null,
  conferenciaRevisadaEn: null,
  conferenciaCerradaEn: null,
  docDeTranscripcionId: null,
  docDeNotasId: null,
  motivoSinTexto: null,
  motivoSinTextoAt: null,
} satisfies Prisma.FirefliesSessionUpdateManyMutationInput;

/** La asistencia que copió la revisión de conferencias de la fecha vieja. */
export const SIN_ASISTENCIA = { entro: null, salio: null, minutos: null, idEnMeet: null } satisfies Prisma.ParticipanteDeReunionUpdateManyMutationInput;

/** Después de escribir los cambios de la sync: si la movieron al futuro ya intentada y vacía, vuelve a «no leída». */
export async function devolverANoLeidaSiSeMovio(
  db: Pick<PrismaClient, "firefliesSession" | "participanteDeReunion">,
  guardada: { id: string; enrichedAt: Date | null; enrichAttempts: number },
  cambios: CambiosDeSesion | null,
  ahora: Date,
): Promise<boolean> {
  if (!seMovioAlFuturoYaLeida(guardada, cambios, ahora)) return false;
  const r = await db.firefliesSession.updateMany({
    where: {
      id: guardada.id,
      OR: [{ enrichedAt: { not: null } }, { enrichAttempts: { gt: 0 } }],
      date: { gt: ahora },
      ...SIN_NADA_LEIDO,
    },
    data: DATOS_DE_NO_LEIDA,
  });
  if (r.count === 0) return false;
  await db.participanteDeReunion.updateMany({ where: { sessionId: guardada.id }, data: SIN_ASISTENCIA });
  return true;
}
