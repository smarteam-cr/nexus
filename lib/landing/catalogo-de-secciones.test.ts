/**
 * lib/landing/catalogo-de-secciones.test.ts — EL TIPO DE UNA SECCIÓN CREADA NO SE PUEDE PERDER.
 *
 * Correr: `npx vitest run lib/landing/catalogo-de-secciones.test.ts --project unit`.
 *
 * ── QUÉ PROTEGE ───────────────────────────────────────────────────────────────────────────────
 * Desde el 2026-08-21 una sección creada puede ser una tabla, un texto, unas métricas… y lo que
 * decide cuál es la KEY (`custom:<tipo>:<uuid>`). Dos cosas tienen que seguir siendo ciertas o el
 * daño es invisible:
 *
 *   1. **Las secciones creadas ANTES siguen resolviendo.** Sus keys tienen dos segmentos, sin
 *      tipo. Exigirles tres las dejaría sin def — o sea, las borraría de propuestas ya enviadas.
 *   2. **Un tipo desconocido degrada, no desaparece.** Una key de un canvas viejo, o un tipo que
 *      se retiró, tiene que caer al renderer tonto. Devolver `null` hace que `toSectionDef` no
 *      resuelva y la sección se evapore sin ningún error.
 */
import { describe, it, expect } from "vitest";
import {
  CATALOGO_DE_SECCIONES,
  TIPO_POR_DEFECTO,
  catalogoLegible,
  customDef,
  defDelTipo,
  tipoCreable,
} from "./catalogo-de-secciones";
import { CUSTOM_PREFIX, HTML_EMBED_TYPE, nuevaCustomKey, tipoDeCustomKey } from "./custom-sections";

describe("⭐ la gramática de la key lleva el tipo", () => {
  it("una key nueva declara su tipo y se puede leer de vuelta", () => {
    for (const t of CATALOGO_DE_SECCIONES) {
      const key = nuevaCustomKey(t.tipo);
      expect(tipoDeCustomKey(key), `${t.tipo} no sobrevive el ida y vuelta`).toBe(t.tipo);
    }
  });

  it("⚠ y una key VIEJA (dos segmentos) sigue siendo el embebido de HTML", () => {
    /* ⛔ La edición que la pone en rojo: exigir tres segmentos en `tipoDeCustomKey`. Las secciones
       personalizadas que ya existen en producción tienen dos, y quedarían sin def — o sea,
       desaparecerían de propuestas que ya se enviaron. */
    const vieja = `${CUSTOM_PREFIX}0f9a1b2c-3d4e-5f60-7182-93a4b5c6d7e8`;
    expect(tipoDeCustomKey(vieja)).toBeNull();
    expect(
      customDef(vieja).sectionType,
      "una sección personalizada vieja cambió de renderer",
    ).toBe(HTML_EMBED_TYPE);
  });

  it("⚠ el uuid lleva guiones y NO rompe el parseo", () => {
    /* El separador es `:` y un uuid nunca lo tiene: por eso partir por `:` es inequívoco. Si
       alguien cambiara el separador a `-`, esto se cae. */
    const key = nuevaCustomKey("tabla");
    expect(key.split(":")).toHaveLength(3);
    expect(tipoDeCustomKey(key)).toBe("tabla");
  });

  it("⛔ un tipo desconocido DEGRADA al renderer tonto, no desaparece", () => {
    /* La edición que la pone en rojo: hacer que `defDelTipo` devuelva `null` para lo que no está
       en el catálogo. `toSectionDef` no resolvería componente y la sección se evapora del editor,
       del PDF y de la propuesta del cliente — sin error, sin log y sin test rojo. */
    expect(tipoCreable("un_tipo_que_nadie_programo")).toBeNull();
    expect(defDelTipo("un_tipo_que_nadie_programo").tipo).toBe(TIPO_POR_DEFECTO);
    const key = `${CUSTOM_PREFIX}un_tipo_que_nadie_programo:abc`;
    expect(customDef(key).sectionType, "una key con tipo raro dejó de resolver").toBe(
      HTML_EMBED_TYPE,
    );
  });

  it("⚠ un tipo con mayúsculas o con espacios NO es un tipo", () => {
    /* La gramática es cerrada a propósito: sin eso, `custom:Tabla:x` y `custom:tabla:x` serían
       dos tipos distintos y uno de los dos no resolvería. */
    expect(tipoDeCustomKey(`${CUSTOM_PREFIX}Tabla:abc`)).toBeNull();
    expect(tipoDeCustomKey(`${CUSTOM_PREFIX}mi tipo:abc`)).toBeNull();
  });
});

