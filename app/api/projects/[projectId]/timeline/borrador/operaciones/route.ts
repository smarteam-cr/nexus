/**
 * POST /api/projects/[projectId]/timeline/borrador/operaciones — E3: SE EDITA LA PROPUESTA ABIERTA.
 *
 * La propuesta del cronograma (un `borrador-v1`) se edita por UNA sola ruta, venga de donde venga:
 *   { token: string,     ← `pendingProposalRunId` de la propuesta que se tiene enfrente
 *     version: number,   ← la que se vio (informativa: la escritura se condiciona a la que se lee)
 *     origen: "casillas" | "chat" | "apertura",
 *     operaciones: 1..50 }
 *   · casillas: `{ op: "excluir" | "incluir", claves }` → lo desmarcado (`excluidos`), que ve cualquier
 *     computadora. Pasan siempre, también mientras la IA arma (E2c D8). Una clave desconocida se ignora.
 *   · chat: lo acordado (`operarSobreElBorrador`, la misma función que valida el chat al acordar). Si
 *     algo no se puede, 422 con cada motivo y no se escribe nada. Mientras la IA arma las tareas o las
 *     recalcula, 409: lo acordado espera.
 *   · apertura: `[{ op: "chat-abierto" }]` → la huella de quien entra (su email del guard, nunca uno del
 *     cuerpo) en `chatAbiertoPara`. No sube la versión ni escribe ningún otro campo.
 * Cada escritura (salvo la apertura) sube `version`, condicionada a token + la versión leída; si no
 * entra (otra pestaña escribió en el medio), se vuelve a leer, hasta 3 veces. Sin cambio, no se escribe.
 * ⛔ Aplicar sigue leyendo el `sin` de su cuerpo, no `excluidos`: una pestaña de antes no entra en un
 * bucle de PLAN_CAMBIO. No hay auditoría ni eventos acá: se audita al aplicar.
 * Guarded con guardTimelineEdit (interno/CSE), la misma vara del PUT del cronograma.
 */
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { guardTimelineEdit } from "@/lib/auth/api-guards";
import { prisma } from "@/lib/db/prisma";
import {
  abiertoPara,
  aplicarCasillas,
  BLOQUEO_VERSION_NUEVA,
  CHAT_CON_EL_VACIO_FALLIDO,
  conAbiertoPara,
  esBorradorV1,
  esVacioEsperandoTareas,
  excluidosDelGuardado,
  leerBorrador,
  normalizarExcluidos,
  versionDelBorrador,
  type Vivo,
} from "@/lib/timeline/borrador";
import {
  leerEstadoDeLasTareas,
  MENSAJE_TAREAS_EN_CURSO,
  SELECT_DE_FASES_CON_TAREAS,
  vivoDeLaBase,
  type FaseLeida,
} from "@/lib/timeline/borrador-del-detalle";
import { MENSAJE_PROPUESTA_CAMBIO } from "@/lib/timeline/escribir-estructura";
import { leerPedidoDeOperaciones, operarSobreElBorrador } from "@/lib/timeline/operar-sobre-el-borrador";

/** Cuántas veces se vuelve a leer cuando la escritura condicionada no entra. */
const VUELTAS = 3;

/** Lo que se lee del cronograma: con las fases y sus tareas solo si opera el chat. */
interface Leida {
  id: string;
  anchorStartDate: Date | null;
  pendingProposal: unknown;
  pendingProposalRunId: string | null;
  phases?: FaseLeida[];
}

const conflicto = (error: string, message: string) => NextResponse.json({ error, message }, { status: 409 });
const mismaLista = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, k) => x === b[k]);

