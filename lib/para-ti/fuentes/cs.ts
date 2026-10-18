/**
 * lib/para-ti/fuentes/cs.ts — el frente «Liderar Customer Success». Lo que no tiene a una persona escrita en el dato:
 * las alertas del vigía (`CsAlert` no se asigna a nadie), las propuestas de estado del proyecto que dejó el vigía, los
 * proyectos sin encargado y las propuestas de cronograma que llevan días esperando en el equipo.
 *
 * Todo enlaza a pantallas que solo abren la CSL y Super Admin (Éxito del cliente), que es justo el requisito del
 * frente (lib/para-ti/frentes.ts).
 *
 * ⛔ Lo del vigía lleva DIRECTO a la ficha de la cuenta (`/customer-success/{clientId}`), nunca al índice: el índice
 * muestra la cartera de quien mira, y una alerta de una cuenta fuera de ella no aparece ahí (2026-10-05).
 *
 * Una línea POR CUENTA (2026-10-16, fase 1.2 de docs/nexus-sistema-de-trabajo-plan.md): «Lo que importa hoy» toma una
 * cosa por cuenta, y una línea que juntaba varias cuentas se contaba como de la primera. Las cuentas que no entran en
 * las primeras cinco van juntas en una línea más, con cada cuenta y su enlace (`enlaces`).
 */
