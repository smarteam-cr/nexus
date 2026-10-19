import { describe, expect, it } from "vitest";
import { espaciosLibres, MAX_ESPACIOS_OTRO_DIA, type TareaParaUnHueco } from "./inicio";
import { finDelEspacio, MAX_SUGERENCIAS_DEL_ESPACIO, sugerenciasParaElEspacio, usaLaSugerencia } from "./espacio-libre";

// Lunes 19 de octubre de 2026, 10:00 en Costa Rica (UTC-6).
const HOY = "2026-10-19";
const AHORA = new Date("2026-10-19T16:00:00Z");
const cr = (dia: string, hora: string) => new Date(`${dia}T${hora}:00-06:00`).toISOString();

const tarea = (o: Partial<TareaParaUnHueco> & { id: string; numero: number }): TareaParaUnHueco => ({
  titulo: `Tarea ${o.numero}`,
  prioridad: "media",
  venceEl: null,
  semana: HOY,
  minutosEstimados: null,
  clientId: null,
  empresa: null,
  ...o,
});

describe("espacios libres de los días que se ven", () => {
  it("hoy desde ahora; un día que viene desde las 8:00, como mucho dos; un día que pasó, ninguno", () => {
    const eventos = [{ id: "r", inicio: cr("2026-10-21", "09:00"), fin: cr("2026-10-21", "10:00") }];
    const dias = ["2026-10-16", HOY, "2026-10-21"];
    const libres = espaciosLibres(eventos, dias, HOY, AHORA);
    expect(libres.some((e) => e.inicio.startsWith("2026-10-16"))).toBe(false);
    expect(libres[0].inicio).toBe(cr(HOY, "10:00"));
    const miercoles = libres.filter((e) => e.inicio >= cr("2026-10-21", "00:00"));
    expect(miercoles).toHaveLength(MAX_ESPACIOS_OTRO_DIA);
    expect(miercoles[0]).toEqual({ inicio: cr("2026-10-21", "08:00"), fin: cr("2026-10-21", "09:00") });
    // Sin almuerzo marcado, de 12:00 a 13:00 no se sugiere nada (lib/mi-dia/constantes.ts).
    expect(miercoles[1]).toEqual({ inicio: cr("2026-10-21", "10:00"), fin: cr("2026-10-21", "12:00") });
  });

  it("nunca en sábado ni domingo", () => {
    expect(espaciosLibres([], ["2026-10-24", "2026-10-25"], HOY, AHORA)).toEqual([]);
  });
});

describe("con qué usar un espacio", () => {
  const inicio = cr(HOY, "10:00");
  const fin = cr(HOY, "11:00");

  it("las tareas que caben, en el orden de «Con qué avanzar», con la duración de lo estimado", () => {
    const s = sugerenciasParaElEspacio({
      inicio,
      fin,
      hoyISO: HOY,
      tareas: [
        tarea({ id: "a", numero: 1, minutosEstimados: 120 }),
        tarea({ id: "b", numero: 2, venceEl: "2026-10-16", minutosEstimados: 30, clientId: "c1", empresa: "Honda" }),
        tarea({ id: "c", numero: 3 }),
      ],
    });
    expect(s.map((x) => x.clave)).toEqual(["tarea:b", "tarea:c"]);
    expect(s[0]).toMatchObject({ titulo: "T-2 · Tarea 2", minutos: 30, cuenta: { id: "c1", nombre: "Honda" }, tarea: { id: "b", numero: 2 } });
    expect(s[0].porque).toContain("está vencida");
    expect(s[1].minutos).toBe(60);
  });

  it("la reunión con una cuenta sin reunión invita a los de la última, y la cuenta no se repite como siguiente paso", () => {
    const s = sugerenciasParaElEspacio({
      inicio,
      fin,
      hoyISO: HOY,
      cuentas: [{ clientId: "c1", empresa: "Fundauna", sinReunion: true, sinAccion: true, invitados: ["ana@fundauna.org"] }],
    });
    expect(s).toHaveLength(1);
    expect(s[0]).toMatchObject({ tipo: "reunion", titulo: "Reunión con Fundauna", invitados: ["ana@fundauna.org"], tarea: null });
  });

  it("el siguiente paso: el de Ventas de un negocio, o la acción de la semana de una cuenta", () => {
    const s = sugerenciasParaElEspacio({
      inicio,
      fin,
      hoyISO: HOY,
      negocios: [
        { clientId: "c2", empresa: "Leasein", paso: "Enviar la propuesta" },
        { clientId: null, empresa: "CCN", paso: null },
      ],
      cuentas: [{ clientId: "c3", empresa: "Cemaco", sinReunion: false, sinAccion: true, invitados: [] }],
    });
    expect(s.map((x) => x.titulo)).toEqual(["Enviar la propuesta · Leasein", "Definir el siguiente paso con CCN", "Preparar la acción de la semana con Cemaco"]);
    expect(s[1].cuenta).toBeNull();
  });

  it("como mucho cinco, sin que las tareas tapen lo demás", () => {
    const s = sugerenciasParaElEspacio({
      inicio,
      fin,
      hoyISO: HOY,
      tareas: [1, 2, 3].map((n) => tarea({ id: `t${n}`, numero: n })),
      cuentas: [1, 2, 3].map((n) => ({ clientId: `c${n}`, empresa: `Cuenta ${n}`, sinReunion: true, sinAccion: false, invitados: [] })),
    });
    expect(s).toHaveLength(MAX_SUGERENCIAS_DEL_ESPACIO);
    expect(s.filter((x) => x.tipo === "tarea")).toHaveLength(2);
    expect(s.filter((x) => x.tipo === "reunion")).toHaveLength(3);
  });

  it("el espacio de un borrador llega hasta la próxima reunión de ese día, o hasta las 17:00", () => {
    const eventos = [
      { id: "x", inicio: cr(HOY, "13:00"), fin: cr(HOY, "14:00") },
      { id: "y", inicio: cr("2026-10-20", "11:00"), fin: null },
    ];
    expect(finDelEspacio(eventos, cr(HOY, "10:00"), cr(HOY, "11:00"))).toBe(cr(HOY, "13:00"));
    expect(finDelEspacio(eventos, cr(HOY, "14:00"), cr(HOY, "15:00"))).toBe(cr(HOY, "17:00"));
    expect(finDelEspacio(eventos, cr(HOY, "16:30"), cr(HOY, "17:30"))).toBe(cr(HOY, "17:30"));
  });

  it("sabe qué sugerencia usa el borrador", () => {
    const [s] = sugerenciasParaElEspacio({ inicio, fin, hoyISO: HOY, cuentas: [{ clientId: "c1", empresa: "Honda", sinReunion: true, sinAccion: false, invitados: [] }] });
    expect(usaLaSugerencia({ titulo: "Reunión con Honda", tarea: null }, s)).toBe(true);
    expect(usaLaSugerencia({ titulo: "Otra", tarea: null }, s)).toBe(false);
  });
});
