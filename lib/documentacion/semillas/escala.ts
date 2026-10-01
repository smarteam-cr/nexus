/**
 * lib/documentacion/semillas/escala.ts — la página «Escala de rendimiento» y sus tres áreas.
 *
 * Reescrita para la Escala vigente (8.6.0, 2026-09-30). La página está escrita a mano, en simple:
 * es la explicación para alguien del equipo que nunca vio la Escala —por qué existe, cómo pensarla,
 * cómo se llega a un nivel y cómo se usa en Nexus—.
 *
 * ⛔ El DETALLE —cada criterio de cada nivel— NO se copia acá. Vive en Nexus → Escala, que lee la
 * versión publicada: es la fuente única, y una copia en la base envejecería con la próxima versión
 * (pasó: la base siguió en la 5.2.0 mientras Nexus ya publicaba la 8.6.0). De la escala oficial se
 * leen solo la versión y el panorama de los niveles (`escala-vigente.ts`).
 */
import {
  aviso,
  cita,
  desplegable,
  divisor,
  enlace,
  mencion,
  numerado,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "./bloques";
import { leerEscalaVigente, NIVELES_DE_LA_ESCALA, type AreaDeLaEscala } from "./escala-vigente";
import type { BloqueGuardado } from "../tipos";

/** La sección de la Escala en Nexus: ahí está la matriz completa, en la versión publicada. */
export const ESCALA_EN_NEXUS = "/escala";

/** El resumen de cada nivel, en una línea, para las tarjetas de la página principal. */
const QUE_SIGNIFICA: Record<string, string> = {
  Deficiente: "Todo depende de las personas. Nada se mide y el resultado es impredecible.",
  Inicial: "Hay herramientas y algo de estructura, pero no se usan bien ni parejo.",
  Funcional: "La base: procesos que se siguen, roles claros, datos confiables y automatización simple.",
  Eficiente: "Método medido, automatización con lógica, IA que asiste y áreas que se coordinan.",
  Óptimo: "La IA hace el trabajo y el equipo valida donde importa.",
};

const GLOSARIO: [string, string][] = [
  ["CSE", "Customer Success Executive: quien lleva la cuenta y aplica la Escala con el cliente."],
  ["ICP", "El cliente ideal: a quién sí le servimos. Sirve para decidir a quién perseguir y a quién no."],
  ["MQL", "Un contacto que marketing considera listo para que Ventas lo trabaje."],
  ["SQL", "Un contacto que Ventas aceptó como oportunidad real."],
  ["SLA", "El compromiso de respuesta: en cuánto tiempo se contesta o se resuelve algo."],
  ["Forecast", "El pronóstico de cuánto se va a cerrar en el período."],
  ["Pipeline review", "La reunión fija donde se repasa trato por trato cómo viene el mes."],
  ["Playbook", "La guía de cómo vender: qué preguntar, cómo calificar, cómo responder objeciones."],
  ["Lead scoring", "Un puntaje que suma atributos del contacto para saber a quién atender primero."],
  ["Nurturing", "Una secuencia de mensajes que acompaña al contacto hasta que esté listo."],
  ["Target accounts", "Las cuentas elegidas a dedo por su valor, que se trabajan aparte."],
  ["Enrichment", "Completar los datos de un contacto o empresa con fuentes externas."],
  ["AEO", "Optimizar para que las respuestas de la IA y los buscadores nuevos te citen."],
  ["Share of voice", "Cuánto se habla de una marca comparado con la competencia."],
  ["NPS / CSAT", "Dos formas de medir si el cliente quedó conforme."],
  ["Churn", "Clientes que se van."],
  ["Health score", "Un modelo que estima qué tan sana está una cuenta antes de que se queje."],
  ["Deflection", "Consultas que se resuelven solas (autoservicio) y nunca llegan a un agente."],
  ["Copilot", "La IA que le sugiere al agente qué responder, sin responder sola."],
  ["Win-loss", "El análisis de por qué se ganan y por qué se pierden los tratos."],
  ["ERP", "El sistema de gestión de la empresa: facturación, inventario, contabilidad."],
  ["ROI", "El retorno: cuánto deja lo que se invierte, comparado con lo que cuesta."],
  ["Handoff", "El traspaso: cuando Ventas entrega el cliente a Customer Success."],
];

const AREAS: { nombre: AreaDeLaEscala; slug: string; icono: string; numero: string }[] = [
  { nombre: "Ventas", slug: "escala-ventas", icono: "💼", numero: "1" },
  { nombre: "Marketing", slug: "escala-marketing", icono: "📣", numero: "2" },
  { nombre: "Servicio", slug: "escala-servicio", icono: "🎧", numero: "3" },
];

/** Los nombres propios de las cuatro dimensiones de producción, por área (x.5 a x.8). */
const PRODUCCION: Record<AreaDeLaEscala, [string, string, string, string]> = {
  Ventas: ["Propuesta y Coherencia", "Priorización de Leads", "Tracción del Deal", "Aprendizaje de Ganadas y Perdidas"],
  Marketing: ["Marca y Presencia", "Segmentación", "Canales y Alcance", "Medición y Aprendizaje"],
  Servicio: ["Consistencia de Atención", "Priorización de Clientes", "Proactividad", "Escalabilidad del Servicio"],
};

const BASE = ["Procesos y Rutinas", "Tecnología y Automatización", "Datos", "Equipo y Gobierno"];

/** Cómo aterriza cada área en Funcional, y en qué orden se trabaja su producción (de la escala). */
const POR_AREA: Record<AreaDeLaEscala, { aterrizar: string; ordenProduccion: string }> = {
  Ventas: {
    aterrizar:
      "Llevar Ventas a Funcional es sobre todo montar la arquitectura y enseñar a usarla: el pipeline, las etapas, la asignación y los reportes.",
    ordenProduccion:
      "Sin cliente ideal y mensaje común no se puede priorizar; sin prioridad, el seguimiento se dispersa; sin seguimiento, no hay de qué aprender.",
  },
  Marketing: {
    aterrizar:
      "Llevar Marketing a Funcional es sobre todo habilitación: enseñarle al equipo a operar cada canal, a sostener un calendario y a coordinar una campaña entre email, pauta, orgánico y el canal conversacional. Por eso suele pedir más acompañamiento, y conviene explicarlo así cuando el cliente compara precios.",
    ordenProduccion:
      "Los buyer personas se definen primero, junto con la marca: sin ellos no hay segmentos, sin segmentos no se sabe a quién llegar, y sin canales no hay qué medir.",
  },
  Servicio: {
    aterrizar:
      "Llevar Servicio a Funcional es sobre todo montar la arquitectura y enseñar a usarla: el pipeline de servicio, la categorización, la asignación y los reportes.",
    ordenProduccion:
      "Los tipos de cliente se definen primero: sin ellos no hay niveles de atención, sin niveles no se sabe a quién adelantarse, y solo se escala lo que ya se hace bien.",
  },
};

/* ── La página principal ────────────────────────────────────────────────────── */

function paginaPrincipal(): BloqueGuardado[] {
  const escala = leerEscalaVigente();

  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "la Escala es el instrumento con el que medimos qué tan bien opera un departamento —Ventas, Marketing o Servicio— en cinco niveles. No mide qué herramientas tiene: mide cómo trabaja.",
    ),
    parrafoRico(
      [`Escala vigente: versión ${escala.version}. `, { italica: true }],
      [
        "Esta página es para entenderla y explicarla. Cada criterio, nivel por nivel, está en Nexus, en ",
        { italica: true },
      ],
      enlace("Escala", ESCALA_EN_NEXUS),
      [": esa es la fuente, y siempre muestra la versión publicada.", { italica: true }],
    ),

    titulo(2, "Por qué existe"),
    parrafo(
      "Cuando una empresa nos pregunta «¿cómo estamos?», la respuesta fácil es una opinión, y depende de con quién hable el cliente y de qué día tuvimos. La Escala existe para que no sea así. Es un modelo de madurez: describe los estados en que puede estar un departamento, y ubica al cliente en uno con la evidencia que juntamos.",
    ),
    parrafo(
      "Una forma corta de decirlo: es el mapa y la brújula de un departamento. El mapa muestra dónde está; la brújula, hacia dónde conviene ir. Y como se vuelve a medir, el mapa también muestra cuánto se avanzó.",
    ),
    parrafo(
      "El valor no está en el número. Está en que dos personas distintas, mirando el mismo departamento, lleguen al mismo lugar, y en que el cliente entienda por qué está ahí y qué lo mueve al siguiente nivel.",
    ),
    aviso(
      "advertencia",
      ["No mide herramientas, mide comportamiento. ", { negrita: true }],
      "Tener HubSpot Enterprise no sube a nadie de nivel. Un sistema bien configurado que nadie usa no es Funcional: lo que sube de nivel es que el proceso se siga, que el dato sea confiable y que la automatización tenga lógica.",
    ),

    titulo(3, "La escala explicada como una obra"),
    parrafo(
      "La base operativa son los cimientos y la estructura; la producción, lo que se levanta encima y se usa. Funcional es la casa habitable: no la terminada ni la de lujo, sino la que ya se puede vivir — y habitable quiere decir que alguien vive ahí: paredes sin nadie adentro es configuración sin adopción.",
    ),
    parrafo(
      "Una casa es tan firme como su parte más débil, y no se levanta un segundo piso sobre un cimiento rajado. Por eso manda la dimensión más débil, y por eso la base va antes que la producción. Los casos de uso son las obras por etapa, y la obra no se termina: la casa crece con la familia.",
    ),

    titulo(3, "De la disciplina al sistema"),
    parrafo(
      "Entre Funcional y Óptimo cambia quién sostiene la operación. En Funcional la sostienen las personas: los datos están bien porque alguien llena los campos, y la cadencia se cumple porque el equipo la respeta. Instalar esas rutinas en el equipo del cliente es gestión del cambio, no configuración — y es donde se juega la adopción.",
    ),
    parrafo(
      "En Eficiente la automatización con lógica empieza a cargar parte del peso, y la IA asiste. En Óptimo lo sostiene el sistema: la IA ejecuta lo repetitivo y las personas validan donde importa. Primero el equipo aprende a operar con orden; después ese orden se traslada al sistema.",
    ),

    titulo(3, "El cliente compra resultados, no niveles"),
    parrafo(
      "Al cliente no le importa estar en Funcional: le importa ver en qué etapa se caen sus negocios, saber cuánto le cuesta cada lead o retener a los clientes que se le iban sin aviso. Cada nivel, desde Funcional, dice lo que el cliente puede hacer, ver o decidir que antes no podía: esas líneas de resultado son el puente entre el nivel y lo que el cliente persigue, y de ahí nace cada caso de uso.",
    ),
    parrafo(
      "Subir de nivel no es el resultado: es la condición para que el resultado ocurra. La prueba de que se logró es el criterio de aceptación del caso de uso.",
    ),

    titulo(2, "Los cinco niveles"),
    tarjetas("2", ...NIVELES_DE_LA_ESCALA.map((n, i) => tarjeta(`${i + 1} · ${n}`, QUE_SIGNIFICA[n] ?? ""))),
    aviso(
      "exito",
      ["Funcional es la base. ", { negrita: true }],
      "Arquitectura montada, procesos que se siguen, roles definidos, datos confiables, tableros descriptivos y automatización simple. Todo lo que pide lógica condicional, coordinación entre áreas o inteligencia artificial ya es Eficiente u Óptimo. Es también el objetivo por defecto: donde la operación deja de depender de una persona.",
    ),

    titulo(2, "Las ocho dimensiones, en dos capas"),
    parrafo("Cada departamento se mira por ocho dimensiones, agrupadas en dos capas. Su resultado se lee por capa."),
    titulo(3, "Base operativa: cómo está montado por dentro"),
    vinneta("Procesos y Rutinas — si el área se ejecuta por sistema o por personas."),
    vinneta("Tecnología y Automatización — cuánto del stack se aprovecha y cuánto se automatiza."),
    vinneta("Datos — si la información es base confiable para decidir."),
    vinneta("Equipo y Gobierno — si hay claridad de rol y autoridad, y con qué cadencia decide el líder."),
    titulo(3, "Producción: qué entrega hacia afuera"),
    parrafo(
      "Responden siempre las mismas cuatro preguntas —cómo se presenta, a quién prioriza, hasta dónde llega y cómo aprende—, pero llevan nombre propio en cada área. El hilo también es un orden: te presentas, afinas a quién priorizas, llegas con tracción y aprendes para la próxima.",
    ),
    tabla([
      ["Pregunta", "Ventas", "Marketing", "Servicio"],
      ["Presentación", PRODUCCION.Ventas[0], PRODUCCION.Marketing[0], PRODUCCION.Servicio[0]],
      ["Personalización", PRODUCCION.Ventas[1], PRODUCCION.Marketing[1], PRODUCCION.Servicio[1]],
      ["Alcance", PRODUCCION.Ventas[2], PRODUCCION.Marketing[2], PRODUCCION.Servicio[2]],
      ["Aprendizaje", PRODUCCION.Ventas[3], PRODUCCION.Marketing[3], PRODUCCION.Servicio[3]],
    ]),

    titulo(2, "Lo que dice la brecha entre las dos capas"),
    parrafo(
      "La base operativa habilita; la producción es lo que sale. Sin datos confiables, roles definidos y automatización con lógica, no hay dónde apoyar la proactividad ni el aprendizaje, por mucha voluntad que le ponga el equipo. Por eso un departamento Funcional es liviano en producción, a propósito.",
    ),
    aviso(
      "info",
      ["Base más alta que producción: ", { negrita: true }],
      "hay capacidad instalada que no se está exprimiendo. La conversación es de adopción y casos de uso, no de construir más.",
    ),
    aviso(
      "advertencia",
      ["Producción más alta que base: ", { negrita: true }],
      "el departamento produce a pulso, sostenido por personas y no por sistema. Es frágil: hay que cimentar antes de seguir empujando.",
    ),
    aviso(
      "exito",
      ["Las dos parejas: ", { negrita: true }],
      "lo que entrega corresponde a cómo está montado. La conversación es subir el conjunto al siguiente nivel.",
    ),

    titulo(2, "Cómo se llega a un nivel"),
    parrafo(
      "Se diagnostica un departamento a la vez, dimensión por dimensión. Se pueden diagnosticar menos departamentos, pero nunca menos dimensiones: si se salta una, no se sabe cuál es la más débil.",
    ),
    numerado(
      "Deficiente e Inicial describen lo que falta: entre esos dos se asigna el que mejor calza con la evidencia.",
    ),
    numerado(
      "De Funcional para arriba la regla es estricta: una dimensión está en un nivel cuando cumple todos sus criterios y los de los niveles anteriores. Si le falta uno, queda en el anterior.",
    ),
    numerado("El nivel de una capa es el de su dimensión más débil, y el del departamento, el de su capa más baja."),
    aviso(
      "advertencia",
      ["El piso, no el promedio. ", { negrita: true }],
      "Si en la base operativa Procesos, Tecnología y Equipo están en Funcional pero Datos está en Inicial, la base operativa es Inicial. Promediar dejaría que la dimensión rota se esconda detrás de las fuertes — y es justo ésa la que el cliente tiene que arreglar.",
    ),
    titulo(3, "El puntaje de 0 a 100"),
    parrafo(
      "Además del nivel, cada dimensión, capa y departamento lleva un puntaje. Cada nivel ocupa un tramo de 20 puntos —Deficiente 0 a 20, Inicial 20 a 40, Funcional 40 a 60, Eficiente 60 a 80; Óptimo vale 100— y la posición dentro del tramo es cuánto se avanzó hacia el siguiente. «Funcional, cumple 2 de 4 criterios de Eficiente» está a mitad de su tramo: 50.",
    ),
    parrafo(
      "El puntaje nunca contradice el nivel, pero sube cada vez que algo avanza aunque el nivel todavía no cambie. Por eso se presentan juntos: «Ventas sigue en Inicial, pero ya tiene cinco de sus ocho dimensiones en Funcional».",
    ),
    titulo(3, "Las marcas de un criterio"),
    parrafo("Cada criterio tiene un identificador estable (por ejemplo, 1.7.F1) y puede llevar marcas:"),
    vinneta(
      "Riesgo — no impide llegar a Funcional, pero sí pasar a Eficiente, que es donde la IA empieza a trabajar. Mientras esté pendiente, se reporta junto al nivel.",
    ),
    vinneta(
      "Hábito — algo que el equipo repite, no que se instala. Se da por cumplido cuando se hizo al menos 4 de las últimas 5 veces; si la rutina existe pero todavía no tiene esa historia, el nivel queda «por confirmar» y se confirma en la remedición.",
    ),
    vinneta(
      "Perfil de negocio — solo aplica según cómo se cierra la venta (con equipo, transaccional o mixta) y qué pasa después (relación única, recompra o relación continua).",
    ),
    vinneta(
      "Requiere — dice de qué otro criterio depende. No cambia el nivel ni el puntaje: sirve para ordenar el trabajo, porque lo requerido se hace antes.",
    ),
    parrafo(
      "Y cada criterio dice cómo se verifica: comprobable (está en el sistema y se ve mirando), declarado (existe fuera del sistema y se pide la evidencia) o evaluado (describe cómo opera el equipo y requiere que alguien con criterio observe).",
    ),

    titulo(2, "Una escala, con ediciones por industria"),
    parrafo(
      "Una universidad y una inmobiliaria venden las dos con equipo, pero una habla de matrícula y la otra de reserva. Las ediciones dicen la misma escala con las palabras de cada industria y le suman los criterios que solo tienen sentido ahí. Comparten dimensiones, niveles, reglas y cálculo.",
    ),
    tarjetas(
      "2",
      tarjeta(
        "Ecommerce y retail",
        "Para quien vende al consumidor final en línea, en tiendas físicas o en las dos: el cliente compra solo, sin un vendedor, y lo que se busca es que vuelva.",
      ),
      tarjeta(
        "Banca y servicios financieros",
        "Para el área comercial de un banco, una cooperativa o una financiera: parte de la venta la trabaja un ejecutivo, parte se cierra sola en los canales digitales, y la relación sigue.",
      ),
      tarjeta(
        "Educación",
        "Para el área de admisiones de una universidad, un instituto o un centro de formación. Ahí el área de Ventas se llama Admisiones.",
      ),
      tarjeta(
        "Inmobiliaria",
        "Para quien vende las unidades de un proyecto: un asesor trabaja cada oportunidad, de la primera consulta a la visita, la reserva y la firma.",
      ),
    ),
    parrafo(
      "Quien todavía no tiene una edición se mide con la escala general. Cada unidad se mide siempre con la misma edición: cambiarla es empezar una línea base nueva.",
    ),

    titulo(2, "Dos formas de aplicarla"),
    tarjetas(
      "2",
      tarjeta(
        "El chequeo — antes de la venta",
        "El test para prospectos: una o dos preguntas por dimensión, que estiman el nivel por mejor ajuste. Todo lo que muestra es estimado. Sirve para abrir la conversación, no como evidencia.",
      ),
      tarjeta(
        "El diagnóstico — con el cliente",
        "Lo hace el CSE con los agentes de Nexus, criterio por criterio. Fija la línea base y se repite en cada remedición. El avance se mide siempre de diagnóstico a diagnóstico, nunca contra el chequeo.",
      ),
    ),
    aviso(
      "peligro",
      ["La IA propone, el CSE confirma. ", { negrita: true }],
      "Un agente puede verificar lo comprobable y proponer el nivel con su evidencia; el CSE lo confirma o lo ajusta, con la razón escrita. Ningún nivel se entrega como caja negra: siempre va con su evidencia («Datos en Inicial porque falta X y falta Y»). Y el diagnóstico mide al departamento del cliente, nunca al CSE.",
    ),

    titulo(2, "Hasta dónde subir y qué se trabaja primero"),
    parrafo(
      "No todo departamento tiene que llegar a Óptimo. Cada uno tiene un nivel objetivo que el CSE acuerda con el cliente según el resultado que persigue; por defecto, Funcional. Lo que ya llegó a su objetivo se sostiene y se vuelve a medir.",
    ),
    numerado("Se empieza por el departamento de nivel más bajo."),
    numerado(
      "Dentro de él, por la capa más baja. Si están parejas por debajo de Funcional, va primero la base; si están parejas de Funcional para arriba, la producción.",
    ),
    numerado(
      "Dentro de esa capa, por la dimensión más débil; entre dos iguales, la que va antes en el orden de dependencias.",
    ),
    parrafo(
      "Si el resultado del cliente pide trabajar antes otra dimensión de esa capa, el CSE cambia el orden y escribe por qué. El puntaje muestra el avance; no decide qué se trabaja.",
    ),

    titulo(2, "Aterrizar, crecer y volver a medir"),
    parrafoRico(
      "La Escala ordena los dos tiempos de ",
      mencion("land-and-expand", "Land and Expand", "🌳"),
      ". Aterrizar es llevar un departamento a Funcional: se diagnostica, se implementa lo que falta y se entrena al equipo. Expandir es convertir cada capacidad de Eficiente u Óptimo en un caso de uso que mueve una dimensión al nivel siguiente.",
    ),
    parrafo(
      "Al entregar, el departamento queda en Funcional por confirmar: lo instalado ya está, y los hábitos ya empezaron. Se confirma en la primera remedición, entre 60 y 90 días después —el plazo no es arbitrario: que la cadencia se cumpla o que el equipo use el CRM por convicción solo se ve después de operar un tiempo—. Esa remedición es el momento natural de abrir la conversación de qué sigue. Después, una vez por trimestre.",
    ),

    titulo(2, "Reglas para no dudar"),
    desplegable("La regla de automatización: manual → con lógica → autónomo", [
      parrafo("Funcional — automatización simple: un disparador, una acción. Sin lógica condicional ni coordinación entre áreas."),
      parrafo(
        "Eficiente — automatización con lógica: secuencias con ramificación y tiempos, routing por varias condiciones, escalación de SLA, flujos que conectan áreas.",
      ),
      parrafo("Óptimo — la IA ejecuta y las personas validan: agentes que califican, agendan, resuelven o generan contenido."),
      aviso(
        "advertencia",
        "La IA no define Óptimo por sí sola. En Eficiente la IA ASISTE y la persona hace el trabajo; en Óptimo la IA LO HACE y la persona valida. La pregunta no es si hay IA: es quién ejecuta.",
      ),
    ]),
    desplegable("Cada evidencia cuenta en UNA sola dimensión", [
      parrafo(
        "Cada cosa se pide en una sola dimensión, la que responde su pregunta; quien depende de ella la requiere en vez de repetirla. Algunos casos que no son obvios:",
      ),
      vinneta("Playbook, criterios de etapa, cadencia y metodología → Procesos de Ventas (1.1)."),
      vinneta("Lo que recibe el cliente —el mensaje y la propuesta— → Propuesta y Coherencia (1.5)."),
      vinneta("La definición de lead calificado → Priorización de Leads (1.6)."),
      vinneta("Que el equipo trabaje en el sistema central y no por fuera → Procesos de cada área (1.1, 2.1, 3.1)."),
      vinneta("Mejorar el proceso con lo aprendido → la dimensión de aprendizaje de cada área (1.8, 2.8, 3.8)."),
      vinneta("La IA como asistente del equipo → Tecnología de cada área, y es Eficiente."),
      parrafoRico("La regla completa, con todos sus casos, está en ", enlace("Nexus → Escala", ESCALA_EN_NEXUS), "."),
    ]),

    titulo(2, "Cómo se usa en Nexus"),
    parrafoRico(
      "En el menú de Nexus, ",
      enlace("Escala", ESCALA_EN_NEXUS),
      " muestra la versión publicada, área por área. Ahí puedes:",
    ),
    vinneta("Leerla como matriz, dimensión por dimensión o como mapa (la rueda)."),
    vinneta("Elegir la industria —la escala general o una edición— y el perfil de negocio del cliente: los criterios que no aplican se esconden."),
    vinneta("Tocar un criterio y ver qué otros requiere y cuáles dependen de él."),
    vinneta("Abrir «Cómo leer la escala», con las reglas de esta página dichas en corto."),
    aviso(
      "info",
      ["La escala cambia con el uso. ", { negrita: true }],
      "Si algo no se entiende o no calza con un cliente real, coméntalo ahí mismo, sobre el criterio, el nivel o la dimensión: «No se entiende», «No calza con un cliente» o «Propuesta». Es la materia prima de la versión siguiente; las decide Elías González.",
    ),
    aviso(
      "advertencia",
      ["Mientras tanto, en los documentos de cada proyecto: ", { negrita: true }],
      "la sección de la Escala que arman los agentes en el Diagnóstico, la Propuesta y el Kickoff todavía sale de una versión anterior. Para ubicar a un cliente, la referencia es Nexus → Escala.",
    ),

    titulo(2, "Las tres áreas"),
    parrafo(
      "Cada área tiene su página: cómo se ve en cada nivel —en el lenguaje con que se le devuelve el resultado al cliente—, sus ocho dimensiones y cómo aterriza.",
    ),
    parrafoRico(
      ...AREAS.flatMap((a, i) => [
        ...(i > 0 ? ["  ·  "] : []),
        mencion(a.slug, a.nombre, a.icono),
      ]),
    ),

    titulo(2, "Glosario"),
    ...GLOSARIO.map(([termino, definicion]) => parrafoRico([`${termino}: `, { negrita: true }], definicion)),

    titulo(2, "Quién la aplica"),
    parrafoRico(
      "La aplica quien lleva la cuenta, con el material de la exploración. Cómo encaja en el recorrido de un proyecto está en ",
      mencion("guia-de-cse", "Guía de CSE", "🎯"),
      "; cómo se trabaja en Nexus, paso a paso, en ",
      mencion("nexus-para-un-cse", "Nexus para un CSE, paso a paso", "🧑‍💻"),
      ".",
    ),

    divisor(),
    parrafoRico([`Escala de Rendimiento Smarteam · versión ${escala.version}`, { italica: true }]),
  ];
}

