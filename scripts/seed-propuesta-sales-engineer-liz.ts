/**
 * scripts/seed-propuesta-sales-engineer-liz.ts
 *
 * Propuesta de contratación de **Liz Navarro** para el puesto de Sales Engineer —
 * documento de Roles, docType PROPUESTA. UPSERT idempotente sobre el documento que
 * Elías ya había creado vacío el 2026-10-12 (`cmv5o2pi500vb07qllgpbfdsu`, 0 secciones),
 * así que no se crea uno nuevo ni se pisa nada escrito a mano.
 *
 * ── DE DÓNDE SALE EL CONTENIDO ───────────────────────────────────────────────
 * Del documento de Ventas que pasó Elías (4 imágenes, 2026-10-13): propósito del rol,
 * alcance y estructura, responsabilidades A-F, distribución del tiempo y KPIs. Acá se
 * traduce a la plantilla de PROPUESTA, que tiene otra forma:
 *   · Los KPIs mensuales (≥8 demos, 5-7 cierres, ≥3 upsells, conversión ≥35%) NO tienen
 *     sección propia: se reparten entre el `meta` de cada acción semanal y la meta del
 *     puesto. Una propuesta no lleva tablero de indicadores.
 *   · «Relación con HubSpot» (bloque B) cae natural en `partnerships` — es la primera
 *     propuesta donde esa sección aplica de verdad; en las de CSE era licenciamiento.
 *   · Los porcentajes de dedicación (20/50/20/10) viajan en el título de cada
 *     responsabilidad, que es donde el lector los necesita.
 *   · Caminos de éxito y de fracaso NO están en el documento de origen: se derivan del
 *     rol, como se hizo con la propuesta del Asistente Administrativo Contable.
 *
 * ── DECISIONES DE ELÍAS (2026-10-13) ─────────────────────────────────────────
 *   · Ingreso: jueves 15 de octubre de 2026.
 *   · Salario: $2,500.00 mensuales, y $3,000.00 al cerrar el mes 3.
 *   · Comisión: 5% sobre el valor de la venta + 10% de la licencia durante sus primeros
 *     3 meses, este último ÍNTEGRO para ella (en las de CSE se partía con el CSL porque
 *     la cuenta la trabajaban dos personas; acá cierra ella).
 *   · La meta corre completa al cerrar el mes 3 — el MISMO hito en que sube el salario, para
 *     que el documento no prometa dos relojes distintos. **$30.000 USD mensuales** (bajada
 *     de los $40.000 del documento de Ventas, confirmado por Elías el 2026-10-13).
 *
 * ── SEGUNDA RONDA (2026-10-13): EL CENTRO PASA A SER LA EXPLORACIÓN ──────────
 * El documento estaba escrito alrededor del demo y la arquitectura técnica. Elías lo
 * recentró: el eje es la **exploración consultiva** y el demo es una CONSECUENCIA de ella.
 *   · La misión deja de ser "conectar negocio con arquitectura" y pasa a ser entender qué
 *     resultado persigue el cliente, ubicarlo en la matriz de Rendimiento y proponerle el
 *     siguiente paso. El criterio de éxito es el RESULTADO del cliente, no el proyecto.
 *   · Entra "Exploración consultiva" como PRIMERA responsabilidad (lienzo de Exploraciones,
 *     escala + GPCT/B/A/C&I, apertura a la asesoría como criterio de descalificación, y el
 *     aviso de que es preliminar: la profundidad justa para la primera venta).
 *   · El proceso pasa al consultivo: identificar → investigar → conectar → explorar → asesorar.
 *   · En acciones semanales, el demo deja de medirse solo: lo reemplazan 2 exploraciones con
 *     el lienzo completo. Se suma declarar oportunidades en el portal de partners.
 *   · Cartera instalada: el objetivo es SUBIR al cliente en la escala; los productos y las
 *     licencias quedan como medios.
 *
 * ⚠ TUTEO, no voseo (preferencia de Elías): "puedes", "llevas", "tú". Las propuestas de
 * CSE anteriores tienen voseo y quedaron fuera de esa norma — ver el resumen de la sesión.
 *
 * Uso:
 *   En tu PC, dry-run:  npx tsx scripts/seed-propuesta-sales-engineer-liz.ts
 *   En tu PC, aplicar:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-propuesta-sales-engineer-liz.ts --apply
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

/** El documento ya existe y está VACÍO: esto lo llena, no lo crea. */
const ROLE_ID = "cmv5o2pi500vb07qllgpbfdsu";
const TITLE = "Liz Navarro · Sales Engineer";
const AREA = "Propuesta de contratación · Smarteam";
const SUMMARY =
  "Entiende qué resultado persigue el cliente, lo ubica en la matriz de Rendimiento y le propone el siguiente paso que lo acerca a ese resultado.";

