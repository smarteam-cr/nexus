/**
 * lib/landing/inversion.test.ts
 *
 * Lo que este archivo protege es UNA cosa: que a un cliente NO le cambie el documento que
 * ya vio. `configForSnapshot` resuelve por key contra la config viva, así que toda
 * propuesta publicada estrena el renderer unificado — y estas dos reglas son lo único que
 * se interpone.
 */
import { describe, it, expect } from "vitest";
import {
  adoptarRecurrentes,
  adoptarShapeNuevo,
  esInversionLegacy,
  textoDescuento,
  precioDesdeMonto,
  gruposDeInversion,
  conciliarLicenciasHub,
  contratoDe,
  esLineaActiva,
  montoDeLinea,
  INVERSION_LEGACY_KEYS,
  licenciasDeHubSinMonto,
  sembrarLicenciasIniciales,
  type InversionData,
} from "./inversion";

const legacyReal: InversionData = {
  licenciasHubspot: { monto: "A definir en propuesta formal", detalle: "Hubs × usuarios" },
  implementacion: { monto: "$12,000–18,000", detalle: "Set up + onboarding" },
  nota: "",
};

describe("esInversionLegacy: qué propuestas se PROYECTAN a la tabla", () => {
  it("el shape viejo con contenido → rama legacy", () => {
    expect(esInversionLegacy(legacyReal)).toBe(true);
    // Con solo el detalle escrito ya cuenta: el monto puede estar por definirse.
    expect(esInversionLegacy({ implementacion: { monto: "", detalle: "Set up" } })).toBe(true);
  });

  it("el shape viejo VACÍO no es legacy (una sección recién creada usa la tabla nueva)", () => {
    expect(esInversionLegacy({ licenciasHubspot: { monto: "", detalle: "" } })).toBe(false);
    expect(esInversionLegacy({})).toBe(false);
    expect(esInversionLegacy(null)).toBe(false);
  });

  it("con contenido en el shape NUEVO nunca es legacy, aunque arrastre las keys viejas", () => {
    expect(esInversionLegacy({ ...legacyReal, lineas: [{ concepto: "Diseño", monto: "$500" }] })).toBe(false);
    expect(esInversionLegacy({ ...legacyReal, licencias: [{ concepto: "Content Hub", monto: "$450" }] })).toBe(false);
  });

  it("las keys legacy están declaradas donde se pueden leer", () => {
    expect([...INVERSION_LEGACY_KEYS]).toEqual(["licenciasHubspot", "implementacion"]);
  });
});

describe("adoptarShapeNuevo: la proyección del shape viejo al de factura", () => {
  it("mapea las dos tarjetas a una línea de cada grupo", () => {
    const out = adoptarShapeNuevo(legacyReal);
    expect(out.lineas).toEqual([
      { concepto: "Implementación Smarteam", monto: "$12,000–18,000", detalle: "Set up + onboarding" },
    ]);
    expect(out.licencias).toEqual([
      { concepto: "Licencias HubSpot", monto: "A definir en propuesta formal", detalle: "Hubs × usuarios" },
    ]);
    expect(esInversionLegacy(out)).toBe(false); // ya no vuelve a la rama vieja
  });

  it("una tarjeta vacía no crea una línea en blanco", () => {
    const out = adoptarShapeNuevo({ implementacion: { monto: "$1,000", detalle: "" } } as InversionData);
    expect(out.licencias).toEqual([]);
    expect(out.lineas).toHaveLength(1);
  });
});

describe("gruposDeInversion: cuántos totales se pintan", () => {
  it("sin montos no se pinta nada (comportamiento de hoy)", () => {
    const g = gruposDeInversion({ lineas: [{ concepto: "Diseño", monto: "" }] });
    expect(g.gruposConMonto).toBe(0);
    expect(g.servicios.total).toBeNull();
    expect(g.granTotal).toBeNull();
  });

  /* ⚠ EL caso de las propuestas de sitio web publicadas: solo tienen `lineas`, así que hay
     UN grupo → un solo total, con la píldora de siempre, y NINGÚN gran total nuevo. */
  it("un solo grupo: un total y CERO gran total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "250" }, { monto: "465" }, { monto: "1800" }, { monto: "280" }, { monto: "1100" }, { monto: "320" }],
    });
    expect(g.gruposConMonto).toBe(1);
    expect(g.servicios.total).toEqual({ min: 4215, max: 4215 });
    expect(g.licencias.total).toBeNull();
    expect(g.granTotal).toBeNull();
  });

  /* ⚠ Las licencias declaran `recurrencia:"unica"` a propósito: desde el 2026-08-14 una
     licencia SIN declarar es MENSUAL (ver RECURRENCIA_POR_DEFECTO), y ahí el cierre deja de
     ser un gran total y pasa a los dos números. Estos dos casos siguen probando la aritmética
     del gran total, que es lo suyo — el default tiene sus propios tests más abajo. */
  it("dos grupos: subtotal por grupo + gran total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$10,000" }],
      licencias: [{ monto: "$3,600", recurrencia: "unica" }],
    });
    expect(g.gruposConMonto).toBe(2);
    expect(g.servicios.total).toEqual({ min: 10000, max: 10000 });
    expect(g.licencias.total).toEqual({ min: 3600, max: 3600 });
    expect(g.granTotal).toEqual({ min: 13600, max: 13600 });
  });

  it("los rangos se propagan al gran total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$5,600–6,650" }],
      licencias: [{ monto: "$1,000", recurrencia: "unica" }],
    });
    expect(g.granTotal).toEqual({ min: 6600, max: 7650 });
  });

  it("los pendientes se cuentan por grupo y en total, para poder avisarlos", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$10,000" }, { monto: "Included" }],
      licencias: [{ monto: "A definir" }],
    });
    expect(g.servicios.pendientes).toBe(1);
    expect(g.licencias.pendientes).toBe(1);
    expect(g.pendientesTotales).toBe(2);
    // El grupo de licencias no aportó ningún monto → un solo grupo → sin gran total.
    expect(g.gruposConMonto).toBe(1);
    expect(g.granTotal).toBeNull();
  });

  it("extras y recurrentes NUNCA entran a ningún total", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$1,000" }],
      extras: [{ monto: "$5,000" }],
      recurrentes: [{ monto: "$450" }],
    });
    expect(g.servicios.total).toEqual({ min: 1000, max: 1000 });
    expect(g.granTotal).toBeNull();
  });
});

