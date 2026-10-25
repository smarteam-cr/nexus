# La escala con engagement avanzado y los casos de Insider por industria — plan

> Sale del documento de Elías del 2026-10-23: la sesión «Casos de uso por industria» con Insider One (21 oct), más una
> investigación. Se consensuó y se rehízo el mismo día, cruzado contra cuatro cosas: la escala publicada (**8.9.0**), sus
> seis ediciones por industria, el mapa de herramientas (`docs/escala/mapa_de_herramientas.md`) y lo pendiente para la 9.0
> (`docs/escala/pendiente-9-0.md`). **Nada construido.** En el roadmap es el área N (N4 a N7) y el ítem A6.

## Cómo se arma: tres capas

1. **La escala general** solo pide lo que vale para cualquier empresa que trabaja con sus canales digitales. No nombra
   herramientas.
2. **Las ediciones por industria** piden lo propio de cada industria, como criterio de la edición o marcando lo que no
   aplica. Ecommerce y retail, Turismo y Banca ya traen buena parte de lo que mostró Insider: el catálogo, los carritos y
   las solicitudes a medias, las recomendaciones, la búsqueda y la venta de adicionales.
3. **El mapa de herramientas** dice, criterio por criterio, qué herramienta lo habilita: HubSpot, Insider o Smarteam. Su
   regla es «lo habilita, no lo cumple». **Aquí se anclan Insider y HubSpot: a criterios, no a niveles.** Dentro de
   Eficiente, unos criterios los habilita HubSpot, otros Insider, y algunos los dos.

## Qué cambió respecto del borrador

- **Una sola condición nueva: «tráfico suficiente».** «Canal digital propio» no hace falta: la marca «venta sin
  vendedor», que ya existe, cubre a quien compra, reserva o solicita en el sitio o la app. «Oferta en catálogo» tampoco
  hace falta: el catálogo vive en las ediciones que lo necesitan.
- **Ningún criterio lleva dos condiciones,** así que la estructura de la escala casi no cambia: una marca nueva y una
  tercera pregunta del perfil.
- **El catálogo, los carritos y la atención automatizada ya existen:** en las ediciones y en 3.2 (bot y agente con traspaso).
- **La personalización del sitio a cada comprador** va en las ediciones (dimensión 1.6). La 9.0 ya propone acotar 2.6.O3 a
  los mensajes de marketing.
- **Cuatro ajustes caen en temas que la 9.0 ya tenía abiertos** (permiso de contacto, partir 2.7.E1, 1.6.O1, 3.6.E2):
  se escriben juntos, sin duplicar.

## La condición nueva: «tráfico suficiente»

Personalizar a un visitante anónimo y medir con un grupo de control solo funcionan con volumen. HubSpot no personaliza al
anónimo por lo que hace: solo por país, dispositivo, fuente o idioma. Insider sí, con su código en el sitio, y por eso
califica a sus clientes por tráfico. La condición es una **tercera pregunta del perfil** («¿el sitio tiene el tráfico que
pide la calificación?»). El umbral es el de Insider (hay que pedírselo) y queda editable. Si no la cumple, el criterio no
aplica.

## Los cambios, uno por uno

Leyenda:
- **Tipo:** Nuevo, Ajuste (mismo identificador) o Ajuste mínimo.
- **Lo habilita:** según el mapa de herramientas.
- **Con la 9.0:** el tema de `pendiente-9-0.md` con el que se escribe.
- Los identificadores nuevos son tentativos.

### Escala general