const PROFILE_MD = `Smarteam es una consultora de HubSpot que está pasando a ser una **consultoría tecnológica potenciada por IA**. En la práctica, la IA se encarga del trabajo repetitivo y las personas hacen lo que la IA no puede: entender el negocio del cliente, diseñar la solución y sostener la conversación difícil.

**Misión del puesto.** Entender qué resultado persigue el cliente, ubicarlo en la **matriz interna de Rendimiento** y proponerle el siguiente paso que lo acerca a ese resultado. El criterio de éxito es el resultado que el cliente espera, no el proyecto que se firma.

El puesto nace como una posición estratégica dentro del crecimiento comercial, y evoluciona del enfoque de ventas asistidas hacia una **dirección técnica-comercial integral**: conectar oportunidades con soluciones viables, escalables y rentables. El objetivo es consolidar *Sales Engineering* como un centro de soluciones y conocimiento técnico-comercial que potencie la relación con HubSpot, impulse clientes nuevos y maximice el valor de la cartera instalada.`;

const CONTENT = {
  smarteam: {
    proposito:
      "Creemos que las empresas merecen un aliado estratégico que realmente se involucre, entienda su realidad y las ayude a crecer con sentido.",
    estructuraTitulo: "Cómo está armado el equipo",
    estructuraNota:
      "Este es el esqueleto del equipo, no una cadena de mando. Da una idea de las piezas que existen y con quiénes trabajarías.",
    estructura: [
      { nodo: "CEO" },
      { nodo: "CRO", equipo: "Administración" },
      { nodo: "Ventas", equipo: "acá entrarías tú" },
      { nodo: "RevOps & Operations" },
      { nodo: "Customer Success Lead", equipo: "con su equipo de CSEs" },
      { nodo: "Líder de desarrollo", equipo: "con su equipo de devs" },
      { nodo: "Marketing" },
    ],
  },

  profile: { md: PROFILE_MD },

  // Los bloques A-F del documento de Ventas. El % de dedicación va en el título: es lo
  // primero que quiere saber quien lee una propuesta de un puesto comercial.
  responsibilities: {
    items: [
      {
        title: "Exploración consultiva",
        detail:
          "El centro del puesto. Cada exploración se lleva en el lienzo de Exploraciones de Nexus: se ubica al cliente en cada dimensión de la escala y se registra qué quiere lograr, qué retos tiene y qué le cuesta no lograrlo — la escala combinada con las preguntas de metas, planes, retos, tiempos, presupuesto, quién decide y consecuencias que ya usa HubSpot. También se mide qué tan abierto está a la asesoría, porque eso decide si es un cliente para crecer o si conviene descalificarlo a tiempo. Es un diagnóstico PRELIMINAR: la profundidad justa para cerrar la primera venta, no el diagnóstico completo que hace después Customer Success.",
      },
      {
        title: "Pipeline técnico-comercial de punta a punta",
        detail:
          "Liderar la venta desde la identificación hasta el cierre, cumpliendo el proceso consultivo de Smarteam: identificar → investigar por qué lo que hacemos le funciona a esa empresa → conectar → explorar → asesorar.",
      },
      {
        title: "Demos consultivos",
        detail:
          "El demo ocurre DESPUÉS de explorar y muestra lo que la exploración encontró: cuenta el caso del cliente —con sus retos y sus números—, no nuestro catálogo. Un demo antes de entender el negocio es una lista de funcionalidades.",
      },
      {
        title: "Arquitectura técnica y ROI por industria",
        detail:
          "Diseñar la arquitectura de cada oportunidad y su proyección de ROI, personalizada al sector del cliente. Es lo que separa una propuesta de una lista de precios.",
      },
      {
        title: "Propuestas, SOWs y modelo comercial",
        detail:
          "Elaborar las propuestas y los SOWs con precisión y enfoque de rentabilidad, y analizar factibilidad técnica y márgenes ANTES del cierre. Se entra con una implementación base o con un caso de uso; el crecimiento de ahí en adelante vive en SmartLoop y en el catálogo de casos de uso.",
      },
      {
        title: "Prospección y negocios nuevos (20% del tiempo)",
        detail:
          "Ejecutar outbound sobre los sectores foco e identificar oportunidades en bases internas o referidas. La vara son 3 clientes nuevos por trimestre por captación propia.",
      },
      {
        title: "Oportunidades inbound (50% del tiempo)",
        detail:
          "Gestionar los leads que llegan de eventos, marketing y HubSpot, y llevar el proceso comercial completo. La negociación y el cierre se coordinan con el CEO.",
      },
      {
        title: "Crecimiento de la cartera instalada (20% del tiempo)",
        detail:
          "Subir al cliente en la escala: mirar dónde quedó cada cuenta activa y proponer el siguiente paso que la mueve. Las re-implementaciones, los upgrades y los productos —ATOM Chat, Cooby, NUA Talk, Aircall, Infobip, integraciones por API— son los MEDIOS para ese salto, no el objetivo.",
      },
      {
        title: "Planificación y estrategia (10% del tiempo)",
        detail:
          "Analizar conversiones, tasas de cierre y performance comercial, y proponer mejoras de pricing, forecast y procesos en la planeación mensual con el CEO y el CFO.",
      },
    ],
  },

  // El bloque B del documento. Primera propuesta donde `partnerships` aplica literal:
  // acá partnership ES la relación con HubSpot, no el licenciamiento de una cuenta.
  partnerships: {
    items: [
      {
        title: "Relación directa con HubSpot",
        detail:
          "Mantener comunicación directa y proactiva con los Partner Reps y los Channel Consultants. El puesto pasa de coordinar puntualmente a ser la contraparte estable de Smarteam.",
      },
      {
        title: "Forecast conjunto y leads collab",
        detail:
          "Participar en las reuniones de forecast con HubSpot y canalizar los leads collab que salen de ahí hacia el pipeline.",
      },
      {
        title: "Registro en el portal de partners",
        detail:
          "Asegurar que cada oportunidad quede registrada y con seguimiento en el portal: para el partner, lo que no está registrado no existe — y no cuenta para el estatus ni para el acompañamiento.",
      },
      {
        title: "Aliados y licencias de la solución",
        detail:
          "Detectar qué licencia o add-on necesita cada solución (ATOM Chat, Cooby, NUA Talk, Aircall, Infobip) y moverlo con el aliado que corresponde. Es una de las dos partes del puesto que se pagan aparte del salario.",
      },
    ],
  },

  // D1 · Forma RECORRIDO y no condiciones: una meta comercial se mueve sobre una escala,
  // y la rampa de 3 meses es justamente el recorrido.
  wig: {
    desde: "Pipeline en cero y el proceso por aprender",
    hasta: "$30.000 USD en ingresos nuevos cada mes",
    fecha: "el cierre del mes 3",
    contexto:
      "Los primeros tres meses son de rampa: aprender el proceso consultivo, construir pipeline y cerrar las primeras cuentas. Al cerrar el mes 3 la meta corre completa, y es el mismo hito en el que sube el salario base. Es UNA sola meta porque todo lo demás —las exploraciones, la conversión, el crecimiento en la escala— existe para moverla.",
  },

  // D2 lead · 5 actos HUMANOS con número semanal. Los KPIs del documento son MENSUALES
  // (≥8 demos, 5-7 cierres, ≥3 upsells): acá bajan a la semana, que es donde se decide.
  leadMeasures: {
    items: [
      {
        title: "Abrir conversaciones que nadie te pasó",
        detail:
          "Sal a buscar oportunidades en los sectores foco: outbound, base interna y referidos. No esperes a que el lead entre solo.",
        meta: "2 reuniones iniciales agendadas por semana.",
      },
      {
        title: "Explorar antes de proponer",
        detail:
          "Lleva la exploración en el lienzo hasta dejarlo completo: el cliente ubicado en cada dimensión de la escala, qué quiere lograr, sus retos, lo que le cuesta no lograrlo y qué tan abierto está a la asesoría.",
        meta: "2 exploraciones por semana con el lienzo completo.",
      },
      {
        title: "Dejar cada oportunidad con su siguiente paso",
        detail:
          "Recorre el pipeline y mueve lo que está abierto: qué falta, quién decide y cuándo. Lo que no avanza se cierra o se reactiva con fecha.",
        meta: "Todo el pipeline, una vez por semana.",
      },
      {
        title: "Buscar el crecimiento en la cartera activa",
        detail:
          "Mira el comportamiento de un cliente actual y detecta el upgrade, la re-implementación o el servicio que todavía no compró.",
        meta: "1 oportunidad por semana.",
      },
      {
        title: "Validar que lo vendido se puede entregar",
        detail:
          "Antes de mandar la propuesta, revisa factibilidad técnica y margen con quien vaya a implementarlo. Vender lo que no se puede entregar se paga después.",
        meta: "Cada propuesta, sin excepción.",
      },
      {
        title: "Declarar las oportunidades ante HubSpot",
        detail:
          "Registra en el portal de partners las oportunidades de la semana. Lo que no está declarado no existe para el partner: no suma al estatus ni te consigue acompañamiento.",
        meta: "Todas las oportunidades abiertas, cada semana.",
      },
    ],
  },

  cadencia: {
    items: [
      {
        evento: "Forecast semanal de ventas",
        quienes: "Tú con el CEO.",
        cuando: "Semanal, al arrancar la semana.",
        formato:
          "Se mira el pipeline y el forecast del mes: qué entra, qué se cayó y qué falta para llegar. Se sale con una o dos movidas concretas, no con un repaso de tareas.",
      },
      {
        evento: "Reunión conjunta con HubSpot",
        quienes: "Tú con los Partner Reps y los Channel Consultants.",
        cuando: "Según el calendario del partner.",
        formato:
          "Forecast compartido, leads collab y oportunidades registradas en el portal de partners. De acá salen negocios que no entran por inbound.",
      },
      {
        evento: "Revisión de la cartera instalada",
        quienes: "Tú con Customer Success.",
        cuando: "Quincenal.",
        formato:
          "Qué cuentas tienen espacio para un upgrade, una re-implementación o un servicio nuevo, y cuáles tienen una desalineación entre lo vendido y lo implementado.",
      },
      {
        evento: "Planeación comercial",
        quienes: "Tú con el CEO y el CFO.",
        cuando: "Mensual.",
        formato:
          "Conversiones, tasas de cierre, márgenes y pricing. Es donde se corrigen el forecast y el proceso: se decide, no se informa.",
      },
    ],
  },

  successPaths: {
    items: [
      {
        title: "La solución antes que el producto",
        detail:
          "Entiendes el negocio del cliente y diseñas la arquitectura que lo resuelve. El demo muestra su caso, y el precio deja de ser el único argumento.",
      },
      {
        title: "Pipeline que se lee solo",
        detail:
          "Cualquiera abre HubSpot y sabe en qué va cada oportunidad, sin tener que preguntarte.",
      },
      {
        title: "Forecast confiable",
        detail:
          "Lo que dices que va a cerrar, cierra. El CEO y el CFO pueden planificar con tu número.",
      },
      {
        title: "Prospección propia viva",
        detail:
          "No dependes solo del inbound: traes oportunidades que nadie te pasó, y por eso un mes flojo de leads no es un mes flojo de ventas.",
      },
      {
        title: "HubSpot como aliado, no como proveedor",
        detail:
          "Los Reps y los Channel Consultants te conocen, te traen leads y te acompañan en las oportunidades grandes.",
      },
      {
        title: "Rentabilidad antes de la firma",
        detail:
          "Revisas factibilidad y margen antes de prometer. No entra un contrato que deje al equipo trabajando en rojo.",
      },
      {
        title: "La cartera también crece",
        detail:
          "Los clientes activos generan ingresos nuevos todos los meses. Esa parte se paga aparte del salario.",
      },
      {
        title: "Entrega sin sorpresas",
        detail:
          "Lo que firmaste es lo que el equipo implementa: el proyecto no arranca descubriendo promesas que no estaban en el SOW. Y tu exploración viaja con el handoff al Customer Success Executive —el resultado que busca el cliente, sus retos y su posición en la escala—, así que él profundiza en vez de empezar de cero.",
      },
      {
        title: "Criterio comercial propio",
        detail:
          "Propones pricing, foco y proceso con datos en la mano, y los defiendes en la mesa con el CEO y el CFO.",
      },
    ],
  },

  failurePaths: {
    items: [
      {
        title: "Demo sin exploración",
        detail:
          "Se muestra la herramienta antes de entender el negocio. El demo recorre funcionalidades, el cliente no sabe qué le cambia y el precio queda como único argumento.",
      },
      {
        title: "Diagnóstico de trámite",
        detail:
          "La exploración se llena por llenar: casillas completas que nadie retoma después y que el cliente no siente que reflejen su realidad. Un diagnóstico que no se usa cuesta la reunión y la credibilidad.",
      },
      {
        title: "Pipeline desactualizado",
        detail:
          "HubSpot dice una cosa y la realidad otra. El forecast deja de servir para decidir y cada estado hay que preguntarlo.",
      },
      {
        title: "Forecast inflado",
        detail:
          "Se promete el mes y se cae en la última semana. A la tercera vez, nadie planifica con tu número.",
      },
      {
        title: "Solo inbound",
        detail:
          "La prospección propia se abandona apenas entran leads. Cuando el inbound baja, no hay pipeline de respaldo.",
      },
      {
        title: "Vender lo que no se puede entregar",
        detail:
          "Se firma sin revisar factibilidad ni margen. El problema aparece en la implementación y lo paga otro equipo.",
      },
      {
        title: "Cartera instalada abandonada",
        detail:
          "Toda la energía va a lo nuevo. Los clientes activos renuevan sin crecer — o directamente no renuevan.",
      },
      {
        title: "HubSpot desconectado",
        detail:
          "Las oportunidades no se registran en el portal de partners y los Reps dejan de traer leads. El estatus de partner se enfría solo.",
      },
      {
        title: "Descuento en lugar de argumento",
        detail:
          "Se baja el precio para cerrar sin medir el impacto: el contrato entra y la rentabilidad no. Y los descuentos no se ofrecen de pasada en una reunión, menos todavía si está grabada: lo que se dice ahí queda, y después se negocia contra eso.",
      },
      {
        title: "Promesas fuera del alcance",
        detail:
          "Se ofrece en la venta lo que no está en el SOW. El cliente lo reclama después y la relación arranca en deuda.",
      },
      {
        title: "Venta en solitario",
        detail:
          "Lo que la venta aprende no vuelve a Marketing, a Customer Success ni a Desarrollo. Los mismos problemas se repiten negocio tras negocio.",
      },
    ],
  },

  oferta: {
    tituloTabla: "Propuesta de pago · 3 meses iniciales",
    encabezados: {
      concepto: "Colaborador",
      quincenal: "Salario quincenal",
      mensual: "Total mensual",
    },
    filas: [{ concepto: "Sales Engineer", quincenal: "$1,250.00", mensual: "$2,500.00" }],
    destacados: [
      {
        titulo: "Plan de crecimiento (al finalizar el mes 3)",
        texto:
          "Al cerrar los 3 meses iniciales el salario base pasa a $3,000.00 mensuales ($1,500.00 quincenal). Es el mismo hito en el que la meta de $30.000 USD mensuales empieza a correr completa, y viene con una revisión formal del desempeño y la evolución del rol.",
      },
      {
        titulo: "Comisión por venta",
        texto:
          "5% sobre el valor de cada venta que cierres: clientes nuevos, re-implementaciones, upgrades y cross-selling. Hacer crecer el negocio se paga aparte del salario.",
        enfasis: true,
      },
      {
        titulo: "Comisión por licencias",
        texto:
          "10% del valor de la licencia vendida o incrementada, durante sus primeros 3 meses. Íntegro para ti.",
      },
    ],
    bloques: [
      {
        titulo: "Otros detalles",
        items: [
          "Fecha de ingreso: jueves 15 de octubre de 2026.",
          "Jornada diurna continua acumulada.",
          "De 8:00 a.m. a 5:00 p.m. (Costa Rica), de lunes a viernes.",
          "Agencia de pago: Ontop.",
          "Disponibilidad para sesiones estratégicas, reuniones interáreas y acompañamiento de iniciativas prioritarias de la dirección.",
          "Participación activa en espacios de medición, seguimiento, planificación y mejora continua.",
        ],
      },
      {
        titulo: "Beneficios de la contratación",
        items: [
          "Bonificación anual sujeta a desempeño y resultados de la organización.",
          "12 días de vacaciones.",
          "11 días feriados.",
          "Acceso a capacitación constante.",
          "Participación en procesos de crecimiento y evolución estratégica de la empresa.",
        ],
      },
    ],
  },
};

