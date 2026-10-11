/**
 * lib/exploraciones/a-la-ficha.test.ts — lo que sabe la preventa, a la propuesta de la ficha, sin IA.
 * Correr: `npx vitest run --project unit lib/exploraciones/a-la-ficha.test.ts`.
 */
import { describe, expect, it } from "vitest";
import {
  fichaParaLaMemoria,
  fichaVacia,
  fusionarPropuesta,
  origenDeLaFuente,
  stakeholdersSinPostura,
  valoresVacios,
  type FichaGuardada,
} from "@/lib/clients/ficha";
import {
  aportesDeLaPreparacion,
  CASILLA_A_LA_FICHA,
  fuenteDeLaPreventa,
  lineasDeLaCasilla,
  loNuevoParaLaFicha,
  ORIGEN_DE_LA_PREVENTA,
  propuestaParaLaFicha,
  type AporteALaFicha,
} from "./a-la-ficha";
import { contenidoVacio, propuestaVacia, type EstadoDeExploracion, type ItemPropuesto } from "./contenido";

const confirmada = (v: Partial<ReturnType<typeof valoresVacios>> = {}): FichaGuardada => ({
  ...fichaVacia(),
  valores: { ...valoresVacios(), ...v },
  confirmadaAt: "2026-09-27T12:00:00.000Z",
  confirmadaPor: "Ana",
});

const aporte = (casilla: AporteALaFicha["casilla"], valor: unknown): AporteALaFicha => ({ casilla, valor, fuente: fuenteDeLaPreventa(casilla, "preparacion") });

describe("el mapa casilla → campo", () => {
  it("las metas van a los retos, nunca a «Resultados que persigue» (sale de los resultados de los proyectos)", () => {
    expect(CASILLA_A_LA_FICHA.metas).toBe("retosEstrategicos");
    expect(Object.values(CASILLA_A_LA_FICHA)).not.toContain("resultadosQuePersigue");
  });

  it("cada casilla dice qué le suma a su campo", () => {
    expect(lineasDeLaCasilla("radiografia", { resumen: "Distribuidora de repuestos", sector: "Automotriz", modelos: ["b2b", "ecommerce"] })).toEqual([
      "Distribuidora de repuestos",
      "Sector: Automotriz",
      "Modelo de negocio: B2B, E-commerce",
    ]);
    expect(lineasDeLaCasilla("hubspotActual", "  Salesforce para ventas  ")).toEqual(["Salesforce para ventas"]);
    expect(lineasDeLaCasilla("retos", [{ texto: "Pierden leads después de la feria" }])).toEqual(["- Pierden leads después de la feria"]);
    expect(lineasDeLaCasilla("metas", { que: "Cierres al mes", actual: "40", objetivo: "80", para: "marzo" })).toEqual([
      "- Meta: Cierres al mes · hoy: 40 · meta: 80 · para: marzo",
    ]);
    expect(lineasDeLaCasilla("consecuencias", "Siguen perdiendo la temporada")).toEqual(["- Si no actúa: Siguen perdiendo la temporada"]);
    expect(lineasDeLaCasilla("implicaciones", ["Duplican los cierres"])).toEqual(["- Si lo logra: Duplican los cierres"]);
    expect(lineasDeLaCasilla("apertura", { valor: "si" })).toEqual(["alta"]);
    expect(lineasDeLaCasilla("apertura", { valor: "no_se" })).toEqual([]);
  });

  it("⛔ una persona sin cargo no deja pasar su postura: siempre cuatro partes, y el recorte del cliente corta la cuarta", () => {
    const [linea] = lineasDeLaCasilla("autoridad", { nombre: "Ana", rol: "firma", nota: "SECRETO-POSTURA no confía en consultoras" });
    expect(linea).toBe("- Ana — cargo sin confirmar — Aprueba — SECRETO-POSTURA no confía en consultoras");
    expect(stakeholdersSinPostura(linea)).not.toMatch(/SECRETO/);
    // Sin postura, «sin dato»: con tres partes el recorte dejaría solo el nombre.
    expect(lineasDeLaCasilla("autoridad", { nombre: "Ana", cargo: "Gerente", rol: "firma" })).toEqual(["- Ana — Gerente — Aprueba — sin dato"]);
  });
});

