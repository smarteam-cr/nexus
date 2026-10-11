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
  camposDeLaReunion,
  conDecisiones,
  conHistoria,
  conservarLoEscrito,
  conteoDeLaFicha,
  cuerpoDeLaNota,
  decisionesAlConfirmar,
  decisionesAlDescartar,
  decisionesDeLaReunion,
  etiquetaDeSesion,
  fuenteEsDeLaReunion,
  MAX_DECISIONES,
  escrituraEnHubspot,
  fusionarPropuesta,
  fichaParaLaMemoria,
  fichaParaPrompt,
  fichaVacia,
  historiaAlConfirmar,
  leerFicha,
  MARCA_DE_LO_INTERNO,
  ORIGEN_A_MANO,
  ORIGEN_DESCONOCIDO,
  origenesDelCampo,
  propiedadesParaHubspot,
  propuestaConLoInterno,
  propuestaExcluida,
  quitarDeLaPropuesta,
  stakeholdersSinPostura,
  textoAHtml,
  validarValores,
  valorVigente,
  valoresVacios,
  VERSION_DE_LA_FICHA,
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

describe("lo que se decidió de cada campo propuesto (lib/lo-propuesto)", () => {
  const AHORA = "2026-10-09T18:00:00.000Z";
  const conPropuesta = (): FichaGuardada => ({
    ...fichaConfirmada({ dolorPrincipal: "viejo", retosEstrategicos: "crecer" }),
    propuesta: {
      valores: { dolorPrincipal: "nuevo", retosEstrategicos: "crecer en México", aQueSeDedica: "Vende acero" },
      fuentes: ["Sesión «Seguimiento» del 9 oct 2026"],
      fuentesPorCampo: {
        dolorPrincipal: ["Sesión «Seguimiento» del 9 oct 2026"],
        retosEstrategicos: ["Handoff de «Implementación»"],
        aQueSeDedica: ["Sesión «Seguimiento» del 9 oct 2026"],
      },
      at: "2026-10-09T16:00:00.000Z",
      origen: "Sesiones",
    },
  });

  it("al confirmar: igual a lo propuesto = usado; igual a lo de antes = desestimado; otra cosa = usado con cambios", () => {
    const antes = conPropuesta();
    const confirmados = { ...antes.valores, dolorPrincipal: "nuevo", retosEstrategicos: "crecer", aQueSeDedica: "Vende acero y aluminio" };
    const d = decisionesAlConfirmar(antes, confirmados, "Ana@Smarteamcr.com", AHORA);
    const porClave = Object.fromEntries(d.map((x) => [x.clave, x.estado]));
    expect(porClave).toEqual({ dolorPrincipal: "usado", retosEstrategicos: "desestimado", aQueSeDedica: "usado_con_cambios" });
    expect(d[0].por).toBe("ana@smarteamcr.com");
    expect(d.find((x) => x.clave === "dolorPrincipal")).toMatchObject({ valor: "nuevo", fuentes: ["Sesión «Seguimiento» del 9 oct 2026"], propuestaAt: "2026-10-09T16:00:00.000Z" });
  });

  it("descartar anota con el correo, solo lo que estaba propuesto", () => {
    const d = decisionesAlDescartar(conPropuesta(), ["dolorPrincipal", "stakeholders"], "cse@x", AHORA);
    expect(d).toHaveLength(1);
    expect(d[0]).toMatchObject({ clave: "dolorPrincipal", estado: "desestimado", por: "cse@x", en: AHORA });
  });

  it("leerFicha conserva las decisiones (y descarta las que no se entienden)", () => {
    const f = conDecisiones(conPropuesta(), decisionesAlDescartar(conPropuesta(), ["dolorPrincipal"], "cse@x", AHORA));
    const leida = leerFicha(JSON.parse(JSON.stringify({ ...f, decisiones: [...f.decisiones!, { clave: "otra", estado: "usado", por: "x", en: AHORA }] })));
    expect(leida.decisiones).toHaveLength(1);
    expect(leida.decisiones![0]).toMatchObject({ clave: "dolorPrincipal", estado: "desestimado", por: "cse@x" });
    // Sin decisiones guardadas, no aparece la clave.
    expect("decisiones" in leerFicha(JSON.parse(JSON.stringify(fichaVacia())))).toBe(false);
  });

  it("el registro guarda los más nuevos, hasta el tope", () => {
    const una = decisionesAlDescartar(conPropuesta(), ["dolorPrincipal"], "cse@x", AHORA)[0];
    let f = fichaVacia();
    for (let i = 0; i < MAX_DECISIONES + 5; i++) f = conDecisiones(f, [{ ...una, en: `n${i}` }]);
    expect(f.decisiones).toHaveLength(MAX_DECISIONES);
    expect(f.decisiones![MAX_DECISIONES - 1].en).toBe(`n${MAX_DECISIONES + 4}`);
  });
});

