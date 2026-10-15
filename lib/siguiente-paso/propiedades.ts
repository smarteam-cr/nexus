/**
 * lib/siguiente-paso/propiedades.ts — las propiedades de «siguiente paso» en HubSpot.
 *
 * Decisión de Elías (2026-10-14, docs/mi-dia-plan.md): un siguiente paso por equipo, con qué, fecha y
 * responsable, con los MISMOS nombres internos en empresas, negocios y proyectos. Las crea
 * `scripts/hubspot-crear-propiedades-siguiente-paso.ts` y las escribe Nexus, los dos desde esta lista.
 * Marketing no lleva siguiente paso propio.
 *
 * `hs_next_step` (el de HubSpot en los negocios) no es de esta lista: Nexus lo lee como sugerencia y
 * nunca lo escribe.
 */

export const EQUIPOS_DEL_SIGUIENTE_PASO = [
  { clave: "ventas", etiqueta: "Ventas" },
  { clave: "cs", etiqueta: "CS" },
  { clave: "dev", etiqueta: "Dev" },
] as const;

export type EquipoDelSiguientePaso = (typeof EQUIPOS_DEL_SIGUIENTE_PASO)[number]["clave"];

/** Los objetos de HubSpot que llevan las propiedades: empresas, negocios y proyectos (0-970). */
export const OBJETOS_CON_SIGUIENTE_PASO = ["companies", "deals", "0-970"] as const;

export const GRUPO_DEL_SIGUIENTE_PASO = { name: "nexus_siguiente_paso", label: "Nexus · Siguiente paso" };

export type PropiedadDelSiguientePaso = {
  name: string;
  label: string;
  description: string;
  type: "string" | "date" | "enumeration";
  fieldType: "textarea" | "date" | "select";
  /** Solo el responsable: un usuario de HubSpot, como «CSE Encargado». */
  externalOptions?: true;
  referencedObjectType?: "OWNER";
};

/** Los nombres de las tres propiedades de un equipo. */
export function nombresDelEquipo(equipo: EquipoDelSiguientePaso) {
  return {
    que: `siguiente_paso_${equipo}`,
    fecha: `siguiente_paso_${equipo}_fecha`,
    responsable: `siguiente_paso_${equipo}_responsable`,
  };
}

export function propiedadesDelSiguientePaso(): PropiedadDelSiguientePaso[] {
  return EQUIPOS_DEL_SIGUIENTE_PASO.flatMap(({ clave, etiqueta }) => {
    const n = nombresDelEquipo(clave);
    const pie = "Lo escribe Nexus; la historia de cada cambio queda en Nexus.";
    return [
      {
        name: n.que,
        label: `Siguiente paso · ${etiqueta}`,
        description: `Qué sigue con esta cuenta del lado de ${etiqueta}. ${pie}`,
        type: "string",
        fieldType: "textarea",
      },
      {
        name: n.fecha,
        label: `Siguiente paso · ${etiqueta} · fecha`,
        description: `Para cuándo es el siguiente paso de ${etiqueta}. ${pie}`,
        type: "date",
        fieldType: "date",
      },
      {
        name: n.responsable,
        label: `Siguiente paso · ${etiqueta} · responsable`,
        description: `Quién de ${etiqueta} lleva el siguiente paso. ${pie}`,
        type: "enumeration",
        fieldType: "select",
        externalOptions: true,
        referencedObjectType: "OWNER",
      },
    ];
  });
}
