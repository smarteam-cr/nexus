/**
 * lib/comunicaciones/copia-server.ts — copia los correos, las notas y las llamadas de HubSpot de las empresas de Nexus
 * (clientes y prospectos) y de sus contactos a `ComunicacionDeHubspot`. El ÚNICO escritor de esa tabla. SERVER-ONLY.
 *
 * Plan: docs/correos-en-el-contexto-plan.md. Solo LEE HubSpot. Lo corre el job `comunicaciones-hubspot` cada hora de 6:00
 * a 20:00 (Costa Rica) y, la primera vez, `scripts/sync-comunicaciones-de-hubspot.ts`. Las reglas, las de la copia de
 * contactos (lib/contactos/copia-server.ts):
 *   · un candado en la base: una corrida a la vez entre el servidor y las dos PCs;
 *   · nunca se borra una fila: la que pasa a ser de dos clientes (o de ninguno) queda `vigente = false`;
 *   · una comunicación es de UN cliente (`clienteDeLaComunicacion`, invariante 1); la de dos no se guarda y se cuenta;
 *   · el punto de partida de cada tipo (`CronJobState` «comunicaciones-hubspot-cursor») avanza solo hasta lo que se leyó
 *     entero: un registro cuyas asociaciones no se pudieron leer se vuelve a pedir en la corrida siguiente;
 *   · sin el permiso de correos (403), no se guarda ningún correo y la corrida lo dice.
 *
 * De cada correo ENVIADO se decide acá, sin IA, si merece que se lean sus compromisos (`motivoDeLaLectura`): queda
 * `pendiente` o `no_aplica`. La lectura la hace lib/comunicaciones/compromisos-server.ts.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { asociacionesDe, buscarModificadas, fechaMs, type RegistroDeHubspot } from "@/lib/hubspot/comunicaciones";
import { esNotaDeLaFicha } from "@/lib/clients/ficha";
import {
  clienteDeLaComunicacion,
  DIAS_DE_LA_VENTANA,
  direccionDelCorreo,
  estadoInicialDeCompromisos,
  limpiarTexto,
  motivoDeLaLectura,
  planDeCopia,
  recortarAsunto,
  TIPOS_DE_COMUNICACION,
  type ComunicacionLeida,
  type DatosDeLaComunicacion,
  type PlanDeCopia,
  type TipoDeComunicacion,
} from "./reglas";

const LOCK_KEY = "comunicaciones-hubspot-lock";
const CURSOR_KEY = "comunicaciones-hubspot-cursor";
const LOCK_TIMEOUT_MS = 15 * 60 * 1000;
/** La búsqueda vuelve a pedir una hora antes del punto de partida: lo que se modificó mientras corría la anterior. */
const SOLAPE_MS = 60 * 60 * 1000;

export interface ResultadoDelTipo {
  sinPermiso: boolean;
  completa: boolean;
  leidos: number;
  creados: number;
  actualizados: number;
  bajas: number;
  sinCambio: number;
  /** Son de dos o más clientes de Nexus: no se guardan (invariante 1). */
  ambiguas: number;
  /** No son de ningún cliente de Nexus. */
  deNadie: number;
  /** Sin texto (una llamada sin cuerpo, una nota vacía) o la nota de la ficha: no se guardan. */
  sinTexto: number;
  /** Sus asociaciones no se pudieron leer: se vuelven a pedir. */
  ilegibles: number;
}

export interface ResultadoDeLaCopia {
  locked?: boolean;
  empresas: number;
  porTipo: Record<TipoDeComunicacion, ResultadoDelTipo>;
  /** Por cliente: cuántas comunicaciones vigentes quedarían de lo que trajo esta corrida (para el simulacro). */
  porCliente: Map<string, Record<TipoDeComunicacion, number>>;
  /** Los correos enviados de esta corrida que pasaron el filtro (quedan para leer sus compromisos). */
  correosParaLeer: number;
  /** Los correos enviados de la ventana entera que pasarían el filtro sin contar la edad (para estimar el costo). */
  correosConFechaOCompromiso: number;
  errores: string[];
  planes?: Record<TipoDeComunicacion, PlanDeCopia>;
}

