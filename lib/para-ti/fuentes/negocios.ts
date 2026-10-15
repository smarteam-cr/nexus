/**
 * lib/para-ti/fuentes/negocios.ts — tus negocios abiertos de HubSpot (2026-10-14, etapa 1 de docs/mi-dia-plan.md).
 * PERSONAL: le llega a quien es dueño de negocios abiertos (la copia `NegocioAbierto`).
 *
 * Dos cosas:
 *   · la pregunta de la fecha de cierre y el monto (`preguntaDelNegocio`): solo de los negocios que se están trabajando;
 *     se contesta en «Para ti» y se escribe en HubSpot;
 *   · los negocios por limpiar (pausados, con el cierre vencido y sin actividad, o sin empresa), juntos en un renglón
 *     «Cuando puedas».
 * Los cierres más cerca y la cartera se ven arriba, en la sección de Ventas de «Para ti»: no se repiten acá.
 */
import "server-only";
import { tienePermiso } from "../alcance-server";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";
import { vistaDeVentasDelPedido } from "@/lib/ventas/vista-del-pedido";
import { fechaCorta, motivoParaLimpiar, preguntaDelNegocio } from "@/lib/ventas/negocios";

export const NEGOCIOS: Fuente = {
  clave: "negocios",
  frente: null,
  alDia: "Tus negocios abiertos",
  aplica: (a) => tienePermiso(a, "ventas", "read"),
  async medir(a, c) {
    const r = await vistaDeVentasDelPedido(a.teamMemberId, a.email, c.hoyISO, c.ahora);
    if (r.estado !== "ok") return [];
    const out: Pendiente[] = [];
    const porLimpiar: typeof r.vista.negocios = [];
    for (const n of r.vista.negocios) {
      const p = preguntaDelNegocio(n, c.hoyISO, c.ahora);
      if (p) {
        const que =
          p.fecha && p.monto
            ? "la fecha de cierre y el monto"
            : p.fecha
              ? p.vencida
                ? "la fecha de cierre (la que tiene ya pasó)"
                : "la fecha de cierre"
              : "el monto";
        const propone = !!(n.propuesta?.fechaCierre || n.propuesta?.monto);
        out.push({
          clave: `negocios:pregunta:${n.id}`,
          fuente: "negocios",
          cuando: "hoy",
          delAgente: propone,
          titulo: `Completa ${que} de «${n.nombre}»`,
          detalle: propone
            ? "Nexus propone un valor con lo que se dijo con la empresa. Lo revisas y se guarda en HubSpot."
            : p.vencida && n.fechaCierre
              ? `Tenía cierre el ${fechaCorta(n.fechaCierre)} y lo estás trabajando. Lo que respondas se guarda en HubSpot.`
              : "Lo estás trabajando y le falta. Lo que respondas se guarda en HubSpot.",
          meta: `Negocio · ${n.empresa}`,
          accion: "Responder",
          href: `/para-ti?negocio=${encodeURIComponent(n.id)}`,
          desde: n.ultimaActividad,
        });
        continue;
      }
      if (motivoParaLimpiar(n, c.hoyISO, c.ahora)) porLimpiar.push(n);
    }
    if (porLimpiar.length) {
      out.push({
        clave: "negocios:por-limpiar",
        fuente: "negocios",
        cuando: "luego",
        delAgente: false,
        titulo: `${plural(porLimpiar.length, "negocio está", "negocios están")} por limpiar en HubSpot`,
        detalle: "Pausados, con el cierre vencido y sin actividad, o sin empresa: muévelos de etapa, dales fecha o ciérralos.",
        meta: "Negocios · HubSpot",
        accion: "Verlos",
        href: "/para-ti?vista=cartera&cartera=limpiar",
        enlaces: porLimpiar
          .filter((n) => n.hubspotUrl)
          .slice(0, 8)
          .map((n) => ({ texto: n.nombre, href: n.hubspotUrl! })),
      });
    }
    return out;
  },
};
