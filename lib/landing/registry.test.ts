/**
 * lib/landing/registry.test.ts — registros CONGELADOS del motor de landing (Ola 7).
 *
 * `toSectionDef` devuelve null —y la sección DESAPARECE sin romper nada— cuando un
 * `sectionType` no está en el registry de componentes. Un typo se iría a producción
 * con la suite verde y una sección del documento del cliente se esfumaría en
 * silencio. Este test lo hace imposible, para los 3 tipos sobre CanvasBlock
 * (BC_TEMPLATES + kickoff + desarrollo); Roles tiene el suyo (lib/roles/roles.test).
 *
 * Además congela las KEYS por template: agregar/quitar/reordenar una sección es una
 * decisión de producto — el snapshot obliga a tocarlo a conciencia, no por accidente.
 *
 * Espejo de lib/roles/roles.test.ts. Vive en lib/ (el project unit de vitest solo
 * incluye lib/**). Contrato completo del motor: ARCHITECTURE §1-WEB.
 */
import { describe, it, expect } from "vitest";
import { CRONOGRAMA_SECTION_DEFS } from "@/components/landing/configs/cronograma.defs";
import {
  CRONOGRAMA_SECTION_COMPONENTS,
  landingConfigForCronograma,
} from "@/components/landing/configs/cronograma";
import { BC_TEMPLATES } from "@/components/landing/configs/templates.defs";
import {
  SECTION_COMPONENTS,
  landingConfigFor,
  configForCanvas,
  configForSnapshot,
} from "@/components/landing/configs/templates";
import { KICKOFF_SECTION_DEFS } from "@/components/landing/configs/kickoff.defs";
import { KICKOFF_SECTION_COMPONENTS, landingConfigForKickoff } from "@/components/landing/configs/kickoff";
import { PROPUESTA_SECTION_COMPONENTS } from "@/components/landing/configs/propuesta";
import { ROLES_SECTION_COMPONENTS } from "@/components/landing/configs/roles";
import { DESARROLLO_SECTION_DEFS } from "@/components/landing/configs/desarrollo.defs";
import { DESARROLLO_SECTION_COMPONENTS, landingConfigForDesarrollo } from "@/components/landing/configs/desarrollo";
import { EXPLORACION_SECTION_DEFS } from "@/components/landing/configs/exploracion.defs";
import { EXPLORACION_SECTION_COMPONENTS, landingConfigForExploracion } from "@/components/landing/configs/exploracion";
import { DIAGNOSTICO_SECTION_DEFS, DIAGNOSTICO_DEF_BY_KEY } from "@/components/landing/configs/diagnostico.defs";
import { DIAGNOSTICO_SECTION_COMPONENTS, landingConfigForDiagnostico } from "@/components/landing/configs/diagnostico";
import { DIAGNOSTICO_CANVAS, PLANIFICACION_CANVAS, IMPLEMENTACION_CANVAS, ENTREGA_CANVAS } from "@/lib/canvas/canvas-defs";
import { ENTREGA_SECTION_DEFS, ENTREGA_DEF_BY_KEY } from "@/components/landing/configs/entrega.defs";
import { ENTREGA_SECTION_COMPONENTS, landingConfigForEntrega } from "@/components/landing/configs/entrega";
import { IMPLEMENTACION_SECTION_DEFS } from "@/components/landing/configs/implementacion.defs";
import { IMPLEMENTACION_SECTION_COMPONENTS, landingConfigForImplementacion } from "@/components/landing/configs/implementacion";
import { PLANIFICACION_SECTION_DEFS, PLANIFICACION_DEF_BY_KEY } from "@/components/landing/configs/planificacion.defs";
import { PLANIFICACION_SECTION_COMPONENTS, landingConfigForPlanificacion } from "@/components/landing/configs/planificacion";
import { HTML_EMBED_TYPE } from "@/lib/landing/custom-sections";
import { TARJETAS_TYPE } from "@/lib/landing/catalogo-de-secciones";
import {
  CATALOGO_DE_SECCIONES,
  TABLA_TYPE,
  TIPO_POR_DEFECTO,
} from "@/lib/landing/catalogo-de-secciones";
import { COMPONENTES_CREABLES } from "@/components/landing/configs/templates";
/* ⚠ `PROCESS_MAPPING_SCHEMA` ya no se importa acá: desde el 2026-08-23 los asserts recorren las
   defs REALES de los cinco documentos en vez de dos constantes. Probar la constante daba verde
   mientras cuatro documentos pintaban campos que su propio schema no declaraba. */
import { PROCESS_MAPPING_SCHEMA_CON_TITULAR } from "@/components/landing/configs/shared-sections.defs";
import { t } from "@/components/landing/i18n";
import type { BCSectionDef } from "@/components/landing/configs/business-case.defs";
import {
  ALIAS_DE_SECTION_TYPE,
  claseDeSeccion,
  tipoCanonico,
  type ClaseDeSeccion,
} from "@/lib/landing/clase-de-seccion";
import fs from "node:fs";
import path from "node:path";


/**
 * ⭐ TODAS LAS DEFS VIVAS DEL MOTOR, con el documento que las declara.
 *
 * ⛔ La razón de que sean TODAS y no una constante compartida: el 2026-08-23 un assert probaba dos
 * constantes de esquema y daba verde mientras CUATRO documentos pintaban campos que su propio
 * schema no declaraba. Probar la fuente compartida no prueba a los que la copiaron.
 */
const DEFS_DE_TODOS_LOS_DOCUMENTOS: readonly { doc: string; def: BCSectionDef }[] = [
  ...Object.values(BC_TEMPLATES).flatMap((t) => t.sections.map((def) => ({ doc: t.id, def }))),
  ...DIAGNOSTICO_SECTION_DEFS.map((def) => ({ doc: "diagnostico", def })),
  ...PLANIFICACION_SECTION_DEFS.map((def) => ({ doc: "planificacion", def })),
  ...IMPLEMENTACION_SECTION_DEFS.map((def) => ({ doc: "implementacion", def })),
  ...ENTREGA_SECTION_DEFS.map((def) => ({ doc: "entrega", def })),
  ...KICKOFF_SECTION_DEFS.map((def) => ({ doc: "kickoff", def })),
  ...DESARROLLO_SECTION_DEFS.map((def) => ({ doc: "desarrollo", def })),
  ...EXPLORACION_SECTION_DEFS.map((def) => ({ doc: "exploracion", def })),
  ...CRONOGRAMA_SECTION_DEFS.map((def) => ({ doc: "cronograma", def })),
];


/**
 * ⭐ EL MOTOR NO PINTA LO QUE NO DECLARA — el trinquete que cierra la clase entera del fallo #4.
 *
 * ── EL FALLO, Y POR QUÉ NINGUNA GUARDA LO VIO ────────────────────────────────────────────────
 * `sections-shared.tsx` pinta `resumenHoy` y `resumenSera` dentro de cada proceso. Los declaraba
 * UN documento —Entrega— y los otros CUATRO montaban el mismo renderer sin declararlos. Resultado:
 * el CSE veía un campo editable vacío («En una línea…»), escribía, y `coerceToSchema` se lo
 * borraba en la siguiente regeneración. UI muerta, sin un error en ningún lado.
 *
 * ⭐ LA FORMA DEL INVARIANTE, Y ES LA PARTE QUE IMPORTA. La tentación es parsear el renderer para
 * ver qué claves lee: frágil, y con `p.resumenHoy` dentro de un `.map()` ni siquiera se sabe de qué
 * lista sale. El hecho estructural es más simple y exacto: **un componente es UNO, así que su
 * contrato de datos tiene que ser UNO**. Si dos defs montan el mismo `sectionType` y una declara
 * una clave que la otra no, alguien copió un esquema y editó una sola copia — que es literalmente
 * cómo nació el fallo, y cómo nacería otra vez con `subhead` sobre las CINCO copias inline de
 * `PROSA_SCHEMA`.
 *
 * ⚠ Y es «TODAS, no la unión»: comparar contra la unión dejaría a Entrega tapando a los otros
 * cuatro, que es exactamente el estado que este test viene a hacer imposible.
 *
 * ── LA PROFUNDIDAD CAMBIA LA GRAVEDAD, Y CONVIENE SABERLO ANTES DE REACCIONAR ────────────────
 * `preserveNonSchemaKeys` (lib/ai/section-schema.ts:60-71) acarrea las claves de PRIMER NIVEL que
 * el esquema no declara. O sea:
 *   · una divergencia ANIDADA (`procesos[].resumenHoy`) es PÉRDIDA DE DATOS: `coerceToSchema` la
 *     borra en cada regeneración y nada la rescata;
 *   · una de primer nivel (`eyebrow` en las cuatro portadas) sobrevive, y a veces está afuera A
 *     PROPÓSITO — el rótulo chico lo escribe una persona, no el agente, y por eso vive en
 *     `schemaDelChat` y no en `schema`.
 * Las dos se reportan igual: el esquema ES el prompt, así que una clave que un documento declara y
 * otro no también significa que un agente la escribe y el otro no. Pero la de primer nivel se
 * resuelve muchas veces declarándola en `schemaDelChat`, no en `schema`.
 *
 * ⛔ ROLES Y LA PROPUESTA LABORAL QUEDAN AFUERA, y se dice: su contenido no vive en `CanvasBlock`
 * sino en `RoleProfile.content`, y tres de sus secciones tienen `schema: {properties:{}}` con el
 * renderer leyendo diez campos. Es un hueco REAL —medido el 2026-08-23 por el censo de este mismo
 * trabajo— y es su propia tanda: meterlo acá pondría el trinquete en rojo el día uno sobre algo
 * que este cambio no arregla.
 *
 * ── MEDIDO AL ESCRIBIRLO (2026-08-23) ────────────────────────────────────────────────────────
 * 45 `sectionType` vivos · 9 compartidos por dos o más documentos · **5 divergencias**, las cinco
 * deliberadas y anotadas abajo. El trinquete SOLO BAJA: una entrada nueva se agrega con su motivo
 * escrito, y sacarla es el trabajo de arreglar la divergencia.
 */
