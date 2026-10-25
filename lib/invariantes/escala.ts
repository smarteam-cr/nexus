/**
 * lib/invariantes/escala.ts — los invariantes de la Escala de Rendimiento como datos (2026-10-25, el borrador 9.0.0).
 */
import { cumple, viola, type Invariante } from "./contrato";
import { datosConLoQueFaltaDecidir } from "@/lib/escala/datos/reglas";

/**
 * INV59 · Ninguna versión PUBLICADA de la escala trae «Lo que falta decidir». Esa parte es del borrador
 * (lib/escala/nueve/informe.ts): las preguntas para Elías y lo que falta escribir. Publicar con ella la deja a la vista
 * de quien lee la escala, y una versión publicada no se corrige: hay que sacar otra. Publicar ya se frena
 * (lib/escala/datos/publicar.ts y scripts/publicar-escala.ts); esto es la red si alguien publica por otro camino.
 * Mira solo las publicadas: el borrador la lleva a propósito.
 */
export const INV59: Invariante = {
  id: "59",
  nombre: "ninguna versión publicada de la escala trae «Lo que falta decidir»",
  async correr(db) {
    const publicadas = await db.escalaVersion.findMany({ where: { estado: "publicada" }, select: { version: true, datos: true } });
    const con = publicadas.filter((v) => datosConLoQueFaltaDecidir(v.datos)).map((v) => v.version);
    if (con.length === 0) return cumple(`✓ INV59: ninguna de las ${publicadas.length} versiones publicadas de la escala trae «Lo que falta decidir».`);
    return viola(
      `✗ INV59 VIOLADO: la escala ${con.join(", ")} se publicó con «Lo que falta decidir» (las preguntas del borrador quedaron a la vista).`,
      "    Remedio: abrir un borrador nuevo desde esa versión, quitar esa parte y publicar la versión que sigue (scripts/escala-datos.ts).",
    );
  },
};
