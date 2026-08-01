/**
 * scripts/lib/roster.ts — copiar el ROSTER INTERNO real de prod a la base local.
 *
 * Por qué existe: Supabase Auth es UNO SOLO (prod y local comparten el mismo proyecto de
 * auth — lo único que cambia es dónde vive la DATA). Al entrar a la instancia local, el
 * login de Google funciona y devuelve tu correo REAL… pero `requireUser`
 * (lib/auth/supabase.ts) busca `AppUser` POR EMAIL, y en la base local solo existen los
 * usuarios ficticios del fixture. Resultado: "Usuario autenticado pero sin AppUser".
 *
 * Copiar el roster interno (≈16 personas) resuelve dos cosas de una:
 *   1. Podés entrar a la instancia local con tu cuenta de siempre.
 *   2. El filtro "¿hay VENTAS interno en la sala?" (lib/handoff/session-relevance.ts)
 *      reconoce a los participantes reales de las sesiones que traigas con
 *      `local-pull-context.ts` — sin el roster, esas sesiones se caerían del handoff.
 *
 * Los datos van a la BASE local (gitignoreada), NUNCA al repo — misma línea que el resto:
 * lo real puede vivir en tu máquina, no en el control de versiones.
 */
import type { PrismaClient, Prisma } from "@prisma/client";

// Prisma tipa las columnas Json? como `JsonValue` al LEER pero exige su sentinel al
// ESCRIBIR; acá se copia la fila 1:1 entre dos clientes del MISMO schema (ver el mismo
// comentario en local-pull-context.ts).
const asInput = <T>(row: object): T => row as unknown as T;

export type ResumenRoster = { teamMembers: number; appUsers: number };

/**
 * Copia TeamMember (todos) + AppUser INTERNAL desde `origen` hacia `destino`.
 * Idempotente: upsert por id real, no duplica. El llamador es responsable de haber
 * verificado que `destino` es local (assertLocalWriteOnly).
 */
export async function copiarRosterInterno(
  origen: PrismaClient,
  destino: PrismaClient,
): Promise<ResumenRoster> {
  const equipo = await origen.teamMember.findMany({});
  const appUsers = await origen.appUser.findMany({ where: { kind: "INTERNAL" } });

  for (const m of equipo) {
    await destino.teamMember.upsert({
      where: { id: m.id },
      create: asInput<Prisma.TeamMemberUncheckedCreateInput>(m),
      update: asInput<Prisma.TeamMemberUncheckedUpdateInput>(m),
    });
  }
  for (const u of appUsers) {
    await destino.appUser.upsert({
      where: { id: u.id },
      create: asInput<Prisma.AppUserUncheckedCreateInput>(u),
      update: asInput<Prisma.AppUserUncheckedUpdateInput>(u),
    });
  }
  return { teamMembers: equipo.length, appUsers: appUsers.length };
}