const DIVERGENCIAS_ACEPTADAS: readonly { tipo: string; campo: string; porQue: string }[] = [
  {
    tipo: "diagram",
    campo: "sistemas",
    porQue:
      "`diagram` es un BUILDER con dos formas: el diagrama de sistemas (sistemas + conexiones) y " +
      "el de objetos (objetos + asociaciones). Son dos grafos distintos con el mismo renderer, no " +
      "una copia mal editada.",
  },
  {
    tipo: "diagram",
    campo: "conexiones",
    porQue:
      "La otra mitad del par «sistemas»: las flechas entre sistemas. Solo `desarrollo/arquitectura` " +
      "y las tres arquitecturas de plataforma dibujan este grafo; la de objetos no tiene flechas " +
      "entre sistemas porque sus nodos son objetos de HubSpot.",
  },
  {
    tipo: "diagram",
    campo: "objetos",
    porQue:
      "Los nodos del OTRO grafo: los objetos de HubSpot y sus propiedades. Solo lo declara " +
      "`desarrollo/relacion_objetos`; en un diagrama de sistemas no existe el concepto, y " +
      "declararlo pondría a cuatro agentes a inventar objetos que ese documento no describe.",
  },
  {
    tipo: "diagram",
    campo: "asociaciones",
    porQue:
      "Las aristas del grafo de objetos —cardinalidades entre objetos de HubSpot—, hermanas de " +
      "`objetos`. Mismo motivo: en el grafo de sistemas no hay asociaciones que declarar, y el " +
      "campo vacío empujaría al agente a rellenarlo.",
  },
  {
    tipo: "hero",
    campo: "titulo",
    porQue:
      "Las portadas de los dos documentos de VENTA (business case y sitio web) no llevan rótulo " +
      "de sección: su encabezado es el titular. Los documentos de proyecto sí, y ahí `titulo` es " +
      "el rótulo chico de arriba.",
  },
];

