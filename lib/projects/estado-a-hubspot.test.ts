import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { DEFAULT_MATRIX } from "@/lib/auth/permissions/defaults";
import { sectionByKey } from "@/lib/auth/permissions/registry";

/**
 * lib/projects/estado-a-hubspot.test.ts — EL BOTÓN QUE MUEVE LA TARJETA PARA TODO EL EQUIPO.
 *
 * Aceptar una sugerencia de estado o etapa cambia lo que ve todo el mundo en el tablero de
 * HubSpot. Es un clic, así que el modo de falla que importa no es el ruidoso: son los tres
 * silenciosos.
 *
 *  · Escribir la columna en Nexus → el espejo la revierte en diez minutos y el botón "no guarda",
 *    sin ningún error. (Clon del hallazgo de `marcar-interno.test.ts`.)
 *  · Aceptar sobre una copia vieja → se pisa la decisión que el CSE acaba de tomar a mano en
 *    HubSpot, y del lado de quien aprieta no hay ninguna señal de que acaba de deshacer algo.
 *    Esto es PROPIO de esta ruta y no existe en el molde: `interno` es un booleano que alguien
 *    cambia una vez en la vida; el estado se toca seguido.
 *  · Dejar la celda abierta o decorativa → cualquiera mueve proyectos de columna.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
const RUTA = "app/api/projects/[projectId]/estado-hubspot/route.ts";

/** Todo lo que va adentro de un `data: {…}`, con llaves balanceadas. Escribir, no leer. */
function bloquesData(src: string): string {
  const out: string[] = [];
  const re = /data:\s*\{/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    let i = m.index + m[0].length;
    let nivel = 1;
    const desde = i;
    while (i < src.length && nivel > 0) {
      if (src[i] === "{") nivel++;
      else if (src[i] === "}") nivel--;
      i++;
    }
    out.push(src.slice(desde, i));
  }
  return out.join("\n");
}

