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
 * ── TERCERA RONDA (2026-10-14): SIMPLIFICAR Y HABLAR UN SOLO IDIOMA ──────────
 * Liz no conoce la escala, así que se nombra SIEMPRE «Escala de Rendimiento» y se explica
 * UNA sola vez, en la misión («la forma en que Smarteam ubica dónde está cada cliente y
 * hacia dónde puede crecer»). Antes aparecía como «matriz interna de Rendimiento», «matriz
 * de Rendimiento» y «la escala».
 *   · «Cómo es Smarteam» suma el método por encima de la persona + IA primero sobre Nexus.
 *   · El perfil pierde el párrafo de «dirección técnica-comercial integral» y «centro de
 *     soluciones» (quedaba del enfoque viejo): ahora dice que es quien entiende las
 *     necesidades del cliente y sabe dónde encaja cada servicio.
 *   · Responsabilidades: fuera los porcentajes de tiempo, fuera «la negociación y el cierre
 *     se coordinan con el CEO», fuera la tarjeta de Arquitectura técnica y ROI, y fuera el
 *     SOW — las propuestas se generan en Nexus y lo de Liz es explorar lo suficiente.
 *   · El diagnóstico de ventas queda nombrado igual en todo el documento: el necesario para
 *     la primera venta y para darle previsibilidad al cliente, NO el completo.
 *   · Cartera instalada (responsabilidad + acción semanal + sesión con CS): el rol es ser el
 *     PUENTE con quien decide, en las cuentas donde el interlocutor del día a día no decide.
 *   · Caminos: de 9 y 11 a **6 y 6**. Se fue «Entrega sin sorpresas» y toda mención al SOW;
 *     entra «Una buena exploración produce una buena propuesta». Las que se fueron decían
 *     variantes de las que quedaron.
 * ⛔ Sin tocar: propuesta económica, meta, fechas y beneficios.
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
  "Entiende qué resultado persigue el cliente, lo ubica en la Escala de Rendimiento y le propone el siguiente paso que lo acerca a ese resultado.";

