import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  CAMPOS_DE_LA_FICHA,
  CAMPOS_EN_PROPIEDAD,
  CAMPOS_QUE_PROPONE_LA_IA,
  PREFIJO_PROPIEDAD,
  camposPropuestos,
  camposQueCambiaron,
  conservarLoEscrito,
  cuerpoDeLaNota,
  escrituraEnHubspot,
  fusionarPropuesta,
  fichaParaPrompt,
  fichaVacia,
  leerFicha,
  propiedadesParaHubspot,
  quitarDeLaPropuesta,
  textoAHtml,
  validarValores,
  valorVigente,
  valoresVacios,
  type FichaGuardada,
} from "./ficha";

function fichaConfirmada(valores: Partial<ReturnType<typeof valoresVacios>>): FichaGuardada {
  return { ...fichaVacia(), valores: { ...valoresVacios(), ...valores }, confirmadaAt: "2026-09-27T12:00:00.000Z", confirmadaPor: "Ana" };
}

describe("la ficha: definición", () => {
  it("las propiedades de HubSpot son únicas y todas llevan el prefijo de Nexus", () => {
    const props = CAMPOS_DE_LA_FICHA.flatMap((c) => (c.destino.tipo === "nota" ? [] : [c.destino.propiedad]));
    expect(new Set(props).size).toBe(props.length);
    for (const p of props) expect(p.startsWith(PREFIJO_PROPIEDAD), p).toBe(true);
    // Lo aprobado con Elías: 7 de texto con formato + 1 lista; lo demás, a la nota.
    expect(CAMPOS_DE_LA_FICHA.filter((c) => c.destino.tipo === "texto")).toHaveLength(7);
    expect(CAMPOS_DE_LA_FICHA.filter((c) => c.destino.tipo === "lista")).toHaveLength(1);
  });

  it("⛔ apertura, su porqué, motivación y oportunidades son internos", () => {
    const internos = CAMPOS_DE_LA_FICHA.filter((c) => !c.alCliente).map((c) => c.clave).sort();
    expect(internos).toEqual(["aperturaAsesoria", "motivacionCompra", "oportunidadesFuturas", "porQueApertura"]);
  });
});

describe("validarValores", () => {
  it("limpia espacios y normaliza saltos de línea", () => {
    const r = validarValores({ dolorPrincipal: "  pierde leads\r\n- uno  " });
    expect(r.ok && r.valores.dolorPrincipal).toBe("pierde leads\n- uno");
  });
  it("la apertura solo acepta una opción de la lista", () => {
    expect(validarValores({ aperturaAsesoria: "muchísima" }).ok).toBe(false);
    expect(validarValores({ aperturaAsesoria: "media" }).ok).toBe(true);
    expect(validarValores({ aperturaAsesoria: "" }).ok).toBe(true);
  });
  it("rechaza lo que no es texto", () => {
    expect(validarValores({ stakeholders: 3 }).ok).toBe(false);
    expect(validarValores(null).ok).toBe(false);
  });
});

describe("textoAHtml (lo que ve HubSpot)", () => {
  it("viñetas, numeradas, negrita y párrafos", () => {
    expect(textoAHtml("Intro\n\n- **Ana** — gerente\n- Luis\n\n1. uno\n2. dos")).toBe(
      "<p>Intro</p><ul><li><strong>Ana</strong> — gerente</li><li>Luis</li></ul><ol><li>uno</li><li>dos</li></ol>",
    );
  });
  it("escapa el HTML que escribe el CSE", () => {
    expect(textoAHtml("<script>x</script> & co")).toBe("<p>&lt;script&gt;x&lt;/script&gt; &amp; co</p>");
  });
  it("líneas seguidas quedan en el mismo párrafo con salto", () => {
    expect(textoAHtml("uno\ndos")).toBe("<p>uno<br>dos</p>");
  });
  it("cursiva y títulos", () => {
    expect(textoAHtml("## Título\n*ojo*")).toBe("<p><strong>Título</strong><br><em>ojo</em></p>");
  });
  it("vacío es vacío (limpia la propiedad)", () => {
    expect(textoAHtml("")).toBe("");
  });
});

describe("propiedadesParaHubspot", () => {
  it("solo escribe propiedades, nunca lo que va a la nota", () => {
    const v = { ...valoresVacios(), dolorPrincipal: "x", motivacionCompra: "precio", aperturaAsesoria: "alta" };
    const props = propiedadesParaHubspot(v, ["dolorPrincipal", "motivacionCompra", "aperturaAsesoria"]);
    expect(props).toEqual({ nexus_dolor_principal: "<p>x</p>", nexus_apertura_asesoria: "alta" });
  });
});

