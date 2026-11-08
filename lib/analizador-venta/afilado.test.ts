/**
 * lib/analizador-venta/afilado.test.ts — el análisis de la venta, más certero (2026-11-08, Elías con Centauro): lo de fuera
 * del objetivo con cita del cliente, la tabla de números con la cifra corregida, tres estados por dimensión, qué falta
 * para decidir sin repetir lo que ya se sabía, los próximos pasos con la última versión acordada, el demo, la
 * conversación que no pierde el cierre y los insumos para la guía de la siguiente sesión.
 */
import { describe, expect, it } from "vitest";
import { HERRAMIENTA_DEL_ANALISIS, leerElAnalisis, leerResultadoGuardado, numerosDe, partesDelPaso, verificarCita, type LoQueHabia, type TurnoNumerado } from "./analisis";
import { conversacionDelAnalisis } from "./conversacion";
import { diceQueNoSeSabe, insumosComoLineas, insumosParaLaGuia, tarjetaEnUnaLinea, yaSeSabeDeLasTarjetas } from "./para-la-guia";
import { loDeLaSesion } from "./revision";
import { REGLAS_DEL_ANALISIS } from "./prompt";

const T = (n: number, hablante: string, texto: string): TurnoNumerado => ({ n, hablante, texto });

/** Una reunión como la de Centauro, en chiquito. */
const TURNOS: TurnoNumerado[] = [
  T(1, "Marco Salas", "Hoy queremos entender el ecosistema técnico del equipo de ventas y sus herramientas."),
  T(2, "Emiley Calvo", "En cierta parte estamos como ciegos a información porque las llamadas no quedan registradas en ningún lado."),
  T(3, "Fernando Segura", "En este momento cerramos unos 30 al mes, más o menos, eso creo yo."),
  T(4, "Emiley Calvo", "No, Fer, en realidad cerramos unos 25 al mes, la mitad de la meta que es 50."),
  T(5, "Fernando Segura", "Una de las herramientas corta el 25 si no pagaste y te desconfigura absolutamente todo el hotel."),
  T(6, "Luis Rodríguez", "Puede pasar que te reserven y que después lleguen dos huéspedes a reclamar la misma habitación."),
  T(7, "Fernando Segura", "¿HubSpot se puede sincronizar con los teléfonos para que queden las llamadas registradas?"),
  T(8, "Marco Salas", "Faltaría la sesión con marketing, ¿la dejamos para el martes con Fernando?"),
  T(9, "Fernando Segura", "Martes no puedo, mejor el miércoles, digámoslo así."),
  T(10, "Marco Salas", "Miércoles entonces, ¿qué les parece a las 2 de la tarde con Catalina?"),
  T(11, "Fernando Segura", "Sí, tentativo, el miércoles a las 2 está bien."),
  T(12, "Marco Salas", "Y Luis, nos vemos el lunes a las 9 de la mañana para customer success, ¿te suena?"),
  T(13, "Luis Rodríguez", "Sí, el lunes a las 9 me sirve perfecto."),
];

const HABIA: LoQueHabia = {
  guia: true,
  escala: true,
  posicionamiento: true,
  dimensiones: true,
  esperadas: [
    { nombre: "Datos", area: "Ventas" },
    { nombre: "Procesos y Rutinas", area: "Ventas" },
  ],
  areaFija: true,
  delCliente: ["Emiley Calvo", "Fernando Segura", "Luis Rodríguez"],
};

const leer = (crudo: Record<string, unknown>, habia: LoQueHabia = HABIA) => leerElAnalisis({ resumen: "Bien.", juicios: [], bien: [], recomendaciones: [], ...crudo }, TURNOS, habia);

