/**
 * GET /api/siguiente-paso/personas — quién puede llevar un siguiente paso, por equipo, y los equipos que puede escribir
 * quien pregunta. Solo nombres y correos del equipo interno.
 *
 * Desde el 2026-10-16 (fase 0.2) el siguiente paso de un equipo es una tarea de su sprint: lo lleva alguien de ese sprint
 * (su área). Quien pregunta escribe el de su equipo y los de los sprints que lidera (fase 0.1).
 */
import { NextResponse } from "next/server";
import { guardInternalUser } from "@/lib/auth/api-guards";
import { equiposQueEscribe } from "@/lib/siguiente-paso/reglas";
import { equipoDelPasoDeSprint } from "@/lib/siguiente-paso/desde-tareas";
import { claveDeEquipo, equiposQueLidera } from "@/lib/tareas/equipos";
import { miembrosActivos } from "@/lib/tareas/servidor";

export async function GET() {
  const guard = await guardInternalUser();
  if (guard instanceof NextResponse) return guard;
  const miembros = await miembrosActivos();
  return NextResponse.json({
    yo: guard.teamMember.email.toLowerCase(),
    equipos: equiposQueEscribe(guard.teamMember.roleEnum, equiposQueLidera(guard.teamMember)),
    personas: miembros.flatMap((m) => {
      const equipo = equipoDelPasoDeSprint(claveDeEquipo(m.area, m.email));
      return equipo ? [{ email: m.email, nombre: m.nombre, equipos: [equipo] }] : [];
    }),
  });
}
