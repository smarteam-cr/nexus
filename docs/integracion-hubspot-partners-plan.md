# HubSpot como partner (Client Partners) — plan

> Pedido de Elías del 2026-10-24: el mismo ejercicio que con la integración de HubSpot, pero con lo que HubSpot le da a
> Smarteam como partner sobre sus clientes, para ver toda la información disponible y cómo enriquece a Nexus. Investigado
> el 24 oct contra el código, la base en solo lectura y la documentación oficial. **Nada construido.** En el roadmap son
> U25 a U31.

## Lo que hace Nexus hoy

- **Ya copia casi todo lo que HubSpot comparte** (`lib/hubspot/partner-clients.ts`), con el token OAuth del sistema y el
  permiso opcional `crm.objects.partner-clients.read`. Llama a tres endpoints:
  - las 178 propiedades del objeto `partner_clients`;
  - la búsqueda, de 100 en 100;
  - las empresas asociadas, por la API v4.
- **Cuándo corre:** el job `cs-partner-daily`, de lunes a viernes desde las 6 a. m. de Costa Rica. Se enciende con
  `CS_PARTNER_SYNC_ENABLED=1` o `CS_WATCHDOG_ENABLED=1`.
- **Qué guarda:**
  - `ClientPartnerSnapshot`: el registro crudo completo, más unos 40 campos en columnas (uso, asientos, MRR,
    renovaciones, ediciones, el CSM de HubSpot, el enlace al portal);
  - `PartnerUsageSnapshot`: el uso semana a semana.
- **Lo que ya se lee del crudo** (`lib/cs/lectura-partner.ts`): los créditos, los envíos de correo, el nivel de uso, el
  cambio al renovar, las apps y la **comisión proyectada**, que hoy solo se ve en la cartera de Customer Success.

**Medido en producción el 24 oct:**

| Qué | Valor |
|---|---|
| Registros copiados | 168 (el último, del 23 oct) |
| Vinculados a una empresa de Nexus | 149; de la cartera, 147 de 163 clientes |
| Gestionados por Smarteam | 52 |
| MRR total | US$131.541 en 50 registros |
| Renuevan en 90 días | 8 |
| Comisión proyectada | US$18.240: 13.072 de 29 gestionadas y 5.168 de 15 no gestionadas |
| Historial de uso | 654 filas, pero solo 4 semanas distintas entre la 28 y la 43 |

**Lo que está en la copia y nadie usa:**
- La comisión: en Finanzas se carga a mano (`ComisionPartner`). Para el 15 de noviembre hay US$51.000 estimados a mano.
  US$18.240 × 3 = 54.720 por trimestre, así que la comisión proyectada probablemente es mensual. No está confirmado en
  la documentación.
- Lo vendido (`hs_sold_mrr`, en 44 registros, US$91.134, y `hs_sold_product_lines`, en 88).
- Las fechas de la relación: el inicio y el fin de la relación vendida (el fin, en 68 registros) y el inicio de la
  gestionada.
- El MRR por hub, que solo lee `lib/cs/licencias.ts`.

**Las tres «licencias» de Nexus son cosas distintas:**
- `LicenciaCliente`: lo cargado a mano por hub. Tiene 0 filas.
- `LicenciaRevendida`: el contrato que revende la licencia (alimenta «Punto de equilibrio › Licencias revendidas»).
  Tiene 2.
- La lectura de Partner: lo que HubSpot dice que paga cada cuenta.

Nada las cruza hoy.

## Lo que permiten las APIs (verificado en la documentación oficial)

- **Partner Clients** (`/crm/v3/objects/partner_clients`, y la ruta nueva `/crm/objects/2026-03/partner_clients`):
  - se puede leer y actualizar, pero no crear ni borrar;
  - el uso, las suscripciones y los límites llegan solo de las cuentas que Smarteam gestiona;
  - permisos: `.read` y `.write`.
- **Partner Services** (`/crm/objects/2026-03/partner_services`): los servicios que presta el partner. Existe; qué trae
  hay que probarlo. Permiso: `crm.objects.partner-services.read`.
- **Comisiones: no hay API.** El estimado por cuenta está en Partner › Client List, y las liquidaciones trimestrales en
  la app Commissions, solo para Super Admin. Se pagan 45 días después del trimestre: el 15 de febrero, mayo, agosto y
  noviembre.
- **La regla de la comisión:**
  - las ventas desde abril de 2023 pagan 20 % por hasta 3 años;
  - las anteriores siguen pagando solo mientras haya crédito de MRR gestionado;
  - la relación gestionada vence a los 60 días sin trabajo en el portal.
