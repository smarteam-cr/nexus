/**
 * lib/cobranza/odoo/emparejado.test.ts
 *
 * Correr: `npx vitest run lib/cobranza/odoo --project unit`.
 *
 * Los 49 nombres REALES de Nexus contra los 82 clientes REALES de Odoo, con los 303 montos
 * facturados. El fixture lo regenera `scripts/odoo-fixture-emparejado.ts` y es solo lectura
 * en las dos puntas.
 *
 * ── POR QUÉ ESTE ARCHIVO AFIRMA CONTEOS Y NO SOLO CASOS ─────────────────────────
 * El riesgo de un matcher de nombres no es que falle: es que alguien lo afloje para
 * «mejorarlo» y empiece a proponer pares plausibles y equivocados. Ese cambio se ve como una
 * mejora en la pantalla —más propuestas, menos huecos— y solo se descubre cuando una factura
 * quedó colgada de la cuenta de otro cliente.
 *
 * Si estos números se mueven, el test se pone rojo y hay que declarar por qué. Puede ser una
 * mejora legítima; también puede ser el bug de «Amvac Latam» contra «Forestales LATAM».
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buscarPartners,
  candidatosPorMonto,
  cedulaAAprender,
  claseDeCedula,
  decidirMarcaDeMercury,
  normalizar,
  proponerEmparejados,
  quedaPorEmparejar,
  reatribuciones,
  resumenDelEmparejado,
  soloDigitos,
  type ClaseEmparejado,
  type CuentaNexus,
  type MontoDeOdoo,
  type PartnerOdoo,
} from "./emparejado";
import { cambiarViaCobroTx } from "../via-cobro";

const FIX = JSON.parse(
  readFileSync(join(__dirname, "..", "__fixtures__", "odoo-emparejado.json"), "utf8"),
) as { partners: PartnerOdoo[]; cuentas: CuentaNexus[]; montosOdoo: MontoDeOdoo[] };

const PROPUESTAS = proponerEmparejados(FIX.cuentas, FIX.partners, FIX.montosOdoo);
const de = (nombre: string) => PROPUESTAS.find((p) => p.cuentaNombre === nombre);
const conteo = (clase: ClaseEmparejado) => PROPUESTAS.filter((p) => p.clase === clase).length;

describe("el emparejado contra los datos reales", () => {
  it("el fixture sigue siendo el universo que se midió", () => {
    expect(FIX.cuentas).toHaveLength(49);
    expect(FIX.partners).toHaveLength(82);
  });

  it("⚠ solo 14 de 49 cuentas tienen un candidato de primera, y eso decide la pantalla", () => {
    /* Con 14 resueltas y 35 sin resolver, «confirmá estas 49 propuestas» sería una pantalla
       vacía. El flujo principal tiene que ser BUSCAR, y las propuestas el atajo. */
    expect(conteo("CEDULA")).toBe(2);
    expect(conteo("NOMBRE_EXACTO")).toBe(4);
    expect(conteo("MONTO")).toBe(8);
    expect(conteo("DUDOSA")).toBe(5);
    expect(conteo("INEMPAREJABLE")).toBe(1);
    expect(conteo("SIN_CANDIDATO")).toBe(29);
    expect(PROPUESTAS).toHaveLength(49);
  });

  it("⭐ exigir la MONEDA sacó el único falso positivo que quedaba", () => {
    /* La señal de monto era 8 aciertos de 9. El noveno era `Apptividad → Border Freight S. de
       R.L. de C.V.` —una empresa mexicana— y coincidía por un monto en OTRA moneda.

       Al exigir que la moneda también coincida, la señal pasó de 9 propuestas con 8 aciertos a
       **8 propuestas con 8 aciertos**. Una propuesta menos y cero errores: exactamente el
       cambio que uno quiere y que la pantalla no habría delatado nunca, porque un falso
       positivo se ve idéntico a un acierto hasta que alguien lo confirma. */
    expect(de("Apptividad")?.clase).toBe("SIN_CANDIDATO");
    for (const p of PROPUESTAS.filter((x) => x.clase === "MONTO")) {
      expect(p.candidatos[0]?.evidencia, p.cuentaNombre).toMatch(/misma moneda/i);
    }
  });

  it("⭐ la señal de MONTO resuelve justo lo que el nombre no puede", () => {
    /* Nexus guarda el nombre comercial y Odoo la razón social, y no se parecen en nada.
       Ninguno de estos tres tiene una sola palabra en común entre las dos puntas. */
    expect(de("Iberorutas")?.candidatos[0]?.nombre).toMatch(/SAN MATEO Y SANTA ELENA/i);
    expect(de("Corrugando")?.candidatos[0]?.nombre).toMatch(/ACCCSA/i);
    expect(de("TEC- AE")?.candidatos[0]?.nombre).toMatch(/FUNDACION TECNOL/i);
  });

  it("⭐ y el candidato por monto NO puede robarle un partner a una señal más fuerte", () => {
    /* `BLUESAT` coincidía por un monto redondo con FORESTALES LATINOAMERICANOS, que ya
       emparejaba con su propia cuenta por nombre exacto. El vínculo partner→cuenta es único
       (`odooPartnerId @unique`), así que un partner con dueño no puede ser el par de otra
       cuenta: no es una heurística, es la forma de la tabla. Sube el acierto de la señal de
       monto de 8/10 a 8/9 sin aflojar nada. */
    expect(de("BLUESAT")?.clase).toBe("SIN_CANDIDATO");
    expect(de("Forestales Latinoamericanos")?.clase).toBe("NOMBRE_EXACTO");
  });

  it("⚠ toda propuesta trae su evidencia: la pantalla no dice «confiá en mí»", () => {
    /* La señal de monto tiene ~1 error de cada 9 y confirma una persona. Sin ver POR QUÉ se
       propuso, esa persona no puede hacer otra cosa que aceptar todo. */
    for (const p of PROPUESTAS) {
      for (const c of p.candidatos) expect(c.evidencia.length, `${p.cuentaNombre}`).toBeGreaterThan(20);
    }
  });

  it("distingue «inemparejable» de «sin candidato», porque se buscan en lados distintos", () => {
    /* `IIA` son tres letras: `palabrasDistintivas` corta en 4 para que siglas como «CR» o
       «SA» no matcheen contra cualquier cosa, así que no queda nada con qué comparar. Es un
       problema del NOMBRE de la cuenta, no un hueco de Odoo. */
    expect(de("IIA")?.clase).toBe("INEMPAREJABLE");
    expect(de("Wherex")?.clase).toBe("SIN_CANDIDATO");
  });

  it("⛔ ningún partner queda propuesto para dos cuentas a la vez", () => {
    /* Sería la vía directa a colgar las facturas de un cliente de la cuenta de otro. */
    const primeros = PROPUESTAS.filter((p) => p.clase !== "DUDOSA" && p.candidatos.length > 0).map(
      (p) => p.candidatos[0]!.odooPartnerId,
    );
    expect(new Set(primeros).size).toBe(primeros.length);
  });
});

