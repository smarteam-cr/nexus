import { describe, expect, it } from "vitest";
import { armarContextoDeBrief, MAX_CHARS_POR_BLOQUE, type DatosDeBrief } from "./brief-fuentes";
import { parsearBriefCitado } from "@/lib/cs/brief-citas";

/**
 * lib/projects/brief-fuentes.test.ts — EL TEXTO Y EL MAPA NO SE PUEDEN DESINCRONIZAR.
 *
 * ── LA FALLA QUE ESTE ARCHIVO EXISTE PARA CAZAR ──────────────────────────────
 * El armado produce dos cosas que solo sirven juntas: el texto que lee el modelo y el mapa contra
 * el que después se validan sus citas. Si alguien agrega material al texto sin registrar su
 * fuente —lo natural cuando se quiere «que el agente también vea X»— el modelo lo lee, lo cita, y
 * **cada afirmación que salga de ahí desaparece** en la validación. El resumen sale más pobre
 * cada vez, sin un solo error: solo un contador de descartados que nadie mira.
 *
 * Por eso el test central no mira el texto ni el mapa por separado: los cruza, y encima hace
 * pasar una cita de cada fuente por el validador real.
 */

const AYER = new Date("2026-08-15T10:00:00Z");

const datos = (over: Partial<DatosDeBrief> = {}): DatosDeBrief => ({
  projectName: "Migración Salesforce",
  clientName: "Wherex",
  operativa: "Estado: Retrasado · Motivo: Atraso por cliente",
  operativaAt: AYER,
  etapa: { label: "Onboarding", fuente: "el pipeline de HubSpot", at: AYER },
  handoff: { texto: "Se vendió la migración de 4 objetos.", at: AYER },
  sesiones: [
    {
      id: "s1",
      title: "Kickoff",
      date: AYER,
      content: "Acordamos arrancar por contactos.",
      etiquetaDeSala: "CON EL CLIENTE",
    },
  ],
  desviaciones: [
    {
      id: "d1",
      kind: "ATRASO",
      title: "El cliente no entregó los accesos",
      detail: "Se pidió tres veces.",
      lastDetectedAt: AYER,
    },
  ],
  cobertura: { ocurridas: 0, sinRegistro: 0 },
  ...over,
});

