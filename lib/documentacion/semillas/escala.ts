/**
 * lib/documentacion/semillas/escala.ts — la página «Escala de rendimiento» y sus tres áreas.
 *
 * La página principal está escrita a mano, en simple: es la explicación para alguien del equipo
 * que nunca vio la Escala. El DETALLE —24 dimensiones × 5 niveles con sus señales— NO se escribe
 * acá: sale del reglamento (`escala-v5.ts`), que lee el documento oficial. Así el día que la
 * Escala cambie, se reemplaza el `.md` y se vuelve a sembrar, sin tipear nada dos veces.
 */
import {
  aviso,
  cita,
  mencion,
  desplegable,
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
} from "./bloques";
import { leerReglamentoV5, NIVELES_V5, type AreaV5, type DimensionV5 } from "./escala-v5";
import type { BloqueGuardado } from "../tipos";

const ICONO_POR_AREA: Record<string, string> = {
  Ventas: "💼",
  Marketing: "📣",
  Servicio: "🎧",
};

/** El resumen de cada nivel, en una línea, para la tabla de la página principal. */
const QUE_SIGNIFICA: Record<string, string> = {
  Deficiente: "Todo depende de las personas. Nada se mide y el resultado es impredecible.",
  Inicial: "Hay herramientas y algo de estructura, pero no se usan bien ni parejo.",
  Funcional: "La base: procesos que se siguen, roles claros, datos confiables y automatización simple.",
  Eficiente: "Método medido, automatización con lógica y áreas que se coordinan.",
  Óptimo: "La IA hace el trabajo y el equipo valida donde importa.",
};

const GLOSARIO: [string, string][] = [
  ["ICP", "El cliente ideal: a quién sí le servimos. Sirve para decidir a quién perseguir y a quién no."],
  ["MQL", "Un contacto que marketing considera listo para que Ventas lo trabaje."],
  ["SQL", "Un contacto que Ventas aceptó como oportunidad real."],
  ["SLA", "El compromiso de respuesta: en cuánto tiempo se contesta o se resuelve algo."],
  ["Forecast", "El pronóstico de cuánto se va a cerrar en el período."],
  ["Pipeline review", "La reunión fija donde se repasa trato por trato cómo viene el mes."],
  ["Playbook", "La guía de cómo vender: qué preguntar, cómo calificar, cómo responder objeciones."],
  ["Lead scoring", "Un puntaje que suma atributos del contacto para saber a quién atender primero."],
  ["Round-robin", "Repartir los contactos que entran por turnos, uno a cada vendedor."],
  ["Nurturing", "Una secuencia de mensajes que acompaña al contacto hasta que esté listo."],
  ["Target accounts", "Las cuentas elegidas a dedo por su valor, que se trabajan aparte."],
  ["Enrichment", "Completar los datos de un contacto o empresa con fuentes externas."],
  ["Smart content", "Contenido que cambia según quién lo mira."],
  ["AEO", "Optimizar para que las respuestas de la IA y los buscadores nuevos te citen."],
  ["Share of voice", "Cuánto se habla de vos comparado con la competencia."],
  ["NPS / CSAT", "Dos formas de medir si el cliente quedó conforme."],
  ["Churn", "Clientes que se van."],
  ["Health score", "Un modelo que estima qué tan sana está una cuenta antes de que se queje."],
  ["Deflection", "Consultas que se resuelven solas (autoservicio) y nunca llegan a un agente."],
  ["Copilot", "La IA que le sugiere al agente qué responder, sin responder sola."],
  ["QBR", "La reunión trimestral con el cliente para revisar resultados y lo que sigue."],
  ["Win-loss", "El análisis de por qué se ganan y por qué se pierden los tratos."],
  ["Conversation intelligence", "Grabar y analizar las llamadas para aprender de ellas."],
  ["Handoff", "El traspaso: cuando Ventas entrega el cliente a Customer Success."],
];

/* ── La página principal ────────────────────────────────────────────────────── */