async function tomarLock(now: Date): Promise<boolean> {
  await prisma.cronJobState
    .upsert({ where: { id: LOCK_KEY }, update: {}, create: { id: LOCK_KEY } })
    .catch((e) => {
      if ((e as { code?: string })?.code !== "P2002") throw e;
    });
  const claimed = await prisma.cronJobState.updateMany({
    where: { id: LOCK_KEY, OR: [{ lastRunAt: null }, { lastRunAt: { lt: new Date(now.getTime() - LOCK_TIMEOUT_MS) } }] },
    data: { lastRunAt: now },
  });
  return claimed.count === 1;
}

async function soltarLock(): Promise<void> {
  await prisma.cronJobState.updateMany({ where: { id: LOCK_KEY }, data: { lastRunAt: null } }).catch(() => {});
}

type Cursor = Partial<Record<TipoDeComunicacion, number>>;

async function leerCursor(): Promise<Cursor> {
  const f = await prisma.cronJobState.findUnique({ where: { id: CURSOR_KEY }, select: { lastResult: true } });
  const v = f?.lastResult as Record<string, unknown> | null | undefined;
  const out: Cursor = {};
  for (const t of TIPOS_DE_COMUNICACION) if (typeof v?.[t] === "number") out[t] = v[t] as number;
  return out;
}

async function guardarCursor(c: Cursor): Promise<void> {
  await prisma.cronJobState.upsert({ where: { id: CURSOR_KEY }, update: { lastResult: c }, create: { id: CURSOR_KEY, lastResult: c } });
}

const vacio = (): ResultadoDelTipo => ({
  sinPermiso: false,
  completa: false,
  leidos: 0,
  creados: 0,
  actualizados: 0,
  bajas: 0,
  sinCambio: 0,
  ambiguas: 0,
  deNadie: 0,
  sinTexto: 0,
  ilegibles: 0,
});

const texto = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null);

/** Un registro de HubSpot → lo que se guarda. null = no se guarda (sin texto, la nota de la ficha, sin fecha). */
export function datosDelRegistro(tipo: TipoDeComunicacion, r: RegistroDeHubspot, correoDelDueno: (id: string | null) => string | null): DatosDeLaComunicacion | null {
  const ocurrio = fechaMs(r.p.hs_timestamp);
  if (ocurrio === null) return null;
  const modificado = fechaMs(r.p.hs_lastmodifieddate);
  const autor = correoDelDueno(texto(r.p.hubspot_owner_id));
  if (tipo === "correo") {
    const direccion = direccionDelCorreo(r.p.hs_email_direction);
    const cuerpo = limpiarTexto({ texto: r.p.hs_email_text, html: r.p.hs_email_html }, { sinHilo: true });
    const asunto = recortarAsunto(r.p.hs_email_subject);
    if (!cuerpo && !asunto) return null;
    return {
      direccion,
      ocurrioAt: new Date(ocurrio),
      asunto,
      texto: cuerpo,
      autorEmail: direccion === "recibido" ? null : autor,
      deEmail: direccion === "recibido" ? (texto(r.p.hs_email_from_email)?.toLowerCase() ?? null) : null,
      modificadoEnHubspot: modificado !== null ? new Date(modificado) : null,
    };
  }
  if (tipo === "nota") {
    const crudo = r.p.hs_note_body ?? "";
    if (!crudo.trim() || esNotaDeLaFicha(crudo)) return null;
    const cuerpo = limpiarTexto({ html: crudo });
    if (!cuerpo) return null;
    return { direccion: null, ocurrioAt: new Date(ocurrio), asunto: null, texto: cuerpo, autorEmail: autor, deEmail: null, modificadoEnHubspot: modificado !== null ? new Date(modificado) : null };
  }
  // Una llamada sin cuerpo suele ser una reunión de Meet registrada como llamada: ya entra por Meet.
  const cuerpo = limpiarTexto({ html: r.p.hs_call_body });
  if (!cuerpo) return null;
  return {
    direccion: null,
    ocurrioAt: new Date(ocurrio),
    asunto: recortarAsunto(r.p.hs_call_title),
    texto: cuerpo,
    autorEmail: autor,
    deEmail: null,
    modificadoEnHubspot: modificado !== null ? new Date(modificado) : null,
  };
}

/**
 * Copia las comunicaciones. Con `escribir: false` es un simulacro: lee todo, calcula el plan y no escribe nada (ni toma
 * el candado ni mueve el punto de partida). `desdeElPrincipio` ignora el punto de partida (lee los 120 días).
 */
