/**
 * lib/encuestas-de-cuenta/servidor.ts — lo que lee y escribe las preguntas sobre la cuenta. SERVIDOR.
 *
 * ⚠ RespuestaDeCuenta es APPEND-ONLY: acá solo se crea. Nada actualiza ni borra una fila (lo vigila
 * lib/encuestas-de-cuenta/guardas.test.ts): la historia de cómo cambió la lectura de cada cliente es el dato.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { esquemaDesactualizado, modeloDisponible } from "@/lib/db/esquema";
import { esClienteDeCartera } from "@/lib/clients/kind";
import {
  PREGUNTAS_SOBRE_LA_CUENTA,
  preguntaDe,
  type EventoDeRespuesta,
  type PreguntaParaMostrar,
  type PreguntaSobreLaCuenta,
  type ValorDeRespuesta,
} from "./preguntas";
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


/**
 * La pregunta que le toca a esta persona al entrar a este cliente, o null. Solo a los roles de la pregunta, solo en
 * clientes de la cartera (no prospectos, aliados ni Smarteam) y solo si está activa. Nunca lanza por falta de tablas:
 * sin ellas, no pregunta.
 */
export async function preguntaPendiente(args: { clientId: string; email: string; rol: string | null; ahora?: Date }): Promise<PreguntaParaMostrar | null> {
  if (!preguntasDeCuentaDisponible() || !args.rol) return null;
  try {
    const cliente = await prisma.client.findUnique({ where: { id: args.clientId }, select: { kind: true, name: true } });
    if (!cliente || !esClienteDeCartera(cliente.kind)) return null;
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
        return { clave: p.clave, version: p.version, pregunta: p.pregunta, descripcion: p.descripcion, respuestas: p.respuestas, motivo: d.motivo, cliente: cliente.name };
      }
    }
    return null;
  } catch (e) {
    if (esquemaDesactualizado(e)) return null;
    throw e;
  }
}

export interface EventoNuevo {
  clientId: string;
  email: string;
  rol: string | null;
  motivoDeAcceso: string | null;
  clave: string;
  evento: EventoDeRespuesta;
  valor?: ValorDeRespuesta | null;
  porQue?: string | null;
  ruta?: string | null;
}

/** Guarda un evento. Valida que la pregunta exista, que la persona sea de sus roles y que el cliente sea de la cartera. */
export async function registrarEvento(e: EventoNuevo): Promise<{ guardado: boolean }> {
  if (!preguntasDeCuentaDisponible()) {
    throw new ErrorDePreguntas(503, `Las preguntas sobre la cuenta todavía no están disponibles: falta aplicar ${SQL_DE_PREGUNTAS_DE_CUENTA}.`);
  }
  const p = preguntaDe(e.clave);
  if (!p) throw new ErrorDePreguntas(400, "Esa pregunta no existe.");
  if (!e.rol || !p.roles.includes(e.rol)) throw new ErrorDePreguntas(403, "Esta pregunta es para Customer Success.");
  if (e.evento === "respondida" && !e.valor) throw new ErrorDePreguntas(400, "Falta la respuesta.");
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