describe("la conversión es segura para lo que el cliente YA vio", () => {
  /* ⚠ EL test de esta tanda. Los 3 BusinessCase publicados con shape legacy (CLARK, Color
     Solution, Areya) tienen exactamente estos montos. Proyectarlos a la tabla NO puede hacer
     aparecer un total que el prospecto no haya visto — con el parser estricto ninguno suma. */
  it("los montos reales de las 3 publicadas NO ganan ningún total", () => {
    const reales = [
      "A definir en propuesta formal",
      "A confirmar con descuento negociado por Smarteam ante HubSpot",
      "~$2,000/mes (precio de lista referencial)",
      "To be defined in formal proposal",
    ];
    for (const monto of reales) {
      const g = gruposDeInversion(
        adoptarShapeNuevo({ implementacion: { monto }, licenciasHubspot: { monto } }),
      );
      expect(g.gruposConMonto, monto).toBe(0);
      expect(g.servicios.total, monto).toBeNull();
      expect(g.licencias.total, monto).toBeNull();
      expect(g.granTotal, monto).toBeNull();
    }
  });

  it("los rótulos se pueden traducir sin perder el calificador anual", () => {
    const out = adoptarShapeNuevo(legacyReal, {
      servicios: "Smarteam implementation",
      licencias: "HubSpot licenses / year",
    });
    expect(out.lineas?.[0].concepto).toBe("Smarteam implementation");
    // El "/ año" del rótulo histórico es lo ÚNICO que decía que ese precio es anual, en una
    // sección que ahora lo suma con un CapEx único.
    expect(out.licencias?.[0].concepto).toBe("HubSpot licenses / year");
  });

  /* El render proyecta en CADA pasada. Sin idempotencia, una segunda aplicación borraría las
     líneas ya convertidas. */
  it("es IDEMPOTENTE y no deja keys legacy", () => {
    const una = adoptarShapeNuevo(legacyReal);
    expect(adoptarShapeNuevo(una)).toEqual(una);
    expect(una.licenciasHubspot).toBeUndefined();
    expect(una.implementacion).toBeUndefined();
  });
});

describe("moneda efectiva: la guarda anti-mezcla también sin moneda de sección", () => {
  it("sin moneda declarada, la deducen las líneas", () => {
    const g = gruposDeInversion({ lineas: [{ monto: "₡1.500.000" }] });
    expect(g.moneda).toBe("CRC");
    expect(g.servicios.total).toEqual({ min: 1500000, max: 1500000 });
  });

  /* ⚠ Sin esto se sumaban colones con dólares (1.500.000 + 7.500 = 1.507.500), porque la
     guarda de `parseMonto` vive dentro de `if (codigoSeccion)` y NINGUNA sección vieja de
     HubSpot declara moneda. Es el único error de la sección que inventa un número. */
  it("monedas contradictorias sin moneda de sección: NO se suman", () => {
    const g = gruposDeInversion({
      lineas: [{ monto: "USD $7.500" }],
      licencias: [{ monto: "₡1.500.000" }],
    });
    expect(g.moneda).toBe("");
    expect(g.servicios.total).toBeNull();
    expect(g.licencias.total).toBeNull();
    expect(g.granTotal).toBeNull();
    expect(g.pendientesTotales).toBe(2);
  });

  it("la moneda DECLARADA gana sobre la deducida", () => {
    expect(gruposDeInversion({ moneda: "USD", lineas: [{ monto: "₡500" }] }).moneda).toBe("USD");
  });

  it("los casos normales conservan la moneda de siempre", () => {
    expect(gruposDeInversion({ moneda: "USD", lineas: [{ monto: "$1,000" }] }).moneda).toBe("USD");
    expect(gruposDeInversion({ lineas: [{ monto: "1000" }] }).moneda).toBe("");
  });
});

