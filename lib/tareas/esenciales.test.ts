/**
 * lib/tareas/esenciales.test.ts — POCOS PENDIENTES Y ESENCIALES DE LAS REUNIONES CON CLIENTES, Y LO DESCARTADO NO
 * VUELVE (2026-10-19; DECISIONS «Pocos pendientes y esenciales de las reuniones con clientes»).
 *
 * Qué se congela:
 *   1. el tema de una tarea: sin el nombre de la cuenta ni el día; un seguimiento agrupado tiene uno por línea;
 *   2. `mismoTema` es estricto: «Enviar el reporte a CEMACO» ≈ «Enviar el reporte de avance» pero no ≈ «Enviar la minuta»;
 *   3. un descarte de la cuenta (una persona, «Descartar») bloquea el tema en esa cuenta para siempre y para cualquiera;
 *      lo vencido, lo retirado por el sistema y «Era otra tarea» no; la lápida exacta sigue con sus 28 días;
 *   4. `elegirLoEsencial`: lo menor sale (salvo lo que frena el plan), lo que el cliente espera de Smarteam pasa a
 *      Smarteam y va a quien lleva la cuenta, y lo importante va primero;
 *   5. el título de Smarteam sigue «Verbo + qué + a quién»; uno que no sirve cae a `que`;
 *   6. el tope de una reunión con un cliente es 3 por persona;
 *   7. la lectura de Tareas (lectura-armar) también respeta los descartes de la cuenta.
 *
 * Correr: `npx vitest run lib/tareas/esenciales.test.ts --project unit`.
 */
import { describe, expect, it } from "vitest";
import { leerCompromisos, type CompromisoDetectado } from "@/lib/sessions/compromisos-y-alcance";
import { compartenTema, mismoTema, temaDeLaTarea, temasDeLaTarea } from "./tema";
import { esDescarteDeLaCuenta, sinLoDescartado, temasDescartados, yaSeDescarto, type TareaDecidida } from "./descartadas";
import { armarPropuestasDeSeguimiento, elegirLoEsencial, loEsperaDeSmarteam, tituloDelCompromiso, tituloValido, type EntradaDeSeguimiento } from "./seguimiento";
import { cupoPorPersona } from "./cupo";
import { MAX_PROPUESTAS_POR_PERSONA_POR_REUNION, MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE } from "./reglas";
import { armarPropuestas, prepararLineas, type ContextoDeArmado } from "./lectura-armar";
import { huellaDeTexto } from "./texto";

const AHORA = new Date("2026-10-19T18:00:00Z");
const hace = (dias: number) => new Date(+AHORA - dias * 86_400_000);

function decidida(t: Partial<TareaDecidida> & { titulo: string }): TareaDecidida {
  return {
    contexto: null,
    huella: huellaDeTexto(t.titulo),
    clientId: "cemaco",
    responsableEmail: "lili@smarteamcr.com",
    estado: "rechazada",
    decision: "rechazada",
    decididaPorEmail: "lili@smarteamcr.com",
    decididaAt: hace(60),
    ...t,
  };
}

function compromiso(c: Partial<CompromisoDetectado>): CompromisoDetectado {
  return { quien: "SMARTEAM", responsable: "", que: "Enviar el reporte de avance", fecha: null, tipo: "ACCION", cita: "te mando el reporte de avance", ownerEmail: null, tituloDeSeguimiento: null, frenaElPlan: false, ...c };
}

describe("1 · el tema de una tarea", () => {
  it("no cuenta el nombre de la cuenta ni el día", () => {
    const t = temaDeLaTarea({ titulo: "Enviar el reporte a CEMACO", contexto: null }, "Cemaco Internacional");
    expect(t.raices).not.toContain("#cemaco");
    expect(t.raices).not.toContain("cemac");
    expect(t.raices).toEqual(expect.arrayContaining(["envia", "repor"]));
  });

  it("un seguimiento agrupado tiene un tema por cada línea de su lista", () => {
    const temas = temasDeLaTarea(
      { titulo: "Seguimiento con Honda: 2 cosas que prometió Randall (lun 12 oct)", contexto: "Lo prometió Randall (del cliente) en la reunión del lun 12 oct. Lo que falta:\n• Enviar el listado de activaciones por línea (para el jue 15 oct)\n• Conectar las diademas en Curridabat · frena el plan" },
      "Honda Costa Rica",
    );
    expect(temas).toHaveLength(2);
  });
});

