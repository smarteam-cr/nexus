/**
 * scripts/seed-propuesta-cse.ts
 *
 * Crea (o actualiza) la propuesta de contratación del **Customer Success
 * Executive** — documento de Roles, docType PROPUESTA, id estable
 * "propuesta-cse-v1". UPSERT idempotente.
 *
 * Es el ESPEJO de la propuesta del CSL (`propuesta-csl-v1`): mismo esqueleto de
 * Smarteam, misma meta y la misma cadencia vista desde el otro lado de la mesa.
 * El CSL responde por la cartera; el CSE es dueño de sus cuentas y las implementa.
 *
 * Decisiones de contenido:
 *   · La META es la MISMA que la del CSL (alcance contratado + fecha pactada) a
 *     propósito: la del CSL es la suma de la de sus CSEs, no una meta distinta.
 *   · El licenciamiento vive en `partnerships` (como en el CSL) y no en
 *     responsabilidades — ahí es donde se paga la comisión de Collab.
 *   · La comisión tiene DOS niveles según quién trabaja el proceso, y va en
 *     `destacados` (cards), no en la tabla: la tabla es el salario base.
 *
 * Uso:
 *   dry-run:  npx tsx scripts/seed-propuesta-cse.ts
 *   aplicar:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-propuesta-cse.ts --apply
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const ROLE_ID = "propuesta-cse-v1";
const TITLE = "Customer Success Executive";
const AREA = "Customer Success · Smarteam";
const SUMMARY =
  "Dueño de sus cuentas: implementa HubSpot de punta a punta y logra que el cliente resuelva su problema, no solo que el proyecto se entregue.";

const PROFILE_MD = `Smarteam es una consultora de HubSpot que está pasando a ser una **consultoría tecnológica potenciada por IA**. En la práctica, la IA se encarga del trabajo repetitivo y las personas hacen lo que la IA no puede: relacionarse con el cliente, ser desafiante cuando hay que serlo, decidir con criterio y sostener las conversaciones difíciles.

**Misión del puesto.** Ser el dueño de un grupo de cuentas: implementar HubSpot de punta a punta, llevar la relación con el cliente y lograr que lo implementado resuelva el problema del negocio.

Cada proyecto recorre un ciclo conocido —Hand Off, Exploración, Diagnóstico, Planificación, Configuración técnica, Adopción, Validación de uso y Entrega— y el CSE es quien lo conduce. El **Customer Success Lead (CSL)** no ejecuta por vos: acompaña, forma tu criterio y responde por la cartera completa.`;

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
      { nodo: "RevOps & Operations" },
      { nodo: "Ventas" },
      { nodo: "Customer Success Lead", equipo: "con su equipo de CSEs — acá entrarías vos" },
      { nodo: "Líder de desarrollo", equipo: "con su equipo de devs" },
      { nodo: "Marketing" },
    ],
  },

  profile: { md: PROFILE_MD },

  responsibilities: {
    items: [
      {
        title: "Implementación de punta a punta",
        detail:
          "Conducir el proyecto por todo su ciclo, de Hand Off a Entrega, y dejar la configuración funcionando en HubSpot. La estrategia de la cartera completa es del CSL.",
      },
      {
        title: "Relación con el cliente",
        detail:
          "Ser la cara diaria de Smarteam en la cuenta: conducir las sesiones, manejar expectativas y sostener la conversación difícil cuando hay que tenerla. El CSL entra cuando la cuenta se escala.",
      },
      {
        title: "Diagnóstico del negocio, no de la herramienta",
        detail:
          "Entender qué le duele al cliente y por qué antes de configurar nada. Lo que se implementa tiene que resolver ese problema, no completar una lista de tareas.",
      },
      {
        title: "Cronograma y compromisos de fecha",
        detail:
          "Mantener el cronograma vivo: fases, fechas reales, avances y las particularidades que lo movieron, con su porqué. Regalar alcance o correr la fecha sin registrarlo no es una opción.",
      },
      {
        title: "Adopción del cliente",
        detail:
          "Lograr que el cliente USE lo implementado: habilitar a los usuarios, acompañar los primeros ciclos reales y confirmar el uso antes de dar por entregado.",
      },
      {
        title: "Estado del proyecto en HubSpot",
        detail:
          "Cuidar que la etapa y el estado de tus proyectos se lean en HubSpot igual que en la realidad. La gobernanza del pipeline es del CSL; mantener el tuyo al día es tuyo.",
      },
      {
        title: "Detección de oportunidades",
        detail:
          "Identificar qué necesita el negocio del cliente más allá del alcance actual y llevarlo a la mesa con el CSL y Ventas. Negociar y cerrar es de Ventas.",
      },
      {
        title: "Feedback a Ventas y a Desarrollo",
        detail:
          "Devolver lo que la implementación revela: dónde lo vendido y lo entregado no coinciden, y qué traba técnica se repite. Decidir el cambio es de cada área.",
      },
      {
        title: "Trabajo con Nexus y los agentes",
        detail:
          "Apoyarte en Nexus, sus agentes y lo que ya trae HubSpot para sacarte de encima el trabajo repetitivo. El documento lo propone la IA; el criterio y la revisión son tuyos.",
      },
    ],
  },

  partnerships: {
    items: [
      {
        title: "Licenciamiento correcto de tus cuentas",
        detail:
          "Velar por que cada cliente tuyo tenga las licencias y los hubs que su implementación necesita, antes de que el proyecto choque con un límite del plan. Negociar el upgrade es de Ventas.",
      },
      {
        title: "Licencias Collab",
        detail:
          "Detectar y empujar, junto al CSL, la venta o el incremento de licencias Collab en tus cuentas. Es una de las dos partes del puesto que se pagan aparte del salario.",
      },
      {
        title: "Renovaciones sin sorpresas",
        detail:
          "Monitorear en HubSpot las conciliaciones y renovaciones de licencias de tus cuentas, para que ninguna llegue sobre la fecha. Lo que no cuadra se escala a Finanzas.",
      },
      {
        title: "Relación con el Customer Success de HubSpot",
        detail:
          "Conocer a la contraparte de HubSpot en tus cuentas más importantes y usarla cuando el proyecto la necesita, en vez de descubrirla en la fricción.",
      },
    ],
  },

  wig: {
    fecha: "15 de noviembre",
    contexto:
      "Regalar alcance y correr la fecha son la misma fuga vista de dos lados: la que se come el margen del proyecto y la credibilidad de la siguiente promesa. Es la misma meta que persigue el CSL, porque la suya es la suma de la de sus CSEs.",
    condiciones: [
      {
        texto: "El 100% de tus proyectos respeta el alcance contratado",
        nota: "0 extensiones de proyectos regaladas.",
      },
      {
        texto: "El 100% de tus proyectos se entrega en la fecha pactada",
        nota: "O con retrasos imputables exclusivamente al cliente.",
      },
    ],
  },

  leadMeasures: {
    items: [
      {
        title: "Entender el negocio del cliente, no solo su pedido",
        detail:
          "Conduce una sesión de descubrimiento con una cuenta y sal con un dolor nuevo entendido y escrito, no con una lista de tareas.",
        meta: "2 por semana.",
      },
      {
        title: "Mover cada proyecto a su siguiente etapa",
        detail:
          "Revisa el cronograma de cada cuenta activa y ejecuta lo que la desbloquea; lo que dependa del cliente, pídelo con fecha.",
        meta: "Todas tus cuentas activas, cada semana.",
      },
      {
        title: "Asegurar que el cliente use lo implementado",
        detail:
          "Acompaña a un usuario real usando lo que configuraste y corrige lo que le traba el uso. Configurado no es adoptado.",
        meta: "1 cuenta por semana.",
      },
      {
        title: "Anticipar el riesgo antes de que sea reclamo",
        detail:
          "Marca qué cuenta se está enfriando —silencio, fechas que se corren, usuario clave que no aparece— y llévala al CSL con una movida propuesta.",
        meta: "1 repaso de toda tu cartera por semana.",
      },
      {
        title: "Detectar la próxima necesidad de la cuenta",
        detail:
          "Identifica en una cuenta algo que el negocio necesita y todavía no compró, y llévalo a la mesa con el CSL y Ventas.",
        meta: "1 por semana.",
      },
    ],
  },

  cadencia: {
    items: [
      {
        evento: "Sesión de seguimiento general",
        quienes: "Vos con el CSL y el resto del equipo de CSEs.",
        cuando: "Semanal, al arrancar la semana.",
        formato:
          "Una puesta en común corta: cada quien rinde cuentas de lo que se comprometió, se mira cómo va la meta y se sale con una o dos movidas para la semana. La operación del día a día no entra acá.",
      },
      {
        evento: "Revisión de cuenta con el CSL",
        quienes: "Vos con el CSL.",
        cuando: "Semanal si la cuenta está en riesgo; quincenal para el resto de tu cartera.",
        formato:
          "Se abre el cronograma y el estado real del negocio del cliente: qué lo frena, quién decide y qué hay que escalar. Se cierra con acciones y responsable.",
      },
      {
        evento: "Sesiones con el cliente",
        quienes: "Vos con la contraparte del cliente; el CSL entra cuando la cuenta se escala.",
        cuando: "Según el cronograma de cada proyecto.",
        formato:
          "Las sesiones del proyecto —descubrimiento, validación, habilitación y entrega—. Las conduces vos: sos la cara de Smarteam en esa cuenta.",
      },
      {
        evento: "Desarrollo de criterio 1:1",
        quienes: "Vos con el CSL, por separado.",
        cuando: "Mensual.",
        formato:
          "Conversación de desarrollo: cómo va tu criterio consultivo, tu carga de trabajo y tu crecimiento. Es formación, no revisión de tareas.",
      },
    ],
  },

  successPaths: {
    items: [
      {
        title: "Éxito del cliente",
        detail:
          "Entiendes a tus clientes por sus problemas y por cómo se resuelven. El foco es que la cuenta quede mejor, no que el proyecto se cierre.",
      },
      {
        title: "Dueño de la cuenta",
        detail:
          "El cliente sabe que sos su contraparte, y adentro nadie tiene que preguntar en qué va tu proyecto: está escrito y al día.",
      },
      {
        title: "Diagnóstico antes que configuración",
        detail: "No configuras nada que no puedas explicar con el problema del negocio que resuelve.",
      },
      {
        title: "Adopción real",
        detail: "Tus clientes usan lo que implementaste. Entregar no es el final; el uso confirmado sí.",
      },
      {
        title: "Cronograma que se sostiene",
        detail:
          "Las fechas que pactas se cumplen, y cuando algo las mueve queda registrado con su porqué antes de que el cliente lo pregunte.",
      },
      {
        title: "Conversación difícil a tiempo",
        detail:
          "Cuando algo no va, lo dices temprano y de frente. Los problemas llegan al CSL cuando todavía se pueden resolver.",
      },
      {
        title: "Cuentas que crecen",
        detail:
          "Detectas lo que la cuenta va a necesitar después y lo llevas a la mesa. Ganas comisión por esto todos los meses.",
      },
      {
        title: "Criterio propio",
        detail:
          "Cada vez necesitas menos que te digan qué hacer: propones el camino y lo defiendes con lo que sabes del cliente.",
      },
      {
        title: "La IA a tu favor",
        detail:
          "Nexus y los agentes te sacan el trabajo repetitivo, y ese tiempo se va al cliente y no a documentar.",
      },
    ],
  },

  failurePaths: {
    items: [
      {
        title: "Enfoque único en la implementación",
        detail:
          "Cumples tareas y cierras el proyecto sin mirar el problema del cliente. Todo se entrega a tiempo, pero la cuenta no queda mejor de lo que estaba.",
      },
      {
        title: "Configurar sin entender",
        detail:
          "Se arma en HubSpot lo que el cliente pidió textualmente, sin preguntar para qué. Funciona, y nadie lo usa.",
      },
      {
        title: "Entregado pero no adoptado",
        detail:
          "El proyecto se cierra con la configuración lista y los usuarios sin habilitar. A los dos meses la cuenta está como al principio.",
      },
      {
        title: "Fechas que se corren en silencio",
        detail:
          "El cronograma se mueve y no queda registrado por qué. Cuando el cliente reclama, no hay con qué responderle.",
      },
      {
        title: "Alcance regalado",
        detail:
          "Se acepta cada pedido nuevo sin discutirlo ni registrarlo. El proyecto se estira, el margen se lo come y la próxima promesa vale menos.",
      },
      {
        title: "Problemas que llegan tarde",
        detail:
          "El CSL se entera del riesgo cuando ya es un reclamo. Lo que se podía resolver hace tres semanas ahora se escala.",
      },
      {
        title: "HubSpot desactualizado",
        detail: "Tu pipeline dice una cosa y la realidad otra. Cada estado hay que preguntarlo en vez de mirarlo.",
      },
      {
        title: "Relación delegada al chat",
        detail:
          "Todo se resuelve por escrito y no hay conversación. El cliente no te conoce y vos no sabes cómo va realmente su negocio.",
      },
      {
        title: "Cartera sin próximo paso",
        detail:
          "Ninguna de tus cuentas tiene claro qué sigue. La expansión aparece solo cuando el cliente la pide.",
      },
      {
        title: "Dependencia del CSL",
        detail:
          "Cada decisión de cuenta espera al CSL. Tu criterio no crece y la cartera se traba en una sola persona.",
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
    filas: [{ concepto: "Customer Success Executive", quincenal: "$1,250.00", mensual: "$2,500.00" }],
    destacados: [
      {
        titulo: "Plan de crecimiento (al finalizar el mes 3)",
        texto:
          "Al cerrar los 3 meses iniciales el salario base pasa a $2,600.00 mensuales ($1,300.00 quincenal). El hito viene con una revisión formal del desempeño, el impacto y la evolución del rol.",
      },
      {
        titulo: "Comisión por expansión",
        texto:
          "Sobre cada expansión, cross-selling o up-selling de tus cuentas: 5% para vos cuando llevas la mayor parte del proceso (el CSL suma 2%), o 3% cuando la mayor parte la lleva el CSL (que suma 4%). Hacer crecer la cartera se paga aparte del salario.",
        enfasis: true,
      },
      {
        titulo: "Comisión por licencias Collab",
        texto:
          "10% del valor de la licencia Collab vendida o incrementada, durante 3 meses, repartido entre el CSE y el CSL de la cuenta.",
      },
    ],
    bloques: [
      {
        titulo: "Otros detalles",
        items: [
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
  const APPLY = resolverApply();
  const { prisma, close } = createScriptDb();
  try {
    const previo = await prisma.roleProfile.findUnique({
      where: { id: ROLE_ID },
      select: { id: true, docType: true, title: true },
    });

    console.log(`\n${previo ? "ACTUALIZA" : "CREA"} el documento ${ROLE_ID}`);
    console.log(`  título:  ${TITLE}`);
    console.log(`  área:    ${AREA}`);
    console.log(`  resumen: ${SUMMARY}`);
    console.log(`  secciones (${Object.keys(CONTENT).length}): ${Object.keys(CONTENT).join(", ")}`);
    const of = CONTENT.oferta;
    console.log(`  oferta:  ${of.filas.map((f) => `${f.quincenal} / ${f.mensual}`).join(" · ")}`);
    console.log(`  extras:  ${of.destacados.map((d) => d.titulo).join(" · ")}`);

    if (previo && previo.docType !== "PROPUESTA") {
      console.error(`⛔ ${ROLE_ID} existe y es ${previo.docType}, no PROPUESTA.`);
      process.exit(1);
    }

    if (!APPLY) {
      console.log("\nDRY-RUN. Para aplicar:");
      console.log('  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-propuesta-cse.ts --apply');
      return;
    }

    await prisma.roleProfile.upsert({
      where: { id: ROLE_ID },
      create: {
        id: ROLE_ID,
        docType: "PROPUESTA",
        title: TITLE,
        area: AREA,
        summary: SUMMARY,
        content: CONTENT,
        createdByEmail: "egonzalez@smarteamcr.com",
      },
      update: { title: TITLE, area: AREA, summary: SUMMARY, content: CONTENT },
    });
    console.log("\n✓ Listo. Abrí Roles y revisá el documento.");
  } finally {
    await close();
  }
}

main();
