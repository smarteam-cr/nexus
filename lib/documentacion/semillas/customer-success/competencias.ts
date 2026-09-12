/**
 * lib/documentacion/semillas/customer-success/competencias.ts — «Competencias core» y sus tres hijas.
 *
 * Los perfiles de puesto traen caminos de éxito y de fracaso sueltos. Acá se ordenan por la
 * competencia que revelan, y separados por rol: la misma capacidad se ve distinta en quien ejecuta
 * la cuenta y en quien responde por la cartera.
 *
 * ── DE DÓNDE SALE CADA CAMINO ────────────────────────────────────────────────
 * La mayoría sale tal cual del perfil del CSE o de los caminos del CSL (perfil y propuesta, que es
 * la versión más completa). Donde un rol quedaba corto en una competencia, se completó: esas
 * tarjetas llevan la nota `AGREGADO`, para que se distinga qué dice el perfil y qué no.
 *
 * ⛔ Sin comisiones: el camino «Cuentas que crecen» del perfil del CSE termina en una alusión al
 * pago, y la de la propuesta del CSL también. Se copian sin esa frase.
 */
import {
  aviso,
  divisor,
  parrafo,
  parrafoRico,
  tarjeta,
  tarjetas,
  titulo,
  vinneta,
  type PaginaSembrada,
} from "../bloques";
import type { BloqueGuardado } from "../../tipos";
import { a, pagina, type ClaveDePagina } from "./enlaces";

/** Un camino: título y qué pasa en la cuenta. `nuevo` = el perfil de puesto no lo nombra. */
interface Camino {
  titulo: string;
  detalle: string;
  nuevo?: boolean;
}

const AGREGADO = "Agregado en esta guía: el perfil de puesto no lo nombra.";

function rejillaDeCaminos(caminos: Camino[]): BloqueGuardado {
  return tarjetas(
    "2",
    ...caminos.map((c) =>
      c.nuevo
        ? tarjeta(c.titulo, c.detalle, parrafoRico([AGREGADO, { italica: true }]))
        : tarjeta(c.titulo, c.detalle),
    ),
  );
}

interface Competencia {
  clave: ClaveDePagina;
  enUnaFrase: string;
  porQue: BloqueGuardado[];
  cse: { exito: Camino[]; fracaso: Camino[] };
  csl: { exito: Camino[]; fracaso: Camino[] };
  senales: string[];
}

function paginaDeCompetencia(c: Competencia): PaginaSembrada {
  return {
    ...pagina(c.clave),
    bloques: [
      aviso("info", ["En una frase: ", { negrita: true }], c.enUnaFrase),

      titulo(2, "Por qué importa acá"),
      ...c.porQue,

      titulo(2, "En el CSE"),
      titulo(3, "Caminos de éxito"),
      rejillaDeCaminos(c.cse.exito),
      titulo(3, "Caminos de fracaso"),
      rejillaDeCaminos(c.cse.fracaso),

      titulo(2, "En el CSL"),
      titulo(3, "Caminos de éxito"),
      rejillaDeCaminos(c.csl.exito),
      titulo(3, "Caminos de fracaso"),
      rejillaDeCaminos(c.csl.fracaso),

      titulo(2, "Señales en una cuenta real"),
      ...c.senales.map((s) => vinneta(s)),

      divisor(),
      parrafoRico("Las otras competencias: ", ...otrasCompetencias(c.clave), ". Los roles: ", a("rolCse"), " · ", a("rolCsl"), "."),
    ],
  };
}

const CLAVES_DE_COMPETENCIA: ClaveDePagina[] = ["dominio", "resolucion", "relacional"];

function otrasCompetencias(propia: ClaveDePagina) {
  const otras = CLAVES_DE_COMPETENCIA.filter((k) => k !== propia);
  return [a(otras[0]), " · ", a(otras[1])] as const;
}

/* ── Las tres competencias ──────────────────────────────────────────────────── */

