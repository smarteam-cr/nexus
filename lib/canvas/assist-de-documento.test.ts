/**
 * lib/canvas/assist-de-documento.test.ts
 *
 * Correr: `npx vitest run lib/canvas/assist-de-documento.test.ts --project unit`.
 *
 * ── LAS DOS COSAS QUE ESTE ARCHIVO IMPIDE ────────────────────────────────────────────────────
 *
 * 1. ⛔ QUE UN DOCUMENTO CORRA SIN CELDA DE PERMISO. La ruta pide la celda `regenerate` de la
 *    seccion que declara el REGISTRO DE PIEZAS, no una escrita a mano. Como el tipo de
 *    `guardPermission` no puede estrecharse desde un string dinamico, ahi hay un escape de tipos
 *    — y este test es lo que lo convierte en invariante: si una pieza no declara `regenerate`
 *    exigido, el escape se volveria un 500 en produccion o, peor, una corrida sin permiso.
 *
 * 2. ⛔ QUE UNA SECCION INTERNA DEL HANDOFF SE FILTRE A UN DOCUMENTO QUE LEE EL CLIENTE. Cada
 *    documento declara su allowlist; `null` significa «el handoff entero» y SOLO puede usarlo un
 *    documento interno. El handoff lleva riesgos sobre el cliente, banderas y acuerdos de la
 *    venta: eso proyectado en pantalla frente a el no es un bug de formato, es un problema
 *    comercial.
 *
 * ── Y POR QUE EL REGISTRO VIVE EN lib/ Y NO EN LA RUTA ───────────────────────────────────────
 * Para que este test pueda AFIRMAR sobre el objeto real en vez de escanear el texto del archivo.
 * Una guarda que lee texto se cae sola cuando alguien reformatea.
 */
import { describe, it, expect } from "vitest";
import { DOC } from "./assist-de-documento";
import { pieceBySlug } from "@/lib/pieces/registry";
import { PERMISSION_SECTIONS } from "@/lib/auth/permissions/registry";

const SLUGS = Object.keys(DOC);

describe("el registro de documentos con assist", () => {
  it("encuentra algo (si no, todo lo de abajo pasa por vacio)", () => {
    expect(SLUGS.length).toBeGreaterThanOrEqual(6);
  });

  it("⛔ cada slug existe en el registro de piezas", () => {
    /* La edicion que la pone en rojo: escribir mal un slug, o dejar una fila de una pieza que se
       retiro. Sin esto, la ruta responde «este documento no se puede modificar» para siempre y
       nadie sabe por que. */
    const huerfanos = SLUGS.filter((s) => !pieceBySlug(s));
    expect(huerfanos, "slugs que no son de ninguna pieza registrada").toEqual([]);
  });

  it("⛔ cada uno declara la celda `regenerate`, y exigida", () => {
    /* Es lo que respalda el escape de tipos de la ruta. La edicion que la pone en rojo: sumar una
       pieza cuya seccion de permiso no tenga `regenerate`. */
    const rotos: string[] = [];
    for (const slug of SLUGS) {
      const pieza = pieceBySlug(slug)!;
      const seccion = PERMISSION_SECTIONS.find((s) => s.key === pieza.permissionSection);
      const accion = seccion?.actions.find((a) => a.key === "regenerate");
      if (!seccion) rotos.push(`${slug}: su seccion "${pieza.permissionSection}" no existe`);
      else if (!accion) rotos.push(`${slug}: "${pieza.permissionSection}" no declara regenerate`);
      else if (!accion.enforced) rotos.push(`${slug}: su regenerate no es enforced`);
    }
    expect(rotos, "un documento con assist sin celda de permiso corre SIN permiso").toEqual([]);
  });

  it("⛔ solo un documento INTERNO puede llevarse el handoff entero", () => {
    /* `handoffKeys: null` = sin allowlist. La edicion que la pone en rojo: ponerle null a un
       documento que el cliente lee — el handoff entra al prompt con los riesgos y los acuerdos de
       la venta adentro. */
    const filtran = SLUGS.filter((s) => DOC[s].handoffKeys === null && pieceBySlug(s)!.clientFacing);
    expect(
      filtran,
      "estos documentos los LEE EL CLIENTE y cargan el handoff sin allowlist",
    ).toEqual([]);
  });

  it("y el que sí se lo lleva entero es el que su propia generación también", () => {
    // Hoy solo la guía de implementación, y su generación carga el handoff completo. Si el assist
    // viera menos que la generación, propondría contra un contexto más pobre que el que produjo
    // el documento.
    const sinAllowlist = SLUGS.filter((s) => DOC[s].handoffKeys === null);
    expect(sinAllowlist).toEqual(["implementation"]);
  });

  it("⛔ Exploración NO entra, y no es un olvido", () => {
    /* Aplicar una propuesta pasa por `preserveNonSchemaKeys`, que es SHALLOW. Las marcas «ya la
       pregunté» del plan de sesiones viven anidadas en `sesiones[].preguntas[].hecha`, así que una
       propuesta que toque `sesiones` las borra TODAS sin aviso ni error.
       Sumarla exige antes hacer el merge profundo. Ver lib/canvas/exploracion-preguntas.ts. */
    expect(
      SLUGS,
      "Exploración guarda trabajo curado ANIDADO: el apply lo borraría en silencio",
    ).not.toContain("exploration");
  });

  it("cada documento aporta secciones generables de verdad", () => {
    // Una fila cuyo `defs` esté vacío hace que la ruta responda 400 «sin secciones editables»
    // después de haber pasado el permiso: se ve como un bug de permisos y no lo es.
    for (const slug of SLUGS) {
      const generables = Object.values(DOC[slug].defs).filter(
        (d) => d.agentGenerated !== false && !d.ctxDriven,
      );
      expect(generables.length, `"${slug}" no tiene ni una sección que la IA pueda escribir`).toBeGreaterThan(0);
    }
  });
});