describe("las cédulas de un Odoo sin base_vat instalado", () => {
  it("⚠ quita el prefijo de país solo si lo que sigue son puros dígitos", () => {
    /* Odoo no agrega «CR» en Costa Rica pero SÍ lo normaliza si alguien lo escribió a mano,
       así que las dos formas conviven. Un RFC mexicano como COAL780221HR9 NO es un vat con
       prefijo: quitarle el «CO» fabricaría un número que no existe. */
    expect(soloDigitos("CR3101098834")).toBe("3101098834");
    expect(soloDigitos("3-101-105018")).toBe("3101105018");
    /* ⚠ El RFC no matchea como «dos letras + dígitos», así que NO se le trata el «CO» como
       prefijo de país: caen todas las letras y queda 7802219, con el 9 del final incluido.
       Es basura, y está bien que lo sea — `claseDeCedula` lo marca fuera de norma y nadie lo
       confunde con una cédula. Lo que importa es que no se fabricó un 780221 con pinta de
       número válido. */
    expect(soloDigitos("COAL780221HR9")).toBe("7802219");
    expect(claseDeCedula(soloDigitos("COAL780221HR9"))).toMatch(/fuera-de-norma/);
  });

  it("clasifica la forma de la cédula sin rechazar la que está fuera de norma", () => {
    /* De 123 partners con vat, 46 no tienen un solo dígito y hay uno de 11 que es un typo.
       Rechazarlos escondería el problema; clasificarlos lo deja a la vista. */
    expect(claseDeCedula("3101497341")).toBe("juridica/NITE(10)");
    expect(claseDeCedula("31010746160")).toBe("DIMEX(11-12)");
    expect(claseDeCedula("123")).toMatch(/fuera-de-norma/);
  });

  it("normaliza la razón social quitando las formas jurídicas", () => {
    expect(normalizar("CORPORACION ALMOTEC SOCIEDAD ANONIMA")).toBe("corporacion almotec");
    expect(normalizar("Pacuare Luxury Realty CR S.A.")).toBe("pacuare luxury realty cr");
  });
});