| # | Criterio | Nivel | Tipo | Qué diría | Condición | Lo habilita | Con la 9.0 |
|---|---|---|---|---|---|---|---|
| 1 | 2.3.F7 | Funcional (de riesgo) | Ajuste | El permiso de cada contacto está registrado por canal —correo, SMS, WhatsApp, notificaciones— y se respeta en cada envío | — | HubSpot (suscripción por canal) e Insider | Tema 13: riesgo en las tres áreas; decide Funcional solo donde la ley lo exige |
| 2 | 2.3.E4 | Eficiente | Ajuste | Lo que la persona hace en el sitio o la app —qué visita, busca, abandona, compra o reserva— queda en su ficha, también lo que hizo antes de dejar sus datos, que se une al identificarse | — | HubSpot (visitas y eventos; une lo anterior al identificarse) e Insider (todos los eventos) | — |
| 3 | 2.6.E4 | Eficiente | Ajuste | La segmentación usa el comportamiento, no solo lo declarado, **y los segmentos se actualizan solos** | — | HubSpot (listas activas) e Insider | — |
| 4 | 2.7.E1 | Eficiente | Ajuste | La parte «un canal continúa lo que empezó otro» pasa a «al menos tres canales se coordinan en un mismo recorrido, con un límite de frecuencia y respetando el permiso de cada canal» | — | Insider (con push); HubSpot en parte (correo, SMS y WhatsApp) | Se parte en tres, como ya propone la 9.0 |
| 5 | 2.8.E1 | Eficiente | Ajuste | Pruebas A/B regulares, al menos una activa por mes, **cada una con su hipótesis escrita y su resultado registrado** | — | HubSpot (correos y páginas) e Insider (cada canal) | Se retira 2.8.E2 |
| 6 | 2.8.O3 | Óptimo | Ajuste (**el más importante**) | Cada recorrido y cada campaña se miden por el ingreso que agregan contra un grupo de control que no los recibe, por recorrido y en general, y con eso se decide qué escalar y qué apagar | **Tráfico suficiente** | Insider (grupo de control nativo); en HubSpot lo monta Smarteam | — |
| 7 | 2.2.O2 | Óptimo | Ajuste mínimo | Los agentes de IA que conversan con quien responde, **y lo que la persona responde alimenta su ficha** | — | HubSpot (Customer Agent) e Insider (Agent One) | — |
| 8 | 2.2.O4 | Óptimo | **Nuevo** | El equipo crea segmentos y recorridos describiéndolos en palabras y consulta los resultados en lenguaje natural; una persona aprueba antes de publicar | — | HubSpot (Breeze) e Insider (Agent One) | — |
| 9 | 1.6.O1 | Eficiente (al moverse) | Ajuste | La siguiente mejor acción que propone la IA usa **las señales de comportamiento digital y una probabilidad de compra calculada por un modelo**, y se ve en el CRM | Venta con equipo (ya la tiene) | HubSpot (puntaje predictivo); con Insider, la probabilidad vuelve al CRM solo con otra integración | La 9.0 la pasa a Eficiente; en Óptimo, la IA ejecuta |
| 10 | 3.6.E2 | Eficiente | Ajuste | Los clientes se segmentan según el momento de su relación **y según su valor o su nivel en el programa de lealtad**, que cambian la atención y las ofertas | — | HubSpot (listas activas) e Insider (audiencias predictivas) | Se suma «listos para recomendar» |
| 11 | 3.7.E5 | Eficiente | Ajuste | La información antes de los momentos clave sale sola, **disparada por el evento —un cambio, una entrega, un vencimiento— y en el canal que el cliente prefiere** | — | HubSpot (flujos por fecha) e Insider (canal de cada persona) | Registro de equivalencias de los avisos |

### Ediciones por industria

| # | Edición · criterio | Nivel | Tipo | Qué diría | Condición | Lo habilita |
|---|---|---|---|---|---|---|
| 12 | Ecommerce y retail · 1.6.O101 | Óptimo | Ajuste | La IA decide qué mostrarle a cada comprador —productos, orden y oferta— en tiempo real según su comportamiento, **también a quien todavía no dejó sus datos** | **Tráfico suficiente** | Insider (HubSpot no personaliza al anónimo por lo que hace) |
| 13 | Ecommerce y retail · 1.7.E103 | Eficiente | **Nuevo** | Quien mostró interés en un producto agotado o caro recibe solo el aviso cuando vuelve a haber o cuando baja de precio | — | Insider |
| 14 | Turismo · 1.6.O501 | Óptimo | **Nuevo** | El sitio y el motor de reservas le muestran a cada viajero, aunque no haya dejado sus datos, lo que corresponde a lo que buscó: destinos, fechas y tarifas | **Tráfico suficiente** | Insider |
| 15 | Turismo · 1.7.F503 | Funcional | **Nuevo** | Las búsquedas y las reservas que el viajero deja a medias en el sitio o el motor de reservas reciben un recordatorio automático, por al menos dos canales, dentro del plazo acordado | Venta sin vendedor | Insider; HubSpot si el motor de reservas le manda el evento |
| 16 | Turismo · 3.7.E501 | Eficiente | Ajuste | El aviso antes de salir hacia el destino cubre también **un cambio de vuelo o de horario**, no solo el clima, un cierre o un proveedor | — | Insider y HubSpot |

**En total, 16 cambios: 4 nuevos y 12 ajustes.**
- **Condiciones:** «tráfico suficiente» en tres (6, 12 y 14) y «venta sin vendedor» en uno (15).
- **Funcional:** solo lo tocan el permiso (que sigue de riesgo) y el abandono en Turismo, que ya es Funcional en Banca y en
  Educación.
- **Ediciones sin cambios:** Inmobiliaria y Automotriz no cambian; Educación tampoco.

### Lo que ya existe y no se toca

- **El catálogo al día:** Ecommerce 1.2.F102 y 2.2.F101; Turismo 1.2.F501.
- **Los carritos y las solicitudes a medias:**
  - Ecommerce, en «Carrito y recompra»;
  - Banca 1.7.F201;
  - Educación 1.7.F302.
- **Las recomendaciones y la venta cruzada:**
  - Ecommerce 1.6.F102 y 1.6.E101;
  - los adicionales en Turismo 1.6.E502;
  - los preaprobados en Banca 1.6.E202.
- **La búsqueda en catálogos grandes:** Ecommerce 1.5.E101.
- **En Turismo:** el precio según demanda (1.5.E501) y lo directo contra los intermediarios (1.3.E501 y 2.7.E501).
- **En Banca:** la incorporación digital (1.2.E201) y los avisos antes de cada cobro (3.7.F203).
- **El canal y el momento por persona:** 2.2.O1, 1.7.O2 y 3.7.O3.
- **Los segmentos predictivos:** 2.6.O1.
- **La atención automatizada con traspaso a una persona:** 3.2.F6 y 3.2.O1.
- **WhatsApp para salir con campañas:** 2.7.F4 y 2.2.E2.