describe("1 · lo que aparece fuera del objetivo no se descarta", () => {
  it("con la cita del cliente, se guarda; la herramienta lo pide", () => {
    expect(HERRAMIENTA_DEL_ANALISIS.input_schema.required).toContain("fuera_del_objetivo");
    const { resultado } = leer({
      fuera_del_objetivo: [{ texto: "Los cortes por falta de pago desconfiguran hoteles y causan reservas dobles.", citas: [{ turno: 5, texto: "corta el 25 si no pagaste y te desconfigura absolutamente todo" }] }],
    });
    expect(resultado.fueraDelObjetivo).toHaveLength(1);
    expect(resultado.fueraDelObjetivo![0].citas[0]).toMatchObject({ turno: 5, hablante: "Fernando Segura" });
  });
  it("una cita inventada, o solo del vendedor, no alcanza: se cae y se cuenta", () => {
    const { resultado, descartados } = leer({
      fuera_del_objetivo: [
        { texto: "Inventado", citas: [{ turno: 5, texto: "los clientes se van a la competencia todos los meses sin parar" }] },
        { texto: "Lo dijo el vendedor", citas: [{ turno: 1, texto: "entender el ecosistema técnico del equipo de ventas" }] },
      ],
    });
    expect(resultado.fueraDelObjetivo).toEqual([]);
    expect(descartados).toBe(2);
  });
  it("el objetivo nunca descarta: la regla viaja en el material", () => {
    expect(REGLAS_DEL_ANALISIS).toMatch(/FUERA DEL OBJETIVO NO SE DESCARTA/);
  });
});

describe("2 · la tabla de números, con la cifra corregida", () => {
  it("la cifra tiene que estar en la cita más nueva de su celda: vale la corregida (25), no la de antes (30)", () => {
    const { resultado } = leer({
      numeros: [
        { tema: "volumen", que: "Cierres por mes", meta: { texto: "50 al mes", citas: [{ turno: 4, texto: "la mitad de la meta que es 50" }] }, realidad: { texto: "25 al mes", citas: [{ turno: 3, texto: "cerramos unos 30 al mes, más o menos" }, { turno: 4, texto: "en realidad cerramos unos 25 al mes" }] }, falta: "cuántos de esos cierres vienen de leads inbound" },
      ],
    });
    const f = resultado.numeros![0];
    expect(f.realidad).toMatchObject({ texto: "25 al mes", cita: { turno: 4 } });
    expect(f.meta?.texto).toBe("50 al mes");
    expect(f.falta).toBe("¿cuántos de esos cierres vienen de leads inbound?");
  });
  it("la cifra vieja con la corrección citada no pasa: la celda se cae y la fila queda con lo que se sostiene", () => {
    const { resultado, descartados } = leer({
      numeros: [{ tema: "volumen", que: "Cierres por mes", realidad: { texto: "30 al mes", citas: [{ turno: 3, texto: "cerramos unos 30 al mes, más o menos" }, { turno: 4, texto: "en realidad cerramos unos 25 al mes" }] }, falta: "¿Cuál es la meta?" }],
    });
    expect(resultado.numeros![0].realidad).toBeNull();
    expect(resultado.numeros![0].falta).toBe("¿Cuál es la meta?");
    expect(descartados).toBe(1);
  });
  it("solo los temas que justifican una propuesta; una fila sin nada que se sostenga no entra", () => {
    const { resultado } = leer({ numeros: [{ tema: "empleados", que: "Gente", falta: "¿Cuántos son?" }, { tema: "ticket", que: "Ticket" }] });
    expect(resultado.numeros).toEqual([]);
    expect(numerosDe("unos 2.000 y dos más")).toEqual(["2000", "2"]);
  });
});

describe("3 · tres estados por dimensión", () => {
  it("«sin explorar» con una cita que está pasa a «se mencionó» (Datos: «estamos ciegos a información»)", () => {
    const { resultado } = leer({
      juicios: [{ punto: "exploracion", dimension: "Datos (Ventas)", valor: "sin_explorar", lectura: "No se habló de datos.", citas: [{ turno: 2, texto: "estamos como ciegos a información porque las llamadas no quedan registradas" }] }],
    });
    expect(resultado.juicios[0]).toMatchObject({ valor: "tocado", porAusencia: false });
    expect(loDeLaSesion(resultado).tocadas.map((t) => t.dimension)).toEqual(["Datos"]);
  });
  it("sin cita sigue siendo «no se tocó»; explorado sigue explorado", () => {
    const { resultado } = leer({
      juicios: [
        { punto: "exploracion", dimension: "Datos (Ventas)", valor: "sin_explorar", lectura: "Nada.", citas: [] },
        { punto: "exploracion", dimension: "Procesos y Rutinas (Ventas)", valor: "explorado", lectura: "A fondo.", citas: [{ turno: 3, texto: "cerramos unos 30 al mes, más o menos" }] },
      ],
    });
    expect(resultado.juicios.map((j) => j.valor)).toEqual(["sin_explorar", "explorado"]);
  });
});

