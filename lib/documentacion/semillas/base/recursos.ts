/**
 * lib/documentacion/semillas/base/recursos.ts — la sección «Recursos y herramientas».
 *
 *   🧰 Recursos y herramientas
 *   ├── 📈 Escala de rendimiento      ← la que ya existía, con sus tres áreas
 *   ├── 🧭 ¿Cómo funciona Nexus?      ← la que ya existía
 *   ├── 🔧 Herramientas
 *   └── 🎨 Marca
 *
 * ── DE DÓNDE SALE CADA COSA ──────────────────────────────────────────────────
 * HERRAMIENTAS: las que la empresa paga hoy, leídas de Finanzas → Costos (solo el NOMBRE, nunca el
 * monto; 2026-09-13), más Slack, que es el canal oficial y no figura como costo. Las inactivas no
 * entran. Para qué sirve cada una es la descripción del producto, no una regla inventada de uso.
 * MARCA: el manual del diseñador todavía no existe (Elías, 2026-09-13). Mientras tanto, la página
 * junta lo que ya se usa: la línea gráfica del sitio y de los documentos de Nexus, y las reglas de
 * voz que siguen los agentes.
 */
import {
  aviso,
  cita,
  divisor,
  enlace,
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
import { construirComoFunciona } from "../como-funciona";
import { construirEscala } from "../escala";
import { a as deCs } from "../customer-success/enlaces";
import { a, pagina } from "./enlaces";

const nota = (texto: string) => parrafoRico([texto, { italica: true }]);

export const HERRAMIENTAS: { grupo: string; filas: [herramienta: string, paraQue: string][] }[] = [
  {
    grupo: "El día a día",
    filas: [
      ["Google Workspace", "Correo, calendario, documentos y Google Meet, siempre con transcripción."],
      ["Slack", "El canal interno del día a día."],
      ["Nexus", "Lo que sabemos de cada cliente y los documentos de cada proyecto."],
      ["Loom", "Videos grabados de pantalla."],
      ["Miro", "Pizarras colaborativas."],
      ["1Password", "Contraseñas compartidas, guardadas de forma segura."],
    ],
  },
  {
    grupo: "Clientes y ventas",
    filas: [
      ["HubSpot", "Nuestro CRM —empresas, tratos y proyectos— y la plataforma que implementamos."],
      ["Apollo", "Prospección: búsqueda de empresas y contactos."],
      ["Atom Chat", "WhatsApp conectado a HubSpot."],
    ],
  },
  {
    grupo: "Inteligencia artificial",
    filas: [
      ["Claude", "Asistente de IA. Es también el modelo con que escriben los agentes de Nexus."],
      ["ChatGPT", "Asistente de IA."],
    ],
  },
  {
    grupo: "Marketing, diseño y web",
    filas: [
      ["Canva", "Diseño de piezas gráficas."],
      ["CapCut", "Edición de video."],
      ["Freepik y Magnific", "Imágenes y recursos gráficos, y su mejora con IA."],
      ["Ubersuggest", "Investigación de palabras clave para buscadores."],
      ["Divi", "Constructor de sitios en WordPress."],
      ["Hostinger", "Alojamiento de sitios web."],
      ["Cloud Domain", "Dominios web."],
    ],
  },
  {
    grupo: "Desarrollo e infraestructura",
    filas: [
      ["AWS", "Servidores y servicios en la nube."],
      ["Supabase", "Base de datos en la nube; es la de Nexus."],
      ["Userback", "Reportes de errores y comentarios sobre sitios y aplicaciones."],
    ],
  },
  {
    grupo: "Finanzas",
    filas: [
      ["Odoo", "Facturación. Nexus copia de acá las facturas para mostrarlas junto a cada cobro."],
      ["Factun", "Facturación electrónica."],
      ["QuickBooks", "Contabilidad."],
      ["Mercury", "Banco."],
    ],
  },
];

function bloquesDeRecursos(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "lo que usamos para trabajar: la vara con que medimos, la herramienta donde vive lo que sabemos, las herramientas del día a día y la marca.",
    ),
    tarjetas(
      "2",
      tarjeta(
        "La Escala de Rendimiento",
        "La vara con que medimos cómo opera un departamento: cinco niveles y dos capas. La usan la propuesta, el kickoff, el diagnóstico y la entrega.",
        parrafoRico(deCs("escala")),
      ),
      tarjeta(
        "Nexus",
        "Qué hace, qué documentos arma en cada proyecto y cómo se conecta con HubSpot.",
        parrafoRico(deCs("nexus")),
      ),
      tarjeta("Las herramientas", "Qué usamos, ordenado por para qué sirve.", parrafoRico(a("herramientas"))),
      tarjeta("La marca", "Cómo se ve y cómo habla Smarteam.", parrafoRico(a("marca"))),
    ),
  ];
}

