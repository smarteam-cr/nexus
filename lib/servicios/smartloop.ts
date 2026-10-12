/**
 * lib/servicios/smartloop.ts — la GUÍA del CSE para SmartLoop. PURO y CLIENT-SAFE.
 *
 * Sale de la sección 5 del documento de proceso de SmartLoop (v0.3.0, 2026-10-10), que es la fuente de
 * verdad del servicio: por etapa, qué hace el CSE, qué tiene que quedar producido y la señal de que la
 * etapa se saltó. No agrega reglas que no estén ahí (Parte III del documento). Un servicio recurrente
 * nuevo es OTRO archivo como éste, escrito desde su propio documento de proceso.
 */
import type { GuiaDeServicio } from "./tipos";

export const GUIA_SMARTLOOP: GuiaDeServicio = {
  clave: "smartloop",
  nombre: "SmartLoop",
  documento: "Proceso de SmartLoop",
  etapas: {
    diagnostico: {
      queHaces:
        "Mides las ocho dimensiones del área y confirmas qué resultado persigue el cliente. Desde el segundo ciclo puede ser un diagnóstico simple: parte de lo aprendido en el ciclo anterior.",
      producido: [
        { clave: "niveles", texto: "El nivel de cada dimensión del área" },
        { clave: "riesgos", texto: "Los riesgos activos" },
        { clave: "retos", texto: "Los retos concretos que se van a atacar" },
      ],
      senal: "Se está implementando lo que el cliente pidió sin saber si es lo que necesita.",
    },
    planificacion: {
      queHaces:
        "Diseñas el ciclo: qué casos de uso entran, qué dimensiones mueve cada uno y a qué nivel, el criterio de aceptación con su métrica, la meta, las fechas, lo que necesitas del cliente y qué va a ver cada semana. No se planifica todo: se planifica el ciclo.",
      producido: [
        { clave: "casos-con-criterio", texto: "Los casos de uso, cada uno con su criterio de aceptación" },
        { clave: "meta", texto: "La meta del ciclo" },
        { clave: "fechas", texto: "Las fechas del ciclo" },
        { clave: "version-aprobada", texto: "El cronograma del ciclo, presentado al cliente y guardado como versión aprobada" },
      ],
      senal: "Nadie puede decir qué dimensión se va a mover, qué métrica tiene que cambiar ni cuándo se sabrá si funcionó.",
    },
    implementacion: {
      queHaces:
        "Construyes lo necesario para producir un impacto medible, sin sobreingeniería. Antes de entregarlo a todo el equipo, lo muestras funcionando solo a los champions.",
      producido: [
        { clave: "validado-champions", texto: "Lo construido, probado y validado por los champions" },
        { clave: "rediagnostico", texto: "El diagnóstico de lo que tocó cada caso de uso (el nivel queda por confirmar si le faltan hábitos)" },
      ],
      senal: "La primera vez que alguien del cliente ve el sistema es frente a todo el equipo.",
    },
    adopcion: {
      queHaces:
        "Acompañas al equipo del cliente para que lo implementado se vuelva su forma real de trabajar: capacitación, soporte cercano y revisar en la historia del sistema que los hábitos se sostienen.",
      producido: [
        { clave: "uso-diario", texto: "El equipo usando lo implementado en su trabajo diario" },
        { clave: "habitos", texto: "Los hábitos confirmados, o identificados los que todavía no se sostienen" },
      ],
      senal: "La información vuelve al WhatsApp o a las hojas de cálculo.",
    },
    aprendizaje: {
      queHaces:
        "Es la sesión de cierre: mides el criterio de cada caso de uso y la meta, decides cada pendiente (se cerró, pasa al siguiente ciclo o se descarta), revisas los pedidos fuera de alcance y propones el siguiente ciclo.",
      producido: [
        { clave: "criterios-medidos", texto: "El criterio de aceptación de cada caso de uso, medido" },
        { clave: "meta-evaluada", texto: "La meta del ciclo, evaluada" },
        { clave: "pendientes-decididos", texto: "Ningún pendiente sin decisión" },
        { clave: "siguiente-ciclo", texto: "La propuesta del siguiente ciclo" },
      ],
      senal: "El ciclo se cerró porque se entregaron las tareas, no porque se midió el resultado.",
    },
  },
  reglaDeCierre:
    "Un ciclo no se cierra sin su sesión de aprendizaje ni sin el criterio de aceptación medido de cada caso de uso. Si la métrica no se movió, se reporta tal cual. Al cerrar, el proyecto vuelve a Diagnóstico.",
};