describe("4 · qué falta para decidir", () => {
  it("siempre los cuatro huecos; «se sabe» necesita su cita; lo que falta va como pregunta", () => {
    const { resultado } = leer({
      decision: [
        { hueco: "quien_decide", estado: "se_sabe", texto: "Fernando decide.", citas: [{ turno: 99, texto: "una cita que no está en ninguna parte de la reunión" }] },
        { hueco: "para_cuando", estado: "falta", texto: "para cuándo necesitan tener el cobro automatizado", citas: [] },
      ],
    });
    expect(resultado.decision!.map((d) => [d.hueco, d.seSabe])).toEqual([
      ["quien_decide", false],
      ["para_cuando", false],
      ["cuanto_invertir", false],
      ["si_no_hacen_nada", false],
    ]);
    expect(resultado.decision![1].texto).toBe("¿para cuándo necesitan tener el cobro automatizado?");
    expect(resultado.decision![2].texto).toMatch(/rango de inversión/);
  });
  it("lo que ya se sabía de antes (la preventa o una sesión anterior de la empresa) no sale como faltante", () => {
    const { resultado } = leer(
      { decision: [{ hueco: "quien_decide", estado: "falta", texto: "¿Quién decide?", citas: [] }] },
      { ...HABIA, yaSeSabe: { quien_decide: "Fernando Segura (decide)" } },
    );
    expect(resultado.decision![0]).toMatchObject({ seSabe: true, deAntes: true, texto: "Fernando Segura (decide)" });
    expect(insumosParaLaGuia(resultado).huecosDeDecision.map((h) => h.hueco)).toEqual(["para_cuando", "cuanto_invertir", "si_no_hacen_nada"]);
  });
  it("una tarjeta del resumen que dice que no se sabe no cuenta como sabida", () => {
    expect(diceQueNoSeSabe("No se discutió presupuesto en esta reunión.")).toBe(true);
    expect(diceQueNoSeSabe("Entre 15 y 20 mil dólares.")).toBe(false);
    expect(tarjetaEnUnaLinea("No se discutió presupuesto en esta reunión.")).toBeNull();
    expect(tarjetaEnUnaLinea([{ nombre: "Fernando Segura", rol: "decide" }, "Por definir"])).toBe("Fernando Segura (Decide)");
  });
});

