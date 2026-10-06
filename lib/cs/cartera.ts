/**
 * lib/cs/cartera.ts — arma las cuentas de la cartera desde la base y les aplica las reglas
 * (2026-10-04). SERVIDOR.
 *
 * Las reglas viven en `lib/cs/cartera-reglas.ts` (puro, con pruebas). Acá solo se junta lo que
 * cada cuenta necesita, en pocas consultas por lote:
 *  · los proyectos (la cartera de `loadPortfolio` + los cerrados hace poco, para el cruce de uso),
 *  · el crudo de HubSpot Partner, las señales de HubSpot (tickets, último contacto),
 *  · la última reunión (por la regla única de pertenencia), las alertas vivas,
 *  · la facturación (Cobranza) y las licencias cargadas a mano.
 *
 * La misma función arma UNA cuenta para la ficha (`cargarCuentas([id])`): el índice y la ficha no
 * pueden contar historias distintas de la misma cuenta.
 */
import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { loadPortfolio, type PortfolioRow } from "@/lib/portfolio/load";
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { PROYECTO_DE_PIPELINE_CS_WHERE } from "@/lib/projects/scope";
import { belongsToClient, whereBelongsToClient } from "@/lib/sessions/project-sources";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { motivoApagado } from "@/lib/jobs/requisitos";
import { leerPartner } from "./lectura-partner";
import { resumirFacturacion, type CobroDeLaCuenta } from "./facturacion-de-la-cuenta";
import { normalizarMoneda } from "./formato";
import {
  DIAS_DE_REUNIONES_PARA_CONTACTO,
  VENTANA_TRAS_CIERRE,
  adopcionPorHub,
  alertaDeLaCuenta,
  carteraEnUnaLinea,
  consumoDeLaCartera,
  entregaDeProyectos,
  equipo,
  listaParaLlamar,
  cuentasParaBuscar,
  cseVigente,
  nivelDePartner,
  oportunidades,
  primeros90Dias,
  renovacionesProximas,
  ultimoContactoDeLaCuenta,
  type CuentaDeCartera,
  type ProyectoDeCuenta,
} from "./cartera-reglas";

const DIA_MS = 86_400_000;

const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** «Hoy» en Costa Rica (UTC−6), que es donde se lee la pantalla. */
export function hoyEnCostaRica(ahora = new Date()): string {
  return ymd(new Date(ahora.getTime() - 6 * 3_600_000));
}

function esBloqueado(hubspotStatus: string | null, etapa: string | null): boolean {
  return hubspotStatus === "blocked" || /bloquead/i.test(etapa ?? "");
}

/**
 * Quienes están dados de baja en Nexus, por correo. HubSpot los puede seguir teniendo como dueños de
 * proyectos activos; para Éxito del cliente esos proyectos no tienen CSE (nadie los lleva).
 */
export async function cseDeBajaPorCorreo(): Promise<Map<string, string>> {
  const filas = await prisma.teamMember.findMany({ where: { deactivatedAt: { not: null } }, select: { email: true, name: true } });
  return new Map(filas.map((m) => [m.email.toLowerCase(), m.name]));
}

function proyectoDesdeFila(
  r: PortfolioRow,
  ops: { hubspotStatus: string | null; hubspotBlockReason: string | null; hubspotBlockDetail: string | null } | undefined,
  deBaja: ReadonlyMap<string, string>,
): ProyectoDeCuenta {
  const s = r.summary;
  const atrasado = s.scheduleAlarmsActive && (s.overduePhases > 0 || s.overdueTasks > 0);
  return {
    id: r.projectId,
    nombre: r.projectName,
    etapa: r.stageLabel ?? s.stage?.label ?? null,
    ...cseVigente(r.cseName, r.cseEmail, deBaja),
    activo: true,
    bloqueado: esBloqueado(ops?.hubspotStatus ?? null, r.stageLabel),
    motivoBloqueo: ops?.hubspotBlockReason ?? null,
    detalleBloqueo: ops?.hubspotBlockDetail ?? null,
    atraso: atrasado ? { dias: Math.max(1, s.worstDaysLate), fase: s.worstOverduePhase?.name ?? null } : null,
    cierre: { prometido: s.closing.promisedISO, proyectado: s.closing.projectedISO, corrimientoDias: s.closing.driftDays },
    avance: s.progress.tasksTotal > 0 ? s.progress.pct : null,
    salud: s.health.resolved,
    cerradoEn: null,
  };
}

