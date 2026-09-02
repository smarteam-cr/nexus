/**
 * scripts/seed-perfil-cse.ts
 *
 * Crea (o actualiza) el PERFIL DE PUESTO del **Customer Success Executive** —
 * documento de Roles, docType PERFIL, id estable "perfil-cse-v1". UPSERT idempotente.
 *
 * Derivado de la propuesta (`propuesta-cse-v1`), pero NO es la misma pieza con otro
 * rótulo. Lo que cambia, y por qué:
 *   · Se van `smarteam` y `oferta`: quien lee ya trabaja acá y ya firmó.
 *   · `partnerships` no existe en esta plantilla → el licenciamiento y las
 *     renovaciones se pliegan en una responsabilidad.
 *   · Entran las 4 secciones que la propuesta no tiene: medidas de arrastre (D2 lag),
 *     el marcador de HubSpot (D3), la ruta de madurez L1→L5 y el período de transición.
 *   · La VOZ cambia: la propuesta describe el puesto desde afuera; el perfil habla en
 *     imperativo y tuteo, y la cadencia lleva horario concreto en vez de frecuencia
 *     (espeja el perfil del CSL, `cmrq2s4vz0000aoii6l17wjdp`).
 *
 * La META es idéntica a la de la propuesta y a la del CSL a propósito: la del CSL es
 * la suma de la de sus CSEs. La RUTA DE MADUREZ también se comparte con el CSL: es la
 * escala del consultor de Smarteam, no una invención por puesto.
 *
 * Uso:
 *   dry-run:  npx tsx scripts/seed-perfil-cse.ts
 *   aplicar:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-perfil-cse.ts --apply
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

const ROLE_ID = "perfil-cse-v1";
const TITLE = "Customer Success Executive (CSE)";
const AREA = "Customer Success";
const SUMMARY =
  "Implementa HubSpot de punta a punta en sus cuentas y responde por que el cliente resuelva su problema, no solo por entregar el proyecto.";

const PROFILE_MD = `> Smarteam está en transformación hacia una Consultoría Tecnológica Potenciada por IA (modelo **AI-First**): el equipo humano se enfoca donde aporta más valor — pensamiento crítico, criterio consultivo, habilidades blandas, adopción tecnológica y velocidad de respuesta.

**Misión.** Ser el dueño de un grupo de cuentas: implementar HubSpot de punta a punta, llevar la relación con el cliente y lograr que lo implementado **resuelva el problema del negocio**, no solo que el proyecto se entregue.

Cada proyecto recorre el mismo ciclo —Hand Off, Exploración, Diagnóstico, Planificación, Configuración técnica, Adopción, Validación de uso y Entrega— y vos lo conducís. El CSL acompaña, forma tu criterio y responde por la cartera completa; no ejecuta por vos.`;

const TRANSITION_MD = `**Mes 1 · Acompañado.** Entras a las cuentas de otro CSE como segunda persona: escuchas sesiones, lees handoffs y cronogramas, y armas los documentos en Nexus con revisión del CSL antes de que salgan. Todavía no sos dueño de una cuenta.

**Mes 2 · Cuentas propias con red.** Tomas 1 o 2 cuentas simples de punta a punta. Conduces vos las sesiones; el CSL entra a las que definen alcance o fecha y revisa cada compromiso antes de que llegue al cliente.

**Mes 3 · Autonomía.** Llevas tu cartera y el CSL pasa de revisar a acompañar: entra cuando lo pedís o cuando la cuenta se escala. Al cierre del mes se revisa el desempeño, el impacto y la evolución del rol.

De ahí en adelante el crecimiento se lee en la ruta de madurez: no es antigüedad, es qué complejidad de cuenta podés sostener solo.`;

const CONTENT = {
  profile: { md: PROFILE_MD },

  responsibilities: {
    items: [
      {
        title: "Implementación de punta a punta",
        detail:
          "Abarca conducir el proyecto por todo su ciclo, de Hand Off a Entrega, y dejar la configuración funcionando en HubSpot. La estrategia de la cartera completa es del CSL.",
      },
      {
        title: "Relación con el cliente",
        detail:
          "Sos la cara diaria de Smarteam en la cuenta: las sesiones, las expectativas y la conversación difícil cuando hay que tenerla. El CSL entra cuando la cuenta se escala.",
      },
      {
        title: "Diagnóstico del negocio, no de la herramienta",
        detail:
          "Que lo que se configura resuelva un problema que podés nombrar. Entender el negocio antes de tocar el portal es tuyo; el cliente no tiene por qué traerlo resuelto.",
      },
      {
        title: "Cronograma y compromisos de fecha",
        detail:
          "Abarca fases, fechas reales, avances y las particularidades que movieron el plan, con su porqué. Regalar alcance o correr la fecha sin registrarlo no es una opción.",
      },
      {
        title: "Adopción de tus cuentas",
        detail:
          "Que el cliente USE lo implementado: habilitar usuarios, acompañar los primeros ciclos reales y confirmar el uso antes de dar por entregado.",
      },
      {
        title: "Estado de tus proyectos en HubSpot",
        detail:
          "Que la etapa y el estado de cada proyecto tuyo se lean igual que en la realidad. La gobernanza del pipeline es del CSL; mantener el tuyo al día es tuyo.",
      },
      {
        title: "Licenciamiento y renovaciones de tus cuentas",
        detail:
          "Que cada cliente tenga las licencias y los hubs que su implementación necesita, y que ninguna renovación llegue sobre la fecha. Negociar el upgrade es de Ventas; lo que no cuadra se escala a Finanzas.",
      },
      {
        title: "Detección de oportunidades",
        detail:
          "Abarca qué necesita el negocio del cliente más allá del alcance actual. Llevarlo a la mesa con el CSL y Ventas es tuyo; negociar y cerrar es de Ventas.",
      },
      {
        title: "Feedback a Ventas y a Desarrollo",
        detail:
          "Devolver lo que la implementación revela: dónde lo vendido y lo entregado no coinciden, y qué traba técnica se repite. Decidir el cambio es de cada área.",
      },
      {
        title: "Trabajo con IA en tu día a día",
        detail:
          "Usar Nexus, sus agentes y lo que ya trae HubSpot para sacarte el trabajo repetitivo. Usarla con criterio es tuyo, construir la herramienta es de Desarrollo.",
      },
    ],
  },

  // D1 · La misma meta que el CSL: la suya es la suma de la de sus CSEs.
  wig: {
    fecha: "15 de noviembre",
    contexto:
      "Regalar alcance y correr la fecha son la misma fuga vista de dos lados: la que se come el margen del proyecto y la credibilidad de la siguiente promesa. Es la misma meta que persigue el CSL, porque la suya es la suma de la de sus CSEs.",
    condiciones: [
      {
        texto: "El 100% de mis proyectos respeta el alcance contratado",
        nota: "0 extensiones de proyectos regaladas.",
      },
      {
        texto: "El 100% de mis proyectos se entrega en la fecha pactada",
        nota: "O con retrasos imputables exclusivamente al cliente.",
      },
    ],
  },

  // D2 lead · 5 actos HUMANOS con número semanal.
  leadMeasures: {
    items: [
      {
        title: "Entiende el negocio, no solo el pedido",
        detail:
          "Conduce una sesión de descubrimiento y sal con un dolor nuevo entendido y escrito, no con una lista de tareas.",
        meta: "2 por semana.",
      },
      {
        title: "Mueve cada proyecto a su siguiente etapa",
        detail:
          "Revisa el cronograma de cada cuenta activa y ejecuta lo que la desbloquea; lo que dependa del cliente, pídelo con fecha.",
        meta: "Todas tus cuentas activas, cada semana.",
      },
      {
        title: "Asegura que el cliente use lo que implementaste",
        detail:
          "Acompaña a un usuario real usando lo que configuraste y corrige lo que le traba el uso. Configurado no es adoptado.",
        meta: "1 cuenta por semana.",
      },
      {
        title: "Anticipa el riesgo antes de que sea reclamo",
        detail:
          "Marca qué cuenta se está enfriando —silencio, fechas que se corren, usuario clave que no aparece— y llévala al CSL con una movida propuesta.",
        meta: "1 repaso de tu cartera por semana.",
      },
      {
        title: "Detecta la próxima necesidad de la cuenta",
        detail:
          "Identifica algo que el negocio necesita y todavía no compró, y llévalo a la mesa con el CSL y Ventas.",
        meta: "1 por semana.",
      },
    ],
  },

  // D2 lag · Los resultados que mueven las de arriba. Pocas, y se leen tarde.
  lagMeasures: {
    items: [
      {
        title: "Proyectos en alcance y en fecha",
        detail: "El resultado directo de la meta; se lee al cerrar cada proyecto.",
        meta: "100% de tus proyectos.",
      },
      {
        title: "Uso real de tus cuentas (UUS)",
        detail: "Si el cliente usa de verdad lo que implementaste.",
        meta: "≥ 70 promedio, ninguna bajo 40.",
      },
      {
        title: "Cuentas en riesgo",
        detail: "Las que se enfrían y ponen la renovación en duda.",
        meta: "0 al cierre del semestre.",
      },
      {
        title: "Expansión en tus cuentas",
        detail: "Servicios o licencias nuevas que salieron de una necesidad que detectaste.",
        meta: "2 en el semestre.",
      },
    ],
  },

  // D3 · APUNTA al gráfico de HubSpot, no explica cómo armarlo.
  scoreboard: {
    items: [
      {
        measure: "Proyectos entregados en fecha",
        kind: "arrastre",
        chart: "gauge",
        fuente: "Pipeline de proyectos, cerrados del período.",
        ganar: "La aguja se queda en 100%.",
      },
      {
        measure: "UUS por cuenta",
        kind: "arrastre",
        chart: "bar",
        fuente: "Partner Clients Object, UUS por cuenta.",
        ganar: "Ninguna barra por debajo de 40.",
      },
      {
        measure: "Expansión cerrada en tus cuentas",
        kind: "arrastre",
        chart: "line",
        fuente: "Reporte de Negocios de tipo expansión.",
        ganar: "La línea acumulada va sobre el ritmo del semestre.",
      },
      {
        measure: "Etapa real de tus proyectos",
        kind: "prediccion",
        chart: "bar",
        fuente: "Pipeline de proyectos, por etapa.",
        ganar: "Ninguno lleva más de dos semanas en la misma etapa sin avance.",
      },
      {
        measure: "Sesiones de descubrimiento",
        kind: "prediccion",
        chart: "bar",
        fuente: "Reporte de Actividades.",
        ganar: "2 o más por semana.",
      },
    ],
  },

  // D4 · Acá sí van horarios: quien lee ya tiene agenda en Smarteam.
  cadencia: {
    items: [
      {
        evento: "WIG Session de Customer Success",
        quienes: "CSL + todo el equipo de CSEs. Asistencia obligatoria.",
        cuando: "Lunes 8:30, 20 min. Sagrada: no se mueve.",
        formato:
          "1) Rindes cuentas de tu compromiso de la semana pasada. 2) Se mira el marcador. 3) Te comprometes a 1-2 movidas para esta semana. El torbellino no entra acá.",
      },
      {
        evento: "Revisión de cuenta con el CSL",
        quienes: "Vos + el CSL.",
        cuando: "Semanal si la cuenta está en riesgo; quincenal el resto de tu cartera.",
        formato:
          "Se abre el cronograma y el estado real del negocio: qué lo frena, quién decide, qué se escala. Sale con acciones y responsable.",
      },
      {
        evento: "Sesiones del proyecto con el cliente",
        quienes: "Vos + la contraparte del cliente; el CSL entra cuando la cuenta se escala.",
        cuando: "Según el cronograma de cada proyecto.",
        formato:
          "Descubrimiento, validación, habilitación y entrega. Las conduces vos: sos la cara de Smarteam en esa cuenta.",
      },
      {
        evento: "1:1 con el CSL",
        quienes: "Vos + el CSL, uno a uno.",
        cuando: "Mensual, 45 min.",
        formato: "Ruta de madurez, criterio consultivo y carga de trabajo. Es formación, no revisión de tareas.",
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
        detail: "Detectas lo que la cuenta va a necesitar después y lo llevas a la mesa. Se paga aparte del salario.",
      },
      {
        title: "Criterio propio",
        detail:
          "Cada vez necesitas menos que te digan qué hacer: propones el camino y lo defiendes con lo que sabes del cliente.",
      },
      {
        title: "La IA a tu favor",
        detail: "Nexus y los agentes te sacan el trabajo repetitivo, y ese tiempo se va al cliente y no a documentar.",
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
        detail: "Cada decisión de cuenta espera al CSL. Tu criterio no crece y la cartera se traba en una sola persona.",
      },
    ],
  },

  // La escala del CONSULTOR de Smarteam — compartida con el perfil del CSL a propósito:
  // es la misma carrera, no una escalera por puesto.
  maturityPath: {
    intro: "La escala del consultor en Smarteam: cada nivel suma complejidad, stack e impacto. Es tu ruta de crecimiento en el puesto — no la mide la antigüedad, la mide qué cuenta podés sostener solo.",
    levels: [
      {
        level: "L1",
        titulo: "Implementador HubSpot inicial",
        alcance: "1-2 Hubs básicos, conexiones nativas e integraciones estándar.",
        impacto: "Asimila el método Smarteam e implementa rápido con Breeze.",
      },
      {
        level: "L2",
        titulo: "Consultor Multi-Hub y WhatsApp básico",
        alcance: "Ecosistema HubSpot completo; WhatsApp con conectores del marketplace.",
        impacto: "Asegura la adopción técnica integral del cliente.",
      },
      {
        level: "L3",
        titulo: "WhatsApp Empresarial avanzado + inglés",
        alcance: "HubSpot full stack y soluciones avanzadas de WhatsApp Empresarial.",
        impacto: "Maximiza los canales directos y la conversión en portales maduros.",
      },
      {
        level: "L4",
        titulo: "Consultor de negocio",
        alcance: "HubSpot orientado a RevOps; propone integraciones con APIs y Webhooks.",
        impacto: "Entiende a cada cliente como un negocio con un path de crecimiento.",
      },
      {
        level: "L5",
        titulo: "Consultor AI-First",
        alcance: "Ecosistemas integrados con múltiples sistemas y soluciones a medida con IA.",
        impacto: "Genera cualquier solución desde las necesidades del cliente y se enfoca en su revenue.",
      },
    ],
  },

  transitionPeriod: { md: TRANSITION_MD },
};

async function main() {
  const APPLY = resolverApply();
  const { prisma, close } = createScriptDb();
  try {
    const previo = await prisma.roleProfile.findUnique({
      where: { id: ROLE_ID },
      select: { id: true, docType: true },
    });

    console.log(`\n${previo ? "ACTUALIZA" : "CREA"} el documento ${ROLE_ID}`);
    console.log(`  título:  ${TITLE}`);
    console.log(`  área:    ${AREA}`);
    console.log(`  resumen: ${SUMMARY}`);
    console.log(`  secciones (${Object.keys(CONTENT).length}): ${Object.keys(CONTENT).join(", ")}`);
    console.log(`  ↑ las 4 que la propuesta no tiene: lagMeasures, scoreboard, maturityPath, transitionPeriod`);

    if (previo && previo.docType !== "PERFIL") {
      console.error(`⛔ ${ROLE_ID} existe y es ${previo.docType}, no PERFIL.`);
      process.exit(1);
    }

    if (!APPLY) {
      console.log("\nDRY-RUN. Para aplicar:");
      console.log('  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-perfil-cse.ts --apply');
      return;
    }

    await prisma.roleProfile.upsert({
      where: { id: ROLE_ID },
      create: {
        id: ROLE_ID,
        docType: "PERFIL",
        title: TITLE,
        area: AREA,
        summary: SUMMARY,
        content: CONTENT,
        createdByEmail: "egonzalez@smarteamcr.com",
      },
      update: { title: TITLE, area: AREA, summary: SUMMARY, content: CONTENT },
    });
    console.log("\n✓ Listo. Abrí Roles y revisá el perfil.");
  } finally {
    await close();
  }
}

main();
