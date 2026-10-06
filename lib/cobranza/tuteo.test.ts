/**
 * lib/cobranza/tuteo.test.ts — ⛔ Cobranza y Finanzas hablan en tuteo, nunca en voseo.
 *
 * Correr: `npx vitest run lib/cobranza/tuteo.test.ts --project unit`.
 *
 * Regla del repo: los textos de la app van en tuteo. Hasta el 2026-10-01 solo la sección Odoo tenía guarda
 * (lib/cobranza/odoo/guardas.test.ts), y en el resto de Cobranza y en Finanzas quedaban 211 textos en voseo: las
 * pantallas, los rechazos del servidor que llegan tal cual al toast (schema.ts, mutations.ts, sociedades.ts,
 * numero-factura.ts), los pasos de la carga del libro de Alex (libro-alex*.ts), las alertas del motor y los pedidos a
 * los dos agentes de Cobranza (el borrador de cobro va al cliente: un pedido en voseo invita a contestar en voseo).
 *
 * Mira los TEXTOS —cadenas, plantillas y JSX, con el AST de lib/ui/voseo.ts—: un comentario que cita el voseo no
 * cuenta. Y mira carpetas ENTERAS: un archivo nuevo de Cobranza o de Finanzas entra solo, sin tocar esta lista.
 * La edición que la pone en rojo: escribir «Revisá», «Indicá», «pasala» o «por vos» en un texto de estas carpetas.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { formasDeVoseo, textosDelFuente } from "@/lib/ui/voseo";

const RAIZ = join(__dirname, "..", "..");
const leer = (rel: string) => readFileSync(join(RAIZ, rel), "utf8");

/** Los .ts y .tsx de una carpeta, sin las pruebas ni sus datos (__fixtures__): nadie los lee en pantalla. */
function fuentes(dir: string): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      if (e.name !== "__fixtures__") out.push(...fuentes(rel));
    } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) {
      out.push(rel);
    }
  }
  return out;
}

const CARPETAS = [
  "components/cobranza",
  "components/finanzas",
  "app/(shell)/cobranza",
  "app/(shell)/finanzas",
  /* También las rutas de Finanzas: costos, planilla, equilibrio y comisiones viven acá. */
  "app/api/cobranza",
  "lib/cobranza",
  "lib/finanzas",
];
/* No es de Cobranza, pero sus dos mensajes («Ocurrió un error…», «Error de conexión…») son los que muestran los toasts
   de estas pantallas cuando la ruta no dice nada. */
const SUELTOS = ["lib/api/fetch-json.ts"];
const DE_COBRANZA_Y_FINANZAS = [...CARPETAS.flatMap(fuentes), ...SUELTOS];

describe("⛔ Cobranza y Finanzas hablan en tuteo, nunca en voseo", () => {
  it("ni una forma de voseo en los textos que se leen", () => {
    const hallados: string[] = [];
    for (const rel of DE_COBRANZA_Y_FINANZAS) {
      for (const { linea, texto } of textosDelFuente(leer(rel), rel)) {
        for (const w of formasDeVoseo(texto)) hallados.push(`${rel}:${linea} «${w}»`);
      }
    }
    expect(hallados, "volvió el voseo (si una palabra es tuteo de verdad, súmala a su lista en lib/ui/voseo.ts)").toEqual([]);
  });

  it("y mira donde tiene que mirar (si no, la guarda de arriba es decorativa)", () => {
    expect(DE_COBRANZA_Y_FINANZAS.length).toBeGreaterThan(200);
    for (const rel of [
      "components/cobranza/NuevaEmpresaModal.tsx",
      "components/finanzas/equilibrio/PuntoDeEquilibrio.tsx",
      "app/(shell)/cobranza/importar/page.tsx",
      "app/api/cobranza/cuentas/crear-empresa/route.ts",
      "lib/cobranza/agents/borrador-cobro.ts",
      "lib/finanzas/equilibrio.ts",
      "lib/api/fetch-json.ts",
    ]) {
      expect(DE_COBRANZA_Y_FINANZAS, rel).toContain(rel);
    }
    /* Ni pruebas ni datos de prueba: el nombre de un cliente («Areyá») no es un texto de la app. */
    expect(DE_COBRANZA_Y_FINANZAS.filter((f) => /\.test\.tsx?$|__fixtures__/.test(f))).toEqual([]);
    /* Y los textos salen de verdad de cada archivo. */
    const textos = (rel: string) => textosDelFuente(leer(rel), rel).map((t) => t.texto);
    expect(textos("components/cobranza/NuevaEmpresaModal.tsx")).toContain("Indica el nombre de la empresa.");
    expect(textos("lib/cobranza/schema.ts")).toContain("Escribe el nombre como sale en la factura");
    expect(textos("lib/api/fetch-json.ts")).toContain("Error de conexión. Revisa tu internet.");
  });

  it("el detector caza el voseo que tenían, y deja pasar el tuteo que lo reemplazó", () => {
    for (const texto of [
      // Las agudas, también las que en tuteo cambian la raíz
      "Indicá el nombre de la empresa.", "Recargá la página.", "Hacé el primer corte", "poné su fecha real",
      "Contá por qué sale de Cobrado", "Decí si es alguna", "Resolvé cuál es la cuenta", "Probá de nuevo.",
      "¿Por qué no tenés el número?", "Si lo elegís de la lista",
      // El pronombre pegado, sin tilde
      "pasala a Cliente en su ficha", "Ponele el plan de suscripción", "Liquidala suelta", "Soltala con «Cuadrar cronograma»",
      "Resolvelo en Odoo", "Decidilo antes de cargarla", "remitite a la factura", "Asegurate de que nadie más",
      // Y el «vos»
      "lo revisás y lo enviás vos", "ni sumes ningún impuesto vos",
    ]) {
      expect(formasDeVoseo(texto), texto).not.toEqual([]);
    }
    for (const texto of [
      "Indica el nombre de la empresa.", "Recarga la página.", "Haz el primer corte", "pon su fecha real",
      "Cuenta por qué sale de Cobrado", "Di si es alguna", "Resuelve cuál es la cuenta", "Prueba de nuevo.",
      "¿Por qué no tienes el número?", "Si lo eliges de la lista",
      "pásala a Cliente en su ficha", "Ponle el plan de suscripción", "Liquídala suelta o engánchala", "Suéltala con «Cuadrar cronograma»",
      "Resuélvelo en Odoo", "Decídelo antes de cargarla", "remítete a la factura", "Asegúrate de que nadie más",
      "lo revisas y lo envías tú", "ni sumes ningún impuesto por tu cuenta",
      // Lo que tiene la forma y no es voseo: la pestaña del Excel cortada a 31 letras y una clase de Tailwind
      "Implementaciones Internacionale", "rounded bg-surface-muted animate-pulse",
    ]) {
      expect(formasDeVoseo(texto), texto).toEqual([]);
    }
    /* La clase pasa por el guion, no porque «animate» esté en una lista: suelta, sigue siendo voseo. */
    expect(formasDeVoseo("Animate a cargarlo")).toEqual(["Animate"]);
  });
});