describe("la señal de monto, aislada", () => {
  const cuenta = (id: string, nombre: string, montos: number[], moneda = "USD"): CuentaNexus => ({
    cuentaId: id,
    nombre,
    cedulaJuridica: null,
    montos: montos.map((monto) => ({ monto, moneda })),
  });

  it("⛔ no propone nada cuando el monto lo comparten dos cuentas", () => {
    /* Un monto redondo compartido no identifica a nadie, y proponerlo sería peor que callar:
       la persona confirmaría el primero de la lista. */
    const r = candidatosPorMonto(
      [cuenta("a", "A", [1500]), cuenta("b", "B", [1500])],
      [{ odooPartnerId: 1, montoNeto: 1500, moneda: "USD" }],
    );
    expect(r.size).toBe(0);
  });

  it("⛔ ni cuando lo comparten dos partners", () => {
    const r = candidatosPorMonto(
      [cuenta("a", "A", [1500])],
      [
        { odooPartnerId: 1, montoNeto: 1500, moneda: "USD" },
        { odooPartnerId: 2, montoNeto: 1500, moneda: "USD" },
      ],
    );
    expect(r.size).toBe(0);
  });

  it("compara en centavos, no en flotante", () => {
    /* 1500.1 + 0.2 no es 1500.3 en punto flotante, y un monto que no matchea por el
       decimal 15 es exactamente el bug que nadie encuentra mirando la pantalla. */
    const r = candidatosPorMonto([cuenta("a", "A", [1500.3])], [{ odooPartnerId: 7, montoNeto: 1500.1 + 0.2, moneda: "USD" }]);
    expect(r.get("a")?.[0]?.odooPartnerId).toBe(7);
  });

  it("⛔ NUNCA propone a través de monedas distintas", () => {
    /* `cruzar()` ya exigía moneda igual para aparear un cobro con su factura —«USD 2.000 y
       CRC 2.000 no son el mismo hecho, son 500 veces distintos»— y esta función se saltaba la
       misma regla: proponía el cliente cuya factura en colones coincidía en número con un
       cobro en dólares, con toda la evidencia a favor. */
    const r = candidatosPorMonto(
      [cuenta("a", "A", [2000], "USD")],
      [{ odooPartnerId: 7, montoNeto: 2000, moneda: "CRC" }],
    );
    expect(r.size).toBe(0);
  });

  it("y la evidencia dice que la moneda coincide, porque ahora es verdad", () => {
    const r = candidatosPorMonto(
      [cuenta("a", "A", [2000], "USD")],
      [{ odooPartnerId: 7, montoNeto: 2000, moneda: "USD" }],
    );
    expect(r.get("a")?.[0]?.evidencia).toMatch(/misma moneda/i);
  });

  it("ignora los montos en cero o negativos", () => {
    const r = candidatosPorMonto([cuenta("a", "A", [0])], [{ odooPartnerId: 1, montoNeto: 0, moneda: "USD" }]);
    expect(r.size).toBe(0);
  });
});

