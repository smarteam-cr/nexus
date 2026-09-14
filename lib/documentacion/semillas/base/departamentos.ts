/**
 * lib/documentacion/semillas/base/departamentos.ts — la sección «Departamentos».
 *
 *   🏢 Departamentos              quién lidera qué, y cómo se pasan el trabajo
 *   ├── 🌱 Customer Success       ← la sección que ya existía, entera
 *   ├── 💼 Ventas
 *   ├── 💰 Finanzas y Administración
 *   ├── 💻 Desarrollo
 *   ├── 📣 Marketing
 *   └── ⚙️ Revenue Operations
 *
 * ── LO QUE DICE CADA PÁGINA, Y DE DÓNDE SALE ─────────────────────────────────
 * Los líderes los fijó Elías (2026-09-13). Qué hace cada área y dónde vive en Nexus sale de lo que
 * Nexus ya declara —el menú (`lib/manual/contenido.ts`), los roles, los documentos del proyecto— y
 * del cruce entre áreas que ya escribió la portada de Customer Success. No se inventó un proceso:
 * las reuniones fijas, cómo pedirle algo a cada área y sus roles los completa quien la lidera, y
 * cada página lo dice al pie.
 */
import {
  aviso,
  divisor,
  enlace,
  numerado,
  parrafo,
  parrafoRico,
  tabla,
  titulo,
  vinneta,
  type PaginaSembrada,
  type Pieza,
} from "../bloques";
import type { BloqueGuardado } from "../../tipos";
import { construirCustomerSuccess } from "../customer-success";
import { a as deCs } from "../customer-success/enlaces";
import { a, pagina } from "./enlaces";
import { DIRECCION, LIDERES } from "./lideres";

interface Departamento {
  clave: "ventas" | "finanzas" | "desarrollo" | "marketing" | "revops";
  frase: string;
  queHace: string[];
  cruces: [con: string, que: string][];
  enNexus: { nombre: string; url?: string; detalle: string }[];
  leerMas: Pieza[];
}

