/**
 * lib/documents/subir-adjunto.ts — el lado del NAVEGADOR de «subir un archivo» en el «Contexto
 * adicional» de una pieza de un proyecto (2026-10-07).
 *
 * Sube el archivo directo a Supabase por la ruta de documentos del proyecto con su `origen`: el archivo
 * queda en Información del cliente › Documentos y la respuesta trae el texto extraído, que la pieza
 * guarda como su fuente. Nunca tira.
 *
 * Módulo client-safe.
 */
import { subirDirecto } from "@/lib/storage/subir-directo";

export type AdjuntoSubido = { ok: true; id: string; nombre: string; texto: string | null } | { ok: false; error: string };

export async function subirAdjuntoDelProyecto(opts: {
  projectId: string;
  origen: string;
  archivo: File;
  titulo?: string | null;
}): Promise<AdjuntoSubido> {
  const r = await subirDirecto<{ id?: unknown; nombre?: unknown; texto?: unknown }>({
    ruta: `/api/projects/${opts.projectId}/documents/upload`,
    archivo: opts.archivo,
    extra: { origen: opts.origen, ...(opts.titulo ? { titulo: opts.titulo } : {}) },
  });
  if (!r.ok) return r;
  return {
    ok: true,
    id: typeof r.data.id === "string" ? r.data.id : "",
    nombre: typeof r.data.nombre === "string" ? r.data.nombre : opts.archivo.name,
    texto: typeof r.data.texto === "string" && r.data.texto.trim() ? r.data.texto : null,
  };
}
