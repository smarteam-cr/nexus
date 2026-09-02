/**
 * lib/team/alta-de-miembro.ts — DAR DE ALTA A UNA PERSONA ES UNA OPERACIÓN, NO DOS.
 *
 * ── POR QUÉ EXISTE ───────────────────────────────────────────────────────────────────────────
 * Un alta escribe DOS filas y las dos son obligatorias:
 *   · `TeamMember`  — el perfil y el rol de permiso.
 *   · `AppUser` con `kind: "INTERNAL"` — la llave del login.
 *
 * ⛔ Y la segunda es la que se olvida. Sin `AppUser`, `app/auth/callback/route.ts` hace `signOut` y
 * rebota a `/?error=not_member` **aunque el correo sea del dominio**. El fallo no aparece al dar el
 * alta —la fila se ve en /team, todo parece bien— sino días después, en el primer intento de login
 * de otra persona, en otra pantalla, con un mensaje genérico que nadie asocia con el alta. Eso es
 * exactamente lo que hacía `POST /api/team`: creaba media persona y devolvía 201.
 *
 * Por eso el alta vive acá y no en el endpoint ni en el script: es la lógica que los DOS necesitan
 * completa. Un segundo camino de escritura no sería interfaz duplicada — sería un alta a medias.
 *
 * ── LAS TRES DECISIONES QUE VALE LA PENA LEER ────────────────────────────────────────────────
 *  1. **Las dos filas van en UNA transacción.** El script las escribía sueltas, y `AppUser.teamMemberId`
 *     es `@unique`: si ya existe un AppUser con otro correo apuntando a esa persona, la segunda
 *     escritura explota y el TeamMember queda sin login — el mismo estado roto, ahora por la mitad
 *     de atrás. Nada lo detecta después: no hay invariante de paridad.
 *  2. **Reactivar es un acto, no un efecto.** La baja es blanda, así que «dar de alta» a alguien que
 *     ya estuvo es reactivarlo. El script lo hacía SIEMPRE, y su única señal era una línea impresa
 *     en el dry-run del CLI — que sobre HTTP no existe. Un apellido repetido o un typo le devolvía
 *     el acceso a la cartera a un ex-empleado sin que ninguna pantalla lo dijera, y encima borraba
 *     el motivo de la baja. Acá hay que PEDIRLO (`reactivar: true`), y si no se pidió se rechaza
 *     diciendo qué pasó — porque el otro camino, el de hoy, es un 409 «el correo ya está
 *     registrado» sobre una persona que la pantalla no muestra: un callejón sin diagnóstico.
 *  3. **El dominio se valida acá, y el gate de login conserva SU copia.** Ver el final del archivo.
 *
 * ⚠ El cliente de Prisma entra POR PARÁMETRO. El script abre un pool acotado (`max: 2`) a propósito
 * para no comerse los ~15 slots del pooler que comparten producción, dos PCs de desarrollo y los
 * scripts; si este módulo importara el singleton, el script dejaría de respetar ese presupuesto y
 * el fallo aparecería en producción, en otra pantalla y en otro momento.
 */
import type { PrismaClient, TeamRole } from "@prisma/client";
import { DOMINIO_PROPIO } from "@/lib/sessions/dominio-propio";

/**
 * Los siete valores del enum, transcritos.
 *
 * ⚠ Se transcriben a propósito, con el mismo motivo que escribió el script: Prisma rechaza un valor
 * inválido recién AL ESCRIBIR, y un default silencioso deja a la persona con menos acceso del que
 * se le quiso dar — o con más. Acá se rechaza antes de tocar la base.
 */
export const ROLES_DE_EQUIPO: readonly TeamRole[] = [
  "CSE",
  "VENTAS",
  "CSL",
  "MARKETING",
  "DEV",
  "ADMIN",
  "SUPER_ADMIN",
];

/**
 * El dominio con el que se entra — IMPORTADO, no transcrito.
 *
 * ⚠ La primera versión de este archivo se escribió su propia copia del literal, argumentando que
 * el alta no debe poder ampliar quién entra. El argumento estaba dado vuelta, y hay una guarda que
 * lo dice: `lib/projects/alta-boton.test.ts` prohíbe pegar el dominio en cualquier archivo de
 * producción, con dos exentos —los dos del gate de LOGIN— y su motivo escrito, que menciona a este
 * caso por su nombre: «un cambio pensado para sesiones o para EL ALTA no puede abrir la puerta de
 * entrada al sistema». O sea: el login conserva su copia justamente para que el alta no la mueva;
 * el alta importa la compartida. Al revés eran siete copias, y cada una es una que se queda vieja
 * sin que nada avise.
 */
export const DOMINIO_DEL_EQUIPO = DOMINIO_PROPIO;

export interface DatosDeAlta {
  name: string;
  email: string;
  area: string;
  roleEnum: TeamRole;
  /** Acto explícito: sin esto, alguien dado de baja NO vuelve. Ver la decisión 2 del encabezado. */
  reactivar?: boolean;
}

export type MotivoDeRechazo =
  | "nombre_vacio"
  | "correo_invalido"
  | "dominio_ajeno"
  | "rol_invalido"
  | "area_vacia"
  | "dado_de_baja";

export interface RechazoDeAlta {
  ok: false;
  motivo: MotivoDeRechazo;
  /** Redactado para que se pueda mostrar tal cual, en la pantalla o en la terminal. */
  mensaje: string;
}