describe("el buscador, que es el flujo principal", () => {
  it("encuentra por razón social aunque se escriba el nombre comercial a medias", () => {
    expect(buscarPartners(FIX.partners, "almotec").map((p) => p.nombre)).toContain(
      "CORPORACION ALMOTEC SOCIEDAD ANONIMA",
    );
  });

  it("encuentra por cédula", () => {
    const hits = buscarPartners(FIX.partners, "3101497341");
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.nombre).toMatch(/ACCCSA/i);
  });

  it("⚠ no devuelve el universo entero con una sola letra", () => {
    /* Una lista de 82 no es una respuesta, es la misma pregunta otra vez. */
    expect(buscarPartners(FIX.partners, "a")).toEqual([]);
    expect(buscarPartners(FIX.partners, "")).toEqual([]);
  });

  it("pone primero los que empiezan con lo escrito", () => {
    /* Buscar «tec» y que el primero sea «INTECSA» en vez de «FUNDACIÓN TECNOLÓGICA» es lo
       que vuelve inservible una lista de 9. */
    const hits = buscarPartners(FIX.partners, "forestales");
    expect(hits[0]?.nombre).toMatch(/^FORESTALES/i);
  });
});

describe("lo que se aprende al confirmar un vínculo", () => {
  it("⭐ escribe la cédula de Odoo cuando Nexus no la tiene", () => {
    /* Hoy solo 2 de 49 cuentas tienen cédula, que es por lo que la señal más confiable casi
       no opera. Esto convierte una tarde de trabajo manual en un emparejado que se sostiene
       solo la próxima vez. */
    expect(cedulaAAprender(null, "3-101-497341")).toEqual({ escribir: "3101497341" });
  });

  it("⛔ NUNCA pisa una cédula ya cargada: la diferencia es una línea de trabajo", () => {
    /* Puede ser que el vínculo esté mal, o que Odoo tenga el typo. Resolverlo en silencio a
       favor de Odoo perdería el dato que alguien cargó a mano. */
    expect(cedulaAAprender("3101497341", "3101000000")).toEqual({
      conflicto: { nexus: "3101497341", odoo: "3101000000" },
    });
  });

  it("no hace nada cuando ya coinciden o cuando Odoo no tiene vat", () => {
    expect(cedulaAAprender("3-101-497341", "3101497341")).toBeNull();
    expect(cedulaAAprender("3101497341", null)).toBeNull();
    expect(cedulaAAprender(null, null)).toBeNull();
  });

  it("⭐ etapa 12: una segunda cédula no es conflicto si la de la cuenta es la de otra de sus sociedades", () => {
    /* ARQUITECTURA DE MUEBLES está dos veces en Odoo: #39 con 3101746160 y #100 con 31010746160 (el mismo
       número con un 0 de más). Vinculada la primera, la cuenta aprendió su cédula; la segunda es otra
       ficha de la misma cuenta, no un error a resolver. */
    expect(cedulaAAprender("3101746160", "31010746160", ["3101746160"])).toEqual({
      otraSociedad: { nexus: "3101746160", odoo: "31010746160" },
    });
  });

  it("⛔ y sigue siendo conflicto si ninguna sociedad de la cuenta explica su cédula", () => {
    expect(cedulaAAprender("3101497341", "3101000000", ["3101999999", null])).toEqual({
      conflicto: { nexus: "3101497341", odoo: "3101000000" },
    });
  });

  it("Librería Internacional ×2: la misma cédula escrita de dos formas no choca", () => {
    /* Dos cuentas en Nexus con 3101167504 y 3-101-167504: son los mismos dígitos. */
    expect(cedulaAAprender("3-101-167504", "3101167504", ["3101167504"])).toBeNull();
    expect(cedulaAAprender("3101167504", "3-101-167504")).toBeNull();
  });
});

/**
 * ── ⭐ UNA CUENTA VINCULADA PUEDE SUMAR OTRA FICHA DE ODOO (etapa 12, H10) ─────────
 * Hasta el 2026-09-13 la cuenta salía de la lista apenas tenía su primer cliente de Odoo, y la segunda
 * ficha de la misma empresa quedaba inalcanzable, con sus facturas sin dueño.
 */
