/**
 * lib/mi-dia/cartera-cs-server.ts — la cartera de Customer Success de «Para ti» (2026-10-17). SERVER-ONLY, solo lectura.
 *
 * Junta, por empresa, sus proyectos de HubSpot de implementación, SmartLoop y desarrollo con lo que Nexus ya sabe de
 * ella. No calcula ninguna regla nueva: reúsa
 *   · las cuentas de Éxito del cliente (`cargarCuentas`, por `cuentasDelPedido`): el CSE de la cuenta, la etapa, el
 *     bloqueo y el atraso de cada proyecto de CS, el último contacto, la renovación, los tickets y la relación con
 *     HubSpot;
 *   · la lectura de la cuenta (`lecturasDelPedido`): el color y su porqué, la misma de la ficha y de la cartera;
 *   · el servicio de «Para ti» (`servicioDeLasCuentas`): la acción de la semana y la próxima reunión.
 * Las dos primeras se comparten en el pedido con lo que mide «Para ti» (lib/mi-dia/lecturas-server.ts).
 *
 * Quién ve qué:
 *   · el CSE: sus cuentas (las del alcance, lib/para-ti/alcance-server.ts, que ya respeta los REVOKE). El color, solo
 *     de las que lleva, y sin lo que habla de plata (como la ficha). Sin la relación con HubSpot;
 *   · quien lidera Customer Success (la CSL y dirección): toda la cartera, con el color completo y la relación;
 *   · el monto de los negocios abiertos, solo quien ve Ventas (`ventas.read`).
 * Consultas por lote, con tope: nada por empresa.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { CLIENTE_DE_CS_SIN_EXCLIENTES_WHERE } from "@/lib/cs/exclientes";
import { proyectosAbiertos } from "@/lib/clients/resumen-proyectos";
import { proyectoNavegableWhere } from "@/lib/projects/scope";
import { pipelineByKey } from "@/lib/projects/kind";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { esCuentaDePrueba } from "@/lib/documentacion/equipo";
import { hoyEnCostaRica } from "@/lib/cs/cartera";
import { cseDeLaCuenta, proximaRenovacion, type CuentaDeCartera } from "@/lib/cs/cartera-reglas";
import { encargadoDeLaCuenta, proyectoQueLleva } from "@/lib/cuentas/encargado";
import { relacionConHubspot } from "@/lib/cs/relacion-gestionada";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotProjectUrl } from "@/lib/hubspot/urls";
import { tienePermiso, type Alcance } from "@/lib/para-ti/alcance-server";
import { cuentasDelPedido, lecturasDelPedido } from "./lecturas-server";
import { servicioDeLasCuentas, type ServicioDeLaCuenta } from "./servicio-server";
import type { SemanaDeUso } from "@/lib/cs/adopcion";
import { negociosDeLaEmpresa, saludDeCs, usoDeHubspot, type EmpresaDeCs, type PipelineDeCs, type ProyectoDeCs } from "./cartera-cs";
import type { VarianteDelInicio } from "./inicio";

export interface CarteraDeCs {
  empresas: EmpresaDeCs[];
  /** Lidera Customer Success: ve toda la cartera, «Por CSE» y la relación con HubSpot. */
  lider: boolean;
  /** Ve el monto de los negocios abiertos. */
  veMontos: boolean;
  /** El correo de quien mira: «Planificar acción» arma el evento en su calendario. */
  correo: string;
  /**
   * El pase de cuenta desde «Para ti» (2026-10-19): el mismo control y el mismo permiso que en Éxito del cliente
   * (`proyectos.reasignarEncargado`, la CSL y dirección). Vacío = no puede cambiar el encargado: se lee el CSE.
   */
  equipoParaPase: { email: string; name: string }[];
}

const PIPELINES: ReadonlyArray<readonly [string, PipelineDeCs]> = (["customer-success", "smartloop", "development"] as const).map(
  (k) => [pipelineByKey(k).hubspotPipelineId, k] as const,
);
const PIPELINE_DE = new Map(PIPELINES);
const IDS_DE_PIPELINE = PIPELINES.map(([id]) => id);

/** Un tope de cordura: la cartera entera tiene ~100 proyectos abiertos. */
const MAX_PROYECTOS = 2000;
const MAX_NEGOCIOS = 2000;
/** La copia semanal de uso que se lee: 6 semanas alcanzan para comparar con hace 4. */
const DIAS_DE_HISTORIAL = 42;
const MAX_SEMANAS = 4000;

/**
 * La copia semanal de uso de HubSpot Partner (`PartnerUsageSnapshot`) de esas empresas, de las últimas 6 semanas. Una
 * semana por empresa (si una empresa tiene dos registros de Partner, la primera que llega).
 */