const PROFILE_MD = `Smarteam es una consultora de HubSpot que está pasando a ser una **consultoría tecnológica potenciada por IA**. En la práctica, la IA se encarga del trabajo repetitivo y las personas hacen lo que la IA no puede: entender el negocio del cliente, diseñar la solución y sostener la conversación difícil.

**Misión del puesto.** Entender qué resultado persigue el cliente, ubicarlo en la **Escala de Rendimiento** —la forma en que Smarteam ubica dónde está cada cliente y hacia dónde puede crecer— y proponerle el siguiente paso que lo acerca a ese resultado. El criterio de éxito es el resultado que el cliente espera, no el proyecto que se firma.

Es el puesto que entiende las necesidades del cliente y sabe dónde encaja cada servicio de Smarteam: qué resuelve cada uno, para quién y en qué orden conviene hacerlo.

Todo gira alrededor de explorar bien, porque **una buena exploración es lo que produce una buena propuesta**. El diagnóstico que hace Ventas es el necesario para cerrar la primera venta y darle al cliente previsibilidad de hacia dónde puede crecer — no el diagnóstico completo, que viene después.`;

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
          "En el lienzo de Exploraciones de Nexus: ubicar al cliente en la Escala de Rendimiento y registrar qué quiere lograr, qué lo frena y qué le cuesta no lograrlo, con las preguntas de metas, planes, retos, tiempos, presupuesto, quién decide y consecuencias de HubSpot. También se mide qué tan abierto está a la asesoría: ahí se decide si es un cliente para crecer o si conviene descalificarlo.",
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
        title: "Propuestas y modelo comercial",
        detail:
          "Las propuestas se generan en Nexus; lo tuyo es explorar lo suficiente para que salgan bien, porque la propuesta se arma con lo que encontraste. Se entra con una implementación base o con un caso de uso; el crecimiento de ahí en adelante vive en SmartLoop y en el catálogo de casos de uso.",
      },
      {
        title: "Prospección y negocios nuevos",
        detail:
          "Ejecutar outbound sobre los sectores foco e identificar oportunidades en bases internas o referidas. La vara son 3 clientes nuevos por trimestre por captación propia.",
      },
      {
        title: "Oportunidades inbound",
        detail:
          "Gestionar los leads que llegan de eventos, marketing y HubSpot, y llevar el proceso comercial completo hasta el cierre.",
      },
      {
        title: "Crecimiento de la cartera instalada",
        detail:
          "La expansión en las cuentas donde la persona con la que el equipo trabaja día a día no toma decisiones: ahí eres el puente con quien sí las toma. Customer Success sostiene la relación operativa; tú abres la conversación de crecimiento con quien puede aprobarla.",
      },
      {
        title: "Planificación y estrategia",
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
      "Los primeros tres meses son de rampa: aprender el proceso consultivo, construir pipeline y cerrar las primeras cuentas. Al cerrar el mes 3 la meta corre completa, y es el mismo hito en el que sube el salario base. Es UNA sola meta porque todo lo demás —las exploraciones, la conversión, el crecimiento de la cartera— existe para moverla.",
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
          "Explora hasta tener lo necesario para la primera venta: dónde está el cliente en la Escala de Rendimiento, qué quiere lograr, qué lo frena y qué tan abierto está a la asesoría. No busques el diagnóstico completo — busca el que le da previsibilidad de hacia dónde puede crecer.",
        meta: "2 exploraciones por semana.",
      },
      {
        title: "Dejar cada oportunidad con su siguiente paso",
        detail:
          "Recorre el pipeline y mueve lo que está abierto: qué falta, quién decide y cuándo. Lo que no avanza se cierra o se reactiva con fecha.",
        meta: "Todo el pipeline, una vez por semana.",
      },
      {
        title: "Llegar a quien decide en las cuentas activas",
        detail:
          "Identifica una cuenta donde el día a día lo lleva alguien que no decide, y abre la conversación de crecimiento con quien sí puede aprobarla.",
        meta: "1 cuenta por semana.",
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
          "Qué cuentas se quedaron en el techo de quien las lleva día a día. Customer Success te dice dónde hace falta una decisión que su interlocutor no puede tomar, y tú abres esa conversación con quien sí decide.",
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

  // Seis y seis. Antes eran 9 y 11, y la mitad decía variantes de lo mismo: con la
  // exploración al centro, cada tarjeta que no habla de ella o de su consecuencia sobra.
  successPaths: {
    items: [
      {
        title: "Una buena exploración produce una buena propuesta",
        detail:
          "Cuando exploras bien, la propuesta se arma sola con lo que encontraste: el cliente se reconoce en ella y no hay que sostenerla con descuentos. Y eso mismo llega al equipo que implementa, que arranca sabiendo qué busca el cliente en vez de empezar de cero.",
      },
      {
        title: "El cliente ve dónde está y hacia dónde va",
        detail:
          "Sale de la conversación entendiendo su posición en la Escala de Rendimiento y cuál es el siguiente paso. Esa previsibilidad es buena parte de lo que compra.",
      },
      {
        title: "Prospección propia viva",
        detail:
          "No dependes solo del inbound: traes oportunidades que nadie te pasó, y por eso un mes flojo de leads no es un mes flojo de ventas.",
      },
      {
        title: "Forecast confiable",
        detail:
          "Lo que dices que va a cerrar, cierra, y el pipeline en HubSpot se lee sin tener que preguntarte. Dirección puede planificar con tu número.",
      },
      {
        title: "HubSpot como aliado, no como proveedor",
        detail:
          "Los Reps y los Channel Consultants te conocen, te traen leads y te acompañan en las oportunidades grandes.",
      },
      {
        title: "Llegas a quien decide",
        detail:
          "En las cuentas donde el día a día lo lleva alguien sin poder de decisión, abres la puerta con quien sí decide. Ahí es donde la cartera crece — y esa parte se paga aparte del salario.",
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
        title: "Forecast inflado",
        detail:
          "Se promete el mes y se cae en la última semana, o el pipeline en HubSpot dice una cosa y la realidad otra. A la tercera vez, nadie planifica con tu número.",
      },
      {
        title: "Solo inbound",
        detail:
          "La prospección propia se abandona apenas entran leads. Cuando el inbound baja, no hay pipeline de respaldo.",
      },
      {
        title: "La cuenta se queda sin interlocutor",
        detail:
          "Se trabaja solo con quien lleva el día a día y nunca se llega a quien decide. La cuenta renueva sin crecer — o directamente no renueva.",
      },
      {
        title: "Descuento en lugar de argumento",
        detail:
          "Se baja el precio para cerrar sin medir el impacto: el contrato entra y la rentabilidad no. Y los descuentos no se ofrecen de pasada en una reunión, menos todavía si está grabada: lo que se dice ahí queda, y después se negocia contra eso.",
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
