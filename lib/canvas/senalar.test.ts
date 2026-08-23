/**
 * lib/canvas/senalar.test.ts — EL 💬 SEÑALA LO QUE SEÑALA, O NO SE PINTA.
 *
 * El botón por ítem es la segunda puerta de «decir qué cambiar» (la primera es citar el texto en
 * el chat). Su modo de falla propio es distinto del de la cita: acá el riesgo no es elegir mal
 * entre dos textos iguales, es **ofrecer un botón sobre algo que el chat no puede tocar**. Una
 * promesa que se rompe en el segundo clic es peor que no ofrecer nada.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { listaDeLaSeccion, citaDelItem, LARGO_DE_CITA } from "./senalar";
import { MARCA_DE_ALCANCE, lineaDeAlcance, mensajeSinAlcance } from "@/components/asistente/chat-de-seccion";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const SCHEMA = {
  type: "object",
  properties: {
    intro: { type: "string" },
    items: { type: "array", items: { type: "object" } },
    tags: { type: "array", items: { type: "string" } },
  },
};

describe("⭐ la lista se identifica por REFERENCIA, no por un nombre escrito a mano", () => {
  const items = [{ title: "Migración desde Excel", detail: "x" }];
  const tags = ["CRM"];
  const sec = { data: { intro: "hola", items, tags }, schema: SCHEMA };

  it("el array que llegó ES el del documento, y de ahí sale el nombre de la lista", () => {
    expect(listaDeLaSeccion(sec, items)).toBe("items");
    expect(listaDeLaSeccion(sec, tags)).toBe("tags");
  });

  it("⛔ una COPIA con el mismo contenido no es la misma lista", () => {
    /* Si la comparación fuera por contenido, dos listas con los mismos textos —el caso de las dos
       columnas de un comparativo recién creado, las dos vacías o las dos con un placeholder—
       resolverían a la misma, y el chat escribiría en la columna equivocada sin que nada avise. */
    expect(listaDeLaSeccion(sec, structuredClone(items))).toBeNull();
  });

  it("⛔ una lista DERIVADA no tiene botón: el `?? []` y el `.filter()` no son del documento", () => {
    expect(listaDeLaSeccion(sec, items.filter(() => true))).toBeNull();
    expect(listaDeLaSeccion(sec, [])).toBeNull();
  });

  it("⛔ una lista que el esquema del CHAT no declara no tiene botón", () => {
    /* `kpisConfirmados` vive FUERA del esquema a propósito (lo confirma un humano). Ofrecer el 💬
       ahí abriría el chat sobre algo que el vocabulario no alcanza. */
    const kpis = [{ label: "Ciclo", valor: "7 días" }];
    const conKpis = { data: { ...sec.data, kpisConfirmados: kpis }, schema: SCHEMA };
    expect(listaDeLaSeccion(conKpis, kpis)).toBeNull();
  });

  it("sin sección en pantalla —vista del cliente, PDF— no hay nada que señalar", () => {
    expect(listaDeLaSeccion(null, items)).toBeNull();
  });
});

describe("cómo se llama el ítem que se señaló", () => {
  it("el primer texto CON CONTENIDO, igual que el ancla del vocabulario", () => {
    expect(citaDelItem({ title: "", detail: "Traemos las hojas" })).toBe("Traemos las hojas");
    expect(citaDelItem("CRM")).toBe("CRM");
    expect(citaDelItem({ title: "  Migración   desde Excel " })).toBe("Migración desde Excel");
  });

  it("un ítem sin texto no se puede citar, así que no se pinta botón", () => {
    expect(citaDelItem({ title: "", detail: "" })).toBeNull();
    expect(citaDelItem(null)).toBeNull();
    expect(citaDelItem({ n: 3 })).toBeNull();
  });

  it("se recorta: la cita entra en el chip y en el mensaje", () => {
    expect(citaDelItem("x".repeat(400))?.length).toBe(LARGO_DE_CITA);
  });
});

