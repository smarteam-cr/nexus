/**
 * Las actividades de cada caso contra el catálogo y la biblioteca: cada caso del catálogo tiene las suyas, cada fila
 * apunta a una actividad de la biblioteca por su id (el tiempo y la forma de compartirse salen de ahí, no se copian),
 * cada línea de «Lo que se entrega» tiene una fila que la hace posible, y cada actividad es un registro completo.
 */
import { describe, expect, it } from "vitest";
import datos from "./actividades-de-los-casos.json";
import {
  comoSeCobra,
  etiquetaDeHoras,
  formatoHoras,
  horasCompartidas,
  horasConElCliente,
  horasDelReparto,
  oraciones,
  formatoUsd,
  leerActividades,
  lineaDeCasosAparte,
  lineasDeLoQueNoIncluye,
  loQueSePideAlCliente,
  sobreQueAparte,
  sumarPorDefecto,
  textoDeSeQuita,
  tiempoDeLaFila,
} from "./actividades";
import { CATALOGO_DE_CASOS, casoPorId } from "./catalogo";

const d = leerActividades(datos);
const biblioteca = new Map(d.biblioteca.map((a) => [a.nombre, a]));
const porId = new Map(d.biblioteca.map((a) => [a.id, a]));

describe("las actividades de cada caso", () => {
  it("cada caso del catálogo tiene sus actividades, y no sobran", () => {
    expect(d.casos.map((c) => c.id).sort()).toEqual(CATALOGO_DE_CASOS.map((c) => c.id).sort());
  });

  it("cada fila apunta a su actividad por id y trae de ahí su tiempo, su etapa y su forma de compartirse", () => {
    for (const c of d.casos)
      for (const f of c.actividades) {
        const a = porId.get(f.actividadId)!;
        expect(a, `${c.id}: «${f.actividadId}» no está en la biblioteca`).toBeDefined();
        expect([f.actividad, f.etapa, f.comparte], `${c.id}: ${f.nombre}`).toEqual([a.nombre, a.etapa, a.comparte]);
        // Su tiempo sale de las partes de la actividad, con las veces que el caso cambie en las variables.
        expect(f.horasPorVez, `${c.id}: ${f.nombre}`).toBeCloseTo(a.horasPendientes ? 0 : horasDelReparto(f.reparto), 9);
      }
  });

  it("una fila que apunta a una actividad que no existe no se lee", () => {
    const roto = structuredClone(datos) as { casos: { actividades: { actividadId: string }[] }[] };
    roto.casos[0].actividades[0].actividadId = "no-existe";
    expect(() => leerActividades(roto)).toThrow(/no-existe/);
  });

  it("cada actividad es un registro completo: id estable, resumen, viñetas, cómo se cuenta y a qué equipos se aplica", () => {
    const ids = d.biblioteca.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const a of d.biblioteca) {
      expect(a.resumen.length, a.nombre).toBeGreaterThan(20);
      expect(a.incluye.length, a.nombre).toBeGreaterThan(0);
      expect(a.equipos.length, a.nombre).toBeGreaterThan(0);
      expect(a.unidad, a.nombre).toMatch(/^[a-záéíóúñ ]+$/);
      // Una actividad que algún caso lleva más de una vez se repite.
      if (d.casos.some((c) => c.actividades.some((f) => f.actividadId === a.id && f.veces > 1))) expect(a.seRepite, a.nombre).toBe(true);
    }
  });

  it("cada fila se llama por lo que hace: las de proceso dicen cuál proceso", () => {
    const deProceso = new Set(["Mapear el proceso actual", "Diseñar el proceso en HubSpot", "Implementar el proceso en HubSpot"]);
    for (const c of d.casos)
      for (const f of c.actividades) if (deProceso.has(f.actividad)) expect(f.nombre, `${c.id}: «${f.actividad}» sin el nombre del proceso`).not.toBe(f.actividad);
  });

  it("la sesión semanal del proyecto no va en los casos: la suma la venta", () => {
    for (const c of d.casos)
      for (const f of c.actividades) if (f.actividad === "Sesión de seguimiento") expect(f.sobreQue, c.id).not.toMatch(/proyecto|semanal/);
  });

  it("cada línea de «Lo que se entrega» tiene una fila que la hace posible", () => {
    for (const c of d.casos) {
      const sostenidas = new Set(c.actividades.flatMap((f) => f.sostiene));
      c.loQueSeEntrega.forEach((_, i) => expect(sostenidas.has(i), `${c.id}: la línea ${i} no tiene fila`).toBe(true));
      for (const f of c.actividades) for (const i of f.sostiene) expect(i).toBeLessThan(c.loQueSeEntrega.length);
    }
  });

  it("cada línea de «Lo que no incluye» sale de una fila sin marcar o de un camino", () => {
    for (const c of d.casos) {
      const nombradas = new Set(c.actividades.map((f) => f.siNoVa));
      const camino = new Set(c.lineasPorCamino.map((x) => x.indice));
      for (let i = 1; i < c.loQueNoIncluye.length; i++) expect(nombradas.has(i) || camino.has(i), `${c.id}: línea ${i}`).toBe(true);
      for (const f of c.actividades) if (f.siNoVa !== -1) expect(f.porDefecto, `${c.id}: ${f.actividad} marcada con siNoVa`).toBe(false);
    }
  });

  it("el tiempo de cada actividad es la suma de sus partes, y cada caso puede cambiar solo las variables", () => {
    for (const a of d.biblioteca) if (!a.horasPendientes) expect(horasDelReparto(a.partes), a.nombre).toBeCloseTo(a.horas, 9);
    // Las respuestas de Elías del 2026-11-05.
    const de = (n: string) => biblioteca.get(n)!;
    expect(de("Implementar el proceso en HubSpot").horas).toBe(3);
    expect(de("Configurar en HubSpot").horas).toBe(2);
    expect(de("Consensuar una configuración").horas).toBe(1);
    expect(de("Armar el diagnóstico de rendimiento").partes.map((p) => [p.horas, p.conElCliente])).toEqual([[1, true], [1, false]]);
    // El mapeo cuenta procesos: sus sesiones son la parte variable (dos sesiones + armar el mapa = 3 h).
    const mapeo = d.casos.find((c) => c.id === "sistematiza-ventas")!.actividades.find((f) => f.actividad === "Mapear el proceso actual")!;
    expect(mapeo.horasPorVez).toBe(3);
    const roto = structuredClone(datos) as { casos: { actividades: { actividadId: string; partes?: Record<string, number> }[] }[] };
    const fila = roto.casos[0].actividades.find((f) => f.actividadId === "kickoff")!;
    fila.partes = { sesion: 3 };
    expect(() => leerActividades(roto)).toThrow(/no es variable/);
  });

  it("lo que es con el cliente y lo interno suman las horas por defecto", () => {
    for (const c of d.casos) {
      const { conElCliente, internas } = horasConElCliente(c);
      expect(conElCliente + internas, c.id).toBeCloseTo(c.horasPorDefecto, 9);
    }
  });

  it("las horas de un caso no se guardan: se suman de sus filas", () => {
    for (const c of d.casos) expect(c.horasPorDefecto, c.id).toBeCloseTo(sumarPorDefecto(c), 5);
    const ventas = d.casos.find((c) => c.id === "sistematiza-ventas")!;
    expect(ventas.horasPorDefecto).toBe(32);
    for (const c of d.casos) if (c.requisito) expect(c.horasJuntoConSuRequerido, c.id).not.toBeNull();
  });

  it("los casos que se nombran aparte existen", () => {
    for (const c of d.casos) for (const x of c.casosAparte) expect(casoPorId(x.id), `${c.id} nombra a ${x.id}`).toBeDefined();
  });

  it("se habla en palabras simples: sin actividades genéricas, sin la «cosa» y siempre «consensuar»", () => {
    const texto = JSON.stringify(datos);
    // Lo que Elías fue sacando (2026-11-04 a 06): las genéricas, los nombres que no le hacían sentido y los grupos.
    // Y lo que Elías pidió el 2026-11-05: lo pequeño se hace de una (sin un «consensuar» aparte) y el plan de adopción se crea.
    for (const vieja of ["Explorar una mejora", "Mapear una mejora", "Mapear un proceso", "Explorar un equipo o proceso", "Cargar datos", "Diseñar una pieza", "Planificar la adopción y la capacitación", "Ajustar el plan de adopción", "Consensuar qué decide sola la IA", "Consensuar las reglas de", "mapa del grupo", "responde dudas del proceso", "Preparar un documento formal", "conviven las marcas en HubSpot", "mapa de temas"])
      expect(texto, vieja).not.toContain(vieja);
    for (const grupo of ["Implementar una mejora", "Definir un insumo"]) expect(biblioteca.has(grupo), grupo).toBe(false);
    expect(biblioteca.has("Armar el diagnóstico")).toBe(false);
    expect(texto).not.toContain('"comparte":"cosa"');
    expect(texto).not.toMatch(/\b[Cc]osas?\b/);
    expect(texto, "Elías: «consensuar», nunca «acordar»").not.toMatch(/\b[Aa]cord|\b[Aa]cuerd/);
  });

  it("la biblioteca son acciones del equipo: las configuraciones y los insumos van en pares, con su nombre en cada caso", () => {
    expect(d.biblioteca.length).toBeLessThan(40);
    for (const n of ["Consensuar una configuración", "Configurar en HubSpot", "Consensuar un insumo", "Cargar y documentar un insumo", "Poner al día un insumo"])
      expect(biblioteca.has(n), n).toBe(true);
    // Cada «Consensuar una configuración» que no es suelta tiene su «Configurar en HubSpot» con el mismo sobre qué.
    const sueltas = /etapas del ciclo de vida|cambios del mes/;
    for (const c of d.casos) {
      const configura = new Set(c.actividades.filter((f) => f.actividad === "Configurar en HubSpot").map((f) => f.sobreQue));
      for (const f of c.actividades)
        if (f.actividad === "Consensuar una configuración" && !sueltas.test(f.sobreQue)) expect(configura.has(f.sobreQue), `${c.id}: ${f.nombre}`).toBe(true);
      // Las filas dicen la configuración concreta, nunca el nombre de la acción.
      for (const f of c.actividades) if (f.actividad === "Configurar en HubSpot") expect(f.nombre, c.id).not.toBe("Configurar en HubSpot");
    }
    // Un asistente de Breeze se diseña y se configura, como un agente.
    expect(biblioteca.get("Diseñar un asistente")?.etapa).toBe("02-planificacion");
    expect(biblioteca.get("Configurar un asistente")?.etapa).toBe("03-implementacion");
  });
});

