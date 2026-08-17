import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { CAPABILITY_TO_PERMISSION } from "./permissions/compat";

/**
 * lib/auth/controles-sin-permiso.test.ts — UN BOTÓN QUE SOLO SIRVE PARA DAR ERROR.
 *
 * ── DE DÓNDE SALE ESTE ARCHIVO ───────────────────────────────────────────────
 * El 2026-08-16 Éxito del cliente ganó celda propia (`customerSuccess.read`) y el CSE pasó
 * a entrar a una pantalla que antes exigía `clientes.viewAll`. Lo que ESCRIBE esa pantalla
 * —refrescar señales, correr el watchdog, fijar la salud, resolver la propuesta del
 * watchdog— se dejó a propósito en el gate viejo: son actos de cartera, no de mirar la
 * propia. La auditoría adversarial encontró la consecuencia que nadie había mirado: los
 * cuatro controles se seguían PINTANDO, así que el CSE apretaba y comía un 403 —en un caso
 * después de un toast azul de «puede tardar un par de minutos».
 *
 * ── LO QUE PROTEGE, Y POR QUÉ NINGUNA OTRA COSA LO VE ────────────────────────
 * Borrar un `puedeCurar &&` es una línea, compila, y deja la suite entera en verde: el
 * endpoint sigue rechazando perfecto y la pantalla sigue ofreciendo. El fallo no es un
 * error — es una invitación a un error.
 *
 * ⚠ Y el otro lado, que es el que se olvida: si algún día esos endpoints SÍ se abren al
 * CSE, este archivo se pone rojo. Eso es correcto: el día que la decisión cambie, hay que
 * venir acá a borrar el gate de la UI, no dejarlo escondiendo un botón que ya funciona.
 */

const RAIZ = process.cwd();
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), "utf8");
/** Mencionar no es usar: los cuatro archivos EXPLICAN el permiso en un comentario. */
const sinComentarios = (rel: string) =>
  leer(rel)
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/^\s*\/\/.*$/gm, " ");

const PANEL = "app/(shell)/customer-success/page.tsx";
const FICHA = "app/(shell)/customer-success/[clientId]/page.tsx";
const CS_PANEL = "components/cs/CsPanel.tsx";
const GRILLA = "components/dashboard/PortfolioGrid.tsx";
const CHIP = "components/lifecycle/HealthProposalChip.tsx";
const ACTIVOS = "components/cs/account/ActiveProjectsSection.tsx";

const ENDPOINTS_QUE_SIGUEN_EN_EL_GATE_VIEJO = [
  "app/api/cs/signals/refresh/route.ts",
  "app/api/cs/watchdog/run/route.ts",
  "app/api/projects/[projectId]/health/route.ts",
  "app/api/projects/[projectId]/health-proposal/route.ts",
];

describe("⭐ la premisa: esos cuatro endpoints NO son del CSE", () => {
  it.each(ENDPOINTS_QUE_SIGUEN_EN_EL_GATE_VIEJO)("%s exige seeAllClients", (ruta) => {
    /* Si esto se pone rojo, la decisión cambió y el gate de la UI de abajo pasó a esconder
       un botón que ya funcionaría — hay que borrarlo, no bajar este assert. */
    expect(sinComentarios(ruta)).toContain('guardCapability("seeAllClients")');
  });

  it("y la pantalla se abre con OTRA celda, que es lo que crea el hueco", () => {
    expect(sinComentarios(PANEL)).toContain('requirePermission("customerSuccess", "read")');
    expect(sinComentarios(FICHA)).toContain('requirePermission("customerSuccess", "read")');
  });
});

describe("las dos pantallas calculan el permiso de ESCRITURA por separado", () => {
  it("⚠ y lo calculan con la MISMA celda que exige el endpoint", () => {
    /* La trampa silenciosa: calcularlo con `customerSuccess.read` (que quien está mirando
       la pantalla SIEMPRE tiene) dejaría la bandera en `true` para todo el mundo y los
       botones volverían, con el gate puesto y sin que nada se ponga rojo. */
    const celda = CAPABILITY_TO_PERMISSION.seeAllClients;
    const esperado = `can(ctx.teamMember, "${celda.section}", "${celda.action}")`;
    for (const p of [PANEL, FICHA]) {
      expect(sinComentarios(p), `${p} dejó de derivar puedeCurar de la celda del endpoint`).toContain(
        esperado,
      );
    }
  });

  it("y se lo pasan a quien pinta los controles", () => {
    expect(sinComentarios(PANEL)).toMatch(/<CsPanel[^>]*puedeCurar=\{puedeCurar\}/);
    expect(sinComentarios(FICHA)).toMatch(/<AccountView[^>]*puedeCurar=\{puedeCurar\}/);
  });
});

