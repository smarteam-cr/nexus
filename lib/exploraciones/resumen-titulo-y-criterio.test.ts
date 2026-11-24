/**
 * lib/exploraciones/resumen-titulo-y-criterio.test.ts — los cambios del 24 nov al Resumen de La escala, después de que
 * Elías probara Centauro Solutions y Cemaco · Ecuador: el resumen de la portada y «Quién es quién» (las únicas piezas con
 * nombres de la gente de la empresa), los números que la empresa dijo en otra intervención (sin perder la pieza al
 * acortarla) y lo que ya se resolvió en la misma reunión. El título y la línea de arriba tienen sus pruebas en
 * portada-lo-que-hicimos.test.ts y linea-de-la-escala.test.ts.
 */
import { describe, expect, it } from "vitest";
import { parseObject } from "@/lib/ai/section-schema";
import { leerResumenGuardado } from "./esquemas";
import {
  citasDeSusNumeros,
  escribirElResumen,
  leerElResumen,
  leerLoResuelto,
  lineaDelMapa,
  numerosDistintivos,
  pedidoDeLoResuelto,
  pedidoDelResumen,
  piezasParaLoResuelto,
  sinLoResuelto,
  citaVerificada,
  esDeSmarteamPorElNombre,
  type ContextoDelResumen,
  type ReunionParaElResumen,
} from "./resumen-de-la-escala";

const SOPORTE: ReunionParaElResumen = {
  id: "gmeet_soporte",
  clave: "R1",
  fecha: "2026-11-06T20:00:00.000Z",
  equipo: "Servicio",
  areaId: "3",
  delCliente: ["Emiley Calvo Jiménez", "Luis Humberto Rodríguez Acevedo"],
  deSmarteam: ["Marco Salas"],
  turnos: [
    { n: 10, hablante: "Emiley Calvo Jiménez", texto: "Yo soy Emiley, llevo onboarding y soporte con el equipo de casa matriz desde hace dos años." },
    { n: 40, hablante: "Emiley Calvo Jiménez", texto: "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados." },
    { n: 41, hablante: "Marco Salas", texto: "Okay. Y eso son unos 1800 al mes, ¿verdad?" },
    { n: 42, hablante: "Emiley Calvo Jiménez", texto: "Sí, de esos 1800, 100 son de facturas y el resto es de uso." },
    { n: 60, hablante: "Luis Humberto Rodríguez Acevedo", texto: "el churn lo tenemos en un 2,8% mensual más o menos, eso nos preocupa bastante." },
  ],
};

const EXTRANET: ReunionParaElResumen = {
  id: "gmeet_extranet",
  clave: "R2",
  fecha: "2026-11-10T22:30:00.000Z",
  equipo: null,
  delCliente: ["Luis Humberto Rodríguez Acevedo"],
  deSmarteam: ["Marco Salas"],
  turnos: [
    { n: 5, hablante: "Luis Humberto Rodríguez Acevedo", texto: "la extranet no es para nada amigable con sincronizaciones ni abierta para comunicarse con otras herramientas." },
    { n: 30, hablante: "Marco Salas", texto: "Lo que podemos hacer es exportar un Excel diario desde la extranet y HubSpot lo toma solo." },
    { n: 31, hablante: "Luis Humberto Rodríguez Acevedo", texto: "Perfecto, con eso nos basta, armemos el caso bajo lo que es posible hoy." },
    { n: 200, hablante: "Luis Humberto Rodríguez Acevedo", texto: "y por eso ya lo dejamos así con el Excel, lo armamos con lo que es posible hoy." },
    { n: 210, hablante: "Marco Salas", texto: "Y para eso vamos a sincronizar la extranet con el CRM en el proyecto, sin problema." },
  ],
};

const CTX: ContextoDelResumen = {
  empresa: "Centauro Solutions",
  reuniones: [SOPORTE, EXTRANET],
  instrucciones: "",
  areas: [{ id: "3", nombre: "Servicio", nivel: null, arriba: null, abajo: null, loQueMasFrena: null, dimensiones: [], contexto: null }],
  gente: ["Emiley Calvo Jiménez", "Luis Humberto Rodríguez Acevedo", "Catalina Calvo", "Fernando Segura"],
};
const REGLAS = { personas: ["Marco Salas", "Emiley Calvo Jiménez", "Luis Humberto Rodríguez Acevedo", "Catalina Calvo", "Fernando Segura"], parse: parseObject, firmas: {} };
const C = (reunion: string, turno: number, texto: string) => ({ reunion, turno, texto });
const responde = (x: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(x), citations: null }] });