function paginaPrincipal(): BloqueGuardado[] {
  const reglamento = leerReglamentoV5();

  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "la Escala es la vara con la que medimos qué tan bien opera un departamento —Ventas, Marketing o Servicio— en cinco niveles. No mide qué herramientas tiene: mide cómo trabaja.",
    ),
    parrafoRico([`Reglamento versión ${reglamento.version}. `, { italica: true }], [
      "Esta página es la explicación para el equipo; el detalle de cada dimensión está en las subpáginas de área.",
      { italica: true },
    ]),

    titulo(2, "Por qué existe"),
    parrafo(
      "Cuando una empresa nos pregunta «¿cómo estamos?», la respuesta fácil es una opinión: suena a que depende de con quién hable el cliente y de qué día tuvimos. La Escala existe para que no sea así. Es un modelo de madurez: describe estados en los que un departamento puede estar, y ubica al cliente en uno con la evidencia que juntamos.",
    ),
    parrafo(
      "El valor no está en el número. Está en que dos personas distintas, mirando el mismo departamento, lleguen al mismo lugar — y en que el cliente entienda por qué está ahí y qué lo mueve al siguiente nivel.",
    ),
    aviso(
      "advertencia",
      ["No mide herramientas, mide comportamiento. ", { negrita: true }],
      "Tener HubSpot Enterprise no sube a nadie de nivel. Lo que sube de nivel es que el proceso se siga, que el dato sea confiable y que la automatización tenga lógica.",
    ),

    titulo(2, "Cuándo se usa"),
    parrafo(
      "No es un ejercicio aparte: es parte del recorrido de una cuenta y aparece siempre en los mismos momentos.",
    ),
    numerado("En la exploración se junta la evidencia: cómo trabaja hoy el departamento, con qué datos y con qué cadencia."),
    numerado("En el diagnóstico se ubica cada dimensión en su nivel, con su evidencia al lado."),
    numerado("En la propuesta, la brecha entre donde está y donde quiere estar es lo que justifica el plan."),
    numerado("Entre 60 y 90 días después de entregar, se vuelve a medir para ver qué se movió de verdad."),
    numerado("Después, una vez por trimestre, para que el avance sea visible y no una impresión."),

    titulo(2, "Las tres piezas"),
    parrafo(
      "La Escala se usa en tres momentos, y conviene no confundirlos: el reglamento define los niveles, el diagnóstico los aplica y la página de resultados es lo que ve el cliente.",
    ),
    numerado("El reglamento: esta página. Dice qué significa cada nivel y con qué señales se reconoce."),
    numerado("El diagnóstico: alguien explora el departamento, junta evidencia y ubica cada dimensión."),
    numerado("El resultado: lo que se le devuelve al cliente — en qué nivel está y qué le toca mejorar."),

    titulo(2, "Los cinco niveles"),
    tarjetas(
      "2",
      ...NIVELES_V5.map((n, i) => tarjeta(`${i + 1} · ${n}`, QUE_SIGNIFICA[n] ?? "")),
    ),
    aviso(
      "exito",
      ["Funcional es la base. ", { negrita: true }],
      "Arquitectura montada, procesos que se siguen, roles definidos, datos confiables y automatización simple. Todo lo que pide lógica condicional, coordinación entre áreas o inteligencia artificial ya es Eficiente u Óptimo.",
    ),

    titulo(2, "Las ocho dimensiones, en dos capas"),
    parrafo("Cada departamento se mira por ocho dimensiones, agrupadas en dos capas."),
    titulo(3, "Base operativa: cómo está montado por dentro"),
    vinneta("Procesos y Rutinas — si el área se ejecuta por sistema o por personas."),
    vinneta("Tecnología y Automatización — cuánto del stack se aprovecha y cuánto se automatiza."),
    vinneta("Datos — si la información es base confiable para decidir."),
    vinneta("Equipo y Gobierno — si hay roles claros y con qué cadencia decide el líder."),
    titulo(3, "Producción: qué entrega hacia afuera"),
    parrafo(
      "Las cuatro responden la misma pregunta en las tres áreas, pero llevan nombre propio en cada una.",
    ),
    tabla([
      ["Pregunta", "Ventas", "Marketing", "Servicio"],
      ["Presentación", "Propuesta y Coherencia", "Marca y Presencia", "Consistencia de Atención"],
      ["Personalización", "Priorización de Leads", "Segmentación", "Priorización de Clientes"],
      ["Alcance", "Tracción del Deal", "Canales y Alcance", "Proactividad"],
      ["Aprendizaje", "Aprendizaje de Ganadas y Perdidas", "Medición y Aprendizaje", "Escalabilidad del Servicio"],
    ]),

    titulo(2, "Cómo se calcula el nivel"),
    parrafo("Cada dimensión se ubica en un nivel del 1 al 5. El nivel de una capa es el de su dimensión más débil."),
    aviso(
      "advertencia",
      ["El piso, no el promedio. ", { negrita: true }],
      "Si en la base operativa Procesos, Tecnología y Equipo están en Funcional pero Datos está en Inicial, la base operativa es Inicial. Promediar dejaría que la dimensión rota se esconda detrás de las fuertes — y es justo ésa la que el cliente tiene que arreglar.",
    ),
    parrafo(
      "El resultado se lee por capa, no como una sola cifra: «tu base operativa está en Funcional, tu producción en Inicial» dice algo accionable que «Ventas: Inicial» esconde.",
    ),
    parrafo(
      "Además del nivel, se anota qué tan cerca está de cruzar al siguiente. Se anota una vez sobre la dimensión («Funcional, cerca de Eficiente»), no señal por señal.",
    ),

    titulo(2, "Cómo se relacionan las dos capas"),
    parrafo(
      "La base operativa habilita; la producción es lo que sale. No son dos mitades que se suman: sin datos confiables, roles definidos, cadencia de decisión y automatización con lógica, no hay dónde apoyar la proactividad sistemática ni el aprendizaje continuo, por mucha voluntad que le ponga el equipo.",
    ),
    parrafo(
      "Por eso la producción está definida de forma escueta en Funcional, y tres dimensiones ni siquiera tienen ese nivel. No es falta de criterio: esa capacidad todavía no puede existir. Un departamento Funcional es liviano en producción de forma honesta.",
    ),

    titulo(2, "Lo que dice la brecha entre las dos capas"),
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

    titulo(2, "Reglas para no dudar"),
    desplegable("La regla de automatización: manual → con lógica → autónomo", [
      parrafo("Funcional — automatización simple: un disparador, una acción. Sin lógica condicional ni coordinación entre áreas."),
      parrafo("Eficiente — automatización con lógica: secuencias con ramificación y timing, routing por varias condiciones, escalación de SLA, flujos que conectan áreas."),
      parrafo("Óptimo — la IA ejecuta y las personas validan: agentes que califican, agendan, resuelven o generan contenido."),
      aviso(
        "advertencia",
        "La IA no define Óptimo por sí sola. En Eficiente la IA ASISTE y la persona hace el trabajo; en Óptimo la IA LO HACE y la persona valida. La pregunta no es si hay IA: es quién ejecuta.",
      ),
    ]),
    desplegable("Cada evidencia cuenta en UNA sola dimensión", [
      vinneta("Pitch, plantillas, playbooks, criterios de etapa y cadencias → Procesos (1.1)."),
      vinneta("El forecast → Datos (1.3), no Procesos."),
      vinneta("La definición de a quién sirve el equipo (ICP) → Propuesta y Coherencia (1.5)."),
      vinneta("Marcar MQL → Marketing (2.6). Aceptar SQL → Ventas (1.6)."),
      vinneta("El lead scoring por reglas → 1.6 o 2.6, y siempre es nivel Eficiente."),
      vinneta("Un canal con bandeja → Tecnología. Usar ese canal para SALIR con cadencia → Canales (2.7)."),
      vinneta("La integración con el ERP → Tecnología del área que la implementa."),
      vinneta("La coordinación entre áreas (SLAs, handoffs) → Equipo y Gobierno, y su piso es Eficiente."),
      vinneta("La reunión recurrente → Procesos. Equipo y Gobierno solo dice que el líder la sostiene."),
    ]),
    desplegable("Tres dimensiones no tienen nivel Funcional", [
      parrafo(
        "Su piso es Eficiente, porque la capacidad que miden exige primero una base operativa madura: Tracción del Deal (1.7), Proactividad (3.7) y Escalabilidad del Servicio (3.8).",
      ),
      parrafo(
        "En cambio Aprendizaje de Ganadas y Perdidas (1.8) sí admite Funcional: registrar la razón de pérdida con una taxonomía definida es base, aunque analizar los patrones sea Eficiente.",
      ),
    ]),

    titulo(2, "Volver a medir"),
    parrafo(
      "La primera remedición va entre 60 y 90 días después de entregar una implementación. El plazo no es arbitrario: varios criterios de Funcional describen comportamiento sostenido, no algo instalado —que la cadencia se cumpla, que el equipo use el CRM por convicción, que la reunión se sostenga—, y eso no se puede verificar el día de la entrega.",
    ),
    parrafo("Después conviene repetirla cada trimestre, comparando dimensión por dimensión contra la medición anterior."),

    titulo(2, "La IA propone, un humano confirma"),
    parrafo(
      "El diagnóstico puede asistirse con IA: ubica cada dimensión, cita la evidencia y señala qué tan cerca está del siguiente nivel. Pero el nivel vale lo que valga la exploración que lo alimenta, y hay señales de juicio —«usan el CRM por convicción»— que no se verifican solas desde una entrevista.",
    ),
    aviso("peligro", "Ningún nivel se entrega como caja negra: siempre va con su evidencia («Datos en Inicial porque falta X y falta Y»)."),

    titulo(2, "Cómo se reporta"),
    parrafo("Cada dimensión diagnosticada se emite con su área, su número, su nivel y la evidencia que lo sustenta."),
    cita("Ventas — 1.6 Priorización de Leads — Eficiente — «lead scoring por reglas activo, target accounts identificadas»"),
    parrafo("El identificador estable es el número, no el nombre: los nombres se pueden afinar, los números no cambian."),

    titulo(2, "El detalle, área por área"),
    parrafo(
      "Cada área tiene su propia página con el detalle completo: la pregunta de cada dimensión y, nivel por nivel, las señales con las que se reconoce.",
    ),
    parrafoRico(
      mencion("escala-ventas", "Ventas", "💼"),
      "  ·  ",
      mencion("escala-marketing", "Marketing", "📣"),
      "  ·  ",
      mencion("escala-servicio", "Servicio", "🎧"),
    ),

    titulo(2, "Glosario"),
    ...GLOSARIO.map(([termino, definicion]) => parrafoRico([`${termino}: `, { negrita: true }], definicion)),

    titulo(2, "Quién la aplica"),
    parrafoRico(
      "La aplica quien lleva la cuenta, con el material de la exploración. Cómo encaja en el recorrido de un proyecto está en ",
      mencion("guia-de-cse", "Guía de CSE", "🎯"),
      ", y el diagnóstico que se le entrega al cliente se arma en Nexus: ",
      mencion("como-funciona-nexus", "¿Cómo funciona Nexus?", "🧭"),
      ".",
    ),

    divisor(),
    parrafoRico([`Escala de Rendimiento Smarteam · versión ${reglamento.version}`, { italica: true }]),
  ];
}

