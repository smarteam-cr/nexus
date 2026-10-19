/**
 * lib/comunicaciones/compromisos-server.ts — lee los COMPROMISOS de los correos que Smarteam le mandó a un cliente y los
 * deja como propuestas de tarea, por la misma salida que la lectura de cada reunión (lib/tareas/seguimiento.ts y el
 * escritor único de Tareas). SERVER-ONLY. Plan: docs/correos-en-el-contexto-plan.md.
 *
 *   · Solo los correos que la copia dejó `pendiente` (el filtro en código, `motivoDeLaLectura`: enviados, de 14 días o
 *     menos, con una fecha o un compromiso). Cada correo se lee UNA vez: queda `leido` aunque no traiga nada.
 *   · Un error se reintenta hasta 3 veces; una lectura colgada más de 15 minutos vuelve a la cola.
 *   · Contra el presupuesto automático del día: sin presupuesto, espera (lo mira el job antes de llamar).
 *   · Se apaga con `COMPROMISOS_DE_CORREOS_ENABLED=0` (la copia sigue).
 *   · Lo que no es de un cliente o un prospecto no se lee (un aliado, Smarteam).
 *
 * ⛔ El texto del correo NO va a la corrida (`AgentRun.output`): es contenido de la cuenta y la corrida no tiene su regla.
 * Solo las cuentas.
 */
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { getAnthropic } from "@/lib/anthropic";
import { conContextoDeIA } from "@/lib/ai/contexto-de-corrida";
import { rutaDeLaLectura } from "@/lib/lecturas/reglas";
import { cseDeLaCuenta, responsableDeLaPreventaViva } from "@/lib/lecturas/personas";
import { armarPropuestasDeSeguimiento } from "@/lib/tareas/seguimiento";
import { escribirSalidaDeUnCorreo } from "@/lib/tareas/lectura";
import { miembrosActivos } from "@/lib/tareas/servidor";
import { diaCortoConSemana, horaDeCostaRica } from "@/lib/tareas/semana";
import { leerCompromisosDelCorreo, pedidoDeCompromisos, SEGUNDOS_DE_COMPROMISOS, SLUG_DE_COMPROMISOS } from "./compromisos";
import { MAX_INTENTOS_DE_COMPROMISOS } from "./reglas";

const MINUTOS_COLGADA = 15;
/** Cuántos correos se leen por corrida del job. */
export const CORREOS_POR_CORRIDA = 10;

export interface ResultadoDeLosCompromisos {
  leidos: number;
  conCompromisos: number;
  propuestas: number;
  porAsignar: number;
  descartadosPorCita: number;
  errores: number;
  tokens: { entrada: number; salida: number };
}

/** El título con que la tarea dice de dónde salió: «Correo del jue 16 oct «Minuta de la sesión»». */
export function tituloDelCorreo(c: { ocurrioAt: Date; asunto: string | null }): string {
  const dia = diaCortoConSemana(horaDeCostaRica(c.ocurrioAt).fecha);
  return `Correo del ${dia}${c.asunto ? ` «${c.asunto}»` : ""}`;
}

