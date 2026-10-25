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
 * `pendiente` o `no_aplica`. La lectura la hace lib/comunicaciones/compromisos-server.ts. Desde U8 (2026-10-25) la IA
 * lee solo los correos de las cuentas activas o usadas en Nexus (`cuentaQueLeeLaIA`); los demás se copian igual.
 *
 * U7 (2026-10-25): también las reuniones de HubSpot con el resumen de Notetaker, y el resumen de las llamadas. Una
 * reunión o una llamada que ya llega por Meet con texto no se guarda, y la que se guardó se da de baja el día en que
 * llega el texto de Meet (lib/comunicaciones/reuniones.ts; las reuniones de Meet y su dueño salen del chokepoint).
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado } from "@/lib/db/esquema";
import { getSystemHubspotClient } from "@/lib/hubspot/client";
import { leerDuenos } from "@/lib/hubspot/duenos";
import { asociacionesDe, buscarModificadas, fechaMs, type RegistroDeHubspot } from "@/lib/hubspot/comunicaciones";
import { esNotaDeLaFicha } from "@/lib/clients/ficha";
import { indiceDeReunionesDeMeet } from "@/lib/sessions/project-sources";
import { PROYECTO_CLASIFICABLE_WHERE } from "@/lib/projects/scope";
import { DE_LA_PREVENTA } from "@/lib/exploraciones/marco";
import { codigoDeMeetDe, cruceConMeet, eventoDeGoogleDe, indexarReunionesDeMeet, type IndiceDeMeet } from "./reuniones";
import {
  clienteDeLaComunicacion,
  cuentaQueLeeLaIA,
  tiposQueSeReleen,
  VERSION_DEL_CURSOR,
  DIAS_DE_LA_VENTANA,
  DIAS_DE_USO_EN_NEXUS,
  DIAS_PARA_LEER_COMPROMISOS,
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
  /** U7: una reunión o una llamada que ya llega por Meet con texto (no se guarda; la que estaba, se da de baja). */
  yaPorMeet: number;
  /** U7: la reunión de Meet que la cubre es de OTRO cliente (invariante 1): no se guarda; la que estaba, se da de baja. */
  deOtroClienteEnMeet: number;
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
  /** U8: los correos enviados de esta corrida que pasarían el filtro pero son de una cuenta sin uso en Nexus (no gastan). */
  correosDeCuentasSinUso: number;
  /** U8: los que habían quedado sin leer por la cuenta sin uso, y la cuenta ya se activó: vuelven a la cola. */
  correosReactivados: number;
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
  const olvidar = tiposQueSeReleen(typeof v?.version === "number" ? v.version : 1);
  const out: Cursor = {};
  for (const t of TIPOS_DE_COMUNICACION) if (typeof v?.[t] === "number" && !olvidar.has(t)) out[t] = v[t] as number;
  return out;
}

async function guardarCursor(c: Cursor): Promise<void> {
  const valor = { ...c, version: VERSION_DEL_CURSOR };
  await prisma.cronJobState.upsert({ where: { id: CURSOR_KEY }, update: { lastResult: valor }, create: { id: CURSOR_KEY, lastResult: valor } });
}

/**
 * U8: los correos enviados de los últimos 14 días que quedaron «no_aplica» porque su cuenta no tenía uso en Nexus, y la
 * cuenta ya lo tiene: si pasan el filtro, vuelven a «pendiente». Sin esto, el correo del lunes de un prospecto cuyo
 * proyecto nace el martes no se leía nunca. Devuelve cuántos volvieron.
 */