describe("un renderer, un contrato de datos", () => {
  /** Las claves de primer nivel que un schema declara. */
  /**
   * ⛔ TODAS las rutas que un schema declara, no las de primer nivel — y la diferencia NO es
   * cosmética: `resumenHoy` y `resumenSera` viven DENTRO de `procesos[]`, así que un chequeo de
   * primer nivel da verde sobre el fallo exacto que este test viene a cerrar. Lo descubrí
   * rompiéndolo a propósito… y lo volví a descubrir cuando un `cp` de un respaldo viejo se llevó
   * esta función y la suite siguió en verde con la guarda ciega.
   */
  const rutas = (schema: unknown, prefijo = ""): string[] => {
    const s = schema as { type?: string; properties?: Record<string, unknown>; items?: unknown };
    if (s?.type === "array") return rutas(s.items, `${prefijo}[]`);
    const props = s?.properties;
    if (!props) return prefijo ? [prefijo] : [];
    return Object.entries(props).flatMap(([k, sub]) => rutas(sub, prefijo ? `${prefijo}.${k}` : k));
  };
  const claves = (schema: unknown): string[] => rutas(schema);

  /**
   * ⛔ CANÓNICO, no crudo. `desarrollo_hero` y `planificacion_hero` son la MISMA función React con
   * dos nombres, y agrupando por el nombre crudo esta guarda no compara sus contratos. Fue esa
   * canonización la que destapó `hubs_cliente`: el mismo componente montado con `{title, detail}`
   * en la Entrega y `{titulo, detalle, canales}` en la propuesta.
   * ⚠ `sectionType` ausente = la key, igual que hace `toSectionDef`.
   */
  const tipoDe = (def: BCSectionDef) => tipoCanonico(def.sectionType ?? def.key);

  const porTipo = new Map<string, { doc: string; key: string; claves: string[] }[]>();
  for (const { doc, def } of DEFS_DE_TODOS_LOS_DOCUMENTOS) {
    const t = tipoDe(def);
    if (!porTipo.has(t)) porTipo.set(t, []);
    porTipo.get(t)!.push({ doc, key: def.key, claves: claves(def.schema) });
  }
  const compartidos = [...porTipo.entries()].filter(([, l]) => l.length > 1);

  it("⛔ el chequeo entra DENTRO de las listas, no se queda en el primer nivel", () => {
    /* Rompí la recursión a propósito y la suite quedó VERDE: hoy no hay ninguna divergencia
       anidada viva, así que el chequeo de primer nivel no se distingue del bueno. Pero el fallo
       que este trinquete existe para cerrar —`resumenHoy` dentro de `procesos[]`— ES anidado, y
       volvería a pasar sin ruido. Por eso la recursión tiene su propio assert en vez de depender
       de que exista un caso vivo que la delate. */
    const rutasDe = claves({
      type: "object",
      properties: {
        intro: { type: "string" },
        procesos: {
          type: "array",
          items: { type: "object", properties: { nombre: { type: "string" }, resumenHoy: { type: "string" } } },
        },
      },
    });
    expect(rutasDe.sort()).toEqual(["intro", "procesos[].nombre", "procesos[].resumenHoy"]);
  });

  it("la guarda está mirando el motor entero, no un rincón", () => {
    /* Sin este piso, borrar un import dejaría el test verde sobre tres defs. */
    expect(DEFS_DE_TODOS_LOS_DOCUMENTOS.length).toBeGreaterThan(80);
    /* 34 canónicos y 12 compartidos al escribirlo (45 tipos crudos, menos los 11 alias). */
    expect(porTipo.size, "se cayeron sectionTypes del censo").toBeGreaterThan(30);
    expect(compartidos.length, "ningún tipo compartido = el test no compara nada").toBeGreaterThan(9);
  });

  /**
   * La excepción se declara por la RAÍZ del campo y cubre sus hojas: `diagram.objetos` tapa
   * `diagram.objetos[].nombre`, `[].detalle` y `[].equivale`. Exigir una entrada por hoja daría
   * una lista de 21 líneas para cinco decisiones, y una lista larga se lee salteada.
   */
  const cubierta = (tipo: string, ruta: string) =>
    DIVERGENCIAS_ACEPTADAS.some(
      (d) =>
        d.tipo === tipo &&
        (ruta === d.campo || ruta.startsWith(`${d.campo}[`) || ruta.startsWith(`${d.campo}.`)),
    );

  it("⭐ dos documentos que montan el MISMO renderer declaran las MISMAS claves", () => {
    const divergencias: string[] = [];
    for (const [tipo, lista] of compartidos) {
      const union = [...new Set(lista.flatMap((x) => x.claves))].sort();
      for (const campo of union) {
        const sin = lista.filter((x) => !x.claves.includes(campo));
        if (sin.length === 0 || sin.length === lista.length) continue;
        if (cubierta(tipo, campo)) continue;
        divergencias.push(
          `${tipo}.${campo} — lo declaran ${lista.length - sin.length} de ${lista.length}; falta en ` +
            sin.map((x) => `${x.doc}/${x.key}`).join(", "),
        );
      }
    }
    expect(
      divergencias,
      "Un renderer con dos contratos: alguien copió un esquema y editó una sola copia. El " +
        "documento que NO declara la clave la pinta igual y `coerceToSchema` borra lo que el CSE " +
        "escriba ahí. Agregala a las demás defs, o —si la divergencia es a propósito— sumala a " +
        "DIVERGENCIAS_ACEPTADAS con el motivo escrito.",
    ).toEqual([]);
  });

  it("⛔ el trinquete solo baja: ninguna excepción sobra ni se acepta sin motivo", () => {
    /* Una entrada que ya no divergía y quedó en la lista es peor que ninguna lista: enseña que la
       lista se puede llenar sin costo. Espejo de `token-vocab.test.ts`. */
    const reales: { tipo: string; ruta: string }[] = [];
    for (const [tipo, lista] of compartidos) {
      for (const ruta of new Set(lista.flatMap((x) => x.claves))) {
        const sin = lista.filter((x) => !x.claves.includes(ruta)).length;
        if (sin > 0 && sin < lista.length) reales.push({ tipo, ruta });
      }
    }
    const sobran = DIVERGENCIAS_ACEPTADAS.filter(
      (d) =>
        !reales.some(
          (r) =>
            r.tipo === d.tipo &&
            (r.ruta === d.campo ||
              r.ruta.startsWith(`${d.campo}[`) ||
              r.ruta.startsWith(`${d.campo}.`)),
        ),
    ).map((d) => `${d.tipo}.${d.campo}`);
    expect(sobran, "esa divergencia ya no existe: sacala de la lista").toEqual([]);
    for (const d of DIVERGENCIAS_ACEPTADAS) {
      expect(d.porQue.length, `${d.tipo}.${d.campo} entró sin motivo escrito`).toBeGreaterThan(60);
    }
  });


  it("⭐ un alias resuelve al MISMO componente que su canónico", () => {
    /* Es lo único que hace verdadera la palabra «alias». Si un día alguien apunta `dolores` a otro
       renderer, las guardas que agrupan por canónico compararían dos contratos que ya no son el
       mismo — y lo harían en silencio, dando por buena una divergencia real. */
    /* ⚠ LOS DOCE, no diez. La primera versión de esta guarda se dejaba afuera PROPUESTA y ROLES —
       que es justo donde vive la única colisión real del motor. Lo destapó un verificador del
       censo del 2026-08-23. Un aplanado silencioso habría hecho que la guarda comparara contra el
       componente equivocado y diera verde. */
    const MAPAS: readonly [string, Record<string, unknown>][] = [
      ["SECTION_COMPONENTS", SECTION_COMPONENTS],
      ["COMPONENTES_CREABLES", COMPONENTES_CREABLES],
      ["KICKOFF", KICKOFF_SECTION_COMPONENTS],
      ["CRONOGRAMA", CRONOGRAMA_SECTION_COMPONENTS],
      ["DESARROLLO", DESARROLLO_SECTION_COMPONENTS],
      ["DIAGNOSTICO", DIAGNOSTICO_SECTION_COMPONENTS],
      ["ENTREGA", ENTREGA_SECTION_COMPONENTS],
      ["EXPLORACION", EXPLORACION_SECTION_COMPONENTS],
      ["IMPLEMENTACION", IMPLEMENTACION_SECTION_COMPONENTS],
      ["PLANIFICACION", PLANIFICACION_SECTION_COMPONENTS],
      ["PROPUESTA", PROPUESTA_SECTION_COMPONENTS],
      ["ROLES", ROLES_SECTION_COMPONENTS],
    ];
    const TODOS_LOS_MAPAS: Record<string, unknown> = Object.assign({}, ...MAPAS.map(([, m]) => m));
    expect(MAPAS.length, "se cayó un mapa de la guarda").toBe(12);
    expect(Object.keys(TODOS_LOS_MAPAS).length, "la guarda no está mirando nada").toBeGreaterThan(50);
    const rotos: string[] = [];
    for (const [alias, canonico] of Object.entries(ALIAS_DE_SECTION_TYPE)) {
      const a = TODOS_LOS_MAPAS[alias];
      const c = TODOS_LOS_MAPAS[canonico];
      if (!a || !c) {
        rotos.push(`${alias} → ${canonico}: uno de los dos no está registrado en ningún mapa`);
      } else if (a !== c) {
        rotos.push(`${alias} → ${canonico}: apuntan a componentes DISTINTOS`);
      }
    }
    expect(rotos, "un «alias» que no es alias").toEqual([]);
  });

  /**
   * ⭐ EL INVERSO DEL ALIAS: un mismo `sectionType` que significa DOS componentes distintos.
   *
   * Es el aplanado que la guarda de arriba tapaba y que el censo destapó: `role_cadence` es
   * `RoleCadenceSection` en el perfil de puesto y `PropuestaSesionesSection` en la propuesta
   * laboral. Está hecho a propósito y comentado (`configs/propuesta.ts:40-42`), pero es el ÚNICO
   * de los 62 así — y mientras nadie lo declare, cualquier guarda que junte los mapas en un objeto
   * plano elige uno de los dos en silencio, según el orden del spread.
   */
  const COLISIONES_DECLARADAS = new Set(["role_cadence"]);

  it("⛔ ningún sectionType significa dos componentes distintos, salvo el declarado", () => {
    const MAPAS: readonly Record<string, unknown>[] = [
      SECTION_COMPONENTS,
      COMPONENTES_CREABLES,
      KICKOFF_SECTION_COMPONENTS,
      CRONOGRAMA_SECTION_COMPONENTS,
      DESARROLLO_SECTION_COMPONENTS,
      DIAGNOSTICO_SECTION_COMPONENTS,
      ENTREGA_SECTION_COMPONENTS,
      EXPLORACION_SECTION_COMPONENTS,
      IMPLEMENTACION_SECTION_COMPONENTS,
      PLANIFICACION_SECTION_COMPONENTS,
      PROPUESTA_SECTION_COMPONENTS,
      ROLES_SECTION_COMPONENTS,
    ];
    const porTipoComp = new Map<string, Set<unknown>>();
    for (const m of MAPAS) {
      for (const [t, comp] of Object.entries(m)) {
        if (!porTipoComp.has(t)) porTipoComp.set(t, new Set());
        porTipoComp.get(t)!.add(comp);
      }
    }
    const colisiones = [...porTipoComp.entries()]
      .filter(([t, comps]) => comps.size > 1 && !COLISIONES_DECLARADAS.has(t))
      .map(([t]) => t);
    expect(
      colisiones,
      "ese sectionType resuelve a dos renderers distintos: o es deliberado y se declara, o alguien " +
        "reusó un nombre y una de las dos superficies pinta lo que no es",
    ).toEqual([]);
    /* Y el trinquete al revés: una colisión declarada que ya no existe se saca. */
    const sobran = [...COLISIONES_DECLARADAS].filter((t) => (porTipoComp.get(t)?.size ?? 0) < 2);
    expect(sobran, "esa colisión ya no existe: sacala de la lista").toEqual([]);
  });

  /**
   * ⭐ EL CENSO CONGELADO — la formalización que pidió Elías, y lo que impide que se pudra.
   *
   * La clase se DERIVA (ver `lib/landing/clase-de-seccion.ts`): estructural el que no se mueve,
   * módulo el que vive en un solo documento, genérico el que comparten dos o más. Lo que se
   * congela es el resultado, para que un tipo no cambie de clase sin que nadie lo decida.
   *
   * ⚠ El caso real: `props_table` nació como módulo de Desarrollo y hoy está también en
   * Implementación. Se prestó, y nada dijo nada. Con esto, prestarlo pone el test en rojo y la
   * decisión se toma a la vista.
   */
  const CENSO_CONGELADO: Readonly<Record<string, ClaseDeSeccion>> = {
    // ── Estructurales: portadas y cierres. No se mueven ni se ocultan.
    hero: "estructural",
    kickoff_hero: "estructural",
    desarrollo_hero: "estructural",
    cronograma_hero: "estructural",
    kickoff_cta: "estructural",
    // ── Genéricos: el núcleo que Elías describió, compartido por dos o más documentos.
    kickoff_prose: "generico",
    process_mapping: "generico",
    roi: "generico",
    web_diagnosis: "generico",
    diagram: "generico",
    pain: "generico",
    props_table: "generico",
    hubs_cliente: "generico",
    /* ⚠ `inversion` PARECE un módulo de la propuesta de HubSpot y no lo es: con su alias
       `web_investment` lo montan las DOS propuestas comerciales. Su esquema tiene que servirle a
       las dos — que es justo lo que el trinquete de arriba vigila. */
    inversion: "generico",
    // ── Módulos de canvas: propios de UNA pieza.
    kickoff_equipo: "modulo",
    kickoff_horarios: "modulo",
    kickoff_canales: "modulo",
    kickoff_procesos: "modulo",
    kickoff_compara: "modulo",
    kickoff_timeline: "modulo",
    exploracion_sesiones: "modulo",
    estimacion: "modulo",
    impacto_declarado: "modulo",
    prompts_breeze: "modulo",
    cronograma_gantt: "modulo",
    antes_despues: "modulo",
    cronograma: "modulo",
    cta: "modulo",
    partner: "modulo",
    use_cases: "modulo",
    site_architecture: "modulo",
    web_methodology: "modulo",
    web_scope: "modulo",
    why_us: "modulo",
  };

  it("⭐ nada queda sin clasificar, y nada cambia de clase en silencio", () => {
    /* ⛔ Esta es la assert que mantiene vivo a `clase-de-seccion.ts`. Sin ella el archivo sería la
       próxima `rotulosDeCampos`: declarado, consumido por nadie, y falso a los tres meses. */
    const docsPorTipo = new Map<string, Set<string>>();
    const estructural = new Set<string>();
    for (const { doc, def } of DEFS_DE_TODOS_LOS_DOCUMENTOS) {
      const t = tipoDe(def);
      if (!docsPorTipo.has(t)) docsPorTipo.set(t, new Set());
      docsPorTipo.get(t)!.add(doc);
      if (def.backdrop || def.pinned || def.noHide) estructural.add(t);
    }
    const real: Record<string, ClaseDeSeccion> = {};
    for (const [t, docs] of docsPorTipo) {
      real[t] = claseDeSeccion({ estructural: estructural.has(t), documentos: docs.size });
    }
    /* ⚠ Los dos lados: un tipo nuevo sin clasificar, y una entrada congelada que ya no existe. */
    const sinClasificar = Object.keys(real).filter((t) => !(t in CENSO_CONGELADO));
    expect(
      sinClasificar,
      "sectionType nuevo: decidí si es estructural, un módulo de su canvas, o genérico — y sumalo al censo",
    ).toEqual([]);
    const fantasma = Object.keys(CENSO_CONGELADO).filter((t) => !(t in real));
    expect(fantasma, "esos tipos ya no existen: sacalos del censo").toEqual([]);
    const cambiados = Object.keys(real)
      .filter((t) => real[t] !== CENSO_CONGELADO[t])
      .map((t) => `${t}: era «${CENSO_CONGELADO[t]}» y ahora es «${real[t]}» (documentos: ${[...(docsPorTipo.get(t) ?? [])].join(", ")})`);
    expect(
      cambiados,
      "Un tipo cambió de clase. Si se PRESTÓ a otro documento, decidilo a la vista: o es genérico " +
        "de verdad y su esquema tiene que servir a los dos, o vuelve a ser de su canvas.",
    ).toEqual([]);
  });

  it("⚠ y las CINCO copias inline de PROSA_SCHEMA siguen siendo una sola forma", () => {
    /* `kickoff_prose` lo montan 20 secciones de 5 documentos, cada uno con su copia del esquema
       escrita a mano. Es el candidato número uno a repetir el fallo #4 — y el que la próxima tanda
       va a tocar para sumarle `subhead`. */
    const prosa = porTipo.get("kickoff_prose") ?? [];
    expect(prosa.length, "se movió el sectionType de las secciones de prosa").toBeGreaterThan(15);
    const formas = new Set(prosa.map((p) => p.claves.slice().sort().join(",")));
    expect([...formas], "las copias de PROSA_SCHEMA divergieron").toHaveLength(1);
  });
});

