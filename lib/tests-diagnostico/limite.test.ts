import { beforeEach, describe, expect, it } from "vitest";
import {
  direccionDelVisitante,
  GUARDADOS_POR_MINUTO,
  permitirEmpezar,
  permitirGuardar,
  permitirVisita,
  POR_IP_POR_HORA,
  reiniciarLimites,
  TOTAL_POR_HORA,
  VENTANA_DE_VISITAS_MIN,
  VISITAS_POR_DIRECCION,
  VISITAS_POR_HORA,
} from "./limite";
import { EmpezarTestSchema } from "./schema";

const cabeceras = (h: Record<string, string>) => ({ get: (n: string) => h[n.toLowerCase()] ?? null });

beforeEach(() => reiniciarLimites());

describe("los topes del test público", () => {
  it("por dirección: 10 por hora; a la hora siguiente vuelve a poder", () => {
    const t0 = 1_000_000;
    for (let k = 0; k < POR_IP_POR_HORA; k++) expect(permitirEmpezar("ip-a", t0 + k)).toBe(true);
    expect(permitirEmpezar("ip-a", t0 + 100)).toBe(false);
    expect(permitirEmpezar("ip-b", t0 + 100)).toBe(true);
    expect(permitirEmpezar("ip-a", t0 + 3_600_001)).toBe(true);
  });

  it("en total: 400 por hora entre todas las direcciones (y sin dirección, solo cuenta el total)", () => {
    for (let k = 0; k < TOTAL_POR_HORA; k++) expect(permitirEmpezar(k % 2 ? `ip-${k}` : null, 5_000 + k)).toBe(true);
    expect(permitirEmpezar("otra", 6_000)).toBe(false);
    expect(permitirEmpezar(null, 6_000)).toBe(false);
  });

  it("cada intento guarda hasta 40 veces por minuto", () => {
    for (let k = 0; k < GUARDADOS_POR_MINUTO; k++) expect(permitirGuardar("tok", 10 + k)).toBe(true);
    expect(permitirGuardar("tok", 100)).toBe(false);
    expect(permitirGuardar("tok", 60_100)).toBe(true);
  });

  it("una dirección suma hasta 10 visitas por test cada media hora: una oficina cuenta, un script que recarga no", () => {
    const t0 = 2_000_000;
    for (let k = 0; k < VISITAS_POR_DIRECCION; k++) expect(permitirVisita("ip-a", "1:web", t0 + k)).toBe(true);
    expect(permitirVisita("ip-a", "1:web", t0 + 1000)).toBe(false);
    expect(permitirVisita("ip-a", "1:marketing", t0 + 1000)).toBe(true);
    expect(permitirVisita("ip-b", "1:web", t0 + 1000)).toBe(true);
    expect(permitirVisita("ip-a", "1:web", t0 + VENTANA_DE_VISITAS_MIN * 60_000 + 10)).toBe(true);
  });

  it("las visitas tienen un tope total por hora, también sin dirección", () => {
    for (let k = 0; k < VISITAS_POR_HORA; k++) expect(permitirVisita(k % 2 ? `ip-${k}` : null, "2:web", 9_000 + k)).toBe(true);
    expect(permitirVisita("nueva", "2:web", 20_000)).toBe(false);
    expect(permitirVisita(null, "2:web", 20_000)).toBe(false);
  });

  it("⛔ la dirección es la que agrega el proxy (la última), no la que escribe el visitante", () => {
    expect(direccionDelVisitante(cabeceras({ "x-forwarded-for": "1.1.1.1, 9.9.9.9" }))).toBe("9.9.9.9");
    expect(direccionDelVisitante(cabeceras({ "x-forwarded-for": "inventada" + Math.random() + ", 9.9.9.9" }))).toBe("9.9.9.9");
    expect(direccionDelVisitante(cabeceras({ "x-real-ip": "8.8.8.8" }))).toBe("8.8.8.8");
    expect(direccionDelVisitante(cabeceras({}))).toBeNull();
  });
});

describe("lo que entra al empezar", () => {
  const base = { area: "ventas", nombre: "Ana", email: "Ana@Acme.com" };

  it("el campo trampa viaja y la ruta lo mira; el correo se normaliza", () => {
    const r = EmpezarTestSchema.parse({ ...base, sitio: "spam" });
    expect(r.sitio).toBe("spam");
    expect(r.email).toBe("ana@acme.com");
    expect(r.version).toBe("web");
  });

  it("del origen se guarda solo lo conocido, hasta 12 claves de 300 caracteres; más de 40 claves se rechaza", () => {
    const origen = { utm_source: "li", gclid: "x".repeat(900), raro: "nada", UTM_X: "no", pagina: "https://smarteam" };
    expect(EmpezarTestSchema.parse({ ...base, origen }).origen).toEqual({ utm_source: "li", gclid: "x".repeat(300), pagina: "https://smarteam" });
    const muchas = Object.fromEntries(Array.from({ length: 41 }, (_, k) => [`utm_c${k}`, "v"]));
    expect(EmpezarTestSchema.safeParse({ ...base, origen: muchas }).success).toBe(false);
    const veinte = Object.fromEntries(Array.from({ length: 20 }, (_, k) => [`utm_c${String.fromCharCode(97 + k)}`, "v"]));
    expect(Object.keys(EmpezarTestSchema.parse({ ...base, origen: veinte }).origen ?? {})).toHaveLength(12);
  });
});
