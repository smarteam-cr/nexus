/**
 * lib/finanzas/metas-de-gerencia-esquema.ts — lo que se escribe de una meta de gerencia (Zod). Lo leen las rutas
 * /api/cobranza/costos/goals. Aparte de metas-de-gerencia.ts para que la pantalla no cargue zod en el navegador.
 */
import { z } from "zod";
import { DEFINICION_DE_MEDIDA, MEDIDAS } from "./metas-de-gerencia";

const DIA = /^\d{4}-\d{2}-\d{2}$/;
const diaISO = z.string().regex(DIA, "Escribe la fecha como AAAA-MM-DD.");
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((s) => (s ? s : null));

export const metaDeGerenciaSchema = z
  .object({
    nombre: z.string().trim().min(1, "Ponle un nombre a la meta.").max(160),
    medida: z.enum(MEDIDAS),
    objetivoUsd: z.number().positive("El objetivo tiene que ser mayor que cero.").max(1_000_000_000).nullable(),
    desde: diaISO.nullable(),
    hasta: diaISO.nullable(),
    corteEn: diaISO.nullable(),
    premio: textoOpcional(500),
    paraQuien: textoOpcional(300),
    avanceManualUsd: z.number().min(0).max(1_000_000_000).nullable(),
    avanceManualAl: diaISO.nullable(),
    nota: textoOpcional(2000),
  })
  .superRefine((m, ctx) => {
    if (DEFINICION_DE_MEDIDA[m.medida].forma === "acumulado" && (!m.desde || !m.hasta)) {
      ctx.addIssue({ code: "custom", path: ["desde"], message: "Esta medida suma dentro de un período: escribe desde y hasta." });
    }
    if (m.desde && m.hasta && m.desde > m.hasta) {
      ctx.addIssue({ code: "custom", path: ["hasta"], message: "El período termina antes de empezar." });
    }
    if (m.medida === "manual" && (m.avanceManualUsd === null || !m.avanceManualAl)) {
      ctx.addIssue({ code: "custom", path: ["avanceManualUsd"], message: "Escribe el avance y a qué día corresponde." });
    }
  });
export type MetaDeGerenciaInput = z.infer<typeof metaDeGerenciaSchema>;
