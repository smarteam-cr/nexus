/**
 * Un mapa chico y real en su forma (admisión de un aspirante), para las pruebas de lib/procesos.
 * Hoy: el aspirante escribe por WhatsApp, el proyecto lo anota en Excel y decide si sigue (con una
 * vuelta atrás). Después: entra por formulario a HubSpot y un workflow lo asigna.
 */
import type { MapaDeProceso, PasoDelMapa } from "../mapa";

const paso = (p: Partial<PasoDelMapa> & Pick<PasoDelMapa, "id" | "carril" | "texto">): PasoDelMapa => ({
  tipo: "paso",
  herramienta: "",
  origen: "dicho",
  citas: [],
  dolor: "",
  cambio: "",
  reemplaza: [],
  enHubspot: "",
  ...p,
});

const cita = (texto: string) => ({ sesionId: "s1", sesionTitulo: "Sesión con marketing", fecha: "2026-07-24", cita: texto, minuto: "11:58", quien: "Pablo" });

export function mapaDePrueba(): MapaDeProceso {
  return {
    formato: "carriles-v1",
    id: "admision",
    nombre: "Admisión del aspirante",
    area: "ventas",
    queResuelve: "Que cada aspirante quede registrado con su programa.",
    hoy: {
      carriles: [
        { id: "aspirante", nombre: "Aspirante", tipo: "cliente_final" },
        { id: "proyecto", nombre: "Proyecto", tipo: "equipo" },
      ],
      pasos: [
        paso({ id: "h1", carril: "aspirante", texto: "Escribe por WhatsApp", tipo: "inicio", herramienta: "WhatsApp", citas: [cita("nos escriben por whatsapp")] }),
        paso({ id: "h2", carril: "proyecto", texto: "Anota el lead en Excel", herramienta: "Excel", dolor: "Un Excel nuevo por promoción", citas: [cita("abren un excel nuevo")] }),
        paso({ id: "h3", carril: "proyecto", texto: "¿Cumple los requisitos?", tipo: "decision", origen: "supuesto" }),
        paso({ id: "h4", carril: "aspirante", texto: "Se matricula", tipo: "fin", citas: [cita("se matricula")] }),
      ],
      flechas: [
        { de: "h1", a: "h2", etiqueta: "" },
        { de: "h2", a: "h3", etiqueta: "" },
        { de: "h3", a: "h4", etiqueta: "Sí" },
        { de: "h3", a: "h2", etiqueta: "No" },
      ],
    },
    despues: {
      carriles: [
        { id: "aspirante", nombre: "Aspirante", tipo: "cliente_final" },
        { id: "hubspot", nombre: "HubSpot", tipo: "sistema" },
        { id: "proyecto", nombre: "Proyecto", tipo: "equipo" },
      ],
      pasos: [
        paso({ id: "d1", carril: "aspirante", texto: "Llena el formulario", tipo: "inicio", origen: "acordado", cambio: "nuevo", citas: [cita("un formulario por programa")] }),
        paso({ id: "d2", carril: "hubspot", texto: "Crea el contacto y lo asigna", origen: "propuesto", cambio: "automatico", reemplaza: ["h2"], enHubspot: "Workflow de asignación" }),
        paso({ id: "d3", carril: "proyecto", texto: "Revisa requisitos", origen: "acordado", cambio: "igual", citas: [cita("revisan los requisitos")] }),
      ],
      flechas: [
        { de: "d1", a: "d2", etiqueta: "" },
        { de: "d2", a: "d3", etiqueta: "" },
      ],
      seVa: [{ id: "h2", porque: "HubSpot crea el registro solo." }],
    },
    cambios: [{ texto: "El lead entra solo a HubSpot.", hoy: ["h2"], despues: ["d1", "d2"] }],
    preguntas: ["¿Quién revisa los requisitos en cada proyecto?"],
    estado: "borrador",
    generadoEn: "2026-10-05T12:00:00.000Z",
  };
}