describe("licencias por Hub: una línea por lo que se vendió arriba", () => {
  it("siembra una línea por Hub, con el rótulo del producto y SIN monto", () => {
    const out = sembrarLicenciasIniciales({ licencias: [] }, ["marketing_hub", "sales_hub"]);
    expect(out.licencias).toEqual([
      { hub: "marketing_hub", concepto: "Marketing Hub", monto: "", detalle: "" },
      { hub: "sales_hub", concepto: "Sales Hub", monto: "", detalle: "" },
    ]);
  });

  /* ⚠ Sembrar no puede mover un centavo: `parseMonto("")` es null ⇒ la línea no suma, no
     cuenta como pendiente y no enciende el gran total. */
  it("sembrar NO mueve ningún total", () => {
    const antes = { moneda: "USD", lineas: [{ monto: "$10,000" }], licencias: [] };
    const despues = sembrarLicenciasIniciales(antes, ["marketing_hub", "sales_hub"]);
    const a = gruposDeInversion(antes);
    const b = gruposDeInversion(despues);
    expect(b.granTotal).toEqual(a.granTotal);
    expect(b.gruposConMonto).toBe(a.gruposConMonto);
    expect(b.pendientesTotales).toBe(a.pendientesTotales);
  });

  /* Los tres frenos. Cada uno cierra un modo de falla medido contra la base real. */
  it("NO toca el shape legacy (perdería los montos históricos, sin camino de recuperación)", () => {
    const out = sembrarLicenciasIniciales(legacyReal, ["sales_hub"]);
    expect(out).toBe(legacyReal);
    expect(esInversionLegacy(out)).toBe(true);
  });

  it("NO toca un grupo que ya tiene algo escrito (resucitaría en cada Generar)", () => {
    const data = { licencias: [{ concepto: "Licencias HubSpot / año", monto: "A definir" }] };
    expect(sembrarLicenciasIniciales(data, ["sales_hub"])).toBe(data);
  });

  it("sin vendidos no adivina", () => {
    const data = { licencias: [] };
    expect(sembrarLicenciasIniciales(data, [])).toBe(data);
  });

  it("es idempotente: la segunda pasada devuelve el MISMO objeto", () => {
    const una = sembrarLicenciasIniciales({ licencias: [] }, ["sales_hub"]);
    expect(sembrarLicenciasIniciales(una, ["sales_hub"])).toBe(una);
  });
});

describe("conciliarLicenciasHub: qué falta y qué sobra", () => {
  const conLineas = {
    licencias: [
      { hub: "sales_hub", concepto: "Sales Hub", monto: "$3,600" },
      { hub: "service_hub", concepto: "Service Hub", monto: "" },
      { concepto: "Licencias HubSpot / año", monto: "A definir" }, // sin hub: de un tercero
    ],
  };

  it("faltan los vendidos sin línea propia", () => {
    expect(conciliarLicenciasHub(conLineas.licencias, ["sales_hub", "marketing_hub"]).faltan)
      .toEqual(["marketing_hub"]);
  });

  it("sobran las que ya no están vendidas — pero la línea NO se toca, solo se avisa", () => {
    expect(conciliarLicenciasHub(conLineas.licencias, ["sales_hub"]).sobran).toEqual(["service_hub"]);
  });

  it("cuenta las líneas de Hub sin monto e IGNORA las que no son un Hub", () => {
    const r = conciliarLicenciasHub(conLineas.licencias, ["sales_hub", "service_hub"]);
    expect(r.sinMonto).toBe(1); // service_hub; la genérica sin `hub` no cuenta
    expect(r.faltan).toEqual([]);
    expect(r.sobran).toEqual([]);
  });

  it("un alias muerto se resuelve por el catálogo", () => {
    // `operations_hub` es un slug histórico que el catálogo mapea a `data_hub`.
    const r = conciliarLicenciasHub([{ hub: "operations_hub" }], ["data_hub"]);
    expect(r.faltan).toEqual([]);
    expect(r.sobran).toEqual([]);
  });
});

describe("licenciasDeHubSinMonto: el freno de publicación", () => {
  it("detecta la línea sembrada que nadie coteó", () => {
    expect(
      licenciasDeHubSinMonto({ licencias: [{ hub: "sales_hub", concepto: "Sales Hub", monto: "" }] }),
    ).toEqual(["Sales Hub"]);
  });

  it("ignora la de un tercero sin monto (no la sembramos nosotros)", () => {
    expect(licenciasDeHubSinMonto({ licencias: [{ concepto: "Zapier", monto: "" }] })).toEqual([]);
  });

  it("con monto no molesta", () => {
    expect(
      licenciasDeHubSinMonto({ licencias: [{ hub: "sales_hub", concepto: "Sales Hub", monto: "$1" }] }),
    ).toEqual([]);
  });

  it("cae al rótulo del catálogo si el concepto quedó vacío, y tolera basura", () => {
    expect(licenciasDeHubSinMonto({ licencias: [{ hub: "data_hub", concepto: "" }] })).toEqual(["Data Hub"]);
    expect(licenciasDeHubSinMonto(null)).toEqual([]);
    expect(licenciasDeHubSinMonto({ licencias: "x" })).toEqual([]);
  });
});