/** Renderers que ningún def VIVO usa pero que se conservan a PROPÓSITO: los
 *  snapshots publicados congelan `sectionType` y `configForSnapshot` los
 *  resuelve por este registry — borrarlos rompería lo ya publicado. Entra acá
 *  SOLO con esa justificación (ej. `tech_architecture`, reemplazado por
 *  `diagram` en el retema 2026-07 — ver shared-sections.defs). */
const LEGACY_SNAPSHOT_TYPES = new Set(["tech_architecture"]);

/** Renderers que NINGÚN template declara porque la sección no existe hasta que alguien la
 *  CREA en runtime: el resolver la sintetiza desde la key (`custom:<tipo>:<uuid>`, ver
 *  lib/landing/catalogo-de-secciones.ts). No son legacy —están vivos y son la única forma de
 *  renderizar una sección creada—, así que van en su propio set: meterlos en
 *  LEGACY_SNAPSHOT_TYPES diría lo contrario de lo que pasa.
 *
 *  ⭐ `tabla` entró el 2026-08-21 y es el ÚNICO tipo del catálogo que hubo que construir: Elías
 *  pidió que el chat pudiera crear tablas y el motor no tenía ninguna genérica (las dos que había
 *  son de propósito único — líneas de factura con totales, y propiedades con columnas cerradas).
 *  Los otros cinco tipos creables ya los declara alguna plantilla, así que resuelven por su mapa
 *  y no son huérfanos en ninguno.
 *
 *  ⚠ Este set NO es una lista de excepciones cómoda: cada entrada es un renderer que solo se
 *  alcanza sintetizando la def desde una key. Si un tipo entra acá y el catálogo NO lo ofrece,
 *  queda código que nadie puede alcanzar; si el catálogo lo ofrece y no está registrado,
 *  `toSectionDef` devuelve null y la sección desaparece sin error. El test de abajo cierra las
 *  dos direcciones. */
/* ⚠ `TARJETAS_TYPE` entró el 2026-08-22: es la grilla de tarjetas CON ícono, el hermano de
   `kickoff_prose`. Ninguna plantilla la declara —solo se alcanza creándola desde el chat o desde
   «Agregar sección»— así que es huérfana por diseño, igual que la tabla. Comparte el esquema de
   prosa a propósito: migrar entre con-ícono y sin-ícono no cuesta reescribir el contenido. */
const RUNTIME_SECTION_TYPES = new Set([HTML_EMBED_TYPE, TABLA_TYPE, TARJETAS_TYPE]);

describe("BC_TEMPLATES: toda def resuelve renderer y las keys están congeladas", () => {
  it("cada sectionType de cada template tiene componente registrado", () => {
    for (const tpl of Object.values(BC_TEMPLATES)) {
      const faltantes = tpl.sections.filter((d) => !SECTION_COMPONENTS[d.sectionType ?? d.key]);
      expect(faltantes.map((d) => `${tpl.id}:${d.key}→${d.sectionType}`)).toEqual([]);
    }
  });

  it("la config viva no dropea ninguna def (defs === config, en orden)", () => {
    for (const tpl of Object.values(BC_TEMPLATES)) {
      expect(landingConfigFor(tpl.id).sections.map((s) => s.key)).toEqual(
        tpl.sections.map((d) => d.key),
      );
    }
  });

  it("snapshot de keys por template (cambiarlas = decisión de producto)", () => {
    expect(BC_TEMPLATES.hubspot_v1.sections.map((d) => d.key)).toEqual([
      "hero", "dolores", "antes_despues", "solucion", "casos_de_uso", "roi",
      "cronograma", "inversion", "partner", "cta", "arquitectura_tecnologica", "mapeo_procesos",
    ]);
    expect(BC_TEMPLATES.website_v1.sections.map((d) => d.key)).toEqual([
      "hero", "diagnostico", "arquitectura_sitio", "arquitectura_conexion",
      "alcance", "metodologia", "inversion", "por_que_smarteam",
    ]);
    // Un template nuevo declara acá su snapshot al nacer.
    expect(Object.keys(BC_TEMPLATES).sort()).toEqual(["hubspot_v1", "website_v1"]);
  });

  it("hero abre cada template", () => {
    for (const tpl of Object.values(BC_TEMPLATES)) {
      expect(tpl.sections[0]?.key).toBe("hero");
    }
  });

  it("sin componentes huérfanos en SECTION_COMPONENTS (salvo legacy y dinámicos)", () => {
    const usados = new Set(
      Object.values(BC_TEMPLATES).flatMap((tpl) => tpl.sections.map((d) => d.sectionType ?? d.key)),
    );
    const huerfanos = Object.keys(SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t) && !RUNTIME_SECTION_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });
});