describe("propuestaParaLaFicha: suma lo nuevo a lo que la ficha ya tiene", () => {
  it("parte de lo propuesto (o de lo confirmado) y no repite lo que ya dice", () => {
    const ficha = confirmada({ retosEstrategicos: "- Pierden leads después de la feria" });
    const r = propuestaParaLaFicha(ficha, [aporte("retos", { texto: "Pierden leads después de la feria" }), aporte("retos", { texto: "No saben qué campaña funciona" })]);
    expect(r).toEqual([
      {
        clave: "retosEstrategicos",
        valor: "- Pierden leads después de la feria\n- No saben qué campaña funciona",
        fuentes: ["Preventa · Preparación · Retos"],
        interno: false,
      },
    ]);
  });

  it("⛔ la radiografía y «quién decide» marcan su campo como interno: no le llegan al handoff hasta que se confirman", () => {
    /* Caen en «A qué se dedica» y en las personas, que son campos que ven el cliente y el handoff. La marca iba solo en
       el texto de la fuente y nadie la aplicaba: el handoff recibía «quién decide», que la preventa le prohíbe. La
       edición que la pone en rojo: dejar de mandar `interno`, o que `fichaParaLaMemoria` deje de mirarlo. */
    const nuevos = propuestaParaLaFicha(fichaVacia(), [
      aporte("radiografia", { resumen: "SECRETO-RADIOGRAFIA distribuidora" }),
      aporte("autoridad", { nombre: "Ana", cargo: "Gerente", rol: "firma", nota: "SECRETO-POSTURA" }),
      aporte("hubspotActual", "Salesforce para ventas"),
    ]);
    expect(Object.fromEntries(nuevos.map((n) => [n.clave, n.interno]))).toEqual({
      aQueSeDedica: true,
      stakeholders: true,
      herramientasActuales: false,
    });
    const { ficha } = fusionarPropuesta(fichaVacia(), nuevos, ORIGEN_DE_LA_PREVENTA);
    const handoff = fichaParaLaMemoria(ficha, { alcance: "sin-lo-interno", excluirOrigenes: ["Handoff"] });
    expect(handoff).not.toMatch(/SECRETO|Ana/);
    expect(handoff).toContain("Salesforce para ventas");
    // Un agente interno sí lo lee, con su fuente.
    expect(fichaParaLaMemoria(ficha, { alcance: "interno" })).toContain("SECRETO-RADIOGRAFIA");
  });

  it("sin nada nuevo, nada", () => {
    const ficha = confirmada({ herramientasActuales: "Salesforce para ventas" });
    expect(propuestaParaLaFicha(ficha, [aporte("hubspotActual", "salesforce para ventas")])).toEqual([]);
  });

  it("la apertura reemplaza (es una lista) y su porqué va a «Por qué esa apertura»", () => {
    const r = propuestaParaLaFicha(fichaVacia(), [aporte("apertura", { valor: "no", porQue: "Quieren solo la configuración" })]);
    expect(r.map((x) => [x.clave, x.valor])).toEqual([
      ["aperturaAsesoria", "baja"],
      ["porQueApertura", "Quieren solo la configuración"],
    ]);
  });

  it("al fusionar, el campo queda con origen «Preventa» y la fuente lo dice", () => {
    const nuevos = propuestaParaLaFicha(fichaVacia(), [aporte("radiografia", { resumen: "Distribuidora de repuestos" }), aporte("detonante", "Llenó el diagnóstico la semana pasada")]);
    const { ficha, cambiados } = fusionarPropuesta(fichaVacia(), nuevos, ORIGEN_DE_LA_PREVENTA);
    expect(cambiados.sort()).toEqual(["aQueSeDedica", "motivacionCompra"]);
    expect(ficha.propuesta?.origenPorCampo?.aQueSeDedica).toEqual(["Preventa"]);
    expect(ficha.propuesta?.fuentesPorCampo.aQueSeDedica?.[0]).toBe("Preventa · Preparación · Radiografía de la empresa (investigación en internet; interno de la preventa)");
    // La ficha reconoce la etiqueta aunque falte el origen por campo (propuestas de antes).
    expect(origenDeLaFuente(ficha.propuesta!.fuentesPorCampo.aQueSeDedica![0])).toBe("Preventa");
  });

  it("⛔ lo propuesto por la preventa no le llega al cliente, ni a la preventa misma por la memoria", () => {
    const nuevos = propuestaParaLaFicha(fichaVacia(), [aporte("detonante", "SECRETO-PORQUE-AHORA"), aporte("hubspotActual", "SECRETO-CRM")]);
    const { ficha } = fusionarPropuesta(fichaVacia(), nuevos, ORIGEN_DE_LA_PREVENTA);
    expect(fichaParaLaMemoria(ficha, { alcance: "cliente" })).not.toMatch(/SECRETO/);
    expect(fichaParaLaMemoria(ficha, { alcance: "interno", excluirOrigenes: ["Exploración", "Preventa"] })).not.toMatch(/SECRETO/);
    // La motivación es interna: el handoff (sin lo interno) no la lee; lo que ve el cliente, sí lo propuesto, no.
    expect(fichaParaLaMemoria(ficha, { alcance: "sin-lo-interno" })).not.toMatch(/SECRETO-PORQUE-AHORA/);
  });
});