describe("la línea como renglón de cotización: cantidad × precio − descuento", () => {
  it("multiplica y descuenta", () => {
    const m = montoDeLinea({ cantidad: "3", precioUnitario: "$1,500", descuento: "15%" }, "USD");
    expect(m.rango).toEqual({ min: 3825, max: 3825 }); // 4500 − 15%
    expect(m.calculada).toBe(true);
    expect(m.unitario).toEqual({ min: 1500, max: 1500 });
    expect(m.cantidad).toBe(3);
  });

  it("sin cantidad es 1, sin descuento es el bruto", () => {
    expect(montoDeLinea({ precioUnitario: "$800" }, "USD").rango).toEqual({ min: 800, max: 800 });
  });

  it("el descuento fijo se resta después de multiplicar", () => {
    expect(montoDeLinea({ cantidad: "2", precioUnitario: "500", descuento: "$150" }, "USD").rango)
      .toEqual({ min: 850, max: 850 });
  });

  /* ⚠ EL camino de todo lo publicado: ninguna línea tiene `precioUnitario`, así que el importe
     sigue saliendo de `monto` y el render no se mueve un pixel. */
  it("sin precio unitario cae al `monto` de siempre", () => {
    const m = montoDeLinea({ monto: "$10,000" }, "USD");
    expect(m.rango).toEqual({ min: 10000, max: 10000 });
    expect(m.calculada).toBe(false);
    expect(m.unitario).toBeNull();
  });

  it("con los dos escritos manda el precio unitario", () => {
    // El calculado es el que el cliente puede recalcular mirando la fila; el `monto` viejo
    // quedaría contradiciendo a la aritmética que tiene delante.
    expect(montoDeLinea({ precioUnitario: "100", cantidad: "2", monto: "$999" }, "USD").rango)
      .toEqual({ min: 200, max: 200 });
  });

  it("un descuento ilegible ensucia la línea ENTERA", () => {
    const m = montoDeLinea({ precioUnitario: "$1,000", descuento: "el negociado" }, "USD");
    expect(m.sucio).toBe(true);
    expect(m.rango).toBeNull(); // sumarla sin el descuento mostraría un precio que nadie acordó
  });

  it("un precio en otra moneda no suma", () => {
    expect(montoDeLinea({ precioUnitario: "₡500.000" }, "USD").sucio).toBe(true);
  });

  it("el rango se propaga por la multiplicación y el descuento", () => {
    expect(montoDeLinea({ cantidad: "2", precioUnitario: "$100–150", descuento: "10%" }, "USD").rango)
      .toEqual({ min: 180, max: 270 });
  });
});

describe("contrato mensual ↔ anual", () => {
  /* Recurrente: el plazo SOLO mueve lo que se cobra todos los meses. */
  const linea = { cantidad: "2", precioUnitario: "$50", precioAnual: "$500", recurrencia: "mensual" };

  it("mensual usa el precio mensual", () => {
    expect(montoDeLinea(linea, "USD", "mensual").rango).toEqual({ min: 100, max: 100 });
  });

  it("anual usa el precio anual ESCRITO, no el ×12", () => {
    // Es el caso real: el anual viene con descuento de HubSpot, no es 12 × el mensual.
    expect(montoDeLinea(linea, "USD", "anual").rango).toEqual({ min: 1000, max: 1000 });
  });

  it("sin precio anual escrito, deriva ×12 en vez de vaciarse", () => {
    const m = montoDeLinea({ cantidad: "2", precioUnitario: "$50", recurrencia: "mensual" }, "USD", "anual");
    expect(m.rango).toEqual({ min: 1200, max: 1200 });
    expect(m.unitario).toEqual({ min: 600, max: 600 });
  });

  it("el descuento de la línea se aplica sobre el plazo elegido", () => {
    expect(montoDeLinea({ precioUnitario: "$100", descuento: "10%", recurrencia: "mensual" }, "USD", "anual").rango)
      .toEqual({ min: 1080, max: 1080 }); // 1200 − 10%
  });

  /* El error que este test cazó ANTES de que existiera la UI: el ×12 se le aplicaba también
     al cobro único, así que una implementación de $12.000 salía a $144.000 en la propuesta de
     un cliente con solo mover un switch. */
  it("un cobro ÚNICO no se multiplica por el plazo", () => {
    const impl = { precioUnitario: "$12,000" };
    expect(montoDeLinea(impl, "USD", "anual").rango).toEqual(montoDeLinea(impl, "USD", "mensual").rango);
  });

  it("`contratoDe` cae a mensual salvo que diga anual", () => {
    expect(contratoDe({ contrato: "anual" })).toBe("anual");
    expect(contratoDe({ contrato: "" })).toBe("mensual");
    expect(contratoDe({})).toBe("mensual");
    expect(contratoDe(null)).toBe("mensual");
  });
});

