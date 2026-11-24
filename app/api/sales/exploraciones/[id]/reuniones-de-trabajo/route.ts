/**
 * GET /api/sales/exploraciones/[id]/reuniones-de-trabajo
 *   Las reuniones de trabajo que Nexus sugiere sumar a la preventa de un CLIENTE (24 nov, el TEC; etapa 2 de
 *   docs/diagnostico-con-lo-que-sabemos-plan.md): las de la empresa con transcripción, por cuánto habló el cliente, primero
 *   la mejor de cada equipo (lib/exploraciones/reuniones-de-trabajo.ts). Las lee el selector de «+ Agregar sesión» una vez al
 *   abrirse; se suman con POST …/sesiones y `deLoQueYaSabemos: true`.
 *   En un prospecto o en la exploración de un proyecto, vacío. Solo lee: por el chokepoint de sesiones (invariante #1), las
 *   40 más nuevas con transcripción. Pide poder cambiar la exploración, como el buscador (existe para elegir).
 */
import { NextResponse } from "next/server";
import { quienHabloEnLasReuniones } from "@/lib/analizador-venta/analizar-server";
import { reunionesDeLaEmpresaParaElegir } from "@/lib/exploraciones/fuentes";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { sugerirReunionesDeTrabajo } from "@/lib/exploraciones/reuniones-de-trabajo";
import { partirDeLoQueYaSabemos } from "@/lib/exploraciones/posicionar";
import { PARTE_MINIMA_DEL_CLIENTE } from "@/lib/exploraciones/resumen-de-la-escala";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

/** Cuántas reuniones con transcripción se miden (las más nuevas): contar quién habló lee cada transcripción. */
const CUANTAS_SE_MIDEN = 40;

export async function GET(_req: Request, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  const fila = lectura.fila;
  if (fila.projectId || !partirDeLoQueYaSabemos(fila.client.kind)) return NextResponse.json({ sugeridas: [] });
  try {
    const conTexto = (await reunionesDeLaEmpresaParaElegir(fila.clientId)).filter((r) => r.texto === "transcripcion").slice(0, CUANTAS_SE_MIDEN);
    const quien = await quienHabloEnLasReuniones(conTexto.map((r) => r.sessionId));
    const delCliente = new Map(conTexto.map((r) => {
      const q = quien.get(r.sessionId);
      return [r.sessionId, q && q.fuente !== "nada" ? q.cliente.porcentaje : null] as const;
    }));
    return NextResponse.json({ sugeridas: sugerirReunionesDeTrabajo(conTexto, delCliente, { minimo: PARTE_MINIMA_DEL_CLIENTE }) });
  } catch (e) {
    console.error("[exploraciones/reuniones-de-trabajo]", e);
    return NextResponse.json({ error: "No se pudieron sugerir las reuniones de trabajo." }, { status: 500 });
  }
}