describe("2 · mismoTema es estricto", () => {
  const e = "Cemaco Internacional";
  const t = (titulo: string) => temaDeLaTarea({ titulo, contexto: null }, e);
  it("la misma cosa con otras palabras es el mismo tema", () => {
    expect(mismoTema(t("Enviar el reporte de avance a CEMACO"), t("Enviar reporte de avance"))).toBe(true);
  });
  it("otra cosa que comparte el verbo y la cuenta no lo es", () => {
    expect(mismoTema(t("Enviar el reporte a CEMACO"), t("Enviar la minuta a CEMACO"))).toBe(false);
  });
  it("un título corto no se come a uno largo con más tema", () => {
    expect(mismoTema(t("Enviar propuesta"), t("Enviar propuesta de licencias de Sales Hub con descuento"))).toBe(false);
  });
});

describe("3 · lo descartado no vuelve", () => {
  const empresas = new Map([["cemaco", "Cemaco Internacional"]]);
  const prop = (titulo: string, o: Partial<{ responsableEmail: string | null; clientId: string | null; porAsignar: boolean }> = {}) => ({ titulo, responsableEmail: "lili@smarteamcr.com", porAsignar: false, clientId: "cemaco", ...o });

  it("⭐ lo que una persona descartó hace 60 días no vuelve con otras palabras, ni para otra persona", () => {
    const filas = [decidida({ titulo: "Enviar el reporte de avance a CEMACO" })];
    const r = sinLoDescartado([prop("Enviar reporte de avance semanal a Cemaco", { responsableEmail: "breiner@smarteamcr.com" })], filas, AHORA, empresas);
    expect(r).toMatchObject({ porTema: 1, porLapida: 0 });
    expect(r.propuestas).toHaveLength(0);
  });

  it("en OTRA cuenta sí se propone", () => {
    const r = sinLoDescartado([prop("Enviar reporte de avance", { clientId: "honda" })], [decidida({ titulo: "Enviar el reporte de avance a CEMACO" })], AHORA, empresas);
    expect(r.propuestas).toHaveLength(1);
  });

  it("lo vencido, lo retirado por el sistema y «Era otra tarea» no son descartes: vuelven si se vuelve a hablar", () => {
    const filas = [
      decidida({ titulo: "Enviar el reporte de avance", estado: "vencida", decision: "vencida", decididaPorEmail: "sistema" }),
      decidida({ titulo: "Enviar el reporte de avance", decididaPorEmail: "sistema" }),
      decidida({ titulo: "Enviar el reporte de avance", estado: "fusionada", decision: "misma", decididaAt: hace(40) }),
    ];
    for (const f of filas) expect(esDescarteDeLaCuenta(f)).toBe(false);
    expect(sinLoDescartado([prop("Enviar el reporte de avance")], filas, AHORA, empresas).propuestas).toHaveLength(1);
  });

  it("sin cuenta no hay descarte de la cuenta; la lápida exacta sigue valiendo 28 días", () => {
    const sinCuenta = [decidida({ titulo: "Armar el tablero", clientId: null, decididaAt: hace(10) })];
    expect(sinLoDescartado([prop("Armar el tablero", { clientId: null })], sinCuenta, AHORA).porLapida).toBe(1);
    const vieja = [decidida({ titulo: "Armar el tablero", clientId: null, decididaAt: hace(40) })];
    expect(sinLoDescartado([prop("Armar el tablero", { clientId: null })], vieja, AHORA).propuestas).toHaveLength(1);
  });

  it("descartar un seguimiento agrupado bloquea cada cosa de su lista", () => {
    const filas = [
      decidida({
        titulo: "Seguimiento con Honda Costa Rica: 2 cosas que prometió Randall (lun 12 oct)",
        clientId: "honda",
        contexto: "Lo prometió Randall (del cliente) en la reunión del lun 12 oct. Lo que falta:\n• Enviar el listado de activaciones por línea de negocio\n• Conectar las diademas en Curridabat",
      }),
    ];
    const descartados = temasDescartados(filas, "honda", "Honda Costa Rica");
    expect(yaSeDescarto(["Recordarle a Randall que envíe el listado de activaciones por línea de negocio"], descartados, "Honda Costa Rica")).toBe(true);
    expect(yaSeDescarto(["Recordarle a Randall que apruebe la propuesta económica"], descartados, "Honda Costa Rica")).toBe(false);
  });
});

