/**
 * lib/cobranza/nombre-del-servicio.ts — cómo se nombra un servicio de Cobranza en una línea (2026-11-13). PURO.
 *
 * Los servicios que vinieron del libro de Alex traen la descripción con su llave de importación delante
 * («conectores-saas:ferreteria-noelito-i-hub-sap · Ferreteria Noelito I Hub & SAP»). Se muestra lo que va después del
 * último «·». Sin descripción, el tipo («Conector»).
 */
import { TIPO_SERVICIO_LABEL } from "./schema";

const MAX = 70;

export function nombreDelServicio(descripcion: string | null | undefined, tipoServicio: string): string {
  const d = (descripcion ?? "").trim();
  const visible = (d.includes(" · ") ? d.slice(d.lastIndexOf(" · ") + 3) : d).replace(/\s+/g, " ").trim();
  if (!visible) return TIPO_SERVICIO_LABEL[tipoServicio] ?? tipoServicio;
  return visible.length <= MAX ? visible : `${visible.slice(0, MAX - 1).trimEnd()}…`;
}