async function reactivarCorreosDeCuentasActivas(leeLaIA: ReadonlySet<string>, ahora: Date, escribir: boolean): Promise<number> {
  if (!leeLaIA.size) return 0;
  const candidatos = await prisma.comunicacionDeHubspot.findMany({
    where: {
      tipo: "correo",
      direccion: "enviado",
      vigente: true,
      compromisosEstado: "no_aplica",
      compromisosLeidoAt: null,
      clientId: { in: [...leeLaIA] },
      ocurrioAt: { gte: new Date(+ahora - DIAS_PARA_LEER_COMPROMISOS * 86_400_000) },
    },
    select: { id: true, direccion: true, ocurrioAt: true, asunto: true, texto: true },
  });
  const vuelven = candidatos.filter(
    (c) => motivoDeLaLectura({ tipo: "correo", direccion: c.direccion as "enviado", ocurrioAt: c.ocurrioAt, asunto: c.asunto, texto: c.texto }, ahora, { cuentaActiva: true }) === "lee",
  );
  if (escribir && vuelven.length) {
    await prisma.comunicacionDeHubspot.updateMany({ where: { id: { in: vuelven.map((v) => v.id) }, compromisosEstado: "no_aplica" }, data: { compromisosEstado: "pendiente", compromisosIntentos: 0, compromisosError: null } });
  }
  return vuelven.length;
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
  yaPorMeet: 0,
  deOtroClienteEnMeet: 0,
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
  if (tipo === "reunion") {
    // Solo el resumen de Notetaker (la búsqueda ya pide las que lo tienen). El cuerpo de la reunión es la invitación.
    const resumen = limpiarTexto({ html: r.p.hs_meeting_summary ?? r.p.hs_ai_summary });
    if (!resumen) return null;
    const inicio = fechaMs(r.p.hs_meeting_start_time) ?? ocurrio;
    return {
      direccion: null,
      ocurrioAt: new Date(inicio),
      asunto: recortarAsunto(r.p.hs_meeting_title),
      texto: resumen,
      autorEmail: autor,
      deEmail: null,
      modificadoEnHubspot: modificado !== null ? new Date(modificado) : null,
      googleEventId: eventoDeGoogleDe(r.p.hs_meeting_external_url),
      codigoDeMeet: codigoDeMeetDe(r.p.hs_video_conference_url, r.p.hs_meeting_location),
    };
  }
  // Una llamada: su cuerpo (lo que escribió la persona) y el resumen de Notetaker (U7). Sin ninguno de los dos no hay nada
  // que leer; la de una videollamada de Meet con texto la descarta el cruce con Meet.
  const cuerpo = limpiarTexto({ html: r.p.hs_call_body });
  const resumen = limpiarTexto({ html: r.p.hs_call_summary ?? r.p.hs_ai_summary });
  const partes = [cuerpo, resumen && cuerpo ? `Resumen de la grabación (IA de HubSpot):\n${resumen}` : resumen].filter((x): x is string => !!x);
  const textoDeLaLlamada = partes.length ? limpiarTexto({ texto: partes.join("\n\n") }) : null;
  if (!textoDeLaLlamada) return null;
  return {
    direccion: null,
    ocurrioAt: new Date(ocurrio),
    asunto: recortarAsunto(r.p.hs_call_title),
    texto: textoDeLaLlamada,
    autorEmail: autor,
    deEmail: null,
    modificadoEnHubspot: modificado !== null ? new Date(modificado) : null,
    googleEventId: null,
    codigoDeMeet: codigoDeMeetDe(r.p.hs_hosted_video_conference_url),
    conNotas: !!cuerpo,
  };
}

/** Lo que se escribe de una comunicación: sin `conNotas`, que solo decide el cruce con Meet (no es columna). */
function columnas(d: DatosDeLaComunicacion): Omit<DatosDeLaComunicacion, "conNotas"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- se saca a propósito: no es columna
  const { conNotas, ...resto } = d;
  return resto;
}

/** Las cuentas cuyos correos lee la IA (U8, `cuentaQueLeeLaIA`): con un proyecto activo o trabajadas en Nexus hace poco. */
async function cuentasQueLeeLaIA(clientIds: readonly string[], ahora: Date): Promise<Set<string>> {
  if (!clientIds.length) return new Set();
  const filas = await prisma.client.findMany({
    where: { id: { in: [...clientIds] } },
    select: {
      id: true,
      _count: { select: { projects: { where: PROYECTO_CLASIFICABLE_WHERE } } },
      exploracionesDeVenta: {
        // La preventa (una exploración de proyecto ya cuenta por el proyecto activo).
        where: { ...DE_LA_PREVENTA, updatedAt: { gte: new Date(+ahora - DIAS_DE_USO_EN_NEXUS * 86_400_000) } },
        orderBy: { updatedAt: "desc" },
        take: 1,
        select: { updatedAt: true },
      },
    },
  });
  return new Set(
    filas
      .filter((c) => cuentaQueLeeLaIA({ proyectosActivos: c._count.projects, ultimaExploracionAt: c.exploracionesDeVenta[0]?.updatedAt ?? null }, ahora))
      .map((c) => c.id),
  );
}