describe("⭐ una cuenta ya vinculada sigue apareciendo como candidata", () => {
  const cuentas: CuentaNexus[] = [
    { cuentaId: "judesur", nombre: "JUDESUR", cedulaJuridica: "3007219667", montos: [] },
    { cuentaId: "arquitectura", nombre: "Arquitectura de Muebles", cedulaJuridica: "3101746160", montos: [] },
    { cuentaId: "bluesat", nombre: "BLUESAT", cedulaJuridica: "3101641911", montos: [{ monto: 1500, moneda: "USD" }] },
    { cuentaId: "selvatura", nombre: "Selvatura", cedulaJuridica: null, montos: [] },
  ];
  /* Los clientes de Odoo LIBRES: los ya vinculados (#66 de Judesur, #39 de Arquitectura) no llegan acá. */
  const partners: PartnerOdoo[] = [
    { odooPartnerId: 182, nombre: "JUDESUR (copia)", vat: "3-007-219667", customerRank: 1 },
    { odooPartnerId: 100, nombre: "ARQUITECTURA DE MUEBLES S.A.", vat: "31010746160", customerRank: 1 },
    { odooPartnerId: 7, nombre: "FORESTALES LATINOAMERICANOS", vat: null, customerRank: 1 },
    { odooPartnerId: 55, nombre: "SELVATURA S.A.", vat: null, customerRank: 1 },
  ];
  const montos: MontoDeOdoo[] = [{ odooPartnerId: 7, montoNeto: 1500, moneda: "USD" }];
  const propuestas = proponerEmparejados(cuentas, partners, montos, {
    yaVinculadas: new Set(["judesur", "arquitectura", "bluesat"]),
  });
  const de = (id: string) => propuestas.find((p) => p.cuentaId === id);

  it("la misma cédula en otra ficha: Judesur sigue en la lista, marcada como otra sociedad", () => {
    expect(de("judesur")).toMatchObject({ clase: "CEDULA", otraSociedad: true });
    expect(de("judesur")?.candidatos.map((c) => c.odooPartnerId)).toEqual([182]);
  });

  it("⚠ la cédula tipeada distinta no la encuentra y el nombre exacto sí: Arquitectura de Muebles #100", () => {
    expect(de("arquitectura")).toMatchObject({ clase: "NOMBRE_EXACTO", otraSociedad: true });
    expect(de("arquitectura")?.candidatos.map((c) => c.odooPartnerId)).toEqual([100]);
  });

  it("⛔ una cuenta vinculada no vuelve por monto: su plata ya la explica su primer cliente", () => {
    expect(de("bluesat")).toBeUndefined();
  });

  it("una cuenta sin vincular se propone igual que antes, sin la marca", () => {
    expect(de("selvatura")).toMatchObject({ clase: "NOMBRE_EXACTO", otraSociedad: false });
  });

  it("sin la lista de vinculadas nada cambia: las 49 del fixture real salen sin la marca", () => {
    expect(PROPUESTAS).toHaveLength(49);
    expect(PROPUESTAS.every((p) => !p.otraSociedad)).toBe(true);
  });
});

/**
 * ── ⭐ VINCULAR ATRIBUYE LAS FACTURAS EN EL MOMENTO ──────────────────────────────
 * Medido el 2026-09-12: 27 clientes emparejados el 3-sep y 347 de 347 facturas sin cuenta,
 * porque la cuenta solo la escribía un sync que no volvió a correr. Estas reglas son las que
 * comparten confirmar, desvincular, el sync y el invariante.
 */