describe("la reunión de la que salió un campo propuesto", () => {
  const reunion = { title: "Seguimiento", date: "2026-10-09T15:00:00.000Z" };

  it("la etiqueta se arma a mano, en el día de Costa Rica", () => {
    expect(etiquetaDeSesion(reunion)).toBe("Sesión «Seguimiento» del 9 oct 2026");
    // 05:00 UTC del 10 oct = 9 oct de noche en Costa Rica.
    expect(etiquetaDeSesion({ title: null, date: "2026-10-10T05:00:00.000Z" })).toBe("Sesión «sin título» del 9 oct 2026");
  });

  it("encuentra la etiqueta en las formas de cada versión de Node", () => {
    for (const fecha of ["9 oct 2026", "9 oct. 2026", "9 de oct. de 2026", "9 Oct 2026"]) {
      expect(fuenteEsDeLaReunion(`Sesión «Seguimiento» del ${fecha}`, reunion), fecha).toBe(true);
    }
    expect(fuenteEsDeLaReunion("Sesión «Revisión» del 16 sept 2026", { title: "Revisión", date: "2026-09-16T15:00:00.000Z" })).toBe(true);
  });

  it("no confunde dos reuniones con títulos distintos el mismo día, ni la misma reunión otro día", () => {
    expect(fuenteEsDeLaReunion("Sesión «Kickoff» del 9 oct 2026", reunion)).toBe(false);
    expect(fuenteEsDeLaReunion("Sesión «Seguimiento» del 10 oct 2026", reunion)).toBe(false);
    expect(fuenteEsDeLaReunion("Handoff de «Seguimiento»", reunion)).toBe(false);
  });

  it("camposDeLaReunion: los propuestos que salieron de esa reunión; decisionesDeLaReunion: lo ya decidido de ella", () => {
    const f: FichaGuardada = {
      ...fichaVacia(),
      propuesta: {
        valores: { dolorPrincipal: "nuevo", retosEstrategicos: "crecer" },
        fuentes: [],
        fuentesPorCampo: { dolorPrincipal: ["Sesión «Seguimiento» del 9 oct. 2026"], retosEstrategicos: ["Sesión «Kickoff» del 9 oct 2026"] },
        at: "2026-10-09T16:00:00.000Z",
        origen: "Sesiones",
      },
    };
    expect(camposDeLaReunion(f, reunion)).toEqual(["dolorPrincipal"]);
    const conDecision = conDecisiones(f, decisionesAlDescartar(f, ["dolorPrincipal"], "cse@x", "2026-10-09T18:00:00.000Z"));
    expect(decisionesDeLaReunion(conDecision, reunion).map((d) => d.clave)).toEqual(["dolorPrincipal"]);
  });
});

