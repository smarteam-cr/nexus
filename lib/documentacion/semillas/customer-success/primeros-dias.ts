/**
 * lib/documentacion/semillas/customer-success/primeros-dias.ts — «Tus primeros días en Customer
 * Success»: la puerta de entrada para quien llega al área.
 *
 * Nació el 2026-09-30, la víspera de que entrara una Customer Success Senior: Elías quería un
 * enlace que juntara todo lo necesario para entender Smarteam y arrancar. La página NO repite lo
 * que ya está escrito: ordena qué hacer y qué leer, y enlaza.
 *
 * Lo que dijo Elías: el líder directo es Alexander (CSL); Elías, junto con él, acompaña todo lo de
 * Nexus —sus procesos— y el pensamiento estratégico, con sesiones los primeros días. Las cuentas
 * llegan rápido, pero con acompañamiento.
 *
 * ⚠ Está dentro de Customer Success: la prueba de la sección prohíbe nombrar vacaciones, sueldos o
 * comisiones. Las condiciones se enlazan, no se escriben.
 */
import {
  aviso,
  numerado,
  parrafo,
  parrafoRico,
  tarjeta,
  tarjetas,
  titulo,
  type PaginaSembrada,
} from "../bloques";
import { LIDERES } from "../base/lideres";
import { a, pagina } from "./enlaces";

const PALABRAS: [string, string][] = [
  ["Handoff o traspaso", "Lo que Ventas le entrega a Customer Success: qué se vendió, a quién y para qué. En Nexus es «Información de la venta»."],
  ["Kickoff o arranque", "La primera reunión con el cliente y el documento que la acompaña: equipo, canales, horarios y cómo vamos a trabajar."],
  ["Exploración", "Entender cómo trabaja hoy el cliente, con un cuestionario previo y sesiones. Es lo que alimenta el diagnóstico."],
  ["Diagnóstico", "Dónde está el cliente y qué le falta, con evidencia. Usa la Escala de rendimiento."],
  ["Cronograma", "El plan del proyecto, con fases, tareas y fechas. Lo propone la IA y lo decides tú."],
  ["Adopción", "Que el equipo del cliente use de verdad lo que se implementó. Configurado no es adoptado."],
  ["CSL Encargado", "La propiedad de HubSpot que dice de quién es una cuenta. Decide qué clientes ves en Nexus."],
  ["Funcional", "El nivel 3 de la Escala: la base donde la operación deja de depender de una persona."],
  ["SmartLoop", "El servicio recurrente: vueltas mensuales que empiezan con una hipótesis y cierran con una métrica."],
  ["Land and Expand", "Cómo crece una cuenta: aterrizar con un primer servicio y expandir con casos de uso."],
];