describe("⚠ el marcador de alcance sigue entero en las dos formas", () => {
  /* Un marcador que se rompe no falla: se PINTA CRUDO arriba del mensaje de la persona, que es lo
     que se vio en pantalla el 2026-08-22. Por eso se prueban las dos formas y el ida y vuelta. */
  const casos = [
    { nombre: "sin cita (el botón de la sección)", s: { key: "objetivos", label: "Objetivos" } },
    {
      nombre: "con cita (el 💬 de un ítem)",
      s: { key: "objetivos", label: "Objetivos", cita: "Migración desde Excel" },
    },
  ];

  for (const { nombre, s } of casos) {
    it(`${nombre}: el bloque no tiene línea en blanco adentro y el mensaje sale limpio`, () => {
      const bloque = lineaDeAlcance(s);
      expect(bloque.startsWith(MARCA_DE_ALCANCE)).toBe(true);
      /* La línea en blanco es lo que CIERRA el bloque: una adentro lo cortaría por la mitad y la
         otra mitad se leería como texto de la persona. */
      expect(bloque.slice(0, -2)).not.toContain("\n\n");
      expect(mensajeSinAlcance(`${bloque}Cambiá esto`)).toBe("Cambiá esto");
    });
  }

  it("la cita viaja DENTRO del bloque, no después", () => {
    const bloque = lineaDeAlcance({ key: "k", label: "L", cita: "Migración desde Excel" });
    expect(mensajeSinAlcance(`${bloque}hola`)).toBe("hola");
    expect(bloque).toContain("Migración desde Excel");
  });
});

describe("dónde se monta el botón, y dónde NO", () => {
  const sortable = leer("components/landing/sortable.tsx");
  const senalar = leer("components/landing/senalar.tsx");

  it("⭐ una lista de UN ítem también tiene botón", () => {
    /* El ⠿ se apaga con un ítem solo porque no hay nada que reordenar. Señalar no: pedirle un
       cambio a la única tarjeta de una sección es el caso más común de todos. */
    const rama = sortable.slice(
      sortable.indexOf("if (disabled || items.length < 2)"),
      sortable.indexOf("const onDragEnd"),
    );
    expect(rama.length).toBeGreaterThan(200);
    expect(rama).toContain("<BotonDeSenalar");
  });

  it("⛔ en LECTURA el DOM no cambia: sin envoltorio y sin botón", () => {
    /* La vista del cliente y el PDF montan este mismo motor. Un envoltorio de más ahí es un riesgo
       visual a cambio de nada — no hay chat que abrir. */
    const rama = sortable.slice(
      sortable.indexOf("if (disabled || items.length < 2)"),
      sortable.indexOf("const onDragEnd"),
    );
    expect(rama).toContain("disabled ? (");
    expect(rama).toContain("<Fragment key={i}>{children(it, i, null)}</Fragment>");
  });

  it("⛔ señalar ABRE el chat, nunca escribe", () => {
    /* Ya existió una píldora ✨IA que reescribía al instante y se retiró a pedido de Elías: la
       lista numerada con casillas es donde se revisa, y saltearla no es un atajo. */
    expect(senalar).toContain("abrirCon(");
    expect(senalar).not.toContain("onChange");
    expect(senalar).not.toMatch(/\bfetch\(/);
  });

  it("⛔ ningún chip compacto se queda tapado por el 💬", () => {
    /* Donde el ⠿ tuvo que volverse INLINE es porque un botón absoluto de 28px se come el chip
       entero. El 💬 mide lo mismo, así que la lista de chips compactos tiene que ser LA MISMA en
       las dos reglas — si aparece un cuarto y solo entra en la del handle, el 💬 lo tapa y nadie
       se entera hasta verlo. */
    const css = leer("app/landing-engine.css");
    /* Un chip es COMPACTO cuando su regla del handle lo saca del flujo absoluto (`position:
       static`) — ése es el marcador, no la lista de nombres, así que un cuarto chip entra solo. */
    const compactos = [...css.matchAll(/([^}]*\.stl-drag-item\s*\{[^}]*\})/g)]
      .filter((m) => /position:\s*static/.test(m[1]))
      .flatMap((m) => [...m[1].matchAll(/\.stl \.(stl-[a-z-]+) \.stl-drag-item/g)].map((x) => x[1]));
    expect(compactos.length, "el marcador `position: static` dejó de identificar los chips").toBeGreaterThan(2);
    for (const c of compactos) {
      expect(css, `falta la regla que esconde el 💬 sobre .${c}`).toContain(`*:has(> .${c}) > .stl-senalar`);
    }
  });

  it("el motor le pasa a la sección el MISMO `data` que recibe el componente", () => {
    /* Si el proveedor recibiera una copia, la identidad de referencia no matchearía nunca y el
       botón no aparecería en ninguna lista — un apagado total y silencioso. */
    const lv = leer("components/landing/LandingView.tsx");
    expect(lv).toContain("<SeccionEnPantallaProvider");
    const decl = lv.slice(lv.indexOf("const enPantalla = {"), lv.indexOf("const cuerpo = showLegacy"));
    expect(decl.length).toBeGreaterThan(60);
    expect(decl).toContain("data,");
    expect(decl).toContain("schema: schemaParaElChat(def)");
  });
});
