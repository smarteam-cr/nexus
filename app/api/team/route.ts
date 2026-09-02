import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { apiError } from "@/lib/api";
import { guardInternalUser, guardRole } from "@/lib/auth/api-guards";
import { revalidateTeamMembers, TEAM_MEMBER_SAFE_SELECT } from "@/lib/cache/team";
import { altaDeMiembro, ROLES_DE_EQUIPO } from "@/lib/team/alta-de-miembro";

// GET /api/team — lista miembros ACTIVOS (cualquier interno).
// SELECT explícito (allowlist): TeamMember tiene una relación con los costos
// (salarios estimados, SUPER_ADMIN-only) — acá NUNCA va un include.
export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;

  const members = await prisma.teamMember.findMany({
    where: { deactivatedAt: null },
    orderBy: { createdAt: "asc" },
    // SELECT explícito (allowlist escalar): excluye la relación de costos
    // (salarios, SUPER_ADMIN-only) Y `permissionOverrides` (los pines por-persona,
    // solo vía /api/team/[id]/permissions) — no está en la lista. Este GET lo
    // consume TODO interno (selector del kickoff, compartir clientes).
    select: TEAM_MEMBER_SAFE_SELECT,
  });
  return NextResponse.json({ members });
}

/**
 * POST /api/team — ALTA de una persona.
 *
 * ⛔ GATE DURO: `guardRole("SUPER_ADMIN")`, NO `guardCapability("manageTeam")`.
 *
 * No es un detalle de estilo. `manageTeam` mapea a la celda `equipo.manage`, que es DELEGABLE: un
 * SUPER_ADMIN puede prendérsela a cualquier rol desde la pestaña «Plantillas por rol» de esta misma
 * pantalla, o a una persona suelta por override. Con el gate blando, alguien que recibió esa celda
 * prestada podía crear un miembro con rol SUPER_ADMIN y entrar con esa identidad — y como el alta
 * ahora también crea el `AppUser`, la escalada sería USABLE, no una fila muerta. Cada paso está
 * permitido por separado, así que no dispara ninguna alerta.
 *
 * Es la misma regla que ya gobierna `/api/team/[id]/permissions`: administrar permisos no es
 * delegable, ni siquiera vía `equipo.manage`. Elegir el rol de alguien ES administrar permisos.
 *
 * ⚠ El cuerpo es `strictObject` a propósito. El endpoint viejo aceptaba una clave `role` y la
 * escribía en `area` (herencia del rename de la columna): un formulario que mandara
 * `{ role: "SUPER_ADMIN" }` pensando en el permiso guardaba ese texto en el eje de ANÁLISIS y
 * dejaba el rol real en `CSE`, con un 201 y la fila en pantalla. Ahora esa clave es un 400.
 */
const altaSchema = z.strictObject({
  name: z.string().min(1),
  email: z.string().min(1),
  area: z.string().min(1),
  roleEnum: z.enum(ROLES_DE_EQUIPO as unknown as [string, ...string[]]),
  /* Reactivar a alguien dado de baja es un acto explícito. Ver `lib/team/alta-de-miembro.ts`. */
  reactivar: z.boolean().optional(),
});

export async function POST(req: NextRequest) {
  const guard = await guardRole("SUPER_ADMIN");
  if (guard instanceof NextResponse) return guard;

  const cuerpo = altaSchema.safeParse(await req.json().catch(() => null));
  if (!cuerpo.success) return apiError("Datos incompletos o campo desconocido", 400);

  try {
    /* ⛔ El alta vive en lib/, no acá: escribe DOS filas (el perfil y el AppUser del login) y las
       dos son obligatorias. Este endpoint creaba solo la primera y devolvía 201 — la persona
       aparecía en la lista y el login la rechazaba. Ver el encabezado del módulo. */
    const r = await altaDeMiembro(prisma, {
      name: cuerpo.data.name,
      email: cuerpo.data.email,
      area: cuerpo.data.area,
      roleEnum: cuerpo.data.roleEnum as (typeof ROLES_DE_EQUIPO)[number],
      reactivar: cuerpo.data.reactivar,
    });
    if (!r.ok) {
      /* «Ya estuvo y está de baja» es 409 con su código: la pantalla lo usa para ofrecer
         reactivar. El resto es 400 con el mensaje ya redactado. */
      const status = r.motivo === "dado_de_baja" ? 409 : 400;
      return NextResponse.json({ error: r.mensaje, motivo: r.motivo }, { status });
    }

    /* ⚠ Invalida el tag del cache de servidor (selector del kickoff, compartir clientes). La tabla
       de /team NO se refresca con esto —ese GET consulta Prisma directo—: la pantalla vuelve a
       pedir la lista por su cuenta. */
    revalidateTeamMembers();

    const member = await prisma.teamMember.findUnique({
      where: { id: r.miembro.id },
      select: TEAM_MEMBER_SAFE_SELECT,
    });
    return NextResponse.json(
      { member, eraNuevo: r.eraNuevo, seReactivo: r.seReactivo },
      { status: 201 },
    );
  } catch {
    return apiError("Error interno");
  }
}