- **Los tratos compartidos** son tratos comunes de tu portal, con campos propios. Ya tienes el permiso
  `crm.objects.deals.read`. Los campos:
  - el MRR de la licencia (`hs_deal_registration_mrr`, con su moneda);
  - los productos;
  - el representante de HubSpot;
  - el número de registros.

  Desde el 1 de octubre de 2026, una compra sin intervención del partner ya no da crédito sin un trato compartido.
- **Información de un portal** (`/account-info/v3/details`, usuarios y uso de la API): solo con el portal de cada
  cliente conectado. Hoy hay 0 conectados.
- **Las rutas `/crm/v3`** siguen andando, pero HubSpot pasó a rutas con fecha (2026-03). El fin de la v3 no tiene fecha
  publicada.

## Decisiones

- **Lo que ya paga cada cliente sale de aquí** (Elías, 24 oct: «eso debería estar en el sitio del cliente»). El TAM v1
  muestra al lado lo que la empresa ya paga y los hubs que le faltan (U27).
- **La comisión estimada sale de HubSpot; la real, de la liquidación.** La liquidación del trimestre se sigue cargando a
  mano: no hay API.
- **Conectar el portal de cada cliente queda fuera por ahora.** Partner ya da los asientos y los límites agregados, y
  conectar cada portal pide la autorización de cada cliente.
- Todo va por el transporte único de HubSpot (U6).

## Etapas

1. **U25 · La comisión de HubSpot sale de HubSpot** (antes del 15 de noviembre).
   - Comprobar que la comisión proyectada es mensual, comparándola con lo cobrado el 15 de agosto.
   - Con eso, la comisión estimada del trimestre se arma sola desde la suma por cuenta, marcada como estimada y con el
     detalle por cuenta. El monto real sigue saliendo de la liquidación.
2. **U27 · Lo que ya paga y los hubs que le faltan** (con R1 y R2, en el paso uno).
   - El TAM v1 muestra el MRR por hub; para las no gestionadas, lo vendido.
   - Los hubs en «none» o que faltan quedan como venta cruzada.
3. **U29 · Pasar a columnas lo que está suelto en el crudo, y un historial sin huecos.**
   - Un SQL aditivo: lo vendido, las fechas de la relación, la comisión y el MRR por hub; la comisión y el MRR también
     en `PartnerUsageSnapshot`.
   - Guardar el detalle de los errores de cada corrida (la última tuvo 10 sin detalle).
4. **U26 · Comisión en riesgo por la relación gestionada** (depende de U25).
   - El aviso de vencimiento suma lo que se pierde al mes si la relación vence: la comisión de una venta anterior a
     abril de 2023, o su MRR gestionado.
5. **U28 · Los tratos compartidos con su licencia.**
   - La copia de tratos suma el MRR de la licencia, los productos, el representante de HubSpot y el número de registros.
   - La comisión esperada: 20 % del MRR por hasta 36 meses. Se cruza con lo vendido cuando la cuenta aparece en Partner.
6. **U30 · El encargado de Nexus pasa al registro de Partner** (depende de U6).
   - Antes, medir cuántas cuentas difieren entre HubSpot y Nexus.
   - Escribir el CSE encargado en el dueño del registro: HubSpot pide asignar la cuenta a una persona para el crédito
     gestionado.
7. **U31 · Probar Partner Services y la ruta nueva.**
   - Una lectura de prueba de `partner_services`: si no trae nada útil, se descarta.
   - Mover la copia a la ruta con fecha, junto con U14.

## Criterio de éxito

- El 15 de noviembre, la comisión estimada por Nexus difiere menos de un 10 % de lo cobrado, y cada cuenta muestra su
  parte.
- Al menos 80 de las 147 cuentas con «ya paga» y la lista de hubs que les faltan.
- 8 semanas seguidas de historial de uso sin huecos.
- 0 diferencias entre el encargado de Nexus y el dueño del registro en las 52 cuentas gestionadas.
- Cada trato ganado del pipeline de venta compartida muestra su MRR de licencia y su comisión esperada.

## Lo que tiene que configurar Elías

- Para U30: declarar `crm.objects.partner-clients.write` como opcional en la app pública y reconectar HubSpot.
- Para U31: lo mismo con `crm.objects.partner-services.read`.

## Riesgos

- Que la comisión proyectada no sea mensual: U25 lo comprueba antes de construir.
- Escribir el dueño del registro cambia lo que HubSpot ve: con simulacro, y primero en 5 cuentas.
- El historial con huecos subestima las tendencias de adopción hasta que U29 lo arregle.
