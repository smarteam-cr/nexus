/**
 * lib/documentacion/semillas/customer-success/portada.ts — la página «Customer Success».
 *
 * La portada del departamento: qué hace, cómo se reparte entre CSE y CSL, dónde está en el equipo,
 * la meta del semestre, el ritmo de reuniones y qué se mide. Sale de los dos perfiles de puesto que
 * viven en Roles (CSE actualizado el 2026-09-02, CSL el 2026-07-30) y del organigrama de la
 * propuesta del CSL.
 *
 * ⛔ Nada de la oferta económica ni de comisiones: esta base la lee todo el equipo.
 */
import {
  aviso,
  divisor,
  numerado,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
} from "../bloques";
import type { BloqueGuardado } from "../../tipos";
import { a } from "./enlaces";

export function bloquesDePortada(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "Customer Success es el área que se asegura de que lo que el cliente compró le resuelva el problema — y de que la cuenta crezca porque funcionó, no porque insistimos.",
    ),

    titulo(2, "Qué hacemos"),
    parrafo(
      "Smarteam está en transformación hacia una consultoría tecnológica potenciada por IA: la IA toma el trabajo repetitivo y las personas se enfocan donde aportan más — pensamiento crítico, criterio consultivo, relación con el cliente, adopción y velocidad de respuesta.",
    ),
    parrafo(
      "En Customer Success eso se traduce en tres responsabilidades: que cada proyecto se entregue en el alcance y la fecha pactados, que el cliente use de verdad lo que implementamos, y que la cartera renueve y se expanda.",
    ),

    titulo(2, "Cómo se reparte el trabajo"),
    tarjetas(
      "2",
      tarjeta(
        "Customer Success Executive (CSE) — dueño de sus cuentas",
        "Implementa HubSpot de punta a punta, lleva la relación diaria con el cliente y logra que lo implementado resuelva el problema del negocio.",
        parrafoRico("El rol completo: ", a("rolCse"), "."),
      ),
      tarjeta(
        "Customer Success Lead (CSL) — responde por la cartera",
        "Anticipa riesgos, lidera la retención, la salud y la expansión de toda la cartera, y forma el criterio de cada CSE.",
        parrafoRico("El rol completo: ", a("rolCsl"), "."),
      ),
    ),
    aviso(
      "advertencia",
      ["La regla que ordena todo: ", { negrita: true }],
      "la cuenta es del CSE. El CSL entra cuando la cuenta se escala, cuando se decide alcance o fecha, o para formar criterio — no para hacer el trabajo por el CSE.",
    ),

    titulo(2, "Dónde está en el equipo"),
    parrafo(
      "El esqueleto del equipo, que no es una cadena de mando: sirve para saber qué piezas existen y con quiénes trabaja Customer Success.",
    ),
    numerado("CEO."),
    numerado("CRO, con Administración."),
    numerado("RevOps & Operations."),
    numerado("Ventas."),
    numerado("Customer Success Lead, con su equipo de CSEs."),
    numerado("Líder de desarrollo, con su equipo."),
    numerado("Marketing."),
    tabla([
      ["Con", "Qué se cruza con Customer Success"],
      ["Ventas", "Entrega el traspaso de lo vendido. Recibe las oportunidades de expansión, y las negocia y las cierra."],
      ["Desarrollo", "Construye lo que va a medida. Recibe las trabas técnicas que se repiten de proyecto en proyecto."],
      ["RevOps", "Recibe lo que la implementación revela sobre el proceso comercial de punta a punta."],
      ["Marketing", "Entra en el bucle con Ventas cuando la conversación es de expansión."],
      ["Administración", "Cobra y factura. El CSE avisa si el cliente menciona un tema de pago, y sigue con lo suyo."],
    ]),

    titulo(2, "La meta del semestre"),
    parrafo("Al 15 de noviembre, el departamento persigue dos condiciones a la vez:"),
    tarjetas(
      "2",
      tarjeta("100% de los proyectos en el alcance contratado", "Cero extensiones regaladas."),
      tarjeta(
        "100% de los proyectos entregados en la fecha pactada",
        "O con retrasos imputables exclusivamente al cliente.",
      ),
    ),
    parrafo(
      "Regalar alcance y correr la fecha son la misma fuga vista de dos lados: se come el margen del proyecto y la credibilidad de la siguiente promesa. Cumplir las dos es lo que hace que la cartera renueve y se expanda. La meta del CSL es la suma de la de sus CSEs.",
    ),

    titulo(2, "El ritmo"),
    tabla([
      ["Reunión", "Cuándo", "Quiénes", "Para qué"],
      [
        "Sesión de Customer Success",
        "Lunes 8:30 · 20 min · no se mueve",
        "CSL y todos los CSEs",
        "Cada quien rinde cuentas de su compromiso, se mira el marcador y cada quien se compromete a una o dos movidas para la semana. El torbellino del día a día no entra.",
      ],
      [
        "Revisión de cuenta",
        "Semanal si está en riesgo; quincenal el resto",
        "CSL y el CSE de la cuenta",
        "El cronograma y el estado real del negocio: qué lo frena, quién decide, qué se escala. Sale con acciones y responsable.",
      ],
      [
        "Bucle con Ventas",
        "Quincenal · 30 min",
        "CSL y Ventas (Marketing si toca expansión)",
        "Lo vendido que no coincide con lo implementado, y las cuentas con potencial de expansión.",
      ],
      [
        "1:1",
        "Mensual · 45 min",
        "CSL y cada CSE",
        "Ruta de madurez, criterio consultivo y carga de trabajo. Es formación, no revisión de tareas.",
      ],
      [
        "Sesiones con el cliente",
        "Según el cronograma",
        "CSE y la contraparte del cliente",
        "Descubrimiento, validación, habilitación y entrega. Las conduce el CSE; el CSL entra cuando la cuenta se escala.",
      ],
    ]),

    titulo(2, "Qué se mide"),
    parrafo(
      "Dos tipos de medida. Las de predicción se mueven esta semana y anticipan el resultado; las de resultado llegan después y lo confirman. El detalle de cada rol está en su página.",
    ),
    tarjetas(
      "2",
      tarjeta(
        "Lo que se mira todas las semanas",
        vinneta("Sesiones de descubrimiento con un dolor nuevo escrito."),
        vinneta("La etapa real de cada proyecto: ninguno dos semanas quieto."),
        vinneta("Health-checks a las cuentas en riesgo."),
        vinneta("Conversaciones de expansión abiertas."),
      ),
      tarjeta(
        "Lo que confirma el semestre",
        vinneta("Proyectos en alcance y en fecha."),
        vinneta("Uso real de las licencias por cuenta."),
        vinneta("Cuentas en riesgo al cierre."),
        vinneta("Expansión cerrada."),
      ),
    ),
    parrafo(
      "Todo sale de HubSpot: el pipeline de proyectos, el objeto de Partner Clients y los reportes de actividades y de negocios de expansión.",
    ),

    titulo(2, "Esta sección"),
    parrafoRico("Los roles: ", a("rolCse"), " · ", a("rolCsl"), "."),
    parrafoRico("El día a día del CSE, etapa por etapa: ", a("guiaCse"), "."),
    parrafoRico("Lo que distingue a quien hace bien este trabajo: ", a("competencias"), "."),
    parrafoRico(
      "Cómo se construye la relación con el cliente: ",
      a("confianza"),
      " · ",
      a("reunion"),
      " · ",
      a("descubrimiento"),
      ".",
    ),
    parrafoRico("Cómo crece una cuenta: ", a("landAndExpand"), "."),
    parrafoRico("El servicio recurrente y cómo se opera: ", a("smartloop"), " · ", a("smartloopProceso"), "."),

    divisor(),
    parrafoRico([
      "Sale de los perfiles de puesto de CSE y CSL que viven en Roles. Si un perfil cambia, esta sección se revisa.",
      { italica: true },
    ]),
  ];
}
