/**
 * lib/para-ti/fuentes/recurrencia.ts — «Propón seguir con SmartLoop» (docs/smartloop-plan.md, etapa 6). SERVER-ONLY.
 *
 * Personal: le llega al CSE encargado en HubSpot de una implementación que llegó a su entrega o cerró hace poco, cuando
 * la cuenta todavía no tiene un servicio recurrente. Es una sugerencia de Nexus (una regla, sin IA): se usa o se
 * descarta en el «Qué sigue» del proyecto, y deja de pedirse a los 30 días (lib/lo-propuesto). La regla y los datos
 * son los de lib/servicios/recurrencia(-server).ts.
 */
import "server-only";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { recomendacionesPendientesPara } from "@/lib/servicios/recurrencia-server";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

export const RECURRENCIA_SUGERIDA: Fuente = {
  clave: "recurrencia-sugerida",
  frente: null,
  alDia: "Lo que sigue después de tus entregas",
  aplica: (a) => a.rol === "CSE" || a.rol === "CSL" || a.proyectos.some((p) => p.encargado),
  async medir(a, c) {
    const pendientes = await recomendacionesPendientesPara(a.email, c.ahora);
    return pendientes.map(
      (r): Pendiente => ({
        clave: `recurrencia-sugerida:${r.projectId}`,
        fuente: "recurrencia-sugerida",
        cuando: "semana",
        delAgente: false,
        titulo: `Propónle a ${r.empresa} seguir con ${r.servicio}`,
        detalle:
          r.motivo === "entrega"
            ? `«${r.proyecto}» llegó a su entrega. En el proyecto está el porqué: la escala, lo que quedó fuera de alcance y los casos de uso.`
            : `«${r.proyecto}» cerró. En el proyecto está el porqué: la escala, lo que quedó fuera de alcance y los casos de uso.`,
        meta: `Land and Expand · ${r.empresa}`,
        accion: "Ver la recomendación",
        href: urlDeProyecto(r.clientId, r.projectId),
        desde: r.nacio ? `${r.nacio}T12:00:00.000Z` : null,
        clientId: r.clientId,
      }),
    );
  },
};
