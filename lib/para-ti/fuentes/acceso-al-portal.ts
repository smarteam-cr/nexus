/**
 * lib/para-ti/fuentes/acceso-al-portal.ts — el acceso al portal de HubSpot que el cliente todavía no nos dio (Q2 etapa 2
 * del roadmap, 2026-10-27). PERSONAL: le llega a quien lleva el proyecto, con el kickoff publicado CON la tarjeta del acceso
 * y el acceso pendiente. Los días cuentan desde la tarjeta, no desde la última publicación.
 * La regla es la de lib/kickoff/acceso-al-portal.ts (`faltaElAcceso`); se resuelve marcándolo dado en el kickoff.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { diasHabilesEntre, faltaElAcceso, pedidoDesde } from "@/lib/kickoff/acceso-al-portal";
import { tarjetasDelAcceso } from "@/lib/kickoff/acceso-al-portal-server";
import { PESOS } from "../importa";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

export const ACCESO_AL_PORTAL: Fuente = {
  clave: "acceso-al-portal",
  frente: null,
  alDia: "El acceso al portal de HubSpot de tus proyectos",
  aplica: (a) => a.proyectos.some((p) => p.encargado),
  async medir(a, c) {
    // Solo los que lleva (encargado): a quien le compartieron la cuenta no le toca pedir el acceso.
    const porId = new Map(a.proyectos.filter((p) => p.encargado).map((p) => [p.id, p]));
    if (!porId.size) return [];
    let filas: Array<{ id: string; kickoffPublishedAt: Date | null; accesoAlPortalDadoEn: Date | null; status: string }>;
    try {
      filas = await prisma.project.findMany({
        where: { id: { in: [...porId.keys()] }, kickoffPublishedAt: { not: null }, accesoAlPortalDadoEn: null },
        select: { id: true, kickoffPublishedAt: true, accesoAlPortalDadoEn: true, status: true },
      });
    } catch (e) {
      // Sin el SQL (2026-10-27-kickoff-planificacion.sql) no hay qué medir.
      if (esquemaDesactualizado(e)) return [];
      throw e;
    }
    const tarjetas = await tarjetasDelAcceso(filas.map((f) => f.id));
    return filas.flatMap((f): Pendiente[] => {
      const p = porId.get(f.id);
      const tarjeta = tarjetas.get(f.id) ?? null;
      const desde = pedidoDesde(tarjeta, f.kickoffPublishedAt);
      if (!p || !desde || !faltaElAcceso({ ...f, tarjeta })) return [];
      const dias = diasHabilesEntre(desde, c.ahora);
      return [
        {
          clave: `acceso-al-portal:${p.id}`,
          fuente: "acceso-al-portal",
          // Pasados 10 días hábiles es hoy: es el criterio de éxito del kickoff.
          cuando: dias >= 10 ? "hoy" : "semana",
          delAgente: false,
          titulo: `Pide el acceso al portal de HubSpot de ${p.empresa}`,
          detalle: `El kickoff lo pide hace ${dias === 1 ? "1 día hábil" : `${dias} días hábiles`} y sigue pendiente. Cuando te lo den, márcalo en el kickoff.`,
          meta: `Kickoff · ${p.name}`,
          accion: "Abrir el kickoff",
          href: `${urlDeProyecto(p.clientId, p.id)}&canvas=kickoff`,
          desde: desde.toISOString(),
          peso: PESOS.decision - 5,
        },
      ];
    });
  },
};
