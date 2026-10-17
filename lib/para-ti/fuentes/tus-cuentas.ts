/**
 * lib/para-ti/fuentes/tus-cuentas.ts — tus cuentas en rojo (2026-10-16, fase 1.2 de docs/nexus-sistema-de-trabajo-plan.md).
 * SERVER-ONLY.
 *
 * Personal: le llega a quien lleva proyectos de Customer Success (el CSE de la cuenta). Por cada cuenta suya que la
 * lectura de la cuenta pone en «Riesgo alto», una línea con el primer motivo y los demás debajo. La lectura es la
 * misma que se ve en la cabecera de la ficha y en la cartera de la CSL (lib/cs/lectura-de-la-cuenta.ts): acá solo se
 * pregunta de quién es la cuenta. Las cuentas con señales de riesgo (amarillo) no llegan acá: se ven en el chip.
 *
 * ⛔ Sin lo que habla de plata para quien no lidera Customer Success: el CSE no ve el dinero de la cartera.
 */
import "server-only";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { cargarLecturas } from "@/lib/cs/lectura-de-la-cuenta-server";
import { pideAtencion } from "@/lib/cs/lectura-de-la-cuenta";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";

const sinPunto = (t: string) => t.trim().replace(/[.\s]+$/, "");

export const TUS_CUENTAS_EN_RIESGO: Fuente = {
  clave: "cs-tus-cuentas",
  frente: null,
  alDia: "Cómo están tus cuentas",
  aplica: (a) => a.proyectos.length > 0,
  async medir(a, c) {
    const cuentas = [...new Set(a.proyectos.map((p) => p.clientId))];
    const lecturas = await cargarLecturas(cuentas, { sinPlata: !esLiderDeCs(a.rol), ahora: c.ahora });
    const out: Pendiente[] = [];
    for (const l of lecturas.values()) {
      if (!pideAtencion(l)) continue;
      const [primero, ...resto] = l.motivos;
      out.push({
        clave: `cs-tus-cuentas:${l.clientId}`,
        fuente: "cs-tus-cuentas",
        cuando: "hoy",
        delAgente: false,
        clientId: l.clientId,
        titulo: primero ? `${l.nombreDeLaCuenta} está en riesgo: ${sinPunto(primero.texto)}` : `${l.nombreDeLaCuenta} está en riesgo`,
        detalle: [...resto.map((m) => sinPunto(m.texto)), l.mas > 0 ? `y ${l.mas} más` : null].filter(Boolean).join(" · "),
        meta: "Cómo está la cuenta",
        accion: "Abrir la cuenta",
        href: `/clients/${encodeURIComponent(l.clientId)}`,
        desde: null,
      });
    }
    return out;
  },
};
