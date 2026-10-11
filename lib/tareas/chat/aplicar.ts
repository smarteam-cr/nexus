/**
 * lib/tareas/chat/aplicar.ts — aplicar lo que se acordó en el chat de tareas (docs/tareas-plan.md §6.5). SERVIDOR.
 *
 * ⛔ El servidor LEE el acuerdo del hilo de esa persona: no acepta operaciones que mande el navegador. Del navegador
 * llegan solo el turno y lo que se desmarcó, y el cierre de lo desmarcado (lo que depende de algo desmarcado también
 * sale) se recalcula acá. Después revalida contra la foto de hoy (si algo ya no entra, 422 sin escribir: el libro lo
 * conserva) y aplica todo o nada por mutaciones.ts, que escribe el desenlace en la misma transacción.
 */
import "server-only";
import { hiloVivo } from "@/lib/asistente/hilo";
import { leerAcuerdo } from "@/lib/asistente/acuerdo";
import { estadosDeAcuerdo } from "@/lib/asistente/acuerdo-vivo";
import { arrastreDeDesmarcadas } from "@/lib/asistente/arrastre";
import { notaDeDescarte } from "@/lib/asistente/desenlace";
import { PIEZA_TAREAS } from "@/lib/asistente/piezas";
import { aplicarAcuerdoDelChat, type ResultadoDelAcuerdo } from "../mutaciones";
import { ErrorDeTareas, type ContextoDeTareas } from "../servidor";
import type { ClientesQueVes } from "../clientes";
import { contextoDelChatDeTareas } from "./contexto";
import { describirOperacionesDeTareas } from "./lineas";
import {
  acuerdoBienFormado,
  dependenciasDeOperacionesDeTareas,
  OPERACIONES_DE_TAREAS,
  podarOperacionesDeTareas,
  referenciasDeOperaciones,
  type OperacionDeTareas,
} from "./operaciones";

export async function aplicarDelChat(
  quien: { ctx: ContextoDeTareas; clientes: ClientesQueVes },
  usuarioEmail: string,
  turnoId: string,
  desmarcadas: readonly number[],
  ahora = new Date(),
): Promise<ResultadoDelAcuerdo> {
  const hilo = await hiloVivo({ dueno: { personal: true }, pieza: PIEZA_TAREAS, usuarioEmail });
  const i = hilo ? hilo.turnos.findIndex((t) => t.id === turnoId) : -1;
  // Solo un mensaje del asistente trae un acuerdo: uno de la persona nunca se aplica, aunque traiga el marcador.
  if (!hilo || i < 0 || hilo.turnos[i].rol !== "ASISTENTE") throw new ErrorDeTareas(404, "Ese acuerdo no es de tu conversación.");
  // Un segundo clic (o un reintento del navegador): ya estaba, sin escribir nada. Se vuelve a mirar con el hilo bloqueado.
  if (estadosDeAcuerdo(hilo.turnos)[i] === "aplicado") return { yaEstaba: true, tareas: [], proyectos: [], cambios: 0, desenlace: "" };

  const { acuerdo } = leerAcuerdo(hilo.turnos[i].contenido);
  const crudas = acuerdo?.operaciones ?? [];
  if (!acuerdo || !crudas.length) throw new ErrorDeTareas(409, "Ese mensaje no trae cambios para aplicar.");
  if (acuerdo.enEspera) throw new ErrorDeTareas(409, "Hay una pregunta sin contestar: contéstala en el chat y después aplicas.");
  const ops = crudas.filter((o): o is OperacionDeTareas => !!o && typeof o === "object" && (OPERACIONES_DE_TAREAS as readonly string[]).includes(String((o as { op?: unknown }).op)));
  if (ops.length !== crudas.length || !acuerdoBienFormado(ops)) throw new ErrorDeTareas(409, "Ese acuerdo no es del chat de tareas.");

  // Lo desmarcado y lo que lo necesita, calculado acá (nunca el conjunto que manda el navegador).
  const pedidas = new Set(desmarcadas.filter((x) => Number.isInteger(x) && x >= 0 && x < ops.length));
  const fuera = arrastreDeDesmarcadas(dependenciasDeOperacionesDeTareas(ops), pedidas);
  const marcadas = ops.filter((_, k) => !fuera.has(k));
  if (!marcadas.length) throw new ErrorDeTareas(400, "No quedó nada marcado para aplicar.");

  // Revalidar contra hoy: lo que ya no se ve o ya no se puede no se aplica, y se dice cuál.
  const { foto } = await contextoDelChatDeTareas(quien.ctx, quien.clientes, { ahora, nombradas: referenciasDeOperaciones(marcadas) });
  const poda = podarOperacionesDeTareas(foto, marcadas);
  if (poda.caidas.length) {
    const motivos = poda.caidas.slice(0, 3).map((c) => `${describirOperacionesDeTareas(foto, [c.operacion])[0]}: ${c.motivo}`);
    throw new ErrorDeTareas(422, `Algo cambió desde que se acordó y no se aplicó nada. ${motivos.join(" · ")}. Pídele al asistente que lo ajuste.`);
  }

  const lineas = acuerdo.lineas?.length === ops.length ? acuerdo.lineas : describirOperacionesDeTareas(foto, ops);
  const nota = notaDeDescarte(lineas, [...fuera]);
  return aplicarAcuerdoDelChat(quien.ctx, quien.clientes, { hiloId: hilo.id, turnoId, operaciones: marcadas, notas: nota ? [nota] : [] }, ahora);
}
