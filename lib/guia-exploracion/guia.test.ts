import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  TOPE_NO_REPREGUNTAR,
  aplicarOperaciones,
  contenidoVacio,
  fusionarPropuestas,
  idDelItem,
  leerContenido,
  pendientes,
  propuestaVacia,
  type ContenidoDeGuia,
  type ItemPropuesto,
} from "./contenido";
import { citaVerificable, leerLaRespuesta } from "./lectura";
import { guiaComoTexto } from "./contexto";

const corrida = { id: "c1", modo: "preparar" as const, en: "2026-10-02", propuestas: 0, descartadas: 0 };

function item(destino: ItemPropuesto["destino"], valor: ItemPropuesto["valor"]): ItemPropuesto {
  return { id: idDelItem(destino, valor), destino, valor, fuentes: [{ id: "H1", etiqueta: "Handoff" }], corridaId: "c1", en: "x" };
}

function conSesion(): ContenidoDeGuia {
  const c = contenidoVacio();
  c.sesiones.push({
    id: "s1",
    titulo: "Cómo venden",
    objetivo: "",
    conQuien: "Gerente comercial",
    preguntas: [
      { id: "q1", texto: "¿Cuántos procesos de venta tienen?", hecha: true, respuesta: "Dos" },
      { id: "q2", texto: "¿Quién aprueba descuentos?", hecha: false },
    ],
  });
  return c;
}

describe("el agente propone; el CSE confirma", () => {
  it("usar una propuesta la pasa a lo confirmado; las personas entran SIN confirmar", () => {
    const p = fusionarPropuestas(propuestaVacia(), contenidoVacio(), [item({ tipo: "persona" }, { nombre: "Andrea", rol: "decide", sabe: "" })], corrida);
    const r = aplicarOperaciones(contenidoVacio(), p, [{ op: "usar", itemId: p.items[0].id }]);
    expect(r.ok && r.contenido.personas[0]).toMatchObject({ nombre: "Andrea", rol: "decide", confirmado: false });
  });

  it("lo descartado no vuelve aunque el agente lo proponga otra vez (id estable)", () => {
    const it1 = item({ tipo: "noRepreguntar" }, { texto: "Facturan en Odoo" });
    let p = fusionarPropuestas(propuestaVacia(), contenidoVacio(), [it1], corrida);
    const r = aplicarOperaciones(contenidoVacio(), p, [{ op: "descartar", itemIds: [it1.id] }]);
    p = { ...p, descartadas: r.ok ? r.descartadas : [] };
    const otra = fusionarPropuestas(p, contenidoVacio(), [item({ tipo: "noRepreguntar" }, { texto: "facturan en  ODOO" })], corrida);
    expect(pendientes(otra, contenidoVacio()).filter((i) => !p.descartadas.includes(i.id))).toEqual([]);
  });

  it("lo ya confirmado no se vuelve a proponer", () => {
    const c = contenidoVacio();
    c.noRepreguntar.push({ id: "d1", texto: "Facturan en Odoo" });
    const p = fusionarPropuestas(propuestaVacia(), c, [item({ tipo: "noRepreguntar" }, { texto: "Facturan en Odoo" })], corrida);
    expect(pendientes(p, c)).toEqual([]);
  });

  it("⛔ el agente nunca escribe en lo confirmado: fusionar no toca el contenido", () => {
    const c = conSesion();
    const antes = JSON.stringify(c);
    fusionarPropuestas(propuestaVacia(), c, [item({ tipo: "sesion" }, { titulo: "Otra", objetivo: "", conQuien: "", preguntas: [] })], corrida);
    expect(JSON.stringify(c)).toBe(antes);
  });
});

