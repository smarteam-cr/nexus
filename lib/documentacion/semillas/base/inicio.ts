/**
 * lib/documentacion/semillas/base/inicio.ts — la portada de la base.
 *
 * La entrada a todo: el propósito arriba y, debajo, las seis secciones en tres columnas con las
 * páginas de cada una — el formato de las «company home» de Notion que Elías tomó de referencia
 * (2026-09-13). Documentación abre acá.
 *
 * ⚠ La portada ENLAZA, no copia: cada página vive en un solo lugar del árbol. Si se agrega una página
 * directa a una sección, se suma su enlace acá; `paginas.test.ts` lo exige.
 */
import { aviso, parrafo, parrafoRico, tarjeta, tarjetas, titulo, type PaginaSembrada } from "../bloques";
import { a as deCs } from "../customer-success/enlaces";
import { a, pagina } from "./enlaces";
import { PROPOSITO } from "./la-empresa";

export function construirInicio(): PaginaSembrada {
  return {
    ...pagina("inicio"),
    bloques: [
      aviso("info", ["Nuestro propósito: ", { negrita: true }], PROPOSITO),
      parrafo(
        "Esta es la base de conocimiento de Smarteam: quiénes somos, cómo nos organizamos, qué ofrecemos y cómo trabajamos. La lee todo el equipo, y cada página enlaza a las que la completan. Para buscar en todas, usa Ctrl+K.",
      ),

      tarjetas(
        "3",
        tarjeta("Quiénes somos", parrafoRico(a("empresa")), parrafoRico(a("proposito")), parrafoRico(a("historia"))),
        tarjeta(
          "Cómo nos organizamos",
          parrafoRico(a("departamentos")),
          parrafoRico(deCs("customerSuccess")),
          parrafoRico(a("ventas")),
          parrafoRico(a("finanzas")),
          parrafoRico(a("desarrollo")),
          parrafoRico(a("marketing")),
          parrafoRico(a("revops")),
        ),
        tarjeta("Qué ofrecemos", parrafoRico(a("servicios")), parrafoRico(deCs("smartloop")), parrafoRico(a("casos"))),
        tarjeta(
          "Con qué trabajamos",
          parrafoRico(a("recursos")),
          parrafoRico(deCs("escala")),
          parrafoRico(deCs("nexus")),
          parrafoRico(a("herramientas")),
          parrafoRico(a("marca")),
        ),
        tarjeta("El día a día", parrafoRico(a("comoTrabajamos")), parrafoRico(deCs("trabajar")), parrafoRico(a("condiciones"))),
        tarjeta("Las personas", parrafoRico(a("equipo")), parrafoRico(deCs("rolCse")), parrafoRico(deCs("rolCsl"))),
      ),

      titulo(2, "Si recién llegas"),
      parrafo("Cinco páginas, en este orden, alcanzan para arrancar:"),
      parrafoRico("1. ", a("proposito"), " — por qué existimos y qué nos importa."),
      parrafoRico("2. ", deCs("trabajar"), " — por dónde se habla cada cosa y cómo se graba una reunión."),
      parrafoRico("3. ", a("condiciones"), " — la jornada, las vacaciones y los feriados."),
      parrafoRico("4. ", a("equipo"), " — quién es quién, por área."),
      parrafoRico("5. ", a("departamentos"), " — y, adentro, la página de tu departamento."),
    ],
  };
}
