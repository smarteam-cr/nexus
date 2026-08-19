/**
 * lib/sessions/match-por-titulo.test.ts
 *
 * Correr: `npx vitest run lib/sessions/match-por-titulo.test.ts --project unit`.
 *
 * Los casos NO son inventados: los tres primeros son adjudicaciones REALES que produjo el matcher
 * viejo en produccion, medidas el 2026-08-19. Los negativos tambien salen del corpus real, y son
 * los que impiden que "arreglar" el matcher rompa la resolucion de clientes que hoy funciona.
 */
import { describe, it, expect } from "vitest";
import { clientePorTitulo, tokensExigidos, type ClienteParaMatch } from "./match-por-titulo";

/** Copia minima de lo que categorize.ts inyecta. Sin tildes, minusculas. */
const normalize = (s: string) =>
  s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STOP = new Set(["para", "sesion", "reunion", "proyecto", "revision", "handoff", "kickoff"]);
const skip = (w: string) => STOP.has(w);
const esClienteDePrueba = (n: string) => /empresa para pruebas|\btest\b/i.test(n);

const C = (id: string, name: string, company: string | null = null): ClienteParaMatch => ({
  id,
  name,
  company,
});

const CLIENTES = [
  C("smartagro", "SmartAgro", "smartagrocr.com"),
  C("ecoquintas", "Ecoquintas", "ecoquintas.com"),
  C("global", "Global Supply S.A", "globalsupply.co.cr"),
  C("metzger", "Metzger Supplies", "metzger.com"),
  C("donjuan", "Don Juan Tours", null),
  C("visual", "Visual Branding", null),
  C("honda", "Honda Costa Rica", null),
  C("plastimex", "Plastimex", null),
  C("wherex", "Wherex", "wherex.com"),
];

function match(titulo: string, modo: "una-palabra" | "dos-palabras") {
  return clientePorTitulo(titulo, CLIENTES, { modo, skip, normalize, esClienteDePrueba });
}

describe("los tres casos reales que el matcher viejo adjudico mal", () => {
  it("«SmartAgro | Flyer + Sitio web» era de SmartAgro, no de Ecoquintas", () => {
    // El nombre viejo del cliente era "ECOQUINTAS | Sitio web" y la palabra «sitio» ganaba.
    // Ya se renombro, pero la regla que lo permitio sigue siendo la misma.
    expect(match("SmartAgro | Flyer + Sitio web", "dos-palabras").cliente?.id).toBe("smartagro");
  });

  it("«HandOff | Metzger Supply» deja de ser de Global Supply", () => {
    const viejo = match("HandOff | Metzger Supply", "una-palabra");
    expect(viejo.candidatos.map((c) => c.id)).toContain("global");
    const nuevo = match("HandOff | Metzger Supply", "dos-palabras");
    expect(nuevo.cliente?.id, "«supply» sola no puede adjudicar a Global Supply").not.toBe("global");
  });

  it("«Revisión Cotización Visual Branding - Juan Carlos» deja de ser de Don Juan Tours", () => {
    const t = "Revision Cotizacion Visual Branding - Juan Carlos";
    expect(match(t, "una-palabra").candidatos.map((c) => c.id)).toContain("donjuan");
    const nuevo = match(t, "dos-palabras");
    expect(nuevo.cliente?.id, "el Juan del titulo es una persona").toBe("visual");
  });
});

