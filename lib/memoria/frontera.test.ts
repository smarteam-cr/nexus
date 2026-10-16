/**
 * lib/memoria/frontera.test.ts — LA FRONTERA DE LA MEMORIA: que algo interno no llegue a un documento del cliente.
 *
 * Es la prueba que pide el plan (docs/memoria-de-la-cuenta-plan.md, Etapa 3): con datos que traen centinelas en todo lo
 * interno (la motivación, las oportunidades, la apertura, la postura, la preventa, lo fuera de alcance, la auditoría,
 * los compromisos, los riesgos de la minuta, las notas de la reunión, una reunión puertas adentro, una desviación que el
 * cliente no ve, lo propuesto), el texto `cliente` no trae ninguno; `sin-lo-interno` (el handoff) no trae los campos
 * internos ni la preventa; y nunca entra lo propuesto por un origen excluido.
 *
 * Y la regla de sensibilidad, por escaneo del código: la memoria no lee facturación, Partner, rentabilidad ni salarios,
 * ni pide el monto de un pedido, la cita de una tarea, el `sourceQuote` o quién creó una desviación.
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { fichaVacia, valoresVacios, type FichaGuardada } from "@/lib/clients/ficha";
import type { ResultadoMedible } from "@/lib/handoff/resultados-medibles";
import { armarMemoriaDeLaCuenta, armarMemoriaDelProyecto } from "./armar";
import type { AlcanceDeMemoria, DatosDeLaCuenta, DatosDelProyecto } from "./tipos";

const S = (que: string) => `SECRETO-${que}`;

const fichaConTodo: FichaGuardada = {
  ...fichaVacia(),
  valores: {
    ...valoresVacios(),
    aQueSeDedica: "Fundación universitaria",
    stakeholders: `- Ana — directora — sponsor — ${S("postura")}`,
    aperturaAsesoria: "baja",
    porQueApertura: S("porque-apertura"),
    motivacionCompra: S("motivacion"),
    oportunidadesFuturas: S("oportunidades"),
  },
  confirmadaAt: "2026-09-27T12:00:00.000Z",
  confirmadaPor: "Ana",
  propuesta: {
    valores: { dolorPrincipal: S("propuesto-por-sesion"), retosEstrategicos: S("propuesto-por-handoff"), herramientasActuales: S("derivado-del-handoff") },
    fuentes: [],
    fuentesPorCampo: {
      dolorPrincipal: ["Sesión «Kickoff» del 1 oct 2026"],
      retosEstrategicos: ["Handoff de «Impl»"],
      herramientasActuales: ["Handoff de «Impl»"],
    },
    origenPorCampo: { dolorPrincipal: ["Sesiones"], retosEstrategicos: ["Handoff"], herramientasActuales: ["Actualizar con IA"] },
    at: "2026-10-01T12:00:00.000Z",
    origen: "Varias fuentes",
  },
};

const cuenta: DatosDeLaCuenta = {
  cliente: { nombre: "FUNDAUNA" },
  ficha: fichaConTodo,
  procesos: [
    { nombre: "Admisiones", estado: "validado", queResuelve: "Cómo entra un estudiante", dolores: [] },
    { nombre: S("proceso-borrador"), estado: "borrador", queResuelve: "", dolores: [] },
  ],
  proyectos: [{ id: "p1", nombre: "Service Hub", tipo: null, estado: "active", desde: "2026-09-01T12:00:00.000Z", tratoId: S("trato") }],
  entrega: { proyecto: "Sales Hub", texto: "Se dejó funcionando el pipeline." },
  fueraDeAlcance: [{ pedido: S("fuera-de-alcance"), estado: "CONFIRMADO", proyecto: null, quienLoPidio: null, fecha: "2026-10-01T12:00:00.000Z" }],
  preventa: { fecha: "2026-08-01T12:00:00.000Z", archivada: false, texto: S("preventa-interna") },
  auditoria: { nombre: "Auditoría", fecha: "2026-09-15T12:00:00.000Z", estado: S("auditoria-estado"), hallazgos: [{ seccion: "Workflows", titulo: S("hallazgo"), hallazgo: "x", decision: "Corregir" }] },
  // Los hechos de las reuniones (etapa 6): solo el alcance interno.
  hechos: [{ tipo: "cuenta", tema: null, frase: S("hecho-de-la-cuenta"), estado: "pendiente", reunion: { titulo: "Seguimiento", fecha: "2026-10-01" } }],
  // Las personas y los tickets de HubSpot (etapa 6a): solo el alcance interno.
  personas: [{ nombre: S("persona-de-hubspot"), cargo: "Gerente", ultimaReunion: "2026-10-01T15:00:00.000Z" }],
  tickets: [{ asunto: S("ticket-abierto"), etapa: "Nuevo", prioridad: "HIGH", desde: "2026-10-01T15:00:00.000Z" }],
  // Las notas del equipo (etapa 5): solo el alcance interno.
  notasDelEquipo: [{ canal: "WhatsApp", fecha: "2026-10-01", texto: S("nota-del-equipo"), autor: "Ana" }],
};

const proyecto: DatosDelProyecto = {
  proyecto: { nombre: "Service Hub" },
  reuniones: [
    {
      id: "s1",
      titulo: "Seguimiento",
      fecha: "2026-10-01T15:00:00.000Z",
      sala: "CON EL CLIENTE",
      resumen: S("notas-de-la-reunion"),
      minuta: { resumen: S("resumen-de-la-minuta"), acuerdos: ["Enviar la base", "El precio queda en US$18.000"], decisiones: ["Usar Sales Hub"], riesgos: [S("riesgo")], revisada: true },
    },
    {
      id: "s2",
      titulo: "Interna",
      fecha: "2026-10-02T15:00:00.000Z",
      sala: "PUERTAS ADENTRO",
      resumen: S("puertas-adentro"),
      minuta: { resumen: null, acuerdos: [S("acuerdo-puertas-adentro")], decisiones: [], riesgos: [], revisada: false },
    },
  ],
  compromisos: [{ titulo: S("compromiso"), venceEl: "2026-10-15", estado: "pendiente", lado: "cliente" }],
  desviaciones: [
    { tipo: "ATRASO", titulo: "Se atrasó la migración", detalle: S("detalle-desviacion"), semanas: 2, fecha: "2026-10-02T12:00:00.000Z", visibleAlCliente: true, sinConfirmar: false, cerrada: false, quien: S("party") },
    { tipo: "COMPROMISO", titulo: S("desviacion-no-visible"), detalle: null, semanas: null, fecha: "2026-10-02T12:00:00.000Z", visibleAlCliente: false, sinConfirmar: false, cerrada: false, quien: "SMARTEAM" },
  ],
  resultados: [{ id: "R1", resultado: S("resultado-sin-confirmar"), metrica: "", lineaBase: "", meta: "", plazo: "", quienLoNecesita: "", retos: [] } as unknown as ResultadoMedible],
  hechos: [{ tipo: "acuerdo", tema: "pipeline", frase: S("hecho-del-proyecto"), estado: "usado", reunion: { titulo: "Seguimiento", fecha: "2026-10-01" } }],
};

const textoDe = (alcance: AlcanceDeMemoria, excluirOrigenes: string[] = []) =>
  armarMemoriaDeLaCuenta(cuenta, { alcance, excluirOrigenes }).texto + "\n" + armarMemoriaDelProyecto(proyecto, { alcance }).texto;

describe("⛔ la frontera de la memoria", () => {
  it("cliente: NINGÚN centinela, ni el monto de un acuerdo", () => {
    const t = textoDe("cliente");
    expect(t.match(/SECRETO-[\w-]+/g) ?? []).toEqual([]);
    expect(t).not.toContain("US$18.000");
    // Y lo que sí puede ver, llega.
    expect(t).toContain("Fundación universitaria");
    expect(t).toContain("- Ana — directora — sponsor");
    expect(t).toContain("Decisión: Usar Sales Hub");
    expect(t).toContain("Se atrasó la migración");
  });

  it("sin-lo-interno (el handoff): sin los campos internos, la postura, la preventa, lo fuera de alcance, la auditoría ni los compromisos", () => {
    const t = textoDe("sin-lo-interno", ["Handoff"]);
    for (const s of [
      "postura",
      "porque-apertura",
      "motivacion",
      "oportunidades",
      "preventa-interna",
      "fuera-de-alcance",
      "auditoria-estado",
      "hallazgo",
      "compromiso",
      "trato",
      "riesgo",
      "puertas-adentro",
      "acuerdo-puertas-adentro",
      "desviacion-no-visible",
      "party",
      "detalle-desviacion",
      "hecho-de-la-cuenta",
      "hecho-del-proyecto",
      "persona-de-hubspot",
      "ticket-abierto",
      "nota-del-equipo",
    ]) {
      expect(t, s).not.toContain(S(s));
    }
    // Lo propuesto con su fuente sí entra, salvo lo suyo y lo derivado de él.
    expect(t).toContain(S("propuesto-por-sesion"));
    expect(t).not.toContain(S("propuesto-por-handoff"));
    expect(t).not.toContain(S("derivado-del-handoff"));
  });

  it("interno: entra todo (la prueba de que los centinelas están donde deben)", () => {
    // (Los riesgos de la minuta van adentro del resumen de la reunión, que arma `resumenDeReunion` en el cargador.)
    const t = textoDe("interno");
    for (const s of ["postura", "motivacion", "oportunidades", "preventa-interna", "fuera-de-alcance", "hallazgo", "compromiso", "notas-de-la-reunion", "puertas-adentro", "desviacion-no-visible", "party", "hecho-de-la-cuenta", "hecho-del-proyecto", "persona-de-hubspot", "ticket-abierto", "nota-del-equipo"]) {
      expect(t, s).toContain(S(s));
    }
    // Un hecho pendiente va rotulado como propuesto por la lectura y sin revisar; uno usado, tal cual.
    expect(t).toContain("propuesto por la lectura de «Seguimiento» del 2026-10-01, sin revisar");
    expect(t).toContain(`- Acuerdo · Pipeline: ${S("hecho-del-proyecto")}`);
    expect(t).not.toContain(`${S("hecho-del-proyecto")} (propuesto por`);
  });

  it("⛔ la postura no pasa aunque la viñeta no traiga las cuatro partes (cliente y handoff)", () => {
    /* El recorte se quedaba con las tres primeras partes: «Ana — gerente — no confía» (sin papel) o «Luis — escéptico»
       quedaban enteras. Ahora, con menos de cuatro, solo el nombre; las sub-viñetas no van. */
    const ficha: FichaGuardada = {
      ...fichaConTodo,
      valores: {
        ...fichaConTodo.valores,
        stakeholders: [`- Ana — Gerente — ${S("tres-partes")}`, `- Luis — ${S("dos-partes")}`, "- Marta — CFO — Firma — sin dato", `  - Postura: ${S("sub-vineta")}`].join("\n"),
      },
      propuesta: null,
    };
    for (const alcance of ["cliente", "sin-lo-interno"] as const) {
      const t = armarMemoriaDeLaCuenta({ ...cuenta, ficha }, { alcance }).texto;
      for (const s of ["tres-partes", "dos-partes", "sub-vineta"]) expect(t, `${alcance}: ${s}`).not.toContain(S(s));
      expect(t, alcance).toContain("- Ana\n- Luis\n- Marta — CFO — Firma");
      expect(t, alcance).toContain("(al cliente: solo nombre, cargo y papel en el proyecto; NUNCA la postura)");
    }
  });

  it("⛔ el handoff no recibe lo interno de la preventa aunque caiga en un campo que ve el cliente", () => {
    /* La radiografía va a «A qué se dedica» y «quién decide» a las personas: campos que ven el cliente y el handoff. */
    const ficha: FichaGuardada = {
      ...fichaConTodo,
      propuesta: {
        valores: { aQueSeDedica: S("radiografia"), stakeholders: `- ${S("quien-decide")} — Gerente — Firma — sin dato` },
        fuentes: [],
        fuentesPorCampo: { aQueSeDedica: ["Preventa · Preparación · Radiografía de la empresa (investigación en internet; interno de la preventa)"], stakeholders: ["Preventa · Lo que se confirmó · Quién decide"] },
        origenPorCampo: { aQueSeDedica: ["Preventa"], stakeholders: ["Preventa"] },
        internoPorCampo: { stakeholders: true },
        at: "2026-10-01T12:00:00.000Z",
        origen: "Preventa",
      },
    };
    const handoff = armarMemoriaDeLaCuenta({ ...cuenta, ficha }, { alcance: "sin-lo-interno", excluirOrigenes: ["Handoff"] }).texto;
    expect(handoff).not.toContain(S("radiografia"));
    expect(handoff).not.toContain(S("quien-decide"));
    // Un agente interno sí lo lee.
    const interno = armarMemoriaDeLaCuenta({ ...cuenta, ficha }, { alcance: "interno" }).texto;
    expect(interno).toContain(S("radiografia"));
    expect(interno).toContain(S("quien-decide"));
  });

  it("⛔ la regla de la frontera viaja ADENTRO del bloque, fuera del alcance interno", () => {
    const kickoff = armarMemoriaDelProyecto(proyecto, { alcance: "cliente", pieza: "kickoff" }).texto;
    expect(kickoff).toContain("NUNCA pases al documento precios, montos, descuentos ni condiciones de lo que cobra Smarteam");
    // Sin pieza (el correo), la regla completa.
    expect(armarMemoriaDeLaCuenta(cuenta, { alcance: "cliente" }).texto).toContain("NUNCA pases al documento precios");
    expect(armarMemoriaDeLaCuenta(cuenta, { alcance: "sin-lo-interno" }).texto).toContain("nunca pases precios");
    expect(armarMemoriaDeLaCuenta(cuenta, { alcance: "interno", pieza: "implementation" }).texto).not.toMatch(/pases (?:al documento )?precios/);
  });

  it("⛔ para el cliente, nunca la negociación sin cifra; la minuta en borrador llega marcada y con la misma red", () => {
    const conNegociacion: DatosDelProyecto = {
      ...proyecto,
      reuniones: [
        {
          id: "s3",
          titulo: "Negociación",
          fecha: "2026-10-03T15:00:00.000Z",
          sala: "CON EL CLIENTE",
          resumen: "",
          minuta: {
            resumen: null,
            acuerdos: [`${S("descuento")}: 15% de descuento por pago anual`, `${S("precio")} precio especial si firman este mes`, "Enviar la base de contactos"],
            decisiones: [`${S("condiciones")} condiciones de pago a 30 días`],
            riesgos: [],
            revisada: true,
          },
        },
        {
          id: "s4",
          titulo: "Sin revisar",
          fecha: "2026-10-04T15:00:00.000Z",
          sala: "CON EL CLIENTE",
          resumen: "",
          minuta: { resumen: null, acuerdos: ["Mandar el listado de usuarios", `${S("borrador-descuento")}: 10% de descuento`], decisiones: [], riesgos: [], revisada: false },
        },
      ],
    };
    const t = armarMemoriaDelProyecto(conNegociacion, { alcance: "cliente", pieza: "kickoff" }).texto;
    expect(t.match(/SECRETO-[\w-]+/g) ?? []).toEqual([]);
    expect(t).toContain("Acuerdo: Enviar la base de contactos");
    // La IA como borrador (2026-10-15): la minuta que nadie revisó llega, marcada, sin su negociación.
    expect(t).toContain("Sin revisar (minuta en borrador, sin revisar)");
    expect(t).toContain("Acuerdo: Mandar el listado de usuarios");
    // Interno: todo.
    const interno = armarMemoriaDelProyecto(conNegociacion, { alcance: "interno" }).texto;
    expect(interno).toContain("Mandar el listado de usuarios");
    expect(interno).toContain(S("descuento"));
  });

  it("nunca entra lo propuesto por un origen excluido, en ningún alcance", () => {
    for (const alcance of ["sin-lo-interno", "interno"] as const) {
      const t = armarMemoriaDeLaCuenta(cuenta, { alcance, excluirOrigenes: ["Handoff"] }).texto;
      expect(t, alcance).not.toContain(S("propuesto-por-handoff"));
      expect(t, alcance).not.toContain(S("derivado-del-handoff"));
    }
  });
});

