/**
 * lib/mi-dia/paso-sugerido-server.ts — «Usar» y «Descartar» el siguiente paso que Nexus sugiere con la reunión de una
 * cuenta sin acción (2026-10-19). SERVER-ONLY. La regla es pura: lib/mi-dia/servicio.ts › siguientePasoDeLaReunion.
 *
 *   · «Usar» crea la tarea por el escritor único de Tareas (`crearTarea`, `origen = "paso"`): el título de la reunión, con
 *     vencimiento el día de la reunión, para quien lleva la cuenta. Es la acción de la semana y, como es la tarea con
 *     fecha de su sprint, el siguiente paso de su equipo; después se pone al día lo que dice HubSpot (como cuando se fija
 *     el siguiente paso). No reescribe otra tarea: un siguiente paso más lejano queda como está.
 *   · «Descartar» lo guarda en `SugerenciaDescartada` (por persona y evento) para no volver a mostrarlo.
 *
 * ⛔ Lo que dice el navegador no se usa: la sugerencia se vuelve a calcular acá, con el calendario de quien lleva la
 * cuenta, y tiene que ser la MISMA reunión (el mismo evento). Una reunión cuenta para una cuenta solo si el evento es de
 * UNA empresa (`cuentaDelEvento`, invariante 1). Quien lleva la cuenta tiene que ser el encargado en HubSpot de un
 * proyecto abierto de esa cuenta; lo puede usar esa persona o quien lidera Customer Success.
 *
 * La tabla se lee y se escribe con SQL parametrizado: el modelo está en el schema (y lo vigila la salud del esquema),
 * pero así este módulo no depende de regenerar el cliente.
 */
import "server-only";
import { Prisma, type TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { contextoDeTareas, ErrorDeTareas } from "@/lib/tareas/servidor";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import { crearTarea } from "@/lib/tareas/mutaciones";
import { lunesDeFecha } from "@/lib/tareas/semana";
import { olvidarMedicion } from "@/lib/para-ti/medir-server";
import { sincronizarCuenta } from "@/lib/siguiente-paso/escritura-server";
import { proyectosAbiertos } from "@/lib/clients/resumen-proyectos";
import { esProyectoDePipelineCS } from "@/lib/projects/scope";
import { crDateParts } from "@/lib/jobs/time";
import { servicioDeLasCuentas } from "./servicio-server";
import { claveDelPasoSugerido, origenDelPasoSugerido, siguientePasoDeLaReunion, TIPO_DESCARTE_DEL_PASO } from "./servicio";

/** Las sugerencias del siguiente paso que esa persona descartó (claves «<cuenta>:<evento>»). Sin la tabla, ninguna. */
export async function pasosDescartados(email: string): Promise<Set<string>> {
  try {
    const filas = await prisma.$queryRaw<{ clave: string }[]>(
      Prisma.sql`SELECT "clave" FROM "SugerenciaDescartada" WHERE "personaEmail" = ${email.toLowerCase()} AND "tipo" = ${TIPO_DESCARTE_DEL_PASO}`,
    );
    return new Set(filas.map((f) => f.clave));
  } catch (e) {
    console.error(`[para-ti] no se pudieron leer las sugerencias descartadas de ${email}: ${e instanceof Error ? e.message : e}`);
    return new Set();
  }
}

export class ErrorDelPasoSugerido extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Los encargados en HubSpot de los proyectos abiertos de Customer Success de la cuenta, y su nombre. */
async function encargadosDeLaCuenta(clientId: string): Promise<{ empresa: string; encargados: Set<string> } | null> {
  const c = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      name: true,
      projects: {
        select: {
          id: true,
          name: true,
          status: true,
          serviceType: true,
          hubspotServiceId: true,
          hubspotPipelineId: true,
          proyectoInterno: true,
          hermanoCsProjectId: true,
          altaEstado: true,
          esPrueba: true,
          hubspotOwnerEmail: true,
        },
      },
    },
  });
  if (!c) return null;
  const encargados = new Set(
    proyectosAbiertos(c.projects)
      .filter(esProyectoDePipelineCS)
      .flatMap((p) => (p.hubspotOwnerEmail ? [p.hubspotOwnerEmail.toLowerCase()] : [])),
  );
  return { empresa: c.name, encargados };
}

export interface PedidoDelPasoSugerido {
  clientId: string;
  eventoId: string;
  /** Quien lleva la cuenta (de su calendario sale la reunión). null = quien pide. */
  llevaEmail: string | null;
}

