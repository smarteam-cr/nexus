/**
 * lib/nexus-chat/acciones-server.ts — las acciones sugeridas a una persona en una cuenta, con lo que hay hoy.
 * SERVER-ONLY, solo lectura y sin IA (la regla es ./acciones.ts).
 *
 * Lee las tareas por la puerta de la capa (lib/tareas/para-operaciones.ts: sin la cita, el contexto ni las notas, y con
 * la visibilidad de la persona) y el siguiente paso de cada equipo (lib/siguiente-paso). Una sola cuenta: la que la
 * persona ya puede ver (la ruta lo exige antes).
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { tareasAbiertasDeLaCuenta } from "@/lib/tareas/para-operaciones";
import { equiposQueLidera } from "@/lib/tareas/equipos";
import { pasosDeLaCuenta } from "@/lib/siguiente-paso/lectura-server";
import { NOMBRE_DEL_EQUIPO, equipoDelRol, equiposQueEscribe } from "@/lib/siguiente-paso/reglas";
import { contextoDeOperacion } from "@/lib/operaciones/contexto-server";
import { hoyEnCostaRica } from "./prompt";
import { siguientePasoDeUnaCuenta } from "@/lib/mi-dia/servicio-server";
import { accionesSugeridas, type AccionSugerida } from "./acciones";

function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`);
  const desde = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - desde);
  return d.toISOString().slice(0, 10);
}

export async function accionesDeLaPersona(persona: TeamMember, clientId: string, ahora = new Date()): Promise<AccionSugerida[]> {
  const cuenta = await prisma.client.findUnique({ where: { id: clientId }, select: { name: true } });
  if (!cuenta) return [];
  const ctx = contextoDeOperacion(persona, ahora);
  const hoy = hoyEnCostaRica(ahora).dia;
  // La regla única del siguiente paso (lib/mi-dia/servicio.ts): una tarea con fecha esta semana o una reunión en 8 días,
  // en el calendario de quien mira o de quien lleva la cuenta (el encargado en HubSpot).
  const encargados = await prisma.project
    .findMany({ where: { clientId, status: "active", hubspotOwnerEmail: { not: null } }, select: { hubspotOwnerEmail: true }, take: 10 })
    .then((ps) => ps.flatMap((p) => (p.hubspotOwnerEmail ? [p.hubspotOwnerEmail] : [])))
    .catch(() => [] as string[]);
  const [tareas, pasos, deLaCuenta] = await Promise.all([
    tareasAbiertasDeLaCuenta(await ctx.extras.tareas(), clientId).catch(() => []),
    pasosDeLaCuenta(clientId).catch(() => null),
    siguientePasoDeUnaCuenta(clientId, [persona.email, ...encargados], {
      ahora,
      hoyISO: hoy,
      quienMira: { email: persona.email, esSuperAdmin: persona.roleEnum === "SUPER_ADMIN" },
    }).catch(() => null),
  ]);
  /* El equipo de su rol y los que lidera. Dirección puede escribir los tres, pero se le sugiere solo el suyo (Ventas):
     tres «fija el siguiente paso» por cuenta serían ruido. */
  const propio = equipoDelRol(persona.roleEnum);
  const claves = [...new Set([...(propio ? [propio] : []), ...equiposQueEscribe(null, equiposQueLidera(persona))])];
  const equipos = claves.map((clave) => ({ clave, nombre: NOMBRE_DEL_EQUIPO[clave] }));
  return accionesSugeridas({
    persona: { email: persona.email },
    cuenta: { nombre: cuenta.name },
    equipos,
    tareas,
    pasos: (pasos?.pasos ?? []).map((p) => ({ equipo: p.equipo, que: p.que, fecha: p.fecha })),
    hoy,
    lunes: lunesDe(hoy),
    cuentaConPaso: deLaCuenta ? !!deLaCuenta.paso : undefined,
  });
}
