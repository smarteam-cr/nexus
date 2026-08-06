import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  raizDeDominio,
  normalizarEtiqueta,
  detectarGemelas,
  type ClienteComparable,
} from "./gemelas";

/**
 * lib/clients/gemelas.test.ts — EL AVISO QUE IMPIDE PARTIR UN CLIENTE EN DOS.
 *
 * ── LO QUE ESTÁ EN JUEGO ────────────────────────────────────────────────────
 * Si esto no avisa, el botón «Traer de HubSpot» crea una ficha gemela de un cliente que YA
 * está facturando: la cuenta y los cobros quedan en una, el proyecto en la otra, y
 * `ServicioContratado.projectId` apunta a un `Project` que ahora es de otro `Client`.
 * Ya pasó (2026-07-10, 111 clientes de una, 4 duplicados) y el post-mortem está escrito.
 *
 * Los casos de abajo NO son inventados: son las 4 empresas medidas contra producción el
 * 2026-08-05, las únicas que el botón ofrecería hoy. Las 4 tienen gemela.
 */

/** Las fichas de Nexus que las candidatas medidas duplicarían. */
const NEXUS: ClienteComparable[] = [
  { id: "c1", name: "MTS MULTISERVICIOS", company: null, emailDomains: [] },
  { id: "c2", name: "Construtecho", company: "Construtecho", emailDomains: ["construtecho.com.gt"] },
  { id: "c3", name: "kamalio", company: null, emailDomains: ["kamalio.cr"] },
  { id: "c4", name: "Librería Internacional", company: null, emailDomains: [] },
  // Ruido: clientes que NO se tienen que confundir con las candidatas.
  { id: "c5", name: "Wherex", company: null, emailDomains: ["wherex.com"] },
  { id: "c6", name: "Judesur", company: null, emailDomains: ["judesur.go.cr"] },
];

describe("la raíz del dominio ignora el país", () => {
  it("saca los ccTLD compuestos enteros", () => {
    /* El caso medido: la misma empresa con la ficha de cada país. Si `.com.gt` se cortara solo
       por el último punto, quedaría `construtecho.com` vs `construtecho` y no matchearían. */
    expect(raizDeDominio("construtecho.com")).toBe("construtecho");
    expect(raizDeDominio("construtecho.com.gt")).toBe("construtecho");
    expect(raizDeDominio("construtecho.cr")).toBe("construtecho");
    expect(raizDeDominio("empresa.co.cr")).toBe("empresa");
  });

  it("tolera lo que la gente pega de verdad", () => {
    expect(raizDeDominio("https://www.kamalio.com/contacto")).toBe("kamalio");
    expect(raizDeDominio("  KAMALIO.COM  ")).toBe("kamalio");
    expect(raizDeDominio("alguien@dcc.cr")).toBe("dcc");
  });
});

describe("la etiqueta ignora lo que no distingue", () => {
  it("saca acentos, puntuación, paréntesis y sufijos legales", () => {
    expect(normalizarEtiqueta("Librería Internacional (Desarrollos Culturales Costa Rica)")).toBe(
      "libreriainternacional",
    );
    expect(normalizarEtiqueta("MTS Multiservicios S.A.")).toBe("mtsmultiservicios");
    expect(normalizarEtiqueta("Construtecho Ltda")).toBe("construtecho");
  });
});

describe("las cuatro candidatas medidas tienen gemela", () => {
  /**
   * ── LA GUARDA DEL TRAMO ────────────────────────────────────────────────────
   * Si alguna de estas cuatro deja de avisar, el botón crea el duplicado el primer día. Y el
   * modo de falla es mudo: la ficha nueva se ve perfecta, y el daño aparece semanas después en
   * Cobranza, cuando el servicio que cobra no puede colgarse del proyecto que paga.
   *
   * La edición que la pone en rojo: subir `MINIMO_PREFIJO` de 5 a 12 en `gemelas.ts`.
   * Verificado rompiéndola.
   */
  it("LA guarda: MTS, Construtecho, kamalio y Librería Internacional", () => {
    const casos: { candidata: { nombre: string | null; dominio: string | null }; espera: string }[] = [
      // La ficha de HubSpot NO tiene nombre: el dominio es lo único que hay.
      { candidata: { nombre: null, dominio: "mtsmultiservicio.net" }, espera: "c1" },
      { candidata: { nombre: "Construtecho", dominio: "construtecho.com" }, espera: "c2" },
      { candidata: { nombre: "kamalio.com", dominio: "kamalio.com" }, espera: "c3" },
      {
        candidata: {
          nombre: "Librería Internacional (Desarrollos Culturales Costa Rica)",
          dominio: "dcc.cr",
        },
        espera: "c4",
      },
    ];
    for (const { candidata, espera } of casos) {
      const gemelas = detectarGemelas(candidata, NEXUS);
      expect(
        gemelas.map((g) => g.clientId),
        `«${candidata.nombre ?? candidata.dominio}» dejó de avisar que ya existe en Nexus`,
      ).toContain(espera);
    }
  });

  it("y no avisa de empresas que no tienen nada que ver", () => {
    /* Un aviso de más cuesta un segundo de lectura, pero si avisa de TODO deja de significar
       algo y la gente aprende a apretar «es otra» sin leer. */
    expect(detectarGemelas({ nombre: "Acme Global", dominio: "acme.io" }, NEXUS)).toEqual([]);
    expect(detectarGemelas({ nombre: null, dominio: "zzz.com" }, NEXUS)).toEqual([]);
  });
});

