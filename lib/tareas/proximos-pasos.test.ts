/**
 * lib/tareas/proximos-pasos.test.ts — el nivel 0 de la lectura (0 tokens) sobre las notas REALES del «Sprint planning
 * de marketing» del lunes 5 oct 2026: 16 líneas, 9 de Alejandra y 7 de Lidia. Tres de ellas nombran a otra persona en
 * el detalle («Explicar a Alexander…», «Coordinar con Alexander…», «Consultar con Marco…») y siguen siendo de quien
 * dice el corchete (docs/tareas-plan.md §7.1, punto 3).
 */
import { describe, it, expect } from "vitest";
import { itemsDeProximosPasos, itemsDeActionItems, leerLinea, parrafosDeDetalles, resumenDeLasNotas } from "./proximos-pasos";
import { mencionesEn, resolverPersona } from "./personas";

const NOTAS = [
  "Sprint planning de marketing",
  "Invitado   ",
  "Archivos adjuntos ",
  "Registros de la reunión  ",
  "",
  "",
  "Resumen",
  "Definición de prioridades con campañas de SAP y flujos de diagnóstico vía correo electrónico.\u000b\u000bFoco de la semana\u000bDiscusión sobre priorizar el lanzamiento de la campaña de SAP sobre el evento.",
  "",
  "",
  "Decisiones",
  "Acordada",
  "Campaña de SAP como enfoque semanal Se acordó establecer el lanzamiento de la campaña de SAP como el enfoque principal y prioridad de la semana.",
  "",
  "",
  "Próximos pasos",
  "[Alejandra Ortega] Email marketing diagnóstico: Finalizar los workflows de email marketing para las bases de datos instaladas durante esta semana.",
  "[Alejandra Ortega] Análisis Nexus: Analizar el agente de nutrición y las estrategias de YouTube y LinkedIn para la tracción de prospectos.",
  "[Alejandra Ortega] Estrategia SAP: Montar la estrategia de la campaña de SAP y definir el canal de envío para el email marketing.",
  "[Alejandra Ortega] Llamadas postevento: Realizar las llamadas de seguimiento a los asistentes del evento entre el martes y el viernes.",
  "[Alejandra Ortega] Copies de videos: Escribir los copies para los dos videos restantes del Radison durante esta semana.",
  "[Alejandra Ortega] Sketch landing: Enviar el diseño base de la página de destino de la campaña de SAP.",
  "[Lidia Flores] Optimización video: Probar la nueva versión de la herramienta de edición de video Cloud Gold durante hoy.",
  "[Lidia Flores] Revisar videos: Verificar el contenido y nombre de los videos de testimonios para proceder con su publicación.",
  "[Lidia Flores] Post Smaragro: Publicar las fotografías del evento para complementar la línea de contenido hoy.",
  "[Lidia Flores] Gestión landing: Coordinar con Alexander la implementación de la página de destino para hacerla administrable.",
  "[Lidia Flores] Consulta licencia: Consultar con Marco el estado de la licencia necesaria para los procesos de edición.",
  "[Lidia Flores] Ajustes Ecoquinta: Enviar las optimizaciones del sitio web solicitadas para la presentación final.",
  "[Alejandra Ortega] Revisión sesión: Escuchar la grabación de la reunión del jueves para verificar los criterios de segmentación del evento.",
  "[Lidia Flores] Estático evento: Subir el material gráfico a la carpeta compartida para permitir la creación de la campaña.",
  "[Alejandra Ortega] Reporte Colby: Finalizar la elaboración del último informe solicitado.",
  "[Alejandra Ortega] Sesión Alexander: Explicar a Alexander el procedimiento para la generación del informe de Colby hoy.",
  "",
  "",
  "Detalles",
  "Definición del foco principal de la semana: Alejandra Ortega y Lidia Flores discuten sobre cuál debe ser el foco principal del trabajo conjunto para la semana, debatiendo entre dar prioridad al evento o al lanzamiento de la campaña de SAP (00:00:18).",
].join("\n");

const MIEMBROS = [
  { email: "aortega@smarteamcr.com", nombre: "Alejandra Ortega" },
  { email: "lflores@smarteamcr.com", nombre: "Lidia Flores" },
  { email: "avanegas@smarteamcr.com", nombre: "Alexander Vanegas" },
  { email: "aarrieta@smarteamcr.com", nombre: "Alexander Arrieta" },
  { email: "msalas@smarteamcr.com", nombre: "Marco Salas" },
  { email: "egonzalez@smarteamcr.com", nombre: "Elías González" },
  { email: "asalas@smarteamcr.com", nombre: "Alejandro Salas" },
  { email: "arodriguez@smarteamcr.com", nombre: "Alejandro Rodríguez" },
];
const EN_LA_SALA = ["aortega@smarteamcr.com", "lflores@smarteamcr.com", "egonzalez@smarteamcr.com"];