describe("4 · elegirLoEsencial", () => {
  it("lo menor sale; lo menor que frena el plan se queda", () => {
    const r = elegirLoEsencial([
      compromiso({ que: "Reunirse internamente el lunes", esencial: false }),
      compromiso({ que: "Enviar la base de datos", quien: "CLIENTE", esencial: false, frenaElPlan: true }),
      compromiso({ que: "Enviar el reporte de avance" }),
    ]);
    expect(r.menores.map((c) => c.que)).toEqual(["Reunirse internamente el lunes"]);
    expect(r.quedan).toHaveLength(2);
  });

  it("sin decir si es esencial (una lectura de antes), cuenta como esencial", () => {
    const [c] = leerCompromisos([{ quien: "SMARTEAM", que: "Enviar el reporte", tipo: "ACCION", frenaElPlan: false, cita: "te mando el reporte hoy" }]);
    expect(c.esencial).toBe(true);
    expect(elegirLoEsencial([c]).quedan).toHaveLength(1);
  });

  it("lo importante va primero: lo que frena el plan, después lo que tiene fecha", () => {
    const r = elegirLoEsencial([compromiso({ que: "A" }), compromiso({ que: "B", fecha: "2026-10-22" }), compromiso({ que: "C", frenaElPlan: true })]);
    expect(r.quedan.map((c) => c.que)).toEqual(["C", "B", "A"]);
  });

  it("⭐ «quedamos atentos a que nos envíes el reporte» es de Smarteam, y va a quien lleva la cuenta", () => {
    const delCliente = compromiso({ quien: "CLIENTE", que: "El cliente queda atento a que Smarteam envíe el reporte de avance", tituloDeSeguimiento: "Recordarle a José Pablo el reporte" });
    expect(loEsperaDeSmarteam(delCliente)).toBe(true);
    expect(loEsperaDeSmarteam(compromiso({ quien: "CLIENTE", que: "José Pablo envía la base de datos el jueves" }))).toBe(false);
    const { quedan, aSmarteam } = elegirLoEsencial([delCliente]);
    expect(aSmarteam).toBe(1);
    expect(quedan[0]).toMatchObject({ quien: "SMARTEAM", esperaElCliente: true, tituloDeSeguimiento: null });
    const entrada: EntradaDeSeguimiento = {
      compromisos: quedan,
      lectura: { id: "l1", equipo: "cs" },
      reunion: { id: "s1", inicio: AHORA, participantes: [] },
      miembros: [{ email: "lili@smarteamcr.com", nombre: "Liliana Moreno", area: "CSE", roleEnum: "CSE" }],
      cseDelProyecto: "lili@smarteamcr.com",
      cseDeLaCuenta: null,
      clientId: "cemaco",
      empresa: "Cemaco Internacional",
      projectId: "p1",
      ruta: "completa",
    };
    const [p] = armarPropuestasDeSeguimiento(entrada).propuestas;
    expect(p).toMatchObject({ responsableEmail: "lili@smarteamcr.com", porAsignar: false });
    expect(p.sugerido.lado).toBe("smarteam");
  });

  it("armarPropuestasDeSeguimiento no propone lo que la cuenta ya descartó, antes de juntar lo del cliente", () => {
    const descartados = temasDescartados([decidida({ titulo: "Enviar el reporte de avance a CEMACO" })], "cemaco", "Cemaco Internacional");
    const r = armarPropuestasDeSeguimiento({
      compromisos: [compromiso({ que: "Enviar reporte de avance", ownerEmail: "lili@smarteamcr.com" }), compromiso({ que: "Crear los campos en HubSpot", ownerEmail: "lili@smarteamcr.com", cita: "yo creo los campos en hubspot" })],
      lectura: { id: "l1", equipo: "cs" },
      reunion: { id: "s1", inicio: AHORA, participantes: [] },
      miembros: [{ email: "lili@smarteamcr.com", nombre: "Liliana Moreno", area: "CSE", roleEnum: "CSE" }],
      cseDelProyecto: null,
      cseDeLaCuenta: null,
      clientId: "cemaco",
      empresa: "Cemaco Internacional",
      projectId: null,
      ruta: "completa",
      descartados,
    });
    expect(r.yaDescartados).toBe(1);
    expect(r.propuestas.map((p) => p.titulo)).toEqual(["Crear los campos en HubSpot"]);
  });
});