describe("⭐ a qué cuenta va cada factura", () => {
  const f = (id: string, odooPartnerId: number, cuentaId: string | null, moveType = "out_invoice") => ({
    id,
    odooMoveId: Number(id.replace(/\D/g, "")) || 1,
    numero: `FAC/${id}`,
    odooPartnerId,
    cuentaId,
    moveType,
  });

  it("atribuye las facturas Y las notas de crédito del partner vinculado", () => {
    /* Una nota sin cuenta seguía sumando en el balde de «sin atribuir» como si hubiera que
       cobrarla. Es del mismo cliente que la factura que corrige. */
    const r = reatribuciones([f("f1", 38, null), f("f2", 38, null, "out_refund")], [{ odooPartnerId: 38, cuentaId: "amvac" }]);
    expect(r.map((x) => [x.facturaId, x.anterior, x.nuevo])).toEqual([
      ["f1", null, "amvac"],
      ["f2", null, "amvac"],
    ]);
  });

  it("⛔ no toca las facturas de otro cliente de Odoo", () => {
    const r = reatribuciones([f("f1", 38, null), f("f2", 66, null)], [{ odooPartnerId: 38, cuentaId: "amvac" }]);
    expect(r.map((x) => x.facturaId)).toEqual(["f1"]);
  });

  it("es idempotente: aplicada una vez, no queda nada que cambiar", () => {
    const facturas = [f("f1", 38, null), f("f2", 38, "otra-cuenta")];
    const vinculos = [{ odooPartnerId: 38, cuentaId: "amvac" }];
    const aplicadas = facturas.map((x) => ({ ...x, cuentaId: reatribuciones([x], vinculos)[0]?.nuevo ?? x.cuentaId }));
    expect(reatribuciones(facturas, vinculos)).toHaveLength(2);
    expect(reatribuciones(aplicadas, vinculos)).toEqual([]);
  });

  it("desvincular deja la factura en null, no con la cuenta vieja", () => {
    /* Con la cuenta vieja puesta, la factura seguiría apareándose con los cobros de un cliente
       que ya no es el suyo. */
    const r = reatribuciones([f("f1", 38, "amvac")], [{ odooPartnerId: 38, cuentaId: null }]);
    expect(r).toEqual([{ facturaId: "f1", odooMoveId: 1, numero: "FAC/f1", anterior: "amvac", nuevo: null }]);
    expect(reatribuciones([f("f1", 38, "amvac")], []), "sin fila de vínculo, tampoco").toHaveLength(1);
  });
});

/**
 * ── ⭐ 2026-09-25 · «ESTÁ EN MERCURY» Y UNA SOLA REGLA PARA «POR EMPAREJAR» ────────────
 * Medido ese día en producción: 56 cuentas (27 vinculadas; 7 nacionales y 14 internacionales con vía
 * Odoo y sin cliente; 8 internacionales con vía Mercury). «Emparejar» mostraba 29 tarjetas, la pestaña
 * decía 28 y «Lo que no cuadra» «7 de 34». Con la regla única: 21 por emparejar, 8 en Mercury.
 */
describe("⭐ quién queda por emparejar: una sola regla para todos los contadores", () => {
  const cuentas = [
    ...Array.from({ length: 27 }, (_, i) => ({ id: `vinc-${i}`, viaCobro: "ODOO" })),
    ...Array.from({ length: 21 }, (_, i) => ({ id: `odoo-${i}`, viaCobro: "ODOO" })),
    ...Array.from({ length: 8 }, (_, i) => ({ id: `merc-${i}`, viaCobro: "MERCURY" })),
  ];
  const vinculadas = new Set(Array.from({ length: 27 }, (_, i) => `vinc-${i}`));

  it("los números de producción del 2026-09-25: 27 de 56 vinculadas, 21 por emparejar, 8 en Mercury", () => {
    expect(resumenDelEmparejado(cuentas, vinculadas)).toEqual({
      cuentas: 56,
      vinculadas: 27,
      porEmparejar: 21,
      enMercury: 8,
      enOtra: 0,
      deOdoo: 48,
    });
  });

  it("⛔ una cuenta en Mercury o QuickBooks no está por emparejar, aunque no tenga cliente de Odoo", () => {
    expect(quedaPorEmparejar({ id: "m", viaCobro: "MERCURY" }, new Set())).toBe(false);
    expect(quedaPorEmparejar({ id: "q", viaCobro: "OTRA" }, new Set())).toBe(false);
    expect(quedaPorEmparejar({ id: "o", viaCobro: "ODOO" }, new Set())).toBe(true);
    expect(quedaPorEmparejar({ id: "o", viaCobro: "ODOO" }, new Set(["o"]))).toBe(false);
  });

  it("⭐ volver a Odoo la devuelve a la lista sin guardar nada aparte: la regla solo mira la vía", () => {
    const marcada = cuentas.map((c) => (c.id === "odoo-0" ? { ...c, viaCobro: "MERCURY" } : c));
    expect(resumenDelEmparejado(marcada, vinculadas)).toMatchObject({ porEmparejar: 20, enMercury: 9 });
    const deshecha = marcada.map((c) => (c.id === "odoo-0" ? { ...c, viaCobro: "ODOO" } : c));
    expect(resumenDelEmparejado(deshecha, vinculadas)).toEqual(resumenDelEmparejado(cuentas, vinculadas));
  });

  it("las partes suman el total: una vinculada cuenta como vinculada aunque su vía diga Mercury", () => {
    const mixta = [{ id: "a", viaCobro: "MERCURY" }, { id: "b", viaCobro: "OTRA" }, { id: "c", viaCobro: "ODOO" }];
    const r = resumenDelEmparejado(mixta, new Set(["a"]));
    expect(r).toEqual({ cuentas: 3, vinculadas: 1, porEmparejar: 1, enMercury: 0, enOtra: 1, deOdoo: 2 });
    expect(r.vinculadas + r.porEmparejar + r.enMercury + r.enOtra).toBe(r.cuentas);
  });
});

