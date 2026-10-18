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
import { CS_CLIENT_WHERE } from "@/lib/clients/kind";
import { proyectosAbiertos } from "@/lib/clients/resumen-proyectos";
import { proyectoNavegableWhere } from "@/lib/projects/scope";
import { pipelineByKey } from "@/lib/projects/kind";
import { esLiderDeCs } from "@/lib/cs/acceso";
import { hoyEnCostaRica } from "@/lib/cs/cartera";
import { cseDeLaCuenta, proximaRenovacion, type CuentaDeCartera } from "@/lib/cs/cartera-reglas";
import { relacionConHubspot } from "@/lib/cs/relacion-gestionada";
import { portalDelSistema } from "@/lib/hubspot/registro-para-vincular";
import { hubspotProjectUrl } from "@/lib/hubspot/urls";
import { tienePermiso, type Alcance } from "@/lib/para-ti/alcance-server";
import { cuentasDelPedido, lecturasDelPedido } from "./lecturas-server";
import { servicioDeLasCuentas, type ServicioDeLaCuenta } from "./servicio-server";
import { negociosDeLaEmpresa, saludDeCs, type EmpresaDeCs, type PipelineDeCs, type ProyectoDeCs } from "./cartera-cs";
import type { VarianteDelInicio } from "./inicio";

export interface CarteraDeCs {
  empresas: EmpresaDeCs[];
  /** Lidera Customer Success: ve toda la cartera, «Por CSE» y la relación con HubSpot. */
  lider: boolean;
  /** Ve el monto de los negocios abiertos. */
  veMontos: boolean;
}

const PIPELINES: ReadonlyArray<readonly [string, PipelineDeCs]> = (["customer-success", "smartloop", "development"] as const).map(
  (k) => [pipelineByKey(k).hubspotPipelineId, k] as const,
);
const PIPELINE_DE = new Map(PIPELINES);
const IDS_DE_PIPELINE = PIPELINES.map(([id]) => id);

/** Un tope de cordura: la cartera entera tiene ~100 proyectos abiertos. */
const MAX_PROYECTOS = 2000;
const MAX_NEGOCIOS = 2000;

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
  client: { select: { name: true } },
} as const;

/** Los proyectos abiertos de la cartera (de esas empresas, o de toda la cartera). */
async function proyectosDeLaCartera(clientIds: readonly string[] | null) {
  const filas = await prisma.project.findMany({
    where: proyectoNavegableWhere({
      hubspotPipelineId: { in: IDS_DE_PIPELINE },
      esPrueba: false,
      proyectoInterno: false,
      client: CS_CLIENT_WHERE,
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
    where: proyectoNavegableWhere({ hubspotPipelineId: { in: IDS_DE_PIPELINE }, esPrueba: false, proyectoInterno: false, client: CS_CLIENT_WHERE }),
    select: { clientId: true, status: true, serviceType: true, hubspotServiceId: true, hubspotPipelineId: true, proyectoInterno: true, hermanoCsProjectId: true, altaEstado: true, esPrueba: true },
    take: MAX_PROYECTOS,
  });
  return new Set(proyectosAbiertos(filas).map((p) => p.clientId)).size;
}

export async function cargarCarteraDeCs(variante: "cse" | "csl", a: Alcance, o: { ahora: Date; hoyISO: string }): Promise<CarteraDeCs> {
  const lider = veTodaLaCarteraDeCs(variante, a);
  const veMontos = tienePermiso(a, "ventas", "read");
  const propias = lider ? null : [...new Set(a.proyectos.map((p) => p.clientId))];
  if (propias && propias.length === 0) return { empresas: [], lider, veMontos };

  const proyectos = await proyectosDeLaCartera(propias);
  const ids = [...new Set(proyectos.map((p) => p.clientId))];
  if (ids.length === 0) return { empresas: [], lider, veMontos };

  // Las que lleva el CSE (es el encargado en HubSpot): de esas ve el color. Las compartidas, sin color.
  const lasQueLlevo = new Set(a.proyectos.filter((p) => p.encargado).map((p) => p.clientId));
  const conColor = lider ? ids : ids.filter((id) => lasQueLlevo.has(id));
  const sinColor = lider ? [] : ids.filter((id) => !lasQueLlevo.has(id));
  const hoy = hoyEnCostaRica(o.ahora);

  const [cuentasConColor, cuentasSinColor, lecturas, negocios, contactos, portal] = await Promise.all([
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
  ]);
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

  // El CSE de cada cuenta: el de Éxito del cliente; sin cuenta (solo desarrollo), el encargado de su primer proyecto
  // de Customer Success que siga en el equipo.
  const cseDe = new Map<string, { nombre: string; email: string | null } | null>();
  for (const id of ids) {
    const c = cuentaDe.get(id);
    if (c) {
      cseDe.set(id, cseDeLaCuenta(c));
      continue;
    }
    const deCs = proyectos.find(
      (p) => p.clientId === id && PIPELINE_DE.get(p.hubspotPipelineId ?? "") !== "development" && p.hubspotOwnerEmail && !persona.get(p.hubspotOwnerEmail.toLowerCase())?.deactivatedAt,
    );
    cseDe.set(id, deCs?.hubspotOwnerEmail ? { nombre: nombreDelEncargado(deCs.hubspotOwnerEmail, deCs.hubspotOwnerName) ?? deCs.hubspotOwnerEmail, email: deCs.hubspotOwnerEmail.toLowerCase() } : null);
  }

  // La acción de la semana y la próxima reunión: del calendario de quien la lleva. El CSE, del suyo (como el resto de
  // «Para ti»); quien lidera, del de cada CSE.
  const servicio = await servicioDeLasCuentas(
    ids.map((id) => ({
      clientId: id,
      empresa: proyectos.find((p) => p.clientId === id)?.client.name ?? "",
      llevaEmail: lider ? (cseDe.get(id)?.email ?? null) : a.email,
    })),
    { ahora: o.ahora, hoyISO: o.hoyISO, quienMira: { email: a.email, esSuperAdmin: a.rol === "SUPER_ADMIN" } },
  ).catch(() => new Map<string, ServicioDeLaCuenta>());

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
      renovacion: c ? proximaRenovacion(c, hoy) : null,
      relacion: relacion && relacion.estado !== "sin-partner" ? { corto: relacion.corto, tono: relacion.tono } : null,
      contactos: contactosDe ? (contactosDe.get(id) ?? 0) : null,
      ticketsAbiertos: c?.ticketsAbiertos ?? null,
      negocios: veMontos ? negociosDeLaEmpresa(negociosDe.get(id) ?? []) : null,
    };
  });

  return { empresas: empresas.sort((x, y) => x.nombre.localeCompare(y.nombre, "es")), lider, veMontos };
}