async function historialDeUso(clientIds: readonly string[], ahora: Date): Promise<Map<string, SemanaDeUso[]>> {
  const out = new Map<string, SemanaDeUso[]>();
  if (clientIds.length === 0) return out;
  const filas = await prisma.partnerUsageSnapshot.findMany({
    where: { clientId: { in: [...clientIds] }, capturedAt: { gte: new Date(ahora.getTime() - DIAS_DE_HISTORIAL * 86_400_000) } },
    orderBy: { weekKey: "desc" },
    select: { clientId: true, weekKey: true, uusScore: true, marketingScore: true, salesScore: true, serviceScore: true },
    take: MAX_SEMANAS,
  });
  for (const f of filas) {
    if (!f.clientId) continue;
    const l = out.get(f.clientId) ?? [];
    if (l.some((x) => x.semana === f.weekKey)) continue;
    l.push({ semana: f.weekKey, uso: f.uusScore, porHub: { marketing: f.marketingScore, sales: f.salesScore, service: f.serviceScore } });
    out.set(f.clientId, l);
  }
  return out;
}

/** La variante de «Para ti» que tiene esta cartera. */
export function tieneCarteraDeCs(variante: VarianteDelInicio): variante is "cse" | "csl" {
  return variante === "cse" || variante === "csl";
}

/** Quien ve toda la cartera: la variante de la CSL y lidera Customer Success. */
function veTodaLaCarteraDeCs(variante: "cse" | "csl", a: Alcance): boolean {
  return variante === "csl" && esLiderDeCs(a.rol);
}

const SELECT_PROYECTO = {
  id: true,
  name: true,
  clientId: true,
  status: true,
  serviceType: true,
  hubspotServiceId: true,
  hubspotPipelineId: true,
  hubspotPipelineStageLabel: true,
  hubspotStatus: true,
  hubspotOwnerEmail: true,
  hubspotOwnerName: true,
  proyectoInterno: true,
  hermanoCsProjectId: true,
  altaEstado: true,
  esPrueba: true,
  hubspotCreatedAt: true,
  client: { select: { name: true } },
} as const;

/** Los proyectos abiertos de la cartera (de esas empresas, o de toda la cartera). */
async function proyectosDeLaCartera(clientIds: readonly string[] | null) {
  const filas = await prisma.project.findMany({
    where: proyectoNavegableWhere({
      hubspotPipelineId: { in: IDS_DE_PIPELINE },
      esPrueba: false,
      proyectoInterno: false,
      client: CLIENTE_DE_CS_SIN_EXCLIENTES_WHERE,
      ...(clientIds ? { clientId: { in: [...clientIds] } } : {}),
    }),
    select: SELECT_PROYECTO,
    orderBy: [{ name: "asc" }],
    take: MAX_PROYECTOS,
  });
  return proyectosAbiertos(filas);
}

/**
 * Cuántas empresas tiene la cartera de esa persona, para el selector de la cabecera en «Tu día» (sin cargar la
 * cartera entera). En «Tu cartera» se usa el largo de la lista.
 */
export async function cuantasEmpresasDeCs(variante: "cse" | "csl", a: Alcance): Promise<number> {
  if (!veTodaLaCarteraDeCs(variante, a)) return new Set(a.proyectos.map((p) => p.clientId)).size;
  const filas = await prisma.project.findMany({
    where: proyectoNavegableWhere({ hubspotPipelineId: { in: IDS_DE_PIPELINE }, esPrueba: false, proyectoInterno: false, client: CLIENTE_DE_CS_SIN_EXCLIENTES_WHERE }),
    select: { clientId: true, status: true, serviceType: true, hubspotServiceId: true, hubspotPipelineId: true, proyectoInterno: true, hermanoCsProjectId: true, altaEstado: true, esPrueba: true },
    take: MAX_PROYECTOS,
  });
  return new Set(proyectosAbiertos(filas).map((p) => p.clientId)).size;
}

