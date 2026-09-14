/**
 * lib/documentacion/semillas/base/como-trabajamos.ts — la sección «Cómo trabajamos».
 *
 *   🗓️ Cómo trabajamos
 *   ├── 🤝 ¿Cómo trabajar en Smarteam?   ← la que ya existía: canales, grabación, escritura
 *   └── ⏰ Horario y condiciones
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * Las condiciones salen de las propuestas de contratación de Smarteam (la imagen que compartió Elías
 * el 2026-09-13). ⛔ Solo lo que es de TODOS: la jornada, el horario, las vacaciones, los feriados y
 * la capacitación. Lo que es de cada contrato —la remuneración, la agencia de pago y la bonificación—
 * NO entra, y lo que era propio de un puesto de liderazgo (disponibilidad para la dirección) tampoco.
 * La prueba de `paginas.test.ts` lo vigila en toda la base.
 *
 * La sesión de aprendizaje es el único espacio fijo de la empresa que Elías nombró: se dice que
 * existe y nada más, porque su cadencia no está escrita en ningún lado.
 */
import {
  aviso,
  divisor,
  parrafo,
  parrafoRico,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "../bloques";
import type { BloqueGuardado } from "../../tipos";
import { construirTrabajarEnSmarteam } from "../trabajar-en-smarteam";
import { a as deCs } from "../customer-success/enlaces";
import { a, pagina } from "./enlaces";

const nota = (texto: string) => parrafoRico([texto, { italica: true }]);

function bloquesDeComoTrabajamos(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "trabajamos a distancia desde varios países, con un horario de referencia común, canales claros y un espacio fijo para aprender juntos.",
    ),
    tarjetas(
      "2",
      tarjeta(
        "Los canales y las reuniones",
        "Por dónde se habla cada cosa, en cuánto se responde, y cómo se graba y se nombra una reunión.",
        parrafoRico(deCs("trabajar")),
      ),
      tarjeta(
        "Horario y condiciones",
        "La jornada, las vacaciones, los feriados y la capacitación.",
        parrafoRico(a("condiciones")),
      ),
    ),

    titulo(2, "Los espacios fijos"),
    parrafo("La sesión de aprendizaje es el espacio fijo de todo el equipo para aprender juntos."),
    parrafoRico(
      "Cada departamento tiene además sus propias reuniones. Las de Customer Success, con su día y su para qué, están en ",
      deCs("customerSuccess"),
      ".",
    ),

    titulo(2, "Cómo avanza un proyecto"),
    parrafoRico(
      "Las etapas de un proyecto y el documento que se trabaja en cada una: ",
      deCs("nexus"),
      ". El día a día de quien lleva la cuenta, etapa por etapa: ",
      deCs("guiaCse"),
      ".",
    ),
  ];
}

function bloquesDeCondiciones(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "jornada diurna de lunes a viernes con el horario de Costa Rica como referencia, 12 días de vacaciones y 11 feriados.",
    ),

    titulo(2, "La jornada"),
    vinneta("Jornada diurna continua acumulada."),
    vinneta("De 8:00 a 17:00, hora de Costa Rica, de lunes a viernes."),
    parrafoRico(
      "Es el horario de referencia del equipo: dentro de él corre el tiempo de respuesta de 3 horas en Slack (ver ",
      deCs("trabajar"),
      ").",
    ),

    titulo(2, "Vacaciones y feriados"),
    tarjetas(
      "2",
      tarjeta("12 días de vacaciones", "Para descansar de verdad."),
      tarjeta("11 días feriados", "Los días en que la empresa no trabaja."),
    ),

    titulo(2, "Crecer"),
    vinneta("Acceso a capacitación constante."),
    vinneta("Participación en los procesos de crecimiento y evolución estratégica de la empresa."),
    vinneta("La sesión de aprendizaje del equipo, el espacio fijo para aprender juntos."),

    titulo(2, "Lo que se espera de cada quien"),
    vinneta("Participación activa en los espacios de medición, seguimiento, planificación y mejora continua."),
    parrafoRico("Y los valores que compartimos: ", a("proposito"), "."),

    aviso(
      "advertencia",
      "Lo que es propio de cada contrato —la remuneración y su forma de pago— no va en esta base: cada persona lo tiene en su propuesta.",
    ),

    divisor(),
    nota("Sale de las condiciones de las propuestas de contratación de Smarteam."),
  ];
}

export function construirComoTrabajamos(): PaginaSembrada {
  return {
    ...pagina("comoTrabajamos"),
    bloques: bloquesDeComoTrabajamos(),
    hijas: [construirTrabajarEnSmarteam(), { ...pagina("condiciones"), bloques: bloquesDeCondiciones() }],
  };
}
