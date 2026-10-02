/**
 * lib/documentacion/audiencia.ts — el cliente ideal (ICP) y las buyer personas, para los bloques
 * vivos «icp» y «personas». PURO.
 *
 * Se editan en Marketing → Audiencia, y de ahí los lee también el agente que genera las ideas de
 * publicaciones. La base de conocimiento NO los copia: los muestra al abrir la página, así hay una
 * sola fuente y nunca dicen dos cosas distintas (decisión de Elías, 2026-10-01). La consulta vive en
 * `vivos.ts`.
 */
import type { IcpSection } from "@prisma/client";
import { ICP_SECTION_META, ICP_SECTION_ORDER } from "@/lib/marketing/seed-data";

export interface FilaDeIcp {
  section: IcpSection;
  label: string;
  order: number;
}

export interface FilaDePersona {
  name: string;
  role: string | null;
  description: string;
  pains: string | null;
  goals: string | null;
  order: number;
}

export interface GrupoDelIcp {
  titulo: string;
  bajada: string;
  secciones: { titulo: string; items: string[] }[];
}

export interface PersonaVista {
  nombre: string;
  arquetipo: string | null;
  quienEs: string;
  dolores: string | null;
  objetivos: string | null;
}

/** Los tres grupos del ICP, dichos para quien lo lee por primera vez. */
const GRUPOS: { clave: "firmografica" | "behavioral" | "signals"; titulo: string; bajada: string }[] = [
  {
    clave: "firmografica",
    titulo: "Cómo es la empresa",
    bajada: "Tamaño, estructura e industrias donde ya probamos que funcionamos.",
  },
  {
    clave: "behavioral",
    titulo: "Cómo piensa y se comporta",
    bajada: "Lo que le pasa, cómo busca y cómo decide: lo que separa a un buen cliente de uno que solo encaja en tamaño.",
  },
  {
    clave: "signals",
    titulo: "Señales para calificar",
    bajada: "Qué indica que un prospecto está listo, y qué indica que no es para nosotros.",
  },
];

/** El ICP agrupado y en su orden. Un grupo o una sección sin ítems no se muestra. */
export function armarIcp(filas: readonly FilaDeIcp[]): GrupoDelIcp[] {
  return GRUPOS.map((g) => ({
    titulo: g.titulo,
    bajada: g.bajada,
    secciones: ICP_SECTION_ORDER.filter((s) => ICP_SECTION_META[s].group === g.clave)
      .map((s) => ({
        titulo: ICP_SECTION_META[s].label,
        items: filas
          .filter((f) => f.section === s)
          .sort((a, b) => a.order - b.order)
          .map((f) => f.label.trim())
          .filter(Boolean),
      }))
      .filter((s) => s.items.length > 0),
  })).filter((g) => g.secciones.length > 0);
}

/** Las buyer personas ACTIVAS, en su orden. La consulta ya filtra las inactivas. */
export function armarPersonas(filas: readonly FilaDePersona[]): PersonaVista[] {
  return [...filas]
    .sort((a, b) => a.order - b.order)
    .map((p) => ({
      nombre: p.name.trim(),
      arquetipo: p.role?.trim() || null,
      quienEs: p.description.trim(),
      dolores: p.pains?.trim() || null,
      objetivos: p.goals?.trim() || null,
    }));
}
