/**
 * lib/sessions/empresa-de-la-reunion-server.ts — una persona decide de qué empresa es una reunión (T3 y T8,
 * 2026-10-25). SERVIDOR.
 *
 * Tres gestos, una sola escritura:
 *   · «confirmar» la propuesta de Nexus (lib/sessions/propuesta-de-empresa-server.ts): la empresa que ya está, o la de
 *     HubSpot, que se crea como prospecto por la puerta que ya crea prospectos (`clienteDeLaEmpresaDeVentas`);
 *   · «elegir» otra empresa (de las que quien decide puede abrir);
 *   · «mover» una reunión que quedó en otra empresa con el mismo dominio a la del proyecto (T8, desde el buscador).
 * El dueño se escribe SOLO por `asignarDuenioManual` (con su procedencia, «humano», y quién) y después `reResolveSession`,
 * que es como lo materializa el resolver único y encola la lectura si la reunión es fresca (invariante 2: aquí no se
 * elige empresa por ningún dominio ni título). Una reunión de más de `DIAS_DE_FRESCURA` días no se lee sola: va por la
 * recuperación por lote (scripts/encolar-lecturas-pendientes.ts --recuperacion).
 *
 * En la MISMA transacción se sueltan los vínculos de la reunión a proyectos de otra empresa (invariante 1: una reunión
 * movida de B a A no puede seguir colgada de un proyecto de B; el reclasificador no los suelta en una reunión de hace
 * meses ni en un vínculo puesto a mano). Y sin reclasificar con IA (`reclassify: false`): costaría cerca de un dólar por
 * gesto; el proyecto se elige en la reunión (la reunión lo avisa). Sin dueña, solo escribe si SIGUE sin dueña: si otra
 * persona la decidió en el mismo instante, responde 409 en vez de pisarla.
 *
 * Quién puede: una reunión sin dueña la decide quien la organizó o estuvo invitado, o la líder de Customer Success y
 * dirección (`puedeDecidirLaEmpresa`). Moverla de una empresa a otra pide poder abrir las dos. La empresa elegida tiene
 * que ser una que quien decide puede abrir: una reunión no entra a una cuenta que esa persona no ve.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { accessibleClientWhere, clientesQueNoAbre } from "@/lib/auth/access";
import type { AppUserWithTeamMember } from "@/lib/auth/supabase";
import { clienteDeLaEmpresaDeVentas } from "@/lib/clients/cliente-de-la-empresa-de-ventas";
import { can } from "@/lib/auth/permissions/engine";
import { asignarDuenioManual } from "./duenio-manual";
import { duenoDeLaSesion } from "./project-sources";
import { reResolveSession } from "./resolve-client";
import { mensajeDespuesDeDecidir, puedeDecidirLaEmpresa } from "./propuesta-de-empresa";

/** `esperada`: la propuesta que vio la persona (`tipo` y su `clave`: el id de la empresa o el de HubSpot). */
export type GestoSobreLaEmpresa =
  | { accion: "confirmar"; esperada: { tipo: "CLIENTE" | "HUBSPOT"; clave: string } }
  | { accion: "elegir"; clientId: string }
  | { accion: "mover"; clientId: string };

export interface QuienDecide {
  email: string;
  teamMemberId: string;
  /** La líder de Customer Success o dirección (`esLiderDeCs`): ve todas las reuniones del tablero. */
  veTodo: boolean;
}

export type ResultadoDeLaEmpresa =
  | { ok: true; clientId: string; nombre: string; creada: boolean; mensaje: string }
  | { ok: false; status: number; error: string };