describe("las cuentas y los textos", () => {
  it("las horas y los dólares con coma decimal y punto de miles", () => {
    expect(formatoHoras(28.5)).toBe("28,5 h");
    expect(formatoHoras(4)).toBe("4 h");
    expect(formatoUsd(2280)).toBe("2.280 USD");
    expect(formatoUsd(12345.6)).toBe("12.346 USD");
  });

  it("el tiempo de una fila dice las veces y quién lo define si no hay tiempo", () => {
    expect(tiempoDeLaFila({ veces: 4, horasPorVez: 1, horasPendientes: false, quien: "CSE" })).toBe("4 × 1 h");
    expect(tiempoDeLaFila({ veces: 1, horasPorVez: 0, horasPendientes: true, quien: "Dev" })).toBe("Lo define Dev");
  });

  it("un texto largo se parte en oraciones, sin cortar adentro de unas comillas ni de un paréntesis", () => {
    expect(oraciones("Va siempre. Sube 1 si hay dos. Si no, sale.")).toEqual(["Va siempre.", "Sube 1 si hay dos.", "Si no, sale."]);
    expect(oraciones("Va con «Migra a HubSpot. Otra frase» y más. Fin.")).toEqual(["Va con «Migra a HubSpot. Otra frase» y más.", "Fin."]);
    expect(oraciones("Etapas (una por fase. Dos si hay leads) y datos.")).toHaveLength(1);
    expect(oraciones("Una sola oración")).toEqual(["Una sola oración"]);
  });

  it("lo compartido con el requisito no se cobra dos veces", () => {
    const f = (actividad: string, comparte: "venta" | "sobreQue" | "no", sobreQue = "", veces = 1) => ({ actividad, comparte, sobreQue, veces, porDefecto: true, horasPorVez: 2 });
    const caso = [f("Kickoff", "venta"), f("Conectar un canal", "sobreQue", "WhatsApp"), f("Conectar un canal", "sobreQue", "chat"), f("Capacitar", "no")];
    const otro = [f("Kickoff", "venta"), f("Conectar un canal", "sobreQue", "WhatsApp"), f("Capacitar", "no")];
    expect(horasCompartidas(caso, otro)).toBe(4);
    // Sin decir sobre qué se cobra siempre, como dice la ficha: no se descuenta aunque el otro caso tenga una igual.
    expect(horasCompartidas([f("Diseñar un asset de marketing", "sobreQue", "")], [f("Diseñar un asset de marketing", "sobreQue", "")])).toBe(0);
  });

  it("el período escrito de un caso recurrente dice las mismas horas que se calculan", () => {
    const conPeriodo = d.casos.filter((c) => c.periodo);
    expect(conPeriodo.length).toBeGreaterThan(0);
    for (const c of conPeriodo) {
      const primera = c.periodo.match(/(\d+(?:,\d+)?) h\b/)?.[1];
      expect(primera, `${c.id}: «${c.periodo}»`).toBe(formatoHoras(sumarPorDefecto(c)).replace(/ h$/, ""));
    }
  });

  it("el escenario base dice las horas por defecto que se calculan", () => {
    for (const c of d.casos) {
      const total = formatoHoras(sumarPorDefecto(c));
      if (sumarPorDefecto(c) > 0 && /suma \d/.test(c.escenarioBase)) expect(c.escenarioBase, c.id).toMatch(new RegExp(`suma ${total.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`));
    }
  });

  it("el «sobre qué» no se repite cuando el nombre ya lo dice", () => {
    expect(sobreQueAparte({ nombre: "Revisar uso y resultados a los 30 días", sobreQue: "a los 30 días" })).toBe("");
    expect(sobreQueAparte({ nombre: "Configurar la unidad de negocio", sobreQue: "la unidad de negocio: <marca o país>" })).toBe("");
    expect(sobreQueAparte({ nombre: "Importar los contactos y las empresas", sobreQue: "contactos y empresas" })).toBe("");
    expect(sobreQueAparte({ nombre: "Conectar un canal", sobreQue: "WhatsApp" })).toBe("WhatsApp");
    expect(sobreQueAparte({ nombre: "Importar los negocios abiertos", sobreQue: "contactos y empresas" })).toBe("contactos y empresas");
    expect(sobreQueAparte({ nombre: "Kickoff", sobreQue: "" })).toBe("");
  });

  it("cómo se cobra, sin la palabra «cosa»", () => {
    expect(comoSeCobra({ comparte: "sobreQue", sobreQue: "WhatsApp" })).toContain("sobre lo mismo («WhatsApp»)");
    expect(comoSeCobra({ comparte: "venta", sobreQue: "" })).toContain("Una vez en la venta");
    expect(comoSeCobra({ comparte: "no", sobreQue: "" })).toBe("Cada caso cobra la suya.");
  });

  it("la línea de casos aparte junta los que comparten palabras", () => {
    const titulos: Record<string, string> = { a: "Caso A", b: "Caso B", c: "Caso C" };
    const linea = lineaDeCasosAparte(
      [
        { id: "a", palabras: "las cotizaciones" },
        { id: "b", palabras: "rediseñar un área" },
        { id: "c", palabras: "rediseñar un área" },
      ],
      (id) => titulos[id],
    );
    expect(linea).toBe("Son casos aparte: las cotizaciones («Caso A») y rediseñar un área («Caso B» o «Caso C»).");
    expect(lineaDeCasosAparte([], () => undefined)).toBe("");
  });
});