/**
 * El último contacto de cada cliente, con la regla de `ultimoContactoDeLaCuenta`: las reuniones de la
 * cuenta (regla ÚNICA de pertenencia) de los últimos meses, sin las de puertas adentro, y lo que
 * registró HubSpot. Una consulta para todos los clientes; devuelve con qué preguntar por cada uno.
 */
async function leerContactos(
  ids: readonly string[],
  ahora: Date,
): Promise<(clientId: string, ultimoHubspot: Date | null) => string | null> {
  const desde = new Date(ahora.getTime() - DIAS_DE_REUNIONES_PARA_CONTACTO * DIA_MS);
  const [reuniones, categorias] = await Promise.all([
    prisma.firefliesSession.findMany({
      where: { OR: ids.flatMap((id) => whereBelongsToClient(id).OR), date: { lte: ahora, gte: desde } },
      select: { resolvedClientId: true, manualClientId: true, date: true, participants: true, organizerEmail: true },
    }),
    // Los dominios propios, como en el vigía (lib/cs/watchdog-cuenta.ts): las categorías internas.
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }),
  ]);
  const propios = buildInternalDomainsSet(categorias);
  return (clientId, ultimoHubspot) =>
    ultimoContactoDeLaCuenta(
      reuniones.filter((s) => belongsToClient(s, clientId)),
      ultimoHubspot,
      propios,
    );
}

/** El último contacto de UN cliente: para la cuenta de respaldo de la ficha (lib/cs/load-account.ts). */
export async function ultimoContactoDeUnCliente(clientId: string, ultimoHubspot: Date | null): Promise<string | null> {
  const de = await leerContactos([clientId], new Date());
  return de(clientId, ultimoHubspot);
}

/**
 * Las cuentas, ya armadas. `clientIds` = las que se quieren (null = toda la cartera que deja ver
 * `clientWhere`). La cartera es: clientes con proyecto activo de cartera, más los clientes con
 * suscripción activa en HubSpot Partner aunque hoy no tengan proyecto (renuevan igual).
 */
