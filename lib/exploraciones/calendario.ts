import "server-only";

/**
 * lib/exploraciones/calendario.ts — las sesiones de la exploración y el calendario de Google. SERVIDOR.
 *
 * Etapa A (2026-10-09): una sesión se puede unir a su reunión del calendario ANTES de que ocurra
 * (`SesionPlaneada.evento`). Dos cosas, las dos a pedido y de solo lectura en Google:
 *   · `agendadasParaElSelector`: «Agendadas · próximas 6 semanas» del selector de «Agregar sesión», en el
 *     calendario de quien busca y en el de quien lleva la exploración (decisión de Elías del 9-oct), más
 *     la agenda de HubSpot en la preventa. Se guarda 2 minutos en memoria por persona y exploración
 *     (instancia única, RUNBOOK invariante 1).
 *   · `mirarCalendario`: al abrir el lienzo, como mucho cada 10 minutos (sello `test.calendarioEn`), relee
 *     los eventos de las sesiones unidas que empiezan entre ayer y dentro de 6 semanas (hasta 5). Si se
 *     movió, la sesión toma la fecha nueva; si se canceló, queda marcada (la sesión y su guía siguen).
 * ⛔ Nunca pasa por la sincronización de Meet ni ensancha su `timeMax` (incidente del 2026-09-21).
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { buildInternalDomainsSet } from "@/lib/sessions/categorize";
import { genteCompartidaConOtrosClientes, getClientSessions } from "@/lib/sessions/project-sources";
import { eventosProximos, MAX_EVENTOS_A_RELEER, releerEventos, type MotivoSinAgenda } from "@/lib/google/agenda-de-la-empresa";
import {
  agendaDeHubspotSinRepetir,
  candidatosACompartidos,
  filtrarAgendadas,
  genteDeLaEmpresa,
  juntarAgendadas,
  SEMANAS_DE_AGENDADAS,
  tieneALaEmpresa,
  type Agendada,
} from "./agendadas";
import type { Operacion } from "./contenido";
import { hoyEnCostaRica } from "./fechas";
import { reunionesDeLaExploracion } from "./fuentes";
import { opcionesDeLasPestanas, pestanasDeSesiones, type EventoDeLaSesion } from "./guia";
import { leerLoLeido } from "./lo-leido";
import { aplicarCambios, bloquearFila, escalaParaExplorar, estadoDesdeFila, leerExploracion, loQueVieneDeLaAgenda, type FilaDeExploracion } from "./servidor";

const MINUTO = 60 * 1000;
const DIA = 24 * 60 * MINUTO;

// ── «Agendadas · próximas 6 semanas» ──────────────────────────────────────────

/** Una agendada en el selector: del calendario de Google (se une por su evento) o de la agenda de HubSpot. */
export type AgendadaDelSelector =
  | (Agendada & { origen: "calendario"; yaEsLaSesion: number | null })
  | { origen: "hubspot"; id: string; titulo: string; inicio: string; yaEsLaSesion: number | null };

export interface AgendadasDelSelector {
  agendadas: AgendadaDelSelector[];
  /** Por qué la lista puede estar incompleta o vacía (sin Google, sin permiso, sin cómo reconocer a la empresa). null = nada. */
  aviso: string | null;
}

const AVISO_DEL_MOTIVO: Record<MotivoSinAgenda, string> = {
  "sin-google": "Google no está configurado aquí: no se pueden leer las reuniones agendadas.",
  "sin-permiso": "Nexus no tiene permiso para leer el calendario: no se pueden mostrar las reuniones agendadas.",
  error: "No se pudo leer el calendario. Inténtalo de nuevo en un momento.",
};

/**
 * Cómo se reconoce a la empresa en un calendario: sus dominios registrados y, de sus últimas 50 reuniones, la
 * gente de afuera que NO aparece en reuniones de otros clientes (agendadas.ts › `genteDeLaEmpresa`). Si no se
 * puede saber qué gente se comparte, solo lo registrado: antes que mezclar clientes, no reconocer.
 */