describe("⭐ el botón «Está en Mercury»", () => {
  const cuenta = (viaCobro: string, fichasDeOdoo: string[] = []) => ({ nombre: "Wherex", viaCobro, fichasDeOdoo });

  it("marca una cuenta de Odoo sin cliente de Odoo, y «Deshacer» la devuelve a Odoo", () => {
    expect(decidirMarcaDeMercury(cuenta("ODOO"), "MERCURY")).toEqual({ tipo: "CAMBIA", anterior: "ODOO", nueva: "MERCURY" });
    expect(decidirMarcaDeMercury(cuenta("MERCURY"), "ODOO")).toEqual({ tipo: "CAMBIA", anterior: "MERCURY", nueva: "ODOO" });
  });

  it("⛔ no marca una cuenta que ya tiene cliente de Odoo, y dice por qué y qué hacer", () => {
    const d = decidirMarcaDeMercury(cuenta("ODOO", ["WHEREX SPA"]), "MERCURY");
    expect(d.tipo).toBe("RECHAZO");
    if (d.tipo !== "RECHAZO") return;
    expect(d.motivo).toContain("«WHEREX SPA»");
    expect(d.motivo).toMatch(/desvincula primero/);
  });

  it("si ya dice eso, no cambia nada: no se pisa quién la marcó ni se ensucia la bitácora", () => {
    expect(decidirMarcaDeMercury(cuenta("MERCURY"), "MERCURY")).toEqual({ tipo: "YA_ESTABA" });
    expect(decidirMarcaDeMercury(cuenta("ODOO"), "ODOO")).toEqual({ tipo: "YA_ESTABA" });
  });

  it("«Deshacer» funciona aunque la cuenta tenga fichas: volver a Odoo nunca deja datos a medias", () => {
    expect(decidirMarcaDeMercury(cuenta("MERCURY", ["X"]), "ODOO").tipo).toBe("CAMBIA");
  });
});

/**
 * ── LA VÍA SE ESCRIBE POR UN SOLO CAMINO, Y SOLO SI CAMBIA ──────────────────────
 * Los tres caminos que cambian la vía (el botón, la ficha de la cuenta y «Cuadrar cronograma») pasan por
 * `cambiarViaCobroTx`. La ficha la mandaba en CADA guardado: si el chokepoint escribiera igual cuando la vía no cambia,
 * guardar un correo borraría quién marcó la cuenta «Está en Mercury» y ensuciaría su bitácora.
 * La edición que la pone en rojo: sacar el «si ya dice eso, no toca nada», o escribir la vía sin su firma o sin su
 * línea en la bitácora.
 */