/* 2026-10-09 — memoria de la cuenta, etapa 3: de dónde salió cada campo. */
describe("origenPorCampo: quién propuso cada campo", () => {
  const confirmada = fichaConfirmada({ dolorPrincipal: "- pierde leads" });

  it("fusionarPropuesta lo acumula por campo, como las fuentes", () => {
    const a = fusionarPropuesta(confirmada, [{ clave: "retosEstrategicos", valor: "- crecer", fuentes: ["Sesión «A» del 1 oct 2026"] }], "Sesiones").ficha;
    const b = fusionarPropuesta(
      a,
      [
        { clave: "retosEstrategicos", valor: "- crecer\n- abrir Panamá", fuentes: ["Handoff de «Impl»"] },
        { clave: "stakeholders", valor: "- Ana — CEO", fuentes: ["Handoff de «Impl»"] },
      ],
      "Handoff",
    ).ficha;
    expect(b.propuesta?.origenPorCampo).toEqual({ retosEstrategicos: ["Sesiones", "Handoff"], stakeholders: ["Handoff"] });
    expect(origenesDelCampo(b, "retosEstrategicos")).toEqual(["Sesiones", "Handoff"]);
  });

  it("quitarDeLaPropuesta lo borra con el campo", () => {
    const a = fusionarPropuesta(
      confirmada,
      [
        { clave: "retosEstrategicos", valor: "- crecer", fuentes: ["S"] },
        { clave: "stakeholders", valor: "- Ana", fuentes: ["S"] },
      ],
      "Sesiones",
    ).ficha;
    const f = quitarDeLaPropuesta(a, ["retosEstrategicos"]);
    expect(f.propuesta?.origenPorCampo).toEqual({ stakeholders: ["Sesiones"] });
  });

  it("leerFicha lo lee con tolerancia (falta o trae basura)", () => {
    const leida = leerFicha({
      propuesta: { valores: { dolorPrincipal: "x" }, fuentesPorCampo: {}, origenPorCampo: { dolorPrincipal: ["Handoff", 3], otra: ["x"] } },
    });
    expect(leida.propuesta?.origenPorCampo).toEqual({ dolorPrincipal: ["Handoff"] });
    expect("origenPorCampo" in (leerFicha({ propuesta: { valores: {} } }).propuesta ?? {})).toBe(false);
    expect(leerFicha({ propuesta: { valores: {}, origenPorCampo: "basura" } }).propuesta?.origenPorCampo).toBeUndefined();
  });

  it("una propuesta de antes: el origen sale de las etiquetas de las fuentes, o del origen si no dice «Varias fuentes»", () => {
    const vieja = (fuentes: string[], origen: string): FichaGuardada => ({
      ...fichaVacia(),
      propuesta: { valores: { dolorPrincipal: "x" }, fuentes, fuentesPorCampo: { dolorPrincipal: fuentes }, at: "", origen },
    });
    expect(origenesDelCampo(vieja(["Handoff de «Impl»"], "Varias fuentes"), "dolorPrincipal")).toEqual(["Handoff"]);
    expect(origenesDelCampo(vieja(["Sesión «A» del 1 oct 2026", "Encuesta de «Impl»"], "Varias fuentes"), "dolorPrincipal")).toEqual([
      "Sesiones",
      "Actualizar con IA",
    ]);
    expect(origenesDelCampo(vieja(["Exploración · S1 · lo que averiguó el CSE"], "x"), "dolorPrincipal")).toEqual(["Exploración"]);
    expect(origenesDelCampo(vieja(["Lo que dice HubSpot (lo cambiaron allá)"], "x"), "dolorPrincipal")).toEqual(["HubSpot"]);
    // Una fuente que no se reconoce suma «desconocido»: para excluir, no saber cuenta como sí.
    expect(origenesDelCampo(vieja(["Handoff de «Impl»", "Algo raro"], "Varias fuentes"), "dolorPrincipal")).toEqual(["Handoff", ORIGEN_DESCONOCIDO]);
    expect(origenesDelCampo(vieja([], "Handoff"), "dolorPrincipal")).toEqual(["Handoff"]);
    expect(origenesDelCampo(vieja([], "Varias fuentes"), "dolorPrincipal")).toEqual([ORIGEN_DESCONOCIDO]);
    // Un campo que no está propuesto no tiene origen.
    expect(origenesDelCampo(vieja([], "Handoff"), "stakeholders")).toEqual([]);
  });

  it("una propuesta de antes que suma una fuente nueva conserva lo que se deduce de ella", () => {
    const vieja: FichaGuardada = {
      ...fichaVacia(),
      propuesta: { valores: { dolorPrincipal: "x" }, fuentes: ["Handoff de «Impl»"], fuentesPorCampo: { dolorPrincipal: ["Handoff de «Impl»"] }, at: "", origen: "Handoff" },
    };
    const r = fusionarPropuesta(vieja, [{ clave: "dolorPrincipal", valor: "x y más", fuentes: ["Sesión «A» del 1 oct 2026"] }], "Sesiones");
    expect(r.ficha.propuesta?.origenPorCampo?.dolorPrincipal).toEqual(["Handoff", "Sesiones"]);
  });

  it("propuestaExcluida: lo propuesto por el lector, lo derivado de él y lo de origen desconocido", () => {
    const f: FichaGuardada = {
      ...fichaVacia(),
      propuesta: {
        valores: { dolorPrincipal: "a", retosEstrategicos: "b", aQueSeDedica: "c", stakeholders: "- d" },
        fuentes: [],
        fuentesPorCampo: { retosEstrategicos: ["Handoff de «Impl»"], aQueSeDedica: ["Sesión «A» del 1 oct 2026"], stakeholders: ["?"] },
        origenPorCampo: { dolorPrincipal: ["Handoff"], retosEstrategicos: ["Actualizar con IA"], aQueSeDedica: ["Sesiones"], stakeholders: [ORIGEN_DESCONOCIDO] },
        at: "",
        origen: "Varias fuentes",
      },
    };
    expect(propuestaExcluida(f, "dolorPrincipal", ["Handoff"])).toBe(true);
    expect(propuestaExcluida(f, "retosEstrategicos", ["Handoff"]), "derivado: una fuente del handoff").toBe(true);
    expect(propuestaExcluida(f, "stakeholders", ["Handoff"]), "desconocido").toBe(true);
    expect(propuestaExcluida(f, "aQueSeDedica", ["Handoff"])).toBe(false);
    // Sin exclusiones, nada queda afuera.
    expect(propuestaExcluida(f, "stakeholders", [])).toBe(false);
  });
});