async function main() {
  const APPLY = resolverApply({ tablas: ["RoleProfile"] });
  const { prisma, close } = createScriptDb();
  try {
    const previo = await prisma.roleProfile.findUnique({
      where: { id: ROLE_ID },
      select: { id: true, docType: true, title: true, area: true, content: true, publicToken: true },
    });
    if (!previo) {
      console.error(`⛔ No existe el documento ${ROLE_ID}. ¿Se borró desde la pantalla?`);
      process.exit(1);
    }
    if (previo.docType !== "PROPUESTA") {
      console.error(`⛔ ${ROLE_ID} es ${previo.docType}, no PROPUESTA. El contenido no corresponde.`);
      process.exit(1);
    }

    const previas = Object.keys((previo.content ?? {}) as Record<string, unknown>);
    console.log(`\nDocumento ${ROLE_ID}`);
    console.log(`  título:  "${previo.title}"  →  "${TITLE}"`);
    console.log(`  rótulo:  "${previo.area ?? ""}"  →  "${AREA}"`);
    console.log(`  secciones actuales: ${previas.length ? previas.join(", ") : "(vacío)"}`);
    console.log(`  a escribir (${Object.keys(CONTENT).length}): ${Object.keys(CONTENT).join(", ")}`);
    const of = CONTENT.oferta;
    console.log(`  oferta:  ${of.filas[0].quincenal} quincenal / ${of.filas[0].mensual} mensual`);
    console.log(`  extras:  ${of.destacados.map((d) => d.titulo).join(" · ")}`);
    console.log(`  ingreso: ${of.bloques[0].items[0]}`);

    if (previas.length > 0) {
      console.log(
        "\n  ⚠ Este documento YA tiene contenido: aplicar lo REEMPLAZA entero. Si se editó\n" +
          "    desde la pantalla, ese trabajo se pierde.",
      );
    }
    if (previo.publicToken) {
      console.log("  ⚠ Tiene link público vivo: lo que se sirve en esa URL cambia al aplicar.");
    }

    if (!APPLY) {
      console.log("\nDRY-RUN. Para aplicar, en tu PC:");
      console.log('  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-propuesta-sales-engineer-liz.ts --apply');
      return;
    }

    await prisma.roleProfile.update({
      where: { id: ROLE_ID },
      data: { title: TITLE, area: AREA, summary: SUMMARY, content: CONTENT },
    });
    console.log("\n✓ Contenido cargado. Abre Roles y revisa la propuesta de Liz.");
  } finally {
    await close();
  }
}

main();
