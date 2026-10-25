/**
 * lib/encuestas-de-cuenta/reglas.ts — cuándo se pregunta y qué dicen las respuestas. PURO (sin base), con pruebas.
 */
import type { PreguntaSobreLaCuenta } from "./preguntas";

const DIA_MS = 86_400_000;

/** Un evento ya guardado, lo mínimo para decidir. */
export interface EventoGuardado {
  evento: string;
  valor: string | null;
  preguntaVersion: number;
  createdAt: Date;
}

export type Decision =
  | { preguntar: true; motivo: "nunca" | "no-sabia" | "despues" | "version-nueva" }
  | { preguntar: false; motivo: "respondio" | "espera-no-se" | "espera-ahora-no" };

/**
 * ¿Se le pregunta a esta persona por este cliente? Mira solo sus eventos de esta pregunta. «Mostrada» no decide nada:
 * manda la última respuesta o el último «Ahora no».
 *   · Sí o No en la versión vigente → no se vuelve a preguntar.
 *   · No sé → se vuelve a preguntar pasados `diasParaVolverConNoSe` días.
 *   · Ahora no → pasados `diasParaVolverConAhoraNo` días.
 *   · Lo de una versión anterior no cuenta: la pregunta cambió.
 */
export function decidirSiPreguntar(
  p: Pick<PreguntaSobreLaCuenta, "version" | "diasParaVolverConNoSe" | "diasParaVolverConAhoraNo">,
  eventos: EventoGuardado[],
  ahora: Date,
): Decision {
  const decisivos = eventos
    .filter((e) => e.evento === "respondida" || e.evento === "ahora_no")
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  const ultimo = decisivos[0];
  if (!ultimo) return { preguntar: true, motivo: "nunca" };
  if (ultimo.preguntaVersion < p.version) return { preguntar: true, motivo: "version-nueva" };
  const dias = (ahora.getTime() - ultimo.createdAt.getTime()) / DIA_MS;
  if (ultimo.evento === "ahora_no") {
    return dias >= p.diasParaVolverConAhoraNo
      ? { preguntar: true, motivo: "despues" }
      : { preguntar: false, motivo: "espera-ahora-no" };
  }
  if (ultimo.valor === "no_se") {
    return dias >= p.diasParaVolverConNoSe
      ? { preguntar: true, motivo: "no-sabia" }
      : { preguntar: false, motivo: "espera-no-se" };
  }
  return { preguntar: false, motivo: "respondio" };
}

/** Una respuesta, con lo necesario para los resultados. */
export interface RespuestaParaResultados {
  clientId: string | null;
  clientNombre: string;
  personaEmail: string;
  rol: string | null;
  motivoDeAcceso: string | null;
  valor: string;
  porQue: string | null;
  preguntaVersion: number;
  createdAt: Date;
}

export interface LecturaDePersona {
  personaEmail: string;
  rol: string | null;
  /** Ve al cliente por ser encargado en HubSpot. */
  esEncargado: boolean;
  valor: string;
  porQue: string | null;
  fecha: Date;
  /** Cuántas veces respondió esta persona por este cliente (la historia completa está en la exportación). */
  veces: number;
}

export interface LecturaDeCliente {
  clientId: string | null;
  clientNombre: string;
  /** La última respuesta de cada persona, la más reciente primero. */
  personas: LecturaDePersona[];
  /** Sí y No juntos: alguien lo ve distinto. */
  desacuerdo: boolean;
  /** Lo que dice la mayoría de las últimas respuestas que no son «No sé»; null si nadie sabe o empatan. */
  lectura: "si" | "no" | null;
}

export interface Resultados {
  clientes: LecturaDeCliente[];
  /** CLIENTES por su lectura (sí, no o sin saber), no respuestas. */
  conteo: { si: number; no: number; no_se: number };
  personas: number;
  respuestas: number;
}

/**
 * Los resultados vigentes: por cliente, la última respuesta de cada persona en la versión actual. Dos personas que
 * dicen «Sí» del mismo cliente son un sí; un «Sí» y un «No» son un desacuerdo y el cliente cuenta como sin saber.
 */