describe("5 · el título «Verbo + qué + a quién»", () => {
  it("usa el del modelo si empieza con un infinitivo, es corto y no trae voseo", () => {
    expect(tituloValido("Enviar el reporte a CEMACO")).toBe(true);
    expect(tituloValido("Enviarle a Priscilla la propuesta de renovación")).toBe(true);
    expect(tituloDelCompromiso(compromiso({ que: "Liliana envía el reporte cuando lo tenga", titulo: "Enviar el reporte a CEMACO" }))).toBe("Enviar el reporte a CEMACO");
  });
  it("cae a `que` si el título no sirve (tercera persona, largo, voseo)", () => {
    expect(tituloValido("Liliana agenda y conduce la sesión de contexto")).toBe(false);
    expect(tituloValido(`Enviar ${"el reporte ".repeat(12)}`)).toBe(false);
    expect(tituloValido("Mandá el reporte a CEMACO")).toBe(false);
    expect(tituloDelCompromiso(compromiso({ que: "Enviar el reporte", titulo: "Liliana agenda la sesión" }))).toBe("Enviar el reporte");
  });
});

describe("6 · el tope de una reunión con un cliente", () => {
  it("es 3 por persona; las del equipo siguen con 5", () => {
    expect(MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE).toBe(3);
    expect(MAX_PROPUESTAS_POR_PERSONA_POR_REUNION).toBe(5);
    const cupo = cupoPorPersona(new Map([["lili@smarteamcr.com", 2]]), MAX_PROPUESTAS_POR_PERSONA_POR_REUNION_CON_CLIENTE);
    expect(cupo.tomar("lili@smarteamcr.com")).toBe(true);
    expect(cupo.tomar("lili@smarteamcr.com")).toBe(false);
  });
});

describe("7 · la lectura de Tareas también respeta los descartes de la cuenta", () => {
  it("una línea que repite un tema descartado en la cuenta no se propone", () => {
    const miembros = [{ email: "lili@smarteamcr.com", nombre: "Liliana Moreno", area: "CSE", roleEnum: "CSE" }];
    const temas = temasDescartados([decidida({ titulo: "Enviar el reporte de avance a CEMACO" })], "cemaco", "Cemaco Internacional");
    const ctx: ContextoDeArmado = {
      lectura: { id: "l1", equipo: "cs", semana: "2026-10-19", pedidaPorEmail: null, inicio: AHORA },
      miembros,
      participantes: ["lili@smarteamcr.com"],
      clienteDeLaReunion: "cemaco",
      clientesPorLinea: new Map(),
      candidatasPorDueno: new Map(),
      lapidas: temas.map((t) => ({ huella: "", responsableEmail: null, clientId: "cemaco", temas: t })),
      empresaDeLaReunion: "Cemaco Internacional",
    };
    const lineas = [
      { id: "a", personas: ["Liliana Moreno"], titulo: "Enviar reporte de avance", detalle: null, texto: "[Liliana Moreno] Enviar reporte de avance" },
      { id: "b", personas: ["Liliana Moreno"], titulo: "Crear los campos en HubSpot", detalle: null, texto: "[Liliana Moreno] Crear los campos en HubSpot" },
    ];
    const armado = armarPropuestas(prepararLineas(lineas, ctx), ctx, null, { M: new Map(), T: new Map(), R: new Map(), C: new Map() });
    expect(armado.omitidas.lapida).toBe(1);
    expect(armado.propuestas.map((p) => p.titulo)).toEqual(["Crear los campos en HubSpot"]);
  });

  it("compartenTema mira todos los temas de los dos lados", () => {
    expect(compartenTema([], [])).toBe(false);
  });
});
