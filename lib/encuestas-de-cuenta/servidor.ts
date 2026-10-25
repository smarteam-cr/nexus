/**
 * lib/encuestas-de-cuenta/servidor.ts — lo que lee y escribe las preguntas sobre la cuenta. SERVIDOR.
 *
 * ⚠ RespuestaDeCuenta es APPEND-ONLY: acá solo se crea. Nada actualiza ni borra una fila (lo vigila
 * lib/encuestas-de-cuenta/guardas.test.ts): la historia de cómo cambió la lectura de cada cliente es el dato.
 *
 * Dos tipos de pregunta: la de Sí o No de Customer Success (preguntas.ts) y lo que falta de los datos de la empresa
 * (preguntas-de-datos.ts, R2 etapa 3, 2026-10-25), cuya respuesta pasa por el motor de los datos y de ahí a HubSpot.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { esClienteDeCartera } from "@/lib/clients/kind";
import { esFuenteDeDato, SELECT_DE_LOS_DATOS } from "@/lib/clients/datos-de-la-empresa";
import { datosDeLaFila, decidirPropuesta, proponerDato, valorDeLaFila, type ResultadoDelDato } from "@/lib/clients/datos-de-la-empresa-server";
import { escribirEnHubspot } from "@/lib/clients/escritura-en-hubspot-server";
import type { EstadoDeLaEscritura } from "@/lib/clients/escritura-en-hubspot";
import {
  PREGUNTAS_SOBRE_LA_CUENTA,
  preguntaDe,
  VALORES_DE_RESPUESTA,
  type EventoDeRespuesta,
  type PreguntaParaMostrar,
  type PreguntaSobreLaCuenta,
} from "./preguntas";
import {
  esClaveDeDato,
  esRespuestaValida,
  faltaElDato,
  NO_SE,
  PREFIJO_DE_DATO,
  PREGUNTAS_DE_DATOS,
  preguntaDeDato,
  propuestaDeNexus,
  respuestasDelDato,
  textoDeLaPregunta,
  type PreguntaDeDato,
  type PropuestaPendiente,
} from "./preguntas-de-datos";
import { csvDeEventos, decidirSiPreguntar, resultadosDe, type Resultados } from "./reglas";

export const SQL_DE_PREGUNTAS_DE_CUENTA = "scripts/sql/2026-10-13-preguntas-sobre-la-cuenta.sql";

/** Sin las tablas (falta el SQL o reiniciar con el cliente nuevo) no se pregunta nada. */
export function preguntasDeCuentaDisponible(): boolean {
  return modeloDisponible(prisma.encuestaDeCuenta) && modeloDisponible(prisma.respuestaDeCuenta);
}

export class ErrorDePreguntas extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Mientras se pide, quien responde no tiene que esperar a la base: una «mostrada» repetida en estas horas no se guarda. */
const HORAS_ENTRE_MOSTRADAS = 12;

async function activas(): Promise<Map<string, boolean>> {
  const filas = await prisma.encuestaDeCuenta.findMany({ select: { clave: true, activa: true } });
  const guardadas = new Map(filas.map((f) => [f.clave, f.activa]));
  return new Map(PREGUNTAS_SOBRE_LA_CUENTA.map((p) => [p.clave, guardadas.get(p.clave) ?? p.activaPorDefecto]));
}


/** Las de datos se le preguntan a una empresa que se atiende o se le vende: clientes y prospectos. */
const KINDS_DE_DATOS: ReadonlySet<string> = new Set(["CLIENTE", "PROSPECTO"]);

/**
 * La pregunta que le toca a esta persona al entrar a este cliente, o null. Primero la de Sí o No (solo a sus roles, solo
 * en clientes de la cartera y solo si está activa); después, si la persona puede decidir los datos de la empresa
 * (`clientes.decidirDatos`), lo que falta de ellos, de a uno. Nunca lanza por falta de tablas: sin ellas, no pregunta.
 */
