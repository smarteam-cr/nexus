/**
 * El seguro de las variantes de CRM (./variantes.ts). La primera parte es un ratchet contra la escala del repo: cuando la
 * escala cambia, falla hasta que alguien corre la skill `revisar-banco-del-test`.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsearEscala } from "@/lib/escala/documento/parsear";
import { LETRAS } from "@/lib/escala/documento/tipos";
import { borradoresDeLaEscala, planDeLosBancos } from "./banco";
import { USOS_DE_CRM } from "./formulario";
import { conIdsPublicos } from "./ids-publicos";
import { estadoDelBanco } from "./pantalla";
import { nivelesDeLasRespuestas } from "./resultado";
import { GuardarBorradorSchema } from "./schema";
import { leerPreguntasDelBanco, type PreguntaDelBanco } from "./tipos";
import { cambiosDelBanco, conVariantes, entradasSinUso, grupoDeCrm, preguntasParaElUso, problemasDeLasVariantes, sinVarianteDelCampo } from "./variantes";
import { ESCALA_DE_LAS_VARIANTES, VARIANTES_DE_CRM } from "./variantes-de-crm.datos";

const escala = parsearEscala(readFileSync("docs/escala/escala_rendimiento_smarteam.md", "utf8"));
const bancos = borradoresDeLaEscala(escala);
const AVISO = "Corre la skill revisar-banco-del-test: compara cada pregunta y variante contra su nivel y propone el arreglo.";

describe("el banco de la escala del repo", () => {
  it("las variantes se revisaron contra esta versión de la escala", () => {
    expect(ESCALA_DE_LAS_VARIANTES, `La escala pasó a ${escala.version}. ${AVISO}`).toBe(escala.version);
  });

  it("ningún grupo lee algo que lo contradiga: toda mención de CRM o herramienta tiene su variante", () => {
    const problemas = bancos.flatMap((b) => problemasDeLasVariantes(b.preguntas).map((x) => `${b.area} · ${b.version} · ${b.edicion} · ${x}`));
    expect(problemas, AVISO).toEqual([]);
  });

  it("ninguna entrada quedó vieja", () => {
    const viejas = entradasSinUso(bancos.map((b) => b.preguntas), VARIANTES_DE_CRM).map((e) => `${e.pregunta} · ${e.campo} · ${e.base}`);
    expect(viejas, AVISO).toEqual([]);
  });

  it("siempre salen las 5 respuestas, con los mismos ids y niveles, para cualquier uso", () => {
    for (const b of bancos) {
      for (const uso of USOS_DE_CRM) {
        preguntasParaElUso(b.preguntas, uso).forEach((p, i) => {
          expect(p.opciones.map((o) => [o.id, o.nivel])).toEqual(b.preguntas[i].opciones.map((o) => [o.id, o.nivel]));
          expect(p.opciones.map((o) => o.nivel)).toEqual([...LETRAS]);
          expect(JSON.stringify(p)).not.toContain("{crm}");
        });
      }
    }
  });

  it("el puntaje es el mismo aunque cambien las palabras", () => {
    const b = bancos.find((x) => x.area === "1" && x.version === "web" && x.edicion === "general")!;
    const respuestas = Object.fromEntries(b.preguntas.map((p) => [p.id, { opcion: p.opciones[1].id }]));
    const base = nivelesDeLasRespuestas(b.preguntas, respuestas);
    for (const uso of USOS_DE_CRM) expect(nivelesDeLasRespuestas(preguntasParaElUso(b.preguntas, uso), respuestas)).toEqual(base);
  });

  it("el borrador guardado pasa por el lector y el esquema sin perder las variantes", () => {
    const b = bancos.find((x) => x.area === "1" && x.version === "web" && x.edicion === "general")!;
    expect(leerPreguntasDelBanco(JSON.parse(JSON.stringify(b.preguntas)))).toEqual(b.preguntas);
    expect(GuardarBorradorSchema.safeParse({ preguntas: b.preguntas }).success).toBe(true);
  });
});

describe("lo que lee cada persona", () => {
  const general = bancos.find((x) => x.area === "1" && x.version === "web" && x.edicion === "general")!.preguntas;
  const p12 = (uso: string | null) => preguntasParaElUso(general, uso).find((p) => p.id === "p-1.2")!;
  const opcion = (uso: string | null, nivel: string) => p12(uso).opciones.find((o) => o.nivel === nivel)!.texto;

  it("cada respuesta del formulario cae en su grupo, y «No lo sé» en ninguno", () => {
    expect(USOS_DE_CRM.map(grupoDeCrm)).toEqual(["con-crm", "con-crm", "con-crm", "sin-crm", "sin-crm", "sin-crm", null]);
    expect(grupoDeCrm(null)).toBeNull();
    expect(grupoDeCrm("Algo que no está en la lista")).toBeNull();
  });

  it("quien marcó HubSpot lee HubSpot, y sigue viendo el nivel más bajo", () => {
    expect(p12("HubSpot").texto).toMatch(/^¿Qué pasa en HubSpot, /);
    expect(opcion("HubSpot", "D")).toBe("HubSpot casi no se usa: los leads y las ventas se siguen anotando donde cada quien puede.");
    expect(opcion("Salesforce", "I")).toBe("Salesforce se usa, pero todo se carga y se reparte a mano.");
  });

  it("con otro CRM va el nombre genérico, con mayúscula al empezar la oración", () => {
    expect(opcion("Otro CRM (Zoho, Pipedrive, RD Station, Monday, Odoo)", "D")).toMatch(/^Tu CRM casi no se usa/);
  });

  it("quien usa hojas lee sobre hojas; quien no usa nada, sobre donde anota", () => {
    expect(p12("Hojas de cálculo (Excel, Google Sheets)").texto).toMatch(/^¿Qué pasa en tus hojas de cálculo, /);
    expect(p12("Aún no usamos ninguna herramienta").texto).toMatch(/^¿Qué pasa en el lugar donde hoy anotan a tus clientes, /);
    expect(opcion("En proceso de buscar un CRM", "I")).not.toMatch(/CRM/);
  });

  it("«No lo sé» y un intento sin el dato ven la base, sin variantes", () => {
    for (const uso of ["No lo sé", null]) {
      const p = p12(uso);
      expect(p.grupo).toBeNull();
      expect(p.texto).toBe(general.find((q) => q.id === "p-1.2")!.texto);
      expect(JSON.stringify(p)).not.toContain("variantes");
    }
  });

  it("el intento guarda el grupo y lo que se leyó, nunca las variantes", () => {
    const [p] = conIdsPublicos(preguntasParaElUso(general.slice(1, 2), "HubSpot"));
    expect(p.grupo).toBe("con-crm");
    expect(p.texto).toContain("HubSpot");
    expect(JSON.stringify(p)).not.toContain("variantes");
  });

  it("«Ver como» muestra solo lo que cambia", () => {
    const cambios = cambiosDelBanco(general, "con-crm");
    const de12 = cambios.find((c) => c.id === "p-1.2")!;
    expect(de12.campos.map((f) => f.campo)).toEqual(["texto", "D", "I", "E"]);
    expect(cambios.some((c) => c.id === "p-1.4")).toBe(false);
  });
});

describe("el seguro falla cuando debe", () => {
  const pregunta = (p: Partial<PreguntaDelBanco> = {}): PreguntaDelBanco => ({
    id: "p-1.2",
    dimensionId: "1.2",
    texto: "¿Cómo reparten los leads?",
    ayuda: null,
    opciones: [
      { id: "d", texto: "Cada quien anota donde puede.", nivel: "D" },
      { id: "i", texto: "Todo se carga a mano.", nivel: "I" },
    ],
    ...p,
  });

  it("un banco sin menciones no pide variantes", () => {
    expect(problemasDeLasVariantes([pregunta()])).toEqual([]);
  });

  it("una mención de CRM o herramienta sin variante", () => {
    const opciones = [{ id: "i", texto: "Hay un CRM, pero todo se carga a mano.", nivel: "I" as const }];
    expect(problemasDeLasVariantes([pregunta({ opciones })]).join()).toContain("No tiene CRM");
    const conHerramientas = [{ id: "i", texto: "Hay herramientas, pero se usan a medias.", nivel: "I" as const }];
    expect(problemasDeLasVariantes([pregunta({ opciones: conHerramientas })]).join()).toContain("No tiene CRM");
  });

  it("«No hay un CRM» sin variante contradice a quien lo tiene, y a quien no lo tiene no", () => {
    const problemas = problemasDeLasVariantes([pregunta({ opciones: [{ id: "d", texto: "No hay un CRM: se anota donde se puede.", nivel: "D" }] })]);
    expect(problemas).toHaveLength(1);
    expect(problemas[0]).toContain("Tiene CRM");
  });

  it("una pregunta adaptada que deja colgada una opción base", () => {
    const p = pregunta({
      texto: "¿Qué pasa en tu sistema?",
      variantes: { "con-crm": { texto: "¿Qué pasa en {crm}?" }, "sin-crm": { texto: "¿Qué pasa en {crm}?" } },
      opciones: [{ id: "d", texto: "No hay un sistema: todo a mano.", nivel: "D" }],
    });
    expect(problemasDeLasVariantes([p]).join()).toContain("la opción D");
  });

  it("una variante que contradice su grupo", () => {
    const opciones = [{ id: "d", texto: "Se anota donde se puede.", nivel: "D" as const, variantes: { "sin-crm": "El CRM casi no se usa." } }];
    expect(problemasDeLasVariantes([pregunta({ opciones })]).join()).toContain("le habla de un CRM");
  });

  it("una variante igual a su base, con un producto escrito o con una marca rota", () => {
    const opciones = [
      { id: "d", texto: "Se anota donde se puede.", nivel: "D" as const, variantes: { "con-crm": "Se anota donde se puede." } },
      { id: "i", texto: "Se carga a mano.", nivel: "I" as const, variantes: { "con-crm": "HubSpot se carga a mano.", "sin-crm": "{herramienta} a mano." } },
    ];
    const texto = problemasDeLasVariantes([pregunta({ opciones })]).join();
    expect(texto).toContain("igual a su base");
    expect(texto).toContain("nombra un producto");
    expect(texto).toContain("marca que no existe");
  });

  it("{crm} sin «en» delante, para quien no tiene CRM", () => {
    const opciones = [{ id: "i", texto: "Se carga a mano.", nivel: "I" as const, variantes: { "sin-crm": "{crm} se carga a mano." } }];
    expect(problemasDeLasVariantes([pregunta({ opciones })]).join()).toContain("no concuerda");
  });

  it("una entrada cuya base ya no existe queda sin uso y no se cuelga", () => {
    const entrada = { pregunta: "p-1.2", campo: "texto" as const, base: "Otra redacción", "con-crm": "En {crm}" };
    expect(conVariantes([pregunta()], [entrada])[0].variantes).toBeUndefined();
    expect(entradasSinUso([[pregunta()]], [entrada])).toEqual([entrada]);
  });

  it("el script que aprueba tampoco publica una base sin su variante", () => {
    const sinVariantes = bancos.slice(0, 1).map((b) => ({ ...b, preguntas: conVariantes(b.preguntas, []) }));
    const [plan] = planDeLosBancos(escala, sinVariantes, [], "scripts/tests-preguntas.ts");
    expect(plan.problemas.join()).toContain("No tiene CRM");
  });

  it("al editar una base se va su variante, y solo esa", () => {
    const p = pregunta({ variantes: { "con-crm": { texto: "En {crm}", ayuda: "Aclara {crm}" }, "sin-crm": { texto: "En {crm}" } } });
    expect(sinVarianteDelCampo(p, "texto").variantes).toEqual({ "con-crm": { ayuda: "Aclara {crm}" } });
    expect(sinVarianteDelCampo(pregunta(), "texto").variantes).toBeUndefined();
  });

  it("una marca escrita en la base saldría tal cual", () => {
    expect(problemasDeLasVariantes([pregunta({ texto: "¿Qué pasa en {crm}?" })]).join()).toContain("saldría tal cual");
  });

  it("cargar variantes al borrador pasa el banco a «con cambios sin aprobar»", () => {
    const aprobadas = [pregunta()];
    const preguntas = conVariantes(aprobadas, [{ pregunta: "p-1.2", campo: "D", base: "Cada quien anota donde puede.", "con-crm": "{crm} casi no se usa." }]);
    expect(estadoDelBanco({ preguntas: aprobadas, aprobadas })).toBe("aprobado");
    expect(estadoDelBanco({ preguntas, aprobadas })).toBe("aprobado-con-cambios");
  });
});