describe("⛔ ninguno de los cuatro controles se ofrece sin el permiso", () => {
  it("«Actualizar señales» y «Correr watchdog» no se pintan", () => {
    const src = sinComentarios(CS_PANEL);
    for (const handler of ["refreshSignals", "runWatchdog"]) {
      const i = src.indexOf(`onClick={${handler}}`);
      expect(i, `desapareció el botón de ${handler}`).toBeGreaterThan(0);
      const antes = src.slice(Math.max(0, i - 400), i);
      expect(antes, `el botón de ${handler} volvió a pintarse sin mirar el permiso`).toContain(
        "{puedeCurar && (",
      );
    }
  });

  it("el chip de salud de la cartera deja de ser un botón", () => {
    const src = sinComentarios(GRILLA);
    expect(src, "el chip de salud volvió a ser clickeable para cualquiera").toMatch(
      /if \(!puedeCurar\)[\s\S]{0,400}return \(/,
    );
    /* Y el prop tiene que llegar hasta el chip: el gate no sirve si `ActionCard` no lo pasa
       (quedaría `undefined` → `!puedeCurar` siempre verdadero, o el default siempre). */
    expect(src).toMatch(/<HealthChip[^>]*puedeCurar=\{puedeCurar\}/);
    expect(src).toMatch(/<ActionCard[^>]*puedeCurar=\{puedeCurar\}/);
  });

  it("Confirmar/Descartar de la propuesta del watchdog no se ofrecen", () => {
    const src = sinComentarios(CHIP);
    expect(src, "el chip volvió a ofrecer los dos botones sin mirar el permiso").toContain(
      "{puedeResolver && (",
    );
    /* El chip SIGUE viéndose: la información sobre un proyecto propio es útil aunque no se
       pueda resolver. Lo que se apaga son los botones, no el aviso. */
    expect(src).toContain("En riesgo (propuesto por el agente)");
    expect(sinComentarios(ACTIVOS)).toMatch(/puedeResolver=\{puedeCurar\}/);
  });

  it("⚠ y ninguno de los cuatro props tiene default que los resucite", () => {
    /* Un `puedeCurar = true` de default hace que un call site nuevo herede los botones
       muertos en silencio — exactamente el defecto que esto vino a matar. La grilla es la
       excepción declarada (la usa el /dashboard clásico, que ya vive detrás del gate). */
    expect(sinComentarios(CS_PANEL)).not.toMatch(/puedeCurar\s*=\s*(true|false)/);
    expect(sinComentarios(CHIP)).not.toMatch(/puedeResolver\s*=\s*(true|false)/);
    expect(sinComentarios(ACTIVOS)).not.toMatch(/puedeCurar\s*=\s*(true|false)/);
  });
});

describe("⭐ pintar optimista solo es honesto si el fallo REVIERTE", () => {
  it("un rechazo del servidor deshace el cambio en pantalla", () => {
    /* El defecto medido: la fila quedaba en «En riesgo · manual» con un toast rojo de 4 s
       al lado. Si la persona no ve el toast, cree que quedó registrado — y lo que la
       pantalla muestra es el estado que el servidor NO tiene, hasta que alguien recarga. */
    const src = sinComentarios(GRILLA);
    const i = src.indexOf("async function setHealth");
    const cuerpo = src.slice(i, i + 1800);
    expect(cuerpo, "se perdió la foto de antes").toContain("const antes = rows.find(");
    expect(cuerpo, "el rechazo del servidor dejó de revertir").toMatch(
      /if \(!res\.ok\) \{[\s\S]{0,120}revertir\(\)/,
    );
    expect(cuerpo, "la red caída dejó de revertir").toMatch(/catch \{[\s\S]{0,120}revertir\(\)/);
  });
});
