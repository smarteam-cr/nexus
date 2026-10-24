# La escala con engagement avanzado y los casos de Insider por industria — plan

> Sale del documento de Elías del 2026-10-23 (sesión «Casos de uso por industria» con Insider One del 21 oct, más
> investigación). **Consensuado con Elías el 2026-10-23** (ver «Lo consensuado»). Nada construido: entra al roadmap como
> el área N y el ítem A6. Comparado contra la escala publicada en
> producción, versión **8.9.0** (la 8.9.1 está en revisión, prueba 108), y contra la biblioteca de casos
> (`lib/casos-de-uso/catalogo.ts`).

## Dónde cabe

Son dos salidas, en dos partes del roadmap:

1. **La escala** (un área nueva del roadmap, junto a B «Los datos de la empresa»): el perfil de la empresa con las
   condiciones nuevas, los criterios de engagement avanzado (la siguiente versión de la escala), la lectura «Preparación
   para engagement avanzado» y los ejemplos en las ediciones por industria. La escala sigue sin nombrar herramientas.
2. **Los casos de uso de Insider por industria** (el área A, donde A5 etapa 3 ya esperaba esta reunión): ajustar los
   cuatro casos de Insider que hay, sumar los que faltan y que cada caso diga para qué industrias es. Aquí sí se nombra a
   Insider.

## Lo que ya existe (y cambia el plan)

- **La escala ya apaga criterios según el perfil.** Tiene un «perfil de negocio» con dos preguntas: cómo se cierra la
  venta (con equipo, transaccional o mixta) y qué pasa después (una sola compra, recompra o relación continua). Cada
  criterio puede llevar una marca («venta con equipo», «venta sin vendedor», «cliente recurrente», «recompra»,
  «relación continua»); si no aplica, no cuenta, y si una dimensión se queda sin criterios en Funcional, la dimensión
  entera no aplica (`lib/escala/documento/perfil.ts`). **Lo de 5.1 no es nuevo: se suman condiciones a un mecanismo que ya
  funciona.**
- **Límite técnico:** hoy un criterio lleva **una sola marca**. Un criterio de Ventas que ya es «venta con equipo» no
  puede sumar «canales digitales propios» sin cambiar la gramática de la escala (el tipo, el lector y el generador del
  texto, el editor y el port de `docs/escala/pruebas_escala.py`). Es trabajo de código, no solo de texto.
- **Ya hay seis ediciones por industria:** Ecommerce y retail, Banca y servicios financieros, Educación, Inmobiliaria,
  Turismo y Automotriz. Moda, hogar y electrónica caben en Ecommerce y retail; aerolíneas, hotelería y agencias, en
  Turismo; finanzas, en Banca. **No hacen falta ediciones nuevas.**
- **Varios criterios pedidos ya existen con otras palabras** (abajo, marcados «ya existe»).

## 5.1 · El perfil y las condiciones de aplicación

| Del documento | Hoy | Propuesta |
|---|---|---|
| Le vende a empresas, a personas o a ambos | No es una pregunta del perfil | Se guarda en la ficha de la empresa (B1), **no** como condición de criterios: la personalización del sitio sirve igual a un B2B con tienda en línea. Entra a la lectura de preparación |
| La compra, reserva o solicitud ocurre en canales digitales propios | Se acerca a «venta sin vendedor», pero no es lo mismo | **Marca nueva: «canal digital propio»** |
| Tráfico digital, por rangos | No existe | Solo para la lectura de preparación (5.3), **no** como condición: un nivel de madurez no debería depender del volumen |
| Base de contactos con consentimiento, por rangos | No existe | Igual: solo para la lectura de preparación |
| La oferta está en un catálogo | No existe | **Marca nueva: «oferta en catálogo»** |
| Una sola compra o recurrente | Ya existe («qué pasa después») | Sin cambio |

- **El perfil vive en la ficha de la empresa** (B1) y la escala lo lee. En el chequeo para prospectos se resuelve con dos
  preguntas: «¿Tus clientes compran, reservan o solicitan en tu sitio o tu app?» y «¿Lo que ofreces está en un catálogo
  (productos, habitaciones, rutas, planes)?».
- **Un criterio puede llevar dos marcas** (por ejemplo «venta con equipo» y «canal digital propio»): se aplica si cumple
  las dos.

## 5.2 · Los criterios, uno por uno

Leyenda: **Ya existe** (no se toca o casi), **Ajuste** (se reescribe el que hay, mismo identificador), **Nuevo**.
«{marca}» es la condición de aplicación.

### Los cimientos de datos (en 2.3 Datos de Marketing)