/** Quién lleva la cuenta, verificado: el encargado de un proyecto abierto; quien pide es esa persona o lidera CS. */
async function verificar(persona: TeamMember, p: PedidoDelPasoSugerido) {
  const yo = persona.email.toLowerCase();
  const lleva = (p.llevaEmail ?? yo).trim().toLowerCase();
  const cuenta = await encargadosDeLaCuenta(p.clientId);
  if (!cuenta) throw new ErrorDelPasoSugerido(404, "Esa cuenta no existe.");
  if (!cuenta.encargados.has(lleva)) throw new ErrorDelPasoSugerido(409, "Esa persona ya no lleva la cuenta. Recarga para ver lo último.");
  if (lleva !== yo && !esLiderDeCs(persona.roleEnum)) throw new ErrorDelPasoSugerido(403, "Solo quien lleva la cuenta (o quien lidera Customer Success) puede decidir esta sugerencia.");
  return { lleva, empresa: cuenta.empresa };
}

/** La sugerencia de hoy para esa cuenta, calculada otra vez con el calendario de quien la lleva. */
async function sugerenciaDeHoy(persona: TeamMember, clientId: string, empresa: string, lleva: string, ahora: Date) {
  const hoyISO = crDateParts(ahora).dateKey;
  const servicio = await servicioDeLasCuentas([{ clientId, empresa, llevaEmail: lleva }], {
    ahora,
    hoyISO,
    quienMira: { email: persona.email.toLowerCase(), esSuperAdmin: persona.roleEnum === "SUPER_ADMIN" },
  });
  const s = servicio.get(clientId);
  return s ? siguientePasoDeLaReunion(s, s.proximas, hoyISO) : null;
}

/** «Usar»: deja la reunión como el siguiente paso (una tarea con fecha) y pone al día HubSpot. */
export async function usarElPasoSugerido(
  persona: TeamMember,
  p: PedidoDelPasoSugerido,
  ahora = new Date(),
): Promise<{ id: string; numero: number; estado: string; yaExistia: boolean; hubspot: "al-dia" | "pendiente" }> {
  const { lleva, empresa } = await verificar(persona, p);
  const paso = await sugerenciaDeHoy(persona, p.clientId, empresa, lleva, ahora);
  if (!paso || paso.eventoId !== p.eventoId) {
    throw new ErrorDelPasoSugerido(409, "Esa reunión ya no está en el calendario o la cuenta ya tiene su acción. Recarga para ver lo último.");
  }
  const [ctx, clientes] = await Promise.all([contextoDeTareas({ teamMember: persona }), clientesQueVesParaTareas(persona)]);
  let creada;
  try {
    creada = await crearTarea(ctx, clientes, {
      titulo: paso.titulo,
      para: lleva,
      cuando: lunesDeFecha(paso.fecha),
      venceEl: paso.fecha,
      clientId: p.clientId,
      origen: "paso",
      origenId: origenDelPasoSugerido(p.clientId, p.eventoId),
    });
  } catch (e) {
    if (e instanceof ErrorDeTareas) throw new ErrorDelPasoSugerido(e.status, e.message);
    throw e;
  }
  // Lo que dice HubSpot sale de la tarea: si no responde, la copia queda pendiente y el job lo reintenta cada hora.
  let hubspot: "al-dia" | "pendiente" = "al-dia";
  await sincronizarCuenta(p.clientId).catch((e) => {
    hubspot = "pendiente";
    console.error(`[para-ti] no se pudo poner al día HubSpot para la cuenta ${p.clientId}: ${e instanceof Error ? e.message : e}`);
  });
  olvidarMedicion(persona.email.toLowerCase());
  olvidarMedicion(lleva);
  return { id: creada.id, numero: creada.numero, estado: creada.estado, yaExistia: creada.yaExistia, hubspot };
}

/** «Descartar»: no se le vuelve a sugerir esa reunión a esa persona. */
export async function descartarElPasoSugerido(persona: TeamMember, p: PedidoDelPasoSugerido): Promise<void> {
  await verificar(persona, p);
  const email = persona.email.toLowerCase();
  const clave = claveDelPasoSugerido(p.clientId, p.eventoId);
  try {
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO "SugerenciaDescartada" ("id", "personaEmail", "tipo", "clave") VALUES (${`sd_${crypto.randomUUID()}`}, ${email}, ${TIPO_DESCARTE_DEL_PASO}, ${clave}) ON CONFLICT ("personaEmail", "tipo", "clave") DO NOTHING`,
    );
  } catch (e) {
    console.error(`[para-ti] no se pudo guardar el descarte de ${email}: ${e instanceof Error ? e.message : e}`);
    throw new ErrorDelPasoSugerido(503, "No se pudo guardar. Falta aplicar scripts/sql/2026-10-19-sugerencias-descartadas.sql.");
  }
  olvidarMedicion(email);
}