import "server-only";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { PROYECTO_CLASIFICABLE_WHERE, PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { urlDeProyecto } from "@/lib/agents/run-url";
import { hayPropuestaParaRevisar } from "@/lib/timeline/borrador";
import { leerAutoriaDeLasPropuestas } from "@/lib/timeline/leer-autoria";
import type { PestanaDeCuenta } from "@/lib/cs/pestanas-de-la-cuenta";
import { sinExclientes } from "@/lib/cs/exclientes";
import { cuentasExcliente } from "@/lib/cs/exclientes-server";

import { lecturasDelPedido } from "@/lib/mi-dia/lecturas-server";
import { pideAtencion } from "@/lib/cs/lectura-de-la-cuenta";
import { servicioDeLasCuentas } from "@/lib/mi-dia/servicio-server";
import { haceCuanto, plural } from "../armar";
import { MAX_LO_QUE_IMPORTA, necesitaEstabilizar } from "../importa";

import type { Fuente } from "../fuente";
import type { EnlaceDePendiente, Pendiente } from "../tipos";

/** Cuántas cuentas del vigía van con su propia línea; las demás, juntas en una. */
export const CUENTAS_DEL_VIGIA_POR_LINEA = 5;

/** Desde cuántos días una propuesta de cronograma sin decidir pasa a ser cosa de quien lidera. */
export const DIAS_PARA_QUE_UNA_PROPUESTA_SE_TRABE = 3;

const SELECT_PROYECTO = {
  id: true,
  name: true,
  clientId: true,
  hubspotOwnerName: true,
  hubspotOwnerEmail: true,
  client: { select: { name: true } },
} as const;

/**
 * Los proyectos de implementación ABIERTOS de la cartera: clasificables (activos y no el contenedor «Información del
 * cliente», el mismo criterio de la línea del índice de clientes) y del pipeline de Customer Success.
 */
async function implementacionesAbiertas(extra: Prisma.ProjectWhereInput = {}) {
  const [proyectos, exclientes] = await Promise.all([
    prisma.project.findMany({
      where: { AND: [PROYECTO_CLASIFICABLE_WHERE, PROYECTO_DE_PIPELINE_CS_WHERE, { client: CS_CLIENT_WHERE }, extra] },
      select: SELECT_PROYECTO,
    }),
    cuentasExcliente(),
  ]);
  // Lo de un excliente no le llega a quien lidera (lib/cs/exclientes.ts): lo abierto lo pide la lista de limpieza.
  return sinExclientes(proyectos, exclientes, (p) => p.clientId);
}

/**
 * La ficha de una cuenta en Éxito del cliente; con `pestana`, abierta en esa pestaña (`?pestana=`, la lee
 * `pestanaDeLaUrl` en lib/cs/pestanas-de-la-cuenta.ts).
 */
export function fichaDeLaCuenta(clientId: string, pestana?: PestanaDeCuenta): string {
  const ficha = `/customer-success/${encodeURIComponent(clientId)}`;
  return pestana && pestana !== "estado" ? `${ficha}?pestana=${pestana}` : ficha;
}

/** Las cuentas de una lista, en el orden en que llegan (la que más espera primero), con cuántas cosas tiene cada una. */
function porCuenta(xs: readonly { clientId: string; client: { name: string } }[]) {
  const cuentas = new Map<string, { clientId: string; nombre: string; n: number }>();
  for (const x of xs) {
    const c = cuentas.get(x.clientId);
    if (c) c.n++;
    else cuentas.set(x.clientId, { clientId: x.clientId, nombre: x.client.name, n: 1 });
  }
  return [...cuentas.values()];
}

function enlacesDe(cuentas: ReturnType<typeof porCuenta>, pestana?: PestanaDeCuenta): EnlaceDePendiente[] | undefined {
  if (cuentas.length < 2) return undefined;
  return cuentas.map((c) => ({ texto: c.n > 1 ? `${c.nombre} (${c.n})` : c.nombre, href: fichaDeLaCuenta(c.clientId, pestana) }));
}

export const VIGIA: Fuente = {
  clave: "cs-vigia",
  frente: "LIDERAR_CS",
  alDia: "Las alertas del vigía",
  async medir() {
    const [todasLasAlertas, todasLasPropuestas, exclientes] = await Promise.all([
      prisma.csAlert.findMany({
        where: { status: "OPEN", severity: "HIGH" },
        select: { id: true, clientId: true, title: true, firstDetectedAt: true, client: { select: { name: true } } },
        orderBy: { firstDetectedAt: "asc" },
        take: 100,
      }),
      prisma.project.findMany({
        where: { healthProposed: { not: null }, esPrueba: false },
        select: { id: true, name: true, clientId: true, healthProposedAt: true, client: { select: { name: true } } },
        orderBy: { healthProposedAt: "asc" },
        take: 50,
      }),
      cuentasExcliente(),
    ]);
    // Las alertas de un excliente no se muestran (lib/cs/exclientes.ts).
    const alertas = sinExclientes(todasLasAlertas, exclientes, (a) => a.clientId);
    const propuestas = sinExclientes(todasLasPropuestas, exclientes, (p) => p.clientId);
    const out: Pendiente[] = [];
    if (alertas.length) {
      // Las alertas se ven en la ficha de su cuenta, en «Alertas» (a la derecha, en cualquier pestaña).
      const cuentas = porCuenta(alertas);
      for (const c of cuentas.slice(0, CUENTAS_DEL_VIGIA_POR_LINEA)) {
        const primera = alertas.find((a) => a.clientId === c.clientId)!;
        out.push({
          clave: `cs-vigia:alertas:${c.clientId}`,
          fuente: "cs-vigia",
          cuando: "hoy",
          delAgente: true,
          clientId: c.clientId,
          titulo: c.n > 1 ? `${c.nombre}: ${primera.title} (y ${c.n - 1} más)` : `${c.nombre}: ${primera.title}`,
          detalle: c.n > 1 ? "Están en la ficha de la cuenta, a la derecha, en «Alertas»." : "Está en la ficha de la cuenta, a la derecha, en «Alertas».",
          meta: "Éxito del cliente · el vigía",
          accion: "Abrir la cuenta",
          href: fichaDeLaCuenta(c.clientId),
          desde: primera.firstDetectedAt.toISOString(),
        });
      }
      const resto = cuentas.slice(CUENTAS_DEL_VIGIA_POR_LINEA);
      if (resto.length) {
        const cuantas = resto.reduce((n, c) => n + c.n, 0);
        out.push({
          clave: "cs-vigia:alertas:resto",
          fuente: "cs-vigia",
          cuando: "hoy",
          delAgente: true,
          clientId: null,
          titulo: `El vigía dejó ${plural(cuantas, "alerta alta", "alertas altas")} en ${plural(resto.length, "cuenta más", "cuentas más")}`,
          detalle: "Cada cuenta abre su ficha; las alertas están a la derecha, en «Alertas».",
          meta: "Éxito del cliente · el vigía",
          accion: "Abrir la que más espera",
          href: fichaDeLaCuenta(resto[0].clientId),
          enlaces: resto.map((c) => ({ texto: c.n > 1 ? `${c.nombre} (${c.n})` : c.nombre, href: fichaDeLaCuenta(c.clientId) })),
          desde: alertas.find((a) => a.clientId === resto[0].clientId)!.firstDetectedAt.toISOString(),
        });
      }
    }
    if (propuestas.length) {
      // La propuesta de estado se confirma o descarta en la pestaña «Proyectos» de la ficha.
      const p = propuestas[0];
      const cuentas = porCuenta(propuestas);
      const uno = propuestas.length === 1;
      out.push({
        clave: "cs-vigia:estados",
        fuente: "cs-vigia",
        cuando: "hoy",
        delAgente: true,
        titulo: uno
          ? `El vigía propone cambiar el estado de «${p.name}» de ${p.client.name}`
          : cuentas.length === 1
            ? `El vigía propone cambiar el estado de ${propuestas.length} proyectos de ${p.client.name}`
            : `El vigía propone cambiar el estado de ${propuestas.length} proyectos en ${cuentas.length} cuentas`,
        detalle: uno
          ? "Confírmalo o descártalo en «Proyectos» de la cuenta: el estado no cambia solo."
          : "Confírmalos o descártalos en «Proyectos» de cada cuenta: el estado no cambia solo.",
        meta: "Éxito del cliente · estado del proyecto",
        accion: cuentas.length === 1 ? "Revisar" : "Revisar la que más espera",
        clientId: cuentas.length === 1 ? p.clientId : null,
        href: fichaDeLaCuenta(p.clientId, "proyectos"),
        enlaces: enlacesDe(cuentas, "proyectos"),
        desde: p.healthProposedAt?.toISOString() ?? null,
      });
    }
    return out;
  },
};

export const SIN_ENCARGADO: Fuente = {
  clave: "cs-sin-encargado",
  frente: "LIDERAR_CS",
  alDia: "Los encargados de los proyectos",
  async medir() {
    const sin = await implementacionesAbiertas({ OR: [{ hubspotOwnerEmail: null }, { hubspotOwnerEmail: "" }] });
    if (sin.length === 0) return [];
    const primero = sin[0];
    return [
      {
        clave: "cs-sin-encargado",
        fuente: "cs-sin-encargado",
        cuando: "semana",
        delAgente: false,
        titulo:
          sin.length === 1
            ? `«${primero.name}» de ${primero.client.name} no tiene encargado`
            : `${sin.length} proyectos de Customer Success sin encargado`,
        detalle:
          sin.length === 1
            ? "Nadie lo tiene en HubSpot: sus avisos no le llegan a nadie."
            : `${listaDeEmpresas(sin.map((p) => p.client.name))} Nadie los tiene en HubSpot: sus avisos no le llegan a nadie.`,
        meta: "Proyectos",
        accion: sin.length === 1 ? "Asignarlo" : "Ver cuáles",
        href: sin.length === 1 ? urlDeProyecto(primero.clientId, primero.id) : "/clients",
      },
    ];
  },
};

export const CRONOGRAMAS_TRABADOS: Fuente = {
  clave: "cs-cronogramas-trabados",
  frente: "LIDERAR_CS",
  alDia: "Las propuestas de cronograma del equipo",
  async medir(_a, c) {
    const proyectos = await implementacionesAbiertas({ timeline: { pendingProposal: { not: Prisma.DbNull } } });
    if (proyectos.length === 0) return [];
    const timelines = await prisma.projectTimeline.findMany({
      where: { projectId: { in: proyectos.map((p) => p.id) } },
      select: { projectId: true, pendingProposal: true, pendingProposalRunId: true },
    });
    const con = timelines.filter((t) => hayPropuestaParaRevisar(t.pendingProposal));
    const autorias = await leerAutoriaDeLasPropuestas(
      con.map((t) => ({ token: t.pendingProposalRunId, guardado: t.pendingProposal })),
    );
    const limite = c.ahora.getTime() - DIAS_PARA_QUE_UNA_PROPUESTA_SE_TRABE * 86_400_000;
    const porId = new Map(proyectos.map((p) => [p.id, p]));
    const trabadas = con
      .map((t, i) => ({ p: porId.get(t.projectId)!, cuando: autorias[i]?.cuando ?? null }))
      .filter((x) => x.p && x.cuando && Date.parse(x.cuando) < limite)
      .sort((x, y) => Date.parse(x.cuando!) - Date.parse(y.cuando!));
    if (trabadas.length === 0) return [];
    const partes = trabadas
      .slice(0, 3)
      .map((x) => `${x.p.client.name} (${x.p.hubspotOwnerName ?? "sin encargado"}, ${haceCuanto(x.cuando, c.ahora)})`);
    const resto = trabadas.length > 3 ? ` y ${trabadas.length - 3} más` : "";
    const una = trabadas.length === 1;
    const cronograma = (p: (typeof trabadas)[number]["p"]) => `${urlDeProyecto(p.clientId, p.id)}&canvas=timeline#cronograma-gantt`;
    return [
      {
        clave: "cs-cronogramas-trabados",
        fuente: "cs-cronogramas-trabados",
        cuando: "hoy",
        delAgente: false,
        titulo: `${plural(trabadas.length, "propuesta de cronograma lleva", "propuestas de cronograma llevan")} más de ${DIAS_PARA_QUE_UNA_PROPUESTA_SE_TRABE} días esperando`,
        detalle: `${partes.join(", ")}${resto}.`,
        meta: "Cronogramas del equipo",
        // Con varias, el botón abre la que más espera y cada una tiene su enlace.
        accion: una ? "Abrir el cronograma" : "Abrir la que más espera",
        href: cronograma(trabadas[0].p),
        enlaces: una ? undefined : trabadas.map((x) => ({ texto: x.p.client.name, href: cronograma(x.p) })),
        desde: trabadas[0].cuando,
      },
    ];
  },
};

/**
 * Los CSE con más cuentas que piden atención de las que entran en sus cinco (2026-10-17, lib/para-ti/importa.ts): a
 * quien lidera Customer Success, una línea por CSE, para repartir o acompañar. «Piden atención» = las dos señales que
 * llenan primero los cinco de un CSE: la cuenta en riesgo (la lectura de la cuenta) y la cuenta sin su acción o su
 * reunión de la semana (las reglas de servicio). El umbral es el mismo del «Estabilizar N cuentas» del CSE
 * (`necesitaEstabilizar`). Solo las cuentas que lleva (el encargado en HubSpot), sin los exclientes.
 */
export const CSE_CON_CUENTAS_QUE_PIDEN_ATENCION: Fuente = {
  clave: "cs-estabilizar",
  frente: "LIDERAR_CS",
  alDia: "Las cuentas de cada CSE",
  async medir(a, c) {
    const [proyectos, cses] = await Promise.all([
      implementacionesAbiertas({ hubspotOwnerEmail: { not: null } }),
      prisma.teamMember.findMany({ where: { deactivatedAt: null, roleEnum: "CSE" }, select: { email: true, name: true } }),
    ]);
    const nombreDe = new Map(cses.map((m) => [m.email.toLowerCase(), m.name]));
    const porCse = new Map<string, Map<string, string>>();
    for (const p of proyectos) {
      const email = p.hubspotOwnerEmail?.toLowerCase();
      if (!email || !nombreDe.has(email)) continue;
      const cuentas = porCse.get(email) ?? new Map<string, string>();
      cuentas.set(p.clientId, p.client.name);
      porCse.set(email, cuentas);
    }
    // Sin cuentas suficientes ni para el umbral, no hace falta leer nada.
    const candidatos = [...porCse].filter(([, cuentas]) => necesitaEstabilizar(cuentas.size));
    if (candidatos.length === 0) return [];
    const todas = [...new Set(candidatos.flatMap(([, cuentas]) => [...cuentas.keys()]))];
    const [lecturas, servicio] = await Promise.all([
      lecturasDelPedido(todas, { sinPlata: true, ahora: c.ahora }),
      servicioDeLasCuentas(
        candidatos.flatMap(([email, cuentas]) => [...cuentas].map(([clientId, empresa]) => ({ clientId, empresa, llevaEmail: email }))),
        { ahora: c.ahora, hoyISO: c.hoyISO, quienMira: { email: a.email, esSuperAdmin: a.rol === "SUPER_ADMIN" } },
      ),
    ]);
    const out: Pendiente[] = [];
    for (const [email, cuentas] of candidatos.sort(([x], [y]) => (nombreDe.get(x) ?? x).localeCompare(nombreDe.get(y) ?? y, "es"))) {
      const piden = [...cuentas].flatMap(([clientId, empresa]) => {
        const l = lecturas.get(clientId);
        const enRiesgo = !!l && pideAtencion(l);
        const sinAccion = (servicio.get(clientId)?.falta.length ?? 0) > 0;
        return enRiesgo || sinAccion ? [{ clientId, empresa, enRiesgo, sinAccion }] : [];
      });
      if (!necesitaEstabilizar(piden.length)) continue;
      const nombre = nombreDe.get(email) ?? email;
      const enRiesgo = piden.filter((x) => x.enRiesgo).length;
      const sinAccion = piden.filter((x) => x.sinAccion && !x.enRiesgo).length;
      out.push({
        clave: `cs-estabilizar:${email}`,
        fuente: "cs-estabilizar",
        cuando: "hoy",
        delAgente: false,
        clientId: null,
        titulo: `${nombre} tiene ${piden.length} cuentas que piden atención`,
        detalle: [
          [enRiesgo > 0 ? `${enRiesgo} en riesgo` : null, sinAccion > 0 ? `${sinAccion} sin su acción o su reunión de la semana` : null]
            .filter(Boolean)
            .join(" y ")
            .replace(/^./, (l) => l.toUpperCase()),
          `En «Lo que importa hoy» le entran ${MAX_LO_QUE_IMPORTA - 1}. Reparte algunas o acompaña a ${nombre.split(" ")[0]}.`,
        ].join(". "),
        meta: "Customer Success · el equipo",
        accion: "Abrir la primera",
        href: fichaDeLaCuenta(piden[0].clientId),
        enlaces: piden.map((x) => ({ texto: `${x.empresa} · ${x.enRiesgo ? "en riesgo" : "sin acción o reunión"}`, href: fichaDeLaCuenta(x.clientId) })),
        desde: null,
      });
    }
    return out;
  },
};

function listaDeEmpresas(nombres: readonly string[]): string {
  const unicos = [...new Set(nombres)];
  if (unicos.length <= 2) return `${unicos.join(" y ")}.`;
  return `${unicos.slice(0, 2).join(", ")} y ${unicos.length - 2} más.`;
}