El documento los pide «en la dimensión de datos de cada área». Propuesta: **solo en 2.3**, porque los mismos cuatro
criterios en 1.3, 2.3 y 3.3 contarían tres veces lo mismo. Ventas y Servicio los heredan con el campo «requiere».

1. **Consentimiento por canal — Funcional · Ajuste de 2.3.F7.**
   Hoy dice: «Cuando se pide un teléfono u otro dato de contacto, se pregunta si la persona acepta que le escriban por
   ese canal, y su respuesta queda registrada» (es de riesgo).
   Pasaría a: «El consentimiento de cada contacto está registrado por canal —correo, SMS, WhatsApp, notificaciones— y
   se respeta en cada envío». **Sigue siendo de riesgo** (Elías, 23 oct): una empresa sin él igual puede llegar a
   Funcional. La lectura de preparación (5.3) sí lo exige.
2. **Lo que hacen en los canales digitales, unido al perfil — Eficiente · Nuevo 2.3.E5 {canal digital propio}.**
   Hoy: no existe (2.3.O5 pide «una sola ficha que junta al momento lo que hace en todos los canales», en Óptimo).
   Pasaría a: «Lo que las personas hacen en el sitio o la app —qué visitan, qué ven, qué buscan, qué abandonan y qué
   compran o reservan— queda registrado y unido a su ficha».
3. **Reconocer al visitante anónimo — Eficiente · Ajuste de 2.3.E4 {canal digital propio}.**
   Hoy dice: «Lo que alguien hizo antes de dejar sus datos queda en su ficha cuando se identifica».
   Pasaría a: «Un visitante anónimo se reconoce, y su historial se une a su ficha cuando se identifica: al iniciar
   sesión, llenar un formulario o comprar».
4. **El catálogo al día — Eficiente · Nuevo 2.3.E6 {oferta en catálogo}.**
   Hoy: no existe.
   Pasaría a: «Lo que se ofrece está en un catálogo estructurado que se actualiza solo con su precio y su
   disponibilidad».

### Marketing

5. **El sitio que cambia según quién lo visita — Óptimo · Ajuste de 2.6.O3 {canal digital propio}** (el documento lo
   pone en 2.5 Marca y Presencia; propongo dejarlo en Segmentación, donde ya vive).
   Hoy dice: «Hay personalización uno a uno: la IA cambia en tiempo real lo que ve cada persona en los mensajes, el sitio
   web o la app según lo que hizo antes…».
   Pasaría a: lo mismo, sumando «contenido, banners, recomendaciones y resultados de búsqueda» y «cada cambio se prueba
   antes de quedarse».
6. **Segmentos por comportamiento que se actualizan solos — Eficiente · Ajuste de 2.6.E4.**
   Hoy dice: «La segmentación usa datos de comportamiento —qué abrió, qué visitó, qué compró—, no solo lo que la persona
   declaró».
   Pasaría a: lo mismo, más «y los segmentos se actualizan solos».
7. **Segmentos predictivos — Óptimo · Ajuste de 2.6.O1.**
   Hoy dice: «La IA predice quién va a comprar y quién va a perder interés en los mensajes, y arma los segmentos con
   eso…».
   Pasaría a: sumar «el canal y el momento preferidos de cada persona» y que esos segmentos «deciden qué ve y qué recibe
   cada una».
8. **Tres canales en un mismo recorrido — Eficiente · Ajuste de 2.7.E1.**
   Hoy dice: «Los canales —también el conversacional— comparten datos y se alimentan entre sí: uno continúa lo que
   empezó otro, hay remarketing activo y las audiencias se construyen desde el CRM».
   Pasaría a: sumar «al menos tres canales se coordinan dentro de un mismo recorrido, con un límite de frecuencia y
   respetando el consentimiento de cada canal».
9. **El recorrido elige canal y momento, con conversación de doble vía — Óptimo · Ya existe.**
   Hoy lo dicen 2.2.O1 («La IA decide qué mensaje recibe cada persona, por qué canal y en qué momento…») y 2.2.O2
   (agentes de IA que conversan por WhatsApp o chat). **Ajuste mínimo de 2.2.O2:** «y lo que la persona responde
   alimenta su ficha». No se duplica en 2.7.
10. **Pruebas A/B con hipótesis — Eficiente · Ajuste de 2.8.E1.**
    Hoy dice: «Hay pruebas A/B regulares (al menos una activa por mes)».
    Pasaría a: «Hay pruebas A/B regulares —al menos una activa por mes—, cada una con su hipótesis escrita y su
    resultado registrado».
