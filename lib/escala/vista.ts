/**
 * lib/escala/vista.ts — lo que la pantalla de la escala recibe del servidor. PURO.
 *
 * El servidor parsea la versión publicada y baja SOLO el área que se mira (más lo poco que es de
 * toda la escala: niveles, capas, definiciones). Así una página no carga las tres áreas enteras.
 */
import { DOCUMENTOS_DE_LA_ESCALA, type DocumentoDeLaEscala } from "./documento/documentos";
import type { Area, CapaDeLaEscala, Escala, NivelDeLaEscala, Verificacion } from "./documento/tipos";

export interface DocumentoParaDescargar {
  clave: DocumentoDeLaEscala;
  titulo: string;
  archivo: string;
  paraQuien: string;
  /** La versión publicada, o null si ese documento todavía no se publicó. */
  version: string | null;
}

export interface DatosDeLaVista {
  version: string;
  fecha: string | null;
  estado: string | null;
  /** ISO. */
  publicadaEn: string;
  /** La última publicada no se pudo leer y se muestra la anterior. */
  aviso: string | null;
  niveles: NivelDeLaEscala[];
  capas: CapaDeLaEscala[];
  areas: { id: string; nombre: string; slug: string }[];
  area: Area;
  /** Id de criterio de riesgo de ESTA área → el mensaje que ve el cliente. */
  riesgos: Record<string, string>;
  verificacion: Partial<Record<Verificacion, string>>;
  explicaciones: Escala["explicaciones"];
  glosario: Escala["glosario"];
  documentos: DocumentoParaDescargar[];
}

export function datosDeLaVista(args: {
  escala: Escala;
  area: Area;
  publicadaEn: Date;
  aviso: string | null;
  versiones: { documento: string; version: string }[];
}): DatosDeLaVista {
  const { escala, area } = args;
  const prefijo = `${area.id}.`;
  return {
    version: escala.version,
    fecha: escala.fecha,
    estado: escala.estado,
    publicadaEn: args.publicadaEn.toISOString(),
    aviso: args.aviso,
    niveles: escala.niveles,
    capas: escala.capas,
    areas: escala.areas.map((a) => ({ id: a.id, nombre: a.nombre, slug: a.slug })),
    area,
    riesgos: Object.fromEntries(Object.entries(escala.riesgos).filter(([id]) => id.startsWith(prefijo))),
    verificacion: escala.verificacion,
    explicaciones: escala.explicaciones,
    glosario: escala.glosario,
    documentos: DOCUMENTOS_DE_LA_ESCALA.map((d) => ({
      clave: d.clave,
      titulo: d.titulo,
      archivo: d.archivo,
      paraQuien: d.paraQuien,
      // `versiones` viene ordenada de la más nueva a la más vieja.
      version: args.versiones.find((v) => v.documento === d.clave)?.version ?? null,
    })),
  };
}

// ── El estado de la pantalla en la URL ───────────────────────────────────────

export type Vista = "matriz" | "dimension" | "mapa";
export const VISTAS: readonly Vista[] = ["matriz", "dimension", "mapa"];

export function vistaDesdeUrl(v: string | null | undefined): Vista {
  return (VISTAS as readonly string[]).includes(v ?? "") ? (v as Vista) : "matriz";
}