describe("Kickoff: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = KICKOFF_SECTION_DEFS.filter((d) => !KICKOFF_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForKickoff().sections.map((s) => s.key)).toEqual(
      KICKOFF_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: bienvenida abre, cierre cierra", () => {
    expect(KICKOFF_SECTION_DEFS.map((d) => d.key)).toEqual([
      "bienvenida", "objetivos", "hoy_vs_sistema", "alcance", "equipo", "tu_rol",
      "metricas_exito", "horarios", "canales", "proximos_pasos", "cronograma", "procesos", "cierre",
    ]);
  });

  it("sin componentes huérfanos en KICKOFF_SECTION_COMPONENTS", () => {
    const usados = new Set(KICKOFF_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(KICKOFF_SECTION_COMPONENTS).filter((t) => !usados.has(t));
    expect(huerfanos).toEqual([]);
  });
});

describe("Desarrollo: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = DESARROLLO_SECTION_DEFS.filter((d) => !DESARROLLO_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForDesarrollo().sections.map((s) => s.key)).toEqual(
      DESARROLLO_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: requerimiento abre, cierre cierra", () => {
    expect(DESARROLLO_SECTION_DEFS.map((d) => d.key)).toEqual([
      "requerimiento", "estimacion", "retos_cliente", "criterios_exito", "arquitectura",
      "relacion_objetos", "propiedades", "comunicacion", "cierre",
    ]);
  });

  it("sin componentes huérfanos en DESARROLLO_SECTION_COMPONENTS (salvo legacy de snapshots)", () => {
    const usados = new Set(DESARROLLO_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(DESARROLLO_SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });
});

describe("Exploración: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = EXPLORACION_SECTION_DEFS.filter((d) => !EXPLORACION_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForExploracion().sections.map((s) => s.key)).toEqual(
      EXPLORACION_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: exploracion abre, cierre cierra", () => {
    expect(EXPLORACION_SECTION_DEFS.map((d) => d.key)).toEqual([
      "exploracion", "ya_sabemos", "sin_verificar", "sesiones",
      "personas", "profundidad", "cierre",
    ]);
  });

  it("sin componentes huérfanos en EXPLORACION_SECTION_COMPONENTS", () => {
    const usados = new Set(EXPLORACION_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(EXPLORACION_SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });

  // La sección que sostiene el documento: separar lo confirmado de lo supuesto. Si
  // alguna de las dos se cayera del set, el documento perdería su razón de ser y el
  // snapshot de arriba lo diría — pero este test lo dice POR QUÉ.
  it("las dos secciones del eje confirmado-vs-supuesto existen y el agente las genera", () => {
    for (const key of ["ya_sabemos", "sin_verificar"]) {
      const def = EXPLORACION_SECTION_DEFS.find((d) => d.key === key);
      expect(def, `falta la sección ${key}`).toBeDefined();
      expect(def?.agentGenerated, `${key} debe generarla el agente`).not.toBe(false);
    }
  });

  // El cierre es CURADO: si el agente pudiera escribirlo, una regeneración pisaría lo
  // que el equipo dejó anotado (mismo criterio que el `cierre` de kickoff/desarrollo).
  it("el cierre es curado (agentGenerated:false) y va pinneado al final", () => {
    const cierre = EXPLORACION_SECTION_DEFS.at(-1);
    expect(cierre?.key).toBe("cierre");
    expect(cierre?.agentGenerated).toBe(false);
    expect(cierre?.pinned).toBe(true);
  });
});

/**
 * El renderer `web_diagnosis` nació para la PROPUESTA DE SITIO WEB: su panel oscuro se
 * rotula "Por qué " + `data.plataforma` (el nombre de la plataforma que se propone), y su
 * columna izquierda "Retos actuales". Cuando Exploración, Diagnóstico y Desarrollo lo
 * reusaron, los briefs le hicieron escribir al agente un RÓTULO adentro de `plataforma`
 * para tapar el problema — y el resultado renderizado fue el stutter que el usuario vio en
 * vivo: «POR QUÉ QUÉ SE ROMPE SI EL SUPUESTO ES FALSO». El rótulo ahora es `chips`, un
 * dato de la def; `plataforma` volvió a ser solo un dato.
 */
describe("web_diagnosis: los rótulos son `chips` de la def, no texto que escriba el agente", () => {
  const INTERNOS = [
    ...EXPLORACION_SECTION_DEFS.map((d) => ["exploración", d] as const),
    ...DIAGNOSTICO_SECTION_DEFS.map((d) => ["diagnóstico", d] as const),
    ...DESARROLLO_SECTION_DEFS.map((d) => ["desarrollo", d] as const),
  ].filter(([, d]) => d.sectionType === "web_diagnosis");

  it("los 3 documentos internos reusan el renderer (si no, este test no protege nada)", () => {
    expect(INTERNOS.map(([doc, d]) => `${doc}:${d.key}`)).toEqual([
      "exploración:sin_verificar", "diagnóstico:gap_analysis", "desarrollo:retos_cliente",
    ]);
  });

  it("cada uno declara su rótulo de panel y ninguno arranca con «Por qué»", () => {
    for (const [doc, d] of INTERNOS) {
      expect(d.chips?.panel, `${doc}:${d.key} sin chips.panel → rotula "Por qué" a secas`).toBeTruthy();
      // El componente ya no antepone "Por qué" cuando hay chip: repetirlo lo duplicaría.
      expect(d.chips?.panel?.toLowerCase().startsWith("por qué")).toBe(false);
    }
  });

  it("ningún brief le pide al agente que escriba `plataforma` (es la fuente del stutter)", () => {
    for (const [doc, d] of INTERNOS) {
      expect(d.brief.includes("`plataforma`"), `${doc}:${d.key} vuelve a rotular por \`plataforma\``).toBe(false);
    }
  });

  it("la propuesta de sitio web NO declara chips: sus rótulos son los históricos", () => {
    // Cinco propuestas publicadas los tienen congelados en su snapshot. Cambiarlos acá
    // haría que el documento vivo y el publicado dijeran cosas distintas.
    const web = BC_TEMPLATES.website_v1.sections.find((d) => d.sectionType === "web_diagnosis");
    expect(web?.key).toBe("diagnostico");
    expect(web?.chips).toBeUndefined();
  });
});

/**
 * La sección de INVERSIÓN es UNA sola desde 2026-08-12, pero sigue declarada por los DOS
 * templates bajo la misma key. `findDefAcrossTemplates` devuelve la PRIMERA que encuentre,
 * así que cualquier cosa load-bearing que difiera entre las dos produce un comportamiento
 * que depende del orden de un objeto — lo peor de depurar.
 */
describe("Inversión: una sola sección, dos defs que no pueden divergir", () => {
  const defs = Object.entries(BC_TEMPLATES).map(
    ([id, tpl]) => [id, tpl.sections.find((d) => d.key === "inversion")] as const,
  );

  it("los dos templates la declaran", () => {
    for (const [id, def] of defs) expect(def, `${id} sin sección inversion`).toBeTruthy();
  });

  it("los dos sectionType apuntan al MISMO componente", () => {
    expect(SECTION_COMPONENTS.inversion).toBe(SECTION_COMPONENTS.web_investment);
  });

  it("las dos son `agentGenerated:false` — el flag decide 4 gates a la vez", () => {
    // generableSections, la píldora ✨IA, el 400 de regenerate y el contrato del assist.
    for (const [id, def] of defs) expect(def?.agentGenerated, `${id}`).toBe(false);
  });

  it("las dos tienen el MISMO schema vacío: el agente no escribe montos por ninguna vía", () => {
    for (const [id, def] of defs) {
      const props = (def?.schema as { properties?: Record<string, unknown> })?.properties;
      expect(props, `${id} declara propiedades: el agente podría escribir precios`).toEqual({});
    }
  });

  it("ningún brief le pide montos al agente", () => {
    for (const [id, def] of defs) {
      expect(def?.brief.includes("la escribe VENTAS"), `${id}`).toBe(true);
    }
  });

  /* ⚠ Congelado porque hay propuestas de sitio web PUBLICADAS que dicen "Inversión única —
     Fase 1" / "Rango Fase 1", y `configForSnapshot` resuelve por key contra la config viva
     → estrenan el renderer nuevo. Sin esta declaración heredarían los rótulos genéricos y
     al cliente le cambiaría el documento que ya tiene. */
  it("sitio web conserva sus rótulos históricos; HubSpot usa los genéricos", () => {
    const web = BC_TEMPLATES.website_v1.sections.find((d) => d.key === "inversion");
    expect(web?.invest).toEqual({ servicios: "inversionFase", totalServicios: "rangoFase" });
    expect(BC_TEMPLATES.hubspot_v1.sections.find((d) => d.key === "inversion")?.invest).toBeUndefined();
  });
});

