/**
 * lib/documentacion/semillas/base/la-empresa.ts — la sección «La empresa».
 *
 *   🏛️ La empresa                 quiénes somos, alianzas y certificaciones
 *   ├── 💡 Propósito, misión y valores
 *   └── 📜 Historia e hitos
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * El PROPÓSITO lo escribió Elías (2026-09-13), palabra por palabra. La MISIÓN y los tres VALORES los
 * pidió redactados a partir de ese propósito: cada valor sale de una de sus tres partes (involucrarse,
 * entender la realidad, crecer con sentido) y se ata a prácticas que ya existen —la Escala, el
 * «siguiente nivel, no dos arriba», no inventar cifras— para que no sean un cartel.
 * Quiénes somos, la historia y las certificaciones salen de la página «Nosotros» del sitio web.
 */
import {
  aviso,
  cita,
  divisor,
  parrafo,
  parrafoRico,
  tabla,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "../bloques";
import type { BloqueGuardado } from "../../tipos";
import { a as deCs } from "../customer-success/enlaces";
import { a, pagina } from "./enlaces";
import { DIRECCION } from "./lideres";

export const PROPOSITO =
  "Creemos que las empresas merecen un aliado estratégico que realmente se involucre, entienda su realidad y las ayude a crecer con sentido.";

export const MISION =
  "Acompañamos a las empresas de Latinoamérica a operar mejor para crecer mejor: entendemos cómo trabajan de verdad, ponemos su tecnología a producir y nos quedamos hasta que el resultado se sostiene.";

export const VALORES = [
  {
    nombre: "Nos involucramos",
    idea: "El resultado del cliente es nuestro resultado. No entregamos y nos vamos: nos hacemos cargo de que lo que implementamos funcione en su operación.",
    seVe: [
      "El cliente habla con quien implementa, no con una mesa de ayuda.",
      "Decimos lo que vemos que falta, aunque no esté en el alcance.",
      "Un compromiso se cumple, o se avisa antes de que venza.",
    ],
    noHacemos: [
      "Dar un proyecto por terminado porque quedó configurado, aunque nadie lo use.",
      "Guardarnos un problema hasta la reunión de cierre.",
    ],
  },
  {
    nombre: "Entendemos antes de proponer",
    idea: "Cada empresa es distinta. Antes de recomendar algo escuchamos cómo trabaja de verdad y medimos dónde está, con evidencia.",
    seVe: [
      "Diagnosticamos con la Escala de Rendimiento, y cada nivel va con su evidencia.",
      "Separamos lo que el cliente nos dijo de lo que estamos dando por supuesto.",
      "Adaptamos la solución a su proceso, no su proceso a una plantilla.",
    ],
    noHacemos: [
      "Llegar con la solución antes de conocer el problema.",
      "Afirmar algo del cliente que nadie verificó.",
    ],
  },
  {
    nombre: "Crecemos con sentido",
    idea: "Recomendamos lo que mueve al cliente al siguiente paso, no lo que agranda la venta. Y crecemos nosotros también: aprendemos juntos para hacerlo mejor en cada proyecto.",
    seVe: [
      "Proponemos el siguiente nivel, no dos arriba.",
      "Hablamos con honestidad, sin venderle de más a nadie.",
      "Compartimos lo que aprendemos en la sesión de aprendizaje del equipo.",
    ],
    noHacemos: [
      "Inventar cifras o prometer resultados que no podemos sostener.",
      "Vender lo que el cliente no va a poder usar.",
    ],
  },
] as const;

const HITOS: string[][] = [
  ["2018", "Fundación", "Nace Smarteam, para ayudar a las pymes a construir una infraestructura comercial sólida y eficiente."],
  ["2019", "Especialización", "Asesoría enfocada en procesos de venta: pioneros del Inbound Sales en la región, estructurando y profesionalizando equipos comerciales."],
  ["2020", "Alianza", "Partner oficial de HubSpot. Llegan los servicios en El Salvador, una cartera más diversa, y el equipo empieza a crecer."],
  ["2021", "Consolidación", "Se abren las divisiones de marketing, tecnología e implementación."],
  ["2022", "Expansión", "Más presencia regional, y se suman diseño, branding y desarrollo web."],
  ["2023", "Partner Platinum", "Partner Platinum de HubSpot, entre los 20 principales de Latinoamérica."],
  ["2024", "Partner Diamond", "Partner Diamond de HubSpot, entre los socios más destacados del mundo."],
  ["2025", "Top 7 de Latinoamérica", "Séptimo HubSpot Partner de Latinoamérica, con más de 200 implementaciones que conectan HubSpot con SAP, ERPs, e-commerce, plataformas financieras, WhatsApp y sistemas logísticos."],
  ["2026", "Elite Partner e Insider", "Elite Partner de HubSpot —un nivel que alcanza menos del 2% de los partners del mundo— y partner oficial de Insider, que suma datos de cliente y activación omnicanal."],
];

const CERTIFICACIONES: string[][] = [
  ["Alianza o certificación", "Qué significa"],
  ["HubSpot Elite Partner", "El nivel más alto del programa de partners de HubSpot."],
  ["Insider", "Partner oficial: plataforma de datos de cliente (CDP) y activación omnicanal."],
  ["HubSpot Onboarding Accreditation", "Acreditación de HubSpot para el onboarding de clientes."],
  ["HubSpot Service Implementation Accreditation", "Acreditación de HubSpot para implementar Service Hub."],
  ["HubSpot Academy", "Certificaciones de HubSpot Academy."],
  ["Meta Blueprint", "Certificación de publicidad en Meta."],
  ["Google Ads y Google Analytics", "Certificaciones de Google."],
  ["Amazon Lightsail", "Certificación de Amazon Web Services."],
];

const nota = (texto: string) => parrafoRico([texto, { italica: true }]);

function bloquesDeLaEmpresa(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "Smarteam es una consultora de Latinoamérica que pone a producir la tecnología comercial de sus clientes —CRM, datos de cliente e integraciones— para que operen mejor y crezcan mejor.",
    ),

    titulo(2, "Quiénes somos"),
    parrafo(
      "Somos un equipo multipaís que trabaja a distancia, con personas en Costa Rica, Nicaragua, El Salvador, México y Colombia, y que se encuentra durante el año para compartir más allá del trabajo.",
    ),
    parrafoRico(
      "Nuestra frase es ",
      ["«Para crecer mejor necesitas operar mejor»", { negrita: true }],
      ", y la idea que la sostiene es que no vendemos software: lo ponemos a producir.",
    ),
    tarjetas(
      "3",
      tarjeta(
        "Equipos chicos, no fábrica",
        "Equipos chicos y senior por proyecto: el cliente habla con quien implementa, no con una mesa de ayuda.",
      ),
      tarjeta(
        "Talento de toda Latinoamérica",
        "Personas de cinco países que entienden cómo se vende en cada mercado de la región.",
      ),
      tarjeta(
        "Partners de verdad",
        "Elite Partner de HubSpot y partner oficial de Insider: certificados y con acceso directo a producto y soporte.",
      ),
    ),

    titulo(2, "Quién la dirige"),
    parrafoRico(
      `${DIRECCION} fundó Smarteam en 2018 y es su CEO. Cada departamento tiene quien lo lidera: `,
      a("departamentos"),
      ".",
    ),

    titulo(2, "Alianzas y certificaciones"),
    tabla(CERTIFICACIONES),

    titulo(2, "En esta sección"),
    parrafoRico("Por qué existimos y qué nos importa: ", a("proposito"), "."),
    parrafoRico("De dónde venimos: ", a("historia"), "."),

    divisor(),
    nota("Sale de la página «Nosotros» del sitio web de Smarteam."),
  ];
}

