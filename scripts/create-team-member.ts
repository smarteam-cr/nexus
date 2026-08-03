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
 * actualiza y lo reactiva, no lo duplica.
 */
import { type TeamRole } from "@prisma/client";
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

/** Los siete valores del enum. Se transcriben para poder rechazar un typo ANTES de escribir. */
const ROLES: TeamRole[] = ["CSE", "VENTAS", "CSL", "MARKETING", "DEV", "ADMIN", "SUPER_ADMIN"];

function bandera(nombre: string): string | null {
  const i = process.argv.indexOf(`--${nombre}`);
  return i >= 0 ? (process.argv[i + 1] ?? null) : null;
}

function leerArgumentos(): { name: string; email: string; area: string; roleEnum: TeamRole } {
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
  if (!ROLES.includes(rol as TeamRole)) {
    /* Sin esto, un rol mal tipeado no explota: Prisma rechaza el enum recién al escribir, o peor,
       un default silencioso deja a la persona con menos acceso del que se le quiso dar. */
    console.error(`Rol desconocido: "${rol}". Válidos: ${ROLES.join(" | ")}`);
    process.exit(1);
  }
  if (!email!.includes("@")) {
    console.error(`Correo inválido: "${email}"`);
    process.exit(1);
  }
  return { name: name!, email: email!, area: area!, roleEnum: rol as TeamRole };
}

const NUEVO = leerArgumentos();

// Pool acotado (max:2) — no comerse los slots compartidos del pooler (ver scripts/lib/db.ts).
const { prisma, pool } = createScriptDb();

async function main() {
  const apply = resolverApply();
  const email = NUEVO.email.toLowerCase();

  /* Qué se va a hacer, ANTES de hacerlo: dar de alta a alguien es darle acceso a la cartera
     entera según el rol, y un rol de más no avisa. Se lee y recién después se aplica. */
  const previo = await prisma.teamMember.findUnique({
    where: { email },
    select: { name: true, area: true, roleEnum: true, deactivatedAt: true },
  });
  console.log(`
${NUEVO.name} <${email}>`);
  console.log(`  area : ${previo ? `${previo.area} → ` : ""}${NUEVO.area}`);
  console.log(`  rol  : ${previo ? `${previo.roleEnum} → ` : ""}${NUEVO.roleEnum}`);
  if (previo?.deactivatedAt) console.log(`  ⚠ estaba dado de baja: se REACTIVA`);
  if (previo && previo.name !== NUEVO.name) console.log(`  ⚠ el nombre cambia: "${previo.name}"`);
  console.log(previo ? "  (ya existía: se actualiza)" : "  (nuevo)");

  if (!apply) {
    console.log("\n(dry-run) Nada escrito. Repetí con --apply para aplicarlo.");
    return;
  }

  const member = await prisma.teamMember.upsert({
    where: { email },
    update: { name: NUEVO.name, area: NUEVO.area, roleEnum: NUEVO.roleEnum, deactivatedAt: null, deactivatedReason: null },
    create: { name: NUEVO.name, email, area: NUEVO.area, roleEnum: NUEVO.roleEnum },
    select: { id: true, name: true, email: true, area: true, roleEnum: true },
  });
  console.log(`✓ TeamMember: ${member.name} <${member.email}> · area=${member.area} · rol=${member.roleEnum}`);

  const appUser = await prisma.appUser.upsert({
    where: { email },
    update: { kind: "INTERNAL", teamMemberId: member.id },
    create: { email, kind: "INTERNAL", teamMemberId: member.id, authUserId: null, clientId: null },
    select: { id: true, kind: true, authUserId: true },
  });
  console.log(`✓ AppUser: kind=${appUser.kind} · authUserId=${appUser.authUserId ?? "(null, se vincula al primer login)"}`);

  console.log(`\nListo. ${member.name} puede entrar con Google (${member.email}).`);
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