describe("el orden no baila", () => {
  it("dominio primero, después nombre, y estable entre llamadas", () => {
    /* Esta lista se PINTA. Un orden que cambia entre llamadas ya nos hizo colgar un proyecto
       del hermano equivocado (C11). */
    const candidata = { nombre: "Construtecho", dominio: "construtecho.com" };
    const a = detectarGemelas(candidata, NEXUS).map((g) => g.clientId);
    const b = detectarGemelas(candidata, [...NEXUS].reverse()).map((g) => g.clientId);
    expect(a).toEqual(b);
    expect(detectarGemelas(candidata, NEXUS)[0]?.motivo).toBe("dominio");
  });
});

describe("los bordes que rompen un comparador ingenuo", () => {
  it("una etiqueta corta no matchea cualquier cosa", () => {
    /* «dcc» tiene 3 caracteres: si el prefijo mínimo no existiera, matchearía con cualquier
       cliente que empiece con esas letras. */
    const cortos: ClienteComparable[] = [{ id: "x", name: "DCC Holdings", company: null, emailDomains: [] }];
    expect(detectarGemelas({ nombre: null, dominio: "dccsistemas.com" }, cortos)).toEqual([]);
  });

  it("una candidata sin nombre ni dominio no arrastra a nadie", () => {
    expect(detectarGemelas({ nombre: null, dominio: null }, NEXUS)).toEqual([]);
  });

  it("un cliente sin dominios no explota", () => {
    const sinNada: ClienteComparable[] = [{ id: "y", name: "", company: null, emailDomains: [] }];
    expect(detectarGemelas({ nombre: "Algo", dominio: "algo.com" }, sinNada)).toEqual([]);
  });
});

describe("los dos scripts que arreglan una empresa partida en dos", () => {
  /**
   * ── POR QUÉ SE VIGILAN DOS SCRIPTS DESDE ACÁ ────────────────────────────────
   * `detectarGemelas` AVISA de una empresa partida en dos; estos dos scripts son los que la
   * arreglan, y cada uno tiene una línea cuyo borrado no rompe nada visible:
   *
   *  · el que suma un dominio a un cliente decide DE QUIÉN SON SUS REUNIONES. Sin la
   *    simulación previa, un dominio demasiado amplio le roba reuniones a otro cliente y eso
   *    no se ve mirando la ficha. Y sin esperar la re-resolución, el dominio queda escrito sin
   *    efecto — que se ve exactamente igual que «no funcionó».
   *  · el que fusiona dos fichas: su lista de pares es el registro de un incidente viejo, y un
   *    par nuevo va por argumento. Si alguien vuelve a hardcodear, el archivo se convierte en
   *    un cementerio y hay que leerlo entero para saber qué corre hoy.
   */
  const fuenteDe = (rel: string) =>
    fs.readFileSync(path.join(process.cwd(), rel), "utf8");

  it("agregar un dominio SIMULA antes de escribir, y espera la re-resolución", () => {
    const src = fuenteDe("scripts/agregar-dominio-a-cliente.ts");
    expect(src, "el script dejó de medir a quién le saca reuniones").toContain("colaterales");
    expect(src, "el script dejó de usar la función real que decide el dueño").toContain(
      "categorizeSession(",
    );
    const tramo = src.slice(src.lastIndexOf("prisma.client.update"));
    expect(tramo.length, "la guarda no está mirando nada").toBeGreaterThan(200);
    expect(
      tramo,
      "el script ya no ESPERA la re-resolución: el dominio queda escrito sin efecto",
    ).toContain("await resolveAllSessions()");
  });

  it("y fusionar dos fichas acepta el par por argumento", () => {
    const src = fuenteDe("scripts/merge-duplicate-clients.ts");
    expect(src, "el par volvió a ser solo hardcodeado").toContain('argValue("--canonico")');
    /* Ante dos fichas de nombre parecido —el caso exacto que este script atiende— elegir una
       sería fusionar la equivocada. */
    expect(src, "la resolución por nombre volvió a elegir ante la ambigüedad").toContain(
      "Pasá el id.",
    );
  });
});