/** Lee hasta `tope` correos pendientes. Nunca lanza por un correo: lo marca con error y sigue. */
export async function leerCompromisosDeCorreos(o: { tope?: number; ahora?: Date } = {}): Promise<ResultadoDeLosCompromisos> {
  const ahora = o.ahora ?? new Date();
  const r: ResultadoDeLosCompromisos = { leidos: 0, conCompromisos: 0, propuestas: 0, porAsignar: 0, descartadosPorCita: 0, errores: 0, tokens: { entrada: 0, salida: 0 } };
  const colgada = new Date(+ahora - MINUTOS_COLGADA * 60_000);
  const candidatos = await prisma.comunicacionDeHubspot.findMany({
    where: {
      tipo: "correo",
      vigente: true,
      OR: [
        { compromisosEstado: "pendiente" },
        { compromisosEstado: "error", compromisosIntentos: { lt: MAX_INTENTOS_DE_COMPROMISOS } },
        { compromisosEstado: "leyendo", copiadoAt: { lt: colgada } },
      ],
    },
    orderBy: { ocurrioAt: "desc" },
    take: o.tope ?? CORREOS_POR_CORRIDA,
    select: { id: true, clientId: true, ocurrioAt: true, asunto: true, texto: true, autorEmail: true, compromisosEstado: true },
  });
  if (!candidatos.length) return r;
  const miembros = await miembrosActivos();
  const emailsDelEquipo = miembros.map((m) => m.email);

  for (const c of candidatos) {
    // Tomar la fila: si otra corrida la tomó primero, no se lee dos veces. `copiadoAt` marca cuándo se tomó.
    const tomada = await prisma.comunicacionDeHubspot.updateMany({
      where: { id: c.id, compromisosEstado: c.compromisosEstado },
      data: { compromisosEstado: "leyendo", copiadoAt: ahora },
    });
    if (tomada.count !== 1) continue;
    const marcar = (estado: "leido" | "error" | "no_aplica", error: string | null = null) =>
      prisma.comunicacionDeHubspot.update({
        where: { id: c.id },
        data: {
          compromisosEstado: estado,
          compromisosError: error,
          compromisosLeidoAt: estado === "leido" ? ahora : null,
          ...(estado === "error" ? { compromisosIntentos: { increment: 1 } } : {}),
        },
      });
    const cliente = await prisma.client.findUnique({ where: { id: c.clientId }, select: { id: true, name: true, kind: true } });
    const ruta = rutaDeLaLectura(cliente?.kind);
    if (!cliente || !ruta || !c.texto) {
      await marcar("no_aplica");
      continue;
    }
    const autor = c.autorEmail ? (miembros.find((m) => m.email.toLowerCase() === c.autorEmail)?.nombre ?? c.autorEmail) : null;
    const correo = { empresa: cliente.name, autor, ocurrioAt: c.ocurrioAt, asunto: c.asunto, texto: c.texto };
    const run = await prisma.agentRun.create({
      data: {
        agentSlug: SLUG_DE_COMPROMISOS,
        status: "RUNNING",
        triggeredByEmail: null,
        clientId: cliente.id,
        stepLabel: "Leer los compromisos de un correo",
        currentPhase: "Leyendo el correo",
      },
      select: { id: true },
    });
    try {
      const respuesta = await conContextoDeIA({ agentSlug: SLUG_DE_COMPROMISOS, agentRunId: run.id, triggeredByEmail: null, origen: `comunicacion:${c.id}` }, () =>
        getAnthropic().messages.create(pedidoDeCompromisos(correo, emailsDelEquipo), { timeout: SEGUNDOS_DE_COMPROMISOS * 1_000, maxRetries: 0 }),
      );
      r.tokens.entrada += respuesta.usage?.input_tokens ?? 0;
      r.tokens.salida += respuesta.usage?.output_tokens ?? 0;
      const leidos = leerCompromisosDelCorreo(respuesta, correo);
      if (!leidos) {
        r.errores++;
        await marcar("error", "La respuesta no trajo la herramienta o se cortó.");
        await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: JSON.stringify({ motivo: "salida_invalida" }), currentPhase: null } }).catch(() => undefined);
        continue;
      }
      r.leidos++;
      r.descartadosPorCita += leidos.descartadosPorCita;
      let escritas = { propuestas: 0, porAsignar: 0 };
      if (leidos.compromisos.length) {
        r.conCompromisos++;
        const [cseCuenta, preventa] = await Promise.all([
          ruta === "completa" ? cseDeLaCuenta(cliente.id) : Promise.resolve(null),
          ruta === "prospecto" ? responsableDeLaPreventaViva(cliente.id) : Promise.resolve(undefined),
        ]);
        const armado = armarPropuestasDeSeguimiento({
          compromisos: leidos.compromisos,
          lectura: { id: c.id, equipo: ruta === "prospecto" ? "ventas" : "cs" },
          reunion: { id: c.id, inicio: c.ocurrioAt, participantes: c.autorEmail ? [c.autorEmail] : [] },
          miembros,
          cseDelProyecto: null,
          cseDeLaCuenta: cseCuenta,
          ...(ruta === "prospecto" ? { responsableDeLaPreventa: preventa } : {}),
          clientId: cliente.id,
          empresa: cliente.name,
          projectId: null,
          ruta,
          fuente: { tipo: "correo", asunto: c.asunto, autorEmail: c.autorEmail },
        });
        escritas = await escribirSalidaDeUnCorreo({ id: c.id, titulo: tituloDelCorreo(c) }, armado.propuestas, ahora);
        r.propuestas += escritas.propuestas;
        r.porAsignar += escritas.porAsignar;
      }
      await marcar("leido");
      await prisma.agentRun
        .update({
          where: { id: run.id },
          data: {
            status: "DONE",
            // Solo las cuentas: ni el texto del correo ni las citas.
            output: JSON.stringify({ compromisos: leidos.compromisos.length, descartadosPorCita: leidos.descartadosPorCita, ...escritas, ruta }),
            currentPhase: null,
          },
        })
        .catch(() => undefined);
    } catch (e) {
      r.errores++;
      const msg = (e instanceof Error ? e.message : String(e)).slice(0, 500);
      await marcar("error", msg).catch(() => undefined);
      await prisma.agentRun.update({ where: { id: run.id }, data: { status: "ERROR", output: msg, currentPhase: null } }).catch(() => undefined);
    }
  }
  return r;
}
