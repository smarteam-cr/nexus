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
  normalizar,
  proponerEmparejados,
  soloDigitos,
  type ClaseEmparejado,
  type CuentaNexus,
  type MontoDeOdoo,
  type PartnerOdoo,
} from "./emparejado";

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

  it("⚠ solo 15 de 49 cuentas tienen un candidato de primera, y eso decide la pantalla", () => {
    /* Con 15 resueltas y 34 sin resolver, «confirmá estas 49 propuestas» sería una pantalla
       vacía. El flujo principal tiene que ser BUSCAR, y las propuestas el atajo. */
    expect(conteo("CEDULA")).toBe(2);
    expect(conteo("NOMBRE_EXACTO")).toBe(4);
    expect(conteo("MONTO")).toBe(9);
    expect(conteo("DUDOSA")).toBe(5);
    expect(conteo("INEMPAREJABLE")).toBe(1);
    expect(conteo("SIN_CANDIDATO")).toBe(28);
    expect(PROPUESTAS).toHaveLength(49);
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
  const cuenta = (id: string, nombre: string, montos: number[]): CuentaNexus => ({
    cuentaId: id,
    nombre,
    cedulaJuridica: null,
    montos,
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
});
