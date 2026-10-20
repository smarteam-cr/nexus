/**
 * lib/para-ti/fuentes/compromisos.ts — el aviso de las 48 horas (iniciativa B de docs/roadmap.md; plan en
 * docs/correos-en-el-contexto-plan.md). SERVER-ONLY.
 *
 * Un compromiso con el cliente (de un correo enviado o de una reunión) que a las 48 horas nadie tomó, y si es una
 * reunión, que no está en el calendario, ni planeada en Tareas, ni ocurrió. La regla es pura
 * (lib/comunicaciones/sin-agendar.ts); los datos, lib/comunicaciones/sin-agendar-server.ts.
 *
 *   · `COMPROMISOS_SIN_AGENDAR` (personal): al CSE de la cuenta (el encargado en HubSpot de un proyecto de la cuenta),
 *     una línea por compromiso, con su calendario. En un prospecto no hay CSE: le llega a quien tiene la propuesta.
 *   · `COMPROMISOS_SIN_AGENDAR_CS` (frente «Liderar Customer Success»): una línea por cuenta.
 */
import "server-only";
import { compromisosSinAgendar, type CompromisoSinAgendar } from "@/lib/comunicaciones/sin-agendar-server";
import { tituloDelAviso } from "@/lib/comunicaciones/sin-agendar";
import { prisma } from "@/lib/db/prisma";
import type { Fuente } from "../fuente";
import { cuentasDeLaCarteraConSuCse, veLaCarteraEntera } from "./servicio";
import type { Pendiente } from "../tipos";

const hrefDeLaTarea = (id: string) => `/tareas?t=${encodeURIComponent(id)}`;

/**
 * «Tomarlo o decidir» (Elías, 2026-10-19): lo tuyo que salió de una reunión se decide en «Lo que dejó esta reunión»,
 * junto con lo demás de esa reunión. Lo de un correo o «Por asignar» abre la tarea.
 */
function hrefDelCompromiso(c: CompromisoSinAgendar, email: string): string {
  if (c.tarea.sessionId && c.tarea.estado === "propuesta" && c.tarea.responsableEmail === email) return `/sessions/${encodeURIComponent(c.tarea.sessionId)}#lo-que-dejo`;
  return hrefDeLaTarea(c.tarea.tareaId);
}

function detalle(c: CompromisoSinAgendar): string {
  const partes = [`«${c.tarea.titulo}»`];
  if (c.tarea.venceEl) partes.push(`para el ${c.tarea.venceEl}`);
  partes.push(c.tarea.responsableEmail ? "propuesta sin decidir" : "por asignar");
  if (c.aviso.sinCalendario) partes.push("no se pudo leer el calendario");
  return partes.join(" · ");
}

export const COMPROMISOS_SIN_AGENDAR: Fuente = {
  clave: "compromisos-sin-agendar",
  frente: null,
  alDia: "Lo que se le prometió al cliente está agendado o en Tareas",
  async medir(a, c) {
    const cuentas = [...new Set(a.proyectos.filter((p) => p.encargado).map((p) => p.clientId))];
    // Lo de un prospecto (sin CSE) le llega a quien tiene la propuesta.
    const prospectos = await prisma.tarea.findMany({
      where: { responsableEmail: a.email, estado: "propuesta", archivadaAt: null, client: { kind: "PROSPECTO" }, OR: [{ origen: "correo" }, { origenId: { contains: ":seg-" } }] },
      select: { clientId: true },
      distinct: ["clientId"],
      take: 20,
    });
    const ids = [...new Set([...cuentas, ...prospectos.flatMap((p) => (p.clientId ? [p.clientId] : []))])];
    if (!ids.length) return [];
    const lista = await compromisosSinAgendar({ clientIds: ids, calendarioDe: async () => a.email, ahora: c.ahora });
    return lista
      .filter((x) => cuentas.includes(x.tarea.clientId) || x.tarea.responsableEmail === a.email)
      .map(
        (x): Pendiente => ({
          clave: `compromisos-sin-agendar:${x.tarea.tareaId}`,
          fuente: "compromisos-sin-agendar",
          cuando: "hoy",
          delAgente: false,
          clientId: x.tarea.clientId,
          titulo: tituloDelAviso(x.aviso, x.tarea, x.empresa),
          detalle: detalle(x),
          meta: x.tarea.origen === "correo" ? "Correo con el cliente" : "Reunión con el cliente",
          accion: x.aviso.motivo === "reunion_sin_agendar" ? "Agendar o decidir" : "Tomarlo o decidir",
          href: hrefDelCompromiso(x, a.email),
          desde: x.tarea.creadaAt.toISOString(),
        }),
      );
  },
};

export const COMPROMISOS_SIN_AGENDAR_CS: Fuente = {
  clave: "compromisos-sin-agendar-cs",
  frente: "LIDERAR_CS",
  alDia: "En las cuentas, lo prometido al cliente está agendado o en Tareas",
  async medir(a, c) {
    // A la CSL, con el CSE de cada cuenta (su inicio va por CSE, lib/para-ti/foco.ts).
    const [lista, cuentas] = await Promise.all([compromisosSinAgendar({ ahora: c.ahora }), veLaCarteraEntera(a) ? cuentasDeLaCarteraConSuCse(a) : Promise.resolve([])]);
    const grupoDe = new Map(cuentas.map((x) => [x.clientId, x.grupo ?? undefined]));
    const porCuenta = new Map<string, CompromisoSinAgendar[]>();
    for (const x of lista) porCuenta.set(x.tarea.clientId, [...(porCuenta.get(x.tarea.clientId) ?? []), x]);
    return [...porCuenta.entries()]
      .sort((a, b) => a[1][0]!.empresa.localeCompare(b[1][0]!.empresa, "es"))
      .map(([clientId, xs]): Pendiente => {
        const reuniones = xs.filter((x) => x.aviso.motivo === "reunion_sin_agendar").length;
        const otros = xs.length - reuniones;
        const que = [reuniones ? `${reuniones} ${reuniones === 1 ? "reunión prometida" : "reuniones prometidas"} sin agendar` : null, otros ? `${otros} ${otros === 1 ? "compromiso" : "compromisos"} sin tomar` : null]
          .filter(Boolean)
          .join(" y ");
        return {
          clave: `compromisos-sin-agendar-cs:${clientId}`,
          fuente: "compromisos-sin-agendar-cs",
          cuando: "hoy",
          delAgente: false,
          clientId,
          ...(grupoDe.get(clientId) ? { grupo: grupoDe.get(clientId) } : {}),
          titulo: `${xs[0]!.empresa}: ${que} hace más de 48 horas`,
          detalle: xs
            .slice(0, 3)
            .map((x) => `«${x.tarea.titulo}»`)
            .join(" · "),
          meta: "Lo prometido al cliente",
          accion: "Ver las tareas",
          href: `/clients/${encodeURIComponent(clientId)}?tab=__tareas__`,
          enlaces: xs.slice(0, 5).map((x) => ({ texto: `T-${x.tarea.numero}`, href: hrefDeLaTarea(x.tarea.tareaId) })),
          desde: xs[0]!.tarea.creadaAt.toISOString(),
        };
      });
  },
};