describe("los números que distinguen un dato", () => {
  it("de tres cifras o con decimales, con su valor canónico; ni los chicos ni los años", () => {
    expect(numerosDistintivos("~1.800 tickets al mes").map((x) => x.valor)).toEqual(["1800"]);
    expect(numerosDistintivos("de esos 1800, 100 son de facturas").map((x) => x.valor)).toEqual(["1800", "100"]);
    expect(numerosDistintivos("Churn mensual del 2,8 %").map((x) => x.valor)).toEqual(["2.8"]);
    expect(numerosDistintivos("un 2.8% mensual").map((x) => x.valor)).toEqual(["2.8"]);
    expect(numerosDistintivos("23 000 contactos y 1,800 tickets").map((x) => x.valor)).toEqual(["23000", "1800"]);
    expect(numerosDistintivos("3 asesores desde 2025")).toEqual([]);
  });
});

describe("⛔ un número que la empresa dijo en otra intervención se cita, no se pierde (24 nov, Centauro)", () => {
  it("busca la intervención de la EMPRESA que lo dice, en la reunión de su cita; nunca la de Smarteam", () => {
    const cita = citaVerificada(C("R1", 40, "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados"), CTX.reuniones)!;
    const mas = citasDeSusNumeros("~1.800 tickets al mes sin centralizar", [cita], CTX.reuniones);
    expect(mas.map((c) => [c.turno, c.hablante])).toEqual([[42, "Emiley Calvo Jiménez"]]);
    expect(mas[0].texto).toContain("1800");
  });

  it("en otra reunión, solo si una sola intervención de la empresa lo dice", () => {
    const cita = citaVerificada(C("R2", 5, "la extranet no es para nada amigable con sincronizaciones"), CTX.reuniones)!;
    expect(citasDeSusNumeros("Churn mensual del 2,8 %", [cita], CTX.reuniones).map((c) => c.turno)).toEqual([60]);
    // «1800 hospedajes» en otra reunión no habla de tickets: no cuenta, y queda una sola intervención que sí.
    const otra: ReunionParaElResumen = { ...EXTRANET, id: "gmeet_otra", clave: "R3", turnos: [{ n: 1, hablante: "Luis Humberto Rodríguez Acevedo", texto: "tenemos 1800 hospedajes activos en la extranet hoy en día." }] };
    expect(citasDeSusNumeros("1.800 tickets", [cita], [SOPORTE, EXTRANET, otra]).map((c) => c.turno)).toEqual([42]);
    // Dos reuniones que hablan de 1800 tickets, ninguna la de la cita: no se sabe de cuál habla.
    const dos: ReunionParaElResumen = { ...EXTRANET, id: "gmeet_dos", clave: "R4", turnos: [{ n: 1, hablante: "Luis Humberto Rodríguez Acevedo", texto: "en soporte entran como 1800 tickets cada mes por todos los canales." }] };
    expect(citasDeSusNumeros("1.800 tickets", [cita], [SOPORTE, EXTRANET, dos])).toEqual([]);
  });

  it("el punto clave con el número en el título y la cita sin él pasa, con las dos citas", () => {
    const e = leerElResumen(
      responde({
        areas: [{ nombre: "Soporte", area: "3", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null }],
        puntos: [
          {
            titulo: "~1.800 tickets al mes sin centralizar",
            texto: "Los tickets llegan por WhatsApp y por correo y no quedan centralizados.",
            area: "3",
            citas: [C("R1", 40, "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados")],
          },
        ],
      }),
      CTX,
      REGLAS,
    );
    expect(e.puntos.map((p) => p.titulo)).toEqual(["~1.800 tickets al mes sin centralizar"]);
    expect(e.puntos[0].citas.map((c) => c.turno)).toEqual([40, 42]);
  });

  it("un número que la empresa nunca dijo sigue sin pasar", () => {
    const e = leerElResumen(
      responde({
        areas: [{ nombre: "Soporte", area: "3", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null }],
        puntos: [{ titulo: "~2.500 tickets al mes", texto: "Los tickets llegan por WhatsApp y no quedan centralizados.", area: "3", citas: [C("R1", 40, "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados")] }],
      }),
      CTX,
      REGLAS,
    );
    expect(e.puntos).toEqual([]);
  });
});