const DOMINIO: Competencia = {
  clave: "dominio",
  enUnaFrase:
    "saber qué puede hacer HubSpot —y el resto del stack— y qué necesita el negocio del cliente, para no configurar lo que se pidió en vez de lo que hacía falta.",
  porQue: [
    parrafo(
      "Smarteam no vende licencias ni horas de configuración: vende que la operación del cliente funcione mejor. Eso exige dos saberes a la vez. El de producto dice qué es posible, qué cuesta y qué licencia pide. El de industria dice qué problema de negocio hay detrás de un pedido y qué hacen empresas parecidas.",
    ),
    parrafo(
      "Con uno solo, o se promete lo que la herramienta no hace, o se configura bien algo que no resuelve nada. La ruta de madurez es, sobre todo, la escala de esta competencia: de uno o dos Hubs básicos a ecosistemas integrados con soluciones a medida con IA.",
    ),
  ],
  cse: {
    exito: [
      {
        titulo: "Diagnóstico antes que configuración",
        detalle: "No configura nada que no pueda explicar con el problema del negocio que resuelve.",
      },
      {
        titulo: "La IA a su favor",
        detalle: "Nexus y los agentes le sacan el trabajo repetitivo, y ese tiempo se va al cliente y no a documentar.",
      },
      {
        titulo: "Licencias a la medida del proyecto",
        detalle:
          "Sabe qué hubs y qué nivel de licencia necesita lo que se implementa, y lo levanta antes de que el proyecto choque con un límite del plan.",
        nuevo: true,
      },
      {
        titulo: "Habla el idioma de la industria",
        detalle:
          "Conoce cómo opera el tipo de negocio del cliente y usa ese contexto para priorizar: lo que duele primero en una inmobiliaria no es lo que duele primero en una distribuidora.",
        nuevo: true,
      },
    ],
    fracaso: [
      {
        titulo: "Configurar sin entender",
        detalle: "Se arma en HubSpot lo que el cliente pidió textualmente, sin preguntar para qué. Funciona, y nadie lo usa.",
      },
      {
        titulo: "Enfoque único en la implementación",
        detalle:
          "Cumple tareas y cierra el proyecto sin mirar el problema del cliente. Todo se entrega a tiempo, pero la cuenta no queda mejor de lo que estaba.",
      },
      {
        titulo: "Prometer lo que la herramienta no hace",
        detalle:
          "Se compromete una funcionalidad sin verificar el plan o la licencia, y el proyecto choca con el límite a mitad de camino.",
        nuevo: true,
      },
      {
        titulo: "La misma receta para todos",
        detalle: "Se aplica la configuración de siempre sin mirar la industria ni el tamaño del cliente.",
        nuevo: true,
      },
    ],
  },
  csl: {
    exito: [
      {
        titulo: "Categorización estratégica",
        detalle:
          "Entiende la cartera por complejidad, revenue, importancia e integraciones, y sabe qué cuentas requieren mayor atención o seguimiento.",
      },
      {
        titulo: "Mapeo total en HubSpot",
        detalle: "El estado de cada proyecto está siempre reflejado en el pipeline, en la etapa que describe su situación real.",
      },
      {
        titulo: "Certificaciones al día",
        detalle:
          "Smarteam mantiene las certificaciones del programa de partners de HubSpot, y el estatus no se cae por requisitos vencidos.",
        nuevo: true,
      },
      {
        titulo: "Criterio técnico que se transmite",
        detalle:
          "Revisa diagnósticos con el CSE y le enseña a leer el negocio detrás del pedido, en vez de corregirle la configuración.",
        nuevo: true,
      },
    ],
    fracaso: [
      {
        titulo: "Todas las cuentas tratadas igual",
        detalle:
          "Sin criterio de complejidad, revenue o integraciones, la atención se reparte pareja y las cuentas críticas reciben lo mismo que las simples, hasta que una se cae.",
      },
      {
        titulo: "HubSpot desactualizado",
        detalle:
          "El pipeline dice una cosa y la realidad otra. Nadie puede confiar en el tablero para decidir, así que cada estado hay que preguntarlo cuenta por cuenta.",
      },
      {
        titulo: "Licencias que llegan por sorpresa",
        detalle:
          "Una renovación o una conciliación de licencias aparece sobre la fecha, y la conversación con el cliente arranca en desventaja.",
        nuevo: true,
      },
    ],
  },
  senales: [
    "El CSE explica cada cosa que configuró con el problema que resuelve.",
    "Las propuestas de mejora nombran la industria del cliente, no solo la herramienta.",
    "Nadie descubre un límite de licencia a mitad de proyecto.",
    "El diagnóstico ubica cada dimensión de la Escala con evidencia, no con impresiones.",
  ],
};