export async function decidirEmpresaDeLaReunion(sessionId: string, gesto: GestoSobreLaEmpresa, quien: QuienDecide, ahora = new Date()): Promise<ResultadoDeLaEmpresa> {
  const s = await prisma.firefliesSession.findUnique({
    where: { id: sessionId },
    select: { id: true, title: true, date: true, participants: true, organizerEmail: true, resolvedClientId: true, manualClientId: true },
  });
  if (!s) return { ok: false, status: 404, error: "Esa reunión no existe." };
  const actual = duenoDeLaSesion(s);

  // ── Quién puede ──
  if (actual) {
    if (gesto.accion !== "mover") return { ok: false, status: 409, error: "Esta reunión ya tiene empresa. Para cambiarla, usa «Mover a esta empresa»." };
    if ((await clientesQueNoAbre(quien.teamMemberId, [actual])).size) return { ok: false, status: 404, error: "Esa reunión no existe." };
  } else if (!puedeDecidirLaEmpresa({ organizador: s.organizerEmail, participantes: s.participants }, quien)) {
    return { ok: false, status: 403, error: "La empresa de esta reunión la decide quien la organizó o estuvo en ella." };
  }

  const propuesta = await prisma.propuestaDeEmpresa
    .findUnique({ where: { sessionId }, select: { id: true, tipo: true, clientId: true, hubspotCompanyId: true, nombre: true, dominio: true, decision: true } })
    .catch(() => null);

  // ── A qué empresa ──
  let destino: string;
  let creada = false;
  if (gesto.accion === "confirmar") {
    if (!propuesta || propuesta.decision) return { ok: false, status: 409, error: "Nexus ya no propone una empresa para esta reunión. Elígela de la lista." };
    // La propuesta que vio la persona: si el job la cambió mientras tanto, no se confirma la nueva sin verla.
    const clave = propuesta.tipo === "CLIENTE" ? propuesta.clientId : propuesta.hubspotCompanyId;
    if (gesto.esperada.tipo !== propuesta.tipo || gesto.esperada.clave !== clave) {
      return { ok: false, status: 409, error: "La propuesta de Nexus cambió mientras mirabas. Vuelve a cargar la página." };
    }
    if (propuesta.tipo === "CLIENTE") {
      if (!propuesta.clientId) return { ok: false, status: 409, error: "La empresa que se proponía ya no existe. Elígela de la lista." };
      destino = propuesta.clientId;
    } else {
      if (!propuesta.hubspotCompanyId) return { ok: false, status: 409, error: "La propuesta no tiene empresa de HubSpot. Elígela de la lista." };
      // Crear un prospecto pide lo mismo que las otras puertas que los crean (la propuesta y la exploración de venta).
      if (!quien.veTodo && !(await puedeCrearProspectos(quien.teamMemberId))) {
        return { ok: false, status: 403, error: "Crear un prospecto pide acceso a Ventas o a Preventa: pídele a la líder de Customer Success que la confirme." };
      }
      const r = await clienteDeLaEmpresaDeVentas({
        companyId: propuesta.hubspotCompanyId,
        companyName: propuesta.nombre,
        domain: (propuesta.dominio ?? "").toLowerCase(),
        origen: "reuniones/empresa",
      });
      if (!r.ok) return { ok: false, status: 409, error: r.mensaje };
      destino = r.clientId;
      creada = r.creado;
    }
  } else {
    destino = gesto.clientId;
  }

  const empresa = await prisma.client.findUnique({ where: { id: destino }, select: { id: true, name: true } });
  if (!empresa) return { ok: false, status: 400, error: "Esa empresa no existe." };
  // Una empresa recién creada desde la propuesta todavía no tiene a nadie asignado: no se le pide acceso a quien la creó.
  if (!creada && (await clientesQueNoAbre(quien.teamMemberId, [destino])).size) {
    return { ok: false, status: 403, error: "No tienes esa empresa asignada: pídele a la líder de Customer Success que la elija." };
  }
  if (actual === destino) return { ok: true, clientId: destino, nombre: empresa.name, creada, mensaje: `La reunión ya era de ${empresa.name}.` };

  const escribio = await prisma.$transaction(async (tx) => {
    const ok = await asignarDuenioManual(sessionId, destino, { origen: "humano", actorEmail: quien.email.toLowerCase(), soloSiSinDuenio: !actual, db: tx });
    // Invariante 1: ningún vínculo a un proyecto de otra empresa sobrevive al cambio de dueña.
    if (ok) await tx.sessionProject.deleteMany({ where: { sessionId, project: { clientId: { not: destino } } } });
    return ok;
  });
  if (!escribio) return { ok: false, status: 409, error: "Alguien ya eligió la empresa de esta reunión. Vuelve a cargar la página." };
  await reResolveSession(sessionId, undefined, { reclassify: false });

  if (propuesta && !propuesta.decision) {
    const confirmo = gesto.accion === "confirmar" || (propuesta.tipo === "CLIENTE" && propuesta.clientId === destino);
    await prisma.propuestaDeEmpresa
      .update({ where: { id: propuesta.id }, data: { decision: confirmo ? "CONFIRMADA" : "OTRA", decididaAt: ahora, decididaPor: quien.email.toLowerCase() } })
      .catch((e) => console.warn(`[empresa-de-la-reunion] no se anotó la decisión de ${sessionId}:`, e instanceof Error ? e.message : e));
  }
  return { ok: true, clientId: destino, nombre: empresa.name, creada, mensaje: mensajeDespuesDeDecidir(empresa.name, s.date, ahora, creada) };
}

/**
 * Las empresas que quien decide puede abrir, para elegir la de una reunión: de toda clase (cliente, prospecto, aliado,
 * Smarteam), por nombre. La misma regla de acceso que la lista de clientes (`accessibleClientWhere`).
 */
export async function empresasParaElegir(user: AppUserWithTeamMember): Promise<{ id: string; nombre: string }[]> {
  const where = await accessibleClientWhere(user, { kinds: "all" });
  const filas = await prisma.client.findMany({ where: where ?? undefined, select: { id: true, name: true }, orderBy: { name: "asc" } });
  return filas.map((c) => ({ id: c.id, nombre: c.name }));
}

/** ¿Puede crear prospectos? Lo mismo que piden la propuesta (`ventas.read`) y la exploración de venta (`preventa.read`). */
async function puedeCrearProspectos(teamMemberId: string): Promise<boolean> {
  const tm = await prisma.teamMember.findUnique({ where: { id: teamMemberId } });
  if (!tm || tm.deactivatedAt) return false;
  return (await can(tm, "ventas", "read")) || (await can(tm, "preventa", "read"));
}