describe("Quién es quién: los nombres de la gente de la empresa, y nada más (24 nov)", () => {
  const cita = [C("R1", 10, "Yo soy Emiley, llevo onboarding y soporte con el equipo de casa matriz")];
  const linea = (texto: string, citas = cita) => {
    const descartados: string[] = [];
    return { l: lineaDelMapa({ texto, citas }, CTX, REGLAS, descartados), descartados };
  };

  it("una línea con la gente de la empresa pasa, también con su diminutivo", () => {
    expect(linea("Soporte y onboarding: Emiley").l?.texto).toBe("Soporte y onboarding: Emiley");
    expect(linea("Marketing: Cata").l?.texto).toBe("Marketing: Cata");
    expect(linea("Lidera: Fernando, gerente general").l?.texto).toBe("Lidera: Fernando, gerente general");
    expect(linea("Gerencia general: Fernando").l?.texto).toBe("Gerencia general: Fernando");
  });

  it("⛔ nunca alguien de Smarteam, ni alguien que no habló y su cita no nombra", () => {
    expect(linea("Soporte: Emiley y Marco").l).toBeNull();
    const { l, descartados } = linea("Ventas: Laura y los asesores");
    expect(l).toBeNull();
    expect(descartados.join(" ")).toMatch(/Laura/);
  });

  it("⛔ nunca un dolor pegado a una persona, y siempre de qué equipo es", () => {
    expect(linea("Soporte: Emiley, que no registra los tickets").l).toBeNull();
    expect(linea("Emiley lleva soporte").l).toBeNull();
    // Lo de antes de los dos puntos es quién lidera o un equipo (Centauro: «También mencionado: Eduardo…»).
    expect(linea("También mencionado: Emiley").l).toBeNull();
  });

  it("el prompt pide las dos partes nuevas, piezas cortas y deja los nombres solo para «quienes»", () => {
    const p = pedidoDelResumen(CTX);
    expect(p.system).toContain("«portada» (1 o 2 párrafos)");
    expect(p.system).toContain("«quienes» (QUIÉN ES QUIÉN");
    expect(p.system).toContain("Ningún texto pasa de 240 caracteres");
    expect(JSON.stringify(p.messages)).toContain("La gente de la EMPRESA (los únicos nombres de «quienes»)");
  });
});

