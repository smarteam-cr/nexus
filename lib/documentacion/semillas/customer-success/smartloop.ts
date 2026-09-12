/**
 * lib/documentacion/semillas/customer-success/smartloop.ts — «SmartLoop» y su proceso operativo.
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * · El modelo (el problema, las cinco etapas y por qué ninguna se salta, qué incluye el mes, para
 *   quién es) sale del material público: `sitio web smarteam/templates/smartloop.html` y
 *   `Landings/smartloop/index.html`, reescrito para el equipo.
 * · El proceso operativo NO estaba escrito en ningún lado. Lo propusimos el 2026-09-12 con lo que ya
 *   existe —el servicio tal como se vende y cómo Nexus maneja hoy los proyectos recurrentes (el
 *   ciclo corto y el traspaso con metas sostenidas)—, y Elías decidió que lo ejecuta el CSE de la
 *   cuenta. Lo que no tiene respaldo va marcado «a validar».
 *
 * ⚠ De la landing NO se copia su sección de la Escala: usa la v4 («Capacidad 40% / Output 60%»),
 * que la v5.2.0 ya reemplazó. Tampoco se confunde el Smart Loop con «Loop Marketing», el marco de
 * HubSpot que usaba la Escala vieja.
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
  type PaginaSembrada,
} from "../bloques";
import { a, pagina } from "./enlaces";

/* ── El proceso operativo ───────────────────────────────────────────────────── */