const RESOLUCION: Competencia = {
  clave: "resolucion",
  enUnaFrase:
    "encontrar la causa de lo que traba una cuenta, decidir con criterio propio y hacerlo mientras todavía se puede resolver.",
  porQue: [
    parrafo(
      "En una implementación casi nada falla de golpe: se atrasa una tarea, el cliente no manda un dato, un usuario clave deja de aparecer. Resolver problemas acá no es apagar incendios: es verlos venir, nombrar la causa y proponer la movida, con fecha.",
    ),
    parrafo("Lo que se resuelve a las dos semanas es una conversación. Lo que se resuelve a los tres meses es un reclamo."),
  ],
  cse: {
    exito: [
      {
        titulo: "Éxito del cliente",
        detalle:
          "Entiende a sus clientes por sus problemas y por cómo se resuelven. El foco es que la cuenta quede mejor, no que el proyecto se cierre.",
      },
      {
        titulo: "Cronograma que se sostiene",
        detalle:
          "Las fechas que pacta se cumplen, y cuando algo las mueve queda registrado con su porqué antes de que el cliente lo pregunte.",
      },
      {
        titulo: "Adopción real",
        detalle: "Sus clientes usan lo que implementó. Entregar no es el final; el uso confirmado sí.",
      },
      {
        titulo: "Criterio propio",
        detalle:
          "Cada vez necesita menos que le digan qué hacer: propone el camino y lo defiende con lo que sabe del cliente.",
      },
    ],
    fracaso: [
      {
        titulo: "Fechas que se corren en silencio",
        detalle: "El cronograma se mueve y no queda registrado por qué. Cuando el cliente reclama, no hay con qué responderle.",
      },
      {
        titulo: "Problemas que llegan tarde",
        detalle: "El CSL se entera del riesgo cuando ya es un reclamo. Lo que se podía resolver hace tres semanas ahora se escala.",
      },
      {
        titulo: "Alcance regalado",
        detalle:
          "Se acepta cada pedido nuevo sin discutirlo ni registrarlo. El proyecto se estira, el margen se lo come y la próxima promesa vale menos.",
      },
      {
        titulo: "Entregado pero no adoptado",
        detalle:
          "El proyecto se cierra con la configuración lista y los usuarios sin habilitar. A los dos meses la cuenta está como al principio.",
      },
      {
        titulo: "Dependencia del CSL",
        detalle: "Cada decisión de cuenta espera al CSL. El criterio no crece y la cartera se traba en una sola persona.",
      },
    ],
  },
  csl: {
    exito: [
      {
        titulo: "Éxito del cliente",
        detalle:
          "Entiende a los clientes por sus problemas y por cómo se resuelven y se destraban. El foco es llevar éxito a las cuentas, no solo cumplir el proyecto.",
      },
      {
        titulo: "Bucle de feedback",
        detalle: "Lo que la implementación revela vuelve al área que puede corregirlo: Ventas, Desarrollo o RevOps.",
      },
      {
        titulo: "Health-check a tiempo",
        detalle:
          "Cada cuenta marcada en riesgo tiene su revisión con el CSE esa semana: qué la traba, qué movida la desbloquea y quién la ejecuta.",
        nuevo: true,
      },
      {
        titulo: "Escalar, no absorber",
        detalle: "Lo que no se resuelve dentro del área lo escala. No lo absorbe ni lo resuelve por el CSE.",
        nuevo: true,
      },
    ],
    fracaso: [
      {
        titulo: "Desorientación estratégica",
        detalle: "Nada se atrasa, pero el cliente no tiene éxito: el proyecto se cumple y la cuenta no mejora.",
      },
      {
        titulo: "Tratar al CSE como operario",
        detalle: "Se revisan checklists en vez de formar criterio: el CSE aprende a cumplir, no a decidir.",
      },
      {
        titulo: "Feedback que muere en CS",
        detalle:
          "Lo que la implementación revela no vuelve a Ventas ni a Desarrollo. El mismo desajuste entre lo vendido y lo entregado se repite proyecto tras proyecto.",
      },
      {
        titulo: "Equipo ahogado en trabajo interno",
        detalle:
          "Reportes manuales y burocracia se comen las horas que deberían ir a las cuentas. El torbellino gana y la meta del semestre no se mueve.",
      },
    ],
  },
  senales: [
    "Cada riesgo llega al CSL con una movida propuesta, no solo con el problema.",
    "Las fechas que se movieron tienen su porqué registrado antes de que el cliente pregunte.",
    "El mismo desajuste entre lo vendido y lo entregado no se repite de un proyecto al siguiente.",
    "Las alertas de la cuenta se cierran con una acción, no quedan abiertas semanas.",
  ],
};