export async function cargarCuentas(
  clientWhere: Prisma.ClientWhereInput | null,
  opciones: { clientIds?: string[]; filas?: PortfolioRow[] } = {},
): Promise<CuentaDeCartera[]> {
  const ahora = new Date();
  const hoy = hoyEnCostaRica(ahora);
  // `AND` y no un spread: el where de acceso puede traer su propio `OR` y pisaría al de cartera.
  const filtroCliente: Prisma.ClientWhereInput = {
    AND: [
      CS_CLIENT_WHERE,
      ...(clientWhere ? [clientWhere] : []),
      ...(opciones.clientIds ? [{ id: { in: opciones.clientIds } }] : []),
    ],
  };

  const filas = (opciones.filas ?? (await loadPortfolio(filtroCliente))).filter((r) => r.status === "active");
  const conPartner = await prisma.clientPartnerSnapshot.findMany({
    where: { client: filtroCliente },
    select: { clientId: true, properties: true },
  });
  const partnerPorCliente = new Map(conPartner.map((s) => [s.clientId as string, leerPartner(s.properties)]));

  const ids = [
    ...new Set([
      ...filas.map((r) => r.clientId),
      ...conPartner.filter((s) => partnerPorCliente.get(s.clientId as string)?.activa).map((s) => s.clientId as string),
    ]),
  ];
  if (ids.length === 0) return [];

  const [clientes, ops, cerrados, senales, contactoDe, alertas, cuentasFin, manuales, deBaja] = await Promise.all([
    prisma.client.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, company: true } }),
    prisma.project.findMany({
      where: { id: { in: filas.map((r) => r.projectId) } },
      select: { id: true, hubspotStatus: true, hubspotBlockReason: true, hubspotBlockDetail: true },
    }),
    // Los proyectos de CS cerrados hace poco: solo para el cruce «el uso cae desde que se cerró».
    // Nexus no guarda la fecha de cierre: la del último cambio es la aproximación (lo dice la UI).
    prisma.project.findMany({
      where: {
        ...PROYECTO_DE_PIPELINE_CS_WHERE,
        clientId: { in: ids },
        status: { in: ["inactive", "completed"] },
        updatedAt: { gte: new Date(ahora.getTime() - VENTANA_TRAS_CIERRE * DIA_MS) },
      },
      select: { id: true, name: true, clientId: true, updatedAt: true },
    }),
    prisma.clientCsSignals.findMany({
      where: { clientId: { in: ids } },
      select: { clientId: true, lastEngagementAt: true, openTicketCount: true, ticketsSupported: true },
    }),
    // El último contacto: reuniones CON el cliente (regla ÚNICA de pertenencia) o HubSpot.
    leerContactos(ids, ahora),
    prisma.csAlert.findMany({
      where: { clientId: { in: ids }, status: { in: ["OPEN", "SEEN"] } },
      orderBy: { lastDetectedAt: "desc" },
      select: {
        id: true, clientId: true, severity: true, category: true, title: true, reason: true, suggestedAction: true,
        status: true, agentRunId: true, lastDetectedAt: true, project: { select: { name: true } },
      },
    }),
    prisma.cuentaFinanciera.findMany({
      where: { clientId: { in: ids } },
      select: {
        clientId: true,
        creditoDias: true,
        cobros: {
          select: { estado: true, fechaProgramada: true, fechaEmision: true, fechaCobro: true, promesaPago: true, monto: true, moneda: true },
        },
      },
    }),
    prisma.licenciaCliente.findMany({
      where: { clientId: { in: ids } },
      select: { clientId: true, hub: true, plan: true, fechaRenovacion: true, montoMensual: true, moneda: true },
    }),
    cseDeBajaPorCorreo(),
  ]);

  const opsPorProyecto = new Map(ops.map((o) => [o.id, o]));
  const senalPorCliente = new Map(senales.map((s) => [s.clientId, s]));

  return clientes
    .map((cl): CuentaDeCartera => {
      const proyectos: ProyectoDeCuenta[] = [
        ...filas.filter((r) => r.clientId === cl.id).map((r) => proyectoDesdeFila(r, opsPorProyecto.get(r.projectId), deBaja)),
        ...cerrados
          .filter((p) => p.clientId === cl.id)
          .map((p) => ({
            id: p.id,
            nombre: p.name,
            etapa: null,
            cseNombre: null,
            cseEmail: null,
            activo: false,
            bloqueado: false,
            motivoBloqueo: null,
            detalleBloqueo: null,
            atraso: null,
            cierre: { prometido: null, proyectado: null, corrimientoDias: null },
            avance: null,
            salud: "SALUDABLE",
            cerradoEn: ymd(p.updatedAt),
          })),
      ];
      const senal = senalPorCliente.get(cl.id);
      // Una reunión de puertas adentro sobre el cliente NO es contacto con él (Elías, 2026-10-05).
      const ultimoContacto = contactoDe(cl.id, senal?.lastEngagementAt ?? null);
      const fin = cuentasFin.find((c) => c.clientId === cl.id);
      const cobros: CobroDeLaCuenta[] = (fin?.cobros ?? []).map((c) => ({
        estado: c.estado,
        fechaProgramada: ymd(c.fechaProgramada),
        fechaEmision: c.fechaEmision ? ymd(c.fechaEmision) : null,
        fechaCobro: c.fechaCobro ? ymd(c.fechaCobro) : null,
        promesaPago: c.promesaPago ? ymd(c.promesaPago) : null,
        monto: Number(c.monto),
        moneda: c.moneda,
      }));
      return {
        clientId: cl.id,
        nombre: cl.company || cl.name,
        partner: partnerPorCliente.get(cl.id) ?? null,
        proyectos,
        ultimoContacto,
        ticketsAbiertos: senal?.ticketsSupported ? senal.openTicketCount : null,
        alertas: alertas.filter((a) => a.clientId === cl.id).map(alertaDeLaCuenta),
        facturacion: resumirFacturacion(cobros, hoy, fin?.creditoDias ?? null),
        licenciasManuales: manuales
          .filter((m) => m.clientId === cl.id)
          .map((m) => ({
            hub: m.hub,
            plan: m.plan,
            fechaRenovacion: m.fechaRenovacion ? ymd(m.fechaRenovacion) : null,
            montoMensual: m.montoMensual,
            // Texto libre hasta el 2026-10-05: «usd» y «USD» eran dos monedas.
            moneda: normalizarMoneda(m.moneda),
          })),
      };
    })
    .sort((a, b) => a.nombre.localeCompare(b.nombre));
}