describe("stakeholdersSinPostura: la postura se corta en código", () => {
  it("de cada viñeta se quedan nombre, cargo y papel", () => {
    expect(stakeholdersSinPostura("- **Ana** — directora — sponsor — escéptica\n* Luis – TI – usuario – a favor\n1. Marta - CFO - firma - indecisa")).toBe(
      "- **Ana** — directora — sponsor\n- Luis — TI — usuario\n- Marta — CFO — firma",
    );
  });
  it("lo que no es una viñeta no va (puede traer la postura en prosa)", () => {
    expect(stakeholdersSinPostura("Ana es escéptica y no confía en consultoras.\n- Ana — Directora — Sponsor — sin dato")).toBe(
      "- Ana — Directora — Sponsor",
    );
    expect(stakeholdersSinPostura("")).toBe("");
  });
  it("⛔ con menos de cuatro partes no se adivina cuál falta: solo el nombre", () => {
    /* La ficha pedía omitir lo que falta, y «Ana — gerente — no confía en consultoras» (sin papel) o «Ana — muy
       escéptica» quedaban enteras con el corte por posición. La edición que la pone en rojo: volver a `slice(0, 3)`. */
    expect(stakeholdersSinPostura("- Ana — gerente — SECRETO no confía en consultoras")).toBe("- Ana");
    expect(stakeholdersSinPostura("- Luis Pérez — SECRETO muy escéptico")).toBe("- Luis Pérez");
    expect(stakeholdersSinPostura("- Marta, CFO, SECRETO indecisa")).toBe("- Marta");
    expect(stakeholdersSinPostura("- Luis de la Torre")).toBe("- Luis de la Torre");
  });
  it("⛔ una viñeta que no empieza con un nombre no va, ni las sub-viñetas", () => {
    expect(stakeholdersSinPostura("- Ana es muy escéptica, SECRETO")).toBe("");
    expect(stakeholdersSinPostura("- Ana — Directora — Sponsor — sin dato\n  - Postura: SECRETO escéptica\n\t* SECRETO frena todo")).toBe(
      "- Ana — Directora — Sponsor",
    );
  });
});