describe("el check por línea: prender y apagar en vivo", () => {
  const base: InversionData = {
    moneda: "USD",
    lineas: [{ concepto: "Setup", precioUnitario: "$5,000" }],
    licencias: [
      { concepto: "Marketing Hub", precioUnitario: "$800", cantidad: "1" },
      { concepto: "Sales Hub", precioUnitario: "$300", cantidad: "1" },
    ],
  };

  it("una línea apagada no suma", () => {
    const off = { ...base, licencias: [base.licencias![0], { ...base.licencias![1], activa: "no" }] };
    expect(gruposDeInversion(base).licencias.total).toEqual({ min: 1100, max: 1100 });
    expect(gruposDeInversion(off).licencias.total).toEqual({ min: 800, max: 800 });
  });

  it("apagar TODO el grupo lo deja sin total, no en cero", () => {
    const off = { ...base, licencias: base.licencias!.map((l) => ({ ...l, activa: "no" })) };
    // Un cero es una afirmación ("esto vale 0"); sin total es la verdad ("no hay nada activo").
    expect(gruposDeInversion(off).licencias.total).toBeNull();
    expect(gruposDeInversion(off).granTotal).toBeNull();
  });

  it("una línea apagada tampoco cuenta como pendiente", () => {
    const off = { moneda: "USD", licencias: [{ concepto: "x", monto: "A definir", activa: "no" }] };
    expect(gruposDeInversion(off).pendientesTotales).toBe(0);
  });

  it("`esLineaActiva`: solo el 'no' explícito apaga", () => {
    expect(esLineaActiva({})).toBe(true);
    expect(esLineaActiva({ activa: "" })).toBe(true);
    expect(esLineaActiva({ activa: "si" })).toBe(true);
    expect(esLineaActiva({ activa: "no" })).toBe(false);
    expect(esLineaActiva({ activa: " NO " })).toBe(false);
  });
});

describe("cobro único vs recurrente: dos números que sí se pueden firmar", () => {
  const mixta: InversionData = {
    moneda: "USD",
    lineas: [{ concepto: "Implementación", precioUnitario: "$12,000" }],
    licencias: [{ concepto: "Marketing Hub", precioUnitario: "$800", recurrencia: "mensual" }],
  };

  it("con una línea recurrente el gran total se APAGA", () => {
    const g = gruposDeInversion(mixta);
    // Sumar un CapEx con una mensualidad da un número que no existe en ningún contrato.
    expect(g.granTotal).toBeNull();
    expect(g.hayRecurrentes).toBe(true);
    expect(g.unico).toEqual({ min: 12000, max: 12000 });
    expect(g.recurrente).toEqual({ min: 800, max: 800 });
  });

  it("el eje atraviesa los DOS grupos", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [
        { concepto: "Setup", precioUnitario: "$5,000" },
        { concepto: "Soporte", precioUnitario: "$400", recurrencia: "mensual" },
      ],
      licencias: [
        { concepto: "Hub", precioUnitario: "$800", recurrencia: "mensual" },
        // Un onboarding de HubSpot es cobro ÚNICO aunque viva en licencias: por eso se
        // declara. Sin declararlo caería en el default del grupo, que es mensual.
        { concepto: "Onboarding HubSpot", precioUnitario: "$1,500", recurrencia: "unica" },
      ],
    });
    expect(g.unico).toEqual({ min: 6500, max: 6500 });
    expect(g.recurrente).toEqual({ min: 1200, max: 1200 });
  });

  it("el contrato anual mueve SOLO lo recurrente", () => {
    const g = gruposDeInversion({ ...mixta, contrato: "anual" });
    expect(g.unico).toEqual({ min: 12000, max: 12000 }); // la implementación no se multiplica
    expect(g.recurrente).toEqual({ min: 9600, max: 9600 }); // 800 × 12
    expect(g.contrato).toBe("anual");
  });

  /* ⚠ EL default por GRUPO (2026-08-14). Reemplaza al test de compatibilidad anterior —que
     afirmaba que una licencia sin declarar era cobro único— porque esa regla CAMBIÓ por
     pedido de Elías: una licencia de HubSpot es una suscripción. Se midió antes de aplicarlo:
     de las 7 propuestas publicadas, 3 pasan del gran total a los dos números (REMPRO
     $35,900 + $1,450/mes · AVELEC $13,100 + $3,130/mes · Prodex $17,750 + $450/mes) y las 4
     restantes no mueven un número porque sus montos son texto libre. */
  it("una licencia SIN declarar recurrencia es mensual; un servicio, único", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$10,000" }],
      licencias: [{ monto: "$3,600" }],
    });
    expect(g.hayRecurrentes).toBe(true);
    expect(g.granTotal).toBeNull(); // un CapEx y una mensualidad no se suman
    expect(g.unico).toEqual({ min: 10000, max: 10000 });
    expect(g.recurrente).toEqual({ min: 3600, max: 3600 });
  });

  it("declarar `unica` en la licencia devuelve el cierre clásico", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [{ monto: "$10,000" }],
      licencias: [{ monto: "$3,600", recurrencia: "unica" }],
    });
    expect(g.hayRecurrentes).toBe(false);
    expect(g.granTotal).toEqual({ min: 13600, max: 13600 });
    expect(g.unico).toBeNull();
    expect(g.recurrente).toBeNull();
  });

  it("el default se RESUELVE en los grupos que salen: la fila lee lo mismo que el total", () => {
    const g = gruposDeInversion({ moneda: "USD", licencias: [{ monto: "$100" }], lineas: [{ monto: "$1" }] });
    expect(g.licencias.lineas[0].recurrencia).toBe("mensual");
    expect(g.servicios.lineas[0].recurrencia).toBe("unica");
  });

  it("apagar la única recurrente devuelve el cierre simple", () => {
    const g = gruposDeInversion({
      ...mixta,
      licencias: [{ ...mixta.licencias![0], activa: "no" }],
    });
    expect(g.hayRecurrentes).toBe(false);
    expect(g.granTotal).toBeNull(); // un solo grupo con monto → un solo total, la píldora
    expect(g.servicios.total).toEqual({ min: 12000, max: 12000 });
  });
});