export function resultadosDe(p: PreguntaSobreLaCuenta, respuestas: RespuestaParaResultados[]): Resultados {
  const vigentes = respuestas.filter((r) => r.preguntaVersion === p.version);
  const porCliente = new Map<string, Map<string, RespuestaParaResultados[]>>();
  for (const r of vigentes) {
    const k = r.clientId ?? `sin-id:${r.clientNombre}`;
    const c = porCliente.get(k) ?? new Map<string, RespuestaParaResultados[]>();
    const lista = c.get(r.personaEmail) ?? [];
    lista.push(r);
    c.set(r.personaEmail, lista);
    porCliente.set(k, c);
  }
  const clientes: LecturaDeCliente[] = [];
  const conteo = { si: 0, no: 0, no_se: 0 };
  for (const porPersona of porCliente.values()) {
    let masReciente: RespuestaParaResultados | null = null;
    const personas: LecturaDePersona[] = [...porPersona.values()].map((lista) => {
      const u = lista.reduce((a, b) => (b.createdAt > a.createdAt ? b : a));
      if (!masReciente || u.createdAt > masReciente.createdAt) masReciente = u;
      return {
        personaEmail: u.personaEmail,
        rol: u.rol,
        esEncargado: u.motivoDeAcceso === "hubspot-owner",
        valor: u.valor,
        porQue: u.porQue,
        fecha: u.createdAt,
        veces: lista.length,
      };
    });
    personas.sort((a, b) => b.fecha.getTime() - a.fecha.getTime());
    const si = personas.filter((x) => x.valor === "si").length;
    const no = personas.filter((x) => x.valor === "no").length;
    const lectura = si > no ? "si" : no > si ? "no" : null;
    conteo[lectura ?? "no_se"]++;
    const ref = masReciente as RespuestaParaResultados | null;
    clientes.push({
      clientId: ref?.clientId ?? null,
      // El nombre de la respuesta más reciente: si el cliente cambió de nombre, el de hoy.
      clientNombre: ref?.clientNombre ?? "",
      personas,
      desacuerdo: si > 0 && no > 0,
      lectura,
    });
  }
  clientes.sort((a, b) => a.clientNombre.localeCompare(b.clientNombre, "es"));
  return { clientes, conteo, personas: new Set(vigentes.map((r) => r.personaEmail)).size, respuestas: vigentes.length };
}

/** Una fila de la exportación: cada evento, sin resumir. */
export interface EventoParaExportar {
  createdAt: Date;
  clave: string;
  preguntaVersion: number;
  preguntaTexto: string;
  clientId: string | null;
  clientNombre: string;
  personaEmail: string;
  rol: string | null;
  motivoDeAcceso: string | null;
  evento: string;
  valor: string | null;
  porQue: string | null;
}

const COLUMNAS = [
  "fecha",
  "pregunta",
  "version",
  "texto de la pregunta",
  "cliente",
  "id del cliente",
  "persona",
  "rol",
  "por que ve al cliente",
  "evento",
  "respuesta",
  "por que",
];

function celda(v: string | number | null): string {
  const s = v === null ? "" : String(v);
  return /[",\n\r;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** El CSV con TODOS los eventos (también «mostrada» y «ahora_no»), en el orden en que pasaron. Con BOM para Excel. */
export function csvDeEventos(eventos: EventoParaExportar[]): string {
  const filas = [...eventos]
    .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
    .map((e) =>
      [
        e.createdAt.toISOString(),
        e.clave,
        e.preguntaVersion,
        e.preguntaTexto,
        e.clientNombre,
        e.clientId,
        e.personaEmail,
        e.rol,
        e.motivoDeAcceso,
        e.evento,
        e.valor,
        e.porQue,
      ]
        .map(celda)
        .join(","),
    );
  return "﻿" + [COLUMNAS.join(","), ...filas].join("\r\n") + "\r\n";
}
