/**
 * lib/exploraciones/una-puerta.test.ts — UNA SOLA PUERTA «Nexus» en la preventa (etapa 2 del plan maestro de «Hablar con
 * Nexus», 23 nov). Las piezas están en archivos distintos y se rompen en silencio al mover una: por eso se mira el texto.
 *   · La cabecera de la preventa tiene el botón «Nexus» y el chat de la cuenta montado SIN su botón.
 *   · El cajón de «Hablar con Nexus» no tiene botón propio en el riel: va con los demás cajones del lienzo.
 *   · «✨ Mejorar con IA» de La escala abre ese cajón (sin el panel al lado de la página: no quedan los dos).
 *   · En la preventa, el chat de la cuenta no ofrece las notas de la cuenta (van a HubSpot: decisión de Elías del 22 nov).
 */
import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const leer = (f: string) => fs.readFileSync(path.join(process.cwd(), f), "utf8");

describe("una sola puerta «Nexus» en la preventa", () => {
  it("la cabecera tiene el botón «Nexus» y el chat de la cuenta va sin botón, con la preventa como chip", () => {
    const pagina = leer("app/(shell)/sales/exploraciones/[id]/page.tsx");
    expect(pagina).toContain('const conCajon = escala.estado === "ok" && puedeEditar && !exp.estado.archivada;');
    expect(pagina).toContain("{conCajon && <BotonDeNexus exploracionId={exp.id} />}");
    // Sin el cajón (no puede cambiar la preventa, archivada o sin escala), el chat de la cuenta conserva su botón.
    expect(pagina).toContain("sinBoton={conCajon}");
    expect(pagina).toContain("exploracionId={exp.id}");
  });

  it("el cajón no tiene botón en el riel: va con los cajones del lienzo y lo abre el evento", () => {
    const cajon = leer("components/exploraciones/HablarConNexus.tsx");
    expect(cajon).not.toMatch(/>\s*Hablar con Nexus\s*</);
    expect(cajon).toContain("EVENTO_ABRIR_NEXUS");
    const lienzo = leer("components/exploraciones/LienzoDeExploracion.tsx");
    expect(lienzo.match(/<HablarConNexus \/>/g)).toHaveLength(1);
    expect(lienzo.indexOf("<HablarConNexus />")).toBeGreaterThan(lienzo.indexOf("const cajones = ("));
    expect(lienzo.indexOf("<HablarConNexus />")).toBeLessThan(lienzo.indexOf("if (cuenta) {"));
  });

  it("«✨ Mejorar con IA» de La escala abre el cajón: la página ya no monta el panel", () => {
    const pagina = leer("components/exploraciones/PaginaDeLaEscala.tsx");
    expect(pagina).not.toContain("<PedirleANexus");
    expect(pagina).toContain("abrirNexusEnLaPreventa(");
    expect(leer("components/exploraciones/HablarConNexus.tsx")).toContain("<PedirleANexus");
  });

  it("en la preventa el chat de la cuenta no ofrece «nota.crear»", () => {
    const ruta = leer("app/api/nexus-chat/[clientId]/asistente/route.ts");
    expect(ruta).toMatch(/sinNotasDeLaCuenta: true/);
    const herramientas = leer("lib/nexus-chat/herramientas-server.ts");
    expect(herramientas).toMatch(/NOTA_DE_LA_CUENTA = "nota\.crear"/);
    expect(herramientas).toMatch(/o\.sinNotasDeLaCuenta && x\.nombre === NOTA_DE_LA_CUENTA/);
    expect(leer("lib/nexus-chat/turno-server.ts")).toContain("herramientasDelChat({ sinNotasDeLaCuenta: foco?.sinNotasDeLaCuenta })");
    // La operación existe con ese nombre (si se renombra, el filtro dejaría de filtrar).
    expect(leer("lib/operaciones/notas-server.ts")).toContain('nombre: "nota.crear"');
  });
});