describe("Diagnóstico: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = DIAGNOSTICO_SECTION_DEFS.filter((d) => !DIAGNOSTICO_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForDiagnostico().sections.map((s) => s.key)).toEqual(
      DIAGNOSTICO_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: hero abre, cierre cierra, las legacy se conservan", () => {
    // Las 8 keys legacy SIGUEN acá a propósito: el contenido markdown viejo (Teamnet)
    // se rinde vía __legacyMd. Tres son solo-lectura (el agente nuevo no las escribe).
    expect(DIAGNOSTICO_SECTION_DEFS.map((d) => d.key)).toEqual([
      "diagnostico", "contexto_alcance", "estado_actual", "estado_deseado",
      "escala", "causa_raiz", "gap_analysis", "impacto_gap",
      "recomendaciones", "proximos_pasos", "cierre",
    ]);
  });

  it("sin componentes huérfanos en DIAGNOSTICO_SECTION_COMPONENTS", () => {
    const usados = new Set(DIAGNOSTICO_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    const huerfanos = Object.keys(DIAGNOSTICO_SECTION_COMPONENTS).filter(
      (t) => !usados.has(t) && !LEGACY_SNAPSHOT_TYPES.has(t),
    );
    expect(huerfanos).toEqual([]);
  });

  it("las keys 1:1 con las secciones del canvas — el runner saltea EN SILENCIO las que no matchean", () => {
    // Es literalmente el bug que tenía el diagnóstico viejo (prompt de 6 secciones
    // contra canvas de 8): el agente emitía keys sin sección y no se escribía nada.
    const canvasKeys = new Set(DIAGNOSTICO_CANVAS.sections.map((s) => s.key));
    for (const d of DIAGNOSTICO_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(DIAGNOSTICO_CANVAS.sections.length).toBe(DIAGNOSTICO_SECTION_DEFS.length);
  });

  it("las solo-lectura legacy y el cierre NO las escribe el agente", () => {
    for (const key of ["estado_deseado", "impacto_gap", "proximos_pasos", "cierre"]) {
      expect(DIAGNOSTICO_DEF_BY_KEY[key].agentGenerated, `${key} debería ser agentGenerated:false`).toBe(false);
    }
  });
});

describe("Planificación: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = PLANIFICACION_SECTION_DEFS.filter((d) => !PLANIFICACION_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForPlanificacion().sections.map((s) => s.key)).toEqual(
      PLANIFICACION_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: hero abre, cierre cierra, las 4 legacy se conservan", () => {
    expect(PLANIFICACION_SECTION_DEFS.map((d) => d.key)).toEqual([
      "planificacion", "arquitectura_solucion", "roadmap", "definicion_procesos",
      "ciclo_vida_crm", "rutinas_adopcion", "plan_despliegue", "metricas_exito", "cierre",
    ]);
  });

  it("las keys 1:1 con las secciones del canvas (el runner saltea en silencio lo que no matchea)", () => {
    const canvasKeys = new Set(PLANIFICACION_CANVAS.sections.map((s) => s.key));
    for (const d of PLANIFICACION_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(PLANIFICACION_CANVAS.sections.length).toBe(PLANIFICACION_SECTION_DEFS.length);
  });

  it("el plan de despliegue es CONDICIONAL: el agente puede dejarlo vacío", () => {
    // La decisión de negocio: con adopción directa la sección queda vacía y el modo
    // lectura la omite. Si dejara de ser agentGenerated, el mecanismo se rompe.
    expect(PLANIFICACION_DEF_BY_KEY["plan_despliegue"].agentGenerated).toBe(true);
    expect(PLANIFICACION_DEF_BY_KEY["cierre"].agentGenerated).toBe(false);
  });
});

describe("Implementación: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = IMPLEMENTACION_SECTION_DEFS.filter((d) => !IMPLEMENTACION_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForImplementacion().sections.map((s) => s.key)).toEqual(
      IMPLEMENTACION_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: el ORDEN es la doctrina — arquitectura antes que prompts", () => {
    // Decisión de negocio 2026-07-25: primero se decide la arquitectura (propiedades,
    // pipelines, marketing) y RECIÉN AHÍ valen los prompts para Breeze. Pedirle a
    // Breeze que construya sin arquitectura decidida es pedirle que la invente.
    const keys = IMPLEMENTACION_SECTION_DEFS.map((d) => d.key);
    expect(keys).toEqual([
      "implementacion", "arquitectura_propiedades", "pipelines",
      "procesos_marketing", "prompts_breeze", "a_mano", "cierre",
    ]);
    expect(keys.indexOf("prompts_breeze")).toBeGreaterThan(keys.indexOf("arquitectura_propiedades"));
    expect(keys.indexOf("prompts_breeze")).toBeGreaterThan(keys.indexOf("pipelines"));
  });

  it("las keys 1:1 con las secciones del canvas", () => {
    const canvasKeys = new Set(IMPLEMENTACION_CANVAS.sections.map((s) => s.key));
    for (const d of IMPLEMENTACION_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(IMPLEMENTACION_CANVAS.sections.length).toBe(IMPLEMENTACION_SECTION_DEFS.length);
  });
});

describe("Cronograma: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = CRONOGRAMA_SECTION_DEFS.filter(
      (d) => !CRONOGRAMA_SECTION_COMPONENTS[d.sectionType ?? d.key],
    );
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForCronograma().sections.map((s) => s.key)).toEqual(
      CRONOGRAMA_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: portada y Gantt, y nada más", () => {
    /* Es el documento más chico de los nueve, y tiene que seguir siéndolo: todo lo demás del
       cronograma (avisos, propuestas, publicación) es del EDITOR, no del documento. */
    expect(CRONOGRAMA_SECTION_DEFS.map((d) => d.key)).toEqual(["portada", "cronograma"]);
  });

  it("sin componentes huérfanos en CRONOGRAMA_SECTION_COMPONENTS", () => {
    const usados = new Set(CRONOGRAMA_SECTION_DEFS.map((d) => d.sectionType ?? d.key));
    expect(Object.keys(CRONOGRAMA_SECTION_COMPONENTS).filter((t) => !usados.has(t))).toEqual([]);
  });

  it("ninguna de sus secciones la escribe un agente", () => {
    /* Las dos salen de `ctx` o del proyecto. Si alguna se marcara `agentGenerated`, el
       catálogo de agentes le ofrecería al CSE generar un texto que nadie va a leer —
       el motor las pinta desde ProjectTimeline igual. */
    expect(CRONOGRAMA_SECTION_DEFS.filter((d) => d.agentGenerated).map((d) => d.key)).toEqual([]);
  });
});

/* ── El encabezado no puede decir dos veces lo mismo ───────────────────────────
   `LandingView` pinta eyebrow ARRIBA del título; si los dos traen la misma palabra, el
   documento abre la sección con «INVERSIÓN / Inversión», que se lee como un error de armado.
   Pasó de verdad (Elías lo vio en la propuesta de HubSpot) y el eyebrow de esa sección pasó a
   ser «Propuesta económica».

   Las `selfTitled` quedan FUERA a propósito: ahí el motor NO pinta encabezado —lo hace la
   propia sección— así que su `eyebrow` es solo el respaldo que viaja por props y repetir el
   label no produce ninguna repetición en pantalla. Hoy son las cuatro secciones de cierre. */
describe("eyebrow ≠ título en toda def con encabezado del motor", () => {
  const GRUPOS: Record<string, readonly { key: string; label: string; eyebrow?: string; selfTitled?: boolean }[]> = {
    ...Object.fromEntries(Object.entries(BC_TEMPLATES).map(([id, t]) => [id, t.sections])),
    kickoff: KICKOFF_SECTION_DEFS,
    desarrollo: DESARROLLO_SECTION_DEFS,
    exploracion: EXPLORACION_SECTION_DEFS,
    diagnostico: DIAGNOSTICO_SECTION_DEFS,
    implementacion: IMPLEMENTACION_SECTION_DEFS,
    planificacion: PLANIFICACION_SECTION_DEFS,
    cronograma: CRONOGRAMA_SECTION_DEFS,
  };

  it("ninguna sección repite la misma palabra en el rótulo chico y en el grande", () => {
    const norm = (s?: string) => (s ?? "").trim().toLowerCase();
    const repetidos: string[] = [];
    for (const [id, defs] of Object.entries(GRUPOS)) {
      for (const d of defs) {
        if (d.selfTitled) continue;
        if (d.eyebrow && norm(d.eyebrow) === norm(d.label)) repetidos.push(`${id}:${d.key} → "${d.eyebrow}"`);
      }
    }
    expect(repetidos).toEqual([]);
  });
});