describe("fichaParaPrompt: el diagnóstico y la planificación, hasta que lean la memoria", () => {
  it("⛔ para un documento del cliente, la postura se corta en código", () => {
    const f = fichaConfirmada({ stakeholders: "- Ana — Directora — Sponsor — SECRETO escéptica\n- Luis — SECRETO no confía" });
    const alCliente = fichaParaPrompt(f, { paraDocumentoDelCliente: true });
    expect(alCliente).not.toMatch(/SECRETO/);
    expect(alCliente).toContain("- Ana — Directora — Sponsor");
    expect(alCliente).toContain("- Luis");
    // Para un agente interno, entera.
    expect(fichaParaPrompt(f, { paraDocumentoDelCliente: false })).toContain("SECRETO escéptica");
  });
});

describe("lo interno de la preventa en un campo que ve el cliente (`internoPorCampo`)", () => {
  it("la marca queda pegada al campo aunque otra puerta lo reescriba, y se va al descartarlo", () => {
    const a = fusionarPropuesta(fichaVacia(), [{ clave: "stakeholders", valor: "- Ana — Gerente — Firma — sin dato", fuentes: ["Preventa · X"], interno: true }], "Preventa").ficha;
    expect(a.propuesta?.internoPorCampo).toEqual({ stakeholders: true });
    const b = fusionarPropuesta(a, [{ clave: "stakeholders", valor: "- Ana — Gerente — Firma — sin dato\n- Luis — TI — Usuario — sin dato", fuentes: ["Sesión «A» del 1 oct 2026"] }], "Sesiones").ficha;
    expect(propuestaConLoInterno(b, "stakeholders")).toBe(true);
    expect(propuestaConLoInterno(quitarDeLaPropuesta(b, ["stakeholders"]), "stakeholders")).toBe(false);
    // Sobrevive a guardarse y leerse.
    expect(leerFicha(JSON.parse(JSON.stringify(b))).propuesta?.internoPorCampo).toEqual({ stakeholders: true });
  });

  it("en una propuesta de antes, vale la marca de la fuente", () => {
    const f = fusionarPropuesta(fichaVacia(), [{ clave: "aQueSeDedica", valor: "Distribuidora", fuentes: [`Preventa · Preparación · Radiografía (${MARCA_DE_LO_INTERNO})`] }], "Preventa").ficha;
    expect(f.propuesta?.internoPorCampo).toBeUndefined();
    expect(propuestaConLoInterno(f, "aQueSeDedica")).toBe(true);
  });
});