describe("lo que NO se puede romper al arreglarlo", () => {
  it("un cliente de una sola palabra sigue resolviendo con una", () => {
    /* «Dos si el nombre da para dos», nunca «dos siempre». Exigirle dos a Plastimex lo dejaria
       sin resolucion por titulo para siempre — la misma clase de bug, al reves. */
    expect(tokensExigidos(1, "dos-palabras")).toBe(1);
    expect(match("Avance Plastimex", "dos-palabras").cliente?.id).toBe("plastimex");
    expect(match("Wherex - migracion", "dos-palabras").cliente?.id).toBe("wherex");
  });

  it("con el nombre completo en el titulo, el de dos palabras resuelve igual", () => {
    expect(match("Don Juan Tours - arranque", "dos-palabras").cliente?.id).toBe("donjuan");
    expect(match("Global Supply S.A | cierre", "dos-palabras").cliente?.id).toBe("global");
  });

  it("⚠ EL COSTO CONOCIDO: «HONDA Y KOLBI» deja de encontrar a Honda Costa Rica", () => {
    /* Este test NO celebra el comportamiento: lo CONGELA para que nadie se sorprenda. El equipo
       escribe «HONDA» y el cliente se llama «Honda Costa Rica», asi que la regla nueva le pide
       una segunda palabra que el titulo nunca va a tener.
       Es exactamente el riesgo que hace que esta tanda NO aplique nada sin la medicion. */
    expect(match("CASOS DE USO + DIAGNOSTICO | HONDA Y KOLBI", "una-palabra").cliente?.id).toBe("honda");
    expect(match("CASOS DE USO + DIAGNOSTICO | HONDA Y KOLBI", "dos-palabras").cliente).toBeNull();
  });
});

describe("ante dos candidatos, ninguno", () => {
  it("el modo nuevo se abstiene en vez de quedarse con el primero", () => {
    const r = match("Metzger Supplies y Global Supply juntos", "dos-palabras");
    expect(r.candidatos.length).toBeGreaterThan(1);
    expect(r.cliente, "elegir el primero del array es adivinar").toBeNull();
    expect(r.motivo).toBe("empate");
  });

  it("el modo viejo conserva el comportamiento historico, o la medicion no diria nada", () => {
    /* Si el modo «una-palabra» tambien se abstuviera, dejaria de ser el de produccion y comparar
       los dos no mediria la diferencia real. */
    const r = match("Metzger Supplies y Global Supply juntos", "una-palabra");
    expect(r.candidatos.length).toBeGreaterThan(1);
    expect(r.cliente).not.toBeNull();
  });
});

describe("los bordes", () => {
  it("un titulo sin palabras utiles no adjudica nada", () => {
    expect(match("Sesion", "dos-palabras").motivo).toBe("titulo-sin-tokens");
    expect(match("", "dos-palabras").cliente).toBeNull();
  });

  it("los clientes de prueba nunca matchean por titulo", () => {
    const conPrueba = [...CLIENTES, C("test", "Empresa para pruebas")];
    const r = clientePorTitulo("pruebas de la empresa", conPrueba, {
      modo: "dos-palabras",
      skip,
      normalize,
      esClienteDePrueba,
    });
    expect(r.candidatos.map((c) => c.id)).not.toContain("test");
  });

  it("un cliente sin tokens utiles no participa", () => {
    expect(tokensExigidos(0, "dos-palabras")).toBe(Infinity);
  });
});