11. **Ingreso incremental contra un grupo de control — Óptimo · Ajuste de 2.8.O3 (el criterio más importante).**
    Hoy dice: «Los mensajes que decide la IA se miden contra un grupo de control, y en el sistema se ve cuánto agregan…».
    Pasaría a: «Las campañas y los recorridos se miden por el ingreso que agregan contra un grupo de control que no
    recibe la acción, por recorrido y en general, y con ese dato se decide qué escalar y qué apagar». Ya no depende de
    que decida la IA. Sin condición, pero con la nota de que con pocas personas la comparación no sirve.
12. **Operar con agentes de IA — Óptimo · Nuevo 2.2.O4** (el documento pide proponer la dimensión: 2.2 Tecnología y
    Automatización, donde ya viven los otros criterios de la IA que decide).
    Hoy: no existe.
    Pasaría a: «El equipo crea segmentos y recorridos describiéndolos en palabras y consulta los resultados en lenguaje
    natural; una persona aprueba antes de publicar».

### Ventas

13. **Priorizar con comportamiento digital y un modelo — Óptimo · Ajuste de 1.6.O1 {venta con equipo} + {canal digital
    propio}** (necesita las dos marcas).
    Hoy dice: «Agentes de IA analizan todo lo que se sabe de cada lead y deciden la siguiente mejor acción, que el
    vendedor ve en el CRM y valida…».
    Pasaría a: sumar «con las señales de su comportamiento digital y una probabilidad de compra calculada por un modelo,
    que regresa al CRM».
    ⚠ El conector oficial entre HubSpot e Insider va en una sola dirección: devolver la probabilidad al CRM pide otra
    integración. Va como aviso en el caso de uso, no en la escala.
14. **Recuperar abandonos — Eficiente · Nuevo 1.7.E5 {canal digital propio}.**
    Hoy: 1.7.E1 habla de negocios que se enfrían, no de compras a medias.
    Pasaría a: «Los carritos, las reservas o las cotizaciones abandonadas se recuperan con un recorrido automático por
    varios canales».
15. **El abandono ajustado a cada persona — Óptimo · Ya existe** en 1.7.O2 («La IA decide el canal y el momento de cada
    seguimiento, persona por persona…»). Ajuste mínimo: sumar «y, en una compra a medias, también la oferta». La medición
    incremental queda en 2.8.O3, en un solo lugar.

### Servicio

16. **Segmentos de valor o lealtad — Eficiente · Ajuste de 3.6.E2.**
    Hoy dice: «Los clientes se segmentan para acciones diferenciadas según el momento de su relación…».
    Pasaría a: sumar «y según su valor o su nivel en el programa de lealtad, que cambian la atención y las ofertas que
    recibe».
17. **Avisar antes de que pregunte — Ya existe** en 3.7.E5 (Eficiente: la información antes de los momentos clave, en
    automático) y 3.7.O3 (Óptimo: la IA decide qué, cuándo y por qué canal). Ajuste mínimo de 3.7.E5: «disparado por el
    evento —un cambio de vuelo, una reserva próxima, una entrega, un vencimiento— y en el canal que el cliente prefiere».
18. **Atención automatizada con traspaso — Eficiente · Nuevo 3.8.E4.**
    Hoy: 3.8 Eficiente habla de la base de conocimiento y el autoservicio, no de la conversación.
    Pasaría a: «En los canales de conversación hay atención automatizada, y lo que no resuelve pasa a una persona con
    todo el contexto».
19. **Un agente de IA que resuelve lo frecuente — Óptimo · Ajuste de 3.8.O2.**
    Hoy dice: «Los picos de demanda los absorben la IA y el autoservicio…».
    Pasaría a: sumar «un agente de IA resuelve los casos frecuentes y deja registro en la ficha del cliente».

**En total:** 5 criterios nuevos (2.3.E5, 2.3.E6, 2.2.O4, 1.7.E5, 3.8.E4), 11 ajustes y 3 que ya existen con un ajuste
mínimo. Llevan condición 2.3.E4, 2.3.E5, 2.3.E6, 2.6.O3, 1.6.O1 y 1.7.E5. Los casos de la biblioteca que citan estos
criterios no se rompen: los identificadores que ya existen se quedan.

## 5.3 · La lectura «Preparación para engagement avanzado»

Es nueva y no cambia el nivel.

- **Lista:**
  - el perfil cumple (le vende a personas, o a empresas y personas; relación digital recurrente; tráfico y base con
    consentimiento sobre el umbral);
  - cumple los cuatro cimientos (2.3.F7, 2.3.E4, 2.3.E5 y, con catálogo, 2.3.E6);
  - Marketing está al menos en Funcional.
- **Casi lista:** el perfil cumple, pero faltan cimientos. Muestra cuáles faltan, porque **esos huecos son el proyecto que
  vende Smarteam antes de la plataforma**.