export async function cargarCarteraDeCs(variante: "cse" | "csl", a: Alcance, o: { ahora: Date; hoyISO: string }): Promise<CarteraDeCs> {
  const lider = veTodaLaCarteraDeCs(variante, a);
  const veMontos = tienePermiso(a, "ventas", "read");
  const propias = lider ? null : [...new Set(a.proyectos.map((p) => p.clientId))];
  const correo = a.email;
  const vacia = { empresas: [], lider, veMontos, correo, equipoParaPase: [] };
  if (propias && propias.length === 0) return vacia;

  const proyectos = await proyectosDeLaCartera(propias);
  const ids = [...new Set(proyectos.map((p) => p.clientId))];
  if (ids.length === 0) return vacia;
  // A quién se le puede pasar una cuenta: el equipo activo sin las cuentas de prueba, como en Éxito del cliente.
  const equipoParaPase = tienePermiso(a, "proyectos", "reasignarEncargado")
    ? (
        await prisma.teamMember
          .findMany({ where: { deactivatedAt: null }, select: { email: true, name: true }, orderBy: { name: "asc" } })
          .catch(() => [])
      ).filter((m) => !esCuentaDePrueba(m.name))
    : [];

  // Las que lleva el CSE (es el encargado en HubSpot): de esas ve el color. Las compartidas, sin color.
  const lasQueLlevo = new Set(a.proyectos.filter((p) => p.encargado).map((p) => p.clientId));
  const conColor = lider ? ids : ids.filter((id) => lasQueLlevo.has(id));
  const sinColor = lider ? [] : ids.filter((id) => !lasQueLlevo.has(id));
  const hoy = hoyEnCostaRica(o.ahora);

  const [cuentasConColor, cuentasSinColor, lecturas, negocios, contactos, portal, historial] = await Promise.all([
    cuentasDelPedido(conColor).catch(() => [] as CuentaDeCartera[]),
    cuentasDelPedido(sinColor).catch(() => [] as CuentaDeCartera[]),
    conColor.length ? lecturasDelPedido(conColor, { sinPlata: !lider, ahora: o.ahora }).catch(() => null) : Promise.resolve(null),
    veMontos
      ? prisma.negocioAbierto
          .findMany({ where: { clientId: { in: ids }, abierto: true }, select: { clientId: true, monto: true, moneda: true, etapaLabel: true }, take: MAX_NEGOCIOS })
          .catch(() => [])
      : Promise.resolve([]),
    prisma.contactoDeHubspot
      .groupBy({ by: ["clientId"], where: { clientId: { in: ids }, vigente: true }, _count: { _all: true } })
      .catch(() => null),
    portalDelSistema().catch(() => null),
    // El uso de HubSpot, de las que ve el color: es dato de partner (como en Adopción, solo quien lleva la cuenta).
    historialDeUso(conColor, o.ahora).catch(() => new Map<string, SemanaDeUso[]>()),
  ]);
  const veElUso = new Set(conColor);
  const cuentaDe = new Map([...cuentasConColor, ...cuentasSinColor].map((c) => [c.clientId, c]));

  // Quién lleva cada proyecto (el encargado en HubSpot), con su nombre en Nexus y si está de baja.
  const correos = [...new Set(proyectos.flatMap((p) => (p.hubspotOwnerEmail ? [p.hubspotOwnerEmail.toLowerCase()] : [])))];
  const personas = correos.length
    ? await prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true, deactivatedAt: true } })
    : [];
  const persona = new Map(personas.map((p) => [p.email.toLowerCase(), p]));
  const nombreDelEncargado = (email: string | null, nombre: string | null): string | null => {
    if (!email) return nombre;
    const p = persona.get(email.toLowerCase());
    if (!p) return nombre ?? email;
    return p.deactivatedAt ? `${p.name} (de baja)` : p.name;
  };

  // El CSE de cada cuenta: el de Éxito del cliente; sin cuenta (solo desarrollo, o fuera de la cartera), la misma regla
  // única (lib/cuentas/encargado.ts) sobre sus proyectos abiertos.
  const deBajaPorCorreo = new Map(personas.filter((x) => x.deactivatedAt).map((x) => [x.email.toLowerCase(), x.name]));
  const nombreEnNexus = new Map(personas.map((x) => [x.email.toLowerCase(), x.name]));
  const cseDe = new Map<string, { nombre: string; email: string | null } | null>();
  for (const id of ids) {
    const c = cuentaDe.get(id);
    if (c) {
      cseDe.set(id, cseDeLaCuenta(c));
      continue;
    }
    const e = encargadoDeLaCuenta(proyectos.filter((p) => p.clientId === id).map(proyectoQueLleva), deBajaPorCorreo, nombreEnNexus);
    cseDe.set(id, e.email ? { nombre: e.nombre ?? e.email, email: e.email } : null);
  }

  // La acción de la semana y la próxima reunión: del calendario de quien la lleva. El CSE, del suyo (como el resto de
  // «Para ti»); quien lidera, del de cada CSE.
  const llevaDe = (id: string) => (lider ? (cseDe.get(id)?.email ?? null) : a.email);
  const [servicio] = await Promise.all([
    servicioDeLasCuentas(
      ids.map((id) => ({
        clientId: id,
        empresa: proyectos.find((p) => p.clientId === id)?.client.name ?? "",
        llevaEmail: llevaDe(id),
      })),
      { ahora: o.ahora, hoyISO: o.hoyISO, quienMira: { email: a.email, esSuperAdmin: a.rol === "SUPER_ADMIN" } },
    ).catch(() => new Map<string, ServicioDeLaCuenta>()),
  ]);

  const contactosDe = contactos ? new Map(contactos.map((c) => [c.clientId, c._count._all])) : null;
  const negociosDe = new Map<string, { monto: number | null; moneda: string; etapa: string }[]>();
  for (const n of negocios) {
    if (!n.clientId) continue;
    const l = negociosDe.get(n.clientId) ?? [];
    l.push({ monto: n.monto == null ? null : Number(n.monto), moneda: n.moneda, etapa: n.etapaLabel ?? "" });
    negociosDe.set(n.clientId, l);
  }

  const empresas: EmpresaDeCs[] = ids.map((id) => {
    const c = cuentaDe.get(id) ?? null;
    const l = lecturas?.get(id) ?? null;
    const s = servicio.get(id) ?? null;
    const deCuenta = new Map((c?.proyectos ?? []).map((p) => [p.id, p]));
    const suyos: ProyectoDeCs[] = proyectos
      .filter((p) => p.clientId === id)
      .map((p) => {
        const pc = deCuenta.get(p.id);
        return {
          id: p.id,
          nombre: p.name,
          pipeline: PIPELINE_DE.get(p.hubspotPipelineId ?? "") ?? "customer-success",
          etapa: pc?.etapa ?? p.hubspotPipelineStageLabel ?? null,
          encargado: nombreDelEncargado(p.hubspotOwnerEmail, p.hubspotOwnerName),
          bloqueado: pc?.bloqueado ?? (p.hubspotStatus === "blocked" || /bloquead/i.test(p.hubspotPipelineStageLabel ?? "")),
          atrasoDias: pc?.atraso?.dias ?? null,
          hubspotUrl: hubspotProjectUrl(portal, p.hubspotServiceId),
        };
      });
    const cse = cseDe.get(id) ?? null;
    // Sin la cuenta de Éxito del cliente (solo desarrollo), la última reunión cuenta como contacto si estuvo alguien
    // del cliente: una de puertas adentro no es contacto con él (decisión del 2026-10-05).
    const ultimoContacto = c ? c.ultimoContacto : s && s.ultimaReunion && s.invitados.length > 0 ? s.ultimaReunion : null;
    const relacion = lider && c ? relacionConHubspot(c.partner, hoy) : null;
    return {
      clientId: id,
      nombre: proyectos.find((p) => p.clientId === id)?.client.name ?? c?.nombre ?? id,
      cse,
      cseDeBaja: cse ? null : (c?.proyectos.find((p) => p.activo && p.cseDeBaja)?.cseDeBaja ?? null),
      tuya: lasQueLlevo.has(id),
      salud: l ? saludDeCs(l.salud) : null,
      porque: l?.porque ?? null,
      motivos: (l?.motivos ?? []).map((m) => m.texto),
      proyectos: suyos,
      ultimoContacto,
      proxima: s?.reunion ? { titulo: s.reunion.titulo, inicio: s.reunion.inicio } : null,
      calendarioLeido: s ? s.calendarioLeido : true,
      accion: s?.accion ? { numero: s.accion.numero, titulo: s.accion.titulo } : null,
      paso: !s?.paso
        ? null
        : s.paso.tipo === "reunion"
          ? { tipo: "reunion", dia: s.paso.dia, inicio: s.paso.reunion.inicio, titulo: s.paso.reunion.titulo }
          : { tipo: "accion", dia: s.paso.dia, numero: s.paso.accion.numero, titulo: s.paso.accion.titulo },
      renovacion: c ? proximaRenovacion(c, hoy) : null,
      relacion: relacion && relacion.estado !== "sin-partner" ? { corto: relacion.corto, tono: relacion.tono } : null,
      contactos: contactosDe ? (contactosDe.get(id) ?? 0) : null,
      ticketsAbiertos: c?.ticketsAbiertos ?? null,
      negocios: veMontos ? negociosDeLaEmpresa(negociosDe.get(id) ?? []) : null,
      uso: veElUso.has(id)
        ? usoDeHubspot({ partner: c?.partner ?? null, usoAnterior: c?.usoAnterior ?? null, historial: historial.get(id) ?? [], hoyISO: hoy })
        : null,
      invitados: s?.invitados ?? [],
    };
  });

  return { empresas: empresas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es")), lider, veMontos, correo, equipoParaPase };
}