/* ── Una subpágina por área ─────────────────────────────────────────────────── */

function bloquesDeDimension(d: DimensionV5): BloqueGuardado[] {
  const bloques: BloqueGuardado[] = [
    titulo(3, `${d.id} ${d.nombre}`),
    aviso("info", [d.pregunta, { italica: true }]),
  ];

  for (const nivel of d.niveles) {
    if (nivel.ausente) {
      bloques.push(
        aviso("advertencia", [`${nivel.nombre}: `, { negrita: true }], nivel.resumen),
      );
      continue;
    }
    bloques.push(
      desplegable(
        `${nivel.valor} · ${nivel.nombre} — ${nivel.resumen}`,
        nivel.senales.length > 0
          ? nivel.senales.map((s) => vinneta(s))
          : [parrafo("Sin señales enumeradas: se reconoce por el resumen de arriba.")],
      ),
    );
  }
  return bloques;
}

function paginaDeArea(area: AreaV5, panorama: ReturnType<typeof leerReglamentoV5>["panorama"]): PaginaSembrada {
  const base = area.dimensiones.filter((d) => d.capa === "base");
  const produccion = area.dimensiones.filter((d) => d.capa === "produccion");

  return {
    slug: `escala-${area.nombre.toLowerCase()}`,
    titulo: area.nombre,
    icono: ICONO_POR_AREA[area.nombre] ?? "📄",
    bloques: [
      parrafo(area.intro),
      parrafoRico(
        "Esta página es el detalle de un área. Las reglas que valen para las tres —cómo se calcula el nivel, qué dice la brecha, cuándo se vuelve a medir— están en ",
        mencion("escala-de-rendimiento", "Escala de rendimiento", "📈"),
        ".",
      ),

      titulo(2, "Los cinco niveles de un vistazo"),
      parrafo("Cómo se ve el departamento en cada nivel, en el lenguaje con el que se le devuelve el resultado al cliente."),
      ...panorama.flatMap((p) => {
        const texto = p.porArea.find((a) => a.area === area.nombre)?.texto ?? "";
        return texto ? [desplegable(`${p.nivel}`, [parrafo(texto)])] : [];
      }),

      titulo(2, "Base operativa"),
      parrafo("Cómo está montado el departamento por dentro."),
      ...base.flatMap(bloquesDeDimension),

      titulo(2, "Producción"),
      parrafo("Qué entrega el departamento hacia afuera."),
      ...produccion.flatMap(bloquesDeDimension),
    ],
  };
}

/** La página «Escala de rendimiento» con sus tres subpáginas, lista para sembrar. */
export function construirEscala(): PaginaSembrada {
  const reglamento = leerReglamentoV5();
  return {
    slug: "escala-de-rendimiento",
    titulo: "Escala de rendimiento",
    icono: "📈",
    bloques: paginaPrincipal(),
    hijas: reglamento.areas.map((a) => paginaDeArea(a, reglamento.panorama)),
  };
}
