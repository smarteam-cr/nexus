import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  anotarReapunte,
  armarReapunte,
  elegirCandidato,
  reapuntarEnTx,
  type CandidatoACliente,
} from "./cliente-de-la-empresa";

const c = (name: string, kind: string, id = name.toLowerCase()): CandidatoACliente => ({
  id,
  name,
  kind,
});

describe("con qué criterio se elige entre varios clientes de la misma empresa", () => {
  it("ninguno → ninguno", () => {
    expect(elegirCandidato([])).toEqual({ estado: "ninguno" });
  });

  it("uno solo → ese, sea del kind que sea", () => {
    for (const kind of ["CLIENTE", "PROSPECTO", "ALIADO", "INTERNO"]) {
      const r = elegirCandidato([c("Único", kind)]);
      expect(r.estado, `un solo ${kind} tiene que resolver`).toBe("uno");
    }
  });

  it("EL CASO VIVO: prospecto + cliente sobre la misma empresa → gana el CLIENTE", () => {
    /* Medido en producción el 2026-08-03: la empresa 53154855252 tiene «Areyas» [PROSPECTO] y
       «Areyá» [CLIENTE], las dos con el mismo id. Es de plata: un proyecto que nace en el
       prospecto queda fuera de cobranza, de la cartera y del vigilante, sin ningún error.
       Se prueba en los dos órdenes porque el bug original era justamente depender del orden. */
    for (const orden of [
      [c("Areyas", "PROSPECTO"), c("Areyá", "CLIENTE")],
      [c("Areyá", "CLIENTE"), c("Areyas", "PROSPECTO")],
    ]) {
      const r = elegirCandidato(orden);
      expect(r.estado).toBe("uno");
      if (r.estado === "uno") expect(r.cliente.name).toBe("Areyá");
    }
  });

  it("dos CLIENTE de verdad → NO se elige", () => {
    /* Dos cuentas reales sobre una empresa. Adivinar mandaría la facturación a la equivocada en
       silencio; cortar es la respuesta honesta. */
    const r = elegirCandidato([c("Uno", "CLIENTE"), c("Dos", "CLIENTE")]);
    expect(r.estado).toBe("ambiguo");
  });

  it("dos PROSPECTO → tampoco se elige (no hay CLIENTE que desempate)", () => {
    expect(elegirCandidato([c("Uno", "PROSPECTO"), c("Dos", "PROSPECTO")]).estado).toBe("ambiguo");
  });

  it("un CLIENTE entre varios no-CLIENTE → gana el CLIENTE", () => {
    const r = elegirCandidato([c("A", "PROSPECTO"), c("B", "CLIENTE"), c("C", "ALIADO")]);
    expect(r.estado).toBe("uno");
    if (r.estado === "uno") expect(r.cliente.name).toBe("B");
  });
});

describe("LA DIRECCIÓN del reapunte: hacia el vivo, nunca hacia la lápida", () => {
  /* Los dos ids son intercambiables de tipo —dos strings de dígitos— así que invertirlos compila
     y pasa desapercibido. Y el resultado de invertirlos es escribir la lápida encima del id vivo:
     exactamente el estado que esta tanda vino a matar. Las guardas de escaneo miraban el `where`
     y nunca el `data`, así que la mutación dejaba la suite entera en verde. */

  it("el movimiento apunta del id guardado al id vivo", () => {
    const r = armarReapunte("VIVO", "cli_1", "MUERTO", ["MUERTO", "OTRO"]);
    expect(r).toEqual({
      clientId: "cli_1",
      lapida: "MUERTO",
      vigente: "VIVO",
      absorbidos: ["MUERTO", "OTRO"],
    });
  });

  it("lo que se ESCRIBE es el vigente, y lo que se BUSCA son las lápidas", async () => {
    const r = armarReapunte("VIVO", "cli_1", "MUERTO", ["MUERTO", "OTRO"]);
    const vistas: { tabla: string; where: unknown; data: unknown }[] = [];
    const tx = {
      client: {
        update: async (a: { where: unknown; data: unknown }) => {
          vistas.push({ tabla: "client", ...a });
          return {};
        },
      },
      businessCase: {
        updateMany: async (a: { where: unknown; data: unknown }) => {
          vistas.push({ tabla: "businessCase", ...a });
          return { count: 3 };
        },
      },
    };
    const res = await reapuntarEnTx(tx as never, r);
    expect(res).toEqual({ businessCases: 3 });

    const cli = vistas.find((v) => v.tabla === "client")!;
    expect(cli.where).toEqual({ id: "cli_1" });
    expect(cli.data, "el cliente quedaría apuntando a la ficha muerta").toEqual({
      hubspotCompanyId: "VIVO",
    });

    const bc = vistas.find((v) => v.tabla === "businessCase")!;
    expect(bc.data, "los casos quedarían apuntando a la ficha muerta").toEqual({
      hubspotCompanyId: "VIVO",
    });
    expect(bc.where).toEqual({
      clientId: "cli_1",
      hubspotCompanyId: { in: ["MUERTO", "OTRO"] },
    });
  });
});