describe("lo que se arma para la ficha", () => {
  const caso = (id: string) => d.casos.find((c) => c.id === id)!;

  it("«Lo que no incluye» nombra todas las filas que quitan una línea, y el camino también en la fija", () => {
    const migra = lineasDeLoQueNoIncluye(caso("migra-a-hubspot"));
    expect(migra.some((l) => l.seQuitaCon.length > 1)).toBe(true);
    for (const id of ["personalizacion-web", "carritos-abandonados", "recompra", "ficha-unica"]) {
      const c = caso(id);
      const conCamino = c.lineasPorCamino.map((x) => x.indice);
      const lineas = lineasDeLoQueNoIncluye(c);
      expect(lineas.filter((l) => l.camino).length, id).toBe(conCamino.filter((i) => c.loQueNoIncluye[i]).length);
    }
    expect(textoDeSeQuita(["«A»"])).toBe("Se quita si se marca «A».");
    expect(textoDeSeQuita(["«A»", "«B»", "«C»"])).toBe("Se quita si se marcan «A», «B» y «C».");
  });

  it("lo que necesitamos del cliente suma lo que pide cada actividad marcada", () => {
    const lineas = loQueSePideAlCliente(caso("whatsapp"), d.biblioteca);
    expect(lineas.some((l) => l.de === "Conectar un canal" && l.texto.includes("Meta Business"))).toBe(true);
    // Ningún caso se queda sin decir qué necesita del cliente.
    for (const c of d.casos) expect(loQueSePideAlCliente(c, d.biblioteca).length, c.id).toBeGreaterThan(0);
  });

  it("la tarjeta no esconde lo que define Dev ni que un caso recurrente se cuenta por período", () => {
    for (const c of d.casos) {
      const e = etiquetaDeHoras(c);
      if (c.actividades.some((f) => f.porDefecto && f.horasPendientes)) expect(e, c.id).toContain(" + ");
      if (c.periodo) expect(e, c.id).toContain("el primer trimestre");
      else expect(e, c.id).toMatch(/por defecto$/);
    }
  });
});