// ── La regla de sensibilidad, por escaneo ──────────────────────────────────────────────────

const RAIZ = process.cwd();

/** Quita comentarios (los strings se conservan). */
function soloCodigo(src: string): string {
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const d = src[i + 1];
    if (c === "/" && d === "/") {
      const fin = src.indexOf("\n", i);
      i = fin === -1 ? src.length : fin;
    } else if (c === "/" && d === "*") {
      const fin = src.indexOf("*/", i + 2);
      i = fin === -1 ? src.length : fin + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== c) {
        if (src[j] === "\\") j++;
        j++;
      }
      out += src.slice(i, j + 1);
      i = j + 1;
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

const DE_LA_MEMORIA = fs
  .readdirSync(path.join(RAIZ, "lib", "memoria"))
  .filter((f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f))
  .map((f) => `lib/memoria/${f}`);

describe("⛔ la memoria no lleva plata ni lo que la regla corta", () => {
  it("el escaneo encontró los archivos de la memoria", () => {
    expect(DE_LA_MEMORIA).toEqual(expect.arrayContaining(["lib/memoria/armar.ts", "lib/memoria/cargar.ts", "lib/memoria/consumidores.ts", "lib/memoria/tipos.ts"]));
  });

  it("no lee facturación, Partner, rentabilidad, costos, comisiones ni salarios", () => {
    const PROHIBIDO =
      /@\/lib\/(?:cobranza|rentabilidad|finanzas|carga|cs)\b|\.(?:cobro|cuentaFinanciera|facturaOdoo|facturaMercury|facturaLiberada|clientPartnerSnapshot|partnerUsageSnapshot|licenciaCliente|costoRecurrente|costoMovimiento|gastoPuntual|pagoPlanilla|comisionPartner|comisionVendedor|cuotaComisionVendedor|ingresoVariable|clientCsSignals)\.|\btamUsd\b|\bsalario/i;
    const malos = DE_LA_MEMORIA.filter((rel) => PROHIBIDO.test(soloCodigo(fs.readFileSync(path.join(RAIZ, rel), "utf8"))));
    expect(malos, `La memoria no lleva plata (es del vigía, la CSL y dirección):\n${malos.join("\n")}`).toEqual([]);
  });

  it("el cargador no pide el monto de un pedido, la cita, el sourceQuote, quién creó una desviación ni la transcripción", () => {
    const src = soloCodigo(fs.readFileSync(path.join(RAIZ, "lib/memoria/cargar.ts"), "utf8"));
    for (const campo of ["monto", "cita", "sourceQuote", "createdByEmail", "transcript", "notas", "contexto"]) {
      expect(src, `cargar.ts pide «${campo}»`).not.toMatch(new RegExp(`\\b${campo}\\s*:\\s*true`));
    }
  });

  it("las reuniones salen del chokepoint, y la exploración y las tareas solo por su puerta", () => {
    const src = soloCodigo(fs.readFileSync(path.join(RAIZ, "lib/memoria/cargar.ts"), "utf8"));
    expect(src).toContain("getProjectMemberSessions(");
    expect(src).toContain("soloOcurridas(");
    expect(src).not.toMatch(/\.sessionProject\./);
    for (const m of src.matchAll(/from "(@\/lib\/exploraciones\/[^"]+)"/g)) expect(m[1]).toBe("@/lib/exploraciones/para-la-memoria");
    for (const m of src.matchAll(/from "(@\/lib\/tareas\/[^"]+)"/g)) expect(m[1]).toBe("@/lib/tareas/para-agentes");
    // El armador puro no lee la base.
    expect(soloCodigo(fs.readFileSync(path.join(RAIZ, "lib/memoria/armar.ts"), "utf8"))).not.toMatch(/@\/lib\/db\/prisma|server-only/);
  });
});