describe("el rastro del reapunte automático", () => {
  it("nombra los dos ids, que es lo que hace falta para revertirlo", () => {
    const m = anotarReapunte(
      { clientId: "abc", lapida: "52577965185", vigente: "57140844832", absorbidos: [] },
      "Spectrum",
      2,
    );
    expect(m).toContain("52577965185");
    expect(m).toContain("57140844832");
    expect(m).toContain("Spectrum");
    expect(m).toContain("2 propuesta(s) movida(s)");
  });

  it("no habla de business cases cuando no movió ninguno", () => {
    const m = anotarReapunte(
      { clientId: "abc", lapida: "1", vigente: "2", absorbidos: [] },
      "X",
      0,
    );
    expect(m).not.toContain("business case");
  });
});

describe("está cableado donde se crea un cliente, y NO en los buscadores", () => {
  const RAIZ = process.cwd();
  const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");

  const ALTAS = [
    "app/api/projects/route.ts",
    "app/api/business-cases/create-from-company/route.ts",
  ];

  it("las dos altas que crean un cliente lo usan", () => {
    /* Sin esto el módulo es código que nadie llama y el duplicado sigue naciendo. La de business
       cases es la que MÁS se dispara: su formulario manda siempre la empresa y nunca el cliente. */
    for (const f of ALTAS) {
      expect(leer(f), `${f} no resuelve el cliente`).toContain("resolverClienteDeLaEmpresa(");
      expect(leer(f), `${f} volvió al findFirst crudo por empresa`).not.toMatch(
        /client\.findFirst\(\{\s*\n?\s*where:\s*\{\s*hubspotCompanyId:/,
      );
    }
  });

  const BUSCADORES = [
    "app/api/handoffs/lookup/route.ts",
    "app/api/business-cases/lookup/route.ts",
  ];

  it("los buscadores DESEMPATAN con la misma regla, o la regla no sirve de nada", () => {
    /* La mitad simétrica, y la que casi se me pasa: cuando la empresa viva ya tiene clientes, el
       buscador siempre devuelve uno y el alta entra por `clientId` — o sea que `elegirCandidato`
       quedaba inalcanzable justo en el camino que factura, y el caso Areyá seguía naciendo bajo
       el prospecto. Sin esta guarda, alguien "simplifica" a findFirst y el arreglo se apaga sin
       que ningún test se caiga. */
    for (const f of BUSCADORES) {
      expect(leer(f), `${f} no desempata`).toContain("elegirCandidato(");
      expect(leer(f), `${f} volvió al findFirst sin desempate`).not.toMatch(
        /client\.findFirst\(\{\s*\n?\s*where:\s*\{\s*hubspotCompanyId:/,
      );
    }
  });

  it("los BUSCADORES no lo usan, y es a propósito", () => {
    /* LA guarda de esta tanda, y la menos obvia. Si el buscador resolviera el cliente, el
       formulario mandaría `clientId` en vez de `companyId` —son excluyentes en
       `armarCuerpoDelAlta`— y la rama que arregla y reapunta no correría NUNCA: el cliente se
       reusaría con la lápida adentro y el proyecto nuevo nacería colgado de una ficha muerta.
       O sea: cablear el buscador APAGA el arreglo. Por eso está prohibido, no olvidado. */
    for (const f of BUSCADORES) {
      expect(leer(f), `${f}: resolver el cliente en el buscador apaga el arreglo del alta`).not.toContain(
        "resolverClienteDeLaEmpresa",
      );
    }
  });

  it("el reapunte del alta de proyectos va DENTRO de la transacción que crea el proyecto", () => {
    /* Entre resolver el cliente y crear el proyecto hay seis salidas que rechazan el alta. Si el
       reapunte se escribiera al resolver, cualquiera de ellas dejaría un cliente movido por un
       alta que nunca existió. */
    const src = leer("app/api/projects/route.ts");
    const tx = src.indexOf("prisma.$transaction");
    expect(tx, "no se encontró la transacción del alta").toBeGreaterThan(0);
    expect(
      src.indexOf("reapuntarEnTx(tx", tx),
      "el reapunte quedó fuera de la transacción",
    ).toBeGreaterThan(tx);
  });

  it("el barrido de business cases va acotado por cliente Y por los ids absorbidos", () => {
    /* Sin `clientId` un alta le tocaría los casos a otro cliente que arrastre el mismo id; sin
       `in: absorbidos` movería una sola lápida de las varias que una empresa puede haberse
       comido (Spectrum absorbió seis) y el invariante seguiría rojo después del arreglo. */
    const src = leer("lib/hubspot/cliente-de-la-empresa.ts");
    const i = src.indexOf("businessCase.updateMany");
    expect(i).toBeGreaterThan(0);
    const bloque = src.slice(i, i + 300);
    expect(bloque).toContain("clientId: r.clientId");
    expect(bloque).toContain("in: r.absorbidos");
  });
});
