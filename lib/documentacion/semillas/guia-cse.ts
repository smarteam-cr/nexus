/**
 * lib/documentacion/semillas/guia-cse.ts — la página «Guía de CSE».
 *
 * Es el trabajo del CSE tal como se hace en Smarteam, no el rol genérico de la industria: el
 * recorrido de una cuenta, qué cierra cada etapa, qué documento se arma dónde, qué confirma una
 * persona y qué no le toca al CSE.
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * La misión, la cadencia, las medidas semanales, los caminos de fracaso y la ruta de crecimiento
 * salen del perfil de puesto que ya vive en Roles (`scripts/seed-perfil-cse.ts`). Las etapas y los
 * documentos NO se escriben acá: los pinta un bloque vivo desde el motor de etapas y el registro
 * de piezas, así la guía no puede quedar desactualizada cuando el recorrido cambie.
 *
 * ⚠ Queda afuera a propósito todo lo de contratación —sueldo, comisiones, condiciones—: eso vive
 * en el módulo de Roles y esta base la lee todo el equipo.
 *
 * AUDIENCIA: el equipo de Smarteam. Lenguaje de negocio, tuteo, cero jerga técnica.
 */
import {
  aviso,
  bloqueVivo,
  desplegable,
  divisor,
  mencion,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "./bloques";
import type { BloqueGuardado } from "../tipos";

function bloques(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "el CSE lleva sus cuentas de punta a punta —explora, diagnostica, arma el cronograma, configura y acompaña la adopción— y responde por una sola cosa: que el cliente termine usando lo que compró, en el alcance y en la fecha que se acordaron.",
    ),

    titulo(2, "Qué hace un CSE acá"),
    parrafo(
      "En la mayoría de las empresas el rol se parte en dos: alguien cuida la relación y alguien configura la herramienta. Acá es la misma persona. El CSE entiende el negocio del cliente, decide qué se implementa, lo configura en HubSpot y se queda hasta que el equipo del cliente lo usa solo.",
    ),
    parrafo(
      "Eso tiene una consecuencia práctica: el trabajo no termina cuando la configuración funciona. Configurado no es adoptado, y lo que se mide al final es el uso, no la entrega.",
    ),
    aviso(
      "advertencia",
      "Una cuenta es del CSE que la lleva. Nexus le muestra a cada CSE sus propias cuentas: si no ves un cliente, es porque no sos su encargado — la asignación la hace el liderazgo.",
    ),

    titulo(2, "La semana"),
    parrafo(
      "El trabajo de una cartera no se ordena solo. Lo que sostiene la semana son cinco cosas que se hacen todas las semanas, pasen o no pasen otras.",
    ),
    tarjetas(
      "2",
      tarjeta(
        "Dos sesiones de descubrimiento",
        "Dos conversaciones por semana donde salga un dolor nuevo del cliente, escrito donde el resto lo pueda leer.",
        "Sin dolor nuevo, la cuenta se vuelve mantenimiento.",
      ),
      tarjeta(
        "Cada proyecto, un paso adelante",
        "Todas las cuentas activas mueven algo cada semana, aunque sea chico. Un proyecto que pasa dos semanas en la misma etapa sin avance es un aviso.",
      ),
      tarjeta(
        "Una cuenta acompañada de verdad",
        "Una vez por semana, sentarse con un usuario real a usar lo que se configuró.",
        "Es la diferencia entre entregar y que lo usen.",
      ),
      tarjeta(
        "Un repaso de cartera",
        "Recorrer las cuentas y marcar las que se están enfriando, antes de que se note por un reclamo.",
      ),
      tarjeta(
        "Una oportunidad detectada",
        "Algo que el cliente necesita y todavía no tiene. Se anota aunque no se venda esta semana.",
      ),
    ),
    titulo(4, "Las reuniones fijas"),
    vinneta("Sesión de Customer Success, lunes temprano y corta. Es sagrada: no se mueve."),
    vinneta("Revisión de cuenta con el CSL: semanal si la cuenta está en riesgo, quincenal el resto."),
    vinneta("Las sesiones del proyecto, según el cronograma acordado con el cliente."),
    vinneta("Un 1:1 mensual con el líder. Es formación, no revisión de tareas."),

    titulo(2, "El recorrido de una cuenta"),
    parrafo(
      "Un proyecto de implementación recorre estas etapas en orden. La etapa la mueve el equipo en HubSpot y Nexus la refleja; cuando Nexus nota que el proyecto ya avanzó, te sugiere el cambio y vos lo confirmás.",
    ),
    bloqueVivo("recorrido"),
    titulo(4, "Qué cierra cada etapa"),
    parrafo(
      "Cada etapa termina con algo que efectivamente pasó, no con una sensación de avance. Eso es lo que marca el CSE:",
    ),
    tabla([
      ["Etapa", "Lo que la cierra"],
      ["Hand Off", "El arranque con el cliente ocurrió y su documento está publicado."],
      ["Exploración", "Entendimiento cerrado: sabemos cómo trabaja hoy y qué estábamos dando por supuesto."],
      ["Diagnóstico", "Diagnóstico compartido con el cliente, con sus hallazgos y su evidencia."],
      ["Planificación", "Cronograma consensuado: el cliente aprobó fechas y alcance."],
      ["Configuración técnica", "Demo aprobada: el cliente vio funcionando lo que se construyó."],
      ["Adopción", "Cliente operando: el equipo del cliente usa lo entregado en su día a día."],
      ["Validación de uso", "Uso validado, medido por el uso real de las licencias."],
      ["Entrega", "Entrega realizada, con la sesión de cierre y la sugerencia registrada para Ventas."],
    ]),
    parrafo(
      "Las cuentas de continuidad y soporte no recorren todo: van por el ciclo corto —arranque, operación continua y cierre— porque no hay una implementación que avanzar.",
    ),

    titulo(2, "Los documentos que arma el CSE"),
    parrafo(
      "Cada proyecto tiene su menú de documentos. Algunos nacen con el proyecto y otros los encendés vos cuando llega el momento de usarlos.",
    ),
    bloqueVivo("documentos"),
    aviso(
      "advertencia",
      "Lo que escribe un agente es un borrador, siempre. Se revisa antes de darlo por bueno, y con más razón antes de que lo vea el cliente: lo que sale con nuestro nombre lo firmás vos, no la IA.",
    ),
    parrafo(
      "Hay partes que la IA no escribe a propósito, porque son criterio del CSE: los canales y horarios de atención, el equipo del cliente, los indicadores que se le comprometen y el cierre del arranque.",
    ),

    titulo(2, "HubSpot al día"),
    parrafo(
      "El tablero del negocio es HubSpot, y mantenerlo al día es trabajo del CSE, no del liderazgo. Si la etapa de un proyecto está vieja, la cartera entera se lee mal: el líder ve una foto que no existe.",
    ),
    vinneta("La etapa se mueve en HubSpot. Nexus te sugiere el cambio cuando ve que el proyecto ya avanzó, y vos lo confirmás."),
    vinneta("Si algo está trabado, el motivo del bloqueo se escribe en el proyecto. «Bloqueado» sin motivo no le sirve a nadie."),
    vinneta("El estado de adopción se actualiza cuando cambia de verdad, no al final."),

    titulo(2, "La salud de la cuenta"),
    parrafo(
      "Nexus vigila las cuentas y levanta alertas cuando algo se desvía: el cronograma se atrasa, el cliente se enfría, las licencias se usan poco, la renovación se acerca o el proyecto lleva demasiado en la misma etapa.",
    ),
    parrafo(
      "La alerta es una propuesta con evidencia, no un veredicto: la mira el CSE, hace algo al respecto y la cierra. Una alerta que queda abierta dos semanas dejó de ser una alerta.",
    ),
    titulo(4, "Qué mirar antes de que alguien pregunte"),
    vinneta("El uso real de las licencias: si el cliente no entra, la implementación no rindió, por bien hecha que esté."),
    vinneta("Las cuentas sin próximo paso agendado: una cuenta sin próxima reunión es una cuenta que se está enfriando."),
    vinneta("Las fechas que se corrieron: si se corrió el cierre, se dice cuándo se corrió y por qué, no se descubre al final."),

    titulo(2, "Grabar es parte del trabajo"),
    parrafoRico(
      "El traspaso, el arranque, el diagnóstico y la entrega se arman leyendo lo que se dijo en las reuniones. Una reunión sin transcripción no alimenta ningún documento y obliga a reconstruir a mano lo que ya pasó. Cómo se graban y cómo se nombran está en ",
      mencion("como-trabajar-en-smarteam", "¿Cómo trabajar en Smarteam?", "🤝"),
      ".",
    ),

    titulo(2, "Qué NO le toca al CSE"),
    parrafo("No es desconfianza: es que cada cosa la decide quien responde por ella."),
    tabla([
      ["Esto", "Lo hace", "Por qué"],
      ["El traspaso de Ventas", "Ventas", "Lo escribe quien vendió: es el registro de lo que se prometió."],
      ["Borrar una tarea o una fase del cronograma", "El líder", "El CSE suspende lo que no va; borrar el historial es otra cosa."],
      ["Reasignar una cuenta a otro CSE", "El liderazgo", "Cambiar el encargado cambia quién ve la cuenta."],
      ["Marcar un proyecto como interno", "El liderazgo", "Lo saca de cobranza: es una decisión de plata."],
      ["Cobranza y facturación", "Administración", "El CSE avisa si el cliente menciona un tema de pago, y sigue con lo suyo."],
    ]),

    titulo(2, "Los nueve modos de que salga mal"),
    parrafo(
      "Ninguno de estos es un error puntual: son formas de trabajar que se ven venir. Están escritos para reconocerlos temprano, no para repartir culpas.",
    ),
    tarjetas(
      "3",
      tarjeta("Configurar sin entender", "Se monta lo que el cliente pidió sin saber para qué. Funciona y no sirve."),
      tarjeta("Entregado pero no adoptado", "La configuración está impecable y nadie la usa."),
      tarjeta("Fechas que se corren en silencio", "El cierre se mueve de a poco y el cliente se entera al final."),
      tarjeta("Alcance regalado", "Se agrega trabajo fuera de lo contratado para evitar una conversación incómoda."),
      tarjeta("Problemas que llegan tarde", "Lo que se sabía hace tres semanas aparece en la reunión de cierre."),
      tarjeta("HubSpot desactualizado", "La cartera se lee mal y el líder decide sobre una foto vieja."),
      tarjeta("La relación delegada al chat", "Todo pasa por mensajes y nadie se ve la cara hasta que hay un problema."),
      tarjeta("Cartera sin próximo paso", "Cuentas sin próxima reunión agendada: se enfrían sin que nadie lo note."),
      tarjeta("Dependencia del CSL", "Cada decisión sube al líder. La cuenta avanza a la velocidad de la agenda de otro."),
    ),

    titulo(2, "Cómo se crece en el puesto"),
    parrafo(
      "La ruta no la mide la antigüedad: la mide qué cuenta podés sostener solo.",
    ),
    desplegable("Nivel 1 · Implementador inicial", [
      parrafo("Implementa lo básico de HubSpot con acompañamiento. Ejecuta bien lo que ya está decidido."),
    ]),
    desplegable("Nivel 2 · Multi-Hub", [
      parrafo("Maneja más de un Hub y las integraciones de mensajería más comunes. Lleva cuentas simples solo."),
    ]),
    desplegable("Nivel 3 · Implementaciones avanzadas", [
      parrafo("Resuelve integraciones de mensajería avanzadas y atiende cuentas en inglés."),
    ]),
    desplegable("Nivel 4 · Consultor de negocio", [
      parrafo("Discute el proceso comercial del cliente, no solo su herramienta. Entiende integraciones a medida y sabe cuándo conviene construir."),
    ]),
    desplegable("Nivel 5 · Consultor AI-First", [
      parrafo("Diseña operaciones donde la IA hace el trabajo y el equipo valida. Sostiene las cuentas más grandes sin red."),
    ]),

    divisor(),
    parrafoRico(
      "Qué hace Nexus y cómo se conecta con HubSpot: ",
      mencion("como-funciona-nexus", "¿Cómo funciona Nexus?", "🧭"),
      ". Con qué vara medimos a un cliente: ",
      mencion("escala-de-rendimiento", "Escala de rendimiento", "📈"),
      ".",
    ),
  ];
}

/** La página «Guía de CSE», lista para sembrar. */
export function construirGuiaCse(): PaginaSembrada {
  return {
    slug: "guia-de-cse",
    titulo: "Guía de CSE",
    icono: "🎯",
    bloques: bloques(),
  };
}
