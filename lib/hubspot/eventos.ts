/**
 * lib/hubspot/eventos.ts — QUÉ DISPARA CADA AVISO DE HUBSPOT (U10, 2026-10-25). PURO: se prueba sin base ni HubSpot.
 *
 * Un aviso no trae el registro, ni decide de quién es: solo dice «esto cambió». Lo que hace Nexus con él:
 *   · una FUSIÓN (de cualquier objeto) → el par absorbido → sobreviviente va a `FusionDeHubspot` (U9);
 *   · una EMPRESA de Nexus que cambió → se sincronizan sus proyectos (la sincronización de siempre, la de la ficha);
 *   · un CONTACTO o un TICKET → se adelanta la copia de contactos y tickets;
 *   · un NEGOCIO → se adelanta la copia de los negocios abiertos;
 *   · una empresa que no es de Nexus → nada (las altas van por su propio camino).
 * Las copias adelantadas son las MISMAS del sondeo de cada hora, con sus reglas (invariante 1 incluida): el sondeo sigue
 * siendo la red por si un aviso no llega.
 */
import type { ObjetoFusionable, ParDeFusion } from "./fusiones";

export interface EventoPendiente {
  id: string;
  objeto: string;
  tipo: string;
  hubspotId: string;
  idsFusionados: readonly string[];
  idSobreviviente: string | null;
}

export interface PlanDeEventos {
  pares: ParDeFusion[];
  /** Los clientes de Nexus cuyos proyectos se sincronizan. */
  clientes: string[];
  /** Por aviso de empresa (cambio o fusión), los clientes que tienen que sincronizarse para darlo por procesado. */
  clientesDelAviso: Map<string, string[]>;
  copiarContactos: boolean;
  copiarNegocios: boolean;
  /** Los eventos que no piden nada (una empresa que no es de Nexus): se marcan «ignorado». */
  ignorados: string[];
  /** Los eventos de cada copia, para marcarlos procesados solo si la copia corrió. */
  porCopia: { contactos: string[]; negocios: string[]; empresas: string[]; fusiones: string[] };
}

const OBJETO_FUSIONABLE: Record<string, ObjetoFusionable> = { empresa: "empresa", contacto: "contacto", negocio: "negocio", ticket: "ticket" };

export function planDeEventos(eventos: readonly EventoPendiente[], clientesPorEmpresa: ReadonlyMap<string, readonly string[]>): PlanDeEventos {
  const plan: PlanDeEventos = { pares: [], clientes: [], clientesDelAviso: new Map(), copiarContactos: false, copiarNegocios: false, ignorados: [], porCopia: { contactos: [], negocios: [], empresas: [], fusiones: [] } };
  const clientes = new Set<string>();
  for (const e of eventos) {
    if (e.tipo === "fusion") {
      const objeto = OBJETO_FUSIONABLE[e.objeto];
      const sobreviviente = e.idSobreviviente ?? e.hubspotId;
      if (objeto) for (const idAbsorbido of e.idsFusionados) if (idAbsorbido !== sobreviviente) plan.pares.push({ objeto, idAbsorbido, idSobreviviente: sobreviviente });
      plan.porCopia.fusiones.push(e.id);
      // La fusión de una empresa de Nexus también pide sincronizar: sus proyectos se mudaron al sobreviviente. El aviso
      // queda procesado cuando esas fichas se sincronizaron, no antes.
      if (e.objeto === "empresa") {
        const deNexus = [...new Set([sobreviviente, ...e.idsFusionados].flatMap((id) => clientesPorEmpresa.get(id) ?? []))];
        for (const c of deNexus) clientes.add(c);
        if (deNexus.length) plan.clientesDelAviso.set(e.id, deNexus);
      }
      if (e.objeto === "contacto" || e.objeto === "ticket") plan.copiarContactos = true;
      if (e.objeto === "negocio") plan.copiarNegocios = true;
      continue;
    }
    if (e.objeto === "empresa") {
      const deNexus = clientesPorEmpresa.get(e.hubspotId) ?? [];
      if (!deNexus.length) {
        plan.ignorados.push(e.id);
        continue;
      }
      for (const c of deNexus) clientes.add(c);
      plan.clientesDelAviso.set(e.id, [...deNexus]);
      plan.porCopia.empresas.push(e.id);
      continue;
    }
    if (e.objeto === "contacto" || e.objeto === "ticket") {
      plan.copiarContactos = true;
      plan.porCopia.contactos.push(e.id);
      continue;
    }
    if (e.objeto === "negocio") {
      plan.copiarNegocios = true;
      plan.porCopia.negocios.push(e.id);
      continue;
    }
    plan.ignorados.push(e.id);
  }
  plan.clientes = [...clientes];
  return plan;
}

/**
 * Cuánto esperar entre dos copias adelantadas del mismo tipo: la copia es la entera (unos 25 pedidos y un par de
 * segundos), y el tick del scheduler es uno solo para todos los jobs. Con muchos avisos, una cada 20 minutos.
 */
export const MINUTOS_ENTRE_ADELANTOS = 20;
/** Las horas de Costa Rica en que se adelanta (las del sondeo): de noche, los avisos esperan a la copia de las 6:00. */
export const HORAS_DE_ADELANTO = { desde: 6, hasta: 20 } as const;

/**
 * ¿Se puede adelantar la copia? Sí si es de día (`HORAS_DE_ADELANTO`) y la última adelantada (o la del sondeo, o el
 * último intento que falló) fue hace más de `MINUTOS_ENTRE_ADELANTOS`.
 */
export function sePuedeAdelantar(ultima: Date | null, ahora: Date, horaCR: number): boolean {
  if (horaCR < HORAS_DE_ADELANTO.desde || horaCR > HORAS_DE_ADELANTO.hasta) return false;
  return !ultima || +ahora - +ultima >= MINUTOS_ENTRE_ADELANTOS * 60_000;
}

/** ¿El aviso de empresa ya se puede dar por procesado? Cuando todas sus fichas se sincronizaron en este tick. */
export function avisoListo(clientesDelAviso: readonly string[] | undefined, sincronizados: ReadonlySet<string>): boolean {
  return !clientesDelAviso || clientesDelAviso.every((c) => sincronizados.has(c));
}