describe("⭐ el catálogo se puede ofrecer sin inventar", () => {
  it("cada tipo tiene nombre y una línea de qué pinta", () => {
    /* Es lo que lee una persona en el desplegable y lo que va a leer el chat para contestar «¿qué
       podés crear?». Un tipo sin esa frase obliga a inventarla. */
    for (const t of catalogoLegible()) {
      expect(t.nombre.length, `${t.tipo} sin nombre legible`).toBeGreaterThan(2);
      expect(t.queEs.length, `${t.tipo} no dice qué pinta`).toBeGreaterThan(20);
    }
  });

  it("los tipos son únicos y con la gramática de la key", () => {
    const tipos = CATALOGO_DE_SECCIONES.map((t) => t.tipo);
    expect(new Set(tipos).size, "hay tipos repetidos: uno taparía al otro").toBe(tipos.length);
    for (const t of tipos) expect(t, `«${t}» no entra en una key`).toMatch(/^[a-z_]+$/);
  });

  it("⛔ y NO ofrece los tipos que son estructurales, plata o del proyecto", () => {
    /* El criterio de corte del catálogo, hecho cumplir. Una segunda portada no es libertad: es un
       documento roto. Una inversión creada por conversación es un precio inventado en un papel que
       el cliente firma. Y las que leen el proyecto (cronograma, procesos) pintarían lo mismo dos
       veces.
       La edición que la pone en rojo: sumar `inversion` o `hero` al catálogo. */
    const prohibidos = [
      "hero",
      "kickoff_hero",
      "inversion",
      "web_investment",
      "use_cases",
      "partner",
      "kickoff_timeline",
      "kickoff_procesos",
      "estimacion",
      "cronograma_gantt",
    ];
    const ofrecidos = CATALOGO_DE_SECCIONES.map((t) => t.sectionType);
    for (const p of prohibidos) {
      expect(ofrecidos, `el catálogo ofrece «${p}», que no se puede crear suelta`).not.toContain(p);
    }
  });

  it("⚠ el embebido de HTML es el ÚNICO que la IA no escribe", () => {
    /* Su contenido es markup que pegó una persona. Un agente reescribiéndolo a través de un schema
       de cero propiedades no lo mejora: no hace nada —la coerción devuelve vacío y el merge lo
       repone tal cual—, cobra el modelo, y el cartel dice que lo reescribió.
       ⚠ Los demás tipos SÍ los escribe: se crean justamente para que los llene. Apagarlos los
       volvería secciones vacías que solo se pueden completar a mano. */
    for (const t of CATALOGO_DE_SECCIONES) {
      const def = customDef(nuevaCustomKey(t.tipo));
      const esperado = t.sectionType === HTML_EMBED_TYPE ? false : true;
      expect(def.agentGenerated, `${t.tipo}: la IA ${esperado ? "no puede" : "puede"} escribirla`).toBe(
        esperado,
      );
    }
  });

  it("⚠ el `empty` de cada def es una COPIA, no la del catálogo", () => {
    /* Dos secciones del mismo tipo comparten el objeto si no se clona, y editar una movería la
       otra — el peor bug posible en un documento que se publica. */
    const a = customDef(nuevaCustomKey("tabla")).empty as { filas: unknown[] };
    const b = customDef(nuevaCustomKey("tabla")).empty as { filas: unknown[] };
    expect(a).not.toBe(b);
    expect(a.filas).not.toBe(b.filas);
  });
});