export function construirPrimerosDias(): PaginaSembrada {
  return {
    ...pagina("primerosDias"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "esta página junta lo que necesitas para arrancar en Customer Success: qué hacer el primer día, qué leer y en qué orden, con quién vas a trabajar y lo que conviene saber desde el día uno.",
      ),
      parrafo(
        "Te damos la bienvenida a Smarteam. No tienes que leer toda la base el primer día: sigue el orden de esta página, y vuelve a ella cuando quieras saber qué sigue.",
      ),

      titulo(2, "Quién te acompaña"),
      tarjetas(
        "2",
        tarjeta(
          `${LIDERES.customerSuccess} — el líder del área`,
          "Customer Success Lead y líder directo de cada CSE. Con él se ven las cuentas, la revisión de cartera y el 1:1 mensual. Para cualquier duda del día a día, empieza por él.",
        ),
        tarjeta(
          `${LIDERES.revops} — Nexus y estrategia`,
          "Revenue Operations. Junto con Alexander, acompaña todo lo de Nexus —sus procesos y cómo se trabaja ahí— y el pensamiento estratégico con que encaramos a cada cliente. Los primeros días hay sesiones con él.",
        ),
      ),

      parrafo(
        "Es la misma guía para todos los que entran al área: síguela en orden. No hay nada que marcar; cada paso dice qué hacer y qué tiene que quedar claro antes de pasar al siguiente.",
      ),

      titulo(2, "El primer día"),
      numerado("Entra a Nexus con tu cuenta de Google de Smarteam y recorre el menú."),
      numerado(
        "Confirma que tienes acceso a las herramientas del día a día: Google (correo, calendario y Meet), Slack, HubSpot y Nexus. Si falta alguna, avísale a tu líder.",
      ),
      numerado("Lee, en este orden, las cinco páginas de «Para entender Smarteam», más abajo."),
      numerado(
        "Revisa tu calendario: la Sesión de Customer Success es los lunes a las 8:30. Dura 20 minutos y no se mueve.",
      ),
      numerado("Primera sesión con Elías: un recorrido por Nexus."),
      numerado("Preséntate en Slack y mira quién es quién en El equipo."),

      titulo(2, "La primera semana"),
      numerado("Lee lo de tu trabajo: el rol de CSE, la Guía de CSE y Nexus para un CSE, paso a paso."),
      numerado(
        "Lee la Escala de rendimiento y recórrela en Nexus → Escala, en el área que mejor conozcas. Lo que no se entienda, coméntalo ahí mismo: así mejora.",
      ),
      numerado("Sesiones con Elías y con tu líder: Nexus, la Escala y cómo pensamos a un cliente."),
      numerado("Entra como oyente a sesiones de clientes de otros CSE."),
      numerado(
        "Recibe tus primeras cuentas, con acompañamiento. En cada una: abre su Resumen en Nexus, lee «Información de la venta» completa y revisa su etapa en HubSpot antes de hablar con el cliente.",
      ),

      titulo(2, "El primer mes"),
      numerado("Cada una de tus cuentas mueve algo cada semana, y su etapa en HubSpot está al día."),
      numerado("Las reuniones con clientes se graban siempre, con el título «Tema | Nombre del cliente»."),
      numerado("Haz —o acompaña— un diagnóstico con la Escala."),
      numerado("Primer 1:1 mensual con tu líder: en qué nivel de la ruta del CSE estás y qué cuentas puedes sostener solo."),
      numerado("Lee las competencias, la relación con el cliente y los nueve modos de que salga mal, en la Guía de CSE."),

      titulo(2, "Para entender Smarteam"),
      parrafo("Cinco páginas, en este orden, alcanzan para saber quiénes somos y cómo trabajamos:"),
      parrafoRico("1. ", a("proposito"), " — por qué existimos y qué nos importa."),
      parrafoRico("2. ", a("empresa"), " — quiénes somos, nuestras alianzas y certificaciones."),
      parrafoRico("3. ", a("servicios"), " — qué vendemos y cómo se elige la plataforma."),
      parrafoRico("4. ", a("trabajar"), " — por dónde se habla cada cosa y cómo se graba una reunión."),
      parrafoRico("5. ", a("customerSuccess"), " — tu área: cómo se reparte el trabajo, la meta del semestre y el ritmo."),

      titulo(2, "Todo lo demás, por tema"),
      tarjetas(
        "3",
        tarjeta(
          "Tu trabajo",
          parrafoRico(a("rolCse")),
          parrafoRico(a("guiaCse")),
          parrafoRico(a("nexusCse")),
          parrafoRico(a("competencias")),
          parrafoRico(a("relacion")),
          parrafoRico(a("landAndExpand")),
          parrafoRico(a("smartloop")),
        ),
        tarjeta(
          "Con qué medimos y trabajamos",
          parrafoRico(a("escala")),
          parrafoRico(a("nexus")),
          parrafoRico(a("herramientas")),
          parrafoRico(a("descubrimiento")),
          parrafoRico(a("reunion")),
        ),
        tarjeta(
          "Smarteam y su gente",
          parrafoRico(a("historia")),
          parrafoRico(a("casos")),
          parrafoRico(a("equipo")),
          parrafoRico(a("condiciones")),
          parrafoRico(a("rolCsl")),
        ),
      ),

      titulo(2, "Diez cosas que conviene saber desde el día uno"),
      numerado(
        "Una cuenta es del CSE que la lleva. En Nexus ves solo las cuentas donde eres el encargado en HubSpot; la asignación la hace el liderazgo.",
      ),
      numerado(
        "Una reunión sin transcripción no existe para Nexus. Activa las notas antes de empezar y nombra la reunión «Tema | Nombre del cliente».",
      ),
      numerado("Lo que escribe la IA es un borrador. Lo que sale con nuestro nombre lo firmas tú."),
      numerado(
        "Nada le llega al cliente hasta que lo subes: cada documento se publica por separado, con el enlace y la contraseña del proyecto.",
      ),
      numerado("El traspaso lo escribe Ventas: tú lo lees y lo completas, no lo rehaces."),
      numerado(
        "HubSpot es el tablero del negocio: la etapa del proyecto, el motivo de un bloqueo y la adopción los mantienes tú al día.",
      ),
      numerado("Configurado no es adoptado: lo que se mide al final es el uso, no la entrega."),
      numerado(
        "Regalar alcance y correr la fecha son la misma fuga. La meta del área es 100% de los proyectos en alcance y 100% en fecha.",
      ),
      numerado(
        "Medimos con la Escala: con evidencia, tomando el piso y no el promedio. La IA propone el nivel; tú lo confirmas.",
      ),
      numerado(
        "Lo que se decide en un chat se anota donde vive el trabajo: el documento del proyecto, la tarea o la particularidad.",
      ),

      titulo(2, "Las palabras que vas a escuchar"),
      ...PALABRAS.map(([termino, definicion]) => parrafoRico([`${termino}: `, { negrita: true }], definicion)),

      aviso(
        "exito",
        ["¿Falta algo o no te sirvió? ", { negrita: true }],
        "Coméntalo en esta misma página: marca el texto y deja tu comentario. Así queda mejor para quien entre después.",
      ),
    ],
  };
}