export interface AltaAplicada {
  ok: true;
  miembro: { id: string; name: string; email: string; area: string | null; roleEnum: TeamRole };
  /** Para que quien llama pueda decir la verdad de lo que pasó, en vez de «listo». */
  eraNuevo: boolean;
  seReactivo: boolean;
}

/** Lo que se sabe de la persona ANTES de escribir. `null` = no existe. */
export interface MiembroPrevio {
  name: string;
  area: string | null;
  roleEnum: TeamRole;
  deactivatedAt: Date | null;
}

/**
 * ⭐ LA VALIDACIÓN, PURA — se prueba sola y la comparten el endpoint y el script.
 *
 * Separada de la escritura a propósito: el script la necesita ANTES de imprimir su dry-run (para no
 * anunciar un alta que va a fallar), y el endpoint la necesita para contestar 400 sin abrir una
 * transacción. Si cada uno validara por su cuenta, el CLI y la pantalla aceptarían cosas distintas.
 */
export function validarAlta(datos: DatosDeAlta, previo: MiembroPrevio | null): RechazoDeAlta | null {
  const name = datos.name?.trim() ?? "";
  const email = datos.email?.trim().toLowerCase() ?? "";
  const area = datos.area?.trim() ?? "";

  if (!name) return { ok: false, motivo: "nombre_vacio", mensaje: "El nombre es obligatorio." };
  if (!area) {
    return {
      ok: false,
      motivo: "area_vacia",
      mensaje: "El área es obligatoria: es el eje con el que se clasifican las sesiones.",
    };
  }
  if (!ROLES_DE_EQUIPO.includes(datos.roleEnum)) {
    return { ok: false, motivo: "rol_invalido", mensaje: `«${datos.roleEnum}» no es un rol de Nexus.` };
  }
  /* Forma mínima, y después el dominio. El correo es la llave de TODO —el upsert, el AppUser y el
     login— así que un typo no deja una fila corregible: deja una fila huérfana. */
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, motivo: "correo_invalido", mensaje: "Ese correo no tiene forma de correo." };
  }
  if (!email.endsWith(`@${DOMINIO_DEL_EQUIPO}`)) {
    return {
      ok: false,
      motivo: "dominio_ajeno",
      mensaje:
        `Solo entran correos @${DOMINIO_DEL_EQUIPO}: el login rechaza cualquier otro dominio, ` +
        `así que el alta quedaría escrita y la persona no podría entrar igual.`,
    };
  }
  if (previo?.deactivatedAt && !datos.reactivar) {
    return {
      ok: false,
      motivo: "dado_de_baja",
      mensaje:
        `${previo.name} ya estuvo en el equipo y está dada de baja, por eso no aparece en la lista. ` +
        `Volver a darle de alta es REACTIVARLA: recupera el acceso que tenga el rol que elijas.`,
    };
  }
  return null;
}

/** La foto previa, con el select mínimo. La leen el endpoint y el script antes de decidir. */
export function leerMiembroPrevio(
  db: Pick<PrismaClient, "teamMember">,
  email: string,
): Promise<MiembroPrevio | null> {
  return db.teamMember.findUnique({
    where: { email: email.trim().toLowerCase() },
    select: { name: true, area: true, roleEnum: true, deactivatedAt: true },
  });
}

/**
 * ⭐ EL ALTA. Valida, y si pasa escribe LAS DOS FILAS en una transacción.
 *
 * Idempotente por correo (`upsert` en las dos tablas, y `email` es `@unique` en las dos), así que
 * repetirla sobre alguien que ya está lo actualiza, no lo duplica.
 *
 * ⚠ En la rama `update` del AppUser NO se tocan `authUserId` ni `clientId`: a alguien que ya entró
 * no se le rompe el vínculo con su cuenta de Google. `authUserId` en `null` no es un alta a medias
 * — es el estado correcto hasta el primer login, donde el callback lo vincula por correo.
 */
export async function altaDeMiembro(
  db: PrismaClient,
  datos: DatosDeAlta,
): Promise<AltaAplicada | RechazoDeAlta> {
  const email = datos.email.trim().toLowerCase();
  const previo = await leerMiembroPrevio(db, email);

  const rechazo = validarAlta(datos, previo);
  if (rechazo) return rechazo;

  const name = datos.name.trim();
  const area = datos.area.trim();

  const miembro = await db.$transaction(async (tx) => {
    const member = await tx.teamMember.upsert({
      where: { email },
      update: {
        name,
        area,
        roleEnum: datos.roleEnum,
        /* Solo se limpia cuando la reactivación se pidió: la validación de arriba ya rechazó el
           caso en que no se pidió, así que acá `reactivar` es siempre verdadero si había baja. */
        deactivatedAt: null,
        deactivatedReason: null,
      },
      create: { name, email, area, roleEnum: datos.roleEnum },
      select: { id: true, name: true, email: true, area: true, roleEnum: true },
    });

    /* ⛔ La mitad que se olvidaba. Sin esto el login se rechaza y el alta parece exitosa. */
    await tx.appUser.upsert({
      where: { email },
      update: { kind: "INTERNAL", teamMemberId: member.id },
      create: { email, kind: "INTERNAL", teamMemberId: member.id, authUserId: null, clientId: null },
      select: { id: true },
    });

    return member;
  });

  return {
    ok: true,
    miembro,
    eraNuevo: previo === null,
    seReactivo: Boolean(previo?.deactivatedAt),
  };
}