describe("camposQueCambiaron", () => {
  it("compara sin espacios de borde, en el orden de la ficha", () => {
    const a = valoresVacios();
    const b = { ...a, stakeholders: "Ana", aQueSeDedica: "x ", dolorPrincipal: "" };
    expect(camposQueCambiaron(a, b)).toEqual(["aQueSeDedica", "stakeholders"]);
  });
});

describe("escrituraEnHubspot: qué viaja al confirmar", () => {
  const base = { primeraVez: false, cambios: [] as const, hayEmpresa: true };
  it("la primera vez viaja todo, con nota", () => {
    expect(escrituraEnHubspot({ ...base, primeraVez: true, estadoPrevio: null })).toEqual({
      alDia: false,
      aEscribir: CAMPOS_EN_PROPIEDAD,
      conNota: true,
    });
  });
  it("al día y sin cambios no hay nada que escribir", () => {
    expect(escrituraEnHubspot({ ...base, estadoPrevio: "sincronizada" })).toMatchObject({ alDia: true, conNota: false });
  });
  it("al día con cambios viaja solo lo que cambió, con nota", () => {
    expect(escrituraEnHubspot({ ...base, cambios: ["dolorPrincipal"], estadoPrevio: "sincronizada" })).toEqual({
      alDia: true,
      aEscribir: ["dolorPrincipal"],
      conNota: true,
    });
  });
  /* El caso que se perdía: la primera confirmación falla en HubSpot (sin propiedades creadas) y se
     reintenta sin cambios. La nota ni se intentó, así que «Por qué esa apertura» y «Motivación de
     compra» no quedaban en ningún lado de HubSpot aunque el estado dijera «sincronizada». La
     edición que la pone en rojo: volver a `conNota: primeraVez || cambios > 0 || previo === "parcial"`. */
  it.each(["fallo", "parcial"] as const)("reintento sin cambios tras «%s»: viaja todo Y la nota", (estadoPrevio) => {
    expect(escrituraEnHubspot({ ...base, estadoPrevio })).toEqual({ alDia: false, aEscribir: CAMPOS_EN_PROPIEDAD, conNota: true });
  });
  it("la empresa se vinculó después: viaja todo y la nota", () => {
    expect(escrituraEnHubspot({ ...base, estadoPrevio: "sin_empresa", hayEmpresa: true })).toMatchObject({ alDia: false, conNota: true });
    expect(escrituraEnHubspot({ ...base, estadoPrevio: "sin_empresa", hayEmpresa: false })).toMatchObject({ alDia: true, conNota: false });
  });
  it("las propiedades no llevan los campos internos (esos van solo en la nota)", () => {
    const internos = CAMPOS_DE_LA_FICHA.filter((c) => c.destino.tipo === "nota").map((c) => c.clave);
    expect(internos.length).toBeGreaterThan(0);
    for (const k of internos) expect(CAMPOS_EN_PROPIEDAD).not.toContain(k);
  });
});

describe("la nota", () => {
  it("lleva quién, qué cambió, la apertura, su porqué, la motivación y las fuentes", () => {
    const html = cuerpoDeLaNota({
      autor: "Ana <CSE>",
      cambios: ["dolorPrincipal"],
      primeraVez: false,
      valores: { ...valoresVacios(), aperturaAsesoria: "baja", porQueApertura: "pidió solo configurar", motivacionCompra: "- precio" },
      fuentes: ["Sesión de exploración del 12-sep"],
    });
    expect(html).toContain("Ana &lt;CSE&gt;");
    expect(html).toContain("<li>Dolor principal</li>");
    expect(html).toContain("Apertura a la asesoría:</strong> Baja");
    expect(html).toContain("pidió solo configurar");
    expect(html).toContain("<li>precio</li>");
    expect(html).toContain("<li>Sesión de exploración del 12-sep</li>");
  });
});