export async function copiarComunicaciones(opciones: { escribir?: boolean; desdeElPrincipio?: boolean; ahora?: Date } = {}): Promise<ResultadoDeLaCopia> {
  const escribir = opciones.escribir ?? true;
  const ahora = opciones.ahora ?? new Date();
  const porTipo = { correo: vacio(), nota: vacio(), llamada: vacio() } satisfies Record<TipoDeComunicacion, ResultadoDelTipo>;
  const base: ResultadoDeLaCopia = { empresas: 0, porTipo, porCliente: new Map(), correosParaLeer: 0, correosConFechaOCompromiso: 0, errores: [] };
  if (escribir && !(await tomarLock(ahora))) return { ...base, locked: true };
  try {
    // ── Quién es de quién ─────────────────────────────────────────────────────
    const clientes = await prisma.client.findMany({
      where: { hubspotCompanyId: { not: null }, kind: { in: ["CLIENTE", "PROSPECTO"] } },
      select: { id: true, hubspotCompanyId: true },
    });
    const idsDeClientes = new Set(clientes.map((c) => c.id));
    const clientesPorEmpresa = new Map<string, string[]>();
    for (const c of clientes) {
      const k = String(c.hubspotCompanyId);
      clientesPorEmpresa.set(k, [...(clientesPorEmpresa.get(k) ?? []), c.id]);
    }
    base.empresas = clientesPorEmpresa.size;
    const contactos = await prisma.contactoDeHubspot.findMany({ where: { vigente: true }, select: { hubspotId: true, clientId: true } });
    const clientesPorContacto = new Map<string, string[]>();
    for (const c of contactos) {
      if (!idsDeClientes.has(c.clientId)) continue;
      const lista = clientesPorContacto.get(c.hubspotId) ?? [];
      if (!lista.includes(c.clientId)) lista.push(c.clientId);
      clientesPorContacto.set(c.hubspotId, lista);
    }

    let hs = await getSystemHubspotClient();
    const duenos = await leerDuenos(hs).catch(() => null);
    const correoDelDueno = (ownerId: string | null) => (ownerId ? (duenos?.porOwner.get(ownerId)?.email ?? null) : null);
    const cursor = opciones.desdeElPrincipio ? {} : await leerCursor();
    const nuevoCursor: Cursor = { ...cursor };
    const desdeOcurrio = +ahora - DIAS_DE_LA_VENTANA * 86_400_000;
    const planes = {} as Record<TipoDeComunicacion, PlanDeCopia>;

    for (const tipo of TIPOS_DE_COMUNICACION) {
      const r = porTipo[tipo];
      const desdeMod = Math.max(desdeOcurrio, (cursor[tipo] ?? desdeOcurrio) - SOLAPE_MS);
      const busqueda = await buscarModificadas(hs, tipo, desdeMod, desdeOcurrio);
      hs = await getSystemHubspotClient();
      if (busqueda.sinPermiso) {
        r.sinPermiso = true;
        continue;
      }
      r.leidos = busqueda.registros.length;
      const conDatos = busqueda.registros.flatMap((reg) => {
        const d = datosDelRegistro(tipo, reg, correoDelDueno);
        if (!d) {
          r.sinTexto++;
          return [];
        }
        return [{ reg, d }];
      });
      const ids = conDatos.map((x) => x.reg.id);
      const [aEmpresas, aContactos] = await Promise.all([asociacionesDe(hs, tipo, ids, "companies"), asociacionesDe(hs, tipo, ids, "contacts")]);
      if (aEmpresas.sinPermiso || aContactos.sinPermiso) {
        r.sinPermiso = true;
        continue;
      }
      const ilegibles = new Set([...aEmpresas.ilegibles, ...aContactos.ilegibles]);
      r.ilegibles = ilegibles.size;
      const leidas: ComunicacionLeida[] = conDatos
        .filter((x) => !ilegibles.has(x.reg.id))
        .map((x) => ({
          tipo,
          hubspotId: x.reg.id,
          datos: x.d,
          cliente: clienteDeLaComunicacion({ empresas: aEmpresas.porRegistro.get(x.reg.id) ?? [], contactos: aContactos.porRegistro.get(x.reg.id) ?? [] }, clientesPorEmpresa, clientesPorContacto),
        }));

      const existentes = ids.length
        ? await prisma.comunicacionDeHubspot
            .findMany({
              where: { tipo, hubspotId: { in: ids } },
              select: { tipo: true, hubspotId: true, clientId: true, huella: true, vigente: true, compromisosEstado: true },
            })
            .catch((e: unknown) => {
              // En el simulacro, sin la tabla (el SQL sin aplicar) todo cuenta como nuevo. Al escribir, sí falla.
              if (!escribir && esquemaDesactualizado(e)) return [];
              throw e;
            })
        : [];
      const plan = planDeCopia(
        existentes.map((e) => ({ ...e, tipo: e.tipo as TipoDeComunicacion })),
        leidas,
      );
      planes[tipo] = plan;
      Object.assign(r, {
        creados: plan.crear.length,
        actualizados: plan.actualizar.length,
        bajas: plan.bajas.length,
        sinCambio: plan.sinCambio,
        ambiguas: plan.ambiguas.length,
        deNadie: plan.deNadie,
      });
      for (const l of leidas) {
        if (l.cliente.tipo !== "uno") continue;
        const fila = base.porCliente.get(l.cliente.clientId) ?? { correo: 0, nota: 0, llamada: 0 };
        fila[tipo]++;
        base.porCliente.set(l.cliente.clientId, fila);
        if (tipo === "correo") {
          const motivo = motivoDeLaLectura({ tipo, ...l.datos }, ahora);
          if (motivo === "lee") base.correosParaLeer++;
          if (motivo === "lee" || motivo === "vieja") base.correosConFechaOCompromiso++;
        }
      }

      if (escribir) {
        const estadoPrevio = new Map(existentes.map((e) => [e.hubspotId, e.compromisosEstado]));
        const nuevos = plan.crear.map((f) => ({
          clientId: f.clientId,
          tipo,
          hubspotId: f.hubspotId,
          ...f.datos,
          huella: f.huella,
          compromisosEstado: estadoInicialDeCompromisos(motivoDeLaLectura({ tipo, ...f.datos }, ahora)),
          copiadoAt: ahora,
        }));
        for (let i = 0; i < nuevos.length; i += 500) await prisma.comunicacionDeHubspot.createMany({ data: nuevos.slice(i, i + 500), skipDuplicates: true });
        for (const f of plan.actualizar) {
          // Un correo cuyos compromisos ya se leyeron no se vuelve a leer (cada correo, una vez); si cambió su texto y no
          // se había leído, se vuelve a decidir.
          const previo = estadoPrevio.get(f.hubspotId) ?? null;
          const yaLeido = previo === "leido" || previo === "leyendo";
          await prisma.comunicacionDeHubspot.update({
            where: { tipo_hubspotId: { tipo, hubspotId: f.hubspotId } },
            data: {
              clientId: f.clientId,
              ...f.datos,
              huella: f.huella,
              vigente: true,
              copiadoAt: ahora,
              ...(yaLeido ? {} : { compromisosEstado: estadoInicialDeCompromisos(motivoDeLaLectura({ tipo, ...f.datos }, ahora)), compromisosIntentos: 0, compromisosError: null }),
            },
          });
        }
        for (const b of plan.bajas) {
          await prisma.comunicacionDeHubspot.updateMany({ where: { tipo, hubspotId: b.hubspotId }, data: { vigente: false, copiadoAt: ahora } });
        }
      }

      // El punto de partida: hasta lo último que se leyó entero. Un ilegible frena el avance en su fecha.
      const modDeIlegibles = conDatos.filter((x) => ilegibles.has(x.reg.id)).map((x) => fechaMs(x.reg.p.hs_lastmodifieddate) ?? 0);
      const hasta = modDeIlegibles.length ? Math.min(...modDeIlegibles) : busqueda.ultimaModificacion;
      if (hasta !== null) nuevoCursor[tipo] = Math.max(cursor[tipo] ?? 0, hasta);
      r.completa = busqueda.completa && !ilegibles.size;
    }

    if (escribir) await guardarCursor(nuevoCursor);
    return { ...base, planes };
  } catch (e) {
    base.errores.push(e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    if (escribir) await soltarLock();
  }
}