- **Todavía no:** el perfil no cumple. Su camino es HubSpot y SmartLoop.
- **Los umbrales** de tráfico y de base con consentimiento son editables; el de la base arranca en 5.000 contactos.
- **Se ve** en la exploración de la preventa y en el diagnóstico del CSE.
- **No nombra a Insider:** Insider aparece en la biblioteca de casos y en la propuesta.

## 5.4 · Los ejemplos por industria

Van como palabras y ejemplos de las ediciones que ya existen, sin cambiar dimensiones:
- **Ecommerce y retail:**
  - moda y lujo: recomendaciones, prueba social, historias en el sitio, recuperar el carrito y WhatsApp para vender;
  - hogar y electrónica: búsqueda en catálogos grandes, avisos de disponibilidad o de baja de precio, y compras que se
    deciden en varias visitas.
- **Turismo:**
  - aerolíneas: búsquedas y reservas abandonadas, servicios adicionales, avisos del vuelo y lealtad;
  - hotelería y agencias: reserva directa contra intermediarios, precio según demanda, lealtad, acompañantes como
    segmento aparte, y grupos y socios.
- **Banca y servicios financieros:** incorporación digital, venta cruzada con consentimiento y avisos de vencimiento.

## Los casos de uso de Insider por industria (área A)

Hoy hay cuatro: «Personaliza la experiencia web», «Recupera carritos y compras a medias» (promete de Inicial a Óptimo,
y A5 ya pedía partirlo), «Haz que tus clientes vuelvan a comprar» y «Une la ficha de cada cliente».

1. **Un caso de aterrizaje antes de Insider:** «Prepara tus datos para personalizar» (los cuatro cimientos). Es lo que
   la lectura «Casi lista» vende, y se hace con HubSpot y Smarteam.
2. **Ajustar los cuatro de hoy** a los criterios nuevos (2.3.E5, 1.7.E5, 2.6.O3 ajustado) y partir el de carritos en
   aterrizaje (Eficiente) y expansión (Óptimo).
3. **Los que faltan, por lo que mostró la sesión:**
   - WhatsApp como canal de venta y atención (Clarins México: ventas por WhatsApp ×20, cifra del fabricante);
   - un recorrido que coordina sitio, notificaciones, SMS y WhatsApp;
   - «Demuestra cuánto vende de más tu marketing», con un grupo de control (2.8.O3);
   - búsqueda y descubrimiento en catálogos grandes;
   - avisos proactivos por evento (vuelos, reservas, entregas);
   - segmentos de valor y lealtad.
4. **Por industria, sin duplicar casos:** un campo nuevo en cada caso, «para qué ediciones es» (las claves de la escala:
   `ecommerce-retail`, `turismo`, `banca`), y los ejemplos de esa industria en el caso. La biblioteca filtra por la
   industria del cliente.
5. **El aviso de la integración:** el conector HubSpot ↔ Insider va en una sola dirección; todo caso que devuelve a HubSpot
   lo que calcula Insider lo dice.

## Lo consensuado (2026-10-23)

1. **Tráfico y tamaño de la base** son solo de la lectura de preparación, no condiciones de los criterios. **Y se le
   preguntan al vendedor** en la preventa, junto con «¿se planea o califica para Insider?»; lo que responde se guarda en los
   datos de la empresa y llega a HubSpot (roadmap B1).
2. **Le vende a empresas, a personas o a ambos** se guarda en los datos de la empresa (y en HubSpot), sin apagar criterios.
3. Los **cimientos** viven solo en 2.3.
4. **«El sitio que cambia según quién lo visita»** se queda en 2.6.
5. **El consentimiento por canal** (2.3.F7) **sigue siendo de riesgo**: no frena llegar a Funcional.
6. Entra en la **9.0.0**, después de publicar la 8.9.1.

## Etapas

1. **La gramática:** dos marcas nuevas y un criterio con dos marcas (tipo, lector, generador, editor y port de Python), con
   pruebas.
2. **El perfil en los datos de la empresa** (B1): qué vende y a quién, canales digitales propios, catálogo, tráfico y base
   con consentimiento (por rangos), y si se planea o califica para Insider. Lo estima Nexus con la investigación y lo
   confirma el vendedor en la preventa; lo confirmado se escribe en HubSpot. En el chequeo para prospectos, dos preguntas.
3. **Los criterios:** en un borrador de la escala (editor de la escala), con revisión de Elías, y se publica la 9.0.0.
4. **La lectura de preparación** en la exploración de la preventa y en el diagnóstico, con los umbrales editables.
5. **Los ejemplos** en las ediciones Ecommerce y retail, Turismo y Banca.
6. **Los casos de Insider:** ajustar los cuatro, sumar el de aterrizaje y los que faltan, y el campo de industrias.
