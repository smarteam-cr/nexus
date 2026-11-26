/**
 * lib/exploraciones/impacto-en-la-escala.ts — La escala de la empresa como ENTREGABLE del agente de impacto (21 nov).
 * PURO.
 *
 * Las piezas principales de la página (el titular, los puntos clave, y de cada equipo su reto principal, lo que lo causa
 * y sus cifras), en texto: lo que lee el agente de impacto para decidir si una nota la cambia, y lo que guarda un hito
 * («lo que se vio») cuando se presenta o el cliente responde. Sale de la página tal como la ve el cliente (sin citas):
 * de lo de hoy o de la foto publicada.
 */
import type { PiezaDelEntregable } from "@/lib/impacto/impacto";
import { MAX_LO_QUE_SE_VIO } from "@/lib/impacto/respuesta-del-cliente";
import type { ResumenDeLaPagina } from "@/lib/external/pagina-del-resumen";

/** Cómo nombra el aviso a este entregable. */
export const NOMBRE_DE_LA_PAGINA_DE_LA_ESCALA = "la página del Diagnóstico de rendimiento";

const limpio = (s: string) => s.replace(/\s+/g, " ").trim();

/** Las piezas de la página, por parte. Vacío: no hay Resumen armado. */
export function piezasDeLaPagina(r: ResumenDeLaPagina | null | undefined): PiezaDelEntregable[] {
  if (!r?.at) return [];
  const out: PiezaDelEntregable[] = [];
  const poner = (parte: string, texto: string | null | undefined) => {
    const t = limpio(texto ?? "");
    if (t) out.push({ parte, texto: t });
  };
  for (const p of r.negocio ?? []) {
    if (p.tipo === "tesis") for (const x of p.lista.piezas) poner("Titular", x.texto);
    else if (p.tipo === "tamano" || p.tipo === "vende" || p.tipo === "busca" || p.tipo === "motivo") for (const x of p.lista.piezas) poner("Negocio", x.texto);
  }
  for (const x of r.puntos ?? []) poner("Puntos clave", `${x.titulo}: ${x.texto}`);
  for (const t of r.tarjetas) {
    for (const s of t.subequipos) {
      const parte = t.nombre;
      if (s.costo) poner(parte, `Cuánto cuesta: ${s.costo.cifra} ${s.costo.texto}`);
      for (const x of s.frena.piezas) poner(parte, `Reto principal: ${x.texto}`);
      for (const x of s.retos.piezas) poner(parte, `Lo que lo causa: ${x.texto}`);
      for (const c of s.cifras) poner(parte, `Cifra: ${c.cifra} ${c.texto}`);
    }
  }
  for (const p of r.pendientes) poner("Qué falta validar", p.texto);
  return out;
}

/** Las piezas en un texto (lo que se vio al presentar o al responder), con su tope. */
export function textoDeLasPiezas(piezas: readonly PiezaDelEntregable[]): string {
  let s = "";
  for (const p of piezas) {
    const linea = `- [${p.parte}] ${p.texto}\n`;
    if (s.length + linea.length > MAX_LO_QUE_SE_VIO) break;
    s += linea;
  }
  return s.trimEnd();
}