describe("Entrega: registry completo + keys congeladas", () => {
  it("cada def resuelve componente y la config no dropea ninguna", () => {
    const faltantes = ENTREGA_SECTION_DEFS.filter((d) => !ENTREGA_SECTION_COMPONENTS[d.sectionType ?? d.key]);
    expect(faltantes.map((d) => `${d.key}→${d.sectionType}`)).toEqual([]);
    expect(landingConfigForEntrega().sections.map((s) => s.key)).toEqual(
      ENTREGA_SECTION_DEFS.map((d) => d.key),
    );
  });

  it("snapshot de keys: el ORDEN es la narrativa del cierre", () => {
    /* Primero QUÉ se construyó, después CÓMO se cumplió, al final QUÉ FALTA. Al revés el
       documento arranca justificándose, que es lo último que uno quiere leer en una entrega. */
    const keys = ENTREGA_SECTION_DEFS.map((d) => d.key);
    expect(keys).toEqual([
      "portada", "resumen", "alcance", "logros",
      "cumplimiento", "impacto", "pendientes", "continuidad", "recomendaciones", "cierre",
    ]);
    expect(keys.indexOf("pendientes")).toBeGreaterThan(keys.indexOf("logros"));
    /* `recomendaciones` DESPUÉS de `continuidad` y no antes: la propuesta del próximo proyecto
       va primero, y lo que el cliente puede hacer solo va después, como la salida para el que
       no quiere contratar nada. Al revés, la propuesta se lee como el plan B. */
    expect(keys.indexOf("recomendaciones")).toBeGreaterThan(keys.indexOf("continuidad"));
  });

  it("⚠ LOS NÚMEROS NO LOS ESCRIBE EL AGENTE", () => {
    /* La única promesa de honestidad del documento. `cumplimiento` y `pendientes` son cifras
       sobre el proyecto del cliente y las calcula el runner desde el cronograma; el agente ni
       las ve. Poner `agentGenerated: true` en cualquiera de las dos deja al modelo escribiendo
       «se completó el 100% del plan» sin que nada lo contradiga — y este es el documento que
       el cliente archiva y cita. */
    expect(ENTREGA_DEF_BY_KEY["cumplimiento"].agentGenerated).toBe(false);
    expect(ENTREGA_DEF_BY_KEY["pendientes"].agentGenerated).toBe(false);
    // Y el template que se le manda al modelo NO puede incluirlas.
    const alModelo = ENTREGA_SECTION_DEFS.filter((d) => d.agentGenerated !== false).map((d) => d.key);
    expect(alModelo).not.toContain("cumplimiento");
    expect(alModelo).not.toContain("pendientes");
  });

  it("la portada y el cierre no se ocultan ni se mueven", () => {
    /* Elías pidió que las secciones se puedan ocultar y mover — las SIETE del medio lo son.
       Estas dos no: publicar una entrega sin portada no es libertad, es un agujero. */
    for (const k of ["portada", "cierre"]) {
      expect(ENTREGA_DEF_BY_KEY[k].pinned, `${k} debería estar fijada`).toBe(true);
      expect(ENTREGA_DEF_BY_KEY[k].noHide, `${k} no debería poder ocultarse`).toBe(true);
    }
    const ocultables = ENTREGA_SECTION_DEFS.filter((d) => !d.noHide).map((d) => d.key);
    expect(ocultables).toHaveLength(8);
  });

  it("las keys 1:1 con las secciones del canvas", () => {
    const canvasKeys = new Set(ENTREGA_CANVAS.sections.map((s) => s.key));
    for (const d of ENTREGA_SECTION_DEFS) {
      expect(canvasKeys.has(d.key), `la def "${d.key}" no existe como sección del canvas`).toBe(true);
    }
    expect(ENTREGA_CANVAS.sections.length).toBe(ENTREGA_SECTION_DEFS.length);
  });
});

describe("La comparación de procesos: rótulo por documento, subtítulo por caja", () => {
  /* `process_mapping` la comparten CINCO documentos y en cuatro el proyecto todavía no ocurrió.
     Estos asserts protegen las dos formas en que este cambio se rompe en silencio. */

  const propsDe = (schema: unknown) =>
    (
      (schema as { properties: { procesos: { items: { properties: Record<string, unknown> } } } })
        .properties.procesos
    ).items.properties;

  /** Toda def de `process_mapping` viva, con el documento que la declara — para no probar dos
   *  constantes y creer que se probaron los cinco documentos. */
  const TODAS_LAS_DEFS = DEFS_DE_TODOS_LOS_DOCUMENTOS;

  it("⚠ los subtítulos viven DENTRO del schema — fuera se borran en cada regeneración", () => {
    /* `preserveNonSchemaKeys` (lib/ai/section-schema.ts) solo acarrea claves de PRIMER nivel.
       `resumenHoy`/`resumenSera` están dentro de `procesos[]`, así que si alguien los saca del
       schema pensando «esto es solo UI», `coerceToSchema` los borra en cada regeneración y
       nada los rescata: el CSE escribe el titular, regenera, y desapareció sin error. */
    const props = propsDe(PROCESS_MAPPING_SCHEMA_CON_TITULAR);
    for (const k of ["resumenHoy", "resumenSera", "comoEsHoy", "comoSera"]) {
      expect(props, `"${k}" fuera del schema = se borra al regenerar`).toHaveProperty(k);
    }
  });

  /**
   * ⚠ ESTE TEST SE INVIRTIÓ EL 2026-08-23, Y EL RAZONAMIENTO VIEJO VA ACÁ PORQUE ERA BUENO.
   *
   * Afirmaba lo contrario: que los titulares NO debían vivir en el schema compartido, porque
   * `shapeOf` recursa dentro de `items` y el schema ES la forma que el modelo recibe — así que
   * meterlos arriba pondría a cuatro agentes a escribir dos campos que ningún brief de ellos
   * explica, y en `implementacion.pipelines`, donde el «antes» es una lista de etapas, un titular
   * de media línea no tiene contenido posible. La variante entraba por el documento que la pidió.
   *
   * ⛔ Le faltaba la otra mitad: **el componente los PINTA igual**. `ProcessMappingSection` los
   * dibuja con `(p.resumenHoy || editable)`, sin consultar el esquema, en los CINCO documentos. O
   * sea que en cuatro había dos cajas grises «En una línea…» que el CSE veía, podía escribir, y
   * `coerceToSchema` le borraba al regenerar — y que el chat no veía y rechazaba si las adivinaba.
   * Elías lo vio en el diagnóstico: pidió «agregale los títulos a cada card» y el chat contestó,
   * correctamente, que esa sección solo tiene `nombre`, `comoEsHoy`, `comoSera` y `sistemas`.
   *
   * El riesgo que el assert viejo protegía se paga con UNA LÍNEA DE BRIEF POR DOCUMENTO, y en
   * Implementación esa línea dice «déjalos vacíos» — la respuesta al caso que había identificado
   * bien. **Si alguien vuelve a sacarlos del compartido, tiene que borrar también el render.**
   */
  it("⭐ los titulares existen en los CINCO documentos, no solo en la Entrega", () => {
    const conProcesos = TODAS_LAS_DEFS.filter((d) => d.def.sectionType === "process_mapping");
    expect(conProcesos.length, "la guarda no está mirando nada").toBeGreaterThan(3);
    for (const { doc, def } of conProcesos) {
      const props = propsDe(def.schema);
      for (const k of ["resumenHoy", "resumenSera"]) {
        expect(props, `${doc}/${def.key}: el motor pinta "${k}" y su schema no lo declara`).toHaveProperty(k);
      }
    }
  });

  it("⛔ y cada uno de esos documentos EXPLICA los titulares en su brief", () => {
    /* El schema es el prompt: sumar dos campos sin explicarlos pone a cuatro agentes a escribir
       algo que nadie les pidió. Es el riesgo real que el assert viejo protegía, y ésta es la
       forma de pagarlo. La edición que la pone en rojo: sumar un sexto documento con la sección y
       olvidarle el brief. */
    for (const { doc, def } of TODAS_LAS_DEFS.filter((d) => d.def.sectionType === "process_mapping")) {
      expect(def.brief ?? "", `${doc}/${def.key} no explica los titulares`).toContain("resumenHoy");
    }
  });

  it("solo la Entrega cambia los rótulos; los otros cuatro miran hacia adelante", () => {
    /* «Con la implementación» en un documento de cierre convierte un hecho en una promesa.
       Y al revés: «Ahora» en un diagnóstico afirmaría algo que todavía no pasó. */
    expect(ENTREGA_DEF_BY_KEY["resumen"].compara).toEqual({
      izquierda: "antes",
      derecha: "ahora",
      // Los placeholders del EDITOR también, o el CSE lee «Cómo quedará…» bajo «AHORA».
      phIzquierda: "comoFuncionabaAntes",
      phDerecha: "comoFuncionaAhora",
    });

    /* Los BC_TEMPLATES entran por el barrido y no a mano: la quinta def de `process_mapping`
       no vive en ningún `*_SECTION_DEFS` —la sintetiza `makeProcessMappingDef` dentro del
       template— así que enumerar los tres arrays dejaba fuera justo la propuesta comercial,
       donde rotular «Antes/Ahora» sobre un proyecto que todavía no se vendió es lo más caro. */
    const otros = [
      ...DIAGNOSTICO_SECTION_DEFS,
      ...PLANIFICACION_SECTION_DEFS,
      ...IMPLEMENTACION_SECTION_DEFS,
      ...Object.values(BC_TEMPLATES).flatMap((t) => t.sections),
    ].filter((d) => d.sectionType === "process_mapping");
    expect(otros.length, "ningún otro documento usa process_mapping — ¿se movió?").toBeGreaterThan(0);
    for (const d of otros) {
      expect(d.compara, `"${d.key}" no debería redefinir los rótulos`).toBeUndefined();
    }
  });

  it("el renderer LEE el rótulo de la def, no un literal", () => {
    /* Sin esto la plomería queda a medias y falla del peor modo: el campo se declara, el tipo
       compila, y el componente sigue pintando «Hoy». Verificado sobre el archivo real. */
    const src = fs.readFileSync(
      path.join(__dirname, "..", "..", "components", "landing", "sections-shared.tsx"),
      "utf8",
    );
    expect(src).toContain('t(lang, sectionCompara?.izquierda ?? "hoy")');
    expect(src).toContain('t(lang, sectionCompara?.derecha ?? "conImplementacion")');
  });

  it("los rótulos nuevos existen en los dos idiomas", () => {
    /* Tipar contra `LandingStringKey` obliga a que la clave exista; esto fija que no quede a
       medias. La Entrega se le comparte al CLIENTE y se traduce por `__lang`: un literal en
       español saldría tal cual dentro de un documento en inglés. */
    expect(t("es", "antes")).toBe("Antes");
    expect(t("en", "antes")).toBe("Before");
    expect(t("es", "ahora")).toBe("Ahora");
    expect(t("en", "ahora")).toBe("Now");
  });
});