export async function POST(req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const guard = await guardTimelineEdit(projectId);
  if (guard instanceof NextResponse) return guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const pedido = leerPedidoDeOperaciones(raw);
  if ("error" in pedido) return NextResponse.json({ error: pedido.error }, { status: 400 });

  const leer = async (): Promise<Leida | null> =>
    pedido.origen === "chat"
      ? prisma.projectTimeline.findUnique({
          where: { projectId },
          select: { id: true, anchorStartDate: true, pendingProposal: true, pendingProposalRunId: true, phases: SELECT_DE_FASES_CON_TAREAS },
        })
      : prisma.projectTimeline.findUnique({
          where: { projectId },
          select: { id: true, anchorStartDate: true, pendingProposal: true, pendingProposalRunId: true },
        });

  for (let vuelta = 0; vuelta < VUELTAS; vuelta++) {
    const tl = await leer();
    if (!tl) return NextResponse.json({ error: "No hay cronograma" }, { status: 404 });
    const guardado = tl.pendingProposal;
    const vLeida = versionDelBorrador(guardado);
    if (guardado === null || (tl.pendingProposalRunId ?? null) !== pedido.token || !esBorradorV1(guardado) || vLeida === null) {
      return conflicto("PROPUESTA_CAMBIO", MENSAJE_PROPUESTA_CAMBIO);
    }
    const vivo: Vivo = tl.phases
      ? vivoDeLaBase(tl.anchorStartDate, tl.phases)
      : { ancla: tl.anchorStartDate?.toISOString() ?? null, fases: [] };
    const borrador = leerBorrador(guardado, vivo);
    if (!borrador) return conflicto("PROPUESTA_CAMBIO", MENSAJE_PROPUESTA_CAMBIO);
    if ((borrador.desconocidos ?? 0) > 0) return conflicto("NO_SE_PUEDE", BLOQUEO_VERSION_NUEVA);

    /* El chat no edita mientras la IA arma o recalcula las tareas (lo que escribiera quedaría debajo de
       una propuesta que está por cambiar), ni el borrador vacío (no hay nada que editar). Las casillas y
       la apertura pasan siempre. */
    if (pedido.origen === "chat") {
      const estado = await leerEstadoDeLasTareas(guardado);
      if (estado?.estado === "armando" || estado?.recalculo?.estado === "armando") {
        return conflicto("TAREAS_EN_CURSO", MENSAJE_TAREAS_EN_CURSO);
      }
      if (esVacioEsperandoTareas(guardado)) return conflicto("NO_SE_PUEDE", CHAT_CON_EL_VACIO_FALLIDO);
    }

    const excluidosAntes = excluidosDelGuardado(guardado);
    let nuevo: Record<string, unknown> | null = null;
    let excluidos = excluidosAntes;
    let avisos: string[] = [];
    if (pedido.origen === "casillas") {
      const despues = normalizarExcluidos(borrador, aplicarCasillas(borrador, excluidosAntes ?? [], pedido.operaciones));
      const igual = excluidosAntes === null ? despues.length === 0 : mismaLista(excluidosAntes, despues);
      if (!igual) {
        nuevo = { ...guardado, version: vLeida + 1, excluidos: despues };
        excluidos = despues;
      }
    } else if (pedido.origen === "chat") {
      const r = operarSobreElBorrador({ vivo, borrador, excluidos: excluidosAntes ?? [], operaciones: pedido.operaciones });
      if (r.rechazadas.length > 0) {
        return NextResponse.json({ error: "OPERACION_RECHAZADA", rechazadas: r.rechazadas }, { status: 422 });
      }
      avisos = r.avisos;
      if (r.cambio) {
        const { ajustadasPorElChat: _vieja, ...resto } = guardado;
        void _vieja;
        const ajustadas = r.borrador.ajustadasPorElChat;
        // `excluidos` se escribe si ya estaba o si ahora hay alguno: la migración de la pantalla (P3) lo
        // necesita ausente mientras nadie desmarcó nada en el servidor.
        const conExcluidos = excluidosAntes !== null || r.excluidos.length > 0;
        nuevo = {
          ...resto,
          version: vLeida + 1,
          cambios: r.borrador.cambios,
          ...(ajustadas && Object.keys(ajustadas).length > 0 ? { ajustadasPorElChat: ajustadas } : {}),
          ...(conExcluidos ? { excluidos: r.excluidos } : {}),
        };
        excluidos = conExcluidos ? r.excluidos : excluidosAntes;
      }
    } else {
      // La apertura: la huella de quien está (del guard), sin subir la versión ni tocar nada más.
      const email = guard.user.email ?? null;
      if (email && !abiertoPara(guardado, email)) nuevo = { ...guardado, chatAbiertoPara: conAbiertoPara(guardado, email) };
    }

    const responder = (version: number, propuesta: unknown) =>
      NextResponse.json({
        token: pedido.token,
        version,
        excluidos,
        ...(avisos.length > 0 ? { avisos } : {}),
        ...(pedido.origen === "chat" || vLeida !== pedido.version ? { propuesta } : {}),
      });
    if (nuevo === null) return responder(vLeida, guardado);

    const escrita = await prisma.projectTimeline.updateMany({
      where: { id: tl.id, pendingProposalRunId: pedido.token, pendingProposal: { path: ["version"], equals: vLeida } },
      data: { pendingProposal: nuevo as unknown as Prisma.InputJsonValue },
    });
    if (escrita.count === 1) return responder(pedido.origen === "apertura" ? vLeida : vLeida + 1, nuevo);
    // Otra escritura entró en el medio: se vuelve a leer y a calcular sobre lo nuevo.
  }
  return conflicto("PROPUESTA_CAMBIO", MENSAJE_PROPUESTA_CAMBIO);
}