describe("de dónde salen los aportes", () => {
  const item = (id: string, clave: string, valor: unknown, fuente = "N0"): ItemPropuesto => ({
    id,
    destino: { tipo: "casilla", clave } as ItemPropuesto["destino"],
    valor,
    fuentes: [{ id: fuente, etiqueta: "x", cita: "y" }],
    corridaId: "run-1",
    en: "2026-10-10T12:00:00.000Z",
  });

  it("al preparar: solo las casillas con campo, sin lo descartado ni lo que no tiene una pista del cliente", () => {
    const aportes = aportesDeLaPreparacion(
      [
        item("rad", "radiografia", { resumen: "Distribuidora" }, "W1"),
        item("ret-sin-pista", "retos", { texto: "Un reto de su industria" }, "W2"),
        item("ret", "retos", { texto: "Pierden leads" }, "N0"),
        item("desc", "hubspotActual", "Excel", "E0"),
        item("pres", "presupuesto", "50 mil", "N0"),
      ],
      ["desc"],
    );
    expect(aportes.map((a) => a.casilla)).toEqual(["radiografia", "retos"]);
    expect(aportes.every((a) => a.fuente.startsWith("Preventa · Preparación"))).toBe(true);
  });

  it("al confirmar en el lienzo: lo que está ahora y no estaba antes", () => {
    const estado = (casillas: Record<string, unknown>): EstadoDeExploracion => ({
      contenido: { ...contenidoVacio(), casillas: casillas as EstadoDeExploracion["contenido"]["casillas"] },
      propuesta: propuestaVacia(),
      areas: [],
      edicion: null,
      perfilCierre: null,
      perfilDespues: null,
      responsableEmail: null,
      archivada: false,
    });
    const antes = estado({ retos: [{ texto: "Pierden leads" }], hubspotActual: "Excel" });
    const despues = estado({ retos: [{ texto: "Pierden leads" }, { texto: "No miden campañas" }], hubspotActual: "Excel", presupuesto: "SECRETO" });
    const nuevos = loNuevoParaLaFicha(antes, despues);
    expect(nuevos).toEqual([{ casilla: "retos", valor: { texto: "No miden campañas" }, fuente: "Preventa · Lo que se confirmó · Retos" }]);
  });
});
