/**
 * lib/nexus-chat/aplicar-server.ts — APLICAR la lista del chat de Nexus, con el clic de la persona. SERVER-ONLY.
 *
 * ⛔ El servidor LEE la lista del hilo de esa persona en esa cuenta: el navegador manda solo el turno y lo desmarcado.
 * Cada cambio se vuelve a preparar (acotado a la cuenta y validado contra hoy): si alguno ya no se puede, no se aplica
 * NADA y se dice cuál (422). Después se aplica en orden por la capa de operaciones, cada uno por el escritor único de su
 * módulo (Tareas, notas, siguiente paso); si uno falla, se corta ahí y se dice qué quedó y qué no.
 *
 * El desenlace se escribe en el hilo (`agregarTurno`, el único escritor de mensajes): con algo aplicado, el desenlace es
 * OK y la lista se cierra (lo que falló se pide de nuevo: volver a aplicar duplicaría lo que ya entró).
 *
 * ⚠ Dos clics a la vez, o un clic mientras corre un turno: el candado es EN MEMORIA, por hilo, y lo comparte con el
 * turno (./candado-server.ts; la app corre en una sola instancia, docs/RUNBOOK.md invariante #1). El hilo se VUELVE A
 * LEER después de tomarlo: el segundo clic ve el desenlace del primero y responde «Ya estaba aplicado». Los escritores
 * abren su propia transacción y no se pueden juntar en una sola con el desenlace.
 */
import "server-only";
import type { TeamMember } from "@prisma/client";
import { agregarTurno, hiloVivo, leerHilo } from "@/lib/asistente/hilo";
import { marcaDeDesenlace } from "@/lib/asistente/acuerdo";
import { estadosDeAcuerdo } from "@/lib/asistente/acuerdo-vivo";
import { aplicarOperaciones, type OperacionPreparada } from "@/lib/operaciones/ejecutar";
import { PIEZA_NEXUS } from "./constantes";
import { tomarHilo } from "./candado-server";
import { cambiosDelAcuerdo } from "./libro";
import { contextoDelChat, NOTA_DE_LA_CUENTA, operacionesDelChat, prepararParaLaCuenta } from "./herramientas-server";
import { textoDelDesenlace } from "./textos";

export class ErrorDelChat extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface ResultadoDeAplicar {
  yaEstaba: boolean;
  aplicadas: number;
  fallo: { linea: string; motivo: string } | null;
  sinIntentar: number;
  desenlace: string;
  /** Los cambios que se aplicaron, por su lugar en la lista (los desmarcados y los que no llegaron, no). */
  renglones?: number[];
}

export async function aplicarListaDeNexus(o: {
  persona: TeamMember;
  veMontos: boolean;
  clientId: string;
  usuarioEmail: string;
  turnoId: string;
  desmarcadas: readonly number[];
  ahora?: Date;
}): Promise<ResultadoDeAplicar> {
  const vivo = await hiloVivo({ dueno: { clientId: o.clientId }, pieza: PIEZA_NEXUS, usuarioEmail: o.usuarioEmail });
  if (!vivo) throw new ErrorDelChat(404, "Esa lista no es de tu conversación sobre esta cuenta.");
  const soltar = tomarHilo(vivo.id);
  if (!soltar) throw new ErrorDelChat(409, "Nexus está terminando algo en esta conversación: espera un momento y vuelve a aplicar.");
  try {
    // Releído CON el candado: lo leído antes pudo cambiar (otro clic ya aplicó, un turno dejó otra lista).
    const hilo = await leerHilo(vivo.id, { clientId: o.clientId }, o.usuarioEmail);
    const i = hilo ? hilo.turnos.findIndex((t) => t.id === o.turnoId) : -1;
    // Solo un mensaje del asistente trae una lista: uno de la persona nunca se aplica, aunque traiga el marcador.
    if (!hilo || i < 0 || hilo.turnos[i].rol !== "ASISTENTE") throw new ErrorDelChat(404, "Esa lista no es de tu conversación sobre esta cuenta.");
    const estado = estadosDeAcuerdo(hilo.turnos)[i];
    if (estado === "aplicado") return { yaEstaba: true, aplicadas: 0, fallo: null, sinIntentar: 0, desenlace: "" };
    if (estado !== "vivo") throw new ErrorDelChat(409, "Esa lista ya no está vigente: mira la más reciente.");
    const leido = cambiosDelAcuerdo(hilo.turnos[i].contenido);
    if (!leido) throw new ErrorDelChat(409, "Ese mensaje no trae cambios para aplicar.");

    const r = await aplicarCambiosALaCuenta({ ...o, cambios: leido.cambios, claveDeLaTarea: (k) => `n:${o.turnoId}:${k}` });
    // Con algo aplicado, la lista se cierra (OK). Sin nada, sigue viva para reintentar.
    await agregarTurno(hilo.id, { rol: "ASISTENTE", contenido: `${marcaDeDesenlace({ ok: r.aplicadas > 0 })}\n\n${r.desenlace}`, shaDeContexto: null });
    return r;
  } finally {
    soltar();
  }
}

