/**
 * lib/documentacion/semillas/customer-success/land-and-expand.ts — la página «Land and Expand».
 *
 * La teoría en simple y, sobre todo, cómo se aplica en Smarteam con lo que ya existe: la meta del
 * departamento es el «land», la adopción es la prueba, y las señales de expansión ya las muestran
 * Nexus y HubSpot (el vigilante de cuentas, los negocios de tipo expansión, la Escala).
 *
 * Las metas de expansión salen de los perfiles de puesto: el CSE 2 por semestre, el CSL 6 por año.
 */
import {
  aviso,
  divisor,
  enlace,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  type PaginaSembrada,
} from "../bloques";
import { a, pagina } from "./enlaces";

export function construirLandAndExpand(): PaginaSembrada {
  return {
    ...pagina("landAndExpand"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "se entra a una cuenta con algo acotado que resuelve un problema rápido, y la cuenta crece porque funcionó — no porque insistimos.",
      ),

      titulo(2, "La teoría"),
      parrafo(
        "Land and Expand es un modelo de crecimiento. En vez de vender todo el alcance de entrada, se gana un primer proyecto acotado —un equipo, un caso de uso, un presupuesto— y se usan sus resultados para justificar el siguiente. El primer proyecto está pensado para cerrarse rápido y probar valor pronto.",
      ),
      parrafo("Después, la cuenta crece por tres palancas:"),
      tarjetas(
        "3",
        tarjeta("Más usuarios", "Más personas o equipos del cliente usando lo que ya existe: asientos, áreas nuevas."),
        tarjeta(
          "Más productos",
          "Hubs, add-ons o servicios nuevos: de Sales Hub a Service Hub, una integración, SmartLoop.",
        ),
        tarjeta(
          "Más uso",
          "Lo mismo, usado más a fondo: automatizaciones, reportes, procesos que pasan a vivir en el sistema.",
        ),
      ),
      titulo(4, "Por qué vale más que un cliente nuevo"),
      parrafo(
        "La medida es la retención neta de ingresos: cuánto factura hoy la cartera que ya teníamos, comparado con lo que facturaba, sin contar a los clientes nuevos. Por encima de 100%, los clientes que crecen compensan a los que se van. Crecer adentro de una cuenta que ya confía cuesta menos que conseguir una nueva, y la relación ya está hecha.",
      ),

      titulo(2, "Cómo lo aplicamos en Smarteam"),
      tarjetas(
        "3",
        tarjeta(
          "Land — la implementación",
          "El proyecto se entrega en el alcance y la fecha pactados. Es la meta del departamento, y no por casualidad: un proyecto que se estiró o se atrasó no deja con qué pedir el siguiente.",
        ),
        tarjeta(
          "La prueba — la adopción",
          "El cliente usa lo implementado: licencias en uso, usuarios habilitados, procesos que viven en HubSpot. Sin esto no hay expansión que proponer; hay una deuda pendiente.",
        ),
        tarjeta(
          "Expand — lo que sigue",
          "Hubs, licencias o servicios nuevos que salen de una necesidad detectada, y SmartLoop para que la operación siga mejorando después de la entrega.",
        ),
      ),
      parrafoRico("El servicio recurrente que sostiene la expansión: ", a("smartloop"), "."),
      aviso(
        "advertencia",
        ["El orden no se salta: ", { negrita: true }],
        "primero se cumple, después se prueba y recién ahí se expande. Proponer más antes de que el cliente use lo que compró es la forma más rápida de perder su confianza.",
      ),

      titulo(2, "Las señales de expansión"),
      parrafo("No hace falta adivinar: Nexus y HubSpot ya muestran dónde hay espacio."),
      tabla([
        ["Señal", "Dónde se ve", "Qué suele indicar"],
        [
          "Un dolor nuevo en una sesión de descubrimiento",
          "Lo que escribe el CSE cada semana",
          "Una necesidad que el alcance actual no cubre.",
        ],
        [
          "La brecha en la Escala de rendimiento",
          "El diagnóstico de la cuenta",
          "La dimensión que frena al departamento del cliente suele ser el siguiente proyecto.",
        ],
        [
          "Alerta de «Expansión»",
          "Éxito del cliente: el vigilante de cuentas la levanta antes de la renovación",
          "Una oportunidad concreta, con su evidencia.",
        ],
        [
          "Alerta de «Licencias sin usar»",
          "Éxito del cliente",
          "No es expansión: es adopción pendiente. Primero se resuelve el uso.",
        ],
        [
          "Renovación cerca",
          "Alertas de «Renovación» y el tablero de la cartera",
          "El momento natural para revisar qué más necesita la cuenta.",
        ],
        [
          "Uso alto y sostenido",
          "El uso real de las licencias por cuenta",
          "La cuenta está lista para crecer: más usuarios o más hubs.",
        ],
        [
          "Un negocio de expansión abierto en HubSpot",
          "El tablero de la cartera, que ya los lee de HubSpot",
          "La conversación empezó: hay que acompañarla desde la cuenta.",
        ],
      ]),

      titulo(2, "Quién hace qué"),
      tabla([
        ["Paso", "Quién", "Cómo"],
        ["Detectar", "CSE", "Una necesidad nueva por semana en sus cuentas, escrita."],
        [
          "Validar y priorizar",
          "CSL con el CSE",
          "Dos cuentas por semana: se decide si la oportunidad es real y cuál es el camino de crecimiento de la cuenta.",
        ],
        ["Llevar a la mesa", "CSL", "En el bucle quincenal con Ventas, y con Marketing cuando toca."],
        ["Negociar y cerrar", "Ventas", "Propuesta, precio y contrato."],
        ["Registrar", "CSE", "La Entrega de cada proyecto deja la sugerencia para Ventas."],
      ]),
      parrafo(
        "Las metas: dos expansiones por semestre en las cuentas de cada CSE, y seis en el año para la cartera que lleva el CSL. Se miden en HubSpot, con los negocios de tipo expansión.",
      ),

      titulo(2, "Antipatrones"),
      tarjetas(
        "2",
        tarjeta(
          "Vender antes de que adopten",
          "Se propone el siguiente hub con la implementación a medio usar. El cliente escucha «más costo» donde esperaba «más valor».",
        ),
        tarjeta(
          "Esperar a que el cliente pida",
          "La expansión aparece solo cuando el cliente la trae. Para entonces, a veces ya se la ofreció otro.",
        ),
        tarjeta(
          "Alcance regalado como «expansión gratis»",
          "Se hace trabajo nuevo sin cotizarlo para ganar buena voluntad. No expande la cuenta: le enseña al cliente que el alcance se negocia solo.",
        ),
        tarjeta(
          "Una cartera sin camino de crecimiento",
          "Ninguna cuenta tiene claro qué sigue. Se atiende lo urgente y la expansión nunca llega a la agenda.",
        ),
      ),

      divisor(),
      parrafoRico(
        "Para leer más: ",
        enlace("Land and expand strategy for B2B accounts — Zoomforth", "https://www.zoomforth.com/blog/land-and-expand-strategy/"),
        ". Relacionadas: ",
        a("rolCsl"),
        " · ",
        a("smartloop"),
        " · ",
        a("escala"),
        ".",
      ),
    ],
  };
}
