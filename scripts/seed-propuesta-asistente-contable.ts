/**
 * scripts/seed-propuesta-asistente-contable.ts
 *
 * Carga el CONTENIDO de la propuesta de contratación del **Asistente
 * Administrativo Contable** (documento de /roles, docType PROPUESTA) a partir del
 * perfil de puesto que trajo Finanzas en Word.
 *
 * Por qué un script y no la pantalla: son 9 secciones con ~50 ítems; escribirlas a
 * mano en el editor inline es una tarde. El documento queda editable como cualquier
 * otro — esto solo lo siembra.
 *
 * Qué NO carga y por qué:
 *   · `partnerships` — la sección existe en la plantilla de propuesta ("Responsabilidades
 *     de partnerships", alianzas HubSpot/Insider) y este puesto no las tiene. Sin
 *     contenido, el motor la OMITE en lectura (solo el hero es `pinned`).
 *   · Los límites con el CFO (§9 y §10 del Word) NO son una sección propia: viajan en el
 *     `detail` de cada responsabilidad, que es donde el lector los necesita.
 *   · Los KPIs (§6 del Word) no tienen sección en la propuesta (no hay lag ni marcador):
 *     los números viven en el `meta` de cada acción semanal y en las condiciones de la meta.
 *
 * Uso (idempotente — reescribe el `content` completo del documento):
 *   dry-run:  npx tsx scripts/seed-propuesta-asistente-contable.ts
 *   aplicar:  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-propuesta-asistente-contable.ts --apply
 */
import { createScriptDb } from "./lib/db";
import { resolverApply } from "./lib/guard";

/** El documento ya existe (lo creó Elías desde /roles); esto llena su contenido. */
const ROLE_ID = "cmsy8l1we000o07lljv1x8i2p";

const AREA = "Finanzas y Administración · Smarteam";
const SUMMARY =
  "Mantiene la contabilidad, la cobranza y los contratos al día en Odoo — y le devuelve al CFO el tiempo que hoy se le va en operación.";

const PROFILE_MD = `Smarteam es una consultora de HubSpot que está pasando a ser una **consultoría tecnológica potenciada por IA**. En la práctica, la IA se encarga del trabajo repetitivo y las personas hacen lo que la IA no puede: decidir con criterio, investigar lo que no cuadra y sostener las conversaciones difíciles.

**Misión del puesto.** Ejecutar y controlar los procesos administrativos, contables y contractuales de la organización: información financiera actualizada y confiable, conciliaciones bancarias correctas, facturación oportuna, control de cuentas por cobrar y por pagar, gestión documental y contractual, y trazabilidad de todo lo anterior en **Odoo ERP** y el software interno.

**Alcance.** Operaciones de Costa Rica, El Salvador y Estados Unidos. El puesto reporta al Head de Finanzas y Administración (CFO).

**Qué buscamos**

- **Formación:** estudiante avanzado, técnico o graduado en Contabilidad, Administración con énfasis contable o Finanzas. Se prefiere formación contable.
- **Experiencia:** idealmente 1 a 2 años en contabilidad administrativa, conciliaciones bancarias, cuentas por cobrar y por pagar, facturación y control documental.
- **Odoo:** nivel intermedio a avanzado, sobre todo en Accounting/Invoicing, Bank Reconciliation, Payments, Customers, Vendors y Reporting.
- **Herramientas:** Excel o Google Sheets a nivel intermedio/avanzado, y facilidad para aprender y documentar procesos en software interno.
- **Competencias:** atención al detalle, criterio contable, orden, seguimiento, confidencialidad, proactividad y capacidad analítica.`;