describe("5 · los próximos pasos, con la última versión acordada", () => {
  it("de dos versiones del mismo paso queda la más nueva; la sesión con Luis no se pierde", () => {
    const { resultado } = leer({
      juicios: [{ punto: "siguiente_paso", valor: "con_fecha_y_duenio", lectura: "Marketing el martes con Fernando.", citas: [{ turno: 8, texto: "la dejamos para el martes con Fernando" }] }],
      pasos: [
        { tema: "Sesión con Marketing", que: "Sesión con Marketing", cuando: "martes", quien: "Fernando", citas: [{ turno: 8, texto: "la dejamos para el martes con Fernando" }] },
        { tema: "Sesión con Marketing", que: "Sesión con Marketing", cuando: "miércoles a las 2 de la tarde", quien: "Catalina", citas: [{ turno: 10, texto: "Miércoles entonces, ¿qué les parece a las 2 de la tarde con Catalina?" }] },
        { tema: "Sesión con Customer Success", que: "Sesión con Customer Success", cuando: "lunes a las 9", quien: "Luis", citas: [{ turno: 12, texto: "nos vemos el lunes a las 9 de la mañana para customer success" }] },
      ],
    });
    expect(resultado.pasos!.map((p) => [p.que, p.cuando, p.quien])).toEqual([
      ["Sesión con Marketing", "miércoles a las 2 de la tarde", "Catalina"],
      ["Sesión con Customer Success", "lunes a las 9", "Luis"],
    ]);
    // El siguiente paso se dice con lo verificado, no con la lectura del modelo.
    const sp = resultado.juicios.find((j) => j.punto === "siguiente_paso")!;
    expect(sp.lectura).toBe("Sesión con Marketing, miércoles a las 2 de la tarde, con Catalina. Sesión con Customer Success, lunes a las 9, con Luis.");
    expect(sp.lectura).not.toMatch(/martes/);
  });
  it("un día que no se dijo alrededor de su cita no pasa (dice «jueves» y se habló del miércoles)", () => {
    const { resultado, descartados } = leer({
      pasos: [{ tema: "Marketing", que: "Sesión con Marketing", cuando: "jueves a las 2", citas: [{ turno: 10, texto: "Miércoles entonces, ¿qué les parece a las 2 de la tarde con Catalina?" }] }],
    });
    expect(resultado.pasos).toEqual([]);
    expect(descartados).toBe(1);
  });
  it("«ninguno» con pasos verificados se corrige", () => {
    const { resultado } = leer({
      juicios: [{ punto: "siguiente_paso", valor: "ninguno", lectura: "No quedó nada.", citas: [] }],
      pasos: [{ tema: "Luis", que: "Sesión con Luis", cuando: "lunes a las 9", quien: "Luis", citas: [{ turno: 13, texto: "el lunes a las 9 me sirve perfecto" }] }],
    });
    expect(resultado.juicios[0]).toMatchObject({ valor: "con_fecha_y_duenio", porAusencia: false });
  });
  it("la tarjeta «Siguiente paso acordado» muestra cada paso verificado en sus partes, sin repetir el «con»", () => {
    const cita = { turno: 10, hablante: "Laura", texto: "x" };
    expect(partesDelPaso({ que: "Sesión con Marketing.", cuando: "miércoles a las 2 de la tarde", quien: "con Catalina", cita })).toEqual({
      que: "Sesión con Marketing",
      cuando: "miércoles a las 2 de la tarde",
      conQuien: "Catalina",
    });
    expect(partesDelPaso({ que: "Sesión con Luis", cuando: "lunes a las 9", quien: "Luis", cita })).toEqual({ que: "Sesión con Luis", cuando: "lunes a las 9", conQuien: null });
  });
});

describe("6 · «Para mejorar» trae qué decir la próxima vez", () => {
  it("el campo `decir` se guarda; sin cita, igual se cae", () => {
    const { resultado, descartados } = leer({
      recomendaciones: [
        { error: "funciones_antes_del_dolor", texto: "Explicaste la sincronización antes del dolor.", decir: "Te lo muestro en el demo; antes, ¿qué pasa con el prospecto cuando no se registra?", citas: [{ turno: 7, texto: "se puede sincronizar con los teléfonos para que queden las llamadas" }] },
        { error: "otro", texto: "Genérico.", decir: "Pregunta más.", citas: [] },
      ],
    });
    expect(resultado.recomendaciones).toHaveLength(1);
    expect(resultado.recomendaciones[0].decir).toMatch(/demo/);
    expect(descartados).toBe(1);
  });
});

describe("7 · las preguntas para el demo", () => {
  it("con quién preguntó, sacado de la transcripción; una pregunta del vendedor no cuenta", () => {
    const { resultado } = leer({
      demo: [
        { pregunta: "Sincronizar las llamadas del celular", citas: [{ turno: 7, texto: "¿HubSpot se puede sincronizar con los teléfonos para que queden las llamadas registradas?" }] },
        { pregunta: "Marketing", citas: [{ turno: 8, texto: "Faltaría la sesión con marketing, ¿la dejamos para el martes" }] },
      ],
    });
    expect(resultado.demo).toEqual([{ pregunta: "Sincronizar las llamadas del celular", quien: "Fernando Segura", cita: expect.objectContaining({ turno: 7 }) }]);
  });
});