describe("fichaParaPrompt", () => {
  const ficha = fichaConfirmada({
    aQueSeDedica: "Fundación universitaria",
    stakeholders: "- Ana — directora — sponsor — escéptica",
    aperturaAsesoria: "baja",
    motivacionCompra: "Se lo pidió la rectoría",
    oportunidadesFuturas: "Service Hub",
  });

  it("⛔ para un documento del cliente no entra NADA interno", () => {
    const t = fichaParaPrompt(ficha, { paraDocumentoDelCliente: true });
    expect(t).toContain("Fundación universitaria");
    expect(t).not.toContain("Baja");
    expect(t).not.toContain("rectoría");
    expect(t).not.toContain("Service Hub");
    expect(t).toContain("NUNCA la postura");
  });

  it("para uso interno entra todo, marcado", () => {
    const t = fichaParaPrompt(ficha, { paraDocumentoDelCliente: false });
    expect(t).toContain("Apertura a la asesoría (INTERNO — nunca se cita al cliente)\nBaja");
    expect(t).toContain("rectoría");
  });

  it("sin confirmar, el agente no recibe nada (ni una propuesta)", () => {
    const sin: FichaGuardada = {
      ...fichaVacia(),
      propuesta: { valores: { dolorPrincipal: "x" }, fuentes: [], fuentesPorCampo: {}, at: "", origen: "" },
    };
    expect(fichaParaPrompt(sin, { paraDocumentoDelCliente: false })).toBe("");
  });
});

describe("fusionarPropuesta: la propuesta ACUMULA", () => {
  const confirmada = fichaConfirmada({ dolorPrincipal: "- pierde leads" });

  it("la primera fuente crea la propuesta con sus fuentes por campo", () => {
    const r = fusionarPropuesta(
      confirmada,
      [{ clave: "retosEstrategicos", valor: "- crecer 20 %", fuentes: ["Sesión «A» del 1 sept"] }],
      "Sesiones",
    );
    expect(r.cambiados).toEqual(["retosEstrategicos"]);
    expect(r.ficha.propuesta?.valores.retosEstrategicos).toBe("- crecer 20 %");
    expect(r.ficha.propuesta?.fuentesPorCampo.retosEstrategicos).toEqual(["Sesión «A» del 1 sept"]);
    expect(r.ficha.propuesta?.origen).toBe("Sesiones");
    // Lo confirmado no se toca: solo la propuesta.
    expect(r.ficha.valores).toEqual(confirmada.valores);
  });

  it("una segunda fuente suma sin borrar lo que propuso la primera", () => {
    const a = fusionarPropuesta(confirmada, [{ clave: "retosEstrategicos", valor: "- crecer", fuentes: ["S-A"] }], "Sesiones").ficha;
    const b = fusionarPropuesta(
      a,
      [
        { clave: "retosEstrategicos", valor: "- crecer\n- abrir Panamá", fuentes: ["S-B"] },
        { clave: "stakeholders", valor: "- Ana — CEO", fuentes: ["S-B"] },
      ],
      "Handoff",
    );
    expect(b.ficha.propuesta?.valores).toEqual({ retosEstrategicos: "- crecer\n- abrir Panamá", stakeholders: "- Ana — CEO" });
    expect(b.ficha.propuesta?.fuentesPorCampo.retosEstrategicos).toEqual(["S-A", "S-B"]);
    expect(b.ficha.propuesta?.fuentes).toEqual(["S-A", "S-B"]);
    expect(b.ficha.propuesta?.origen).toBe("Varias fuentes");
  });

  it("descarta lo que no aporta: igual a lo vigente, vacío, clave inventada o apertura fuera de lista", () => {
    const r = fusionarPropuesta(
      confirmada,
      [
        { clave: "dolorPrincipal", valor: "- pierde leads  ", fuentes: ["x"] },
        { clave: "stakeholders", valor: "   ", fuentes: ["x"] },
        { clave: "presupuesto", valor: "mucho", fuentes: ["x"] },
        { clave: "aperturaAsesoria", valor: "altísima", fuentes: ["x"] },
      ],
      "Sesiones",
    );
    expect(r.cambiados).toEqual([]);
    expect(r.ficha).toBe(confirmada);
  });

  it("camposPropuestos cuenta solo lo que cambiaría algo confirmado", () => {
    const r = fusionarPropuesta(confirmada, [{ clave: "aperturaAsesoria", valor: "alta", fuentes: ["x"] }], "Sesiones");
    expect(camposPropuestos(r.ficha)).toEqual(["aperturaAsesoria"]);
    expect(camposPropuestos(confirmada)).toEqual([]);
  });

  it("«Resultados que persigue» sale de los resultados de cada proyecto: la IA de la ficha no lo propone, ni lo viejo cuenta", () => {
    const r = fusionarPropuesta(confirmada, [{ clave: "resultadosQuePersigue", valor: "- vender más", fuentes: ["S-A"] }], "Sesiones");
    expect(r.cambiados).toEqual([]);
    const conVieja: FichaGuardada = {
      ...confirmada,
      propuesta: { valores: { resultadosQuePersigue: "- vender más" }, fuentes: [], fuentesPorCampo: {}, at: "", origen: "Handoff" },
    };
    expect(camposPropuestos(conVieja)).toEqual([]);
    expect(valorVigente(conVieja, "resultadosQuePersigue")).toBe("");
    expect(CAMPOS_QUE_PROPONE_LA_IA.some((c) => c.clave === "resultadosQuePersigue")).toBe(false);
  });

  it("va primero en «Lo que busca», arriba de los retos", () => {
    const busca = CAMPOS_DE_LA_FICHA.filter((c) => c.grupo === "busca").map((c) => c.clave);
    expect(busca.slice(0, 2)).toEqual(["resultadosQuePersigue", "retosEstrategicos"]);
  });
});

