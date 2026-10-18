/**
 * lib/servicios/propuesta-interna.ts — la PROPUESTA RECURRENTE INTERNA de un cliente que ya compró a mano. PURO.
 *
 * (Roadmap «La siguiente serie», iniciativa 3, paso 7.) A FACO, Colby, Cayalá y Grupo Inve se les vendió un servicio
 * recurrente antes de que existiera la plantilla: con un plan escrito aparte o con secciones HTML hechas a mano. Para que
 * su servicio viva en Nexus igual que uno nuevo, se arma una propuesta recurrente NUEVA e INTERNA que refleja lo vendido:
 *  · nunca se publica y se nombra «… · interna», para que nadie la confunda con la que firmó el cliente;
 *  · ⛔ la propuesta firmada NO se toca: de ella solo se LEEN los casos de uso y la inversión;
 *  · la cadencia, el ciclo y el nivel de servicio salen del catálogo (lib/servicios/propuesta.ts), como en una nueva;
 *  · el proyecto recurrente del cliente, si existe y todavía no tiene servicio, queda con este servicio y esta propuesta.
 *
 * Lo corre scripts/propuestas-recurrentes-internas.ts, en simulacro hasta que alguien lo revise.
 */
import { isBlank } from "@/lib/landing/is-blank";
import type { ServicioRecurrente } from "./catalogo";
import { casosDeLaPropuesta, seccionesDelServicio } from "./propuesta";

export interface FirmadaParaLeer {
  id: string;
  nombre: string;
  aprobadaEl: string | null;
  /** El `data` de su sección `casos_de_uso` (versión activa), si tiene. */
  casosData: unknown;
  /** El `data` de su sección `inversion` (versión activa), si tiene. */
  inversionData: unknown;
  /** Los títulos de sus secciones personalizadas (`custom:*`): lo que Ventas armó a mano. */
  personalizadas: readonly string[];
}

export interface ProyectoParaLaInterna {
  id: string;
  nombre: string;
  servicioRecurrente: string | null;
}

export interface PlanDeLaInterna {
  nombre: string;
  /** Lo que se escribe en cada sección del canvas nuevo (las demás quedan vacías, para revisar). */
  secciones: Record<string, unknown>;
  /** Si el proyecto queda con este servicio y esta propuesta. */
  proyecto: { id: string; nombre: string } | null;
  avisos: string[];
}

export function planDeLaPropuestaInterna(o: {
  cliente: string;
  servicio: ServicioRecurrente;
  firmada: FirmadaParaLeer | null;
  proyecto: ProyectoParaLaInterna | null;
}): PlanDeLaInterna {
  const avisos: string[] = [];
  const del = seccionesDelServicio(o.servicio);
  const secciones: Record<string, unknown> = {
    hero: {
      headline: `${o.servicio.nombre} para ${o.cliente}`,
      subhead: o.servicio.descripcion,
      tags: [o.servicio.nombre, "Servicio recurrente"],
    },
    acuerdo: {
      intro: `Lo que incluye ${o.servicio.nombre} para ${o.cliente}.`,
      items: o.servicio.incluye.map((x) => ({ title: x, detail: "" })),
    },
    operacion: del.operacion,
    metodologia: del.metodologia,
    nivel_servicio: del.nivel_servicio,
  };

  if (!o.firmada) {
    avisos.push("No se encontró una propuesta aprobada o publicada del cliente: los casos de uso y la inversión quedan vacíos para cargar a mano.");
  } else {
    const casos = casosDeLaPropuesta(o.firmada.casosData);
    if (casos.length) secciones.casos_de_uso = { items: casos.map((c) => ({ title: c.titulo, detail: c.resultado ?? "", price: "" })) };
    else avisos.push(`«${o.firmada.nombre}» no tiene casos de uso en su sección: se cargan a mano.`);
    if (o.firmada.inversionData && !isBlank(o.firmada.inversionData)) secciones.inversion = o.firmada.inversionData;
    else avisos.push(`«${o.firmada.nombre}» no tiene la inversión escrita: se carga a mano.`);
    if (o.firmada.personalizadas.length) {
      avisos.push(`Lo que Ventas armó a mano en «${o.firmada.nombre}» (revísalo contra la plantilla): ${o.firmada.personalizadas.join(" · ")}.`);
    }
  }
  if (!o.servicio.validado) avisos.push(`La cadencia y las rutinas de ${o.servicio.nombre} todavía están a validar con Elías.`);

  let proyecto: PlanDeLaInterna["proyecto"] = null;
  if (!o.proyecto) avisos.push("El cliente no tiene un proyecto recurrente en Nexus: el servicio queda en la propuesta y se da de alta desde ahí.");
  else if (o.proyecto.servicioRecurrente && o.proyecto.servicioRecurrente !== o.servicio.clave) {
    avisos.push(`«${o.proyecto.nombre}» ya es otro servicio (${o.proyecto.servicioRecurrente}): no se cambia.`);
  } else if (!o.proyecto.servicioRecurrente) proyecto = { id: o.proyecto.id, nombre: o.proyecto.nombre };

  return { nombre: `${o.servicio.nombre} — ${o.cliente} · interna`, secciones, proyecto, avisos };
}

/** Wherex hizo churn y es el cliente de prueba de Nexus: nunca entra a una carga. */
export function esClienteVedado(nombre: string): boolean {
  return /wherex/i.test(nombre);
}
