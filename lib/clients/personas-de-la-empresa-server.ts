/**
 * lib/clients/personas-de-la-empresa-server.ts — las personas de cada empresa: la copia desde sus fuentes, el rol que
 * dice el equipo y la lectura (R6, 2026-10-25). SERVIDOR. El ÚNICO escritor de `PersonaDeLaEmpresa`.
 *
 * La copia junta, de UNA empresa: sus contactos de HubSpot (la copia de cada hora, `ContactoDeHubspot`), las personas de
 * los cuestionarios de sus proyectos y los participantes de sus reuniones, que se leen SOLO por el chokepoint
 * (lib/sessions/project-sources.ts › getClientSessions, invariante 1). La regla de quién entra es pura
 * (personas-de-la-empresa.ts). Nunca borra una fila: la que ya no sale de ninguna fuente queda `vigente = false`, salvo la
 * que confirmó o sumó alguien del equipo. Nunca toca el rol ni la confirmación: los dice una persona del equipo
 * (`guardarInterlocutor`, «Unidades e interlocutores», 2026-11-25; `decidirRol` es el de R6, sin pantalla).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getClientSessions, genteCompartidaConOtrosClientes } from "@/lib/sessions/project-sources";
import { dominioDelSitio } from "./datos-de-la-empresa";
import { aMirarSiEsCompartido, cambiosDePersona, laSostieneElEquipo, ROLES_DE_PERSONA, unirPersonas, type RolDePersona } from "./personas-de-la-empresa";
import { armarInterlocutores, type CambioDeInterlocutor, type FichaDeLaEmpresa, type Interlocutor } from "./interlocutores";
import type { Prisma } from "@prisma/client";
import { buildInternalDomainsSet, esLaCasaEn } from "@/lib/sessions/categorize";

/** Cuántas reuniones de la empresa se miran (las más recientes): alcanza para saber quién va. */
const REUNIONES_QUE_SE_MIRAN = 300;

export interface ResultadoDeLaCopiaDePersonas {
  creadas: number;
  actualizadas: number;
  deBaja: number;
  /** Las que quedarían (para el simulacro). */
  personas: { correo: string; nombre: string | null; origenes: string[]; reuniones: number }[];
}

export async function copiarPersonasDeLaEmpresa(clientId: string, o: { apply: boolean }): Promise<ResultadoDeLaCopiaDePersonas> {
  const empresa = await prisma.client.findUnique({ where: { id: clientId }, select: { emailDomains: true, sitioWeb: true } });
  if (!empresa) throw new Error("La empresa no existe.");
  const [contactos, cuestionarios, sesiones, equipo, antes] = await Promise.all([
    prisma.contactoDeHubspot.findMany({ where: { clientId }, select: { id: true, email: true, nombre: true, cargo: true, vigente: true } }),
    prisma.cuestionarioResponsable.findMany({ where: { project: { clientId }, revokedAt: null }, select: { email: true, nombre: true, cargo: true } }),
    getClientSessions(clientId, { take: REUNIONES_QUE_SE_MIRAN }),
    prisma.teamMember.findMany({ select: { email: true } }),
    prisma.personaDeLaEmpresa.findMany({ where: { clientId } }),
  ]);
  const dominiosDeLaEmpresa = [...empresa.emailDomains, ...(empresa.sitioWeb ? [dominioDelSitio(empresa.sitioWeb)] : [])];
  const compartidos = await genteCompartidaConOtrosClientes(clientId, aMirarSiEsCompartido(sesiones.flatMap((s) => s.participants), dominiosDeLaEmpresa));
  const unidas = unirPersonas({
    contactos,
    cuestionarios,
    reuniones: sesiones.map((s) => ({ fecha: new Date(s.date), participantes: s.participants })),
    dominiosDeLaEmpresa,
    correosDelEquipo: equipo.map((t) => t.email),
    compartidos,
  });

  const porCorreo = new Map(antes.map((p) => [p.correo, p]));
  const nuevas = unidas.filter((u) => !porCorreo.has(u.correo));
  const cambios = unidas.flatMap((u) => {
    const a = porCorreo.get(u.correo);
    const c = a ? cambiosDePersona(a, u) : null;
    return a && c ? [{ id: a.id, c }] : [];
  });
  const siguen = new Set(unidas.map((u) => u.correo));
  // Lo que confirmó o sumó una persona del equipo no lo da de baja la copia («Unidades e interlocutores», 25 nov).
  const deBaja = antes.filter((a) => a.vigente && !siguen.has(a.correo) && !laSostieneElEquipo(a));

  if (o.apply) {
    await prisma.$transaction(async (tx) => {
      if (nuevas.length) await tx.personaDeLaEmpresa.createMany({ data: nuevas.map((u) => ({ clientId, ...u })), skipDuplicates: true });
      for (const { id, c } of cambios) await tx.personaDeLaEmpresa.update({ where: { id }, data: c });
      if (deBaja.length) await tx.personaDeLaEmpresa.updateMany({ where: { id: { in: deBaja.map((d) => d.id) } }, data: { vigente: false } });
    });
  }
  return {
    creadas: nuevas.length,
    actualizadas: cambios.length,
    deBaja: deBaja.length,
    personas: unidas.map((u) => ({ correo: u.correo, nombre: u.nombre, origenes: u.origenes, reuniones: u.reuniones })),
  };
}

