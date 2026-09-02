/**
 * scripts/create-team-member.ts
 *
 * Alta de un miembro interno: crea (idempotente) el TeamMember (perfil + rol de permiso)
 * y su AppUser INTERNAL (vincula el login al primer Google por email; authUserId queda null
 * hasta ese primer login — ver app/auth/callback/route.ts). Sin AppUser INTERNAL el login
 * es rechazado aunque el email sea @smarteamcr.com.
 *
 * Se le pasan los datos por bandera, no editando el archivo: una alta es un dato de operación,
 * no código, y editarlo obligaba a commitear el nombre de una persona en cada incorporación.
 *
 *   npx tsx scripts/create-team-member.ts --nombre "Nombre Apellido" \
 *     --email persona@smarteamcr.com --area CSE --rol CSL
 *
 * DRY-RUN por defecto: dice qué haría y no toca nada. Con `--apply` escribe (y contra producción
 * exige además ALLOW_PROD_WRITE=1). Es idempotente: repetirlo sobre alguien que ya está lo
 * actualiza, no lo duplica.
 *
 * ⭐ La ESCRITURA no vive acá: vive en `lib/team/alta-de-miembro.ts`, y la comparte con el
 * formulario de /team. Escribir las dos filas —el perfil y el AppUser del login— es la parte que
 * hay que hacer bien una sola vez; este archivo se ocupa de las banderas, del dry-run y de decir
 * en voz alta qué va a pasar antes de que pase.
 *
 * ⚠ REACTIVAR ahora se PIDE: `--reactivar`. Antes era un efecto colateral incondicional del
 * upsert, y su única señal era una línea impresa en el dry-run del CLI — que sobre HTTP no existe.
 * La regla se movió al módulo compartido y el script se alinea con ella.
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";
import {
  altaDeMiembro,
  leerMiembroPrevio,
  validarAlta,
  ROLES_DE_EQUIPO as ROLES,
  type DatosDeAlta,
} from "@/lib/team/alta-de-miembro";

function bandera(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function leerArgumentos(): DatosDeAlta {
  const name = bandera("nombre")?.trim();
  const email = bandera("email")?.trim().toLowerCase();
  const area = bandera("area")?.trim();
  const rol = bandera("rol")?.trim().toUpperCase();

  const faltan = [
    !name && "--nombre",
    !email && "--email",
    !area && "--area",
    !rol && "--rol",
  ].filter(Boolean);
  if (faltan.length) {
    console.error(`Faltan banderas: ${faltan.join(", ")}`);
    console.error(`Roles válidos: ${ROLES.join(" | ")}`);
    process.exit(1);
  }
  if (!ROLES.includes(rol as DatosDeAlta["roleEnum"])) {
    /* Sin esto, un rol mal tipeado no explota: Prisma rechaza el enum recién al escribir, o peor,
       un default silencioso deja a la persona con menos acceso del que se le quiso dar. */
    console.error(`Rol desconocido: "${rol}". Válidos: ${ROLES.join(" | ")}`);
    process.exit(1);
  }
  if (!email!.includes("@")) {
    console.error(`Correo inválido: "${email}"`);
    process.exit(1);
  }
  return {
    name: name!,
    email: email!,
    area: area!,
    roleEnum: rol as DatosDeAlta["roleEnum"],
    reactivar: process.argv.includes("--reactivar"),
  };
}

const NUEVO = leerArgumentos();

// Pool acotado (max:2) — no comerse los slots compartidos del pooler (ver scripts/lib/db.ts).
const { prisma, pool } = createScriptDb();

async function main() {
  const apply = resolverApply();
  const email = NUEVO.email.toLowerCase();

  /* Qué se va a hacer, ANTES de hacerlo: dar de alta a alguien es darle acceso a la cartera
     entera según el rol, y un rol de más no avisa. Se lee y recién después se aplica. */
  const previo = await leerMiembroPrevio(prisma, email);

  /* Qué se va a hacer, ANTES de hacerlo: dar de alta a alguien es darle acceso a la cartera entera
     según el rol, y un rol de más no avisa. Se lee, se valida, y recién después se aplica. */
  console.log(`\n${NUEVO.name} <${email}>`);
  console.log(`  area : ${previo ? `${previo.area} → ` : ""}${NUEVO.area}`);
  console.log(`  rol  : ${previo ? `${previo.roleEnum} → ` : ""}${NUEVO.roleEnum}`);
  if (previo?.deactivatedAt) console.log(`  ⚠ estaba dado de baja`);
  if (previo && previo.name !== NUEVO.name) console.log(`  ⚠ el nombre cambia: "${previo.name}"`);
  console.log(previo ? "  (ya existía: se actualiza)" : "  (nuevo)");

  /* La MISMA validación que corre el formulario, y va ANTES del dry-run: anunciar un alta que
     después se rechaza es peor que rechazarla ya. */
  const rechazo = validarAlta(NUEVO, previo);
  if (rechazo) {
    console.error(`\n⛔ ${rechazo.mensaje}`);
    if (rechazo.motivo === "dado_de_baja") {
      console.error("   Si es lo que querés, repetilo con --reactivar.");
    }
    process.exit(1);
  }

  if (!apply) {
    console.log("\n(dry-run) Nada escrito. Repetí con --apply para aplicarlo.");
    return;
  }

  const r = await altaDeMiembro(prisma, NUEVO);
  if (!r.ok) {
    console.error(`\n⛔ ${r.mensaje}`);
    process.exit(1);
  }
  console.log(
    `✓ TeamMember: ${r.miembro.name} <${r.miembro.email}> · area=${r.miembro.area} · rol=${r.miembro.roleEnum}`,
  );
  console.log("✓ AppUser: kind=INTERNAL · authUserId se vincula en el primer login");
  if (r.seReactivo) console.log("✓ REACTIVADA: vuelve a tener acceso.");

  console.log(`\nListo. ${r.miembro.name} puede entrar con Google (${r.miembro.email}).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