describe("la rebaja: el descuento se VE, no se aplica en silencio", () => {
  /* Antes el descuento bajaba el número y ahí terminaba la historia: el cliente veía un
     importe más chico sin poder verificar la resta, que es lo único que una línea de
     cotización tiene que permitir. `bruto` + `descuento` son lo que la celda pinta como
     "tag + precio de lista tachado" arriba del monto final. */
  it("con descuento en % expone el bruto y el descuento leído", () => {
    const m = montoDeLinea({ cantidad: "2", precioUnitario: "$400", descuento: "15%" }, "USD");
    expect(m.bruto).toEqual({ min: 800, max: 800 });
    expect(m.rango).toEqual({ min: 680, max: 680 });
    expect(m.descuento).toEqual({ tipo: "pct", valor: 15 });
  });

  it("con descuento en monto, la resta es sobre el TOTAL de la línea", () => {
    const m = montoDeLinea({ cantidad: "3", precioUnitario: "$100", descuento: "$50" }, "USD");
    expect(m.bruto).toEqual({ min: 300, max: 300 });
    expect(m.rango).toEqual({ min: 250, max: 250 });
  });

  it("sin descuento NO hay bruto: tachar un precio que no cambió es teatro", () => {
    const m = montoDeLinea({ precioUnitario: "$400" }, "USD");
    expect(m.bruto).toBeNull();
    expect(m.descuento).toBeNull();
  });

  it("un descuento ILEGIBLE no pinta rebaja — ensucia la línea", () => {
    const m = montoDeLinea({ precioUnitario: "$400", descuento: "a negociar" }, "USD");
    expect(m.sucio).toBe(true);
    expect(m.bruto).toBeNull();
    expect(m.descuento).toBeNull();
  });

  it("el tag sale del descuento LEÍDO, no del texto crudo", () => {
    expect(textoDescuento({ tipo: "pct", valor: 15 })).toBe("−15%");
    expect(textoDescuento({ tipo: "monto", valor: 200 }, "USD")).toBe("−$200");
  });
});

describe("adoptarRecurrentes: el card mensual baja a la tabla", () => {
  it("cada fila con contenido pasa a licencias marcada mensual", () => {
    const d = adoptarRecurrentes<InversionData>({
      lineas: [{ concepto: "Implementación", monto: "$12,000" }],
      recurrentes: [{ concepto: "Licencia Content Hub", monto: "$450 USD", detalle: "mensual" }],
    });
    expect(d.recurrentes).toBeUndefined();
    expect(d.licencias).toEqual([
      { concepto: "Licencia Content Hub", monto: "$450 USD", detalle: "mensual", recurrencia: "mensual" },
    ]);
    expect(d.lineas).toHaveLength(1); // los servicios no se tocan
  });

  it("conserva las licencias que ya había y respeta el orden", () => {
    const d = adoptarRecurrentes<InversionData>({
      licencias: [{ concepto: "Sales Hub", monto: "$800" }],
      recurrentes: [{ concepto: "Soporte", monto: "$300" }],
    });
    expect(d.licencias?.map((l) => l.concepto)).toEqual(["Sales Hub", "Soporte"]);
  });

  it("las filas VACÍAS se descartan sin dejar rastro", () => {
    const d = adoptarRecurrentes<InversionData>({ recurrentes: [{ concepto: "", monto: "", detalle: "" }] });
    expect(d.recurrentes).toBeUndefined();
    expect(d.licencias ?? []).toEqual([]);
  });

  it("es idempotente y no toca lo que no tiene recurrentes", () => {
    const base: InversionData = { lineas: [{ monto: "$1" }] };
    expect(adoptarRecurrentes(base)).toBe(base);
    const una = adoptarRecurrentes<InversionData>({ recurrentes: [{ concepto: "X", monto: "$5" }] });
    expect(adoptarRecurrentes(una)).toEqual(una);
  });
});

