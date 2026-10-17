/**
 * lib/para-ti/fuentes/servicio.ts — «Cuenta sin acción» (ficha D, 2026-10-17; fase 2.1 de
 * docs/nexus-sistema-de-trabajo-plan.md). SERVER-ONLY.
 *
 * Personal: le llega a quien LLEVA la cuenta (el encargado en HubSpot de un proyecto de Customer Success abierto; una
 * cuenta que solo le compartieron no es suya para esto). Por cada cuenta suya sin acción esta semana o sin reunión en
 * los próximos 8 días, una línea en «Lo que importa hoy» (peso 80, lib/para-ti/importa.ts). La regla es la de
 * lib/mi-dia/servicio.ts; los datos, lib/mi-dia/servicio-server.ts.
 */
import "server-only";
import { servicioDeLasCuentas } from "@/lib/mi-dia/servicio-server";
import { pendienteDeCuentaSinAccion } from "@/lib/mi-dia/servicio";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

export const CUENTAS_SIN_ACCION: Fuente = {
  // Literal y no la constante: el escaneo del registro cuenta las claves escritas (es la misma: FUENTE_CUENTA_SIN_ACCION).
  clave: "cuenta-sin-accion",
  frente: null,
  alDia: "Cada cuenta tuya tiene su acción de la semana y su reunión",
  aplica: (a) => a.proyectos.some((p) => p.encargado),
  async medir(a, c) {
    const cuentas = new Map<string, string>();
    for (const p of a.proyectos) if (p.encargado) cuentas.set(p.clientId, p.empresa);
    const servicio = await servicioDeLasCuentas(
      [...cuentas].map(([clientId, empresa]) => ({ clientId, empresa, llevaEmail: a.email })),
      { ahora: c.ahora, hoyISO: c.hoyISO },
    );
    const out: Pendiente[] = [];
    for (const s of servicio.values()) {
      const p = pendienteDeCuentaSinAccion({ clientId: s.clientId, empresa: s.empresa }, s, {
        ultimaReunion: s.ultimaReunion,
        invitados: s.invitados,
        hoyISO: c.hoyISO,
        correo: a.email,
      });
      if (p) out.push(p);
    }
    return out;
  },
};
