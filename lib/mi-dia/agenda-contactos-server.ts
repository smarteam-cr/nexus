/**
 * lib/mi-dia/agenda-contactos-server.ts — a quién invitar al borrador de un evento de la agenda del inicio (2026-10-17).
 * Solo lectura.
 *
 * Busca en la copia de los contactos de HubSpot (`ContactoDeHubspot`) por nombre, correo, cargo o empresa, y entre las
 * cuentas por su nombre. Solo las cuentas que la persona ve: el MISMO acceso de `requireAccessToClient`, de cualquier
 * tipo (cliente o prospecto), sin las empresas de Smarteam (`cuentasParaVerTareas`, lib/tareas/clientes.ts). Un
 * contacto sin correo no sirve para invitarlo y no se lista.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { modeloDisponible } from "@/lib/db/esquema";
import { clientesQueVesParaTareas } from "@/lib/tareas/clientes";
import type { ResultadoParaAgendar } from "./agenda-borrador";

/** Lo mínimo para buscar: dos letras. */
export const MIN_LETRAS_PARA_BUSCAR = 2;
const MAX_CONTACTOS = 12;
const MAX_CUENTAS = 5;
/** De una cuenta elegida: sus contactos con más actividad reciente. */
const MAX_DE_LA_CUENTA = 8;

type TmParaAcceso = Pick<TeamMember, "id" | "email" | "roleEnum" | "permissionOverrides" | "canViewAllClients" | "canViewAllExpiresAt">;

const sinTildes = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export async function contactosParaAgendar(tm: TmParaAcceso, o: { q?: string | null; cliente?: string | null }): Promise<ResultadoParaAgendar> {
  const vacio: ResultadoParaAgendar = { contactos: [], cuentas: [] };
  const q = (o.q ?? "").trim();
  if (!o.cliente && q.length < MIN_LETRAS_PARA_BUSCAR) return vacio;
  const ves = await clientesQueVesParaTareas(tm);
  const cuentas = [...ves.porId.values()].filter((e) => e.kind !== "INTERNO");
  const ids = new Set(cuentas.map((c) => c.id));
  const nombreDe = (id: string) => ves.porId.get(id)?.nombre ?? "";

  // Una cuenta elegida: sus contactos (sin cuenta que veas, nada).
  if (o.cliente) {
    if (!ids.has(o.cliente) || !modeloDisponible(prisma.contactoDeHubspot)) return vacio;
    const filas = await prisma.contactoDeHubspot.findMany({
      where: { clientId: o.cliente, vigente: true, email: { not: null } },
      orderBy: [{ ultimaActividadAt: { sort: "desc", nulls: "last" } }, { nombre: "asc" }],
      take: MAX_DE_LA_CUENTA,
      select: { id: true, nombre: true, email: true, cargo: true, clientId: true },
    });
    return {
      contactos: filas.map((f) => ({ id: f.id, nombre: f.nombre, email: f.email!.toLowerCase(), cargo: f.cargo, clientId: f.clientId, empresa: nombreDe(f.clientId) })),
      cuentas: [{ id: o.cliente, nombre: nombreDe(o.cliente) }],
    };
  }

  const buscado = sinTildes(q);
  const cuentasQueCalzan = cuentas.filter((c) => sinTildes(c.nombre).includes(buscado));
  const porEmpresa = cuentasQueCalzan.map((c) => c.id);
  const filas = modeloDisponible(prisma.contactoDeHubspot)
    ? await prisma.contactoDeHubspot.findMany({
        where: {
          clientId: { in: [...ids] },
          vigente: true,
          email: { not: null },
          OR: [
            { nombre: { contains: q, mode: "insensitive" } },
            { email: { contains: q, mode: "insensitive" } },
            { cargo: { contains: q, mode: "insensitive" } },
            ...(porEmpresa.length ? [{ clientId: { in: porEmpresa } }] : []),
          ],
        },
        orderBy: [{ ultimaActividadAt: { sort: "desc", nulls: "last" } }, { nombre: "asc" }],
        take: MAX_CONTACTOS,
        select: { id: true, nombre: true, email: true, cargo: true, clientId: true },
      })
    : [];
  return {
    contactos: filas.map((f) => ({ id: f.id, nombre: f.nombre, email: f.email!.toLowerCase(), cargo: f.cargo, clientId: f.clientId, empresa: nombreDe(f.clientId) })),
    cuentas: cuentasQueCalzan.slice(0, MAX_CUENTAS).map((c) => ({ id: c.id, nombre: c.nombre })),
  };
}