/** De dónde salen los datos de la pantalla, con su fecha: la CSL tiene que saber qué tan viejo es. */
export interface FuentesDeCartera {
  partner: { at: string | null; apagado: string | null };
  puntos: { at: string | null };
  senales: { at: string | null; apagado: string | null };
  reuniones: { at: string | null };
  vigia: { encendido: boolean; motivo: string | null; ultimaCorrida: string | null };
}

export async function cargarFuentes(cuentas: readonly CuentaDeCartera[]): Promise<FuentesDeCartera> {
  const ids = cuentas.map((c) => c.clientId);
  const [partner, senales, reunion, ajustes, corrida] = await Promise.all([
    prisma.clientPartnerSnapshot.aggregate({ where: { clientId: { in: ids } }, _max: { fetchedAt: true } }),
    prisma.clientCsSignals.aggregate({ where: { clientId: { in: ids } }, _max: { fetchedAt: true } }),
    prisma.firefliesSession.aggregate({
      where: { OR: ids.flatMap((id) => whereBelongsToClient(id).OR), date: { lte: new Date() } },
      _max: { date: true },
    }),
    prisma.csSettings.findUnique({ where: { id: "cs" }, select: { watchdogEnabled: true } }),
    prisma.agentRun.findFirst({ where: { agentSlug: "cs-watchdog", status: "DONE" }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
  ]);
  /* Encendido = el interruptor de la base, que desde el 2026-10-05 (D14) frena TODAS las vías. Sin
     la variable del cron el barrido diario no corre, pero el vigía sigue corriendo al abrir cada
     cliente y a mano: decir «apagado» por la variable era mentir. El motivo del cron queda en `motivo`. */
  const apagadoEnAjustes = !!ajustes && !ajustes.watchdogEnabled;
  const motivoVigia = apagadoEnAjustes
    ? "Apagado desde los ajustes de Éxito del cliente."
    : motivoApagado("cs-watchdog-daily", process.env);
  return {
    partner: { at: partner._max.fetchedAt?.toISOString() ?? null, apagado: motivoApagado("cs-partner-daily", process.env) },
    puntos: { at: nivelDePartner(cuentas, hoyEnCostaRica()).actualizadoEn },
    senales: { at: senales._max.fetchedAt?.toISOString() ?? null, apagado: motivoApagado("cs-signals-daily", process.env) },
    reuniones: { at: reunion._max.date?.toISOString() ?? null },
    vigia: { encendido: !apagadoEnAjustes, motivo: motivoVigia, ultimaCorrida: corrida?.createdAt.toISOString() ?? null },
  };
}

/** Todo lo que pinta el índice, ya calculado (el navegador solo filtra). */
export async function cargarCarteraDeLaCsl(clientWhere: Prisma.ClientWhereInput | null) {
  const hoy = hoyEnCostaRica();
  const cuentas = await cargarCuentas(clientWhere);
  const fuentes = await cargarFuentes(cuentas);
  const llamar = listaParaLlamar(cuentas, hoy);
  const adopcion = adopcionPorHub(cuentas);
  return {
    hoy,
    totalCuentas: cuentas.length,
    conProyecto: cuentas.filter((c) => c.proyectos.some((p) => p.activo)).length,
    gestionadas: cuentas.filter((c) => c.partner?.gestionada && c.partner.activa).length,
    linea: carteraEnUnaLinea(cuentas, hoy),
    entrega: entregaDeProyectos(cuentas),
    llamar,
    /** Todas las cuentas, para el buscador del índice (las pestañas solo traen las que aparecen en alguna pregunta). */
    cuentas: cuentasParaBuscar(cuentas, hoy),
    renovaciones: renovacionesProximas(cuentas, hoy, 120),
    adopcion,
    primeros90: primeros90Dias(cuentas, hoy),
    consumo: consumoDeLaCartera(cuentas),
    oportunidades: oportunidades(cuentas),
    equipo: equipo(cuentas, hoy),
    nivel: nivelDePartner(cuentas, hoy),
    fuentes,
  };
}

export type CarteraDeLaCsl = Awaited<ReturnType<typeof cargarCarteraDeLaCsl>>;