describe("la verificación de citas, con lo que se vio en Centauro", () => {
  const turnos: TurnoNumerado[] = [
    T(1, "Emiley Calvo", "Entonces, por ejemplo, si se les olvida calendar, no sé, colocar de tarea la llamada que hicieron, entonces estamos ciegos a esa información."),
    T(2, "Emiley Calvo", "Digamos que 25 25 la mitad."),
    T(3, "Fernando Segura", "En este momento cerramos unos 30 tal vez al mes."),
    T(4, "Emiley Calvo", "25."),
    T(5, "Fernando Segura", "Me llama el dueño de la empresa y me dice que cortamos un montón de hoteles y están reclamando por correo por todo lado, todos los clientes enojados a la vez. Bueno, resulta que una de las herramientas corta el 25 si no pagaste."),
    T(6, "Ana Mora", "Las llamadas no se registran en ningún lado del sistema."),
  ];
  const habia: LoQueHabia = { guia: true, escala: true, posicionamiento: true, delCliente: ["Emiley Calvo", "Fernando Segura", "Ana Mora"] };
  it("el «no sé» de muletilla entre comas no frena la cita; un «no sé» que sí niega, sí", () => {
    expect(verificarCita({ turno: 1, texto: "si se les olvida colocar de tarea la llamada que hicieron, entonces estamos ciegos a esa información" }, turnos)).not.toBeNull();
    expect(verificarCita({ turno: 6, texto: "Las llamadas se registran en ningún lado del sistema" }, turnos)).toBeNull();
  });
  it("el número repetido («25 25») no es un número de más; uno distinto sigue sin pasar", () => {
    expect(verificarCita({ turno: 2, texto: "Digamos que 25, la mitad" }, turnos)).not.toBeNull();
    expect(verificarCita({ turno: 3, texto: "En este momento cerramos unos 25 tal vez al mes" }, turnos)).toBeNull();
  });
  it("una cita que junta dos frases se prueba frase por frase: cada pedazo que está vale", () => {
    const { resultado } = leerElAnalisis(
      {
        resumen: "x",
        juicios: [],
        bien: [],
        recomendaciones: [],
        fuera_del_objetivo: [{ texto: "Los cortes por falta de pago.", citas: [{ turno: 5, texto: "Me llama el dueño de la empresa y me dice. Bueno, resulta que una de las herramientas corta el 25 si no pagaste." }] }],
      },
      turnos,
      habia,
    );
    expect(resultado.fueraDelObjetivo![0].citas.map((c) => c.texto)).toEqual(["Me llama el dueño de la empresa y me dice", "Bueno, resulta que una de las herramientas corta el 25 si no pagaste."]);
  });
  it("la corrección dicha con un solo número («25.») vale como cifra si es el turno entero", () => {
    const { resultado } = leerElAnalisis(
      {
        resumen: "x",
        juicios: [],
        bien: [],
        recomendaciones: [],
        numeros: [{ tema: "volumen", que: "Cierres por mes", realidad: { texto: "25 al mes", citas: [{ turno: 3, texto: "cerramos unos 30 tal vez al mes" }, { turno: 4, texto: "25" }] } }],
      },
      turnos,
      habia,
    );
    expect(resultado.numeros![0].realidad).toMatchObject({ texto: "25 al mes", cita: { turno: 4, hablante: "Emiley Calvo" } });
    // Como cita de un juicio, «25» sigue sin alcanzar.
    expect(verificarCita({ turno: 4, texto: "25" }, turnos)).toBeNull();
  });
});