async function genteParaReconocer(clientId: string): Promise<{ dominios: string[]; correos: string[]; internos: Set<string> }> {
  const [cliente, recientes, categorias] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: { emailDomains: true } }),
    getClientSessions(clientId, { take: 50 }),
    prisma.sessionCategory.findMany({ select: { domains: true, kind: true } }).catch(() => []),
  ]);
  const internos = buildInternalDomainsSet(categorias);
  const registrados = cliente?.emailDomains ?? [];
  const participantes = recientes.flatMap((s) => s.participants);
  const compartidos = await genteCompartidaConOtrosClientes(clientId, candidatosACompartidos(registrados, participantes, { internos })).catch((e) => {
    console.error("[exploraciones/calendario] no se pudo mirar quién más comparte la gente de la empresa", e instanceof Error ? e.message : e);
    return null;
  });
  const gente = compartidos ? genteDeLaEmpresa(registrados, participantes, { internos, compartidos }) : genteDeLaEmpresa(registrados, [], { internos });
  return { ...gente, internos };
}

const MINUTOS_DE_MEMORIA = 2;
const memoria = new Map<string, { en: number; datos: AgendadasDelSelector }>();

/** Las agendadas con la empresa para el selector de «Agregar sesión». Ver la cabecera. */
export async function agendadasParaElSelector(fila: FilaDeExploracion, quienBusca: string | null, ahora = new Date()): Promise<AgendadasDelSelector> {
  const clave = `${(quienBusca ?? "").toLowerCase()}|${fila.id}`;
  const guardada = memoria.get(clave);
  if (guardada && ahora.getTime() - guardada.en < MINUTOS_DE_MEMORIA * MINUTO) return guardada.datos;

  const calendarios = [...new Set([quienBusca, fila.responsableEmail].filter((c): c is string => !!c).map((c) => c.trim().toLowerCase()))];
  const { dominios, correos, internos } = await genteParaReconocer(fila.clientId);

  let aviso: string | null = null;
  const deGoogle: Agendada[][] = [];
  if (!dominios.length && !correos.length) {
    aviso = "La empresa todavía no tiene dominios ni reuniones: Nexus no puede reconocer sus reuniones agendadas.";
  } else {
    for (const calendario of calendarios) {
      const r = await eventosProximos(calendario, { semanas: SEMANAS_DE_AGENDADAS, ahora });
      if (!r.ok) {
        // El calendario de quien busca manda en el aviso; el de quien la lleva es un extra.
        if (calendario === calendarios[0]) aviso = AVISO_DEL_MOTIVO[r.motivo];
        continue;
      }
      deGoogle.push(filtrarAgendadas(r.datos, { calendario, dominios, correos, internos, ahora }));
    }
  }
  const google = juntarAgendadas(deGoogle);
  const hubspot = fila.projectId ? [] : agendaDeHubspotSinRepetir(loQueVieneDeLaAgenda(leerLoLeido(fila.test), ahora.getTime()).agenda, google, ahora);

  // «Ya es la sesión N»: el número de la sesión que ya está unida a ese evento (o a esa reunión de HubSpot).
  const estado = estadoDesdeFila(fila);
  const sesiones = estado.contenido.sesiones;
  const numeros = new Map<string, number>();
  if (sesiones.some((s) => s.evento || s.reunion?.origen === "hubspot")) {
    const automaticas = !fila.projectId && fila.client.kind === "PROSPECTO";
    const reuniones = await reunionesDeLaExploracion(
      {
        exploracionId: fila.id,
        clientId: fila.clientId,
        projectId: fila.projectId,
        creadaEn: fila.createdAt,
        propuesta: estado.propuesta,
        leido: leerLoLeido(fila.test),
        sesiones,
        fuera: estado.contenido.fuera,
        elegidas: estado.contenido.reunionesElegidas,
      },
      ahora,
    ).catch(() => []);
    for (const p of pestanasDeSesiones(sesiones, reuniones, hoyEnCostaRica(ahora), opcionesDeLasPestanas(automaticas, estado.contenido.fuera))) {
      if (!p.sesion || p.noSeHizo) continue;
      if (p.sesion.evento) numeros.set(`calendario:${p.sesion.evento.id}`, p.numero);
      if (p.sesion.reunion?.origen === "hubspot") numeros.set(`hubspot:${p.sesion.reunion.id}`, p.numero);
    }
  }
  const datos: AgendadasDelSelector = {
    agendadas: [
      ...google.map((a) => ({ ...a, origen: "calendario" as const, yaEsLaSesion: numeros.get(`calendario:${a.id}`) ?? null })),
      ...hubspot.map((a) => ({ origen: "hubspot" as const, id: a.id, titulo: a.titulo, inicio: a.inicio, yaEsLaSesion: numeros.get(`hubspot:${a.id}`) ?? null })),
    ].sort((a, b) => a.inicio.localeCompare(b.inicio)),
    aviso,
  };
  memoria.set(clave, { en: ahora.getTime(), datos });
  if (memoria.size > 500) memoria.delete(memoria.keys().next().value as string);
  return datos;
}

