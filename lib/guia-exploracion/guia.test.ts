import { describe, expect, it } from "vitest";
import fs from "node:fs";
import {
  aplicarOperaciones,
  anotarFichaCampos,
  contenidoVacio,
  dimensionDelObjetivo,
  fusionarPropuestas,
  idDelItem,
  leerContenido,
  leerPropuesta,
  letraDelObjetivo,
  pendientes,
  propuestaVacia,
  proximaSesion,
  tituloSinNumero,
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
  it("usar una sesión nueva la pasa a lo confirmado, con sus preguntas sin hacer", () => {
    const it1 = item({ tipo: "sesion" }, { titulo: "Servicio", objetivo: "Cómo atienden", conQuien: "Laura", preguntas: [{ texto: "¿Cómo entra un reclamo?", objetivo: "servicio" }] });
    const p = fusionarPropuestas(propuestaVacia(), contenidoVacio(), [it1], corrida);
    const r = aplicarOperaciones(contenidoVacio(), p, [{ op: "usar", itemId: it1.id }]);
    expect(r.ok && r.contenido.sesiones[0]).toMatchObject({ titulo: "Servicio", conQuien: "Laura" });
    expect(r.ok && r.contenido.sesiones[0].preguntas[0]).toMatchObject({ texto: "¿Cómo entra un reclamo?", objetivo: "servicio", hecha: false });
  });

  it("lo descartado no vuelve aunque el agente lo proponga otra vez (id estable)", () => {
    const valor = { titulo: "Datos del ERP", objetivo: "", conQuien: "", preguntas: [] };
    const it1 = item({ tipo: "sesion" }, valor);
    let p = fusionarPropuestas(propuestaVacia(), contenidoVacio(), [it1], corrida);
    const r = aplicarOperaciones(contenidoVacio(), p, [{ op: "descartar", itemIds: [it1.id] }]);
    p = { ...p, descartadas: r.ok ? r.descartadas : [] };
    expect(pendientes(p, contenidoVacio())).toEqual([]);
    const otra = fusionarPropuestas(p, contenidoVacio(), [item({ tipo: "sesion" }, { ...valor, titulo: "datos del  ERP" })], corrida);
    expect(pendientes(otra, contenidoVacio())).toEqual([]);
  });

  it("una sesión que ya está no se vuelve a proponer", () => {
    const c = conSesion();
    const p = fusionarPropuestas(propuestaVacia(), c, [item({ tipo: "sesion" }, { titulo: "cómo venden", objetivo: "", conQuien: "", preguntas: [] })], corrida);
    expect(pendientes(p, c)).toEqual([]);
  });

  it("⛔ el agente nunca escribe en lo confirmado: fusionar no toca el contenido", () => {
    const c = conSesion();
    const antes = JSON.stringify(c);
    fusionarPropuestas(propuestaVacia(), c, [item({ tipo: "sesion" }, { titulo: "Otra", objetivo: "", conQuien: "", preguntas: [] })], corrida);
    expect(JSON.stringify(c)).toBe(antes);
  });

  it("una contradicción se lleva como pregunta a la PRÓXIMA sesión", () => {
    const c = conSesion();
    c.sesiones.unshift({ id: "s0", titulo: "Arranque", objetivo: "", conQuien: "", preguntas: [{ id: "q0", texto: "¿Qué esperan?", hecha: true }] });
    const it1 = { ...item({ tipo: "contradiccion" }, { texto: "Mariana dice que se registra en el ERP; Diego, que depende del vendedor: ¿cuál es?" }) };
    const p = fusionarPropuestas(propuestaVacia(), c, [it1], corrida);
    const r = aplicarOperaciones(c, p, [{ op: "usar", itemId: it1.id }]);
    expect(r.ok && r.contenido.sesiones[1].preguntas.at(-1)).toMatchObject({ objetivo: "contradiccion", hecha: false });
  });

  it("una contradicción sin sesiones no tiene dónde quedar", () => {
    const it1 = item({ tipo: "contradiccion" }, { texto: "Ana y Pedro dicen cosas distintas" });
    const p = fusionarPropuestas(propuestaVacia(), contenidoVacio(), [it1], corrida);
    expect(aplicarOperaciones(contenidoVacio(), p, [{ op: "usar", itemId: it1.id }]).ok).toBe(false);
  });

  it("una contradicción se lleva a la sesión de la pestaña en la que estaba", () => {
    const c = conSesion();
    c.sesiones.push({ id: "s2", titulo: "Servicio", objetivo: "", conQuien: "", preguntas: [] });
    const it1 = item({ tipo: "contradiccion" }, { texto: "Laura y Diego cuentan distinto cómo entra un reclamo" });
    const p = fusionarPropuestas(propuestaVacia(), c, [it1], corrida);
    const r = aplicarOperaciones(c, p, [{ op: "usar", itemId: it1.id, sesionId: "s2" }]);
    expect(r.ok && r.contenido.sesiones[1].preguntas.map((q) => q.objetivo)).toEqual(["contradiccion"]);
    expect(r.ok && r.contenido.sesiones[0].preguntas).toHaveLength(2);
  });

  it("sin sesiones usadas, la contradicción entra junto con la sesión propuesta (en ese orden)", () => {
    const ses = item({ tipo: "sesion" }, { titulo: "Sesión 1 — Negocio", objetivo: "", conQuien: "", preguntas: [{ texto: "¿Qué esperan?" }] });
    const con = item({ tipo: "contradiccion" }, { texto: "Ana y Pedro dicen cosas distintas" });
    const p = fusionarPropuestas(propuestaVacia(), contenidoVacio(), [ses, con], corrida);
    const r = aplicarOperaciones(contenidoVacio(), p, [
      { op: "usar", itemId: ses.id },
      { op: "usar", itemId: con.id },
    ]);
    expect(r.ok && r.contenido.sesiones).toHaveLength(1);
    expect(r.ok && r.contenido.sesiones[0].preguntas.map((q) => q.objetivo)).toEqual([undefined, "contradiccion"]);
  });

  it("el «Sesión 1 —» que escribe el agente no se guarda, y la sesión usada deja de ofrecerse", () => {
    expect(tituloSinNumero("Sesión 1 — Negocio y resultados esperados")).toBe("Negocio y resultados esperados");
    expect(tituloSinNumero("sesion 2: Datos del ERP")).toBe("Datos del ERP");
    expect(tituloSinNumero("Sesión de cierre")).toBe("Sesión de cierre");
    expect(tituloSinNumero("Sesión 3")).toBe("Sesión 3");
    const ses = item({ tipo: "sesion" }, { titulo: "Sesión 1 — Negocio", objetivo: "", conQuien: "", preguntas: [] });
    const p = fusionarPropuestas(propuestaVacia(), contenidoVacio(), [ses], corrida);
    const r = aplicarOperaciones(contenidoVacio(), p, [{ op: "usar", itemId: ses.id }]);
    expect(r.ok && r.contenido.sesiones[0].titulo).toBe("Negocio");
    expect(r.ok && pendientes(p, r.contenido)).toEqual([]);
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

  it("«ya respondida» del agente marca la pregunta con lo que se averiguó", () => {
    const c = conSesion();
    const it2 = item({ tipo: "respondida", sesionId: "s1", preguntaId: "q2" }, { respuesta: "Aprueba la gerente" });
    const p = fusionarPropuestas(propuestaVacia(), c, [it2], corrida);
    const r = aplicarOperaciones(c, p, [{ op: "usar", itemId: it2.id }]);
    expect(r.ok && r.contenido.sesiones[0].preguntas[1]).toMatchObject({ hecha: true, respuesta: "Aprueba la gerente" });
  });

  it("una «ya respondida» de una pregunta que ya no está no se ofrece", () => {
    const it2 = item({ tipo: "respondida", sesionId: "s1", preguntaId: "zz" }, { respuesta: "Algo" });
    const p = fusionarPropuestas(propuestaVacia(), conSesion(), [it2], corrida);
    expect(pendientes(p, conSesion())).toEqual([]);
  });
});

describe("lo averiguado va a Información del cliente", () => {
  it("marcar y anotar lo averiguado lo devuelve para la ficha", () => {
    const r = aplicarOperaciones(conSesion(), propuestaVacia(), [{ op: "marcarPregunta", sesionId: "s1", preguntaId: "q2", hecha: true, respuesta: "La gerente" }]);
    expect(r.ok && r.averiguado).toEqual([{ sesionId: "s1", preguntaId: "q2", sesion: "Cómo venden", pregunta: "¿Quién aprueba descuentos?", respuesta: "La gerente" }]);
  });

  it("marcar sin anotar, o volver a guardar lo mismo, no manda nada", () => {
    const r1 = aplicarOperaciones(conSesion(), propuestaVacia(), [{ op: "marcarPregunta", sesionId: "s1", preguntaId: "q2", hecha: true }]);
    const r2 = aplicarOperaciones(conSesion(), propuestaVacia(), [{ op: "marcarPregunta", sesionId: "s1", preguntaId: "q1", hecha: true, respuesta: "Dos" }]);
    expect(r1.ok && r1.averiguado).toEqual([]);
    expect(r2.ok && r2.averiguado).toEqual([]);
  });

  it("anota a qué campos llegó, solo si la respuesta sigue siendo la que se mandó", () => {
    const c = conSesion();
    const ok = anotarFichaCampos(c, [{ preguntaId: "q1", respuesta: "Dos" }], ["herramientasActuales"]);
    const viejo = anotarFichaCampos(c, [{ preguntaId: "q1", respuesta: "Tres" }], ["herramientasActuales"]);
    expect(ok.sesiones[0].preguntas[0].fichaCampos).toEqual(["herramientasActuales"]);
    expect(viejo.sesiones[0].preguntas[0].fichaCampos).toBeUndefined();
  });

  it("cambiar lo averiguado borra la anotación vieja", () => {
    const c = anotarFichaCampos(conSesion(), [{ preguntaId: "q1", respuesta: "Dos" }], ["dolorPrincipal"]);
    const r = aplicarOperaciones(c, propuestaVacia(), [{ op: "marcarPregunta", sesionId: "s1", preguntaId: "q1", hecha: true, respuesta: "Tres" }]);
    expect(r.ok && r.contenido.sesiones[0].preguntas[0].fichaCampos).toBeUndefined();
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
    const ok = leerLaRespuesta({ respondidas: [{ preguntaId: "q2", respuesta: "La gerente", fuentes: [{ id: "R1", cita: "los descuentos los aprueba la gerente" }] }] }, fuentes, plan, "c", "x");
    const mal = leerLaRespuesta({ respondidas: [{ preguntaId: "q2", respuesta: "El dueño", fuentes: [{ id: "R1", cita: "los aprueba el dueño de la empresa" }] }] }, fuentes, plan, "c", "x");
    expect(ok.items).toHaveLength(1);
    expect(mal.items).toHaveLength(0);
    expect(mal.descartadas).toBe(1);
  });

  it("una fuente que no existe no respalda nada", () => {
    const r = leerLaRespuesta({ sesiones: [{ titulo: "Algo", objetivo: "", conQuien: "", preguntas: [], fuentes: [{ id: "Z9" }] }] }, fuentes, [], "c", "x");
    expect(r.items).toHaveLength(0);
  });

  it("⛔ lo que la guía vieja proponía (resultados, personas, trabas…) ya no se lee", () => {
    const r = leerLaRespuesta({ resultados: [{ que: "Vender más", fuentes: [{ id: "R1" }] }], personas: [{ nombre: "Ana", fuentes: [{ id: "R1" }] }] }, fuentes, [], "c", "x");
    expect(r.items).toEqual([]);
  });
});

describe("las sesiones reemplazan al informe para los que vienen después", () => {
  it("solo entra lo confirmado; las preguntas no hechas van como pendientes", () => {
    const t = guiaComoTexto(conSesion());
    expect(t).toContain("Lo que se averiguó");
    expect(t).toContain("Dos");
    expect(t).toContain("todavía no se hicieron");
  });

  it("loadCanvasContext de Exploración lee las sesiones primero", () => {
    const src = fs.readFileSync("lib/canvas/load-canvas-context.ts", "utf8");
    expect(src).toContain('canvasSlug === "exploration"');
    expect(src).toContain("textoDeLaGuia(projectId)");
  });

  it("lee lo guardado con tolerancia: basura no rompe la pantalla, y las listas viejas se ignoran", () => {
    expect(leerContenido({ sesiones: [{ id: 1 }, "x"], personas: [{ id: "p", nombre: "Ana" }], escala: { "1.1": { nivel: "F" } } })).toEqual(contenidoVacio());
  });

  it("una propuesta guardada de la guía vieja (persona, resultado…) no se ofrece", () => {
    const p = leerPropuesta({ items: [{ id: "p-1", destino: { tipo: "persona" }, valor: { nombre: "Ana" }, fuentes: [] }] });
    expect(p.items).toEqual([]);
  });
});

describe("la próxima sesión y las letras", () => {
  it("la próxima es la primera con preguntas sin hacer", () => {
    const c = conSesion();
    expect(proximaSesion(c)?.id).toBe("s1");
    c.sesiones[0].preguntas[1].hecha = true;
    expect(proximaSesion(c)).toBeNull();
  });

  it("cada objetivo tiene su letra; la escala dice su dimensión", () => {
    expect(letraDelObjetivo("ventas")?.letra).toBe("V");
    expect(letraDelObjetivo("escala:1.3")?.letra).toBe("E");
    expect(dimensionDelObjetivo("escala:1.3")).toBe("1.3");
    expect(letraDelObjetivo("otra cosa")).toBeNull();
  });
});