describe("⛔ las preguntas ya hechas no se pierden", () => {
  it("una pregunta hecha no se puede quitar", () => {
    const r = aplicarOperaciones(conSesion(), propuestaVacia(), [{ op: "quitar", lista: "sesiones", id: "q1" }]);
    expect(r.ok).toBe(false);
  });

  it("una sesión con preguntas hechas no se puede quitar", () => {
    const r = aplicarOperaciones(conSesion(), propuestaVacia(), [{ op: "quitar", lista: "sesiones", id: "s1" }]);
    expect(r.ok).toBe(false);
  });

  it("marcar y anotar lo averiguado", () => {
    const r = aplicarOperaciones(conSesion(), propuestaVacia(), [{ op: "marcarPregunta", sesionId: "s1", preguntaId: "q2", hecha: true, respuesta: "La gerente" }]);
    expect(r.ok && r.contenido.sesiones[0].preguntas[1]).toMatchObject({ hecha: true, respuesta: "La gerente" });
  });

  it("«ya respondida» del agente marca la pregunta con lo que se averiguó", () => {
    const c = conSesion();
    const it2 = item({ tipo: "respondida", sesionId: "s1", preguntaId: "q2" }, { respuesta: "Aprueba la gerente" });
    const p = fusionarPropuestas(propuestaVacia(), c, [it2], corrida);
    const r = aplicarOperaciones(c, p, [{ op: "usar", itemId: it2.id }]);
    expect(r.ok && r.contenido.sesiones[0].preguntas[1].hecha).toBe(true);
  });
});

describe("lo que no hay que repreguntar es corto", () => {
  it(`hasta ${TOPE_NO_REPREGUNTAR}`, () => {
    let c = contenidoVacio();
    for (let i = 0; i < TOPE_NO_REPREGUNTAR; i++) {
      const r = aplicarOperaciones(c, propuestaVacia(), [{ op: "agregarDato", lista: "noRepreguntar", texto: `Dato ${i}` }]);
      if (r.ok) c = r.contenido;
    }
    expect(aplicarOperaciones(c, propuestaVacia(), [{ op: "agregarDato", lista: "noRepreguntar", texto: "Uno más" }]).ok).toBe(false);
  });
});

describe("las citas del agente se verifican contra la fuente", () => {
  const fuentes = [{ id: "R1", etiqueta: "Reunión", texto: "Ana dijo: los descuentos los aprueba la gerente general, siempre." }];

  it("una cita literal (sin importar tildes ni mayúsculas) vale; una inventada, no", () => {
    expect(citaVerificable("los descuentos los aprueba la gerente", fuentes[0].texto)).toBe(true);
    expect(citaVerificable("los descuentos los aprueba el dueño", fuentes[0].texto)).toBe(false);
  });

  it("«ya respondida» sin cita verificable se descarta", () => {
    const plan = conSesion().sesiones;
    const ok = leerLaRespuesta({ respondidas: [{ preguntaId: "q2", respuesta: "La gerente", fuentes: [{ id: "R1", cita: "los descuentos los aprueba la gerente" }] }] }, fuentes, [], plan, "c", "x");
    const mal = leerLaRespuesta({ respondidas: [{ preguntaId: "q2", respuesta: "El dueño", fuentes: [{ id: "R1", cita: "los aprueba el dueño de la empresa" }] }] }, fuentes, [], plan, "c", "x");
    expect(ok.items).toHaveLength(1);
    expect(mal.items).toHaveLength(0);
    expect(mal.descartadas).toBe(1);
  });

  it("una fuente que no existe no respalda nada", () => {
    const r = leerLaRespuesta({ noRepreguntar: [{ texto: "Algo", fuentes: [{ id: "Z9" }] }] }, fuentes, [], [], "c", "x");
    expect(r.items).toHaveLength(0);
  });

  it("solo equipos contratados", () => {
    const r = leerLaRespuesta({ trabas: [{ equipo: "marketing", texto: "No miden", fuentes: [{ id: "R1" }] }] }, fuentes, ["ventas"], [], "c", "x");
    expect(r.items).toHaveLength(0);
  });
});

describe("la guía reemplaza al informe para los que vienen después", () => {
  it("solo entra lo confirmado; las preguntas no hechas van como pendientes", () => {
    const t = guiaComoTexto(conSesion());
    expect(t).toContain("Lo que se averiguó");
    expect(t).toContain("Dos");
    expect(t).toContain("todavía no se hicieron");
  });

  it("loadCanvasContext de Exploración lee la guía primero", () => {
    const src = fs.readFileSync("lib/canvas/load-canvas-context.ts", "utf8");
    expect(src).toContain('canvasSlug === "exploration"');
    expect(src).toContain("textoDeLaGuia(projectId)");
  });

  it("lee lo guardado con tolerancia: basura no rompe la pantalla", () => {
    expect(leerContenido({ sesiones: [{ id: 1 }, "x"], personas: null, escala: { "1.1": { nivel: "Z" } } })).toEqual(contenidoVacio());
  });
});