describe("lo que cazó la revisión (2026-11-08)", () => {
  const turnos: TurnoNumerado[] = [
    T(1, "Ana Mora", "Sí tenemos un CRM pero casi nadie lo abre. Usamos Excel para el seguimiento de todo."),
    T(2, "Marco Salas", "¿Ustedes cierran unos 30 al mes, más o menos, verdad?"),
    T(3, "Ana Mora", "Facturamos unos 25 mil al mes en promedio con los hoteles."),
    T(4, "Ana Mora", "La verdad, no se, usa mucho el CRM el equipo de ventas."),
    T(5, "Marco Salas", "Entonces la sesión con marketing queda el miércoles a las 2."),
    T(6, "Ana Mora", "Perfecto, el miércoles a las 2 con Cata, ella confirma."),
  ];
  const habia: LoQueHabia = { guia: true, escala: true, posicionamiento: true, delCliente: ["Ana Mora"] };
  const leerAca = (crudo: Record<string, unknown>) => leerElAnalisis({ resumen: "x", juicios: [], bien: [], recomendaciones: [], ...crudo }, turnos, habia);

  it("una cita partida con una frase cierta y otra inventada no sostiene nada, y cuenta como descartada", () => {
    const { resultado, descartados } = leerAca({
      bien: [{ texto: "No tienen CRM.", citas: [{ turno: 1, texto: "No tenemos ningún CRM en la empresa hoy. Usamos Excel para el seguimiento de todo." }] }],
      juicios: [{ punto: "consultiva", valor: "mucho", lectura: "No tienen CRM.", citas: [{ turno: 1, texto: "No tenemos ningún CRM en la empresa hoy. Usamos Excel para el seguimiento de todo." }] }],
    });
    expect(resultado.bien).toEqual([]);
    expect(resultado.juicios).toEqual([]);
    expect(descartados).toBe(2);
  });
  it("una cifra que solo dijo el vendedor no entra a la tabla", () => {
    const { resultado } = leerAca({ numeros: [{ tema: "volumen", que: "Cierres", realidad: { texto: "30 al mes", citas: [{ turno: 2, texto: "¿Ustedes cierran unos 30 al mes, más o menos, verdad?" }] } }] });
    expect(resultado.numeros).toEqual([]);
  });
  it("una cifra sin dígitos no se puede comparar; «25 mil» no respalda «25 millones»", () => {
    const { resultado } = leerAca({
      numeros: [
        { tema: "ticket", que: "Facturación", realidad: { texto: "un millón al mes", citas: [{ turno: 3, texto: "Facturamos unos 25 mil al mes en promedio" }] } },
        { tema: "ticket", que: "Facturación", realidad: { texto: "25 millones al mes", citas: [{ turno: 3, texto: "Facturamos unos 25 mil al mes en promedio" }] } },
        { tema: "ticket", que: "Facturación", realidad: { texto: "25 mil al mes", citas: [{ turno: 3, texto: "Facturamos unos 25 mil al mes en promedio" }] } },
      ],
    });
    expect(resultado.numeros!.map((f) => f.realidad?.texto)).toEqual(["25 mil al mes"]);
  });
  it("«25, 25 mil»: el segundo corrige al primero, no es repetición", () => {
    const t: TurnoNumerado[] = [T(1, "Ana Mora", "Facturamos unos 25, 25 mil al mes en promedio.")];
    expect(verificarCita({ turno: 1, texto: "Facturamos unos 25 al mes en promedio" }, t)).toBeNull();
  });
  it("un «no se» sin tilde entre comas sí niega", () => {
    expect(verificarCita({ turno: 4, texto: "La verdad, usa mucho el CRM el equipo de ventas" }, turnos)).toBeNull();
  });
  it("sin el juicio del siguiente paso, los pasos verificados igual lo arman (si no, no se verían)", () => {
    const { resultado } = leerAca({ pasos: [{ tema: "Marketing", que: "Sesión con Marketing", cuando: "miércoles a las 2", quien: "Catalina", citas: [{ turno: 5, texto: "la sesión con marketing queda el miércoles a las 2" }] }] });
    const sp = resultado.juicios.find((j) => j.punto === "siguiente_paso");
    expect(sp).toMatchObject({ valor: "con_fecha_y_duenio", lectura: "Sesión con Marketing, miércoles a las 2, con Catalina.", porAusencia: false });
  });
  it("el «con quién» se busca alrededor de la cita: un nombre que no se dijo ahí se quita (el apodo vale)", () => {
    const { resultado } = leerAca({
      pasos: [
        { tema: "A", que: "Sesión con Marketing", cuando: "miércoles a las 2", quien: "Fernando", citas: [{ turno: 5, texto: "la sesión con marketing queda el miércoles a las 2" }] },
        { tema: "B", que: "Confirmar con Marketing", cuando: "miércoles a las 2", quien: "Catalina", citas: [{ turno: 6, texto: "el miércoles a las 2 con Cata, ella confirma" }] },
      ],
    });
    expect(resultado.pasos!.map((p) => p.quien)).toEqual([null, "Catalina"]);
  });
  it("«quién decide» solo se sabe con alguien que decide o aprueba, y con la etiqueta de pantalla", () => {
    expect(yaSeSabeDeLasTarjetas({ autoridad: [{ nombre: "Laura", rol: "influye" }, { nombre: "Equipo", rol: "afectado" }] }).quien_decide).toBeUndefined();
    expect(yaSeSabeDeLasTarjetas({ autoridad: [{ nombre: "Laura", rol: "influye" }, { nombre: "Fernando", rol: "firma" }], presupuesto: "No se discutió." })).toEqual({ quien_decide: "Fernando (Aprueba)" });
  });
});