/** El rol de una persona, dicho por alguien del equipo. null lo borra. */
export async function decidirRol(a: { clientId: string; personaId: string; rol: RolDePersona | null; ahora?: Date }): Promise<void> {
  if (a.rol !== null && !(ROLES_DE_PERSONA as readonly string[]).includes(a.rol)) throw new Error("Ese rol no existe.");
  const r = await prisma.personaDeLaEmpresa.updateMany({
    where: { id: a.personaId, clientId: a.clientId },
    data: { rol: a.rol, rolFuente: a.rol ? "persona" : null, rolAt: a.rol ? (a.ahora ?? new Date()) : null },
  });
  if (r.count !== 1) throw new Error("Esa persona no es de esta empresa.");
}

/** Las personas vigentes de una empresa, las que más van a las reuniones primero. */
export async function personasDeLaEmpresa(clientId: string) {
  return prisma.personaDeLaEmpresa.findMany({
    where: { clientId, vigente: true },
    orderBy: [{ reuniones: "desc" }, { correo: "asc" }],
    select: { id: true, correo: true, nombre: true, cargo: true, rol: true, rolFuente: true, lado: true, origenes: true, reuniones: true, ultimaReunionAt: true, contactoDeHubspotId: true },
  });
}

// ── «Unidades e interlocutores» (2026-11-25) ─────────────────────────────────────────────────────────────────────────

/**
 * La empresa de una ficha: ella sola o, si es de una empresa con unidades (`comparteDominioConId`), la principal y todas
 * sus unidades, la principal primero y después por antigüedad. Sin cadenas, como el resolver (categorize.ts ›
 * `gruposDeEntidades`).
 */