/**
 * EL CORAZÓN DE «APLICAR», sin saber de dónde salió la lista (24 nov: lo comparten el hilo de la cuenta y la conversación
 * de la preventa, lib/exploraciones/nexus-en-la-preventa-server.ts). `cambios` los leyó el SERVIDOR de su conversación,
 * nunca el navegador. Lo desmarcado no se aplica. Todo se vuelve a preparar contra hoy (acotado a la cuenta y con el
 * permiso de cada operación): si algo ya no se puede, no se aplica NADA (422). Después, en orden, por el escritor de cada
 * módulo; si uno falla se corta ahí. `claveDeLaTarea(k)`: la clave de la tarea del lugar k, así aplicar dos veces no la
 * duplica. No escribe el desenlace: eso es de quien guarda la conversación.
 */
export async function aplicarCambiosALaCuenta(o: {
  persona: TeamMember;
  veMontos: boolean;
  clientId: string;
  cambios: ReadonlyArray<{ nombre: string; entrada: unknown }>;
  desmarcadas: readonly number[];
  claveDeLaTarea: (k: number) => string;
  /**
   * Desde la preventa: una nota de la cuenta (va a HubSpot) no se aplica aunque viniera en la lista. La mano de la cuenta no
   * la ofrece; esto la frena también si una lista guardada la trajera (lo que se cuenta va a «Lo que sabes del cliente»).
   */
  sinNotasDeLaCuenta?: boolean;
  ahora?: Date;
}): Promise<ResultadoDeAplicar> {
  const fuera = new Set(o.desmarcadas.filter((x) => Number.isInteger(x) && x >= 0 && x < o.cambios.length));
  const marcados = o.cambios.map((c, k) => ({ c, k })).filter(({ k }) => !fuera.has(k));
  if (!marcados.length) throw new ErrorDelChat(400, "No quedó nada marcado para aplicar.");
  if (o.sinNotasDeLaCuenta && marcados.some(({ c }) => c.nombre === NOTA_DE_LA_CUENTA)) {
    throw new ErrorDelChat(422, "En la preventa no se guardan notas de la cuenta: cuéntaselo a Nexus y va a «Lo que sabes del cliente». No se aplicó nada.");
  }

  // Se vuelve a preparar todo: lo que cambió desde que se propuso, o ya no es de esta cuenta, no se aplica.
  const ctx = contextoDelChat(o.persona, o.veMontos, o.ahora ?? new Date());
  const preparadas: OperacionPreparada[] = [];
  const problemas: string[] = [];
  for (const { c, k } of marcados) {
    const r = await prepararParaLaCuenta(ctx, o.clientId, c.nombre, c.entrada);
    // Una tarea creada desde el chat lleva su clave (el turno y su lugar en la lista): aplicar dos veces no la duplica.
    const datos = r.ok && c.nombre === "tarea.crear" ? { ...(r.datos as object), origenId: o.claveDeLaTarea(k), origen: "chat" } : r.ok ? r.datos : null;
    if (r.ok) preparadas.push({ nombre: c.nombre, datos, linea: r.cambio.linea });
    else problemas.push(r.motivo);
  }
  if (problemas.length) {
    throw new ErrorDelChat(422, `Algo cambió desde que se propuso y no se aplicó nada: ${problemas.slice(0, 3).join(" · ")}. Pídele a Nexus que lo ajuste.`);
  }

  const a = await aplicarOperaciones(operacionesDelChat(), ctx, preparadas);
  const desenlace = textoDelDesenlace({ aplicadas: a.aplicadas.map((x) => x.nombre), fallo: a.fallo, sinIntentar: a.sinIntentar });
  // Se aplican en orden y se corta en el primero que falla: los aplicados son los primeros marcados.
  const renglones = marcados.slice(0, a.aplicadas.length).map(({ k }) => k);
  return { yaEstaba: false, aplicadas: a.aplicadas.length, fallo: a.fallo ? { linea: a.fallo.linea, motivo: a.fallo.motivo } : null, sinIntentar: a.sinIntentar, desenlace, renglones };
}