describe("la conversación no pierde el cierre", () => {
  const larga = Array.from({ length: 400 }, (_, i) => `${i % 2 ? "Ana" : "Marco Salas"}: ${"palabra ".repeat(30)}turno ${i + 1}`).join("\n");
  it("entra entera si cabe", () => {
    const c = conversacionDelAnalisis(larga, 1_000_000);
    expect(c.omitidos).toBeNull();
    expect(c.turnos).toHaveLength(400);
  });
  it("si no cabe, se omite un pedazo del medio: el arranque y el cierre llegan, con su número de siempre", () => {
    const c = conversacionDelAnalisis(larga, 20_000);
    expect(c.omitidos).not.toBeNull();
    expect(c.turnos[0].n).toBe(1);
    expect(c.turnos[c.turnos.length - 1].n).toBe(400);
    expect(c.turnos[c.turnos.length - 1].texto).toMatch(/turno 400$/);
    const largo = c.turnos.reduce((s, t) => s + t.hablante.length + t.texto.length + 4, 0);
    expect(largo).toBeLessThanOrEqual(20_000);
    expect(c.turnos.some((t) => t.n >= c.omitidos!.desde && t.n <= c.omitidos!.hasta)).toBe(false);
  });
});

describe("los insumos para «Preparar la siguiente sesión»", () => {
  it("las preguntas de la tabla, los huecos abiertos y el demo, en líneas para el pedido de la guía", () => {
    const { resultado } = leer(
      {
        numeros: [{ tema: "volumen", que: "Cierres por mes", falta: "¿Cuál es la meta mensual de cierres?" }],
        demo: [{ pregunta: "Sincronizar las llamadas del celular", citas: [{ turno: 7, texto: "¿HubSpot se puede sincronizar con los teléfonos para que queden las llamadas registradas?" }] }],
      },
      { ...HABIA, yaSeSabe: { quien_decide: "Fernando", para_cuando: "Antes de enero", cuanto_invertir: "15 mil", si_no_hacen_nada: "Pierden hoteles" } },
    );
    const lineas = insumosComoLineas(insumosParaLaGuia(resultado), "la reunión del 6 nov");
    expect(lineas).toEqual([
      "Del análisis de la reunión del 6 nov:",
      "- Número que falta: ¿Cuál es la meta mensual de cierres?",
      "- Para el demo (lo preguntó Fernando Segura): Sincronizar las llamadas del celular. No se responde en la exploración: se muestra en el demo.",
    ]);
  });
  it("un análisis guardado de antes del 8 nov no trae insumos ni campos nuevos (no se dan por vacíos)", () => {
    const viejo = leerResultadoGuardado({ resumen: "x", juicios: [], recomendaciones: [] })!;
    expect(viejo.decision).toBeUndefined();
    expect(loDeLaSesion(viejo).decision).toBeNull();
    expect(insumosComoLineas(insumosParaLaGuia(viejo), "x")).toEqual([]);
  });
  it("lo guardado se relee con los campos nuevos", () => {
    const { resultado } = leer({ numeros: [{ tema: "ticket", que: "Ticket", falta: "¿Ticket por producto?" }] });
    const releido = leerResultadoGuardado(JSON.parse(JSON.stringify(resultado)))!;
    expect(releido.numeros).toEqual(resultado.numeros);
    expect(releido.decision).toHaveLength(4);
  });
});