const RELACIONAL: Competencia = {
  clave: "relacional",
  enUnaFrase:
    "lograr que el cliente y el equipo confíen: conversación cara a cara, la verdad dicha temprano y siempre un próximo paso claro.",
  porQue: [
    parrafo(
      "Todo lo demás pasa por acá. Un cliente que confía cuenta el problema real, avisa cuando algo cambia y acepta una conversación difícil. Uno que no confía negocia cada punto y descubre los problemas por su cuenta.",
    ),
    parrafoRico(
      "La relación no se delega al chat ni se construye solo en la reunión de cierre. Las prácticas concretas para construirla están en ",
      a("confianza"),
      ".",
    ),
  ],
  cse: {
    exito: [
      {
        titulo: "Dueño de la cuenta",
        detalle:
          "El cliente sabe que es su contraparte, y adentro nadie tiene que preguntar en qué va su proyecto: está escrito y al día.",
      },
      {
        titulo: "Conversación difícil a tiempo",
        detalle:
          "Cuando algo no va, lo dice temprano y de frente. Los problemas llegan al CSL cuando todavía se pueden resolver.",
      },
      {
        titulo: "Cuentas que crecen",
        detalle: "Detecta lo que la cuenta va a necesitar después y lo lleva a la mesa.",
      },
      {
        titulo: "Escucha más de lo que habla",
        detalle:
          "En las sesiones de descubrimiento el cliente habla la mayor parte del tiempo, y el CSE sale sabiendo algo que no sabía.",
        nuevo: true,
      },
    ],
    fracaso: [
      {
        titulo: "Relación delegada al chat",
        detalle:
          "Todo se resuelve por escrito y no hay conversación. El cliente no conoce al CSE y el CSE no sabe cómo va realmente su negocio.",
      },
      {
        titulo: "Cartera sin próximo paso",
        detalle: "Ninguna cuenta tiene claro qué sigue. La expansión aparece solo cuando el cliente la pide.",
      },
      {
        titulo: "Decir que sí a todo",
        detalle:
          "Por evitar una conversación incómoda se acepta cada pedido; el cliente aprende que el alcance se negocia solo.",
        nuevo: true,
      },
    ],
  },
  csl: {
    exito: [
      {
        titulo: "Sincronización cara a cara",
        detalle:
          "Se alinea con el equipo y con los clientes en sesiones, no solo por escrito. No quedan temas importantes resueltos únicamente con seguimiento escrito.",
      },
      {
        titulo: "Acceso a involucrados",
        detalle:
          "En las cuentas más importantes los interesados lo conocen. Conoce al Customer Success de HubSpot de esas cuentas y se reúne con él cuando hace falta.",
      },
      {
        titulo: "Expansión",
        detalle: "Desarrolla un camino de crecimiento por cuenta, junto al CSE y, si amerita, con Ventas.",
      },
      {
        titulo: "Escucha de primera mano",
        detalle:
          "Entra a una sesión de cuenta junto al CSE sin conducirla, para escuchar el estado real del negocio y no solo el avance técnico.",
        nuevo: true,
      },
    ],
    fracaso: [
      {
        titulo: "Liderazgo solo por escrito",
        detalle:
          "Chats, tickets y reportes reemplazan a la conversación. Los problemas del equipo y de los clientes se conocen tarde, cuando ya escalaron.",
      },
      {
        titulo: "Desconexión de las cuentas clave",
        detalle:
          "Los interesados de los clientes de alto valor no conocen al CSL y no hay relación con su Customer Success de HubSpot. Cuando hay una fricción, nos enteramos por el reclamo.",
      },
      {
        titulo: "Cartera sin camino de crecimiento",
        detalle:
          "Ninguna cuenta tiene claro cuál es su siguiente paso. La expansión aparece solo cuando el cliente la pide, nunca porque la vimos venir.",
      },
    ],
  },
  senales: [
    "El cliente le cuenta los problemas al CSE antes de que escalen.",
    "Cada cuenta tiene su próxima reunión agendada.",
    "Las cuentas importantes conocen al CSL, y el CSL conoce a su contraparte en HubSpot.",
    "Las malas noticias llegan temprano y de frente, no descubiertas.",
  ],
};