/**
 * Las reuniones agendadas con la empresa en estos calendarios (próximas 6 semanas), sin una exploración: las usa el
 * Resumen de un proyecto recurrente para sus sesiones fijas (2026-10-12). Mismo reconocimiento de la empresa que el
 * selector, mismas guardas (nunca una reunión de otro cliente) y solo lectura en Google.
 */
export async function agendadasConLaEmpresa(
  clientId: string,
  calendarios: readonly string[],
  ahora = new Date(),
): Promise<{ agendadas: Agendada[]; aviso: string | null }> {
  const cals = [...new Set(calendarios.filter(Boolean).map((c) => c.trim().toLowerCase()))];
  const { dominios, correos, internos } = await genteParaReconocer(clientId);
  if (!dominios.length && !correos.length) {
    return { agendadas: [], aviso: "La empresa todavía no tiene dominios ni reuniones: Nexus no puede reconocer sus reuniones agendadas." };
  }
  let aviso: string | null = null;
  const listas: Agendada[][] = [];
  for (const calendario of cals) {
    const r = await eventosProximos(calendario, { semanas: SEMANAS_DE_AGENDADAS, ahora });
    if (!r.ok) {
      if (calendario === cals[0]) aviso = AVISO_DEL_MOTIVO[r.motivo];
      continue;
    }
    listas.push(filtrarAgendadas(r.datos, { calendario, dominios, correos, internos, ahora }));
  }
  return { agendadas: juntarAgendadas(listas), aviso };
}

/** Olvida lo guardado de una exploración (al unir una sesión, «Ya es la sesión N» tiene que verse enseguida). */
export function olvidarAgendadas(exploracionId: string): void {
  for (const k of memoria.keys()) if (k.endsWith(`|${exploracionId}`)) memoria.delete(k);
}

/**
 * El evento tal como está HOY en ese calendario, para unirlo a una sesión (no se confía en lo que manda la
 * pantalla). null + motivo si no se pudo leer, se canceló, ya no está o no tiene a nadie de la empresa
 * invitado (con un id cualquiera se habría podido unir, y después leer, una reunión que no es de la empresa).
 */
export async function eventoParaUnir(
  calendario: string,
  eventoId: string,
  o: { serie?: boolean; clientId: string },
): Promise<{ ok: true; evento: EventoDeLaSesion } | { ok: false; status: number; error: string }> {
  const r = await releerEventos(calendario, [eventoId]);
  if (!r.ok) return { ok: false, status: r.motivo === "sin-google" ? 503 : 502, error: AVISO_DEL_MOTIVO[r.motivo] };
  const e = r.datos[0];
  if (!e || e.estado === "noExiste") return { ok: false, status: 404, error: "Esa reunión ya no está en el calendario." };
  if (e.estado === "cancelado") return { ok: false, status: 409, error: "Esa reunión se canceló en el calendario." };
  if (!tieneALaEmpresa(e.invitados, await genteParaReconocer(o.clientId))) {
    return { ok: false, status: 400, error: "Esa reunión no tiene a nadie de la empresa invitado: no se puede unir a esta exploración." };
  }
  return {
    ok: true,
    evento: {
      id: eventoId,
      calendario,
      inicio: e.inicio,
      ...(e.fin ? { fin: e.fin } : {}),
      ...(e.titulo ? { titulo: e.titulo.slice(0, 300) } : {}),
      ...(o.serie ? { serie: true as const } : {}),
    },
  };
}

// ── Mirar el calendario al abrir el lienzo ────────────────────────────────────

/** Cada cuánto, como mucho, el lienzo vuelve a mirar los eventos de las sesiones unidas. */
export const MINUTOS_ENTRE_MIRADAS_AL_CALENDARIO = 10;

export interface ResultadoDeMirarElCalendario {
  /** Alguna sesión tomó una fecha nueva o quedó cancelada: el lienzo recarga. */
  cambio: boolean;
}

const NADA: ResultadoDeMirarElCalendario = { cambio: false };