describe("fichaParaLaMemoria: tres alcances", () => {
  const ficha: FichaGuardada = {
    ...fichaConfirmada({
      aQueSeDedica: "Fundación universitaria",
      stakeholders: "- Ana — directora — sponsor — POSTURA-SECRETA",
      aperturaAsesoria: "baja",
      motivacionCompra: "MOTIVACION-SECRETA",
      oportunidadesFuturas: "OPORTUNIDAD-SECRETA",
    }),
    propuesta: {
      valores: {
        dolorPrincipal: "PROPUESTO-POR-SESION",
        retosEstrategicos: "PROPUESTO-POR-HANDOFF",
        herramientasActuales: "DERIVADO-DEL-HANDOFF",
        porQueApertura: "PORQUE-SECRETO",
      },
      fuentes: [],
      fuentesPorCampo: {
        dolorPrincipal: ["Sesión «Kickoff» del 1 oct 2026"],
        retosEstrategicos: ["Handoff de «Impl»"],
        herramientasActuales: ["Handoff de «Impl»", "Encuesta de «Impl»"],
        porQueApertura: ["Sesión «Kickoff» del 1 oct 2026"],
      },
      origenPorCampo: {
        dolorPrincipal: ["Sesiones"],
        retosEstrategicos: ["Handoff"],
        herramientasActuales: ["Actualizar con IA"],
        porQueApertura: ["Sesiones"],
      },
      at: "2026-10-01T12:00:00.000Z",
      origen: "Varias fuentes",
    },
    historia: { aQueSeDedica: { por: "ana@smarteamcr.com", en: "2026-09-27T12:00:00.000Z", fuentes: ["Handoff de «Impl»"], origenes: ["Handoff"] } },
  };

  it("⛔ cliente: solo lo confirmado, sin campos internos, sin la postura y sin lo propuesto", () => {
    const t = fichaParaLaMemoria(ficha, { alcance: "cliente" });
    expect(t).toContain("Fundación universitaria");
    expect(t).toContain("- Ana — directora — sponsor");
    for (const s of ["POSTURA-SECRETA", "MOTIVACION-SECRETA", "OPORTUNIDAD-SECRETA", "PORQUE-SECRETO", "PROPUESTO-POR", "DERIVADO", "Baja", "ana@smarteamcr.com"]) {
      expect(t, s).not.toContain(s);
    }
  });

  it("⛔ sin-lo-interno (el handoff): lo propuesto con su fuente, sin campos internos, sin la postura y sin lo suyo", () => {
    const t = fichaParaLaMemoria(ficha, { alcance: "sin-lo-interno", excluirOrigenes: ["Handoff"] });
    expect(t).toContain("Propuesto, sin confirmar · de: Sesión «Kickoff» del 1 oct 2026:\nPROPUESTO-POR-SESION");
    for (const s of ["PROPUESTO-POR-HANDOFF", "DERIVADO-DEL-HANDOFF", "POSTURA-SECRETA", "MOTIVACION-SECRETA", "OPORTUNIDAD-SECRETA", "PORQUE-SECRETO"]) {
      expect(t, s).not.toContain(s);
    }
  });

  it("interno: todo, lo interno marcado, con la historia de cada campo", () => {
    const t = fichaParaLaMemoria(ficha, { alcance: "interno" });
    expect(t).toContain("MOTIVACION-SECRETA");
    expect(t).toContain("POSTURA-SECRETA");
    expect(t).toContain("Apertura a la asesoría (INTERNO — nunca se cita al cliente)");
    expect(t).toContain("Confirmado el 2026-09-27 por ana@smarteamcr.com · de: Handoff de «Impl»");
    expect(t).toContain("PROPUESTO-POR-HANDOFF");
  });

  it("interno sin confirmar: lo propuesto también es memoria", () => {
    const sin: FichaGuardada = { ...fichaVacia(), propuesta: { valores: { dolorPrincipal: "x" }, fuentes: [], fuentesPorCampo: {}, at: "", origen: "Sesiones" } };
    expect(fichaParaLaMemoria(sin, { alcance: "interno" })).toContain("Propuesto, sin confirmar");
    expect(fichaParaLaMemoria(sin, { alcance: "cliente" })).toBe("");
    expect(fichaParaLaMemoria(fichaVacia(), { alcance: "interno" })).toBe("");
  });
});

