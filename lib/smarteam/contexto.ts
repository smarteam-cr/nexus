/**
 * lib/smarteam/contexto.ts — lo que Nexus sabe de la empresa que lo usa (hoy Smarteam): el ÚNICO lector (R13,
 * 2026-10-25). SERVIDOR.
 *
 * Arma, en un lugar, el perfil (`PerfilDeLaEmpresa`), el cliente ideal (`IcpItem`) y las buyer personas
 * (`BuyerPersona`) que cuelgan de su ficha, y el tono. Lo leen Marketing (el agente de ideas) y Documentación; la
 * preventa, las propuestas y el analizador de reuniones de venta lo leerán de acá (la pieza de R11 que habla de nosotros
 * y no del cliente). Un agente nuevo que necesite saber de Smarteam lee de acá: nunca de las tablas sueltas
 * (`lib/smarteam/perfil.test.ts` lo vigila).
 *
 * Cuál es «la empresa que usa Nexus»: la ficha que tiene el perfil; si nadie lo tiene todavía, la única empresa nuestra
 * (`kind = INTERNO`). Con dos empresas nuestras y ningún perfil no se adivina: null, y el perfil se crea a mano en la ficha
 * correcta (o con scripts/cargar-perfil-de-smarteam.ts). Sin empresa, el lector igual devuelve el cliente ideal y las
 * buyer personas (todas, como antes de R13) con `empresa: null`: el agente de ideas no se queda sin contexto en silencio.
 *
 * El cliente ideal y las buyer personas de antes de la carga no tienen empresa (`clientId` null): se leen igual mientras
 * sea la única empresa que usa Nexus, para que el agente de ideas no se quede sin ellos entre el deploy y la carga.
 *
 * Sin `import "server-only"` a propósito: lo leen el agente de ideas de Marketing y sus scripts de consola.
 */
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { ICP_SECTION_META, ICP_SECTION_ORDER } from "@/lib/marketing/seed-data";
import { leerReferencias, leerServicios, PERFIL_VACIO, type ContextoDeLaEmpresaQueUsaNexus, type PerfilDeLaEmpresa } from "./perfil";

/** La empresa que usa Nexus, o null si no se puede saber sin adivinar. */
export async function empresaQueUsaNexus(): Promise<{ id: string; nombre: string } | null> {
  const conPerfil = await prisma.perfilDeLaEmpresa.findFirst({ orderBy: { createdAt: "asc" }, select: { client: { select: { id: true, name: true } } } }).catch((e) => {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  });
  if (conPerfil) return { id: conPerfil.client.id, nombre: conPerfil.client.name };
  const nuestras = await prisma.client.findMany({ where: { kind: "INTERNO" }, select: { id: true, name: true }, take: 2 });
  return nuestras.length === 1 ? { id: nuestras[0].id, nombre: nuestras[0].name } : null;
}

export async function esLaEmpresaQueUsaNexus(clientId: string): Promise<boolean> {
  return (await empresaQueUsaNexus())?.id === clientId;
}

/** El perfil guardado de una empresa (vacío si todavía no lo tiene), con el nombre de cada cliente de referencia. */
export async function perfilDe(clientId: string): Promise<PerfilDeLaEmpresa> {
  const fila = await prisma.perfilDeLaEmpresa.findUnique({ where: { clientId } }).catch((e) => {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  });
  if (!fila) return PERFIL_VACIO;
  const referencias = leerReferencias(fila.clientesDeReferencia);
  const nombres = referencias.length
    ? new Map((await prisma.client.findMany({ where: { id: { in: referencias.map((r) => r.clientId) } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]))
    : new Map<string, string>();
  return {
    propuestaDeValor: fila.propuestaDeValor,
    positionStatement: fila.positionStatement,
    tono: fila.tono,
    servicios: leerServicios(fila.servicios),
    // Una referencia a una ficha que ya no existe (se fusionó o se borró) no se muestra.
    clientesDeReferencia: referencias.filter((r) => nombres.has(r.clientId)).map((r) => ({ ...r, nombre: nombres.get(r.clientId) })),
  };
}

/** Lo que Nexus sabe de la empresa que lo usa. Sin saber cuál es, `empresa: null` y sin perfil, pero con todo lo demás. */
export async function contextoDeSmarteam(): Promise<ContextoDeLaEmpresaQueUsaNexus> {
  const empresa = await empresaQueUsaNexus();
  if (!empresa) console.warn("[smarteam/contexto] no se sabe cuál es la empresa que usa Nexus: se lee todo el cliente ideal, sin perfil.");
  const deLaEmpresa = empresa ? { OR: [{ clientId: empresa.id }, { clientId: null }] } : {};
  const [perfil, icp, personas, marketing] = await Promise.all([
    empresa ? perfilDe(empresa.id) : Promise.resolve(PERFIL_VACIO),
    prisma.icpItem.findMany({ where: deLaEmpresa, orderBy: [{ section: "asc" }, { order: "asc" }], select: { section: true, label: true } }),
    prisma.buyerPersona.findMany({ where: { active: true, ...deLaEmpresa }, orderBy: { order: "asc" }, select: { name: true, role: true, description: true, pains: true, goals: true } }),
    prisma.marketingSettings.findUnique({ where: { id: "marketing" }, select: { brandVoice: true } }),
  ]);
  const clienteIdeal = ICP_SECTION_ORDER.map((s) => ({ seccion: s, etiqueta: ICP_SECTION_META[s].label, items: icp.filter((i) => i.section === s).map((i) => i.label) })).filter(
    (s) => s.items.length > 0,
  );
  return {
    empresa,
    perfil,
    tono: perfil.tono ?? (marketing?.brandVoice?.trim() || null),
    clienteIdeal,
    buyerPersonas: personas.map((p) => ({ nombre: p.name, cargo: p.role, descripcion: p.description, dolores: p.pains, objetivos: p.goals })),
  };
}
