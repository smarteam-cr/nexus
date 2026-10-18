/**
 * lib/para-ti/fuentes/cartera-de-la-csl.ts — lo que Éxito del cliente le pide a cada persona desde el 2026-10-09
 * (docs/exito-del-cliente-cartera-plan.md). SERVER-ONLY.
 *
 * · La relación con HubSpot por perderse (personal, al CSE de la cuenta): sin trabajo de Smarteam en el portal del
 *   cliente en 60 días, HubSpot termina la relación gestionada y deja de compartir el uso. Le llega a quien lleva un
 *   proyecto de la cuenta cuando vence en 14 días o menos, o terminó hace un mes o menos y se puede recuperar.
 * · Lo mismo, junto, a quien lidera Customer Success (frente LIDERAR_CS).
 * · La corrección del color que dejó de valer (personal, a quien la puso): venció en la última semana.
 *
 * La regla vive en lib/cs/relacion-gestionada.ts y lib/cs/ajustes-de-salud.ts: acá solo se pregunta a quién le toca.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { leerPartner } from "@/lib/cs/lectura-partner";
import { pideTrabajoEnElPortal, relacionConHubspot, type RelacionConHubspot } from "@/lib/cs/relacion-gestionada";
import { leerAjustes } from "@/lib/cs/ajustes-de-salud-server";
import { cuentasExcliente } from "@/lib/cs/exclientes-server";

import { NOMBRE_DE_LA_SALUD } from "@/lib/cs/cartera-reglas";
import { fmtDia } from "@/lib/cs/formato";
import { plural } from "../armar";
import type { Fuente } from "../fuente";
import type { Pendiente } from "../tipos";
import { fichaDeLaCuenta } from "./cs";

/** Las cuentas de `clientIds` (o toda la cartera) cuya relación con HubSpot pide trabajo en el portal. */
async function relacionesQuePidenTrabajo(
  hoyISO: string,
  clientIds?: readonly string[],
): Promise<Array<{ clientId: string; nombre: string; r: RelacionConHubspot }>> {
  if (clientIds && clientIds.length === 0) return [];
  const snaps = await prisma.clientPartnerSnapshot.findMany({
    where: { clientId: clientIds ? { in: [...clientIds] } : { not: null }, client: CS_CLIENT_WHERE },
    select: { clientId: true, properties: true, client: { select: { name: true, company: true } } },
  });
  // Un excliente no pide trabajo en su portal (lib/cs/exclientes.ts).
  const exclientes = await cuentasExcliente(snaps.flatMap((s) => (s.clientId ? [s.clientId] : [])));
  const out: Array<{ clientId: string; nombre: string; r: RelacionConHubspot }> = [];
  for (const s of snaps) {
    if (!s.clientId || !s.client || exclientes.has(s.clientId)) continue;
    const r = relacionConHubspot(leerPartner(s.properties), hoyISO);
    if (pideTrabajoEnElPortal(r)) out.push({ clientId: s.clientId, nombre: s.client.company || s.client.name, r });
  }
  // Lo que se pierde primero, primero: la que vence antes; después, la que terminó hace menos.
  return out.sort((a, b) => (a.r.diasParaVencer ?? 1000 + (a.r.diasDesdeQueTermino ?? 0)) - (b.r.diasParaVencer ?? 1000 + (b.r.diasDesdeQueTermino ?? 0)));
}

function pendienteDeRelacion(fuente: string, x: { clientId: string; nombre: string; r: RelacionConHubspot }): Pendiente {
  const urgente = x.r.estado === "urgente";
  return {
    clave: `${fuente}:${x.clientId}`,
    fuente,
    cuando: urgente && (x.r.diasParaVencer ?? 99) <= 7 ? "hoy" : "semana",
    delAgente: false,
    titulo: urgente ? `Trabaja en el portal de ${x.nombre}: la relación con HubSpot vence` : `Recupera la relación con HubSpot de ${x.nombre}`,
    detalle: [x.r.porque, x.r.queHacer].filter(Boolean).join(" "),
    meta: `HubSpot · ${x.nombre}`,
    accion: "Ver la cuenta",
    href: fichaDeLaCuenta(x.clientId, "adopcion"),
    desde: null,
  };
}

