/**
 * GET  /api/sales/exploraciones/[id]/documentos — las sesiones y los documentos sumados a mano (sin el texto).
 * POST /api/sales/exploraciones/[id]/documentos — sumar uno. Tres formas del cuerpo (JSON siempre):
 *   · `{ titulo, texto, fecha? }` — el texto pegado.
 *   · `{ accion: "preparar", nombre, tipo, tamano, titulo?, fecha? }` — permiso para subir un archivo
 *     DIRECTO a Supabase: el nginx del VPS corta todo cuerpo de más de 1 MB (lib/storage/subida-directa.ts).
 *   · `{ accion: "confirmar", path, nombre, titulo?, fecha? }` — valida lo subido y saca el texto. De la
 *     exploración se guarda el texto (lib/exploraciones/documentos.ts); el ARCHIVO queda en Información
 *     del cliente › Documentos, a nivel de empresa (2026-10-07: antes se borraba).
 * Al sumarlo, el agente lo lee en segundo plano. Un texto más largo de lo que lee el agente se guarda con el
 * principio y el final (minuta-de-la-sesion.ts) y la respuesta dice cuántos caracteres se quitaron (`quitados`).
 *
 * GET pide `ventas.read`; POST, `ventas.write` (gasta IA).
 */
import { NextRequest, NextResponse } from "next/server";
import { cuerpoInvalido } from "@/lib/api/cuerpo-invalido";
import { guardDeLaExploracion } from "@/lib/exploraciones/guardia";
import { confirmarDocumento, guardarEnLosDocumentosDeLaEmpresa, prepararDocumento } from "@/lib/documents/subida-de-documento";
import { lanzarCorrida } from "@/lib/exploraciones/agente";
import { crearDocumento, listarDocumentos, type OrigenDelDocumento } from "@/lib/exploraciones/documentos";
import { DocumentoPegadoSchema } from "@/lib/exploraciones/esquemas";
import { MAX_TEXTO_DEL_ARCHIVO, recortarParaElAgente } from "@/lib/exploraciones/minuta-de-la-sesion";
import { MAX_EXTRACTED_CHARS } from "@/lib/documents/extract-text";
import { leerExploracion } from "@/lib/exploraciones/servidor";

type Ctx = { params: Promise<{ id: string }> };

/** Dónde caen los archivos mientras se saca el texto (la arma la ruta, nunca el navegador). */
const carpetaDe = (id: string) => `exploraciones/${id}`;

export async function GET(_req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "read");
  if (guard instanceof NextResponse) return guard;
  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ documentos: [] });
  return NextResponse.json({ documentos: await listarDocumentos(id) });
}

export async function POST(req: NextRequest, { params }: Ctx) {
  const { id } = await params;
  const guard = await guardDeLaExploracion(id, "write");
  if (guard instanceof NextResponse) return guard;

  const lectura = await leerExploracion(id);
  if (lectura.estado !== "ok") return NextResponse.json({ error: "Esa preventa no existe." }, { status: 404 });
  if (lectura.fila.archivadaEn) return NextResponse.json({ error: "La preventa está archivada." }, { status: 409 });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido" }, { status: 400 });
  }
  const cuerpo = (typeof raw === "object" && raw !== null ? raw : {}) as Record<string, unknown>;

  let datos: { titulo: string; texto: string; fecha?: string; origen: OrigenDelDocumento; nombreArchivo: string | null };
  let quitados = 0;
  if (cuerpo.accion === "preparar") {
    const permiso = await prepararDocumento(carpetaDe(id), { nombre: cuerpo.nombre, tipo: cuerpo.tipo, tamano: cuerpo.tamano });
    if (!permiso.ok) return NextResponse.json({ error: permiso.error }, { status: permiso.status });
    return NextResponse.json({ signedUrl: permiso.signedUrl, path: permiso.path });
  } else if (cuerpo.accion === "confirmar") {
    // Se extrae de más (no el tope de 50.000 de extract-text): lo largo se recorta por el medio, no por el final.
    const subido = await confirmarDocumento(carpetaDe(id), cuerpo.path, cuerpo.nombre, MAX_TEXTO_DEL_ARCHIVO);
    if (!subido.ok) return NextResponse.json({ error: subido.error }, { status: subido.status });
    const titulo = (typeof cuerpo.titulo === "string" && cuerpo.titulo.trim()) || subido.nombre.replace(/\.[^.]+$/, "");
    // El archivo queda entre los documentos de la empresa, se lea o no su texto.
    await guardarEnLosDocumentosDeLaEmpresa({
      clientId: lectura.fila.clientId,
      projectId: lectura.fila.projectId,
      origen: lectura.fila.projectId ? "exploracion" : "preventa",
      // Entre los documentos de la empresa queda con el tope de siempre: lo leen otras piezas.
      subido: { ...subido, contenido: subido.contenido?.slice(0, MAX_EXTRACTED_CHARS) ?? null },
      titulo,
    });
    if (!subido.contenido) {
      return NextResponse.json(
        { error: "No se pudo sacar texto de ese archivo (¿es un PDF escaneado o una imagen?). Quedó en Información del cliente › Documentos; pega aquí el texto." },
        { status: 422 },
      );
    }
    // Se recorta antes de validar, sobre el texto entero: así lo que se guarda como «final» es el final real.
    const recorte = recortarParaElAgente(subido.contenido.trim());
    quitados = recorte.quitados;
    const r = DocumentoPegadoSchema.safeParse({ titulo: titulo.slice(0, 120), texto: recorte.texto, fecha: cuerpo.fecha || undefined });
    if (!r.success) return cuerpoInvalido(r.error);
    datos = { ...r.data, origen: "archivo", nombreArchivo: subido.nombre.slice(0, 200) };
  } else {
    const r = DocumentoPegadoSchema.safeParse(raw);
    if (!r.success) return cuerpoInvalido(r.error);
    // Lo que el agente no leería se quita del medio, no del final: el cierre trae el siguiente paso.
    const recorte = recortarParaElAgente(r.data.texto);
    quitados = recorte.quitados;
    datos = { ...r.data, texto: recorte.texto, origen: "pegado", nombreArchivo: null };
  }

  const email = guard.email ?? "";
  const creado = await crearDocumento({ exploracionId: id, ...datos, creadoPor: email });
  if (!creado.ok) return NextResponse.json({ error: creado.error }, { status: creado.status });

  /* El agente lo lee enseguida. Si ya está trabajando, el documento queda «sin leer» y se lee con el
     botón o con la próxima lectura. */
  const corrida = await lanzarCorrida(id, "leer", { triggeredByEmail: email || null, documentoId: creado.id }).catch((e) => {
    console.error("[exploraciones/documentos] no se pudo lanzar la lectura", e);
    return null;
  });
  return NextResponse.json(
    { id: creado.id, quitados, corrida: corrida && corrida.ok ? { runId: corrida.runId, yaCorria: corrida.yaCorria } : null },
    { status: 201 },
  );
}