function bloquesDeHerramientas(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "las herramientas que usa Smarteam, ordenadas por para qué sirven.",
    ),
    parrafo(
      "La lista sale de las herramientas que la empresa paga hoy, más Slack. Cuánto cuesta cada una lo ve solo la dirección, en Finanzas.",
    ),
    ...HERRAMIENTAS.flatMap((g) => [
      titulo(3, g.grupo),
      tabla([["Herramienta", "Para qué sirve"], ...g.filas]),
    ]),

    titulo(2, "Relacionado"),
    parrafoRico("Por dónde se habla cada cosa: ", deCs("trabajar"), "."),
    parrafoRico("Qué hace Nexus y con qué se conecta: ", deCs("nexus"), "."),

    divisor(),
    nota("¿Falta una herramienta, o sobra una que ya no usamos? Esta página se corrige como cualquier otra."),
  ];
}

export const COLORES: string[][] = [
  ["Color", "Código", "Dónde va"],
  ["Azul marino", "#051849", "El color base: fondos oscuros, portadas y cierres."],
  ["Azul royal", "#0B58D3", "Enlaces y detalles sobre fondo claro."],
  ["Azul brillante", "#1E8FF6", "Acentos sobre fondo oscuro."],
  ["Naranja", "#E8481C", "El acento de la marca: botones y llamados a la acción."],
  ["Coral", "#F87B5B", "El naranja en tamaño grande, sobre fondo oscuro."],
  ["Crema", "#FBF1E4", "Fondos cálidos y suaves."],
];

function bloquesDeMarca(): BloqueGuardado[] {
  return [
    aviso(
      "info",
      ["En una frase: ", { negrita: true }],
      "Smarteam habla claro y cercano, sin venderle de más a nadie, y se ve en azul marino con un acento naranja.",
    ),
    aviso(
      "advertencia",
      "El manual de marca todavía no existe. Mientras tanto, esto es lo que ya usamos en el sitio web y en los documentos que Nexus le entrega al cliente, para que todos sigamos la misma línea.",
    ),

    titulo(2, "Cómo nos presentamos"),
    cita("Para crecer mejor necesitas operar mejor."),
    parrafo(
      "La idea que sostiene la frase: no vendemos software, lo ponemos a producir. Somos una consultora de CRM, datos de cliente e integraciones para equipos comerciales de Latinoamérica, Elite Partner de HubSpot y partner oficial de Insider.",
    ),

    titulo(2, "Cómo hablamos"),
    vinneta("De tú: tuteo neutro, sin voseo ni ustedeo, en todo lo que lee el cliente."),
    vinneta("Claro antes que ingenioso: frases cortas y títulos de pocas palabras."),
    vinneta("Honesto: sin venderle de más a nadie. Lo que no está confirmado no se afirma."),
    vinneta("Nunca inventamos cifras: si un número no sale de un dato real, no va."),
    vinneta("Hablamos de lo que cambia en la operación del cliente, no de lo que nosotros configuramos."),
    parrafoRico(
      "La voz de marca que siguen los agentes cuando escriben contenido está en ",
      enlace("Marketing → Voz de marca", "/marketing/voz"),
      ".",
    ),

    titulo(2, "Los colores"),
    tabla(COLORES),
    vinneta("El naranja y el coral nunca van como texto chico sobre azul: sobre azul marino, el naranja va de fondo de un botón con texto blanco."),
    vinneta("El verde menta es de Insider: no se usa para Smarteam."),

    titulo(2, "La tipografía"),
    parrafo("Plus Jakarta Sans, del peso regular al extra bold."),

    divisor(),
    nota("Sale de la línea gráfica del sitio web y de los documentos de Nexus."),
  ];
}

export function construirRecursos(): PaginaSembrada {
  return {
    ...pagina("recursos"),
    bloques: bloquesDeRecursos(),
    hijas: [
      construirEscala(),
      construirComoFunciona(),
      { ...pagina("herramientas"), bloques: bloquesDeHerramientas() },
      { ...pagina("marca"), bloques: bloquesDeMarca() },
    ],
  };
}