/* ── Una subpágina por área ─────────────────────────────────────────────────── */

function paginaDeArea(area: (typeof AREAS)[number], panorama: ReturnType<typeof leerEscalaVigente>["panorama"]): PaginaSembrada {
  const ruta = `${ESCALA_EN_NEXUS}/${area.nombre.toLowerCase()}`;
  const dimensiones = [...BASE, ...PRODUCCION[area.nombre]];

  return {
    slug: area.slug,
    titulo: area.nombre,
    icono: area.icono,
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        `cómo se mide el área de ${area.nombre}. Cada criterio, nivel por nivel, está en `,
        enlace(`Nexus → Escala → ${area.nombre}`, ruta),
        "; acá está lo que hace falta para entenderla y explicársela a un cliente.",
      ),
      parrafoRico(
        "Las reglas que valen para las tres áreas —cómo se llega a un nivel, el puntaje, la brecha entre capas, qué se trabaja primero— están en ",
        mencion("escala-de-rendimiento", "Escala de rendimiento", "📈"),
        ".",
      ),

      titulo(2, "Los cinco niveles de un vistazo"),
      parrafo("Cómo se ve el departamento en cada nivel, en el lenguaje con el que se le devuelve el resultado al cliente."),
      ...panorama.map((p) => desplegable(p.nivel, [parrafo(p.porArea[area.nombre])])),

      titulo(2, "Las ocho dimensiones"),
      tabla([
        ["Número", "Dimensión", "Capa"],
        ...dimensiones.map((d, i) => [`${area.numero}.${i + 1}`, d, i < 4 ? "Base operativa" : "Producción"]),
      ]),
      parrafo("El identificador estable es el número, no el nombre: los nombres se pueden afinar, los números no cambian."),

      titulo(2, "Cómo aterriza el área"),
      parrafo(POR_AREA[area.nombre].aterrizar),
      titulo(3, "El orden de su producción"),
      cita(PRODUCCION[area.nombre].join(" → ")),
      parrafo(POR_AREA[area.nombre].ordenProduccion),
    ],
  };
}

/** La página «Escala de rendimiento» con sus tres subpáginas, lista para sembrar. */
export function construirEscala(): PaginaSembrada {
  const escala = leerEscalaVigente();
  return {
    slug: "escala-de-rendimiento",
    titulo: "Escala de rendimiento",
    icono: "📈",
    bloques: paginaPrincipal(),
    hijas: AREAS.map((a) => paginaDeArea(a, escala.panorama)),
  };
}
