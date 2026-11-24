/**
 * GET /api/sales/exploraciones/[id]/reuniones-de-trabajo
 *   Las reuniones de trabajo que Nexus sugiere sumar a la preventa de un CLIENTE (24 nov, el TEC; etapa 2 de
 *   docs/diagnostico-con-lo-que-sabemos-plan.md): las de la empresa con transcripción, por cuánto habló el cliente, primero
 *   la mejor de cada equipo (lib/exploraciones/reuniones-de-trabajo.ts). Las lee el selector de «+ Agregar sesión» una vez al
 *   abrirse; se suman con POST …/sesiones y `deLoQueYaSabemos: true`.
 *   En un prospecto o en la exploración de un proyecto, vacío. Solo lee: por el chokepoint de sesiones (invariante #1), las
 *   40 más nuevas con transcripción. Pide poder cambiar la exploración, como el buscador (existe para elegir), y acceso a la
 *   empresa (`guardAccessToClient`): mira sus reuniones, y el permiso de preventa no las da (la regla del chat, 21 nov).
 *   Lo medido se recuerda 10 minutos por empresa: cada apertura del selector leía las 40 transcripciones de nuevo.
 */
import { NextResponse } from "next/server";
import { quienHabloEnLasReuniones } from "@/lib/analizador-venta/analizar-server";
import { guardAccessToClient } from "@/lib/auth/api-guards";
import { reunionesDeLaEmpresaParaElegir } from "@/lib/exploraciones/fuentes";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { sugerirReunionesDeTrabajo } from "@/lib/exploraciones/reuniones-de-trabajo";
import { partirDeLoQueYaSabemos } from "@/lib/exploraciones/posicionar";
import { PARTE_MINIMA_DEL_CLIENTE } from "@/lib/exploraciones/resumen-de-la-escala";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

/** Cuántas reuniones con transcripción se miden (las más nuevas): contar quién habló lee cada transcripción. */
const CUANTAS_SE_MIDEN = 40;
/** Cuánto se recuerda lo medido de una empresa (en este proceso): abrir y cerrar el selector no vuelve a leer todo. */
const MEMORIA_MS = 10 * 60 * 1000;
const MEDIDAS = new Map<string, { en: number; parte: Map<string, number | null> }>();

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  const fila = lectura.fila;
  if (fila.projectId || !partirDeLoQueYaSabemos(fila.client.kind)) return NextResponse.json({ sugeridas: [] });
  const acceso = await guardAccessToClient(fila.clientId);
  if (acceso instanceof NextResponse) return NextResponse.json({ error: "Para sugerir reuniones de trabajo necesitas acceso a esta empresa." }, { status: 403 });
  try {
    const conTexto = (await reunionesDeLaEmpresaParaElegir(fila.clientId)).filter((r) => r.texto === "transcripcion").slice(0, CUANTAS_SE_MIDEN);
    // Cuánto habló el cliente en cada una: se recuerda por empresa (las reuniones ya pasaron; su texto casi no cambia).
    const guardada = MEDIDAS.get(fila.clientId);
    const vigente = guardada && Date.now() - guardada.en < MEMORIA_MS ? guardada.parte : new Map<string, number | null>();
    const faltan = conTexto.filter((r) => !vigente.has(r.sessionId)).map((r) => r.sessionId);
    if (faltan.length) {
      const quien = await quienHabloEnLasReuniones(faltan);
      for (const sid of faltan) {
        const q = quien.get(sid);
        vigente.set(sid, q && q.fuente !== "nada" ? q.cliente.porcentaje : null);
      }
      MEDIDAS.set(fila.clientId, { en: guardada && vigente === guardada.parte ? guardada.en : Date.now(), parte: vigente });
    }
    return NextResponse.json({ sugeridas: sugerirReunionesDeTrabajo(conTexto, vigente, { minimo: PARTE_MINIMA_DEL_CLIENTE }) });
  } catch (e) {
    console.error("[exploraciones/reuniones-de-trabajo]", e);
    return NextResponse.json({ error: "No se pudieron sugerir las reuniones de trabajo." }, { status: 500 });
  }
}