describe("⭐ la vía de cobro se firma solo cuando cambia de verdad (`cambiarViaCobroTx`)", () => {
  /** Una transacción de mentira que anota lo que se escribiría. */
  const txDePrueba = (viaCobro: string | null) => {
    const escrituras: Array<{ tabla: string; data: Record<string, unknown> }> = [];
    const anotar = (tabla: string) => async ({ data }: { data: Record<string, unknown> }) => {
      escrituras.push({ tabla, data });
      return { id: "c1" };
    };
    const tx = {
      cuentaFinanciera: { findUnique: async () => (viaCobro === null ? null : { viaCobro }), update: anotar("cuenta") },
      bitacoraCobro: { create: anotar("bitacora") },
    };
    return { tx: tx as never, escrituras };
  };
  const pedido = (nueva: "ODOO" | "MERCURY") => ({ cuentaId: "c1", nueva, actor: "ana@smarteamcr.com", motivo: "la cambió en la ficha de la cuenta." });

  it("si ya dice eso, no escribe nada: ni la vía, ni la firma, ni la bitácora", async () => {
    const { tx, escrituras } = txDePrueba("MERCURY");
    expect(await cambiarViaCobroTx(tx, pedido("MERCURY"))).toEqual({ anterior: "MERCURY", cambio: false });
    expect(escrituras).toEqual([]);
  });

  it("si cambia, escribe la vía con quién y cuándo, y deja la línea en la bitácora de la cuenta", async () => {
    const { tx, escrituras } = txDePrueba("ODOO");
    expect(await cambiarViaCobroTx(tx, pedido("MERCURY"))).toEqual({ anterior: "ODOO", cambio: true });
    expect(escrituras.map((e) => e.tabla)).toEqual(["cuenta", "bitacora"]);
    expect(escrituras[0]?.data).toMatchObject({ viaCobro: "MERCURY", viaCobroPor: "ana@smarteamcr.com" });
    expect(escrituras[0]?.data.viaCobroEn).toBeInstanceOf(Date);
    expect(escrituras[1]?.data.contenido).toBe(
      "Vía de cobro cambiada de Odoo a Mercury por ana@smarteamcr.com: la cambió en la ficha de la cuenta.",
    );
  });

  it("una cuenta que no existe no se escribe", async () => {
    const { tx, escrituras } = txDePrueba(null);
    await expect(cambiarViaCobroTx(tx, pedido("ODOO"))).rejects.toThrow();
    expect(escrituras).toEqual([]);
  });
});

describe("⭐ las sugerencias por monto no proponen clientes de Odoo que ya tienen dueño", () => {
  /* Medido el 2026-09-25: KAIZEN KAPITAL → Pacuare (#74), ya vinculado a otra cuenta. La tarjeta salía sin
     nombre y «Es este» chocaba con el 409 de «ya está vinculado a otra cuenta». */
  const cuentas: CuentaNexus[] = [
    { cuentaId: "kaizen", nombre: "KAIZEN KAPITAL", cedulaJuridica: null, montos: [{ monto: 900, moneda: "USD" }] },
    { cuentaId: "amc", nombre: "AMC - Atlas Mining", cedulaJuridica: null, montos: [{ monto: 1200, moneda: "USD" }] },
  ];
  const partners: PartnerOdoo[] = [{ odooPartnerId: 33, nombre: "3-101-767810 SOCIEDAD ANONIMA", vat: null, customerRank: 1 }];
  const montos: MontoDeOdoo[] = [
    { odooPartnerId: 74, montoNeto: 900, moneda: "USD" },
    { odooPartnerId: 33, montoNeto: 1200, moneda: "USD" },
  ];

  it("sin la lista de descartados se proponía el cliente ajeno, sin nombre", () => {
    const antes = proponerEmparejados(cuentas, partners, montos);
    expect(antes.find((p) => p.cuentaId === "kaizen")?.candidatos).toMatchObject([{ odooPartnerId: 74, nombre: "" }]);
  });

  it("⛔ con ella, el cliente con dueño sale y la cuenta queda sin candidato; el libre se sigue proponiendo", () => {
    const r = proponerEmparejados(cuentas, partners, montos, { partnersDescartados: new Set([74]) });
    expect(r.find((p) => p.cuentaId === "kaizen")).toMatchObject({ clase: "SIN_CANDIDATO", candidatos: [] });
    expect(r.find((p) => p.cuentaId === "amc")).toMatchObject({ clase: "MONTO", candidatos: [{ odooPartnerId: 33 }] });
  });
});
