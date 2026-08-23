/**
 * lib/canvas/kpis-confirmados.test.ts — EL CHAT ESCRIBÍA LA LISTA QUE NADIE VE.
 *
 * En «El impacto en el negocio» (Entrega) hay dos listas y solo una llega al cliente:
 *   · `kpisPropuestos`  — lo que el agente encontró en las reuniones. **Nunca se pinta en lectura.**
 *   · `kpisConfirmados` — lo que un humano aceptó mirando la cita. **Es lo único que el cliente ve.**
 *
 * El chat alcanzaba SOLO la primera, así que el CSE pedía corregir un indicador, aprobaba el
 * cambio, y el documento del cliente quedaba igual. Ahora alcanza las dos — pero la confirmada se
 * CORRIGE, no se agranda: fabricar una atribución que nadie dijo es exactamente lo que la doctrina
 * «el agente propone, el CSE confirma» existe para impedir.
 */
import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { aplicarOperacionesDeDocumento, type SeccionActual } from "./operaciones-de-documento";
import { firmaDeSeccion, schemaParaElChat } from "./capacidades-de-documento";
import { ENTREGA_DEF_BY_KEY } from "@/components/landing/configs/entrega.defs";
import { toSectionDef } from "@/components/landing/configs/templates";
import { ENTREGA_SECTION_COMPONENTS } from "@/components/landing/configs/entrega";

const leer = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const DEF = ENTREGA_DEF_BY_KEY.impacto;
const TODO = { puedeOcultar: true, puedeCrear: true };

const seccion = (): SeccionActual => ({
  id: "s1",
  key: "impacto",
  label: "El impacto en el negocio",
  data: {
    intro: "Lo que nos contaron",
    kpisPropuestos: [{ label: "Ciclo de venta", valor: "de 30 a 12 días", cita: "bajamos a doce" }],
    kpisConfirmados: [{ label: "Tiempo de respuesta", valor: "de 18 a 7 días", quien: "Maria Perez" }],
  },
  schema: schemaParaElChat(DEF),
  schemaDelAgente: DEF.schema,
  oculta: false,
  esCreada: false,
  movible: true,
  listasSoloEdicion: DEF.listasSoloEdicion,
  rotulosDeListas: DEF.rotulosDeListas,
});

describe("el chat alcanza lo que el cliente SÍ ve", () => {
  it("corregir un valor confirmado entra y escribe donde se ve", () => {
    const r = aplicarOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "impacto", campo: "kpisConfirmados.0.valor", valor: "de 18 a 6 días" }],
      TODO,
    );
    expect(r.rechazadas).toEqual([]);
    expect(r.plan).toHaveLength(1);
  });

  it("corregir un nombre mal transcripto es el pedido más previsible, y entra", () => {
    const r = aplicarOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "impacto", campo: "kpisConfirmados.0.quien", valor: "María Pérez" }],
      TODO,
    );
    expect(r.rechazadas).toEqual([]);
  });

  it("borrar y mover quedan abiertos: no inventan nada", () => {
    const s = seccion();
    (s.data as { kpisConfirmados: unknown[] }).kpisConfirmados.push({ label: "Otro", valor: "x" });
    const r = aplicarOperacionesDeDocumento(
      [s],
      [
        { op: "seccion.item.mover", key: "impacto", lista: "kpisConfirmados", posicion: 0, a: 1, ancla: "Tiempo de respuesta" },
        { op: "seccion.item.borrar", key: "impacto", lista: "kpisConfirmados", posicion: 1, ancla: "Tiempo de respuesta" },
      ],
      TODO,
    );
    expect(r.rechazadas).toEqual([]);
  });
});

describe("⛔ pero un indicador NUEVO no nace desde el chat", () => {
  it("agregar a la lista confirmada se rechaza, y el motivo dice dónde SÍ se hace", () => {
    const r = aplicarOperacionesDeDocumento(
      [seccion()],
      [
        {
          op: "seccion.item.agregar",
          key: "impacto",
          lista: "kpisConfirmados",
          valores: { label: "Cierres", valor: "el doble" },
        },
      ],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("no se le agregan ítems");
    /* Un rechazo sin salida enseña a no volver a pedirlo. Éste dice por dónde. */
    expect(r.rechazadas[0].motivo).toContain("cita");
  });

  it("a la lista de PROPUESTAS sí se agrega: ahí es donde nace un indicador", () => {
    const r = aplicarOperacionesDeDocumento(
      [seccion()],
      [
        {
          op: "seccion.item.agregar",
          key: "impacto",
          lista: "kpisPropuestos",
          valores: { label: "Cierres", valor: "el doble", cita: "cerramos el doble que el año pasado" },
        },
      ],
      TODO,
    );
    expect(r.rechazadas).toEqual([]);
  });

  it("⛔ la CITA no se puede reescribir desde el chat", () => {
    /* Es la evidencia: si el chat puede reescribirla, un número inventado se ve respaldado. */
    const r = aplicarOperacionesDeDocumento(
      [seccion()],
      [{ op: "seccion.campo", key: "impacto", campo: "kpisConfirmados.0.cita", valor: "lo dijo alguien" }],
      TODO,
    );
    expect(r.plan).toEqual([]);
    expect(r.rechazadas[0].motivo).toContain("cita");
  });
});

describe("el modelo lo sabe ANTES de proponer", () => {
  it("la firma marca la lista que solo se corrige", () => {
    /* Un rechazo que el modelo podía haber evitado le gasta el único reintento que tiene, y la
       persona lee «no se pudo registrar» sobre algo que nadie le dijo que no se podía. */
    const firma = firmaDeSeccion(schemaParaElChat(DEF), DEF.listasSoloEdicion);
    expect(firma).toContain("kpisConfirmados");
    expect(firma).toContain("⚠solo corregir");
    expect(firma).not.toContain("kpisPropuestos[label, valor, cita?, quien?, cuando?] ⚠solo corregir");
  });

  it("los DOS armadores del contexto pasan la marca a la firma", () => {
    const src = leer("lib/asistente/contexto.ts");
    expect(src).toContain("firmaDeSeccion(schemaParaElChat(def), def?.listasSoloEdicion)");
    expect(src).toContain("firmaDeSeccion(s.schema, s.listasSoloEdicion)");
  });

  it("⚠ la marca sobrevive a `toSectionDef` — la trampa por QUINTA vez", () => {
    const traducida = toSectionDef(DEF, ENTREGA_SECTION_COMPONENTS);
    expect(traducida?.listasSoloEdicion).toEqual(["kpisConfirmados"]);
  });

  it("el aviso de la sección dice cuál ve el cliente", () => {
    /* Sin esto, «agregá el indicador de cierres» entra a la lista que no se pinta y el chat dice
       «aplicado» sobre algo que el cliente no va a ver nunca. */
    expect(DEF.avisoDelChat ?? "").toContain("lo ÚNICO que el cliente ve");
  });
});