function construirProcesoOperativo(): PaginaSembrada {
  return {
    ...pagina("smartloopProceso"),
    bloques: [
      aviso(
        "advertencia",
        ["Propuesta a validar. ", { negrita: true }],
        "Este proceso se armó con lo que ya dice el servicio y con cómo Nexus maneja hoy los proyectos recurrentes. Lo marcado «a validar» todavía no es un acuerdo del equipo.",
      ),
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "SmartLoop lo corre el CSE de la cuenta, en vueltas mensuales que arrancan con una hipótesis y cierran con una métrica medida y un reporte.",
      ),

      titulo(2, "Quién hace qué"),
      tabla([
        ["Rol", "Qué hace"],
        [
          "CSE de la cuenta",
          "Ejecuta las vueltas: diagnostica, planifica, implementa, acompaña la adopción y arma el reporte. Es la contraparte del cliente, igual que en un proyecto.",
        ],
        [
          "CSL",
          "Mira la cartera de SmartLoop: qué cuentas mueven su métrica, cuáles se estancaron y cuáles tienen espacio para crecer. Entra cuando una vuelta se traba o cuando se decide la renovación.",
        ],
        ["Ventas", "Contrata y renueva el servicio, y negocia la expansión que sale de las vueltas."],
        [
          "Desarrollo",
          "Construye lo que una vuelta necesite a medida: integraciones o automatizaciones que no se resuelven con configuración.",
        ],
      ]),

      titulo(2, "El alta en Nexus"),
      parrafo("SmartLoop no necesita un circuito aparte: Nexus ya sabe llevar un proyecto recurrente."),
      numerado("Ventas cierra el contrato y da el traspaso, como en cualquier proyecto."),
      numerado(
        "El proyecto queda marcado como recurrente. Con esa marca no recorre las ocho etapas de una implementación: va por el ciclo corto — Hand Off, Operación continua, Entrega y Finalizado.",
      ),
      numerado(
        "El traspaso de un proyecto recurrente no pide hitos con fecha de cierre: pide metas sostenidas —nivel de servicio, adopción, renovación— y lee la Entrega de los ciclos anteriores, para que la vuelta nueva empiece donde terminó la otra.",
      ),
      numerado("El arranque con el cliente fija la métrica de la primera vuelta, el canal de soporte y la fecha del primer reporte."),
      aviso(
        "info",
        "La marca de recurrente la propone el agente del traspaso. Si no quedó puesta, el CSE la puede agregar a mano y regenerar el traspaso para que pida metas sostenidas.",
      ),

      titulo(2, "El mes tipo"),
      parrafoRico(["A validar. ", { negrita: true }], "Una vuelta por mes, en cuatro semanas:"),
      tabla([
        ["Semana", "Etapas", "Qué sale"],
        [
          "1",
          "Diagnóstico y planificación",
          "El frente de la vuelta, la hipótesis («si automatizamos la asignación, el tiempo de primera respuesta baja a una hora») y la métrica con su valor de partida.",
        ],
        ["2 y 3", "Implementación y adopción", "Los cambios en producción y el acompañamiento a los usuarios que los tienen que usar."],
        ["4", "Aprendizaje", "La métrica medida contra su valor de partida, lo que se aprendió y el reporte ejecutivo del mes."],
      ]),
      parrafo("El banco de horas corre en paralelo, para los ajustes y pedidos del equipo del cliente que no justifican una vuelta."),

      titulo(2, "Lo que produce cada vuelta"),
      tarjetas(
        "2",
        tarjeta(
          "La hipótesis y su métrica",
          "Escrita antes de tocar nada, con el valor de partida. Una vuelta sin métrica no se puede cerrar.",
        ),
        tarjeta(
          "El roadmap vivo",
          "El backlog priorizado por impacto. Se reordena al cierre de cada vuelta con lo que se aprendió.",
        ),
        tarjeta(
          "El reporte ejecutivo",
          "Qué se movió, qué métrica cambió, qué se aprendió y qué sigue. Si un mes no hubo impacto medible, se dice.",
        ),
        tarjeta(
          "El uso del banco de horas",
          "Cuántas horas se usaron y en qué. Es lo que permite discutir la renovación con datos.",
        ),
      ),

      titulo(2, "Cada trimestre"),
      vinneta("Se vuelve a medir la operación con la Escala de rendimiento, con las mismas dimensiones y los mismos criterios."),
      vinneta("Se compara dimensión por dimensión contra la medición anterior: el avance tiene que verse, no sentirse."),
      vinneta("Se revisa con el cliente si el frente de las próximas vueltas sigue siendo el correcto."),
      vinneta("El CSL revisa la cuenta con el CSE: métrica, uso de horas y espacio para crecer."),

      titulo(2, "Cierre de ciclo y renovación"),
      parrafo(
        "Al terminar el período contratado, la Entrega del ciclo resume las vueltas, las métricas que se movieron y el nivel de la Escala al inicio y al final. Esa Entrega publicada es la que lee el traspaso del ciclo siguiente.",
      ),
      parrafoRico(
        ["A validar: ", { negrita: true }],
        "la renovación la conversan Ventas y el CSL con ese resumen en la mano, un mes antes del vencimiento.",
      ),

      titulo(2, "Señales de que el loop se está rompiendo"),
      tarjetas(
        "2",
        tarjeta(
          "Una vuelta sin métrica",
          "Se hicieron cambios, pero nadie puede decir qué movieron. El servicio se vuelve una bolsa de horas.",
        ),
        tarjeta(
          "Horas sin usar",
          "El banco se acumula mes a mes. El cliente paga algo que no está usando, y eso llega a la renovación.",
        ),
        tarjeta(
          "Reportes sin impacto",
          "Dos meses seguidos sin una métrica movida. Hay que cambiar el frente, no seguir girando sobre el mismo.",
        ),
        tarjeta(
          "Todo es urgencia",
          "Las horas se van en pedidos sueltos y ninguna vuelta llega al aprendizaje. El servicio vuelve a ser soporte.",
        ),
      ),

      titulo(2, "Preguntas abiertas"),
      aviso("advertencia", "Todavía no están definidas, y conviene acordarlas antes de ofrecerlo a más cuentas:"),
      vinneta("¿Qué pasa con las horas del mes que no se usan: se pierden, se acumulan o tienen un tope?"),
      vinneta("¿Cuáles son los tiempos de respuesta del soporte, y en qué horario?"),
      vinneta("¿Cómo y cuándo se decide la renovación, y quién la lleva?"),
      vinneta("¿Dónde se registran las horas del banco: en Nexus o en HubSpot?"),

      divisor(),
      parrafoRico("Relacionadas: ", a("smartloop"), " · ", a("rolCse"), " · ", a("landAndExpand"), "."),
    ],
  };
}