describe("⭐ el catálogo de secciones creables y sus renderers no pueden divergir", () => {
  it("todo tipo del catálogo resuelve un renderer", () => {
    /* ⛔ EL MODO DE FALLA: `toSectionDef` devuelve `null` para un `sectionType` que no está en el
       mapa, el `.filter()` lo descarta, y **la sección desaparece del editor, del PDF y de la
       propuesta del cliente sin un solo error**. Ofrecer en el catálogo un tipo que no se puede
       dibujar es prometer una sección que se evapora al crearla.
       La edición que la pone en rojo: sumar un tipo al catálogo sin registrar su componente. */
    /* ⚠ EL `&&` ERA UN AGUJERO, y lo destapó un verificador del censo del 2026-08-23: alcanzaba
       con estar en CUALQUIERA de los dos mapas. Pero el business case sintetiza sus `custom:*` por
       un camino que resuelve contra UN mapa concreto, así que un tipo registrado solo en el otro
       pasaba el assert y desaparecía en pantalla igual. La assert de abajo prueba el camino real. */
    const sinRenderer = CATALOGO_DE_SECCIONES.filter(
      (t) => !COMPONENTES_CREABLES[t.sectionType] && !SECTION_COMPONENTS[t.sectionType],
    );
    expect(
      sinRenderer.map((t) => `${t.tipo}→${t.sectionType}`),
      "hay tipos ofrecidos que no se pueden dibujar: crearlos haría desaparecer la sección",
    ).toEqual([]);
  });

  it("⭐ y CADA tipo del catálogo sobrevive al camino REAL del business case", () => {
    /* ⛔ La assert de arriba mira los mapas; ésta mira el CAMINO. `configForCanvas` es lo que usan
       el editor del business case y su PDF, y sintetizaba las `custom:*` contra un mapa donde
       `kickoff_prose` y `kickoff_compara` no están. El síntoma no era «falta una sección»: era que
       `sections` quedaba vacío y el editor volvía a mostrar LA PLANTILLA ENTERA, sin el orden real
       del canvas. Medido el 2026-08-23 sobre `custom:prosa:*` — 12 secciones de plantilla en vez
       de la que se acababa de crear.
       La edición que la pone en rojo: volver a sintetizar con `toSectionDef(customDef(...))`. */
    const perdidos = CATALOGO_DE_SECCIONES.filter((t) => {
      const key = `custom:${t.tipo}:00000000-0000-4000-8000-000000000000`;
      const cfg = configForCanvas("hubspot_v1", [{ key, label: t.nombre }]);
      return cfg.sections.length !== 1 || cfg.sections[0].key !== key;
    });
    expect(
      perdidos.map((t) => `${t.tipo}→${t.sectionType}`),
      "esa sección creada NO se pinta en el business case: el editor y el PDF vuelven a la plantilla",
    ).toEqual([]);
  });

  it("⚠ y una `custom:*` YA PUBLICADA sigue resolviendo en el snapshot del prospecto", () => {
    /* Misma puerta, del otro lado: `configForSnapshot` resuelve por el `sectionType` congelado.
       Un tipo registrado solo entre los creables desaparecía de la propuesta que el prospecto ya
       tiene abierta — y ahí no hay ningún editor donde notarlo. */
    const perdidos = CATALOGO_DE_SECCIONES.filter((t) => {
      const key = `custom:${t.tipo}:00000000-0000-4000-8000-000000000000`;
      const cfg = configForSnapshot("hubspot_v1", [
        { key, label: t.nombre, sectionType: t.sectionType },
      ]);
      return !cfg.sections.some((s) => s.key === key);
    });
    expect(perdidos.map((t) => t.tipo), "se evapora de la propuesta publicada").toEqual([]);
  });

  it("y ningún renderer creable queda sin tipo que lo ofrezca", () => {
    /* La otra dirección: un componente registrado como creable que el catálogo no ofrece es
       código que nadie puede alcanzar. Se saca del mapa o se ofrece. */
    const ofrecidos = new Set(CATALOGO_DE_SECCIONES.map((t) => t.sectionType));
    const huerfanos = Object.keys(COMPONENTES_CREABLES).filter((k) => !ofrecidos.has(k));
    expect(
      huerfanos,
      "hay renderers creables que el catálogo no ofrece: son inalcanzables",
    ).toEqual([]);
  });

  it("⚠ toda hoja del schema de un tipo creable es un TEXTO", () => {
    /* `coerceToSchema` aplana a vacío cualquier hoja que no sea string. Un `{type:"number"}` no
       falla: devuelve `""`, y el campo queda mudo sin que nada avise. Es la regla que
       `shared-sections.defs.ts` ya declara en su encabezado, acá hecha cumplir sobre el catálogo.
       La edición que la pone en rojo: declarar un precio como número en el schema de la tabla. */
    const malas: string[] = [];
    const recorrer = (nodo: unknown, ruta: string) => {
      const n = nodo as { type?: string; properties?: Record<string, unknown>; items?: unknown };
      if (n?.type === "object") {
        for (const [k, sub] of Object.entries(n.properties ?? {})) recorrer(sub, `${ruta}.${k}`);
        return;
      }
      if (n?.type === "array") return recorrer(n.items, `${ruta}[]`);
      if (n?.type !== "string") malas.push(`${ruta} es ${String(n?.type)}`);
    };
    for (const t of CATALOGO_DE_SECCIONES) recorrer(t.schema, t.tipo);
    expect(malas, "una hoja que no es texto se guarda vacía, sin error").toEqual([]);
  });

  it("⚠ el tipo por defecto sigue siendo el embebido de HTML", () => {
    /* Las secciones creadas antes del 2026-08-21 tienen keys de DOS segmentos, sin tipo, y son
       embebidos. Cambiar el default les cambia el renderer a todas, retroactivamente, en
       propuestas que ya se enviaron. */
    const porDefecto = CATALOGO_DE_SECCIONES.find((t) => t.tipo === TIPO_POR_DEFECTO);
    expect(porDefecto?.sectionType, "cambió el renderer de todas las secciones creadas viejas").toBe(
      HTML_EMBED_TYPE,
    );
  });
});