describe("las 16 líneas del planning del 5 oct", () => {
  const lineas = itemsDeProximosPasos(NOTAS);

  it("las lee todas, 9 de Alejandra y 7 de Lidia, sin IA", () => {
    expect(lineas).toHaveLength(16);
    const duenos = lineas.map((l) => resolverPersona(l.personas[0], MIEMBROS, EN_LA_SALA));
    expect(duenos.every((d) => d.tipo === "seguro")).toBe(true);
    const emails = duenos.map((d) => (d.tipo === "seguro" ? d.email : ""));
    expect(emails.filter((e) => e === "aortega@smarteamcr.com")).toHaveLength(9);
    expect(emails.filter((e) => e === "lflores@smarteamcr.com")).toHaveLength(7);
  });

  it("la línea literal es la cita, y su id no depende de la posición", () => {
    const l = lineas.find((x) => x.titulo === "Sketch landing")!;
    expect(l.texto).toBe("[Alejandra Ortega] Sketch landing: Enviar el diseño base de la página de destino de la campaña de SAP.");
    expect(l.detalle).toBe("Enviar el diseño base de la página de destino de la campaña de SAP.");
    const reordenadas = itemsDeProximosPasos(NOTAS.replace(l.texto + "\n", "") + "\n");
    expect(reordenadas.find((x) => x.titulo === "Estrategia SAP")!.id).toBe(lineas.find((x) => x.titulo === "Estrategia SAP")!.id);
  });

  it("T-9, T-13 y T-14: el nombre del detalle es una mención, nunca el dueño ni un pedido", () => {
    const t9 = lineas.find((x) => x.titulo === "Sesión Alexander")!;
    const t13 = lineas.find((x) => x.titulo === "Gestión landing")!;
    const t14 = lineas.find((x) => x.titulo === "Consulta licencia")!;
    expect(resolverPersona(t9.personas[0], MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "seguro", email: "aortega@smarteamcr.com" });
    expect(resolverPersona(t13.personas[0], MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "seguro", email: "lflores@smarteamcr.com" });
    const m9 = mencionesEn(t9.detalle!, MIEMBROS, "aortega@smarteamcr.com");
    expect(m9).toHaveLength(1);
    expect(m9[0].candidatos.sort()).toEqual(["aarrieta@smarteamcr.com", "avanegas@smarteamcr.com"]); // ambiguo
    expect(m9[0].pide).toBe(false); // «Explicar a» no es un pedido
    expect(mencionesEn(t13.detalle!, MIEMBROS, "lflores@smarteamcr.com")[0].pide).toBe(false); // «Coordinar con»
    const m14 = mencionesEn(t14.detalle!, MIEMBROS, "lflores@smarteamcr.com");
    expect(m14[0].candidatos).toEqual(["msalas@smarteamcr.com"]);
    expect(m14[0].pide).toBe(false); // «Consultar con»
  });

  it("los detalles y el resumen", () => {
    expect(parrafosDeDetalles(NOTAS)).toHaveLength(1);
    expect(resumenDeLasNotas(NOTAS)).toContain("SAP");
  });
});

describe("leerLinea y resolverPersona", () => {
  it("parte varios dueños: el primero es el dueño", () => {
    expect(leerLinea("[Ana, Luis] Preparar: algo")!.personas).toEqual(["Ana", "Luis"]);
    expect(leerLinea("* [Lidia Flores] Subir estático")!.titulo).toBe("Subir estático");
    expect(leerLinea("Sin corchete: nada")).toBeNull();
  });

  it("nombre de pila ambiguo o de alguien que no estuvo", () => {
    expect(resolverPersona("Alexander", MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "ambiguo", candidatos: ["avanegas@smarteamcr.com", "aarrieta@smarteamcr.com"] });
    expect(resolverPersona("Marco", MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "confirmar", email: "msalas@smarteamcr.com" });
    expect(resolverPersona("Lidia", MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "seguro", email: "lflores@smarteamcr.com" });
    expect(resolverPersona("Equipo", MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "equipo" });
    expect(resolverPersona("Pedro", MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "ninguno" });
    // Nombre y apellido.
    expect(resolverPersona("Alejandro Salas", MIEMBROS, EN_LA_SALA)).toEqual({ tipo: "seguro", email: "asalas@smarteamcr.com" });
  });

  it("solo una lista cerrada de verbos pide", () => {
    expect(mencionesEn("Pedirle a Marco que revise la licencia", MIEMBROS, "lflores@smarteamcr.com")[0].pide).toBe(true);
    expect(mencionesEn("Que Marco revise la licencia", MIEMBROS, "lflores@smarteamcr.com")[0].pide).toBe(true);
    expect(mencionesEn("Avisarle a Marco", MIEMBROS, "lflores@smarteamcr.com")[0].pide).toBe(false);
  });

  it("action_items sin corchete quedan sin persona", () => {
    const l = itemsDeActionItems(["Enviar la propuesta al cliente", "[Lidia Flores] Subir: el material"]);
    expect(l[0].personas).toEqual([]);
    expect(l[1].personas).toEqual(["Lidia Flores"]);
  });
});
