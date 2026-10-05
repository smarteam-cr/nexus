/**
 * Una foto de auditoría de prueba, chica pero completa: un portal con 1.000 contactos, 200 empresas,
 * tres workflows (dos encendidos que escriben la misma propiedad), propiedades creadas por alguien
 * que ya no está y usuarios de dos dominios. Datos inventados: ningún portal real.
 */
import type { FotoDeAuditoria } from "../foto";
import type { InventarioDelPortal } from "../inventario";

export const HOY = new Date("2026-10-04T12:00:00.000Z");

export function inventarioDePrueba(): InventarioDelPortal {
  return {
    workflows: [
      {
        id: "w1",
        nombre: "Asigna la etapa al llenar el formulario",
        objeto: "contactos",
        encendido: true,
        creadoEn: "2023-05-02T00:00:00.000Z",
        cambiadoEn: "2024-01-10T00:00:00.000Z",
        detalle: { disparador: "evento", acciones: 3, ramas: 1, queHace: ["Cambia propiedades"], escribe: ["lifecyclestage", "hs_lead_status"], cambiaEtapa: true, conCodigo: false, conWebhook: false },
      },
      {
        id: "w2",
        nombre: "Califica leads",
        objeto: "contactos",
        encendido: true,
        creadoEn: "2025-02-01T00:00:00.000Z",
        cambiadoEn: "2026-09-01T00:00:00.000Z",
        detalle: { disparador: "criterios", acciones: 2, ramas: 0, queHace: ["Cambia propiedades", "Llama a un webhook"], escribe: ["hs_lead_status"], cambiaEtapa: false, conCodigo: false, conWebhook: true },
      },
      {
        id: "w3",
        nombre: "Viejo de negocios",
        objeto: "negocios",
        encendido: false,
        creadoEn: "2022-01-01T00:00:00.000Z",
        cambiadoEn: "2022-03-01T00:00:00.000Z",
        detalle: null,
      },
    ],
    propiedades: {
      porObjeto: [
        { objeto: "contactos", total: 250, propias: 3 },
        { objeto: "empresas", total: 180, propias: 1 },
        { objeto: "negocios", total: 160, propias: 0 },
        { objeto: "tickets", total: 90, propias: 0 },
      ],
      propias: [
        { nombre: "origen_feria", etiqueta: "Origen feria", objeto: "contactos", tipo: "enumeration", grupo: "contactinformation", calculada: false, creadaEn: "2023-04-01T00:00:00.000Z", creadorId: "u-ida" },
        { nombre: "puntaje_interno", etiqueta: "Puntaje interno", objeto: "contactos", tipo: "number", grupo: "contactinformation", calculada: true, creadaEn: "2024-06-01T00:00:00.000Z", creadorId: "u-ida" },
        { nombre: "segmento", etiqueta: "Segmento", objeto: "contactos", tipo: "string", grupo: "contactinformation", calculada: false, creadaEn: "2025-06-01T00:00:00.000Z", creadorId: "u-activa" },
        { nombre: "region", etiqueta: "Región", objeto: "empresas", tipo: "string", grupo: "companyinformation", calculada: false, creadaEn: null, creadorId: null },
      ],
    },
    pipelines: [
      {
        objeto: "negocios",
        id: "p1",
        nombre: "Ventas",
        etapas: [
          { id: "d1", nombre: "Nuevo", probabilidad: 10, cerrada: false, registros: 30 },
          { id: "d2", nombre: "Propuesta", probabilidad: 60, cerrada: false, registros: 80 },
          { id: "d3", nombre: "Ganado", probabilidad: 100, cerrada: true, registros: 8 },
          { id: "d4", nombre: "Perdido", probabilidad: 0, cerrada: true, registros: 2 },
        ],
        registros: 120,
        abiertos: 110,
        sinActividad: 40,
        sinCambios: 5,
        creadoEn: "2023-01-01T00:00:00.000Z",
        cambiadoEn: "2025-05-01T00:00:00.000Z",
      },
      {
        objeto: "negocios",
        id: "p2",
        nombre: "Prueba",
        etapas: [
          { id: "d5", nombre: "Uno", probabilidad: 20, cerrada: false, registros: null },
          { id: "d6", nombre: "Dos", probabilidad: 100, cerrada: true, registros: null },
        ],
        registros: 0,
      },
      {
        objeto: "tickets",
        id: "p3",
        nombre: "Soporte",
        etapas: [
          { id: "t1", nombre: "Nuevo", probabilidad: null, cerrada: false, registros: 30 },
          { id: "t2", nombre: "Cerrado", probabilidad: null, cerrada: true, registros: 10 },
        ],
        registros: 40,
        abiertos: 30,
        sinActividad: 30,
        sinCambios: 2,
      },
    ],
    personas: [
      { usuarioId: "u-activa", nombre: "Persona activa", dominio: "cliente.test", activo: true, superAdmin: true },
      { usuarioId: "u-otra", nombre: "Persona de la agencia", dominio: "agencia.test", activo: true, superAdmin: false },
      { usuarioId: "u-ida", nombre: "Persona que se fue", dominio: "agencia.test", activo: false, superAdmin: false },
    ],
    equipos: null,
    objetosPersonalizados: [],
  };
}

export function fotoDePrueba(cambios: Partial<FotoDeAuditoria> = {}): FotoDeAuditoria {
  return {
    version: 2,
    estado: "lista",
    creadaPor: { nombre: "Persona del equipo", email: "persona@smarteam.test" },
    iniciadaEn: "2026-10-04T11:58:00.000Z",
    capturedAt: "2026-10-04T12:00:00.000Z",
    duracionMs: 95000,
    lifecycleStats: {
      contacts: [
        { value: "lead", label: "Lead", count: 700 },
        { value: "marketingqualifiedlead", label: "MQL", count: 5 },
        { value: "salesqualifiedlead", label: "SQL", count: 80 },
        { value: "opportunity", label: "Oportunidad", count: 40 },
        { value: "customer", label: "Cliente", count: 120 },
      ],
      companies: [
        { value: "lead", label: "Lead", count: 90 },
        { value: "customer", label: "Cliente", count: 60 },
      ],
      totalContacts: 1000,
      totalCompanies: 200,
      totalDeals: 120,
      totalTickets: 40,
      lifecycleWorkflows: ["Asigna la etapa al llenar el formulario"],
    },
    ownerStats: {
      owners: [
        { ownerId: "o1", ownerName: "Propietaria uno", contactCount: 450 },
        { ownerId: "o2", ownerName: "Propietario dos", contactCount: 150 },
      ],
      unassigned: 400,
      monthlyAssignments: [{ month: "2026-09", label: "Sep 26", count: 30 }],
      monthlyCreated: [{ month: "2026-09", label: "Sep 26", count: 55 }],
      totalAssigned: 600,
    },
    inventario: inventarioDePrueba(),
    lecturas: { version: 1, intentos: 67, fallidas: [] },
    ...cambios,
  };
}