describe("el botón escribe en HubSpot, NUNCA en Nexus", () => {
  it("la ruta manda el cambio allá", () => {
    const src = leer(RUTA);
    expect(src).toContain("actualizarEstadoProyecto(");
    expect(src).toContain("actualizarEtapaProyecto(");
  });

  it("LA guarda: la ruta NO escribe las columnas en la base", () => {
    /* Las cinco de CS360 y la etapa tienen un solo escritor —el espejo—, y `scope-coverage`
       lo hace cumplir para el resto del repo. Acá se vuelve a mirar porque ESTA ruta es la
       tentada: es la que tiene el valor nuevo en la mano y una pantalla esperando respuesta. */
    const src = leer(RUTA);
    const data = bloquesData(src);
    for (const col of ["hubspotStatus", "hubspotPipelineStageId", "hubspotPipelineStageLabel"]) {
      expect(data, `la ruta escribe ${col} en Nexus`).not.toContain(col);
    }
    expect(src, "la ruta hace update/upsert sobre Project").not.toMatch(
      /prisma\.project\.(update|upsert|updateMany)/,
    );
  });

  it("después de escribir allá, trae el espejo", () => {
    expect(leer(RUTA)).toContain("espejarProyectoRecienCreado(");
  });

  it("si el espejo falla, NO responde éxito", () => {
    /* `espejarProyectoRecienCreado` no tira ante un 429 o un 5xx: acumula el motivo en `errors`
       y vuelve normal. Sin mirar eso, el cambio queda escrito en HubSpot y no en Nexus, y la
       respuesta es un 200 con el valor viejo que la pantalla celebra en verde. */
    const src = leer(RUTA);
    expect(src, "el resultado del espejo se descarta").toMatch(
      /(const|let)\s+\w+\s*=\s*await\s+espejarProyectoRecienCreado\(/,
    );
    expect(src, "no se revisa si el espejo trajo errores").toMatch(/\.errors\.length\s*>\s*0/);
  });

  it("devuelve lo que VOLVIÓ, no lo que se pidió", () => {
    /* Si HubSpot normaliza el valor o lo rechaza en silencio, la pantalla tiene que mostrar el
       resultado real. Devolver el pedido es prometer en vez de informar. */
    const src = leer(RUTA);
    expect(src).toContain("leerDeNexus(projectId)");
    expect(src).toMatch(/hubspotStatus:\s*true/);
  });

  it("sin registro en HubSpot, lo dice en vez de reventar", () => {
    const src = leer(RUTA);
    expect(src).toContain("hubspotServiceId");
    expect(src).toContain("409");
  });
});

describe("⭐ no se pisa lo que alguien acaba de cambiar a mano", () => {
  it("la ruta relee el valor EN VIVO antes de decidir", () => {
    /* El espejo de un cliente corre cuando alguien abre su ficha, así que `Project.hubspotStatus`
       puede tener días. Comparar contra esa copia haría que aceptar una sugerencia vieja
       revirtiera silenciosamente una decisión nueva del CSE — el peor resultado posible para una
       función cuyo argumento de venta es "mantené el tablero al día". */
    const src = leer(RUTA);
    expect(src, "la ruta dejó de leer HubSpot en vivo").toContain("leerEstadoYEtapa(");
  });

  it("lo vivo es lo que gobierna la decisión, no la copia de Nexus", () => {
    /* La trampa: leer en vivo y después comparar igual contra la columna espejada. Se vería
       correcto y no protegería nada. El `select` del proyecto NO trae el estado a propósito. */
    const src = leer(RUTA);
    const select = src.slice(src.indexOf("prisma.project.findUnique"));
    const primerSelect = select.slice(0, select.indexOf("});"));
    expect(primerSelect, "el select volvió a traer la copia vieja del estado").not.toContain(
      "hubspotStatus",
    );
    expect(src).toMatch(/vivo\.hs_status\s*!==/);
    expect(src).toMatch(/vivo\.hs_pipeline_stage\s*!==/);
  });

  it("⚠ el 409 mira la PRESENCIA de `visto`, no que traiga un string", () => {
    /* Lo cazó la auditoría adversarial: con `typeof … === "string" ? … : null`, un
       `visto: { estado: null }` legítimo —lo que manda el chip sobre los 24 de 67 proyectos SIN
       estado cargado, que son justo la población que esta función viene a arreglar— quedaba
       indistinguible de «no mandó nada» y la guarda no podía dispararse NUNCA.
       El fallo era invisible: ningún test lo miraba porque todos usaban un estado cargado. */
    const src = leer(RUTA);
    expect(src, "el 409 volvió a condicionarse al valor en vez de a la presencia").toMatch(
      /estado && vioEstado &&/,
    );
    expect(src).toMatch(/const vioEstado = !!body\.visto && "estado" in body\.visto/);
  });

  it("⛔ y NO se acepta nada sobre un proyecto que HubSpot dice cerrado", () => {
    /* El veto de `completed` se decidía con la copia espejada, que puede tener días. Si el CSE
       cerró el proyecto allá y el espejo todavía dice null, la sugerencia se arma igual y
       aceptarla REABRIRÍA un proyecto cerrado — lo que los dos módulos declaran imposible. */
    const src = leer(RUTA);
    expect(src, "el veto dejó de revalidarse contra el valor vivo").toContain(
      "vivo.hs_status === ESTADO_VETADO",
    );
    expect(src, "una etapa terminal viva ya no frena la escritura").toContain(
      "def.closedStageIds.includes(vivo.hs_pipeline_stage)",
    );
  });

  it("si divergió de lo que la pantalla mostraba, 409 con el valor nuevo", () => {
    /* No alcanza con negarse: hay que decir qué dice HubSpot ahora, o la persona no tiene con
       qué decidir de nuevo y va a apretar otra vez. */
    const src = leer(RUTA);
    expect(src).toContain("enHubspot");
    expect(src, "el 409 de divergencia no cita el valor vivo").toMatch(
      /enHubspot:\s*\{\s*estado:\s*vivo\.hs_status/,
    );
  });
});

describe("el id de etapa no sale sin tablero", () => {
  it("la ruta resuelve el pipeline y valida contra SU tabla", () => {
    /* Un id de otro pipeline manda el registro a una columna que en su tablero no existe, sin
       error de HubSpot. Y sin pipeline resuelto no hay contra qué validar: ahí se dice que no. */
    const src = leer(RUTA);
    expect(src).toContain("resolvePipeline(");
    expect(src).toContain("etapasProponibles(def)");
  });
});

describe("quién puede mover la tarjeta", () => {
  const seccion = sectionByKey("proyectos");

  it("la celda existe y está exigida de verdad", () => {
    const accion = seccion?.actions.find((a) => a.key === "cambiarEstadoHubspot");
    expect(accion, "desapareció la celda proyectos.cambiarEstadoHubspot").toBeDefined();
    expect(accion?.enforced, "la celda quedó decorativa").toBe(true);
  });

  it("la ruta la exige", () => {
    expect(leer(RUTA)).toContain('guardPermission("proyectos", "cambiarEstadoHubspot")');
  });

  it("la tienen el CSE y el liderazgo; Ventas no", () => {
    /* El CSE es quien sabe cómo va el proyecto. Si esto exigiera liderazgo, el tablero seguiría
       viejo — que es el problema que la función viene a resolver. Ventas ve el proyecto pero no
       lo ejecuta: mover su etapa no es su decisión. */
    const tiene = (rol: string) => {
      const m = (
        DEFAULT_MATRIX as unknown as Record<
          string,
          { sections?: Record<string, Record<string, boolean>> }
        >
      )[rol];
      const celdas = m?.sections?.proyectos ?? {};
      return Object.entries(celdas)
        .filter(([, v]) => v === true)
        .map(([k]) => k);
    };
    expect(tiene("CSE")).toContain("cambiarEstadoHubspot");
    expect(tiene("CSL")).toContain("cambiarEstadoHubspot");
    expect(tiene("VENTAS")).not.toContain("cambiarEstadoHubspot");
  });

  it("⚠ abrirle el estado al CSE no le abrió nada más de `proyectos`", () => {
    /* `proyectos` contiene `create`, `deleteCanvas` y `marcarInterno` —sacar de cobranza—. El
       CSE no tenía NINGUNA celda de esta sección antes de esta tanda; el riesgo real del cambio
       no es la celda nueva sino que alguien "redondee" y le dé la sección entera. */
    const m = (
      DEFAULT_MATRIX as unknown as Record<
        string,
        { sections?: Record<string, Record<string, boolean>> }
      >
    )["CSE"];
    const celdas = m?.sections?.proyectos ?? {};
    const encendidas = Object.entries(celdas)
      .filter(([, v]) => v === true)
      .map(([k]) => k);
    expect(encendidas).toEqual(["cambiarEstadoHubspot"]);
  });
});
