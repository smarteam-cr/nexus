/**
 * lib/analizador-venta/analizador.test.ts — el analizador de reuniones de venta (S1 a S3): el criterio escrito, quién habló
 * (calculado), qué reunión es de venta, y que ningún juicio sobreviva sin una cita que esté en la transcripción.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { ETAPAS, PROCESO_CONSULTIVO, PUNTOS_DEL_ANALISIS, SIN_POSICIONAMIENTO, criterioComoTexto } from "./criterio";
import { palabrasDe, quienHablo, reconocerAlEquipo } from "./quien-hablo";
import { analizadorAutomaticoPrendido, delEquipoEnLaReunion, motivoAnalizadorApagado, porQueNoEsDeVenta, vendedoresDeLaReunion, veElAnalizador } from "./reglas";
import { HERRAMIENTA_DEL_ANALISIS, extraerDelTurno, leerElAnalisis, paraComparar, verificarCita, type TurnoNumerado } from "./analisis";
import { AGENTES_CON_CAMINO_PROPIO, esAgenteRetirado } from "@/lib/agents/retirados";
import { AGENTE_DEL_ANALIZADOR } from "./prompt";

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
    expect(PUNTOS_DEL_ANALISIS).toHaveLength(10);
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
  it("el automático nace apagado, y lo ven solo los super admin", () => {
    expect(analizadorAutomaticoPrendido({})).toBe(false);
    expect(motivoAnalizadorApagado({})).toMatch(/ANALIZADOR_VENTA=1/);
    expect(motivoAnalizadorApagado({ ANALIZADOR_VENTA: "1" })).toBeNull();
    expect(veElAnalizador("SUPER_ADMIN")).toBe(true);
    expect(veElAnalizador("VENTAS")).toBe(false);
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
    expect(HERRAMIENTA_DEL_ANALISIS.input_schema.required).toEqual(["resumen", "juicios", "recomendaciones"]);
  });
});

describe("⛔ el analizador corre por su camino, con una sola empresa", () => {
  const RAIZ = path.join(__dirname, "..", "..");
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
  it("/analyze no lo despacha (aunque su fila esté ACTIVE)", () => {
    expect(AGENTES_CON_CAMINO_PROPIO).toContain(AGENTE_DEL_ANALIZADOR);
    expect(esAgenteRetirado(AGENTE_DEL_ANALIZADOR)).toBe(true);
  });
  it("⛔ solo lo ven quienes ven el analizador: las rutas, la página y el bloque de la reunión preguntan", () => {
    for (const f of [
      "app/api/sessions/[id]/analisis-de-venta/route.ts",
      "app/api/sessions/[id]/referencia-de-venta/route.ts",
      "app/(shell)/sessions/venta/page.tsx",
      "app/(shell)/sessions/[id]/page.tsx",
    ]) {
      expect(leer(f), f).toMatch(/veElAnalizador\(/);
    }
  });
  it("la reunión que se analiza sale del chokepoint, y la de referencia no entra al contexto", () => {
    const src = leer("lib/analizador-venta/analizar-server.ts");
    expect(src).toContain("getClientSessions(r.dueno.id, { ids: [sessionId] })");
    expect(src).not.toMatch(/reunionDeReferenciaDeVenta|reunionesDeReferencia/);
  });
});