export async function preguntaPendiente(args: {
  clientId: string;
  email: string;
  rol: string | null;
  puedeDecidirDatos?: boolean;
  ahora?: Date;
}): Promise<PreguntaParaMostrar | null> {
  if (!preguntasDeCuentaDisponible() || !args.rol) return null;
  try {
    const cliente = await prisma.client.findUnique({ where: { id: args.clientId }, select: { kind: true, name: true } });
    if (!cliente) return null;
    if (!esClienteDeCartera(cliente.kind)) {
      return args.puedeDecidirDatos && KINDS_DE_DATOS.has(cliente.kind) ? await siguientePreguntaDeDato(args.clientId, cliente.name, args.email, args.ahora) : null;
    }
    const estado = await activas();
    const email = args.email.toLowerCase();
    for (const p of PREGUNTAS_SOBRE_LA_CUENTA) {
      if (!estado.get(p.clave) || !p.roles.includes(args.rol)) continue;
      const eventos = await prisma.respuestaDeCuenta.findMany({
        where: { clave: p.clave, clientId: args.clientId, personaEmail: email, evento: { in: ["respondida", "ahora_no"] } },
        select: { evento: true, valor: true, preguntaVersion: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      });
      const d = decidirSiPreguntar(p, eventos, args.ahora ?? new Date());
      if (d.preguntar) {
        return {
          clave: p.clave,
          version: p.version,
          pregunta: p.pregunta,
          descripcion: p.descripcion,
          respuestas: p.respuestas,
          tipo: "si-no",
          propuesta: null,
          motivo: d.motivo,
          cliente: cliente.name,
        };
      }
    }
    return args.puedeDecidirDatos ? await siguientePreguntaDeDato(args.clientId, cliente.name, args.email, args.ahora) : null;
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

/**
 * Lo primero que falta de los datos de la empresa y que toca preguntarle a esta persona hoy, con lo que Nexus propone.
 * Un «Ahora no» a cualquiera de ellas calla a todas por unos días: no es una por día hasta agotar la lista.
 */
async function siguientePreguntaDeDato(clientId: string, cliente: string, emailCrudo: string, ahora = new Date()): Promise<PreguntaParaMostrar | null> {
  const email = emailCrudo.toLowerCase();
  const [fila, eventos, pendientes] = await Promise.all([
    prisma.client.findUnique({ where: { id: clientId }, select: SELECT_DE_LOS_DATOS }),
    prisma.respuestaDeCuenta.findMany({
      where: { clientId, personaEmail: email, clave: { startsWith: PREFIJO_DE_DATO }, evento: { in: ["respondida", "ahora_no"] } },
      select: { clave: true, evento: true, valor: true, preguntaVersion: true, createdAt: true },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.propuestaDeDato.findMany({
      where: { clientId, estado: "pendiente", campo: { in: PREGUNTAS_DE_DATOS.map((q) => q.dato) } },
      orderBy: { createdAt: "desc" },
      select: { campo: true, valor: true, fuente: true, cita: true },
    }),
  ]);
  if (!fila) return null;
  const ultimoAhoraNo = eventos.find((e) => e.evento === "ahora_no");
  const silencio = Math.max(0, ...PREGUNTAS_DE_DATOS.map((q) => q.diasParaVolverConAhoraNo)) * 86_400_000;
  if (ultimoAhoraNo && ahora.getTime() - ultimoAhoraNo.createdAt.getTime() < silencio) return null;
  const datos = datosDeLaFila(fila as Record<string, unknown>);
  for (const q of PREGUNTAS_DE_DATOS) {
    const hoy = datos[q.dato];
    if (!faltaElDato(hoy)) continue;
    const d = decidirSiPreguntar(
      q,
      eventos.filter((e) => e.clave === q.clave),
      ahora,
    );
    if (!d.preguntar) continue;
    const suyas: PropuestaPendiente[] = pendientes.flatMap((x) => (x.campo === q.dato && esFuenteDeDato(x.fuente) ? [{ valor: valorDeLaFila(x.valor), fuente: x.fuente, cita: x.cita }] : []));
    return {
      clave: q.clave,
      version: q.version,
      pregunta: textoDeLaPregunta(q, cliente),
      descripcion: q.descripcion,
      respuestas: respuestasDelDato(q),
      tipo: "dato",
      propuesta: propuestaDeNexus(q, hoy, suyas),
      motivo: d.motivo,
      cliente,
    };
  }
  return null;
}

/**
 * La respuesta a una pregunta de datos, al motor: si es lo que proponía una propuesta que espera, se USA esa propuesta
 * (queda de dónde salió la idea); si no, la persona lo decide (fuente `persona`). Después, a HubSpot (con la bandera).
 */
async function aplicarRespuestaDeDato(a: { clientId: string; q: PreguntaDeDato; valor: string; teamMemberId: string; porQue: string | null }): Promise<EstadoDeLaEscritura | undefined> {
  // Si mientras la pregunta estaba abierta alguien lo confirmó (en la ficha, en HubSpot), la respuesta no lo pisa: queda
  // guardada como respuesta, y el dato como estaba.
  const fila = await prisma.client.findUnique({ where: { id: a.clientId }, select: SELECT_DE_LOS_DATOS });
  if (fila && !faltaElDato(datosDeLaFila(fila as Record<string, unknown>)[a.q.dato])) return undefined;
  const pendiente = (
    await prisma.propuestaDeDato.findMany({
      where: { clientId: a.clientId, campo: a.q.dato, estado: "pendiente" },
      orderBy: { createdAt: "desc" },
      select: { id: true, valor: true },
    })
  ).find((x) => valorDeLaFila(x.valor) === a.valor);
  const r: ResultadoDelDato[] = pendiente
    ? await decidirPropuesta({ clientId: a.clientId, propuestaId: pendiente.id, decision: { accion: "usar" }, decidePorId: a.teamMemberId })
    : await proponerDato({
        clientId: a.clientId,
        clave: a.q.dato,
        valor: a.valor,
        fuente: "persona",
        autorId: a.teamMemberId,
        cita: a.porQue ?? "Lo respondió en la pregunta sobre la cuenta.",
        puedeDecidir: true,
      });
  return escribirEnHubspot(a.clientId, r);
}

/** Un evento de una pregunta de datos: lo valida, deja el dato si es una respuesta, y guarda el evento. */
async function registrarEventoDeDato(e: EventoNuevo): Promise<{ guardado: boolean; hubspot?: EstadoDeLaEscritura; yaEstaba?: boolean }> {
  const q = preguntaDeDato(e.clave);
  if (!q) throw new ErrorDePreguntas(400, "Esa pregunta no existe.");
  if (!e.puedeDecidirDatos || !e.teamMemberId) throw new ErrorDePreguntas(403, "Esta pregunta es para quien decide los datos de la empresa.");
  if (e.evento === "respondida" && (!e.valor || !esRespuestaValida(q, e.valor))) throw new ErrorDePreguntas(400, "Esa respuesta no es una de las opciones.");
  const cliente = await prisma.client.findUnique({ where: { id: e.clientId }, select: { name: true, kind: true } });
  if (!cliente) throw new ErrorDePreguntas(404, "No existe ese cliente.");
  if (!KINDS_DE_DATOS.has(cliente.kind)) throw new ErrorDePreguntas(409, "Esta pregunta es solo para clientes y prospectos.");
  const email = e.email.toLowerCase();
  if (e.evento === "mostrada" && (await mostradaReciente(q.clave, e.clientId, email))) return { guardado: false };

  const porQue = e.evento === "respondida" ? e.porQue?.trim() || null : null;
  // Primero el dato: si el motor lo rechaza, la respuesta no queda guardada como si hubiera servido.
  const aplicada =
    e.evento === "respondida" && e.valor !== NO_SE ? await aplicarRespuestaDeDato({ clientId: e.clientId, q, valor: e.valor!, teamMemberId: e.teamMemberId, porQue }) : null;
  await prisma.respuestaDeCuenta.create({
    data: {
      clave: q.clave,
      preguntaVersion: q.version,
      preguntaTexto: textoDeLaPregunta(q, cliente.name),
      clientId: e.clientId,
      clientNombre: cliente.name,
      personaEmail: email,
      rol: e.rol,
      motivoDeAcceso: e.motivoDeAcceso,
      evento: e.evento,
      valor: e.evento === "respondida" ? e.valor! : null,
      porQue,
      contexto: e.ruta ? { ruta: e.ruta } : undefined,
    },
  });
  return { guardado: true, ...(aplicada === undefined ? { yaEstaba: true } : aplicada ? { hubspot: aplicada } : {}) };
}

async function mostradaReciente(clave: string, clientId: string, email: string): Promise<boolean> {
  const reciente = await prisma.respuestaDeCuenta.findFirst({
    where: { clave, clientId, personaEmail: email, evento: "mostrada", createdAt: { gte: new Date(Date.now() - HORAS_ENTRE_MOSTRADAS * 3_600_000) } },
    select: { id: true },
  });
  return !!reciente;
}

export interface EventoNuevo {
  clientId: string;
  email: string;
  rol: string | null;
  motivoDeAcceso: string | null;
  clave: string;
  evento: EventoDeRespuesta;
  /** si · no · no_se en la de Sí o No; una opción del dato o no_se en las de datos. */
  valor?: string | null;
  porQue?: string | null;
  ruta?: string | null;
  /** Para las de datos: quién responde y si puede decidir los datos de la empresa (`clientes.decidirDatos`). */
  teamMemberId?: string | null;
  puedeDecidirDatos?: boolean;
}

/**
 * Guarda un evento. Valida que la pregunta exista, que la persona pueda responderla y que la empresa sea de las que se
 * preguntan. Una respuesta a una pregunta de datos además deja el dato (y lo escribe en HubSpot, con la bandera).
 */
export async function registrarEvento(e: EventoNuevo): Promise<{ guardado: boolean; hubspot?: EstadoDeLaEscritura; yaEstaba?: boolean }> {
  if (!preguntasDeCuentaDisponible()) {
    throw new ErrorDePreguntas(503, `Las preguntas sobre la cuenta todavía no están disponibles: falta aplicar ${SQL_DE_PREGUNTAS_DE_CUENTA}.`);
  }
  if (esClaveDeDato(e.clave)) return registrarEventoDeDato(e);
  const p = preguntaDe(e.clave);
  if (!p) throw new ErrorDePreguntas(400, "Esa pregunta no existe.");
  if (!e.rol || !p.roles.includes(e.rol)) throw new ErrorDePreguntas(403, "Esta pregunta es para Customer Success.");
  if (e.evento === "respondida" && !e.valor) throw new ErrorDePreguntas(400, "Falta la respuesta.");
  if (e.evento === "respondida" && !(VALORES_DE_RESPUESTA as readonly string[]).includes(e.valor!)) throw new ErrorDePreguntas(400, "Esa respuesta no es una de las opciones.");
  const cliente = await prisma.client.findUnique({ where: { id: e.clientId }, select: { name: true, kind: true } });
  if (!cliente) throw new ErrorDePreguntas(404, "No existe ese cliente.");
  if (!esClienteDeCartera(cliente.kind)) throw new ErrorDePreguntas(409, "Esta pregunta es solo para clientes.");
  const email = e.email.toLowerCase();

  if (e.evento === "mostrada") {
    const reciente = await prisma.respuestaDeCuenta.findFirst({
      where: {
        clave: p.clave,
        clientId: e.clientId,
        personaEmail: email,
        evento: "mostrada",
        createdAt: { gte: new Date(Date.now() - HORAS_ENTRE_MOSTRADAS * 3_600_000) },
      },
      select: { id: true },
    });
    if (reciente) return { guardado: false };
  }

  const porQue = e.evento === "respondida" ? e.porQue?.trim() || null : null;
  await prisma.respuestaDeCuenta.create({
    data: {
      clave: p.clave,
      preguntaVersion: p.version,
      preguntaTexto: p.pregunta,
      clientId: e.clientId,
      clientNombre: cliente.name,
      personaEmail: email,
      rol: e.rol,
      motivoDeAcceso: e.motivoDeAcceso,
      evento: e.evento,
      valor: e.evento === "respondida" ? e.valor! : null,
      porQue,
      contexto: e.ruta ? { ruta: e.ruta } : undefined,
    },
  });
  return { guardado: true };
}

export interface ResumenDePregunta {
  clave: string;
  version: number;
  pregunta: string;
  descripcion: string;
  respuestas: PreguntaSobreLaCuenta["respuestas"];
  roles: readonly string[];
  diasParaVolverConNoSe: number;
  activa: boolean;
  actualizadaPorEmail: string | null;
  actualizadaAt: string | null;
  resultados: Resultados;
  /** Cuántas veces se mostró y cuántas se dejó para después (todas las versiones): ¿la gente la contesta? */
  mostrada: number;
  ahoraNo: number;
  /** El nombre de cada persona que respondió, por correo (quien ya no está en el equipo sale con su correo). */
  nombres: Record<string, string>;
}

/** Lo que ve dirección en Feedback › Encuestas › Sobre los clientes. */
export async function resumenDePreguntas(): Promise<ResumenDePregunta[]> {
  const filas = await prisma.encuestaDeCuenta.findMany({ select: { clave: true, activa: true, actualizadaPorEmail: true, updatedAt: true } });
  const porClave = new Map(filas.map((f) => [f.clave, f]));
  const salida: ResumenDePregunta[] = [];
  for (const p of PREGUNTAS_SOBRE_LA_CUENTA) {
    const [respuestas, conteo] = await Promise.all([
      prisma.respuestaDeCuenta.findMany({
        where: { clave: p.clave, evento: "respondida" },
        select: { clientId: true, clientNombre: true, personaEmail: true, rol: true, motivoDeAcceso: true, valor: true, porQue: true, preguntaVersion: true, createdAt: true },
      }),
      prisma.respuestaDeCuenta.groupBy({ by: ["evento"], where: { clave: p.clave, evento: { in: ["mostrada", "ahora_no"] } }, _count: { _all: true } }),
    ]);
    const fila = porClave.get(p.clave);
    const correos = [...new Set(respuestas.map((r) => r.personaEmail))];
    const equipo = correos.length
      ? await prisma.teamMember.findMany({ where: { email: { in: correos, mode: "insensitive" } }, select: { email: true, name: true } })
      : [];
    salida.push({
      clave: p.clave,
      version: p.version,
      pregunta: p.pregunta,
      descripcion: p.descripcion,
      respuestas: p.respuestas,
      roles: p.roles,
      diasParaVolverConNoSe: p.diasParaVolverConNoSe,
      activa: fila?.activa ?? p.activaPorDefecto,
      actualizadaPorEmail: fila?.actualizadaPorEmail ?? null,
      actualizadaAt: fila?.updatedAt.toISOString() ?? null,
      resultados: resultadosDe(
        p,
        respuestas.map((r) => ({ ...r, valor: r.valor ?? "no_se" })),
      ),
      mostrada: conteo.find((c) => c.evento === "mostrada")?._count._all ?? 0,
      ahoraNo: conteo.find((c) => c.evento === "ahora_no")?._count._all ?? 0,
      nombres: Object.fromEntries(equipo.map((m) => [m.email.toLowerCase(), m.name])),
    });
  }
  return salida;
}

export async function cambiarActiva(clave: string, activa: boolean, email: string): Promise<void> {
  if (!preguntaDe(clave)) throw new ErrorDePreguntas(400, "Esa pregunta no existe.");
  await prisma.encuestaDeCuenta.upsert({
    where: { clave },
    create: { clave, activa, actualizadaPorEmail: email.toLowerCase() },
    update: { activa, actualizadaPorEmail: email.toLowerCase() },
  });
}

/** Todos los eventos de todas las preguntas, en CSV. */
export async function csvDePreguntasDeCuenta(clave?: string): Promise<string> {
  const eventos = await prisma.respuestaDeCuenta.findMany({
    where: clave ? { clave } : {},
    select: {
      createdAt: true,
      clave: true,
      preguntaVersion: true,
      preguntaTexto: true,
      clientId: true,
      clientNombre: true,
      personaEmail: true,
      rol: true,
      motivoDeAcceso: true,
      evento: true,
      valor: true,
      porQue: true,
    },
    orderBy: { createdAt: "asc" },
  });
  return csvDeEventos(eventos);
}