/* ── La portada de la sección ───────────────────────────────────────────────── */

export function construirCompetencias(): PaginaSembrada {
  return {
    ...pagina("competencias"),
    bloques: [
      aviso(
        "info",
        ["En una frase: ", { negrita: true }],
        "tres capacidades separan a quien hace bien este trabajo de quien solo lo cumple — saber del producto y del negocio del cliente, resolver problemas con criterio propio, y sostener la relación.",
      ),

      titulo(2, "Qué es una competencia acá"),
      parrafo(
        "No es un curso aprobado ni un título: es algo que se ve en las cuentas. Por eso cada competencia se documenta como caminos —lo que pasa en la cuenta cuando está y lo que pasa cuando falta—, separados para el CSE y el CSL, porque la misma capacidad se ve distinta en quien ejecuta la cuenta y en quien responde por la cartera.",
      ),
      tarjetas(
        "3",
        tarjeta(
          "Dominio de producto e industria",
          "Saber qué puede hacer la herramienta y qué necesita el negocio del cliente, sin confundir una cosa con la otra.",
          parrafoRico(a("dominio")),
        ),
        tarjeta(
          "Resolución de problemas",
          "Encontrar la causa, decidir con criterio y hacerlo a tiempo, sin esperar a que alguien lo resuelva por uno.",
          parrafoRico(a("resolucion")),
        ),
        tarjeta(
          "Habilidad relacional",
          "Que el cliente y el equipo confíen: conversación cara a cara, la verdad dicha temprano y un próximo paso claro.",
          parrafoRico(a("relacional")),
        ),
      ),

      titulo(2, "Cómo leer cada competencia"),
      vinneta(
        "La mayoría de los caminos sale tal cual de los perfiles de puesto. Los que dicen «agregado» completan lo que al perfil le faltaba para esa competencia.",
      ),
      vinneta(
        "Un camino de fracaso no es un error puntual: es una forma de trabajar que se ve venir. Están escritos para reconocerlos temprano, no para repartir culpas.",
      ),
      vinneta(
        "La ruta de madurez, de L1 a L5, mide sobre todo el dominio: qué complejidad de cuenta se sostiene solo. Las otras dos se forman en el 1:1 mensual con el CSL.",
      ),

      divisor(),
      parrafoRico("Los roles completos: ", a("rolCse"), " · ", a("rolCsl"), "."),
    ],
    hijas: [paginaDeCompetencia(DOMINIO), paginaDeCompetencia(RESOLUCION), paginaDeCompetencia(RELACIONAL)],
  };
}
