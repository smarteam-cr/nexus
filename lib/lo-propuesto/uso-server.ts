/**
 * lib/lo-propuesto/uso-server.ts — los datos de «Uso de Nexus»: cuánto de lo que propone Nexus se usó, se desestimó o
 * venció, por tipo, por módulo y por persona. SERVIDOR.
 *
 * Lo muestra «Uso de Nexus» (/para-ti/uso, solo dirección). También
 * lo imprime `scripts/uso-de-nexus.ts`, de solo lectura y sin correos.
 *
 * ⚠ Por persona es dato sensible: sale SOLO con `conPersonas: true`, para quien vea el uso del equipo (solo
 * SUPER_ADMIN), sin ranking y en orden alfabético (DECISIONS, «Uso de Nexus»).
 */
import "server-only";
import type { PrismaClient } from "@prisma/client";
import { sumarConteos, type ConteoDeTipo, type PorPersona } from "./conteo";
import { contarItems, itemsDeLoPropuesto } from "./registro-server";
import type { ItemParaContar } from "./conteo";
import { NOMBRE_DEL_MODULO, NOMBRE_DEL_TIPO, type ClaveDeTipo, type ModuloDeLoPropuesto } from "./tipos";

export interface ResumenDeUso {
  desde: string;
  hasta: string;
  porTipo: (Omit<ConteoDeTipo, "porPersona"> & { nombre: string })[];
  porModulo: ({ modulo: ModuloDeLoPropuesto; nombre: string } & Omit<ReturnType<typeof sumarConteos>, "porPersona">)[];
  total: Omit<ReturnType<typeof sumarConteos>, "porPersona">;
  /** Solo con `conPersonas`: por persona, en orden alfabético del correo. */
  porPersona: ({ persona: string } & PorPersona)[] | null;
}

const sinPersonas = <T extends { porPersona: unknown }>(c: T): Omit<T, "porPersona"> => {
  const { porPersona: _omitido, ...resto } = c;
  void _omitido;
  return resto;
};

export async function usoDeLoPropuesto(o: {
  desde: Date;
  hasta: Date;
  ahora?: Date;
  conPersonas?: boolean;
  db?: PrismaClient;
  /** Lo propuesto ya leído de la misma ventana (`itemsDeLoPropuesto`), para no leer la base dos veces. */
  items?: ReadonlyMap<ClaveDeTipo, readonly ItemParaContar[]>;
}): Promise<ResumenDeUso> {
  const ventana = { desde: o.desde, hasta: o.hasta };
  const conteos = contarItems(o.items ?? (await itemsDeLoPropuesto({ ...ventana, ahora: o.ahora, db: o.db })), ventana);
  const modulos = [...new Set(conteos.map((c) => c.modulo))];
  const total = sumarConteos(conteos);
  return {
    desde: o.desde.toISOString(),
    hasta: o.hasta.toISOString(),
    porTipo: conteos.map((c) => ({ ...sinPersonas(c), nombre: NOMBRE_DEL_TIPO[c.tipo] })),
    porModulo: modulos.map((modulo) => ({
      modulo,
      nombre: NOMBRE_DEL_MODULO[modulo],
      ...sinPersonas(sumarConteos(conteos.filter((c) => c.modulo === modulo))),
    })),
    total: sinPersonas(total),
    porPersona: o.conPersonas
      ? Object.entries(total.porPersona)
          .map(([persona, p]) => ({ persona, ...p }))
          .sort((a, b) => a.persona.localeCompare(b.persona))
      : null,
  };
}
