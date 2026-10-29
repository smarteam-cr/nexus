/**
 * lib/smarteam/posicionamiento-esquema.ts — lo que acepta la ruta al guardar el position statement (Zod en la frontera,
 * K3 del 2026-10-28). Aparte de ./posicionamiento.ts porque importa zod y aquel lo usa la pantalla.
 */
import { z } from "zod";
import { claveDelFrente, type Posicionamiento } from "./posicionamiento";

const textoOpcional = (max: number) =>
  z
    .string()
    .max(max)
    .transform((s) => s.trim() || null)
    .nullable();

const FrenteEdicionSchema = z.strictObject({
  nombre: z.string().trim().min(1, "Cada frente necesita un nombre.").max(60),
  herramienta: textoOpcional(60),
  promesa: z.string().trim().min(1, "Cada frente necesita su promesa en una línea.").max(200),
  titulo: textoOpcional(140),
  queLogra: z
    .array(
      z.strictObject({
        titulo: z.string().trim().min(1, "Cada «qué logra» necesita su título.").max(80),
        detalle: textoOpcional(200),
      }),
    )
    .max(8),
  cuandoCabe: z.array(z.string().trim().min(1, "Una condición de «cuándo cabe» quedó vacía.").max(160)).max(8),
  nota: textoOpcional(240),
});

/** Lo que acepta la ruta al guardar el position statement (Zod en la frontera). La clave de cada frente sale del nombre. */
export const PosicionamientoEdicionSchema = z
  .strictObject({
    frase: textoOpcional(1000),
    frentes: z.array(FrenteEdicionSchema).max(6),
  })
  .superRefine((p, ctx) => {
    const claves = p.frentes.map((f) => claveDelFrente(f.nombre));
    if (new Set(claves).size !== claves.length)
      ctx.addIssue({
        code: "custom",
        message: "Dos frentes tienen el mismo nombre.",
      });
  })
  .transform((p): Posicionamiento => ({
    frase: p.frase,
    frentes: p.frentes.map((f) => ({ ...f, clave: claveDelFrente(f.nombre) })),
  }));
export type PosicionamientoEdicion = z.input<typeof PosicionamientoEdicionSchema>;