describe("el plazo mueve también los montos de TEXTO LIBRE", () => {
  /* El bug que reportó Elías: casi todas las líneas escritas a mano tienen `monto` y no
     `precioUnitario`, y el ×12 vivía SOLO en la rama calculada — mover el switch a "Anual"
     no cambiaba un número y el control se veía roto. */
  it("una línea mensual con `monto` se multiplica por 12 en contrato anual", () => {
    const data: InversionData = {
      moneda: "USD",
      lineas: [{ concepto: "Saas", monto: "4000", recurrencia: "mensual" }],
      contrato: "anual",
    };
    expect(gruposDeInversion(data).recurrente).toEqual({ min: 48000, max: 48000 });
  });

  it("una línea de cobro ÚNICO con `monto` NO se multiplica", () => {
    const data: InversionData = {
      moneda: "USD",
      lineas: [
        { concepto: "Implementación", monto: "12000" },
        { concepto: "Saas", monto: "1000", recurrencia: "mensual" },
      ],
      contrato: "anual",
    };
    const g = gruposDeInversion(data);
    expect(g.unico).toEqual({ min: 12000, max: 12000 });
    expect(g.recurrente).toEqual({ min: 12000, max: 12000 });
  });

  it("si Ventas escribió el precio anual, ÉSE manda sobre el ×12", () => {
    const data: InversionData = {
      moneda: "USD",
      lineas: [{ monto: "1000", precioAnual: "$10,000", recurrencia: "mensual" }],
      contrato: "anual",
    };
    expect(gruposDeInversion(data).recurrente).toEqual({ min: 10000, max: 10000 });
  });

  it("en contrato mensual el monto libre no se toca", () => {
    const data: InversionData = { moneda: "USD", lineas: [{ monto: "4000", recurrencia: "mensual" }] };
    expect(gruposDeInversion(data).recurrente).toEqual({ min: 4000, max: 4000 });
  });
});

describe("precioDesdeMonto: el camino inverso, para que los dos campos sean uno", () => {
  it("sin descuento y una unidad, el precio ES el monto", () => {
    expect(precioDesdeMonto({ min: 4000, max: 4000 }, 1, null)).toEqual({ min: 4000, max: 4000 });
  });

  it("reparte por cantidad", () => {
    expect(precioDesdeMonto({ min: 900, max: 900 }, 3, null)).toEqual({ min: 300, max: 300 });
  });

  it("deshace el porcentaje: 85 con −15% vuelve a 100", () => {
    expect(precioDesdeMonto({ min: 85, max: 85 }, 1, { tipo: "pct", valor: 15 })).toEqual({ min: 100, max: 100 });
  });

  it("deshace el descuento fijo ANTES de repartir por cantidad", () => {
    expect(precioDesdeMonto({ min: 250, max: 250 }, 3, { tipo: "monto", valor: 50 })).toEqual({ min: 100, max: 100 });
  });

  it("un rango se invierte por los dos extremos", () => {
    expect(precioDesdeMonto({ min: 170, max: 340 }, 2, { tipo: "pct", valor: 15 })).toEqual({ min: 100, max: 200 });
  });

  it("ida y vuelta: montoDeLinea → precioDesdeMonto devuelve el precio original", () => {
    const l = { cantidad: "2", precioUnitario: "$400", descuento: "15%" };
    const m = montoDeLinea(l, "USD");
    expect(precioDesdeMonto(m.rango!, m.cantidad, m.descuento)).toEqual({ min: 400, max: 400 });
  });

  it("un descuento del 100% NO se invierte: cualquier precio da el mismo neto", () => {
    expect(precioDesdeMonto({ min: 0, max: 0 }, 1, { tipo: "pct", valor: 100 })).toBeNull();
  });
});

/**
 * ── EL DESCUENTO SOBRE UN MONTO DE TEXTO LIBRE (2026-08-21) ──────────────────
 *
 * El bug que esto cierra, reportado por Elías sobre una propuesta REAL y publicada: la
 * casilla del descuento aceptaba "20%" en una línea con `monto` escrito a mano y NO HACÍA
 * NADA. Sin ⚠, sin tag, sin mover el total — y así salió al cliente. Pasaba porque el
 * descuento vivía solo en la rama calculada (`cantidad × precioUnitario`), y una línea nace
 * de la otra forma: se tipea el importe y listo.
 *
 * La regla nueva: con descuento, el `monto` se lee como PRECIO DE LISTA de la línea. Es
 * cálculo de LECTURA, no adopción — borrar el descuento devuelve el monto original en el
 * acto, que fue el pedido explícito ("que sea real time").
 */
