/**
 * lib/para-ti/fuentes/cs.ts — el frente «Liderar Customer Success». Lo que no tiene a una persona escrita en el dato:
 * las alertas del vigía (`CsAlert` no se asigna a nadie), las propuestas de estado del proyecto que dejó el vigía, los
 * proyectos sin encargado y las propuestas de cronograma que llevan días esperando en el equipo.
 *
 * Todo enlaza a pantallas que solo abren la CSL y Super Admin (Éxito del cliente), que es justo el requisito del
 * frente (lib/para-ti/frentes.ts).
 *
 * ⛔ Lo del vigía lleva DIRECTO a la ficha de la cuenta (`/customer-success/{clientId}`), nunca al índice: el índice
 * muestra la cartera de quien mira, y una alerta de una cuenta fuera de ella no aparece ahí (2026-10-05). Si son de
 * varias cuentas, el ítem dice cuántas y trae cada cuenta con su enlace (`enlaces`).
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
import { haceCuanto, plural } from "../armar";
import type { Fuente } from "../fuente";
import type { EnlaceDePendiente, Pendiente } from "../tipos";

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
  return prisma.project.findMany({
    where: { AND: [PROYECTO_CLASIFICABLE_WHERE, PROYECTO_DE_PIPELINE_CS_WHERE, { client: CS_CLIENT_WHERE }, extra] },
    select: SELECT_PROYECTO,
  });
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
    const [alertas, propuestas] = await Promise.all([
      prisma.csAlert.findMany({
        where: { status: "OPEN", severity: "HIGH" },
        select: { id: true, clientId: true, firstDetectedAt: true, client: { select: { name: true } } },
        orderBy: { firstDetectedAt: "asc" },
        take: 100,
      }),
      prisma.project.findMany({
        where: { healthProposed: { not: null } },
        select: { id: true, name: true, clientId: true, healthProposedAt: true, client: { select: { name: true } } },
        orderBy: { healthProposedAt: "asc" },
        take: 50,
      }),
    ]);
    const out: Pendiente[] = [];
    if (alertas.length) {
      // Las alertas se ven en la ficha de su cuenta, en «Alertas» (a la derecha, en cualquier pestaña).
      const cuentas = porCuenta(alertas);
      const una = cuentas.length === 1;
      const cuantas = plural(alertas.length, "alerta alta sin revisar", "alertas altas sin revisar");
      out.push({
        clave: "cs-vigia:alertas",
        fuente: "cs-vigia",
        cuando: "hoy",
        delAgente: true,
        titulo: una ? `El vigía dejó ${cuantas} en ${cuentas[0].nombre}` : `El vigía dejó ${cuantas} en ${cuentas.length} cuentas`,
        detalle: una
          ? "Están en la ficha de la cuenta, a la derecha, en «Alertas»."
          : "Cada cuenta abre su ficha; las alertas están a la derecha, en «Alertas».",
        meta: "Éxito del cliente · el vigía",
        accion: una ? "Abrir la cuenta" : "Abrir la que más espera",
        href: fichaDeLaCuenta(cuentas[0].clientId),
        enlaces: enlacesDe(cuentas),
        desde: alertas[0].firstDetectedAt.toISOString(),
      });
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

function listaDeEmpresas(nombres: readonly string[]): string {
  const unicos = [...new Set(nombres)];
  if (unicos.length <= 2) return `${unicos.join(" y ")}.`;
  return `${unicos.slice(0, 2).join(", ")} y ${unicos.length - 2} más.`;
}