/* ── El modelo ──────────────────────────────────────────────────────────────── */

export function construirSmartloop(): PaginaSembrada {
  return {
    ...pagina("smartloop"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "SmartLoop es la forma de trabajar de Smarteam —cinco etapas que vuelven a empezar— y también el servicio recurrente que la aplica todos los meses sobre la operación del cliente.",
      ),

      titulo(2, "Dos cosas con el mismo nombre"),
      tarjetas(
        "2",
        tarjeta(
          "El Smart Loop — la metodología",
          "Diagnóstico, planificación, implementación, adopción y aprendizaje. Es el ciclo con el que se ejecuta cada servicio: en un proyecto, el loop gira algunas vueltas y se detiene.",
        ),
        tarjeta(
          "SmartLoop — el servicio recurrente",
          "Un retainer mensual para empresas que ya implementaron: el loop no deja de girar. Cada mes hay diagnóstico, cambios en producción, adopción acompañada y aprendizaje que alimenta la vuelta siguiente.",
        ),
      ),

      titulo(2, "El problema que resuelve"),
      parrafo(
        "La curva de un proyecto que se entrega y se congela es siempre la misma: sube rápido y cae más rápido. No falla la herramienta; falla el modelo. El alcance se definió antes de usar el sistema, y los ajustes críticos aparecen cuando la operación real lo pone a prueba — cuando ya no quedan horas del proyecto.",
      ),
      parrafo("Estos son los cinco síntomas que se ven en cuentas que ya invirtieron y siguen sin moverse:"),
      numerado("Las necesidades reales se descubren tarde: justo después del go-live, cuando ya no hay horas."),
      numerado("El CRM queda instalado, pero sin impacto: todo configurado y las métricas no cambian."),
      numerado("El equipo abandona el CRM por WhatsApp: si el sistema no facilita, estorba, y si estorba, se evita."),
      numerado("Checklist verde, operación gris: alcance cumplido no es lo mismo que resultado logrado."),
      numerado(
        "El sistema congela la forma de trabajar: lo que se configuró hace un año y medio sigue igual, aunque la empresa ya sea otra.",
      ),
      parrafo(
        "La alternativa no es un proyecto más grande: es cambiar la forma de la curva. Vueltas cortas que entregan valor medible y suben el piso de la siguiente — interés compuesto operativo.",
      ),

      titulo(2, "Las cinco etapas"),
      parrafo("Ninguna se salta, y después de la quinta el loop vuelve a empezar con lo aprendido a bordo."),
      tarjetas(
        "2",
        tarjeta(
          "1 · Diagnóstico",
          "Entender dónde está limitada la operación hoy y encontrar el punto exacto donde subir el nivel produce más valor.",
          "Por qué no se salta: sin diagnóstico se implementa lo que se pide, no lo que se necesita. Se construye sobre supuestos, no sobre evidencia.",
        ),
        tarjeta(
          "2 · Planificación",
          "Diseñar la próxima vuelta: alcance acotado, hipótesis clara y métrica de éxito. No se planifica todo; se planifica lo siguiente.",
          "Por qué no se salta: planificar todo de una vez es planificar el abandono. Planificar la próxima vuelta mantiene la inversión en lo que sí se va a mover.",
        ),
        tarjeta(
          "3 · Implementación",
          "Construir los cambios en el sistema: lo suficiente para producir impacto medible, sin sobreingeniería que después estorbe.",
          "Por qué no se salta: cada cambio es una hipótesis que se confirma o se descarta en el uso. Si no se construye, no hay nada que adoptar ni que aprender.",
        ),
        tarjeta(
          "4 · Adopción",
          "Capacitar y acompañar de forma coordinada, para que el equipo incorpore el cambio a su trabajo real.",
          "Por qué no se salta: un cambio que el equipo no adopta es un cambio que no ocurrió. Sin acompañar la transición, la operación vuelve a sus viejos hábitos.",
        ),
        tarjeta(
          "5 · Aprendizaje",
          "Observar cómo se usó lo adoptado: qué funcionó, qué no y qué cambió en el contexto. Eso alimenta el siguiente diagnóstico.",
          "Por qué no se salta: sin aprendizaje, el loop se rompe y vuelve a ser un proyecto. Es lo que separa repetir de evolucionar.",
        ),
      ),

      titulo(2, "Proyecto contra loop"),
      tabla([
        ["", "Proyecto", "SmartLoop"],
        ["Forma", "Tiene inicio y fin; se entrega y se congela", "Vueltas mensuales que no se detienen"],
        ["Inversión", "Concentrada en un go-live grande", "En cadencia: cada vuelta sube el piso de la siguiente"],
        ["Alcance", "Se define antes de usar el sistema", "Se define vuelta a vuelta, con lo aprendido"],
        ["Éxito", "Alcance cumplido", "Métrica movida y adopción sostenida"],
        ["Qué deja", "Un sistema instalado", "Un sistema que evoluciona con la operación"],
      ]),

      titulo(2, "Para quién es, y para quién no"),
      tarjetas(
        "3",
        tarjeta(
          "Es para",
          "Empresas que ya pasaron el go-live —con nosotros o con otro partner— y no quieren que el sistema se congele; portales que funcionan pero quedaron quietos; empresas que crecen rápido y necesitan que el sistema evolucione al mismo ritmo.",
        ),
        tarjeta(
          "Todavía no, si no tiene CRM",
          "SmartLoop optimiza sistemas que existen. Primero va una implementación.",
        ),
        tarjeta(
          "Todavía no, si el CRM está muerto",
          "Si nadie lo carga ni lo mira, primero va un rescate. Después, SmartLoop es lo que evita la recaída.",
        ),
      ),

      titulo(2, "Qué incluye cada mes"),
      tarjetas(
        "2",
        tarjeta(
          "Vueltas de optimización",
          "Al menos una vuelta completa por mes sobre un frente concreto: diagnóstico, plan acotado, cambios en producción, adopción acompañada y aprendizaje documentado.",
        ),
        tarjeta(
          "Horas de mejora continua",
          "Un banco mensual de consultoría e implementación para ajustes, automatizaciones y pedidos del equipo, sin abrir un proyecto nuevo por cada cambio.",
        ),
        tarjeta(
          "Monitoreo de la operación",
          "Adopción, calidad del dato, integraciones y workflows: los desvíos se detectan antes de que se vuelvan costumbre.",
        ),
        tarjeta(
          "Reporte ejecutivo mensual",
          "Para la dirección, no para técnicos: qué se movió, qué métricas cambiaron, qué se aprendió y qué sigue.",
        ),
        tarjeta("Roadmap vivo", "Un backlog priorizado por impacto que se reordena con cada aprendizaje."),
        tarjeta(
          "Soporte del equipo",
          "Un canal directo para dudas, incidencias y ajustes menores, con tiempos de respuesta definidos.",
        ),
      ),

      titulo(2, "Cómo se conecta con la Escala de rendimiento"),
      parrafoRico(
        "La Escala dice dónde está la operación, y SmartLoop es lo que la mueve al siguiente nivel. La primera remedición va entre 60 y 90 días después de entregar, y después cada trimestre: en SmartLoop, esa remedición es el diagnóstico de la vuelta que abre el trimestre. El reglamento: ",
        a("escala"),
        ".",
      ),

      titulo(2, "Cómo se opera"),
      parrafoRico("Quién lo lleva, cómo se da de alta en Nexus y cómo corre el mes: ", a("smartloopProceso"), "."),

      divisor(),
      parrafoRico("Relacionadas: ", a("landAndExpand"), " · ", a("customerSuccess"), "."),
    ],
    hijas: [construirProcesoOperativo()],
  };
}