export const RELACION_CON_HUBSPOT: Fuente = {
  clave: "cs-relacion-hubspot",
  frente: null,
  alDia: "La relación con HubSpot de tus cuentas",
  aplica: (a) => a.proyectos.length > 0,
  async medir(a, c) {
    const cuentas = [...new Set(a.proyectos.map((p) => p.clientId))];
    const xs = await relacionesQuePidenTrabajo(c.hoyISO, cuentas);
    return xs.map((x) => pendienteDeRelacion("cs-relacion-hubspot", x));
  },
};

export const RELACIONES_DE_LA_CARTERA: Fuente = {
  clave: "cs-relaciones-cartera",
  frente: "LIDERAR_CS",
  alDia: "La relación con HubSpot de la cartera",
  async medir(_a, c) {
    const xs = await relacionesQuePidenTrabajo(c.hoyISO);
    if (xs.length === 0) return [];
    if (xs.length === 1) return [pendienteDeRelacion("cs-relaciones-cartera", xs[0])];
    const vencen = xs.filter((x) => x.r.estado === "urgente").length;
    const terminaron = xs.length - vencen;
    return [
      {
        clave: "cs-relaciones-cartera:todas",
        fuente: "cs-relaciones-cartera",
        cuando: "semana",
        delAgente: false,
        titulo: `${plural(xs.length, "cuenta pierde", "cuentas pierden")} la relación con HubSpot`,
        detalle: [
          vencen > 0 ? `${plural(vencen, "vence", "vencen")} en 14 días o menos` : null,
          terminaron > 0 ? `${plural(terminaron, "terminó", "terminaron")} hace poco y se puede recuperar` : null,
        ]
          .filter(Boolean)
          .join(" y ")
          .replace(/^./, (l) => l.toUpperCase())
          .concat(". Sin trabajo de Smarteam en su portal, HubSpot deja de compartir el uso."),
        meta: "Éxito del cliente · Cartera",
        accion: "Ver las cuentas",
        href: "/customer-success?pestana=cartera&hubspot=urgente,terminada",
        enlaces: xs.slice(0, 12).map((x) => ({ texto: `${x.nombre} · ${x.r.corto.toLowerCase()}`, href: fichaDeLaCuenta(x.clientId) })),
        desde: null,
      },
    ];
  },
};

/** Una corrección vencida se avisa una semana: después ya es historia. */
const DIAS_DEL_AVISO = 7;

export const CORRECCION_QUE_CADUCO: Fuente = {
  clave: "cs-correccion-caduco",
  frente: null,
  alDia: "Tus correcciones del color",
  async medir(a, c) {
    const mias = await prisma.correccionDeSalud
      .findMany({
        where: { porEmail: { equals: a.email, mode: "insensitive" }, tipo: "corregir", createdAt: { gte: new Date(c.ahora.getTime() - 45 * 86_400_000) } },
        select: { clientId: true, client: { select: { name: true, company: true } } },
      })
      .catch(() => []);
    if (mias.length === 0) return [];
    const nombres = new Map(mias.map((m) => [m.clientId, m.client.company || m.client.name]));
    const { porCliente } = await leerAjustes([...nombres.keys()]);
    const limite = new Date(Date.parse(`${c.hoyISO}T00:00:00Z`) - DIAS_DEL_AVISO * 86_400_000).toISOString().slice(0, 10);
    const out: Pendiente[] = [];
    for (const [clientId, ajustes] of porCliente) {
      const corr = ajustes.correccion;
      if (!corr || corr.porEmail.toLowerCase() !== a.email.toLowerCase()) continue;
      if (corr.vence >= c.hoyISO || corr.vence < limite) continue;
      const nombre = nombres.get(clientId) ?? "la cuenta";
      out.push({
        clave: `cs-correccion-caduco:${corr.id}`,
        fuente: "cs-correccion-caduco",
        cuando: "semana",
        delAgente: false,
        titulo: `Tu corrección del color de ${nombre} venció`,
        detalle: `La pusiste en «${NOMBRE_DE_LA_SALUD[corr.salud].toLowerCase()}» («${corr.nota}») y valía hasta el ${fmtDia(corr.vence, c.hoyISO)}. Ahora manda el color de Nexus: revísalo y, si hace falta, vuelve a corregirlo.`,
        meta: `Éxito del cliente · ${nombre}`,
        accion: "Ver la cuenta",
        href: fichaDeLaCuenta(clientId),
        desde: null,
      });
    }
    return out;
  },
};
