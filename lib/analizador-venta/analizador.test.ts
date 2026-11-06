/**
 * lib/analizador-venta/analizador.test.ts — el analizador de reuniones de venta (S1 a S3): el criterio escrito, quién habló
 * (calculado), qué reunión es de venta, y que ningún juicio sobreviva sin una cita que esté en la transcripción.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ETAPAS, PROCESO_CONSULTIVO, PUNTOS_DEL_ANALISIS, SIN_POSICIONAMIENTO, criterioComoTexto } from "./criterio";
import { palabrasDe, quienHablo, reconocerAlEquipo } from "./quien-hablo";
import { analizadorAutomaticoPrendido, delEquipoEnLaReunion, motivoAnalizadorApagado, porQueNoEsDeVenta, vendedoresDeLaReunion, veElAnalizador, veLaTendenciaDelEquipo } from "./reglas";
import { HERRAMIENTA_DEL_ANALISIS, exploracionEnFoco, extraerDelTurno, leerElAnalisis, leerResultadoGuardado, paraComparar, separarArea, verificarCita, type TurnoNumerado } from "./analisis";
import { AGENTES_CON_CAMINO_PROPIO, esAgenteRetirado } from "@/lib/agents/retirados";
import { AGENTE_DEL_ANALIZADOR } from "./prompt";
import { RevisionSchema } from "./schema";

const PROPIOS = new Set(["smarteamcr.com"]);
const EQUIPO = [
  { email: "andres@smarteamcr.com", nombre: "Andrés Pinzón" },
  { email: "liz@smarteamcr.com", nombre: "Liz Navarro" },
  { email: "marco@smarteamcr.com", nombre: "Marco Rojas" },
];

describe("S1 · el criterio escrito", () => {
  it("las cinco etapas, en orden, cada una con lo que se espera y sus señales", () => {
    expect(PROCESO_CONSULTIVO.map((e) => e.id)).toEqual([...ETAPAS]);
    for (const e of PROCESO_CONSULTIVO) {
      expect(e.seEspera.length).toBeGreaterThan(20);
      expect(e.seHizo.length).toBeGreaterThan(0);
      expect(e.seSalto.length).toBeGreaterThan(0);
    }
    // Los diez del plan, más el dolor, la base para un caso de uso y lo que salió bien (29 oct), y el resultado que busca (6 nov).
    expect(PUNTOS_DEL_ANALISIS).toHaveLength(14);
  });
  it("con o sin position statement (K3)", () => {
    expect(criterioComoTexto({ positionStatement: null })).toContain(SIN_POSICIONAMIENTO);
    expect(criterioComoTexto({ positionStatement: "Para empresas que venden B2B…" })).toContain("Para empresas que venden B2B…");
  });
});

describe("S2 · quién habló (calculado, sin IA)", () => {
  it("con las frases de Meet: el correo dice quién es del equipo; los de fuera son del cliente", () => {
    const q = quienHablo({
      frases: [
        { hablante: "Andrés Pinzón", correo: "andres@smarteamcr.com", texto: "Cuéntenme cómo venden hoy" },
        { hablante: "Pablo Bogantes", correo: null, texto: "Vendemos por distribuidores en tres países y el seguimiento es en Excel" },
        { hablante: "Desconocido", correo: null, texto: "ruido de fondo" },
      ],
      propios: PROPIOS,
      equipo: EQUIPO,
    });
    expect(q.fuente).toBe("meet");
    expect(q.smarteam.palabras).toBe(4);
    expect(q.cliente.palabras).toBe(12);
    expect(q.cliente.porcentaje).toBe(75);
    expect(q.personas[0]).toMatchObject({ nombre: "Pablo Bogantes", lado: "cliente" });
  });
  it("sin frases, la transcripción «Nombre: …»; al equipo se lo reconoce por el nombre", () => {
    const q = quienHablo({
      transcripcion: "Reunión - Transcripción\n00:00:01\nLiz Navarro: Bienvenidos a todos\nAna Mora: Gracias\nLiz Navarro: Empecemos por los retos",
      propios: PROPIOS,
      equipo: EQUIPO,
    });
    expect(q.fuente).toBe("transcripcion");
    expect(q.personas.find((p) => p.nombre === "Liz Navarro")).toMatchObject({ lado: "smarteam", correo: "liz@smarteamcr.com", palabras: 7 });
    expect(q.personas.find((p) => p.nombre === "Ana Mora")?.lado).toBe("cliente");
  });
  it("un nombre de pila solo cuenta si en el equipo lo tiene una persona", () => {
    const de = reconocerAlEquipo([...EQUIPO, { email: "marco.b@smarteamcr.com", nombre: "Marco Brenes" }]);
    expect(de("Andrés")).toBe("andres@smarteamcr.com");
    expect(de("Marco")).toBeNull();
    expect(de("Marco Rojas")).toBe("marco@smarteamcr.com");
    expect(de("Andres Pinzon (Smarteam)")).toBe("andres@smarteamcr.com");
  });
  it("sin texto, no se sabe", () => {
    expect(quienHablo({ propios: PROPIOS, equipo: EQUIPO }).fuente).toBe("nada");
    expect(palabrasDe("— sí, 3 veces …")).toBe(3);
  });
});

describe("qué reunión es de venta", () => {
  it("un prospecto sí; un cliente solo con preventa abierta y alguien de Ventas (la expansión); ni puertas adentro ni aliados", () => {
    const base = { puertasAdentro: false, conVentas: true, conPreventa: false };
    expect(porQueNoEsDeVenta({ ...base, kind: "PROSPECTO", conVentas: false })).toBeNull();
    // Un cliente: solo con una preventa abierta (la expansión) Y alguien de Ventas.
    expect(porQueNoEsDeVenta({ ...base, kind: "CLIENTE", conPreventa: true })).toBeNull();
    expect(porQueNoEsDeVenta({ ...base, kind: "CLIENTE" })).toBe("cliente_sin_preventa");
    expect(porQueNoEsDeVenta({ ...base, kind: "CLIENTE", conPreventa: true, conVentas: false })).toBe("cliente_sin_ventas");
    expect(porQueNoEsDeVenta({ ...base, kind: "PROSPECTO", puertasAdentro: true })).toBe("puertas_adentro");
    expect(porQueNoEsDeVenta({ ...base, kind: "ALIADO" })).toBe("aliado_o_smarteam");
    expect(porQueNoEsDeVenta({ ...base, kind: null })).toBe("sin_empresa");
  });
  it("vende quien es de Ventas; si no hubo, el equipo que estuvo (por la invitación)", () => {
    const delEquipo = delEquipoEnLaReunion({ organizador: "Liz@smarteamcr.com", participantes: ["andres@smarteamcr.com", "x@camosa.com"] }, PROPIOS);
    expect(delEquipo).toEqual(["liz@smarteamcr.com", "andres@smarteamcr.com"]);
    expect(vendedoresDeLaReunion(delEquipo, new Set(["andres@smarteamcr.com"]))).toEqual(["andres@smarteamcr.com"]);
    expect(vendedoresDeLaReunion(delEquipo, new Set())).toEqual(delEquipo);
  });
  it("el automático nace apagado; la preventa lo muestra a quien entra y la tendencia del equipo, solo a los super admin", () => {
    expect(analizadorAutomaticoPrendido({})).toBe(false);
    expect(motivoAnalizadorApagado({})).toMatch(/ANALIZADOR_VENTA=1/);
    expect(motivoAnalizadorApagado({ ANALIZADOR_VENTA: "1" })).toBeNull();
    expect(veElAnalizador("SUPER_ADMIN")).toBe(true);
    expect(veElAnalizador("VENTAS")).toBe(true);
    expect(veElAnalizador(null)).toBe(false);
    expect(veLaTendenciaDelEquipo("SUPER_ADMIN")).toBe(true);
    expect(veLaTendenciaDelEquipo("VENTAS")).toBe(false);
  });
});

describe("S3 · sin cita no hay juicio", () => {
  const TURNOS: TurnoNumerado[] = [
    { n: 1, hablante: "Andrés Pinzón", texto: "¿Qué pasa hoy cuando un distribuidor no reporta sus ventas a tiempo?" },
    { n: 2, hablante: "Pablo Bogantes", texto: "Perdemos visibilidad del inventario y la junta nos pide números que no tenemos." },
    { n: 3, hablante: "Andrés Pinzón", texto: "Las licencias de Sales Hub Professional cuestan 90 dólares por usuario." },
  ];
  it("una cita está en su turno (sin mirar tildes, mayúsculas ni signos), o en otro si el número estaba mal", () => {
    expect(verificarCita({ turno: 2, texto: "perdemos visibilidad del inventario" }, TURNOS)).toMatchObject({ turno: 2, hablante: "Pablo Bogantes" });
    expect(verificarCita({ turno: 1, texto: "Perdemos visibilidad del inventario" }, TURNOS)?.turno).toBe(2);
    expect(verificarCita({ turno: 1, texto: "nos interesa mucho el CRM" }, TURNOS)).toBeNull();
    expect(verificarCita({ turno: 2, texto: "sí" }, TURNOS)).toBeNull();
    expect(paraComparar("¿Qué  PASA hoy?")).toBe("que pasa hoy");
  });
  it("descarta el juicio sin una cita que exista; deja pasar el que dice que algo no pasó", () => {
    const { resultado, descartados } = leerElAnalisis(
      {
        resumen: "Exploraste el problema del inventario y después saltaste al precio.",
        juicios: [
          { punto: "consultiva", valor: "en_parte", lectura: "Exploró el problema y saltó al precio.", citas: [{ turno: 1, texto: "cuando un distribuidor no reporta sus ventas a tiempo" }] },
          { punto: "temas", valor: "mezcla", lectura: "Inventado.", citas: [{ turno: 2, texto: "queremos comprar ya mismo" }] },
          { punto: "siguiente_paso", valor: "ninguno", lectura: "No quedó siguiente paso.", citas: [] },
          { punto: "etapa", valor: "se_hizo", lectura: "Sin etapa.", citas: [{ turno: 1, texto: "cuando un distribuidor no reporta" }] },
          { punto: "posicion", valor: "inventado", lectura: "x", citas: [] },
        ],
        recomendaciones: [{ texto: "Pregunta cuánto les cuesta no tener visibilidad.", citas: [{ turno: 2, texto: "perdemos visibilidad del inventario" }] }],
      },
      TURNOS,
    );
    expect(resultado.juicios.map((j) => j.punto)).toEqual(["consultiva", "siguiente_paso"]);
    expect(resultado.juicios[1]).toMatchObject({ porAusencia: true, citas: [] });
    expect(descartados).toBe(3);
    expect(resultado.recomendaciones[0].citas[0].hablante).toBe("Pablo Bogantes");
  });
  it("la cita que se guarda es la de la transcripción, con sus tildes y signos (no la que escribió el modelo)", () => {
    const turno = "Mire, el año que viene, ¿no hay presupuesto? Eso me preocupa.";
    expect(extraerDelTurno(turno, "el ano que viene no hay presupuesto")).toBe("el año que viene, ¿no hay presupuesto?");
    expect(verificarCita({ turno: 1, texto: "EL ANO que viene no hay presupuesto" }, [{ n: 1, hablante: "Pablo", texto: turno }])?.texto).toBe("el año que viene, ¿no hay presupuesto?");
    expect(extraerDelTurno(turno, "otra cosa")).toBeNull();
  });
  it("un juicio por ausencia con una cita inventada se descarta; «sin guía» con guía, también", () => {
    const { resultado, descartados } = leerElAnalisis(
      {
        resumen: "x",
        juicios: [
          { punto: "etapa", etapa: "conectar", valor: "se_salto", lectura: "Monólogo del vendedor.", citas: [{ turno: 3, texto: "un monólogo que nadie dijo nunca" }] },
          { punto: "etapa", etapa: "identificar", valor: "se_salto", lectura: "No preguntó quién decide.", citas: [] },
          { punto: "guia", valor: "sin_guia", lectura: "No había guía.", citas: [] },
        ],
        recomendaciones: [],
      },
      TURNOS,
      { guia: true, escala: true, posicionamiento: false },
    );
    expect(resultado.juicios.map((j) => `${j.punto}/${j.etapa}`)).toEqual(["etapa/identificar"]);
    expect(descartados).toBe(2);
  });
  it("la herramienta pide cada punto juzgado y sus citas", () => {
    expect(HERRAMIENTA_DEL_ANALISIS.input_schema.required).toEqual(["resumen", "enfoque", "juicios", "bien", "recomendaciones"]);
  });
});

describe("29 oct · citas del habla real, lo bien con su cita, aterrizar y expandir, y el foco", () => {
  // Inventados, con la forma de hablar que deja la transcripción de Meet: muletillas, una palabra repetida, una frase
  // partida en dos turnos con un «Claro.» de otro en medio. (Nada de una reunión real: las transcripciones no salen de la base.)
  const REUNION: TurnoNumerado[] = [
    { n: 143, hablante: "Diego Solís", texto: "¿Y cuánto les pesa eso hoy, digamos? Bueno, yo sé que vienes llegando al puesto, pero si si dices que antes todo pasaba por la jefatura anterior, este, ¿cuánto se atrasa una venta?" },
    { n: 147, hablante: "Laura Méndez", texto: "que le decimos al cliente, «Espéreme, déjeme revisar con arriba» y se nos van dos," },
    { n: 148, hablante: "Diego Solís", texto: "Claro." },
    { n: 149, hablante: "Laura Méndez", texto: "tres semanas y el cliente compró en otro lado, pues, eh" },
    { n: 233, hablante: "Diego Solís", texto: "Pero, ¿cómo mides al equipo de mercadeo? O sea, como dirección mida mercadeo hoy día, Laura." },
  ];
  it("la cita «limpia» del modelo (sin muletillas ni palabras repetidas) se encuentra, y se muestra lo que se dijo de verdad", () => {
    const c = verificarCita({ turno: 143, texto: "si dices que antes todo pasaba por la jefatura anterior, ¿cuánto se atrasa una venta?" }, REUNION);
    expect(c).toMatchObject({ turno: 143, hablante: "Diego Solís" });
    expect(c!.texto).toContain("si si dices que antes");
    expect(c!.texto).toContain("anterior, este, ¿cuánto se atrasa una venta?");
    // Una letra distinta en una palabra larga («mide» por «mida»).
    expect(verificarCita({ turno: 233, texto: "como dirección mide mercadeo hoy día" }, REUNION)?.turno).toBe(233);
  });
  it("una frase partida en dos turnos de la misma persona, con un «Claro.» de otro en medio, también", () => {
    expect(verificarCita({ turno: 149, texto: "se nos van dos, tres semanas y el cliente compró en otro lado" }, REUNION)).toMatchObject({ turno: 147, hablante: "Laura Méndez" });
  });
  it("una pregunta corta de otro en medio no es interjección: la respuesta no se pega a lo de antes", () => {
    const T: TurnoNumerado[] = [
      { n: 1, hablante: "Laura Méndez", texto: "Hoy tenemos el CRM instalado en toda la empresa." },
      { n: 2, hablante: "Diego Solís", texto: "¿Y lo usan todos?" },
      { n: 3, hablante: "Laura Méndez", texto: "No, solo dos personas lo usan." },
    ];
    expect(verificarCita({ turno: 1, texto: "tenemos el CRM instalado en toda la empresa solo dos personas lo usan" }, T)).toBeNull();
  });
  it("lo que no se dijo sigue sin pasar: otras palabras, o las mismas desordenadas", () => {
    expect(verificarCita({ turno: 149, texto: "perdimos muchísimas ventas por no tener un CRM" }, REUNION)).toBeNull();
    expect(verificarCita({ turno: 149, texto: "el cliente compró en otro lado tres semanas" }, REUNION)).toBeNull();
  });
  it("⛔ una cita que cambia el sentido no pasa: otra cifra, un «no» de menos, un «no» de más o justo antes, un «poco» de más", () => {
    const T: TurnoNumerado[] = [
      { n: 1, hablante: "Laura Méndez", texto: "Eh, hoy por hoy perdemos unos 2.000 dólares al mes en cotizaciones que nadie sigue, ¿verdad?" },
      { n: 2, hablante: "Laura Méndez", texto: "Y el presupuesto de este año no está aprobado todavía por la gerencia general." },
      { n: 3, hablante: "Laura Méndez", texto: "Mire, el presupuesto de este año está aprobado desde enero por la junta directiva." },
      { n: 4, hablante: "Laura Méndez", texto: "No, no está aprobado el presupuesto todavía para el proyecto." },
      { n: 5, hablante: "Laura Méndez", texto: "Hoy el equipo usa el CRM para todo lo del pipeline comercial." },
    ];
    // «2.000» y «2000» son el mismo número; «3000», no.
    expect(verificarCita({ turno: 1, texto: "perdemos unos 2000 dólares al mes en cotizaciones" }, T)?.turno).toBe(1);
    expect(verificarCita({ turno: 1, texto: "perdemos unos 3000 dólares al mes en cotizaciones" }, T)).toBeNull();
    // Sin el «no»: lo dicho tiene una negación dentro del tramo que la cita se saltó.
    expect(verificarCita({ turno: 2, texto: "el presupuesto de este año está aprobado todavía por la gerencia" }, T)).toBeNull();
    // Con un «no» de más: la negación de la cita tiene que estar.
    expect(verificarCita({ turno: 3, texto: "el presupuesto de este año no está aprobado desde enero por la junta" }, T)).toBeNull();
    // Con el «no» justo antes del pedazo citado.
    expect(verificarCita({ turno: 4, texto: "está aprobado el presupuesto todavía para el proyecto" }, T)).toBeNull();
    expect(verificarCita({ turno: 4, texto: "no está aprobado el presupuesto todavía para el proyecto" }, T)?.turno).toBe(4);
    // Un «poco» que el cliente no dijo.
    expect(verificarCita({ turno: 5, texto: "el equipo usa poco el CRM para todo lo del pipeline comercial" }, T)).toBeNull();
    // Y lo mostrado empieza donde empieza la cita, no unas palabras antes.
    expect(verificarCita({ turno: 2, texto: "el presupuesto de este año no está aprobado todavía" }, T)?.texto).toBe("el presupuesto de este año no está aprobado todavía");
  });
  it("lo que no cambia el sentido no tumba una cita cierta: «¿no?» de muletilla, «sin embargo», un número en letras", () => {
    const T: TurnoNumerado[] = [
      { n: 1, hablante: "Laura Méndez", texto: "Lo que necesitamos, ¿no?, es tener el dato en HubSpot para la gerencia." },
      { n: 2, hablante: "Laura Méndez", texto: "Sin embargo, tenemos dos vendedores que cotizan desde el celular cada semana." },
    ];
    expect(verificarCita({ turno: 1, texto: "Lo que necesitamos es tener el dato en HubSpot para la gerencia" }, T)?.turno).toBe(1);
    expect(verificarCita({ turno: 2, texto: "tenemos 2 vendedores que cotizan desde el celular cada semana" }, T)?.turno).toBe(2);
  });
  it("palabras comunes sueltas, juntadas de aquí y de allá, no hacen una cita", () => {
    const T: TurnoNumerado[] = [{ n: 1, hablante: "Laura Méndez", texto: "que el equipo de la empresa que tiene en la zona de ventas lo que se hace para el cliente de la casa que" }];
    expect(verificarCita({ turno: 1, texto: "el equipo que se hace la empresa de ventas para la casa" }, T)).toBeNull();
  });
  it("lo que salió bien y lo que hay que mejorar van con cita o no van", () => {
    const { resultado, descartados } = leerElAnalisis(
      {
        resumen: "x",
        enfoque: { areas: [], lectura: "" },
        juicios: [],
        bien: [
          { texto: "Preguntaste por el impacto.", citas: [{ turno: 143, texto: "cuánto les pesa eso hoy, digamos" }] },
          { texto: "Buena energía.", citas: [] },
        ],
        recomendaciones: [{ texto: "Haz más preguntas.", citas: [] }],
      },
      REUNION,
    );
    expect(resultado.bien.map((b) => b.texto)).toEqual(["Preguntaste por el impacto."]);
    expect(resultado.recomendaciones).toEqual([]);
    expect(descartados).toBe(2);
  });
  it("aterrizar y expandir: el dolor y el caso de uso; el caso solo si es uno de los ya elegidos en la preventa", () => {
    const habia = { guia: true, escala: true, posicionamiento: true, casos: ["Sistematiza tu proceso comercial con HubSpot"] };
    const { resultado } = leerElAnalisis(
      {
        resumen: "x",
        juicios: [
          { punto: "dolor", valor: "en_parte", lectura: "El resultado está, la causa no.", citas: [{ turno: 149, texto: "tres semanas y el cliente compró en otro lado" }] },
          { punto: "caso_de_uso", valor: "falta", caso: "sistematiza tu proceso comercial con hubspot", lectura: "Falta el número.", citas: [{ turno: 149, texto: "tres semanas y el cliente compró" }] },
        ],
        recomendaciones: [],
      },
      REUNION,
      habia,
    );
    expect(resultado.juicios.find((j) => j.punto === "caso_de_uso")?.caso).toBe("Sistematiza tu proceso comercial con HubSpot");
    const inventado = leerElAnalisis(
      { resumen: "x", juicios: [{ punto: "caso_de_uso", valor: "hay_base", caso: "Un caso que nadie eligió", lectura: "x", citas: [{ turno: 149, texto: "tres semanas y el cliente compró" }] }], recomendaciones: [] },
      REUNION,
      habia,
    );
    expect(inventado.resultado.juicios[0].caso).toBeNull();
  });
  it("la exploración solo sobre lo esperado; sin área fija, el foco es donde fueron las preguntas y del resto queda el nombre", () => {
    const esperadas = [
      { nombre: "Datos", area: "Ventas" },
      { nombre: "Equipo y Gobierno", area: "Ventas" },
      { nombre: "Datos", area: "Marketing" },
      { nombre: "Datos", area: "Servicio" },
    ];
    const crudo = {
      resumen: "x",
      enfoque: { areas: ["ventas"], lectura: "Con Laura, gerente comercial: las preguntas fueron a Ventas." },
      juicios: [
        { punto: "exploracion", dimension: "Datos (Ventas)", valor: "tocado", lectura: "Se tocó.", citas: [{ turno: 149, texto: "tres semanas y el cliente compró" }] },
        { punto: "exploracion", dimension: "Equipo y Gobierno (Ventas)", valor: "sin_explorar", lectura: "No.", citas: [] },
        { punto: "exploracion", dimension: "Datos (Marketing)", valor: "sin_explorar", lectura: "No.", citas: [] },
        // Fuera de lo esperado: no vale.
        { punto: "exploracion", dimension: "Cobranza (Finanzas)", valor: "sin_explorar", lectura: "No.", citas: [] },
      ],
      recomendaciones: [],
    };
    const { resultado, descartados } = leerElAnalisis(crudo, REUNION, { guia: true, escala: true, posicionamiento: true, dimensiones: true, esperadas });
    expect(resultado.enfoque).toEqual({ areas: ["Ventas"], sinTocar: ["Marketing", "Servicio"], lectura: "Con Laura, gerente comercial: las preguntas fueron a Ventas." });
    // Se guarda todo lo juzgado (si el foco estuviera mal, el dato sigue); lo de fuera del foco se deja de mostrar.
    expect(resultado.juicios.map((j) => `${j.dimension}/${j.area}/${j.valor}`)).toEqual(["Datos/Ventas/tocado", "Equipo y Gobierno/Ventas/sin_explorar", "Datos/Marketing/sin_explorar"]);
    expect(exploracionEnFoco(resultado).map((j) => `${j.dimension}/${j.area}`)).toEqual(["Datos/Ventas", "Equipo y Gobierno/Ventas"]);
    expect(descartados).toBe(1);
    // Si el modelo no nombra un área válida y nada se tocó con cita, el foco son todas: no se esconde nada.
    const sinFoco = leerElAnalisis(
      { resumen: "x", enfoque: { areas: ["Logística"], lectura: "" }, juicios: crudo.juicios.slice(1, 3), recomendaciones: [] },
      REUNION,
      { guia: true, escala: true, posicionamiento: true, dimensiones: true, esperadas },
    );
    expect(sinFoco.resultado.enfoque?.areas).toEqual(["Ventas", "Marketing", "Servicio"]);
    expect(exploracionEnFoco(sinFoco.resultado)).toHaveLength(2);
    // Un área tocada con cita entra al foco aunque el modelo no la nombre.
    const tocada = leerElAnalisis(
      {
        resumen: "x",
        enfoque: { areas: ["Ventas"], lectura: "" },
        juicios: [{ punto: "exploracion", dimension: "Datos (Marketing)", valor: "tocado", lectura: "Se tocó.", citas: [{ turno: 149, texto: "tres semanas y el cliente compró" }] }],
        recomendaciones: [],
      },
      REUNION,
      { guia: true, escala: true, posicionamiento: true, dimensiones: true, esperadas },
    );
    expect(tocada.resultado.enfoque?.areas).toEqual(["Ventas", "Marketing"]);
    // Con el área fija (el equipo de la sesión), el foco es todo lo esperado, diga lo que diga el modelo.
    const fija = leerElAnalisis(crudo, REUNION, { guia: true, escala: true, posicionamiento: true, dimensiones: true, esperadas, areaFija: true });
    expect(fija.resultado.enfoque?.sinTocar).toEqual([]);
    expect(separarArea("Líneas de máquinas y cotización (Ventas)")).toEqual({ nombre: "Líneas de máquinas y cotización", area: "Ventas" });
  });
  it("un análisis guardado de antes (sin lo bien ni el foco) se sigue leyendo", () => {
    expect(leerResultadoGuardado({ resumen: "x", juicios: [], recomendaciones: [] })).toEqual({ resumen: "x", juicios: [], bien: [], recomendaciones: [], enfoque: null });
  });
});

describe("⛔ el analizador corre por su camino, con una sola empresa", () => {
  const RAIZ = path.join(__dirname, "..", "..");
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  it("/analyze no lo despacha (aunque su fila esté ACTIVE)", () => {
    expect(AGENTES_CON_CAMINO_PROPIO).toContain(AGENTE_DEL_ANALIZADOR);
    expect(esAgenteRetirado(AGENTE_DEL_ANALIZADOR)).toBe(true);
  });
  it("⛔ solo lo ven quienes ven el analizador: la guarda de las rutas, la preventa y la página del análisis preguntan", () => {
    expect(leer("lib/analizador-venta/guardia-server.ts")).toMatch(/veElAnalizador\(g\.role\)/);
    for (const f of ["app/api/sales/exploraciones/[id]/analisis-de-venta/route.ts", "app/api/sales/exploraciones/[id]/analisis-de-venta/revision/route.ts"]) {
      const src = leer(f);
      // Cada método empieza por la guarda, y la reunión tiene que ser de la empresa de la preventa (el chokepoint).
      expect(src.match(/export async function (GET|POST)/g)?.length, f).toBe(src.match(/await guardDelAnalisisDeVenta\(id, "(read|write)"\)/g)?.length);
      if (src.includes("sessionId")) expect(src, f).toMatch(/esReunionDeLaEmpresa\(g\.clientId/);
    }
    expect(leer("app/(shell)/sales/exploraciones/[id]/page.tsx")).toMatch(/veElAnalizador\(ctx\.role\)/);
    expect(leer("app/(shell)/sales/analisis/page.tsx")).toMatch(/veLaTendenciaDelEquipo\(ctx\.role\)/);
  });
  it("⛔ S6: en Sesiones no queda nada de analizar el manejo de un cliente ni de una sesión", () => {
    for (const f of ["app/(shell)/sessions/[id]/page.tsx", "app/(shell)/sessions/salud/page.tsx", "app/(shell)/sessions/page.tsx"]) {
      expect(leer(f), f).not.toMatch(/analizador-venta|AnalisisDeVenta|sessions\/venta/);
    }
    for (const f of ["app/(shell)/sessions/venta/page.tsx", "app/api/sessions/[id]/analisis-de-venta/route.ts", "app/api/sessions/[id]/referencia-de-venta/route.ts"]) {
      expect(fs.existsSync(path.join(RAIZ, f)), f).toBe(false);
    }
  });

  it("la reunión que se analiza sale del chokepoint", () => {
    const src = leer("lib/analizador-venta/analizar-server.ts");
    expect(src).toContain("getClientSessions(r.dueno.id, { ids: [sessionId] })");
  });

  it("⛔ la referencia se quitó (Elías, 2026-10-27): ni escritores, ni lectores, ni la acción", () => {
    expect(fs.existsSync(path.join(RAIZ, "lib/analizador-venta/referencia-server.ts"))).toBe(false);
    // Nadie en el código nombra la tabla (sigue en la base y en el cliente de Prisma hasta el 2027-01-31).
    const archivos = (dir: string): string[] =>
      fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true }).flatMap((e) => {
        const rel = `${dir}/${e.name}`;
        if (e.isDirectory()) return e.name === "node_modules" || rel === "scripts/archive" ? [] : archivos(rel);
        return /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name) ? [rel] : [];
      });
    const conLaTabla = ["app", "lib", "components", "scripts"].flatMap(archivos).filter((f) => /reunionDeReferenciaDeVenta|reunionesDeReferencia|referencia-server/.test(leer(f)));
    expect(conLaTabla).toEqual([]);
    expect(leer("components/analizador-venta/ComoTrabajasteEstaSesion.tsx")).not.toMatch(/referencia/i);
    expect(RevisionSchema.safeParse({ accion: "referencia", sessionId: "s-1" }).success).toBe(false);
    expect(RevisionSchema.safeParse({ accion: "quitar-referencia", sessionId: "s-1" }).success).toBe(false);
  });
});