const DEPARTAMENTOS: Departamento[] = [
  {
    clave: "ventas",
    frase:
      "Ventas consigue y cierra los tratos: conversa con el prospecto, entiende qué le duele, le propone y traspasa lo vendido a Customer Success.",
    queHace: [
      "Conversa con los prospectos y descubre qué les duele.",
      "Arma las propuestas comerciales, apoyada en el catálogo de casos de uso pre-cotizados.",
      "Estima en cada propuesta dónde está hoy la operación del prospecto en la Escala de Rendimiento: la brecha es el porqué de lo que se propone.",
      "Sigue las licitaciones públicas de SICOP.",
      "Cierra el trato y traspasa lo vendido a Customer Success.",
    ],
    cruces: [
      ["Marketing", "Le llega la demanda que generan el contenido y las campañas."],
      ["Customer Success", "Le entrega el traspaso de lo vendido. Recibe las oportunidades de expansión, y las negocia y las cierra."],
      ["Desarrollo", "Lo que se vende a medida lo construye Desarrollo."],
      ["Finanzas y Administración", "Lo acordado en la venta es lo que después se cobra."],
    ],
    enNexus: [
      { nombre: "Ventas → Propuestas", url: "/business-cases", detalle: "la propuesta de cada prospecto, generada a partir de lo que se habló con él." },
      { nombre: "Ventas → Casos de uso", url: "/sales/use-cases", detalle: "el catálogo de servicios pre-cotizados." },
      { nombre: "Ventas → SICOP", url: "/sales/sicop", detalle: "las licitaciones públicas." },
    ],
    leerMas: [a("servicios"), " · ", a("casos"), " · ", deCs("escala"), " · ", deCs("customerSuccess")],
  },
  {
    clave: "finanzas",
    frase: "Finanzas y Administración cuida la plata de la empresa: qué se cobró, qué está vencido y cuánto cuesta operar.",
    queHace: [
      "Cobra a los clientes lo acordado en cada venta, y sigue lo que está vencido.",
      "Factura y concilia: las facturas viven en Odoo.",
      "Lleva los costos de la empresa: herramientas, costos fijos y planilla.",
      "Le da a la dirección la caja y el punto de equilibrio.",
    ],
    cruces: [
      ["Ventas", "Lo acordado en la venta —montos y fechas de pago— es la base de lo que se cobra."],
      ["Customer Success", "El CSE avisa si el cliente menciona un tema de pago, y sigue con lo suyo."],
      ["Toda la empresa", "Las herramientas que se pagan pasan por acá."],
    ],
    enNexus: [
      { nombre: "Finanzas → Cobranza", url: "/cobranza", detalle: "a quién le toca cobrar y cómo va cada cobro." },
      { nombre: "Finanzas → Ingresos variables y comisiones de partner", url: "/finanzas/ingresos-variables", detalle: "los ingresos que no son una cuota fija." },
      { nombre: "Costos, caja y punto de equilibrio", detalle: "los ve solo la dirección." },
    ],
    leerMas: [a("herramientas"), " · ", deCs("nexus")],
  },
  {
    clave: "desarrollo",
    frase:
      "Desarrollo construye lo que no sale de configurar HubSpot: integraciones, automatizaciones, desarrollos a medida y sitios web.",
    queHace: [
      "Integra HubSpot con lo que el cliente ya usa: ERP, e-commerce, telefonía, WhatsApp y otros sistemas.",
      "Construye las automatizaciones y los desarrollos a medida que la configuración estándar no resuelve.",
      "Desarrolla sitios web orientados a conversión, conectados al CRM.",
      "Implementa la plataforma de datos de cliente de Insider cuando el proyecto la incluye.",
    ],
    cruces: [
      ["Customer Success", "Recibe lo que un proyecto necesita a medida. Las trabas técnicas que se repiten de proyecto en proyecto vuelven como aprendizaje."],
      ["Ventas", "Lo que se vende a medida lo construye Desarrollo."],
    ],
    enNexus: [
      { nombre: "Requerimiento técnico", detalle: "en cada proyecto con desarrollo a medida, Nexus abre este documento: qué hay que construir, con su arquitectura y su estimación." },
      { nombre: "Fase técnica del cronograma", detalle: "el plan del proyecto suma las tareas de desarrollo, con responsable y duración." },
    ],
    leerMas: [a("servicios"), " · ", deCs("nexus")],
  },
  {
    clave: "marketing",
    frase:
      "Marketing se ocupa de la marca, el contenido y la demanda de Smarteam: que quien puede necesitarnos nos encuentre y nos entienda.",
    queHace: [
      "Planifica y produce el contenido: ideas, temas, campañas y publicaciones.",
      "Define a quién le hablamos: el cliente ideal y las buyer personas.",
      "Cuida la voz y la línea gráfica de la marca.",
      "Acompaña a Ventas cuando la conversación con un cliente es de expansión.",
    ],
    cruces: [
      ["Ventas", "Le genera la demanda."],
      ["Customer Success", "Entra en el bucle con Ventas cuando la conversación es de expansión."],
    ],
    enNexus: [
      { nombre: "Marketing → Generación de contenido", url: "/marketing/contenido", detalle: "el contenido, las ideas de campaña, los temas y las fuentes." },
      { nombre: "Marketing → Audiencia", url: "/marketing/icp", detalle: "el cliente ideal (ICP) y las buyer personas." },
      { nombre: "Marketing → Voz de marca", url: "/marketing/voz", detalle: "cómo habla Smarteam cuando escribe." },
    ],
    leerMas: [a("marca"), " · ", a("servicios")],
  },
  {
    clave: "revops",
    frase:
      "Revenue Operations se asegura de que el proceso comercial funcione de punta a punta: los sistemas, los datos y las herramientas con que trabaja el resto de la empresa.",
    queHace: [
      "Opera el portal de HubSpot de Smarteam.",
      "Construye y mantiene Nexus.",
      "Conecta las herramientas entre sí para que el dato fluya sin copiarlo a mano.",
      "Ordena la información de la empresa, incluida esta base de conocimiento.",
    ],
    cruces: [
      ["Customer Success", "Recibe lo que cada implementación revela sobre el proceso comercial de punta a punta."],
      ["Toda la empresa", "Nexus y el portal de HubSpot de Smarteam son su responsabilidad."],
    ],
    enNexus: [
      { nombre: "Integraciones", url: "/integrations", detalle: "lo que Nexus conecta con el mundo —HubSpot, Google, Claude y Odoo— y el estado de cada conexión." },
      { nombre: "Auditoría", url: "/audits", detalle: "fotos del portal de HubSpot de Smarteam, con su análisis." },
    ],
    leerMas: [deCs("nexus"), " · ", a("herramientas")],
  },
];