describe("⭐ toda fuente del mapa está en el texto, y al revés", () => {
  it("cada clave del mapa aparece como bloque en el texto", () => {
    const { serialized, sources } = armarContextoDeBrief(datos());
    for (const clave of sources.keys()) {
      expect(serialized, `la fuente ${clave} está en el mapa y NO en el texto`).toContain(
        `[${clave}]`,
      );
    }
  });

  it("cada bloque del texto está en el mapa", () => {
    /* La dirección que de verdad muerde: se agrega material «para que el agente lo vea» y se
       olvida registrarlo. El modelo lo cita y esa afirmación se descarta en silencio. */
    const { serialized, sources } = armarContextoDeBrief(datos());
    const claves = [...serialized.matchAll(/### FUENTE \[([^\]]+)\]/g)].map((m) => m[1]);
    expect(claves.length).toBeGreaterThan(0);
    for (const c of claves) {
      expect(sources.has(c), `el bloque ${c} está en el texto y NO en el mapa`).toBe(true);
    }
  });

  it("una cita a CUALQUIERA de las fuentes sobrevive al validador real", () => {
    /* Prueba de extremo a extremo del contrato: no alcanza con que las claves coincidan de forma,
       tienen que ser exactamente las que `parsearBriefCitado` espera. */
    const { sources } = armarContextoDeBrief(datos());
    const statements = [...sources.keys()].map((k) => ({ text: `Algo sobre ${k}.`, source: k }));
    const r = parsearBriefCitado(JSON.stringify({ statements }), sources);
    expect(r.statements).toHaveLength(statements.length);
    expect(r.discarded, "alguna clave del armador no la reconoce el validador").toBe(0);
  });
});

describe("⚠ una reunión sin transcripción NO es una fuente citable", () => {
  it("no entra al mapa aunque haya ocurrido", () => {
    /* Que la reunión pasó es un hecho; qué se habló, no lo sabemos. Darle clave citable invita al
       modelo a afirmar sobre una conversación de la que solo conoce el título — y con cita, o sea
       indistinguible de un dato real. Medido en agosto de 2026: el 52,7% de las reuniones no deja
       transcripción, así que esto no es un borde. */
    const { sources } = armarContextoDeBrief(
      datos({
        sesiones: [
          { id: "s1", title: "Semanal", date: AYER, content: null, etiquetaDeSala: null },
        ],
      }),
    );
    expect(sources.has("sesion:s1")).toBe(false);
  });

  it("pero SE CUENTA, y el texto le prohíbe suponer", () => {
    // Omitirla del todo haría que el resumen parezca completo sobre un hueco.
    const { serialized } = armarContextoDeBrief(
      datos({
        sesiones: [
          { id: "s1", title: "Semanal", date: AYER, content: null, etiquetaDeSala: null },
          { id: "s2", title: "Otra", date: AYER, content: null, etiquetaDeSala: null },
        ],
        cobertura: { ocurridas: 65, sinRegistro: 25 },
      }),
    );
    expect(serialized).toContain("25 no dejaron transcripción");
    expect(serialized).toContain("no supongas su contenido");
    expect(serialized, "la reunión muda se coló como fuente citable").not.toContain(
      "FUENTE [sesion:s1]",
    );
  });
});

/**
 * ⭐ EL HUECO DE MATERIAL TIENE FUENTE PROPIA — y es la guarda de esta tanda.
 *
 * En producción salió «Hay 8 reuniones del proyecto sin transcripción» firmado «Estado en
 * HubSpot», que solo contiene estado/prioridad/adopción/motivo. El modelo no improvisó: no tenía
 * ninguna clave para ese hecho, así que lo colgó de la que tenía. Sin clave propia el problema
 * vuelve, y el validador no lo puede cazar (solo comprueba que la clave EXISTA, nunca que el
 * texto salga de ahí).
 *
 * Y el número tiene que ser el del PROYECTO, no el de la ventana de 12 que el brief lee: Wherex
 * decía 8 cuando eran 25 sobre 65. La escala equivocada es lo que más engaña — un proyecto con 40
 * reuniones mudas decía «8» igual que uno con 9.
 */
describe("⭐ el hueco de material se cita a SÍ MISMO, no a HubSpot", () => {
  it("es una fuente citable propia, con el número del proyecto entero", () => {
    const { serialized, sources } = armarContextoDeBrief(
      datos({ cobertura: { ocurridas: 65, sinRegistro: 25 } }),
    );
    expect(sources.has("cobertura:material"), "el hueco no tiene clave propia").toBe(true);
    expect(serialized).toContain("FUENTE [cobertura:material]");
    // El número es el del proyecto (65/25), NO el de la ventana de sesiones del fixture (1).
    expect(serialized).toContain("De las 65 reunión(es)");
    expect(serialized).toContain("25 no dejaron transcripción");
  });

  it("sin hueco no inventa la fuente", () => {
    /* Un proyecto que grabó todo no gana un bloque que diga «faltan 0»: sería una fuente citable
       sobre un no-hecho, justo lo que el resto de este archivo existe para impedir. */
    const { sources } = armarContextoDeBrief(
      datos({ cobertura: { ocurridas: 12, sinRegistro: 0 } }),
    );
    expect(sources.has("cobertura:material")).toBe(false);
  });
});

describe("nada vacío se vuelve citable", () => {
  it("un bloque en blanco no entra a ninguno de los dos lados", () => {
    /* Una fuente que existe y no dice nada es peor que ninguna: ocupa una clave que el modelo
       puede citar para sostener cualquier cosa. */
    const { serialized, sources } = armarContextoDeBrief(
      datos({ operativa: "   ", handoff: { texto: "", at: AYER } }),
    );
    expect(sources.has("hubspot_ops:actual")).toBe(false);
    expect(sources.has("handoff:propio")).toBe(false);
    expect(serialized).not.toContain("hubspot_ops:actual");
  });

  it("un proyecto sin nada devuelve el mapa VACÍO, no un contexto de mentira", () => {
    /* El llamador tiene que poder distinguir «no hay con qué generar» de «generé y salió flaco».
       Con el mapa vacío, `parsearBriefCitado` descartaría todo y lanzaría — que es lo correcto,
       pero conviene cortar antes y no pagar la llamada al modelo. */
    const { sources } = armarContextoDeBrief({
      projectName: "P",
      clientName: "C",
      operativa: null,
      operativaAt: null,
      etapa: null,
      handoff: null,
      sesiones: [],
      desviaciones: [],
      cobertura: { ocurridas: 0, sinRegistro: 0 },
    });
    expect(sources.size).toBe(0);
  });
});

describe("presupuesto y etiquetas", () => {
  it("un bloque enorme se recorta", () => {
    const { serialized } = armarContextoDeBrief(
      datos({ handoff: { texto: "x".repeat(MAX_CHARS_POR_BLOQUE * 3), at: AYER } }),
    );
    const bloque = serialized.split("### FUENTE [handoff:propio]")[1].split("### ")[0];
    expect(bloque.length).toBeLessThan(MAX_CHARS_POR_BLOQUE + 200);
  });

  it("la sala viaja en el rótulo de la reunión", () => {
    /* Es lo que la Tanda 3 agregó a los otros dos redactores: «lo dijo el cliente» y «lo dijimos
       nosotros» no pesan igual, y sin la etiqueta el modelo no puede distinguirlos. */
    const { sources } = armarContextoDeBrief(datos());
    expect(sources.get("sesion:s1")?.label).toContain("CON EL CLIENTE");
  });
});