/** Ver la cabecera. `forzar`: mira aunque la última mirada sea reciente. */
export async function mirarCalendario(exploracionId: string, ahora = new Date(), o: { forzar?: boolean } = {}): Promise<ResultadoDeMirarElCalendario> {
  const lectura = await leerExploracion(exploracionId);
  if (lectura.estado !== "ok" || lectura.fila.archivadaEn) return NADA;
  const fila = lectura.fila;
  const sesiones = estadoDesdeFila(fila).contenido.sesiones;
  const desde = ahora.getTime() - DIA;
  const hasta = ahora.getTime() + SEMANAS_DE_AGENDADAS * 7 * DIA;
  const aMirar = sesiones
    .filter((s) => s.evento && !s.evento.cancelada)
    .filter((s) => {
      const t = Date.parse(s.evento!.inicio);
      return t >= desde && t <= hasta;
    })
    .sort((a, b) => Math.abs(Date.parse(a.evento!.inicio) - ahora.getTime()) - Math.abs(Date.parse(b.evento!.inicio) - ahora.getTime()))
    .slice(0, MAX_EVENTOS_A_RELEER);
  if (!aMirar.length) return NADA;

  // El turno, con la fila bloqueada: dos pestañas que abren a la vez no miran dos veces.
  const tomado = await prisma.$transaction(async (tx) => {
    await bloquearFila(tx, exploracionId);
    const actual = await tx.exploracionDeVenta.findUnique({ where: { id: exploracionId }, select: { test: true } });
    if (!actual) return false;
    const foto = leerLoLeido(actual.test);
    if (!o.forzar && foto.calendarioEn && ahora.getTime() - Date.parse(foto.calendarioEn) < MINUTOS_ENTRE_MIRADAS_AL_CALENDARIO * MINUTO) return false;
    // Se conserva TODO lo que había en la foto (el test, la agenda de HubSpot): solo cambia el sello.
    const cruda = actual.test && typeof actual.test === "object" && !Array.isArray(actual.test) ? (actual.test as Record<string, unknown>) : {};
    await tx.exploracionDeVenta.update({
      where: { id: exploracionId },
      data: { test: { ...cruda, calendarioEn: ahora.toISOString() } as unknown as Prisma.InputJsonValue },
    });
    return true;
  });
  if (!tomado) return NADA;

  const porCalendario = new Map<string, typeof aMirar>();
  for (const s of aMirar) porCalendario.set(s.evento!.calendario, [...(porCalendario.get(s.evento!.calendario) ?? []), s]);
  const ops: Operacion[] = [];
  const revisadoEn = ahora.toISOString();
  // Solo se escribe lo de un evento que sigue teniendo a alguien de la empresa invitado (se calcula una vez).
  let gente: Awaited<ReturnType<typeof genteParaReconocer>> | null = null;
  for (const [calendario, deEste] of porCalendario) {
    const r = await releerEventos(
      calendario,
      deEste.map((s) => s.evento!.id),
    );
    if (!r.ok) continue;
    for (const e of r.datos) {
      const s = deEste.find((x) => x.evento!.id === e.id);
      if (!s?.evento) continue;
      if (e.estado !== "ok") {
        ops.push({ op: "evento", sesionId: s.id, cancelada: true, revisadoEn });
        continue;
      }
      gente ??= await genteParaReconocer(fila.clientId);
      if (!tieneALaEmpresa(e.invitados, gente)) continue;
      const seMovio = Date.parse(e.inicio) !== Date.parse(s.evento.inicio) || (!!e.fin && (!s.evento.fin || Date.parse(e.fin) !== Date.parse(s.evento.fin)));
      const cambioElTitulo = !!e.titulo && e.titulo.slice(0, 300) !== s.evento.titulo;
      if (seMovio || cambioElTitulo) {
        ops.push({
          op: "evento",
          sesionId: s.id,
          inicio: e.inicio,
          ...(e.fin ? { fin: e.fin } : {}),
          ...(cambioElTitulo ? { titulo: e.titulo!.slice(0, 300) } : {}),
          revisadoEn,
        });
      }
    }
  }
  if (!ops.length) return NADA;

  const escala = await escalaParaExplorar();
  if (escala.estado !== "ok") return NADA;
  /* De a una: si entretanto alguien quitó una de las sesiones, las demás se aplican igual. Cada una sobre lo
     último (si otra persona cambió la exploración, se vuelve a intentar una vez). */
  let cambio = false;
  let version = fila.version;
  for (const op of ops) {
    let r = await aplicarCambios(exploracionId, version, [op], escala.general, { eventosDeConfianza: true });
    if (r.estado === "conflicto") r = await aplicarCambios(exploracionId, r.fila.version, [op], escala.general, { eventosDeConfianza: true });
    if (r.estado === "ok") {
      cambio = true;
      version = r.fila.version;
    }
  }
  return { cambio };
}