/**
 * Copia las comunicaciones. Con `escribir: false` es un simulacro: lee todo, calcula el plan y no escribe nada (ni toma
 * el candado ni mueve el punto de partida). `desdeElPrincipio` ignora el punto de partida (lee los 120 días).
 */
export async function copiarComunicaciones(opciones: { escribir?: boolean; desdeElPrincipio?: boolean; ahora?: Date; maxPaginas?: number } = {}): Promise<ResultadoDeLaCopia> {
  const escribir = opciones.escribir ?? true;
  const ahora = opciones.ahora ?? new Date();
  const porTipo = { correo: vacio(), nota: vacio(), llamada: vacio(), reunion: vacio() } satisfies Record<TipoDeComunicacion, ResultadoDelTipo>;
  const base: ResultadoDeLaCopia = { empresas: 0, porTipo, porCliente: new Map(), correosParaLeer: 0, correosConFechaOCompromiso: 0, correosDeCuentasSinUso: 0, correosReactivados: 0, errores: [] };
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
    const leeLaIA = await cuentasQueLeeLaIA(clientes.map((c) => c.id), ahora);
    // Las reuniones de Meet de la ventana (con su dueño, del chokepoint): se piden una vez, solo si hacen falta.
    let indiceDeMeet: IndiceDeMeet | null = null;
    const meet = async (): Promise<IndiceDeMeet> =>
      (indiceDeMeet ??= indexarReunionesDeMeet(await indiceDeReunionesDeMeet({ desde: new Date(desdeOcurrio - 86_400_000), hasta: new Date(+ahora + 86_400_000) })));

    for (const tipo of TIPOS_DE_COMUNICACION) {
      const r = porTipo[tipo];
      const desdeMod = Math.max(desdeOcurrio, (cursor[tipo] ?? desdeOcurrio) - SOLAPE_MS);
      const busqueda = await buscarModificadas(hs, tipo, desdeMod, desdeOcurrio, opciones.maxPaginas);
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
      const indice = tipo === "reunion" || tipo === "llamada" ? await meet() : null;
      const leidas: ComunicacionLeida[] = conDatos
        .filter((x) => !ilegibles.has(x.reg.id))
        .map((x): ComunicacionLeida => {
          const cliente = clienteDeLaComunicacion({ empresas: aEmpresas.porRegistro.get(x.reg.id) ?? [], contactos: aContactos.porRegistro.get(x.reg.id) ?? [] }, clientesPorEmpresa, clientesPorContacto);
          // U7: la que ya llega por Meet con texto, o cuya reunión de Meet es de OTRO cliente (invariante 1), cuenta como
          // «de nadie»: no se guarda y, si estaba, se da de baja.
          const claves = { googleEventId: x.d.googleEventId ?? null, codigoDeMeet: x.d.codigoDeMeet ?? null, inicio: +x.d.ocurrioAt };
          // Una llamada con notas de la persona no se cruza: sus notas no están en la transcripción de Meet.
          const cruce = indice && !x.d.conNotas ? cruceConMeet(claves, cliente.tipo === "uno" ? cliente.clientId : null, indice) : "se_guarda";
          if (cruce !== "se_guarda") {
            if (cruce === "ya_llega_por_meet") r.yaPorMeet++;
            else r.deOtroClienteEnMeet++;
            return { tipo, hubspotId: x.reg.id, datos: x.d, cliente: { tipo: "ninguno" } };
          }
          return { tipo, hubspotId: x.reg.id, datos: x.d, cliente };
        });

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
        deNadie: plan.deNadie - r.yaPorMeet - r.deOtroClienteEnMeet,
      });
      for (const l of leidas) {
        if (l.cliente.tipo !== "uno") continue;
        const fila = base.porCliente.get(l.cliente.clientId) ?? { correo: 0, nota: 0, llamada: 0, reunion: 0 };
        fila[tipo]++;
        base.porCliente.set(l.cliente.clientId, fila);
        if (tipo === "correo") {
          const motivo = motivoDeLaLectura({ tipo, ...l.datos }, ahora, { cuentaActiva: leeLaIA.has(l.cliente.clientId) });
          if (motivo === "lee") base.correosParaLeer++;
          if (motivo === "cuenta_sin_uso") base.correosDeCuentasSinUso++;
          if (motivo === "lee" || motivo === "vieja" || motivo === "cuenta_sin_uso") base.correosConFechaOCompromiso++;
        }
      }

      if (escribir) {
        const estadoPrevio = new Map(existentes.map((e) => [e.hubspotId, e.compromisosEstado]));
        const nuevos = plan.crear.map((f) => ({
          clientId: f.clientId,
          tipo,
          hubspotId: f.hubspotId,
          ...columnas(f.datos),
          huella: f.huella,
          compromisosEstado: estadoInicialDeCompromisos(motivoDeLaLectura({ tipo, ...f.datos }, ahora, { cuentaActiva: leeLaIA.has(f.clientId) })),
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
              ...columnas(f.datos),
              huella: f.huella,
              vigente: true,
              copiadoAt: ahora,
              ...(yaLeido ? {} : { compromisosEstado: estadoInicialDeCompromisos(motivoDeLaLectura({ tipo, ...f.datos }, ahora, { cuentaActiva: leeLaIA.has(f.clientId) })), compromisosIntentos: 0, compromisosError: null }),
            },
          });
        }
        for (const b of plan.bajas) {
          await prisma.comunicacionDeHubspot.updateMany({ where: { tipo, hubspotId: b.hubspotId }, data: { vigente: false, copiadoAt: ahora } });
        }
      }

      // U7: las reuniones que se guardaron porque Meet no tenía texto, y Meet ya lo tiene (o la reunión de Meet resultó de
      // otro cliente): baja. Las llamadas no: una guardada puede tener las notas de la persona. La búsqueda no las vuelve a traer, porque en HubSpot no cambiaron. Todas las de la ventana, con o
      // sin claves: sin claves cruza por la cuenta y la hora.
      if (indice && tipo === "reunion") {
        const yaGuardadas = await prisma.comunicacionDeHubspot
          .findMany({
            where: { tipo, vigente: true, ocurrioAt: { gte: new Date(desdeOcurrio) } },
            select: { hubspotId: true, clientId: true, googleEventId: true, codigoDeMeet: true, ocurrioAt: true },
          })
          .catch((e: unknown) => {
            if (esquemaDesactualizado(e)) return [];
            throw e;
          });
        const nuevasBajas = new Set(plan.bajas.map((b) => b.hubspotId));
        const cubiertas = yaGuardadas.filter(
          (g) => !nuevasBajas.has(g.hubspotId) && cruceConMeet({ googleEventId: g.googleEventId, codigoDeMeet: g.codigoDeMeet, inicio: +g.ocurrioAt }, g.clientId, indice) !== "se_guarda",
        );
        r.bajas += cubiertas.length;
        if (escribir && cubiertas.length) {
          await prisma.comunicacionDeHubspot.updateMany({ where: { tipo, hubspotId: { in: cubiertas.map((c) => c.hubspotId) } }, data: { vigente: false, copiadoAt: ahora } });
        }
      }

      // El punto de partida: hasta lo último que se leyó entero. Un ilegible frena el avance en su fecha.
      const modDeIlegibles = conDatos.filter((x) => ilegibles.has(x.reg.id)).map((x) => fechaMs(x.reg.p.hs_lastmodifieddate) ?? 0);
      const hasta = modDeIlegibles.length ? Math.min(...modDeIlegibles) : busqueda.ultimaModificacion;
      if (hasta !== null) nuevoCursor[tipo] = Math.max(cursor[tipo] ?? 0, hasta);
      r.completa = busqueda.completa && !ilegibles.size;
    }

    if (escribir) await guardarCursor(nuevoCursor);
    base.correosReactivados = await reactivarCorreosDeCuentasActivas(leeLaIA, ahora, escribir).catch((e: unknown) => {
      if (!escribir && esquemaDesactualizado(e)) return 0;
      throw e;
    });
    return { ...base, planes };
  } catch (e) {
    base.errores.push(e instanceof Error ? e.message : String(e));
    throw e;
  } finally {
    if (escribir) await soltarLock();
  }
}