describe("la regla que la medicion eligio: gana quien nombro MAS de si mismo", () => {
  const esLaCasa = (c: ClienteParaMatch) => c.id === "smarteam";
  const CON_CASA = [...CLIENTES, C("smarteam", "Smarteam", "smarteamcr.com")];
  const mf = (titulo: string) =>
    clientePorTitulo(titulo, CON_CASA, {
      modo: "mejor-fraccion",
      skip,
      normalize,
      esClienteDePrueba,
      esLaCasa,
    });

  it("«Juan Carlos» pierde contra «Visual Branding», que nombro su identidad entera", () => {
    // Visual Branding: 2 de 2 tokens. Don Juan Tours: 1 de 3. No se sube la vara, se COMPARA.
    expect(mf("Revision Cotizacion Visual Branding - Juan Carlos").cliente?.id).toBe("visual");
  });

  it("y NO le cuesta las atribuciones correctas que «dos palabras» perdia", () => {
    /* Este es el punto entero. Medido el 2026-08-19 sobre 3.520 reuniones: «dos palabras» hacia
       perder el dueno a 316; «mejor fraccion» a 34, y las 34 son empates de verdad. */
    expect(mf("Revision de procesos para Metzger").cliente?.id).toBe("metzger");
    expect(mf("**Tentativo Recurrencia Gerencia HONDA").cliente?.id).toBe("honda");
    expect(mf("Avance Plastimex").cliente?.id).toBe("plastimex");
  });

  it("LA CASA no le gana a un cliente: «Kickoff WHEREX & Smarteam» es de Wherex", () => {
    /* «Cliente & Smarteam» es el formato estandar de los titulos del equipo, y Smarteam es un
       Client mas en la base: nombra su identidad entera y empata con TODOS. Medido: el desempate
       de la casa baja los empates de 65 a 34 y convierte 15 en atribuciones correctas. */
    expect(mf("**Tentativo Kickoff WHEREX & Smarteam").cliente?.id).toBe("wherex");
    expect(mf("Demo Interna Plastimex & Smarteam").cliente?.id).toBe("plastimex");
  });

  it("pero la casa SI gana cuando esta sola — las internas de Smarteam sobre si misma", () => {
    expect(mf("Operacion Smarteam").cliente?.id).toBe("smarteam");
  });

  it("y ante dos CLIENTES de verdad se abstiene: eso es la sala repartida, otro problema", () => {
    const r = mf("Demos internas - Metzger Supplies y Global Supply");
    expect(r.cliente, "con dos clientes nombrados, elegir uno es adivinar").toBeNull();
    expect(r.motivo).toBe("empate");
  });
});

describe("la casa se retira ANTES de comparar, no desempata", () => {
  /* ⚠ ESTE DESCRIBE EXISTE PORQUE LA SUITE TENIA UN AGUJERO EXACTAMENTE ACA. El filtro de la casa
     corria DESPUES de elegir la mejor fraccion, asi que solo actuaba ante un empate — y la casa
     casi nunca empata: «Smarteam» es UNA palabra, o sea 100 % de su nombre, mientras «Honda Costa
     Rica» con el titulo «Honda & Smarteam» llega al 33 %. Los 16 tests de arriba pasaban igual.
     Lo cazo LEER las 114 sesiones que se movian, no un test. */
  const esLaCasa = (c: ClienteParaMatch) => c.id === "smarteam";
  const CON_CASA = [
    ...CLIENTES,
    C("smarteam", "Smarteam", "smarteamcr.com"),
    C("realst", "Real Shipping & Trade", null),
  ];
  const mf = (titulo: string) =>
    clientePorTitulo(titulo, CON_CASA, {
      modo: "mejor-fraccion",
      skip,
      normalize,
      esClienteDePrueba,
      esLaCasa,
    });

  it("un cliente de nombre LARGO le gana a la casa aunque nombre menos de si mismo", () => {
    // Honda Costa Rica: 1 de 3 tokens. Smarteam: 1 de 1. Sin el arreglo, ganaba Smarteam.
    expect(mf("Revision de gestion de segmentacion | Honda & Smarteam").cliente?.id).toBe("honda");
    expect(mf("HONDA FACO | SMARTEAM").cliente?.id).toBe("honda");
  });

  it("y con el nombre abreviado tambien: «Real ST & Smarteam» es de Real Shipping", () => {
    // «Real ST» solo aporta «real» → 1 de 3. La casa igual no compite.
    expect(mf("Reanudacion proyecto en HubSpot | Real ST & Smarteam").cliente?.id).toBe("realst");
  });

  it("la casa sigue ganando cuando esta sola", () => {
    expect(mf("Operacion Smarteam").cliente?.id).toBe("smarteam");
    expect(mf("Comisiones Smarteam").cliente?.id).toBe("smarteam");
  });
});