const CONTENT = {
  // ── Dónde entrarías ───────────────────────────────────────────────────────
  smarteam: {
    proposito:
      "Creemos que las empresas merecen un aliado estratégico que realmente se involucre, entienda su realidad y las ayude a crecer con sentido.",
    estructuraTitulo: "Cómo está armado el equipo",
    estructuraNota:
      "Este es el esqueleto del equipo, no una cadena de mando. Da una idea de las piezas que existen y con quiénes trabajarías.",
    estructura: [
      { nodo: "CEO" },
      { nodo: "CRO" },
      { nodo: "Head de Finanzas y Administración (CFO)", equipo: "con su equipo administrativo y contable" },
      { nodo: "RevOps & Operations" },
      { nodo: "Ventas" },
      { nodo: "Customer Success Lead", equipo: "con su equipo de CSEs" },
      { nodo: "Líder de desarrollo", equipo: "con su equipo de devs" },
      { nodo: "Marketing" },
    ],
  },

  // ── El puesto ─────────────────────────────────────────────────────────────
  profile: { md: PROFILE_MD },

  // ── Qué hace ──────────────────────────────────────────────────────────────
  // Cada `detail` cierra con el límite: qué queda del lado del CFO. Es §9 y §10 del
  // Word, repartidas donde se leen (y no como una tabla aparte que nadie mira).
  responsibilities: {
    items: [
      {
        title: "Conciliaciones bancarias",
        detail:
          "Concilia todas las cuentas de forma periódica, valida depósitos, transferencias, cargos y comisiones, y documenta o escala lo que no cuadra. El CFO revisa excepciones y riesgos.",
      },
      {
        title: "Registro contable en Odoo",
        detail:
          "Registra y clasifica ingresos, gastos, compras, pagos, cobros y movimientos financieros con su respaldo documental y la imputación correcta. El CFO supervisa.",
      },
      {
        title: "Cuentas por cobrar",
        detail:
          "Mantiene vivo el Aging Report, aplica los pagos recibidos, da seguimiento a los saldos vencidos y documenta compromisos de pago. La estrategia de cobranza y las escalaciones las define el CFO.",
      },
      {
        title: "Cuentas por pagar",
        detail:
          "Registra obligaciones, controla vencimientos, valida la documentación de proveedores y prepara la programación de pagos. Priorizar y aprobar es del CFO.",
      },
      {
        title: "Facturación local e internacional",
        detail:
          "Emite y controla la facturación validando datos fiscales, fechas, condiciones de pago y trazabilidad de cada factura. Las políticas y excepciones las define el CFO.",
      },
      {
        title: "Cierres mensuales",
        detail:
          "Prepara la información del cierre contable y administrativo: bancos, clientes, proveedores, facturación y respaldos actualizados dentro del calendario.",
      },
      {
        title: "Contratos de colaboradores, clientes y proveedores",
        detail:
          "Prepara los contratos sobre plantillas y criterios aprobados, gestiona firmas, renovaciones, adendas y terminaciones, y controla fechas de inicio y vencimiento. Las cláusulas especiales y todo lo que se salga del estándar los aprueba el CFO y, cuando corresponde, asesoría legal.",
      },
      {
        title: "Control contractual y documental",
        detail:
          "Mantiene un repositorio centralizado de contratos y respaldos —facturas, comprobantes, órdenes de compra, pagos— y alerta al CFO de vigencias y renovaciones antes de que venzan.",
      },
      {
        title: "Onboarding y offboarding",
        detail:
          "Prepara la documentación administrativa y contractual de ingresos y salidas de colaboradores, y mantiene los expedientes completos.",
      },
      {
        title: "Costos, forecast y reportería",
        detail:
          "Recopila y actualiza costos, horas y datos reales de ingresos, gastos, cobros y pagos, y prepara los reportes del área. Analizar la rentabilidad, construir escenarios y decidir es del CFO.",
      },
      {
        title: "Automatización de lo repetitivo",
        detail:
          "Detecta tareas repetitivas y controles paralelos, y propone cómo resolverlos dentro de Odoo o sus herramientas complementarias.",
      },
    ],
  },

  // ── La meta (D1 · WIG, forma «condiciones») ───────────────────────────────
  wig: {
    fecha: "el cierre de diciembre de 2026",
    contexto:
      "Un número que llega tarde o que no cuadra no sirve para decidir, y un contrato que aparece después de que la persona ya empezó no protege a nadie. Las tres condiciones son la misma promesa vista por tres lados: que la información financiera de Smarteam se pueda usar sin verificarla dos veces.",
    condiciones: [
      {
        texto: "El 100% de las conciliaciones bancarias cerradas cada mes",
        nota: "Cero diferencias sin justificar: lo que no cuadra se resuelve o queda documentado dentro del mismo período.",
      },
      {
        texto: "El cierre administrativo-contable listo dentro del calendario",
        nota: "Bancos, clientes, proveedores, facturación y respaldos actualizados en Odoo antes de la fecha de cierre.",
      },
      {
        texto: "El 100% de los contratos firmados antes de la fecha de inicio",
        nota: "Colaboradores, clientes y proveedores; con vigencias y renovaciones identificadas antes de vencer, no cuando ya son urgencia.",
      },
    ],
  },

  // ── Acciones del puesto (D2 · lead) ───────────────────────────────────────
  // Cinco, y todas son actos HUMANOS con número semanal. Los porcentajes salen de
  // los KPIs del Word, que en la propuesta no tienen sección propia.
  leadMeasures: {
    intro: "Lo que se hace cada semana para que la meta se cumpla sola al final del mes.",
    items: [
      {
        title: "Dejar la conciliación bancaria sin pendientes",
        detail:
          "Concilia las cuentas de la semana e investiga cada diferencia hasta resolverla o documentarla; lo que no cierre, se escala.",
        meta: "Todas las cuentas, cada semana.",
      },
      {
        title: "Mantener el cobro bajo control",
        detail:
          "Actualiza el Aging Report, aplica los pagos recibidos y deja documentado el seguimiento de cada saldo vencido.",
        meta: "1 actualización semanal, + las cuentas críticas escaladas.",
      },
      {
        title: "Sacar la facturación en calendario",
        detail:
          "Emite las facturas de la semana con datos fiscales y condiciones validados, y revisa que ninguna quede sin emitir.",
        meta: "≥98% del calendario de la semana.",
      },
      {
        title: "Adelantarse a los vencimientos contractuales",
        detail:
          "Recorre el repositorio de contratos y avisa al CFO de vigencias, renovaciones y firmas pendientes antes de que sean urgencia.",
        meta: "1 revisión semanal.",
      },
      {
        title: "Quitarle trabajo manual al proceso",
        detail:
          "Identifica una tarea repetitiva o un control paralelo (una hoja fuera de Odoo) y propone cómo resolverlo dentro del ERP.",
        meta: "1 propuesta por semana.",
      },
    ],
  },

  // ── Sesiones de seguimiento (D4 · cadencia) ───────────────────────────────
  cadencia: {
    items: [
      {
        evento: "Sesión semanal con el CFO",
        quienes: "El Asistente Administrativo Contable con el Head de Finanzas y Administración.",
        cuando: "Semanal, al arrancar la semana.",
        formato:
          "Una puesta en común corta: se rinde cuentas de lo comprometido, se mira cómo van bancos, cobros y contratos, y se sale con una o dos movidas para la semana. La operación del día no entra acá.",
      },
      {
        evento: "Revisión de cobranza",
        quienes: "El asistente con el CFO, y con quien lleva la cuenta cuando hace falta.",
        cuando: "Semanal.",
        formato:
          "Se abre el Aging: quién debe, desde cuándo y qué compromiso de pago hay. Se cierra con acciones y responsable.",
      },
      {
        evento: "Revisión contractual",
        quienes: "El asistente con el CFO; asesoría legal cuando el documento se sale del estándar.",
        cuando: "Quincenal.",
        formato:
          "Vigencias, renovaciones, firmas pendientes y contratos por vencer. De acá salen las alertas anticipadas.",
      },
      {
        evento: "Cierre mensual",
        quienes: "El asistente con el CFO.",
        cuando: "Mensual, en los primeros días del mes.",
        formato:
          "Se verifica que bancos, clientes, proveedores, facturación y respaldos estén completos y en fecha para cerrar el mes.",
      },
    ],
  },

  // ── Caminos de éxito ──────────────────────────────────────────────────────
  successPaths: {
    items: [
      {
        title: "Contabilidad limpia y al día",
        detail: "Odoo refleja oportunamente la realidad financiera, con todo clasificado y respaldado.",
      },
      {
        title: "Conciliaciones sin pendientes históricos",
        detail: "Cada cuenta se concilia y las diferencias se resuelven o se documentan dentro del mismo período.",
      },
      {
        title: "Cobranza bajo control",
        detail:
          "El Aging está actualizado cada semana, el seguimiento queda documentado y las cuentas críticas se escalan a tiempo.",
      },
      {
        title: "Facturación ordenada",
        detail:
          "Las facturas salen en calendario y bien documentadas: no se pierde ingreso por una falla administrativa.",
      },
      {
        title: "Contratos bajo control",
        detail:
          "Colaboradores, clientes y proveedores operan con documentos firmados, vigentes y localizables en el momento.",
      },
      {
        title: "Anticipación de vencimientos",
        detail: "Renovaciones y vencimientos se identifican antes de convertirse en urgencias.",
      },
      {
        title: "Odoo como fuente confiable",
        detail:
          "Lo que dice el ERP coincide con bancos, facturación, cobros, pagos y documentación. No hay hojas paralelas que discutan con él.",
      },
      {
        title: "Proactividad",
        detail: "Detectas errores, riesgos y faltantes antes de que el CFO tenga que pedirlos.",
      },
      {
        title: "Confidencialidad",
        detail: "Manejas información financiera, bancaria, salarial y contractual con criterio profesional.",
      },
      {
        title: "Liberación del CFO",
        detail: "El CFO baja su carga operativa recurrente y gana tiempo para análisis y estrategia.",
      },
    ],
  },

  // ── Caminos de fracaso ────────────────────────────────────────────────────
  failurePaths: {
    items: [
      {
        title: "Odoo desactualizado",
        detail: "El ERP no representa la realidad financiera y se acumulan registros pendientes.",
      },
      {
        title: "Conciliaciones atrasadas",
        detail: "Quedan diferencias bancarias antiguas o movimientos sin identificar.",
      },
      {
        title: "Errores repetitivos",
        detail: "Facturas incorrectas, pagos mal aplicados, registros duplicados o información incompleta.",
      },
      {
        title: "Trabajo reactivo",
        detail: "Cobros, vencimientos y documentos se atienden solo cuando alguien los pide.",
      },
      {
        title: "Contratos incompletos",
        detail: "Personas o clientes operando sin contrato, documentos sin firma o vencimientos no detectados.",
      },
      {
        title: "Falta de trazabilidad",
        detail: "No aparece rápido un contrato, una factura, un comprobante o su respaldo.",
      },
      {
        title: "Aging desactualizado",
        detail: "No hay visibilidad confiable de quién debe, cuánto y desde cuándo.",
      },
      {
        title: "Falta de criterio",
        detail: "Se detecta una inconsistencia y se registra igual, sin investigarla ni comunicarla.",
      },
      {
        title: "Dependencia excesiva",
        detail: "Actividades recurrentes ya definidas siguen necesitando instrucciones cada vez.",
      },
      {
        title: "Controles paralelos inconsistentes",
        detail: "Excel, Odoo y otros registros muestran cifras distintas y no hay una fuente oficial.",
      },
      {
        title: "Información tardía",
        detail: "Los datos llegan después del momento en que había que decidir.",
      },
      {
        title: "Problemas de confidencialidad",
        detail: "Manejo inadecuado o divulgación de información sensible.",
      },
    ],
  },

  // ── La oferta ─────────────────────────────────────────────────────────────
  // Sin `destacados`: este puesto va sin plan de crecimiento a 3 meses ni comisión
  // (decisión de Elías, 2026-08-18). La sección los soporta si mañana se agregan.
  oferta: {
    tituloTabla: "Propuesta de pago",
    encabezados: {
      concepto: "Colaborador",
      quincenal: "Salario quincenal",
      mensual: "Total mensual",
    },
    filas: [
      { concepto: "Asistente Administrativo Contable", quincenal: "$600.00", mensual: "$1,200.00" },
    ],
    bloques: [
      {
        titulo: "Otros detalles",
        items: [
          "Jornada diurna continua acumulada.",
          "De 8:00 a.m. a 5:00 p.m. (Costa Rica), de lunes a viernes.",
          "Agencia de pago: Ontop.",
          "Alcance de las operaciones de Costa Rica, El Salvador y Estados Unidos.",
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
    const actual = await prisma.roleProfile.findUnique({
      where: { id: ROLE_ID },
      select: { id: true, docType: true, title: true, area: true, summary: true, content: true },
    });
    if (!actual) {
      console.error(`⛔ No existe el documento ${ROLE_ID}. ¿Se borró desde /roles?`);
      process.exit(1);
    }
    if (actual.docType !== "PROPUESTA") {
      console.error(`⛔ ${ROLE_ID} es ${actual.docType}, no PROPUESTA. El contenido no corresponde a esa plantilla.`);
      process.exit(1);
    }

    const previas = Object.keys((actual.content ?? {}) as Record<string, unknown>);
    console.log(`\nDocumento: "${actual.title}" (${actual.docType})`);
    console.log(`  área:    ${actual.area ?? "—"}  →  ${AREA}`);
    console.log(`  resumen: ${actual.summary ?? "—"}`);
    console.log(`           → ${SUMMARY}`);
    console.log(`  secciones actuales: ${previas.length ? previas.join(", ") : "(vacío)"}`);
    console.log(`  secciones a escribir (${Object.keys(CONTENT).length}): ${Object.keys(CONTENT).join(", ")}`);
    console.log("  (partnerships queda vacía a propósito: el puesto no gestiona alianzas)");

    if (!APPLY) {
      console.log("\nDRY-RUN. Para aplicar:");
      console.log('  $env:ALLOW_PROD_WRITE="1"; npx tsx scripts/seed-propuesta-asistente-contable.ts --apply');
      return;
    }

    await prisma.roleProfile.update({
      where: { id: ROLE_ID },
      data: { area: AREA, summary: SUMMARY, content: CONTENT },
    });
    console.log("\n✓ Contenido cargado. Abrí /roles y revisá el documento.");
  } finally {
    await close();
  }
}

main();
