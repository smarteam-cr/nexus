/**
 * scripts/lib/interlocutores-precarga.ts — el formato del mapa de gente que da una persona del equipo, para precargar
 * «Unidades e interlocutores» (2026-11-25). Lo lee scripts/interlocutores-precargar.ts con `--mapa <archivo.json>`.
 *
 * El mapa NO vive en el repo: trae nombres y correos de personas de los clientes. Va en un JSON aparte (el del TEC y el
 * de Teamnet/Stratosphere los dejó la sesión del 25 nov en la carpeta de notas de la coordinadora).
 *
 * Regla: solo va CONFIRMADO lo que dijo una persona con su correo. Un correo que se dedujo de las reuniones, o una
 * persona sin rol en el mapa, va «por confirmar» (sugerida en su unidad): se ve en la pantalla y no mueve ninguna reunión
 * hasta que alguien la confirme.
 */
import { readFileSync } from "node:fs";
import { z } from "zod";
import { ROLES_DE_PERSONA } from "@/lib/clients/personas-de-la-empresa";

const Persona = z.object({
  correo: z.string().transform((s) => s.trim().toLowerCase()).refine((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s), "correo inválido"),
  nombre: z.string(),
  rol: z.enum(ROLES_DE_PERSONA).nullable(),
  /** Claves de `fichas` donde queda CONFIRMADA. */
  confirmadaEn: z.array(z.string()).optional(),
  /** Claves de `fichas` donde queda SUGERIDA, sin confirmar. */
  sugeridaEn: z.array(z.string()).optional(),
  /** De dónde sale, para el simulacro. */
  nota: z.string(),
});

export const MapaDeInterlocutores = z
  .object({
    titulo: z.string(),
    fichas: z.record(z.string(), z.object({ id: z.string(), nombre: z.string() })),
    personas: z.array(Persona).min(1),
  })
  .superRefine((m, c) => {
    for (const p of m.personas) {
      for (const k of [...(p.confirmadaEn ?? []), ...(p.sugeridaEn ?? [])]) {
        if (!m.fichas[k]) c.addIssue({ code: "custom", message: `${p.correo}: la ficha «${k}» no está en «fichas»` });
      }
      if (!p.confirmadaEn?.length && !p.sugeridaEn?.length) c.addIssue({ code: "custom", message: `${p.correo}: sin ficha` });
    }
    const correos = m.personas.map((p) => p.correo);
    if (new Set(correos).size !== correos.length) c.addIssue({ code: "custom", message: "hay un correo repetido" });
  });
export type MapaDeInterlocutores = z.infer<typeof MapaDeInterlocutores>;

export function leerMapa(ruta: string): MapaDeInterlocutores {
  const r = MapaDeInterlocutores.safeParse(JSON.parse(readFileSync(ruta, "utf-8")));
  if (!r.success) throw new Error(`El mapa ${ruta} no es válido: ${r.error.issues.map((i) => i.message).join("; ")}`);
  return r.data;
}