describe("leerFicha", () => {
  it("tolera null, basura y claves desconocidas", () => {
    expect(leerFicha(null)).toEqual(fichaVacia());
    expect(leerFicha("x")).toEqual(fichaVacia());
    const f = leerFicha({ valores: { dolorPrincipal: "d", otra: "z", stakeholders: 4 }, confirmadaAt: "2026-01-01" });
    expect(f.valores.dolorPrincipal).toBe("d");
    expect((f.valores as Record<string, unknown>).otra).toBeUndefined();
    expect(f.valores.stakeholders).toBe("");
    expect(f.confirmadaAt).toBe("2026-01-01");
  });
});

/* 2026-09-28 — auditoría de estados colgados tras el deploy. */
describe("quitarDeLaPropuesta: el «Descartar» de un campo se guarda", () => {
  /* Vivía solo en la pantalla: el número de la pestaña no se apagaba nunca y la propuesta
     reaparecía al volver. La edición que la pone en rojo: no borrar la clave de `valores`. */
  const conPropuesta = (): FichaGuardada => ({
    ...fichaConfirmada({}),
    propuesta: {
      valores: { dolorPrincipal: "- pierde leads", stakeholders: "Ana" },
      fuentes: ["Sesión del 12-sep"],
      fuentesPorCampo: { dolorPrincipal: ["Sesión del 12-sep"], stakeholders: ["Encuesta"] },
      at: "2026-09-27T12:00:00.000Z",
      origen: "Sesiones",
    },
  });
  it("quita el campo y sus fuentes, y deja los demás", () => {
    const f = quitarDeLaPropuesta(conPropuesta(), ["dolorPrincipal"]);
    expect(f.propuesta?.valores).toEqual({ stakeholders: "Ana" });
    expect(f.propuesta?.fuentesPorCampo).toEqual({ stakeholders: ["Encuesta"] });
    expect(camposPropuestos(f)).toEqual(["stakeholders"]);
  });
  it("sin campos propuestos, la propuesta se va entera (el número se apaga)", () => {
    const f = quitarDeLaPropuesta(conPropuesta(), ["dolorPrincipal", "stakeholders"]);
    expect(f.propuesta).toBeNull();
    expect(camposPropuestos(f)).toEqual([]);
  });
  it("la ruta lo acepta y lo guarda", () => {
    const ruta = fs.readFileSync(path.join(__dirname, "..", "..", "app", "api", "clients", "[id]", "ficha", "route.ts"), "utf8");
    expect(ruta).toContain("Array.isArray(body?.descartarCampos)");
    expect(ruta).toContain("quitarDeLaPropuesta(actual, claves)");
  });
});

describe("conservarLoEscrito: «Actualizar con IA» no pisa lo que escribiste mientras esperabas", () => {
  /* Se comparaba contra el borrador del momento del clic, así que lo escrito durante la espera (hasta
     un minuto) desaparecía. La edición que la pone en rojo: comparar contra `alClic` en vez de
     `enPantalla`, o devolver `base` sin mezclar. */
  it("lo escrito antes o durante la espera gana sobre la ficha nueva; lo demás viene de la IA", () => {
    const alClic = { ...valoresVacios(), dolorPrincipal: "viejo" };
    const enPantalla = { ...alClic, stakeholders: "Ana (escrito mientras esperaba)" };
    const base = { ...valoresVacios(), dolorPrincipal: "nuevo de la IA", stakeholders: "", aQueSeDedica: "de la IA" };
    const r = conservarLoEscrito(alClic, enPantalla, base);
    expect(r.stakeholders).toBe("Ana (escrito mientras esperaba)");
    expect(r.dolorPrincipal).toBe("nuevo de la IA");
    expect(r.aQueSeDedica).toBe("de la IA");
  });
  it("sin nada escrito, queda la ficha nueva tal cual", () => {
    const v = valoresVacios();
    const base = { ...v, dolorPrincipal: "de la IA" };
    expect(conservarLoEscrito(v, v, base)).toBe(base);
  });
});