describe("la historia de lo confirmado: quién, cuándo y de qué fuente", () => {
  const EN = "2026-10-09T18:00:00.000Z";
  const antes: FichaGuardada = {
    ...fichaConfirmada({ dolorPrincipal: "viejo", retosEstrategicos: "crecer" }),
    propuesta: {
      valores: { dolorPrincipal: "nuevo", aQueSeDedica: "Vende acero" },
      fuentes: [],
      fuentesPorCampo: { dolorPrincipal: ["Sesión «A» del 9 oct 2026"], aQueSeDedica: ["Handoff de «Impl»"] },
      origenPorCampo: { dolorPrincipal: ["Sesiones"], aQueSeDedica: ["Handoff"] },
      at: EN,
      origen: "Varias fuentes",
    },
  };

  it("igual a lo propuesto: sus fuentes; cambiado: + «Editado a mano»; sin propuesta: «Escrito a mano»; lo que no cambia, nada", () => {
    const confirmados = { ...antes.valores, dolorPrincipal: "nuevo", aQueSeDedica: "Vende acero y aluminio", stakeholders: "- Ana" };
    const h = historiaAlConfirmar(antes, confirmados, "Ana@Smarteamcr.com", EN);
    expect(h.dolorPrincipal).toEqual({ por: "ana@smarteamcr.com", en: EN, fuentes: ["Sesión «A» del 9 oct 2026"], origenes: ["Sesiones"] });
    expect(h.aQueSeDedica).toEqual({ por: "ana@smarteamcr.com", en: EN, fuentes: ["Handoff de «Impl»", "Editado a mano"], origenes: ["Handoff", ORIGEN_A_MANO] });
    expect(h.stakeholders).toEqual({ por: "ana@smarteamcr.com", en: EN, fuentes: ["Escrito a mano"], origenes: [ORIGEN_A_MANO] });
    expect(h.retosEstrategicos).toBeUndefined();
  });

  it("conHistoria la suma (lo nuevo de un campo reemplaza lo anterior) y leerFicha la conserva", () => {
    const una = historiaAlConfirmar(antes, { ...antes.valores, dolorPrincipal: "nuevo" }, "a@x", EN);
    const otra = historiaAlConfirmar(antes, { ...antes.valores, retosEstrategicos: "otro" }, "b@x", EN);
    const f = conHistoria(conHistoria(antes, una), otra);
    expect(Object.keys(f.historia ?? {}).sort()).toEqual(["dolorPrincipal", "retosEstrategicos"]);
    expect(f.version).toBe(VERSION_DE_LA_FICHA);
    const leida = leerFicha(
      JSON.parse(JSON.stringify({ ...f, historia: { ...f.historia, otra: { por: "x", en: EN }, dolorPrincipal: { por: "", en: EN } } })),
    );
    expect(Object.keys(leida.historia ?? {})).toEqual(["retosEstrategicos"]);
    expect("historia" in leerFicha(JSON.parse(JSON.stringify(fichaVacia())))).toBe(false);
  });

  it("la ruta que confirma la escribe", () => {
    const ruta = fs.readFileSync(path.join(__dirname, "..", "..", "app", "api", "clients", "[id]", "ficha", "route.ts"), "utf8");
    expect(ruta).toContain("historiaAlConfirmar(actual, v.valores, quien, ahoraIso)");
    expect(ruta).toContain("conHistoria(");
  });
});

describe("conteoDeLaFicha («Lo que la IA ya sabe»)", () => {
  it("cuenta confirmados y propuestos, y los propuestos por quién los propuso", () => {
    const f: FichaGuardada = {
      ...fichaConfirmada({ aQueSeDedica: "x", aperturaAsesoria: "sin_evaluar", stakeholders: "- Ana" }),
      propuesta: {
        valores: { dolorPrincipal: "a", retosEstrategicos: "b", aQueSeDedica: "x" },
        fuentes: [],
        fuentesPorCampo: {},
        origenPorCampo: { dolorPrincipal: ["Preventa"], retosEstrategicos: ["Preventa", "Sesiones"] },
        at: "",
        origen: "Varias fuentes",
      },
    };
    // «sin_evaluar» no cuenta; lo propuesto igual a lo confirmado tampoco.
    expect(conteoDeLaFicha(f)).toEqual({ confirmados: 2, propuestos: 2, propuestosPorOrigen: { Preventa: 2, Sesiones: 1 } });
  });
});