Lo de la sesión que no es un criterio de madurez va como ejemplo de la edición: la prueba social, las historias en el
sitio, los acompañantes del titular y los grupos y socios en hotelería.

## La lectura «Preparación para engagement avanzado»

No cambia el nivel. Tiene tres estados:
- **Lista:** cumple el perfil (le vende a personas o a ambos, con relación digital recurrente), tiene tráfico suficiente y
  una base con consentimiento sobre el umbral (5.000 para empezar), cumple los cimientos y Marketing está en Funcional o más.
  - Los cimientos son 2.3.F7 y 2.3.E4, más el catálogo de su edición donde aplica (Ecommerce 1.2.F102, Turismo 1.2.F501).
- **Casi lista:** dice qué cimientos faltan. Eso es lo que vende Smarteam antes de la plataforma.
- **Todavía no:** su camino es HubSpot y SmartLoop.

Se ve en la exploración de la preventa y en el diagnóstico del CSE, y no nombra a Insider.

## El mapa de herramientas

- Una versión nueva del mapa para la escala 9.0, con los 16 cambios: quién habilita cada uno, como en las tablas.
- La ficha de Insider dice cuándo conviene con el umbral de tráfico de su calificación.
- La de HubSpot aclara que no personaliza al anónimo por su comportamiento.

## Los casos de uso de Insider por industria (área A, ítem A6)

1. **Un caso de aterrizaje antes de Insider:** «Prepara tus datos para personalizar» (2.3.F7, 2.3.E4 y el catálogo de su
   edición), con HubSpot y Smarteam. Es lo que vende la lectura «Casi lista».
2. **Ajustar los cuatro de hoy:**
   - «personalizar la experiencia web» apunta a 1.6.O101 y 1.6.O501, con la condición de tráfico;
   - el de carritos se parte en aterrizaje y expansión;
   - «la ficha única» apunta al 2.3.E4 nuevo.
3. **Los que faltan:**
   - WhatsApp para vender y atender;
   - un recorrido que coordina sitio, notificaciones, SMS y WhatsApp (2.7.E1);
   - «Demuestra cuánto vende de más tu marketing» (2.8.O3);
   - avisos por evento (3.7.E5, Turismo 3.7.E501);
   - avisos de disponibilidad y de baja de precio (Ecommerce 1.7.E103);
   - segmentos de valor y lealtad (3.6.E2).
4. **Cada caso dice para qué ediciones es,** con sus ejemplos; la biblioteca filtra por la industria del cliente.
5. **El aviso de la integración:** el conector de HubSpot a Insider va en una sola dirección.

## Lo consensuado (2026-10-23)

1. El tráfico y el tamaño de la base se le preguntan al vendedor en la preventa, junto con «¿se planea o califica para
   Insider?»; van a los datos de la empresa y a HubSpot (roadmap B1). **El tráfico además es condición de tres criterios**
   (rehecho el mismo día, después de ver que HubSpot no personaliza al anónimo y que Insider califica por tráfico).
2. A quién le vende (empresas, personas o ambos) se guarda en los datos de la empresa y en HubSpot, y no apaga criterios.
3. Los cimientos de datos van en 2.3 (más el catálogo en las ediciones).
4. La personalización del sitio a cada comprador va en las ediciones, y 2.6.O3 se acota a los mensajes (como ya proponía la 9.0).
5. El permiso de contacto sigue de riesgo.
6. Todo entra en la 9.0.0, después de publicar la 8.9.1, junto con lo pendiente de `pendiente-9-0.md`.

## Pendiente

- Pedirle a Insider su calificación de clientes, con el umbral de tráfico.

## Etapas

1. **La marca «tráfico suficiente»:** la tercera pregunta del perfil, en el tipo, el lector, el generador, el editor y el port
   de Python, con pruebas. *En el borrador 9.0.0 (2026-10-25) va como condición «Si…» en el texto de los dos criterios de las ediciones (el de Marketing, 2.8.O3, quedó como pregunta: así redactado no tenía IA),
   con el umbral provisional que propuso Claude (más de 50.000 visitas al mes, por validar), como las demás condiciones de
   la escala; si pasa a marca de perfil es una pregunta para Elías en «Lo que falta decidir».*
2. **El perfil en los datos de la empresa** (B1), con lo que confirma el vendedor y llega a HubSpot.
3. **Los 16 cambios en un borrador de la escala,** junto con los temas de la 9.0 con los que se cruzan, revisado por Elías.
   Se publica la 9.0.0. ✓ Escritos en el borrador el 2026-10-25 (`lib/escala/nueve/catalogo.ts`, con qué los habilita), y la
   lectura de preparación en la Parte 2, sin nombrar herramientas; falta la revisión de Elías y la publicación.
4. **El mapa de herramientas** en su versión para la 9.0.
5. **La lectura de preparación** en la preventa y en el diagnóstico, con los umbrales editables.
6. **Los casos de Insider** (A6).