function bloquesDelProposito(): BloqueGuardado[] {
  return [
    titulo(2, "Nuestro propósito"),
    cita(PROPOSITO),
    parrafo(
      "El propósito dice por qué existimos. La misión dice qué hacemos para cumplirlo, y los valores, cómo lo hacemos.",
    ),

    titulo(2, "Nuestra misión"),
    cita(MISION),
    parrafo(
      "Cada parte de la frase es una promesa que se puede comprobar: entender antes de proponer —por eso diagnosticamos con evidencia—, poner la tecnología a producir y no solo instalarla, y quedarnos hasta que el cambio se sostiene —por eso volvemos a medir después de entregar.",
    ),
    parrafoRico("Con qué vara medimos dónde está una empresa y cuánto avanzó: ", deCs("escala"), "."),

    titulo(2, "Nuestros valores"),
    parrafo(
      "Son tres, y cada uno sale de una parte del propósito. Un valor que no se nota en el trabajo de todos los días es un cartel: por eso cada uno dice cómo se ve y qué no hacemos.",
    ),
    ...VALORES.flatMap((v, i) => [
      titulo(3, `${i + 1}. ${v.nombre}`),
      parrafo(v.idea),
      tarjetas(
        "2",
        tarjeta("Cómo se ve", ...v.seVe.map((t) => vinneta(t))),
        tarjeta("Lo que no hacemos", ...v.noHacemos.map((t) => vinneta(t))),
      ),
    ]),

    divisor(),
    nota(
      "El propósito lo escribió la dirección. La misión y los valores son su primera versión escrita, de septiembre de 2026.",
    ),
  ];
}

function bloquesDeLaHistoria(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "nacimos en 2018 para que las empresas dejaran de pelear con sus herramientas comerciales, y hoy somos Elite Partner de HubSpot y partner oficial de Insider.",
    ),

    titulo(2, "Cómo empezó"),
    parrafo(
      `Smarteam nace en 2018, cuando ${DIRECCION} identifica un problema que se repetía en decenas de empresas de la región: herramientas compradas con entusiasmo y abandonadas a los pocos meses, equipos comerciales operando a ciegas y datos de cliente dispersos en cualquier lugar menos donde hacían falta.`,
    ),
    parrafo(
      "En 2019 el proyecto se formaliza como consultora especializada en CRM. Desde entonces la apuesta es la misma: equipos chicos y senior, sin tercerizar lo importante, con acceso directo a quien realmente implementa.",
    ),

    titulo(2, "De 2018 a hoy"),
    tabla([["Año", "Hito", "Qué pasó"], ...HITOS]),
    parrafoRico("Dos proyectos contados de punta a punta: ", a("casos"), "."),

    divisor(),
    nota("Sale de la página «Nosotros» del sitio web de Smarteam."),
  ];
}

export function construirLaEmpresa(): PaginaSembrada {
  return {
    ...pagina("empresa"),
    bloques: bloquesDeLaEmpresa(),
    hijas: [
      { ...pagina("proposito"), bloques: bloquesDelProposito() },
      { ...pagina("historia"), bloques: bloquesDeLaHistoria() },
    ],
  };
}