describe("⛔ lo que ya se resolvió en la misma reunión no le llega al cliente (24 nov, la extranet de Centauro)", () => {
  const extranet = citaVerificada(C("R2", 5, "la extranet no es para nada amigable con sincronizaciones ni abierta"), CTX.reuniones)!;
  const e = {
    puntos: [{ id: "k1", titulo: "La extranet no tiene API", texto: "La extranet no se comunica con otras herramientas.", areaId: null, citas: [extranet] }],
    operativas: [],
    recorrido: [{ id: "s1", nombre: "Monitoreo", quien: "Customer Success", texto: "Revisión uno por uno", friccion: "La extranet no se sincroniza", citas: [extranet] }],
    pendientes: [],
  };

  it("el pedido lleva lo que se dijo DESPUÉS de cada problema en su reunión", () => {
    const piezas = piezasParaLoResuelto(e, CTX.reuniones);
    expect(piezas.map((p) => p.lugar)).toEqual(["punto:k1", "etapa:s1"]);
    const pedido = JSON.stringify(pedidoDeLoResuelto(piezas, CTX.reuniones).messages);
    expect(pedido).toContain("exportar un Excel diario");
    expect(pedido).not.toContain("1800");
  });

  it("se quita solo con una cita verificada de después del problema; la fricción se va y el paso queda", () => {
    const piezas = piezasParaLoResuelto(e, CTX.reuniones);
    const resueltas = leerLoResuelto(
      responde({ resueltos: [{ i: 0, turno: 31, cita: "Perfecto, con eso nos basta, armemos el caso bajo lo que es posible hoy", como: "exportan un Excel diario" }, { i: 1, turno: 31, cita: "con eso nos basta, armemos el caso bajo lo que es posible hoy" }] }),
      piezas,
      CTX.reuniones,
      parseObject,
    );
    expect(resueltas.map((x) => x.lugar)).toEqual(["punto:k1", "etapa:s1"]);
    expect(resueltas[0].motivo).toMatch(/ya está resuelto en la misma reunión \(R2, intervención 31/);
    const limpio = sinLoResuelto(e, resueltas.map((x) => x.lugar));
    expect(limpio.puntos).toEqual([]);
    expect(limpio.recorrido.map((x) => [x.nombre, x.friccion])).toEqual([["Monitoreo", null]]);
  });

  it("⛔ lo que propone Smarteam no resuelve nada por sí solo: hace falta la empresa al lado, y la prueba es lo que ella dijo", () => {
    const piezas = piezasParaLoResuelto(e, CTX.reuniones);
    // Marco propone (30) y Luis Humberto acepta en la intervención siguiente (31): vale, con lo de Luis Humberto como prueba.
    const conLaEmpresa = leerLoResuelto(responde({ resueltos: [{ i: 0, turno: 30, cita: "Lo que podemos hacer es exportar un Excel diario desde la extranet" }] }), piezas, CTX.reuniones, parseObject);
    expect(conLaEmpresa.map((x) => x.motivo)).toEqual([expect.stringMatching(/intervención 31: «Perfecto, con eso nos basta/)]);
    // Marco propone sincronizar en el proyecto (210) y nadie de la empresa dice nada: no vale.
    const lejos = { ...e, puntos: [{ ...e.puntos[0], citas: [citaVerificada(C("R2", 200, "y por eso ya lo dejamos así con el Excel, lo armamos"), CTX.reuniones)!] }] };
    const sola = leerLoResuelto(responde({ resueltos: [{ i: 0, turno: 210, cita: "vamos a sincronizar la extranet con el CRM en el proyecto" }] }), piezasParaLoResuelto(lejos, CTX.reuniones), CTX.reuniones, parseObject);
    expect(sola).toEqual([]);
  });

  it("una cita inventada, de antes del problema o lejos de él no quita nada", () => {
    const piezas = piezasParaLoResuelto(e, CTX.reuniones);
    const nada = leerLoResuelto(
      responde({
        resueltos: [
          { i: 0, turno: 31, cita: "ya lo resolvimos con una integración nueva que funciona perfecto" },
          { i: 0, turno: 5, cita: "la extranet no es para nada amigable con sincronizaciones" },
          { i: 1, turno: 200, cita: "ya lo dejamos así con el Excel, lo armamos con lo que es posible hoy" },
        ],
      }),
      piezas,
      CTX.reuniones,
      parseObject,
    );
    expect(nada).toEqual([]);
  });
});

describe("la corrida entera: lo resuelto sale y entra el siguiente punto clave", () => {
  it("la revisión de lo resuelto va al final; con un punto resuelto, quedan los cinco siguientes en orden de peso", async () => {
    const punto = (titulo: string, reunion: string, turno: number, texto: string) => ({ titulo, texto: `${titulo}: lo cuenta la empresa en su reunión.`, area: null, citas: [C(reunion, turno, texto)] });
    const tickets = "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados";
    const respuesta = {
      areas: [
        {
          nombre: "Soporte",
          area: "3",
          organizacion: [],
          bien: [],
          frena: [{ texto: "Tickets sin centralizar en el sistema", citas: [C("R1", 40, tickets)] }],
          retos: [
            { texto: "Centralizar los tickets que llegan por WhatsApp", dimension: null, citas: [C("R1", 40, tickets)] },
            { texto: "Separar los tickets de uso de los de facturas", dimension: null, citas: [C("R1", 42, "de esos 1800, 100 son de facturas y el resto es de uso")] },
          ],
          cifras: [],
          falta: null,
        },
      ],
      puntos: [
        punto("La extranet no se comunica", "R2", 5, "la extranet no es para nada amigable con sincronizaciones ni abierta"),
        ...["Ana", "Beto", "Ceci", "Dani", "Eva", "Fede"].map((t) => punto(`Tickets dispersos ${t}`, "R1", 40, tickets)),
      ],
    };
    const usage = { input_tokens: 10, output_tokens: 5 } as never;
    const pedidos: number[] = [];
    const e = await escribirElResumen({ ctx: CTX, personas: REGLAS.personas, firmas: {} }, async (p) => {
      pedidos.push(p.max_tokens);
      const x = p.max_tokens === 1500 ? { resueltos: [{ i: 0, turno: 31, cita: "Perfecto, con eso nos basta, armemos el caso bajo lo que es posible hoy" }] } : respuesta;
      return { ...responde(x), usage, stop_reason: "end_turn" as const };
    });
    expect(pedidos.at(-1)).toBe(1500);
    expect(e.puntos.map((p) => p.titulo)).toEqual(["Tickets dispersos Ana", "Tickets dispersos Beto", "Tickets dispersos Ceci", "Tickets dispersos Dani", "Tickets dispersos Eva"]);
    expect(e.descartados.join(" ")).toMatch(/«La extranet no se comunica»: ya está resuelto en la misma reunión \(R2, intervención 31/);
  });
});

describe("lo que encontró la revisión del 24 nov", () => {
  it("⛔ el número que se rescata tiene que hablar de lo mismo: «1.800 dólares de licencia» no sostiene «1.800 tickets»", () => {
    const licencia: ReunionParaElResumen = {
      ...SOPORTE,
      turnos: [
        SOPORTE.turnos[1],
        { n: 70, hablante: "Emiley Calvo Jiménez", texto: "y por la licencia del sistema pagamos como 1.800 dólares al año, más o menos." },
      ],
    };
    const cita = citaVerificada(C("R1", 40, "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados"), [licencia])!;
    expect(citasDeSusNumeros("~1.800 tickets al mes sin centralizar", [cita], [licencia])).toEqual([]);
  });

  it("«de esos 1800» retoma lo que se dijo antes: vale si ahí se hablaba de lo mismo (Centauro, 6 nov); la licencia no", () => {
    const real: ReunionParaElResumen = {
      ...SOPORTE,
      turnos: [
        { n: 970, hablante: "Emiley Calvo Jiménez", texto: "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados." },
        { n: 977, hablante: "Marco Salas", texto: "¿Qué volumetría? Ajá." },
        { n: 978, hablante: "Emiley Calvo Jiménez", texto: "Tiquetes." },
        { n: 980, hablante: "Emiley Calvo Jiménez", texto: "Ajá. Aproximadamente unos 100" },
        { n: 981, hablante: "Marco Salas", texto: "Okay. 1800 al mes." },
        { n: 1001, hablante: "Emiley Calvo Jiménez", texto: "pero por ejemplo de esos 1800, 100 son de facturas," },
        { n: 1010, hablante: "Emiley Calvo Jiménez", texto: "y por la licencia pagamos como 1.800 dólares al año, más o menos." },
      ],
    };
    const cita = citaVerificada(C("R1", 970, "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados"), [real])!;
    expect(citasDeSusNumeros("~1.800 tickets al mes sin centralizar", [cita], [real]).map((c) => c.turno)).toEqual([1001]);
    // Sin la intervención que retoma, la de la licencia (más cerca de nada que hable de tickets) no sostiene el número.
    const sinRetomar = { ...real, turnos: real.turnos.filter((t) => t.n !== 1001) };
    expect(citasDeSusNumeros("~1.800 tickets al mes sin centralizar", [cita], [sinRetomar])).toEqual([]);
  });

  it("entiende «23 mil» y «2.000»; un año no distingue nada", () => {
    expect(numerosDistintivos("tenemos como 23 mil contactos").map((x) => x.valor)).toEqual(["23000"]);
    expect(numerosDistintivos("~2.000 tickets al mes").map((x) => x.valor)).toEqual(["2000"]);
    expect(numerosDistintivos("desde 2025 lo hacemos así")).toEqual([]);
    const base: ReunionParaElResumen = { ...SOPORTE, turnos: [{ n: 5, hablante: "Emiley Calvo Jiménez", texto: "en la base de contactos tenemos como 23 mil contactos activos." }, SOPORTE.turnos[1]] };
    const cita = citaVerificada(C("R1", 40, "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados"), [base])!;
    expect(citasDeSusNumeros("23.000 contactos en la base", [cita], [base]).map((c) => c.turno)).toEqual([5]);
  });

  it("una pieza con sus tres citas no recibe una cuarta: se cae como antes", () => {
    const tres = [10, 40, 60].map((n) => citaVerificada(C("R1", n, SOPORTE.turnos.find((t) => t.n === n)!.texto.slice(0, 60)), CTX.reuniones)!);
    const descartados: string[] = [];
    const l = leerElResumen(
      responde({
        areas: [{ nombre: "Soporte", area: "3", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null }],
        puntos: [{ titulo: "Tickets sin centralizar en la extranet", texto: "Son ~1.800 tickets al mes sin centralizar.", area: "3", citas: tres.map((c) => C("R1", c.turno, c.texto)) }],
      }),
      CTX,
      REGLAS,
    );
    void descartados;
    // Con dos citas, la misma pieza sí recibe la del número (la intervención 42).
    expect(l.puntos).toEqual([]);
    const dos = leerElResumen(
      responde({
        areas: [{ nombre: "Soporte", area: "3", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null }],
        puntos: [{ titulo: "Tickets sin centralizar en la extranet", texto: "Son ~1.800 tickets al mes sin centralizar.", area: "3", citas: tres.slice(1).map((c) => C("R1", c.turno, c.texto)) }],
      }),
      CTX,
      REGLAS,
    );
    expect(dos.puntos[0]?.citas.map((c) => c.turno)).toEqual([40, 60, 42]);
  });

  it("⛔ en lo resuelto, una objeción o una queja de la empresa no cuenta como un sí", () => {
    const extranet = citaVerificada(C("R2", 5, "la extranet no es para nada amigable con sincronizaciones ni abierta"), CTX.reuniones)!;
    const conObjecion: ReunionParaElResumen = {
      ...EXTRANET,
      turnos: [
        EXTRANET.turnos[0],
        { n: 29, hablante: "Luis Humberto Rodríguez Acevedo", texto: "la extranet nos complica muchísimo el trabajo de todos los días con los clientes" },
        EXTRANET.turnos[1],
        { n: 31, hablante: "Luis Humberto Rodríguez Acevedo", texto: "No, eso no nos sirve, necesitamos que se sincronice solo con el CRM." },
      ],
    };
    const reuniones = [SOPORTE, conObjecion];
    const e = { puntos: [{ id: "k1", titulo: "La extranet no tiene API", texto: "No se comunica.", areaId: null, citas: [extranet] }], operativas: [], recorrido: [], pendientes: [] };
    const piezas = piezasParaLoResuelto(e, reuniones);
    expect(leerLoResuelto(responde({ resueltos: [{ i: 0, turno: 30, cita: "Lo que podemos hacer es exportar un Excel diario desde la extranet" }] }), piezas, reuniones, parseObject)).toEqual([]);
    expect(leerLoResuelto(responde({ resueltos: [{ i: 0, turno: 31, cita: "No, eso no nos sirve, necesitamos que se sincronice solo" }] }), piezas, reuniones, parseObject)).toEqual([]);
  });

  it("⛔ quién es quién: ni alguien de Smarteam que comparte nombre con un apellido de la empresa, ni un dolor antes de los dos puntos, ni nombres sin la gente de la empresa", () => {
    const conAna: ContextoDelResumen = { ...CTX, gente: [...(CTX.gente ?? []), "Ana Marco"] };
    const reglas = { ...REGLAS, personas: [...REGLAS.personas, "Ana Marco"] };
    const cita = [C("R1", 10, "Yo soy Emiley, llevo onboarding y soporte con el equipo de casa matriz")];
    const linea = (texto: string, ctx = conAna) => lineaDelMapa({ texto, citas: cita }, ctx, reglas, []);
    expect(linea("Soporte: Ana y Emiley")?.texto).toBe("Soporte: Ana y Emiley");
    expect(linea("Soporte: Ana y Marco")).toBeNull();
    expect(linea("Soporte que olvida los tickets: Emiley")).toBeNull();
    expect(linea("Servicio: Emiley (Atención al cliente)")?.texto).toBe("Servicio: Emiley (Atención al cliente)");
    // Sin los dominios de la empresa no hay gente de la empresa: ningún nombre pasa, ni con su cita.
    expect(linea("Soporte: Emiley", { ...CTX, gente: [] })).toBeNull();
    // Una línea sin nombres sí pasa sin la gente de la empresa (la cita no dice «5»: va sin el número).
    expect(linea("Ventas: jefatura y asesores", { ...CTX, gente: [] })?.texto).toBe("Ventas: jefatura y asesores");
  });

  it("quién es quién de punta a punta: la lectura del agente se queda con hasta siete líneas buenas", () => {
    const cita = [C("R1", 10, "Yo soy Emiley, llevo onboarding y soporte con el equipo de casa matriz")];
    const lineas = ["Lidera: Fernando", "Soporte: Emiley", "Marketing: Catalina", "Customer Success: Luis Humberto", "Ventas: Fernando", "Onboarding: Emiley", "Atención al cliente: Emiley", "Servicio: Luis"].map((texto) => ({ texto, citas: cita }));
    const e = leerElResumen(
      responde({ negocio: { quienes: [...lineas, { texto: "También mencionado: Eduardo", citas: cita }] }, areas: [{ nombre: "Soporte", area: "3", organizacion: [], bien: [], frena: [], retos: [], cifras: [], falta: null }] }),
      CTX,
      REGLAS,
    );
    expect(e.negocio.quienes?.map((p) => p.texto)).toEqual(lineas.slice(0, 7).map((x) => x.texto));
  });

  it("⛔ la marca «se leyó entero» sobrevive a guardar y leer el Resumen (sin ella, La escala pediría rehacerlo para siempre)", () => {
    const base = { v: 2, at: "2026-11-24T15:00:00.000Z", por: null, modelo: "m", agentRunId: null, hicimos: { sesiones: [], personas: 0, texto: null }, datosRojos: [], areas: {}, entendimos: [], falta: [] };
    expect(leerResumenGuardado({ ...base, leidasEnteras: true })?.leidasEnteras).toBe(true);
    expect(leerResumenGuardado(base)?.leidasEnteras).toBeUndefined();
    expect(leerResumenGuardado({ ...base, leidasEnteras: "sí" })?.leidasEnteras).toBeUndefined();
  });
});

describe("lo que encontró la segunda vuelta de la revisión del 24 nov", () => {
  const TICKETS = "los tickets nos llegan por WhatsApp y por correo y no quedan en ningún lado centralizados";
  const con = (turnos: { n: number; hablante: string; texto: string }[]): ReunionParaElResumen => ({ ...SOPORTE, turnos });
  const E = "Emiley Calvo Jiménez";

  it("⛔ la unidad tiene que ser la misma: «dólares» no es «tickets» aunque se hable de tickets justo antes, ni «leads»", () => {
    const seguida = con([
      { n: 40, hablante: E, texto: TICKETS },
      { n: 41, hablante: E, texto: "y los tickets de facturas son la mayoría de los tickets." },
      { n: 42, hablante: E, texto: "y por la licencia pagamos como 1.800 dólares al año, más o menos." },
    ]);
    const cita = citaVerificada(C("R1", 40, TICKETS), [seguida])!;
    expect(citasDeSusNumeros("Soporte recibe 1.800 tickets al mes", [cita], [seguida])).toEqual([]);
    const pauta = con([{ n: 40, hablante: E, texto: TICKETS }, { n: 41, hablante: E, texto: "en pauta de marketing invertimos como 2.000 dólares al mes" }]);
    expect(citasDeSusNumeros("Marketing recibe 2.000 leads al mes", [citaVerificada(C("R1", 40, TICKETS), [pauta])!], [pauta])).toEqual([]);
  });

  it("una respuesta corta toma su unidad de la pregunta; «2000 tickets» sin punto es una cantidad", () => {
    const corta = con([
      { n: 40, hablante: E, texto: TICKETS },
      { n: 44, hablante: "Marco Salas", texto: "¿Y cuántos tickets les entran al mes, más o menos?" },
      { n: 45, hablante: E, texto: "Unos 2000 más o menos." },
    ]);
    expect(citasDeSusNumeros("~2.000 tickets al mes", [citaVerificada(C("R1", 40, TICKETS), [corta])!], [corta]).map((c) => c.turno)).toEqual([45]);
    expect(numerosDistintivos("nos entran como 2000 tickets al mes").map((x) => x.valor)).toEqual(["2000"]);
    expect(numerosDistintivos("en 2025 lo hicimos así, y desde 2024 igual")).toEqual([]);
  });

  it("un porcentaje, con un porcentaje de lo mismo", () => {
    const pct = con([
      { n: 40, hablante: E, texto: TICKETS },
      { n: 50, hablante: E, texto: "de comisión pagamos un 2,8% a la pasarela de pagos cada mes" },
    ]);
    expect(citasDeSusNumeros("Churn mensual del 2,8 %", [citaVerificada(C("R1", 40, TICKETS), [pct])!], [pct])).toEqual([]);
  });

  const EXTRANET_5 = "la extranet no es para nada amigable con sincronizaciones ni abierta";
  const problema = (r: ReunionParaElResumen) => ({
    puntos: [{ id: "k1", titulo: "La extranet no tiene API", texto: "No se comunica.", areaId: null, citas: [citaVerificada(C("R2", 5, EXTRANET_5), [SOPORTE, r])!] }],
    operativas: [],
    recorrido: [],
    pendientes: [],
  });
  const resuelto = (r: ReunionParaElResumen, turno: number, cita: string) =>
    leerLoResuelto(responde({ resueltos: [{ i: 0, turno, cita }] }), piezasParaLoResuelto(problema(r), [SOPORTE, r]), [SOPORTE, r], parseObject);
  const L = "Luis Humberto Rodríguez Acevedo";
  const PROPUESTA = { n: 30, hablante: "Marco Salas", texto: "Lo que podemos hacer es exportar un Excel diario desde la extranet y HubSpot lo toma solo." };

  it("⛔ lo resuelto: un «no» partido en dos intervenciones, la respuesta a otra pregunta y una cita que corta la objeción no cuentan", () => {
    const partida = { ...EXTRANET, turnos: [EXTRANET.turnos[0], PROPUESTA, { n: 31, hablante: L, texto: "No, eso no nos sirve." }, { n: 32, hablante: L, texto: "Perfecto que lo propongan, pero necesitamos que se sincronice solo con el CRM." }] };
    expect(resuelto(partida, 30, "Lo que podemos hacer es exportar un Excel diario desde la extranet")).toEqual([]);
    const pregunta = { ...EXTRANET, turnos: [EXTRANET.turnos[0], { ...PROPUESTA, texto: `${PROPUESTA.texto} ¿Y cuántos asesores tienen hoy en ventas?` }, { n: 31, hablante: L, texto: "Sí, tenemos unos ocho asesores en ventas hoy." }] };
    expect(resuelto(pregunta, 30, "Lo que podemos hacer es exportar un Excel diario desde la extranet")).toEqual([]);
    const cortada = { ...EXTRANET, turnos: [EXTRANET.turnos[0], PROPUESTA, { n: 31, hablante: L, texto: "No, eso no nos sirve. Lo que hacemos hoy es bajar un Excel cada semana y con eso nos basta." }] };
    expect(resuelto(cortada, 31, "Lo que hacemos hoy es bajar un Excel cada semana y con eso nos basta")).toEqual([]);
  });

  it("⛔ lo resuelto: un cambio de tema, una duda o un aplazamiento no aceptan; un «sí, con eso nos basta» sí", () => {
    for (const respuesta of [
      "Bueno, pasemos ahora al tema de las campañas de marketing del año.",
      "Ok, eso lo vemos después con el equipo de TI de casa matriz.",
      "Puede ser, habría que ver si la casa matriz nos deja hacerlo.",
      "Eh, déjame consultarlo con mi jefe y te confirmo la otra semana.",
    ])
      expect(resuelto({ ...EXTRANET, turnos: [EXTRANET.turnos[0], PROPUESTA, { n: 31, hablante: L, texto: respuesta }] }, 30, "Lo que podemos hacer es exportar un Excel diario desde la extranet"), respuesta).toEqual([]);
    const acepta = { ...EXTRANET, turnos: [EXTRANET.turnos[0], PROPUESTA, { n: 31, hablante: L, texto: "Sí, perfecto, con eso nos basta por ahora." }] };
    expect(resuelto(acepta, 30, "Lo que podemos hacer es exportar un Excel diario desde la extranet").map((x) => x.motivo)).toEqual([expect.stringMatching(/intervención 31/)]);
  });

  it("⛔ quién es quién: nada más que quién está (ni «saturada», ni nombres antes de los dos puntos, ni un equipo de más de 40 letras)", () => {
    const cita = [C("R1", 10, "Yo soy Emiley, llevo onboarding y soporte con el equipo de casa matriz")];
    const linea = (texto: string) => lineaDelMapa({ texto, citas: cita }, CTX, REGLAS, []);
    for (const mala of ["Soporte: Emiley, que está saturada", "Soporte: Emiley, sobrecargada", "Soporte: Emiley (solo ella atiende todo)", "Lidera Eduardo Mora: Ventas", "Ventas Laura: asesores", "Implementación y comunicación con clientes de la casa: Emiley"])
      expect(linea(mala), mala).toBeNull();
    for (const buena of ["Soporte y onboarding: Emiley y otras personas más", "Lidera: Fernando, gerente general", "Customer Success: Luis Humberto Rodríguez Acevedo"]) expect(linea(buena)?.texto, buena).toBe(buena);
  });

  it("⛔ alguien de Smarteam escrito de otra forma no es de la empresa; por palabras enteras", () => {
    const equipo = ["Marco Salas", "Ana Mora", "María José Vargas", "Luis"];
    expect(esDeSmarteamPorElNombre("Presentación de Marco Salas", equipo)).toBe(true);
    expect(esDeSmarteamPorElNombre("María Vargas", equipo)).toBe(true);
    expect(esDeSmarteamPorElNombre("Juliana Morales", equipo)).toBe(false);
    expect(esDeSmarteamPorElNombre("Mariana Mora", equipo)).toBe(false);
    expect(esDeSmarteamPorElNombre("Luis Pazos", equipo)).toBe(false);
    expect(esDeSmarteamPorElNombre("Catalina Calvo", equipo)).toBe(false);
  });
});