export async function fichasDeLaEmpresa(clientId: string): Promise<FichaDeLaEmpresa[]> {
  const ficha = await prisma.client.findUnique({ where: { id: clientId }, select: { id: true, comparteDominioConId: true } });
  if (!ficha) return [];
  const principalId = ficha.comparteDominioConId ?? ficha.id;
  const todas = await prisma.client.findMany({
    where: { OR: [{ id: principalId }, { comparteDominioConId: principalId }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { id: true, name: true, comparteDominioConId: true },
  });
  const principal = todas.find((c) => c.id === principalId);
  /* Una principal que a su vez cuelga de otra no arma grupo en el resolver: acá tampoco. */
  if (!principal || principal.comparteDominioConId) return [{ id: ficha.id, nombre: todas.find((c) => c.id === ficha.id)?.name ?? "", principal: true }];
  return [principal, ...todas.filter((c) => c.id !== principalId)].map((c) => ({ id: c.id, nombre: c.name, principal: c.id === principalId }));
}

/**
 * Las personas de la empresa de una ficha, una por correo (lib/clients/interlocutores.ts › `armarInterlocutores`). Con
 * `abre`, solo las unidades que quien mira abre (la de la página siempre): en Nexus el acceso es por ficha.
 */
export async function interlocutoresDeLaEmpresa(
  clientId: string,
  o: { abre?: (id: string) => boolean } = {},
): Promise<{ fichas: FichaDeLaEmpresa[]; personas: Interlocutor[] }> {
  const fichas = (await fichasDeLaEmpresa(clientId)).filter((f) => f.id === clientId || (o.abre?.(f.id) ?? true));
  const ids = fichas.map((f) => f.id);
  const filas = await prisma.personaDeLaEmpresa.findMany({
    where: { clientId: { in: ids }, OR: [{ vigente: true }, { confirmadaAt: { not: null } }, { origenes: { has: "equipo" } }] },
    select: {
      clientId: true, correo: true, nombre: true, cargo: true, rol: true, origenes: true, reuniones: true, ultimaReunionAt: true,
      vigente: true, confirmadaAt: true, confirmadaPorEmail: true,
    },
  });
  const correos = [...new Set(filas.map((f) => f.correo))];
  const deOtras = correos.length
    ? await prisma.personaDeLaEmpresa.findMany({
        where: { correo: { in: correos }, clientId: { notIn: ids }, confirmadaAt: { not: null } },
        select: { correo: true, clientId: true, client: { select: { name: true } } },
      })
    : [];
  return {
    fichas,
    personas: armarInterlocutores({ fichas, filas, deOtras: deOtras.map((d) => ({ correo: d.correo, clientId: d.clientId, nombre: d.client.name })) }),
  };
}

/** Las fichas donde está confirmada hoy una persona (todas, de cualquier empresa). */
export async function fichasConfirmadasDe(correo: string): Promise<string[]> {
  const filas = await prisma.personaDeLaEmpresa.findMany({
    where: { correo: correo.trim().toLowerCase(), confirmadaAt: { not: null } },
    select: { clientId: true },
  });
  return filas.map((f) => f.clientId);
}


/** Un pedido que no se guarda por una regla (no por un error): la ruta responde 400 con su mensaje. */
export class RechazoDeInterlocutor extends Error {}

/**
 * Por qué NO se guarda a esta persona en estas fichas, o null. La regla vive acá, en el escritor, para la pantalla y para
 * la precarga (revisión del 25 nov):
 *  · nadie del equipo de Smarteam es una persona del cliente (INV51), por su correo o su dominio;
 *  · un correo de una categoría de reuniones (HubSpot, partners) no es gente de un cliente: confirmarlo le daba a una
 *    ficha las reuniones del partner, que suelen tratar varias cuentas;
 *  · en la ficha de Smarteam («la casa», la misma regla que el resolver: `esLaCasaEn`) no se confirma ni se sugiere a nadie.
 */
export async function motivoParaNoGuardar(a: { correo: string; fichas: readonly string[] }): Promise<string | null> {
  const correo = a.correo.trim().toLowerCase();
  const dominio = correo.split("@")[1] ?? "";
  const [categorias, delEquipo, fichas] = await Promise.all([
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
    prisma.teamMember.count({ where: { email: { equals: correo, mode: "insensitive" } } }),
    a.fichas.length ? prisma.client.findMany({ where: { id: { in: [...a.fichas] } }, select: { name: true, company: true, emailDomains: true } }) : [],
  ]);
  const internos = buildInternalDomainsSet(categorias);
  if (delEquipo || internos.has(dominio)) return "Esa persona es del equipo de Smarteam.";
  if (categorias.some((c) => c.kind !== "internal" && c.domains.some((d) => d.toLowerCase() === dominio))) {
    return "Ese correo es de HubSpot o de un partner (una categoría de reuniones), no de la gente de un cliente.";
  }
  if (fichas.some(esLaCasaEn(internos))) return "En la ficha de Smarteam no se confirma gente del cliente.";
  return null;
}

/**
 * Guarda lo que una persona del equipo dice de una persona del cliente: su nombre y cargo (si faltan), su rol, en qué
 * fichas queda CONFIRMADA y en cuáles SUGERIDA. Toca SOLO las fichas de `tocables` (la ruta ya comprobó el acceso a cada
 * una). Crea la fila que falte (origen `equipo`); nunca borra una. El rol se escribe en todas las filas de la persona en
 * las fichas que se tocan. Devuelve con qué fichas quedó confirmada (todas).
 *
 * ⚠ No mueve ninguna reunión: quien llama decide si re-resolver (resolve-client.ts › `reResolverReunionesDe`), después
 * de mostrar cuántas cambian.
 */
export async function guardarInterlocutor(a: {
  tocables: readonly string[];
  cambio: CambioDeInterlocutor;
  porEmail: string;
  ahora?: Date;
  db?: Prisma.TransactionClient | typeof prisma;
  /** Para DESHACER un guardado que no pudo terminar (la ruta, si la cuenta cambió en ese instante): sin las reglas de suma. */
  sinReglas?: boolean;
}): Promise<{ confirmadaEn: string[] }> {
  const db = a.db ?? prisma;
  const ahora = a.ahora ?? new Date();
  const { cambio } = a;
  const correo = cambio.correo.trim().toLowerCase();
  const tocables = [...new Set(a.tocables)];
  const nombradas = [...(cambio.confirmadaEn ?? []), ...(cambio.sugeridaEn ?? [])];
  for (const id of nombradas) {
    if (!tocables.includes(id)) throw new RechazoDeInterlocutor("Esa ficha no se puede tocar desde aquí.");
  }
  const filas = await db.personaDeLaEmpresa.findMany({ where: { correo } });
  /* Las reglas frenan solo lo que se SUMA: quitar una confirmación o una sugerencia siempre se puede (si el dominio de la
     persona pasó a ser una categoría, hay que poder deshacerla; revisión del 25 nov). */
  const yaConfirmada = new Set(filas.filter((f) => f.confirmadaAt).map((f) => f.clientId));
  const yaSugerida = new Set(filas.filter((f) => !f.confirmadaAt && f.origenes.includes("equipo")).map((f) => f.clientId));
  const suma = [...(cambio.confirmadaEn ?? []).filter((f) => !yaConfirmada.has(f)), ...(cambio.sugeridaEn ?? []).filter((f) => !yaSugerida.has(f))];
  if (suma.length && !a.sinReglas) {
    const motivo = await motivoParaNoGuardar({ correo, fichas: suma });
    if (motivo) throw new RechazoDeInterlocutor(motivo);
  }
  const enTocables = new Map(filas.filter((f) => tocables.includes(f.clientId)).map((f) => [f.clientId, f]));
  const deCualquiera = filas[0];
  const nombre = cambio.nombre || deCualquiera?.nombre || null;
  const cargo = cambio.cargo || deCualquiera?.cargo || null;

  for (const clientId of tocables) {
    const fila = enTocables.get(clientId);
    const confirmar = cambio.confirmadaEn ? cambio.confirmadaEn.includes(clientId) : !!fila?.confirmadaAt;
    const sugerir = !confirmar && (cambio.sugeridaEn?.includes(clientId) ?? false);
    const rol = cambio.rol !== undefined ? cambio.rol : (fila?.rol ?? null);
    if (!fila) {
      // Solo se crea la fila donde queda confirmada o sugerida: no se siembran filas vacías en las demás unidades.
      if (!confirmar && !sugerir) continue;
      await db.personaDeLaEmpresa.create({
        data: {
          clientId, correo, nombre, cargo, origenes: ["equipo"], lado: "empresa",
          rol, rolFuente: rol ? "persona" : null, rolAt: rol ? ahora : null,
          confirmadaAt: confirmar ? ahora : null, confirmadaPorEmail: confirmar ? a.porEmail : null,
        },
      });
      continue;
    }
    const data: Prisma.PersonaDeLaEmpresaUpdateInput = {};
    if (!fila.nombre && nombre) data.nombre = nombre;
    if (cambio.nombre && cambio.nombre !== fila.nombre) data.nombre = cambio.nombre;
    if (!fila.cargo && cargo) data.cargo = cargo;
    if (cambio.cargo && cambio.cargo !== fila.cargo) data.cargo = cambio.cargo;
    if (cambio.rol !== undefined && cambio.rol !== fila.rol) {
      data.rol = cambio.rol;
      data.rolFuente = cambio.rol ? "persona" : null;
      data.rolAt = cambio.rol ? ahora : null;
    }
    if (confirmar && !fila.confirmadaAt) {
      data.confirmadaAt = ahora;
      data.confirmadaPorEmail = a.porEmail;
      data.vigente = true;
    } else if (!confirmar && fila.confirmadaAt) {
      data.confirmadaAt = null;
      data.confirmadaPorEmail = null;
    }
    if (sugerir && !fila.origenes.includes("equipo")) data.origenes = [...fila.origenes, "equipo"];
    if (cambio.sugeridaEn && !sugerir && !confirmar && fila.origenes.includes("equipo")) {
      data.origenes = fila.origenes.filter((x) => x !== "equipo");
      // La sumó solo el equipo y ahora se quita: deja de verse (la fila no se borra, como siempre).
      if (data.origenes.length === 0) data.vigente = false;
    }
    if (Object.keys(data).length) await db.personaDeLaEmpresa.update({ where: { id: fila.id }, data });
  }
  const despues = await db.personaDeLaEmpresa.findMany({ where: { correo, confirmadaAt: { not: null } }, select: { clientId: true } });
  return { confirmadaEn: despues.map((f) => f.clientId) };
}

/** Lo que tenía una persona en estas fichas antes de un guardado, para deshacerlo tal cual (`restaurarPersona`). */
export async function fotoDeLaPersona(correo: string, fichas: readonly string[]) {
  return prisma.personaDeLaEmpresa.findMany({ where: { correo: correo.trim().toLowerCase(), clientId: { in: [...fichas] } } });
}

/**
 * DESHACE un guardado que no pudo terminar (la ruta de interlocutores, si la cuenta cambió en ese instante o HubSpot no
 * respondió): deja cada fila de la persona en esas fichas EXACTAMENTE como estaba en la foto (confirmación, quién y
 * cuándo, rol, nombre, cargo, orígenes, vigencia) y borra las que creó el guardado. En una transacción (revisión del
 * 25 nov: volver atrás solo la confirmación dejaba el rol nuevo y una fila sugerida para siempre).
 */
export async function restaurarPersona(foto: Awaited<ReturnType<typeof fotoDeLaPersona>>, correo: string, fichas: readonly string[]): Promise<void> {
  const limpio = correo.trim().toLowerCase();
  await prisma.$transaction(async (tx) => {
    const ids = foto.map((f) => f.id);
    await tx.personaDeLaEmpresa.deleteMany({ where: { correo: limpio, clientId: { in: [...fichas] }, id: { notIn: ids } } });
    for (const f of foto) {
      await tx.personaDeLaEmpresa.update({
        where: { id: f.id },
        data: {
          nombre: f.nombre,
          cargo: f.cargo,
          rol: f.rol,
          rolFuente: f.rolFuente,
          rolAt: f.rolAt,
          origenes: f.origenes,
          vigente: f.vigente,
          confirmadaAt: f.confirmadaAt,
          confirmadaPorEmail: f.confirmadaPorEmail,
        },
      });
    }
  });
}