describe("el descuento también sobre un monto de texto libre", () => {
  it("resta sobre el monto y deja el bruto para tachar", () => {
    const m = montoDeLinea({ monto: "$1,500", descuento: "20%" }, "USD");
    expect(m.rango).toEqual({ min: 1200, max: 1200 });
    expect(m.bruto).toEqual({ min: 1500, max: 1500 });
    expect(m.descuento).toEqual({ tipo: "pct", valor: 20 });
    // NO es "calculada": no hay cantidad × precio. El importe salió del monto.
    expect(m.calculada).toBe(false);
  });

  it("es REAL TIME: sin descuento vuelve el monto original, sin tag ni tachado", () => {
    const sinDcto = montoDeLinea({ monto: "$1,500", descuento: "" }, "USD");
    expect(sinDcto.rango).toEqual({ min: 1500, max: 1500 });
    expect(sinDcto.bruto).toBeNull();
    expect(sinDcto.descuento).toBeNull();
  });

  it("descuento fijo y piso en cero", () => {
    expect(montoDeLinea({ monto: "$1,500", descuento: "$500" }, "USD").rango).toEqual({ min: 1000, max: 1000 });
    expect(montoDeLinea({ monto: "$300", descuento: "$500" }, "USD").rango).toEqual({ min: 0, max: 0 });
  });

  it("un rango se descuenta por los dos extremos", () => {
    expect(montoDeLinea({ monto: "$1,000–2,000", descuento: "10%" }, "USD").rango).toEqual({ min: 900, max: 1800 });
  });

  it("un descuento ilegible ensucia la línea entera (no suma y se ve el ⚠)", () => {
    for (const d of ["120%", "a convenir", "₡5.000"]) {
      const m = montoDeLinea({ monto: "$1,500", descuento: d }, "USD");
      expect(m.sucio, `descuento "${d}"`).toBe(true);
      expect(m.rango).toBeNull();
    }
  });

  /* ⚠ LA GARANTÍA QUE NO SE PUEDE ROMPER. En esta rama el `monto` es el total de la LÍNEA,
     no un precio por unidad: si la cantidad multiplicara, toda línea publicada con una
     cantidad escrita estrenaría un número nuevo. */
  it("la cantidad NO multiplica el monto de texto libre", () => {
    expect(montoDeLinea({ cantidad: "3", monto: "$1,500", descuento: "20%" }, "USD").rango)
      .toEqual({ min: 1200, max: 1200 });
  });

  it("el precio de lista sigue mandando sobre el monto", () => {
    const m = montoDeLinea({ cantidad: "2", precioUnitario: "$400", monto: "$99", descuento: "15%" }, "USD");
    expect(m.calculada).toBe(true);
    expect(m.rango).toEqual({ min: 680, max: 680 });
  });

  it("contrato ANUAL: primero el ×12, después el descuento", () => {
    const l = { monto: "$100", descuento: "10%", recurrencia: "mensual" };
    expect(montoDeLinea(l, "USD", "mensual").rango).toEqual({ min: 90, max: 90 });
    expect(montoDeLinea(l, "USD", "anual").rango).toEqual({ min: 1080, max: 1080 });
    expect(montoDeLinea(l, "USD", "anual").bruto).toEqual({ min: 1200, max: 1200 });
  });

  it("contrato ANUAL con precio anual escrito: ése es la base del descuento", () => {
    const l = { monto: "$100", precioAnual: "$1,000", descuento: "10%", recurrencia: "mensual" };
    expect(montoDeLinea(l, "USD", "anual").rango).toEqual({ min: 900, max: 900 });
  });

  it("un cobro ÚNICO no se multiplica por 12 aunque el contrato sea anual", () => {
    const l = { monto: "$1,500", descuento: "20%", recurrencia: "unica" };
    expect(montoDeLinea(l, "USD", "anual").rango).toEqual({ min: 1200, max: 1200 });
  });

  it("el total del grupo ya viene descontado", () => {
    const g = gruposDeInversion({
      moneda: "USD",
      lineas: [
        { concepto: "Implementación", monto: "$3,000", recurrencia: "unica" },
        { concepto: "Blog en HubSpot", monto: "$1,500", descuento: "20%", recurrencia: "unica" },
      ],
    });
    expect(g.servicios.total).toEqual({ min: 4200, max: 4200 });
    expect(g.servicios.pendientes).toBe(0);
  });
});

/**
 * La ida y vuelta del importe en una línea de MONTO LIBRE con descuento. Es el camino que
 * recorre el editor cuando Ventas corrige el número de la derecha (`escribirMonto`), y el que
 * devolvía basura mientras `montoDeLinea` reportaba `cantidad: 1` en esta rama: una línea con
 * "3" escrito se convertía en 3 × el importe entero al primer retoque.
 */
describe("monto libre + descuento: la cantidad se reporta para poder invertir", () => {
  it("reporta la cantidad escrita aunque no multiplique", () => {
    const m = montoDeLinea({ cantidad: "3", monto: "$1,500", descuento: "20%" }, "USD");
    expect(m.cantidad).toBe(3);
    expect(m.rango).toEqual({ min: 1200, max: 1200 }); // sigue sin multiplicar
  });

  it("invertir el importe da un precio unitario coherente con la cantidad", () => {
    const m = montoDeLinea({ cantidad: "3", monto: "$1,500", descuento: "20%" }, "USD");
    const unit = precioDesdeMonto(m.rango!, m.cantidad, m.descuento);
    expect(unit).toEqual({ min: 500, max: 500 });
    // Y al volver por el camino normal, la línea calculada da el MISMO importe.
    const yaCalculada = montoDeLinea({ cantidad: "3", precioUnitario: "$500", descuento: "20%" }, "USD");
    expect(yaCalculada.rango).toEqual({ min: 1200, max: 1200 });
  });
});