const nota = (texto: string) => parrafoRico([texto, { italica: true }]);

function paginaDeDepartamento(d: Departamento): PaginaSembrada {
  return {
    ...pagina(d.clave),
    bloques: [
      aviso("info", ["En una frase: ", { negrita: true }], d.frase),
      parrafoRico(["Lo lidera: ", { negrita: true }], `${LIDERES[d.clave]}.`),

      titulo(2, "Qué hace"),
      ...d.queHace.map((t) => vinneta(t)),

      titulo(2, "Con quién se cruza"),
      tabla([["Con", "Qué se cruza"], ...d.cruces]),

      titulo(2, "Dónde vive en Nexus"),
      ...d.enNexus.map((n) =>
        parrafoRico(n.url ? enlace(n.nombre, n.url) : [n.nombre, { negrita: true }], `: ${n.detalle}`),
      ),

      titulo(2, "Para seguir leyendo"),
      parrafoRico(...d.leerMas),

      divisor(),
      nota(
        "Lo que falta acá lo completa quien lidera el departamento: sus reuniones fijas, cómo pedirle algo y sus roles.",
      ),
    ],
  };
}

function bloquesDeDepartamentos(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "seis departamentos, cada uno con quien lo lidera. No es una cadena de mando: es el mapa para saber a quién acudir.",
    ),
    tabla([
      ["Departamento", "Lo lidera", "Qué hace"],
      ["Customer Success", LIDERES.customerSuccess, "Que lo que el cliente compró le resuelva el problema, y que la cuenta renueve y crezca."],
      ["Ventas", LIDERES.ventas, "Consigue y cierra los tratos, arma las propuestas y traspasa el cliente a Customer Success."],
      ["Finanzas y Administración", LIDERES.finanzas, "Cobra, factura y lleva los costos de la empresa."],
      ["Desarrollo", LIDERES.desarrollo, "Construye lo que no sale de configurar HubSpot: integraciones, desarrollos a medida y sitios web."],
      ["Marketing", LIDERES.marketing, "La marca, el contenido y la demanda de Smarteam."],
      ["Revenue Operations", LIDERES.revops, "Que el proceso comercial funcione de punta a punta: los sistemas, los datos y las herramientas, Nexus incluido."],
    ]),
    parrafo(`La empresa la dirige ${DIRECCION}, su fundador y CEO.`),

    titulo(2, "Cómo se pasan el trabajo"),
    parrafo("El recorrido de un cliente, visto por departamento:"),
    numerado("Marketing atrae a quien puede necesitarnos: contenido, campañas y la voz de la marca."),
    numerado("Ventas conversa, propone y cierra. La propuesta ya estima dónde está la operación del prospecto en la Escala de Rendimiento."),
    numerado("Ventas traspasa lo vendido a Customer Success: el traspaso es el primer documento del proyecto."),
    numerado("Customer Success arranca el proyecto, diagnostica, planifica, implementa y entrega. Si hace falta algo a medida, entra Desarrollo."),
    numerado("Finanzas y Administración cobra lo acordado en la venta."),
    numerado("Revenue Operations sostiene los sistemas y los datos con que trabaja todo lo anterior."),

    titulo(2, "Cada departamento"),
    parrafoRico(
      deCs("customerSuccess"),
      " · ",
      a("ventas"),
      " · ",
      a("finanzas"),
      " · ",
      a("desarrollo"),
      " · ",
      a("marketing"),
      " · ",
      a("revops"),
    ),
    parrafoRico("Todas las personas, por área: ", a("equipo"), "."),

    divisor(),
    nota("¿Cambió quién lidera un área? Se corrige en esta tabla y en la página del departamento."),
  ];
}

export function construirDepartamentos(): PaginaSembrada {
  return {
    ...pagina("departamentos"),
    bloques: bloquesDeDepartamentos(),
    hijas: [construirCustomerSuccess(), ...DEPARTAMENTOS.map(paginaDeDepartamento)],
  };
}
