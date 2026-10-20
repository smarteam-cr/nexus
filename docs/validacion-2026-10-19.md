# Validación funcional de Nexus · 19 oct 2026 (noche)

Pasada con datos reales de producción, **en solo lectura** (todas las conexiones con `default_transaction_read_only`,
el calendario de Google con la cuenta de servicio en lectura), con las mismas funciones que arman cada pantalla. Producción
corre `38be4315` desde las 22:18 del 19 oct. La pasada se hizo entre las 22:30 y las 23:15.

**La pregunta:** ¿Nexus funciona bien y le sirve al equipo? **Funciona bien**: los datos llegan, las pantallas que se
pudieron armar dicen lo que la base y el calendario dicen, y no apareció ninguna mezcla de clientes. **Le sirve poco
todavía**: en 4 días de latido, 5 de 14 personas operativas no entraron y de lo que Nexus propuso en 2 semanas se decidió
el 7 % (ver el área 7).

Los scripts quedan en `scripts/validar-*.ts` y se pueden volver a correr cuando quieras:

| Script | Área |
|---|---|
| `scripts/validar-tareas.ts` | 1 · tareas por reunión y por equipo |
| `scripts/validar-para-ti.ts` | 2 · «Para ti» de CS y Ventas contra la base y el calendario |
| `scripts/validar-agenda.ts` | 3 · la agenda contra Google Calendar |
| `scripts/validar-guias.ts` | 4 · la guía de exploración, sin IA |
| `scripts/validar-smartloop.ts` | 5 · SmartLoop y la recomendación de recurrencia |
| `scripts/validar-datos.ts` | 6 · jobs y copias |
| `scripts/validar-uso.ts` | 7 · quién entra y qué se decide |
| `scripts/validar-pruebas.ts` | 8 · las pruebas del roadmap que se comprueban con datos |

## Lo que arreglé

**La lectura de los números de Rentabilidad fallaba cada hora.** El job `rentabilidad-lectura-mensual` corrió 21 veces el
19 oct (de 2:00 a 22:00, una por hora) y las 21 se cortaron por `max_tokens`: pedía como mucho 3.000 tokens para hasta 12
propuestas. Gastó US$1,13 ese día, y sin arreglo seguiría hasta el día 4 del mes siguiente (unos US$35 al mes). El
botón «Leer los números» (prueba 86) falla igual.

- Subí el tope a 16.000, por debajo del límite sin streaming (21.333). Lo que el modelo no escribe no se cobra.
  `lib/rentabilidad/lectura/contexto.ts`, con su prueba en `lectura.test.ts`.
- Lo revisó un subagente adversarial: el tope alcanza para el peor caso del esquema (unas 15.600) y no rompe nada.
- Queda abierto: si el modelo falla por otra razón que se repite, el job sigue reintentando cada hora sin tope. Lo
  describo abajo; no lo toqué.
- **Después del deploy:** el job reintenta solo y deja las propuestas. La prueba 86 se puede hacer recién después.

Además sumé `lib/comunicaciones/estado-server.ts`, una función de solo lectura para que el script de datos lea la copia
de comunicaciones por su puerta, y declaré los dos scripts en las guardas de `lib/tareas` y `lib/comunicaciones`.

## Área 1 · Tareas por equipo — ✓ con dos reservas

Leí las 42 reuniones de los últimos 10 días que dejaron tareas (149 tareas): 35 con clientes, 5 con prospectos y una
reunión de sprint por equipo. Las comparé contra las líneas de «Próximos pasos» de las notas de Gemini.

**Bien:**

- **El sprint funciona como debe.**
  - Marketing, 19 oct: de 16 líneas, Alejandra recibió 5 de sus 9 y Lidia 5 de sus 6. Lo que el tope dejó afuera
    coincide con las pruebas 155 y 156: «Revisar Nexus» de Lidia, y «Elaborar Reportes SAP», «Montar Google Search»,
    «Entregar Casos Éxito» y «Enviar Copies Videos» de Alejandra.
  - Desarrollo, 19 oct: las 10 líneas quedaron como tareas, cada una para quien la dijo (Breiner 5, Alejandro
    Rodríguez 4, Alejandro Salas 1).
- **Ninguna tarea con un cliente que no es el dueño de la reunión**, ninguna para alguien que no estuvo y ninguna
  duplicada en la misma reunión. 20 quedaron «fusionadas» con otra igual: la deduplicación funciona. INV42 e INV46 en
  verde.
- **Ventas:** Andrés tiene tareas de 11 reuniones y Marco de 4, todas de reuniones donde estuvieron. Liz no tiene
  ninguna: todavía no tiene reuniones con clientes.

**Reservas:**

1. **Lo de esta noche todavía no se ve.** La regla nueva (como mucho 3 esenciales por persona en una reunión con
   cliente, títulos cortos, lo descartado no vuelve) entró a producción a las 22:18. La última reunión leída fue a las
   16:08, así que todavía no hay ninguna reunión leída con esa regla.
   - Lo que hay es la regla vieja: 105 títulos de más de 90 caracteres (el más largo, 160) y 4 tareas de coordinación
     interna. Ejemplos: «Realizar reunión interna el lunes…» (Larce, Marco), «Estar disponible el 2026-10-20…»
     (Ecoquintas, Andrés), «Confirmar internamente quién…» (Tecnosagot).
   - Una reunión pasó el tope de 5: «FACO Honda - Recurrente» (12 oct) dejó 6 tareas a Caroline.
   - **Qué hacer:** correr `npx tsx scripts/validar-tareas.ts --dias 2` el martes 20 en la tarde. Valida las pruebas
     190, 192 y 193 sin que nadie tenga que mirar pantallas.
2. **Seguimientos que fueron a «Por asignar» aunque la cuenta tiene encargado.** T-167 de TEC (Heiver lleva la cuenta)
   y T-120, T-123 y T-124 de Distribuidora Larce (sin CSE) quedaron en «Por asignar · Customer Success».
   - En TEC pasó porque la lectura de esa reunión fue antes del deploy: desde hoy el seguimiento usa la regla única de
     quién lleva la cuenta.
   - En Larce no hay CSE, así que va a «Por asignar»: es correcto.
   - Hoy hay **24** tareas en «Por asignar · CS» (la prueba 135 dice 21).

## Área 2 · «Para ti» de Customer Success y de Ventas — ✓ con tres hallazgos

Armé «Para ti» de las 9 personas con `medirParaTi` y lo crucé con la base (tareas con fecha esta semana) y con los
eventos crudos de Google Calendar de quien lleva cada cuenta.

| Persona | Arriba | Reuniones | Sin siguiente paso | Pendientes sin seguimiento |
|---|---|---|---|---|
| Juan Carlos Armijos | 6 | 1 de 1 | 3 de 13 | 2 de 2 |
| Heiver Gomez | 9 | 3 de 8 | 3 de 7 | 3 de 5 |
| Caroline Bersot | 7 | 3 de 4 | 2 de 2 | 2 de 2 |
| Liliana Moreno | 1 | 1 de 1 (Cemaco, mañana 16:00) | 0 | 0 |
| Valentina Sandoval | 2 | 0 | 1 de 1 (Cayalá) | 1 de 1 (kölbi) |
| Alexander Vanegas (CSL) | 20 | 4 grupos, 14 reuniones | 6 grupos, 33 cuentas | 7 grupos, 14 |

**Bien:**

- **Ninguna «cuenta sin siguiente paso» tiene en realidad un paso.** Verifiqué las 59 cuentas que la pantalla marca así:
  ninguna tiene una tarea con fecha esta semana ni una reunión con alguien de la empresa en los próximos 8 días.
- **Las cuentas con la reunión como siguiente paso tienen ese evento** en el calendario de quien la lleva, con alguien
  de la empresa invitado.
- **Ningún bloque nombra una cuenta fuera de las de la persona**, y ninguna línea se repite entre bloques.
- **Ventas:**
  - Las metas son exactamente las de HubSpot: Andrés US$220.470 de 335.000, Marco US$301.536 de 400.000 y Liz US$0 de
    30.000 (pruebas 145 y 148).
  - Los negocios de la vista coinciden con la copia: Andrés 37 y Marco 125.
  - De los 7 negocios de Andrés con reunión agendada, ninguno pide «Definir siguiente paso» (prueba 188).

**Hallazgos:**

1. **Juan Carlos ve dos números distintos.** El bloque dice «se ven 3 de 13», pero «Tus cuentas» y la cartera en «Sin
   siguiente paso» dicen 16.
   - Las 3 de más son cuentas compartidas donde él no es el encargado: KAIZEN KAPITAL, Fundauna y Discover Puerto Rico.
     Fundauna y Discover también le salen a Caroline.
   - El enlace «Ver las 13 en la cartera» abre una lista de 16. Afecta la prueba 182.
   - Hay que decidir si la cartera del CSE cuenta las compartidas o solo las que lleva. Es una decisión de producto:
     no lo toqué.
2. **Un desarrollador figura como CSE.** Alejandro Rodríguez (DEV) aparece como «CSE» de Secure Title Latin America en
   la CSL: «Alejandro Rodríguez: 1 cuenta sin siguiente paso».
   - Causa: el proyecto «Integración con Secure Trust | Secure Title» está en el pipeline `924878469`, que Nexus no
     conoce (INV11), y por eso se clasifica como de Customer Success.
   - Se arregla decidiendo ese pipeline en HubSpot o en `lib/projects/kind.ts`. Afecta la prueba 209 en otra cuenta.
3. **«Empresa para pruebas» está en la cartera.** Es un cliente (`kind = CLIENTE`) con un proyecto activo sin HubSpot, y
   aparece en «Sin CSE: 9 cuentas sin siguiente paso» de la CSL.
   - Hay que marcarla INTERNO o cerrar su proyecto. Es un dato, no código.
   - También sigue activa «Test CSE (vista Heiver)» (`info@smarteamcr.com`) con rol **CSL**: hay dos CSL en el equipo.

## Área 3 · La agenda contra Google Calendar — ✓

Semana del 19 al 23 oct de Andrés, Heiver y Caroline. Comparé el calendario crudo (paginado, todos los campos) con
`agendaDeLaSemana`.

- **No falta ningún evento:** Andrés 34 de 34, Heiver 34 de 34 y Caroline 37 de 37.
  - Lo que no se pinta es a propósito: 7, 5 y 6 eventos cancelados, rechazados o de ubicación de trabajo.
  - Los 10 «Fuera de la oficina» de Caroline sí se pintan, como en Google.
- **Las cuentas de cada reunión coinciden** con la empresa de los invitados (dominio o contacto de HubSpot), en las 3
  personas.
- **Las pruebas 121, 122 y 123 coinciden con los datos:**
  - «Convocatoria ICB», «Tenis», «Cita Médica», «Sale Juan del colegio» y «Entrega de notas» son eventos propios.
  - «Aniversario de Marco Salas» es de todo el día.
  - Los dos sprints del lunes 8:00 están los dos.
- **«Preparar demo para Accesos Automáticos» es una reunión interna, no un evento propio.** Tiene otros invitados de
  Smarteam y Meet, y por eso el panel dice «Interna» y no muestra la cuenta (es tu captura).
  - La prueba 151 no pasa como está escrita.
  - Lo está trabajando la sesión [Evento interno con cuenta](#local_1b7ad18f-0436-49a2-abd3-f10dfb5a14f0).
- **Una reunión con dos empresas queda sin cuenta, y está bien:** «Capacitación 2 Analisa Caso de uso real» (Heiver)
  tiene invitados de Grupo Inve, Analisalab y un tercero.
- **Juan Carlos tiene un «Daily con Juan» con RC Inmobiliaria el 26 oct, pero lo rechazó:** Nexus no lo cuenta como
  reunión, y es correcto.

## Área 4 · La guía de exploración — ✓

Sin IA, con `contextoParaLaGuia` y `preguntasDeLaProxima`, en las cuatro exploraciones pedidas.

| Exploración | «Lo que ya sabemos» | Preguntas | De dónde |
|---|---|---|---|
| Distribuidora Larce (preventa, sesión 2) | 5 líneas: 1.7, 1.1, 1.3, tiempos y metas | 4 de la guía, 6 tuyas o del asistente y el presupuesto al cerrar | ⓘ en las 4 de la guía |
| CreditForce (preventa, sesión 3) | 5 líneas: 3 del test (1.2, 1.3, 1.4) y 2 del Resumen | 4: 1.3, 1.2, metas, tiempos | al cerrar pide presupuesto y quién firma |
| Cemaco Internacional - CRM (proyecto, sesión 4) | 5 líneas: 1.2 y 1.7 de reuniones, y retos, metas y obstáculos «Confirmado en la estrategia» | 9 (5 + 4 de lo vendido) | guía anterior al plan |
| Ferretería Noelito (proyecto, sesión 1) | ninguna | 5: retos, metas, obstáculos, 1.1 y 1.2 | la de base |

- Ninguna pregunta repite lo que el cliente ya dijo (la misma regla del pedido, `repiteLoSabido`) y ninguna tiene
  voseo.
- En un proyecto, «Lo que ya sabemos» nunca cita el test.
- Coincide con lo esperado en las pruebas 170, 171, 173 y 174. La pregunta de cierre del proyecto es la de
  `PREGUNTA_DE_CIERRE_DEL_PROYECTO`.
- Las 5 preguntas de escala de Cemaco no tienen ⓘ, y es lo esperado: la guía es de antes del plan y se ve como se armó
  hasta «Actualizar la guía».
- **Para revisar (criterio tuyo):**
  - La pregunta de respaldo del paso «impacto», «¿Cuánto les ha costado esto en los últimos meses…?», sale en Larce
    (1.1) y en CreditForce (1.2). «Esto» solo se entiende con la ⓘ.
  - En Larce, la tuya «¿Qué te cuesta que no todo el equipo use el CRM igual?» se parece a la 1.1.
  - El proyecto de Desarrollo «CEMACO » también tiene una exploración con las preguntas de estrategia de CS.

## Área 5 · SmartLoop y el servicio recurrente — ✗ sin uso real

- **Los 4 proyectos SmartLoop reales no tienen ningún ciclo en Nexus:** kölbi «Sales Hub» y «Marketing y ventas»,
  Honda «PLAN DE CONTINUIDAD | HONDA FACO» y RC Inmobiliaria «CONTINUIDAD CRM».
  - HubSpot dice Diagnóstico, salvo Honda, que dice Implementación.
  - El riel muestra «Diagnóstico · falta: nada»: sin ciclo, Nexus no tiene nada que comprobar y no lo dice.
- **El de prueba hace lo que debe.** «FACO · SmartLoop (prueba)» tiene el ciclo 1 en Implementación, sin fechas, sin meta y
  sin casos de uso, y dice «El ciclo avanzó sin casos de uso…».
- **La recomendación de pasar a SmartLoop aparece:** 13 de los 20 proyectos en Entrega o Finalizado la tienen pendiente.
  - Les llega a sus encargados en «Esta semana»: Juan Carlos 6 (Selvatura, ALFA+, Construtecho ×2, Iberorutas, Sfera
    Legal) y Heiver 3 (BLUESAT, Grupo Inve, Intercert). Prueba 30 ✓.
  - Las de encargados que ya no están le llegan a la CSL: Cicadex (Brandon Centeno) y Noelito ×2 (Felipe Sepúlveda).
  - Nadie decidió ninguna todavía.
  - Construtecho recibe dos recomendaciones (una por proyecto), para la misma cuenta.
- **Qué hacer:** que Caroline y Valentina abran el ciclo 1 de Honda y de kölbi. Sin eso no hay nada que validar de
  SmartLoop real (pruebas 28, 29 y 31 solo con la prueba).

## Área 6 · Que el dato llegue bien — ✓ salvo 4 rojos explicados

**Jobs** (lo que pinta Integraciones › Jobs del servidor):

- 23 en verde.
- 2 en rojo:
  - la lectura de los números (arreglado, ver arriba);
  - la revisión diaria de invariantes, por INV11 e INV32.
- 5 sin anotar, que en esta PC no se puede saber si están apagados (depende del `.env` del servidor):
  - las señales y el vigía de Éxito del cliente, apagados a propósito hasta prender `CS_WATCHDOG_ENABLED`;
  - el corte de cobranza (`COBRANZA_CRON_ENABLED`, de ahí INV32);
  - `ia-lotes`, que no tiene nada que mandar mientras el vigía esté apagado.

**Copias:**

| Copia | Hoy | Última | Veredicto |
|---|---|---|---|
| Negocios abiertos | 196 | hace 3 h (corre de 6:00 a 20:00) | ✓ |
| Metas | 233 tramos, 132 de ventas | hace 3 min | ✓ |
| Contactos | 1.413 | hace 4 h | ✓ |
| Tickets | 420 (128 abiertos) | hace 7 h | ✓ |
| Comunicaciones | 263 notas, 6 llamadas, **0 correos** | hace 6 h | ✓ sin el permiso de correos (decisión tuya pendiente) |
| Tareas de HubSpot | 26, ninguna con error | hace 7 h | ✓ |
| Ventas ganadas | 374 | hace 17 h | ✓ |
| Odoo | 398 facturas, última corrida ok | hace 17 h | ✓ |
| Mercury | última corrida ok | hace 17 h | ✓ |
| Tipo de cambio | ₡453,48 del 19 oct (Hacienda) | hoy | ✓ |

**La lectura de cada reunión** (reuniones de 7 días):

- 33 listas, 4 sin texto, 1 copia y ninguna en error. INV44 en verde (68 reuniones).
- 121 hechos pendientes: `SEGUIMIENTO_HECHOS` está prendida. Nadie decidió ninguno.
- **28 % de las reuniones con dueño de 14 días no tiene ni transcripción ni notas** (58 de 207). Es configuración de
  Google Workspace, no de Nexus («Reuniones sin grabar» en Uso de Nexus dice de quién).

**Invariantes** (`npm run check:invariants`, solo lectura): 4 en rojo.

| Invariante | Qué pasa | Qué hacer |
|---|---|---|
| INV11 | «Integración con Secure Trust \| Secure Title» está en el pipeline `924878469`, que Nexus no conoce. Es lo que hace aparecer a Alejandro Rodríguez como CSE. | Decidir qué es ese pipeline, contigo. |
| INV13 | «TEC- AE» guarda la empresa fusionada `56463266574`; la que sigue es `59180429929`. | Correr `scripts/reapuntar-empresa-fusionada.ts --apply` (escribe: lo corro yo si me lo pides). |
| INV16(a) | Una reunión de Meet se leyó antes de ocurrir. Es el caso conocido de un evento que se movió después (KNOWN-ERRORS). Parece «Grupo Inve: Acuerdo macro» (fecha de hoy, con tareas del 12 oct). | Revisar esa reunión. |
| INV32 | El último corte de cobranza es del 24 jul. | Prender el corte automático (RUNBOOK). |

## Área 7 · Cómo sé si Nexus es exitoso

El latido de uso existe solo desde el **16 oct**: hay 4 días de datos, no 14.

**Quién entra** (16 al 19 oct):

| Equipo | Entraron | Detalle |
|---|---|---|
| CSE | 4 de 5 | Caroline Bersot no entró; Heiver y Juan Carlos 2 días, Liliana y Valentina 1 |
| CSL | 1 | Alex Vanegas, 1 día |
| Desarrollo | **0 de 3** | Alejandro Rodríguez, Alejandro Salas y Breiner |
| Marketing | 2 de 2 | 1 día cada una |
| Ventas | 2 de 2 | Andrés 2 días, Liz 1 |
| Finanzas (Dinia) | 0 | |
| Dirección | 3 de 3 | Tú los 4 días, con 134 aperturas |

- Lo más abierto: «Para ti» (51 aperturas, 9 personas), Clientes (44, 8 personas) y Ventas (29, 5 personas).
- Tareas tuvo 14 aperturas de 4 personas.

**Qué se decide de lo que propone Nexus** (`scripts/uso-de-nexus.ts --dias 14`):

- Nacieron 958 propuestas.
  - 33 usadas y 38 desestimadas: se decidió el **7,4 %**.
  - 140 vencieron: 123 son alertas del vigía cerradas en bloque.
  - 747 siguen pendientes.
- Minutas: 83, **0 revisadas**.
- Tareas propuestas por reuniones: 124 → 3 usadas, 28 desestimadas, 17 vencidas.
- Campos de la ficha: 199 → 23 usados.
- Hechos para los documentos: 37 novedades y 21 para Procesos, **0 decididos**.
- Notas para HubSpot: 15, 0 usadas.
- La tabla cuenta 260 «Compromisos (antes de Tareas)» del 6 al 9 oct, de antes de retirar `ActionItem`. Sugiero sacar
  esa fila del panel para que no ensucie la lectura.
- Se terminaron 12 tareas en 2 semanas.
- Gasto de IA: **US$72,25 en 14 días** (1.129 llamadas), unos US$155 al mes.

**Indicadores de éxito que propongo**, con el número de hoy:

| # | Indicador | Hoy | Meta sugerida |
|---|---|---|---|
| 1 | Personas operativas (CS, Ventas, Dev, Marketing) que entran al menos 3 días por semana | 0 de 14 (en 4 días, nadie pasó de 2) | 10 de 14 en 4 semanas |
| 2 | Cuentas de la cartera con siguiente paso (tarea con fecha esta semana o reunión en 8 días) | 14 de 48 (29 %) | 80 % |
| 3 | Lo que propone Nexus que una persona decide (usa o desestima) antes de que venza | 7,4 % | 50 % |
| 4 | Reuniones con cliente que dejan texto para leer | 72 % (149 de 207) | 90 % |
| 5 | Costo de IA por persona activa por mes | ≈ US$13 (US$155 ÷ las 12 personas que entraron) | que baje mientras sube el 1 |

El 1 y el 3 son los que dicen si Nexus sirve. El 2 dice si el equipo trabaja como acordaron con Alex. El 4 es la
condición para que lo demás funcione.

## Área 8 · Las pruebas del roadmap (127 pendientes)

Leyenda:

- **(a)** la validé con datos y código, con la evidencia;
- **(b)** necesita la pantalla con sesión o tu criterio;
- **(c)** la hace alguien del equipo con su usuario;
- **(x)** ya no aplica, por los cambios de esta noche.

### (a) Validadas por Claude con datos — marcar «✓ Validado por Claude»

| # | Evidencia |
|---|---|
| 170 | La guía de Cemaco es de antes del plan (`guiaDeAntesDelPlan` = true) y tiene 9 preguntas. El aviso ámbar sale de ese mismo dato. |
| 171 | «Lo que ya sabemos» de Cemaco: 5 líneas, 1.2 y 1.7 de reuniones, y retos, metas y obstáculos «Confirmado en la estrategia». |
| 173 | Noelito, sesión 1: 5 preguntas (retos, metas, obstáculos, 1.1, 1.2). |
| 174 | La pregunta de cierre del proyecto es exactamente la del roadmap (`PREGUNTA_DE_CIERRE_DEL_PROYECTO`). |
| 180 | Liliana: «Cemaco Internacional: Cemaco \| Sales Hub — Mañana, 16:00»; los otros dos bloques, vacíos. |
| 184 | Heiver: primero los 2 compromisos de TEC sin tomar y después «TEC: 2 tareas vencidas» con T-45. |
| 186 | La CSL ve una línea por CSE en cada bloque, más «Sin CSE». Con los dos hallazgos del área 2 (Alejandro Rodríguez y «Empresa para pruebas»). |
| 188 | De 7 negocios de Andrés con reunión, ninguno pide «Definir siguiente paso». |
| 198 | El sprint de marketing del 19 oct dejó 5 a Alejandra y 5 a Lidia. |
| 200 | Cemaco abre en «Cemaco Internacional - CRM» para Liliana (lo lleva) y Heiver (su equipo), y en «CEMACO » para Breiner (lo lleva) y Alejandro Salas (su equipo). Alex, tú y Andrés abren en la cuenta. |
| 165, 166 | Lo mismo de la 200, con la función de la ficha. |
| 206, 115 | Librería: encargada Caroline Bersot, sin «+1»; un solo «HubSpot Refresh» activo; «Implementación HubSpot Refresh» inactivo. |
| 209 | Quien lleva Cemaco es Liliana, no Breiner. |
| 215 | Juan Carlos ve 16 cuentas en «Las que llevas». |
| 216 | La CSL ve 48 cuentas, 35 sin sesión y 34 sin siguiente paso. |
| 222 | Solo CSE, CSL y dirección entran a «Seguimiento de cuentas» (`ROLES_DEL_SEGUIMIENTO`, con su prueba). |
| 223, 224 | «Cuentas sin dueño en HubSpot · 27»: «20 proyectos sin encargado» (9 con un encargado que ya no está y 11 sin encargado), «6 cuentas cobran un servicio sin proyecto» y «1 cosa abierta en una cuenta excliente». |
| 225 | La CSL ya no tiene «HubSpot: 26 cosas» ni «8 proyectos de CS sin encargado» en «Esta semana». |
| 226 | Heiver tiene «HubSpot: 1 cosa por resolver hoy» (Wherex) en «También para hoy». |
| 145 | Liz: meta US$30.000, avance 0. |
| 148 | Andrés US$220.470 de 335.000; Marco US$301.536 de 400.000. |
| 152 | «Cita Médica» es un evento propio sin cuenta. |
| 168 | Una sola «Cemaco Internacional» (cuenta de cobro con 1 servicio y 4 cobros) y una sola «Total Finco» (1 servicio y 2 cobros). |
| 121, 122, 123 | Los eventos están en la agenda de Andrés (área 3). Que no haya espacios libres encima es de pantalla. |
| 140, 141 | 9 propuestas de salud del vigía vigentes. La que más espera es Areyá («de En fricción a En riesgo», 49 días de atraso en «Integración En Control»). |
| 30 | Juan Carlos tiene en «Esta semana» «Propónle a Selvatura seguir con SmartLoop» (y 5 más). |

### (a) Revisadas con datos, con algo que no coincide

| # | Qué no coincide |
|---|---|
| 182 | «Se ven 3 de 13» está bien, pero la cartera «Sin siguiente paso» muestra 16 (área 2, hallazgo 1). |
| 151 | «Preparar demo para Accesos Automáticos» es una reunión interna, no un evento propio: sale «Interna» y sin cuenta (área 3). |
| 135 | En «Por asignar · CS» hay 24, no 21. Es un número que cambió, no un error. |
| 137 | De T-2, T-38 y T-106 hoy Nexus sugiere cerrar solo T-106: las otras dos ya no están. |
| 37 | Solo existe la foto de sep 2026 (v1, la tomó el sistema el 18 oct): jul y ago se calculan en vivo. |
| 86 | Falla con `max_tokens` hasta que se despliegue el arreglo de esta pasada. |

### (x) Ya no aplican

Lo de esta noche (tres bloques, la reunión como siguiente paso) las cambió:

- **130:** la vista se llama «Sin siguiente paso» y tiene 16. La reemplaza la 182.
- **131:** «Estabilizar N cuentas» ya no le sale al CSE.
- **132 y 133:** la caja azul «Usar» con el siguiente paso de la reunión se retiró.
- **134:** la vista se llama «Sin siguiente paso» (34) y no tiene caja azul.
- **48:** pedía «Lo que importa hoy» del CSE y la CSL, que ahora son tres bloques.

Sugiero marcarlas «Ya no aplica».

### (b) Necesitan la pantalla con sesión o tu criterio

- **Noche del 19 oct:**
  - 172 «Actualizar la guía» llama a Claude. Lo esperado: 1.2, 1.7, metas, 1.3 y 1.4 en impacto, más lo vendido.
  - 175, 178, 187, 204, 205, 207, 210, 217, 220, 221.
- **Tarde del 19 oct:** 147 (hoy no hay nadie de Ventas sin meta: no se puede probar), 150, 153, 154, 160, 161, 163.
- **Con Alex:** 116, 118, 120, 124, 129, 136, 138, 139, 143.
- **Finanzas:** 36.
- **«Para ti»:** 7 (Fundauna ahora dice «sin siguiente paso»), 8, 78, 109.
- **Preventa:** 104, 113, 114.
- **SmartLoop:** 28, 29, 31.
- **Propuestas:** 57, 58, 95, 24, 27, 62, 63.
- **Tareas:** 110, 111 (los seguimientos agrupados existen, por ejemplo «Seguimiento con Iberorutas: 2 cosas…»), 112, 20,
  22.
- **Chat:** 17, 18, 75.
- **Escala:** 108 (es tu criterio), 52, 53, 54, 55, 56, 19, 45, 47, 23.
- **Ficha:** 13, 14, 15, 16.
- **Rentabilidad y uso:** 83 (la meta de 2027 está: US$2,3 M), 37, 38, 84 (depende de la 38), 86 (después del deploy),
  39, 40, 67.
- **Éxito del cliente:** 41 (la lista existe; ver área 6).

### (c) Las hace alguien del equipo con su usuario

| # | Quién | Cuándo |
|---|---|---|
| 117, 142 | Alex Vanegas | |
| 137 | Andrés Pinzón | hoy verá 1, no 3 |
| 149 | Andrés o tú | crear una meta en HubSpot |
| 155 | Lidia Flores | los datos ya dan su línea «Revisar Nexus» |
| 156 | Alejandra Ortega | los datos ya dan sus 4 |
| 190 | Liliana Moreno | después de la reunión de Cemaco del martes 20 a las 16:00 |
| 192 | Marco Salas | después de su próxima reunión con un cliente |
| 193 | un CSE | descarta una propuesta y espera otra reunión de esa cuenta |
| 213 | quien pueda | cambiar el CSE Encargado en HubSpot |

Las 190, 192 y 193 las puedo comprobar yo con `scripts/validar-tareas.ts` en cuanto haya reuniones leídas con la regla
nueva.

## Lo que hay que hacer, en orden

1. **Desplegar el arreglo de la lectura de los números**: cada hora sin él cuesta una corrida fallida.
2. **Decidir el pipeline `924878469`** (INV11): saca a Alejandro Rodríguez de CSE de Secure Title.
3. **Marcar «Empresa para pruebas» como INTERNO** o cerrar su proyecto, y dar de baja o cambiarle el rol a «Test CSE
   (vista Heiver)».
4. **Decidir si la cartera del CSE cuenta las cuentas compartidas** (13 contra 16 en Juan Carlos).
5. **Unir los contenedores «Información del cliente» repetidos** (`serviceType = "__strategy__"`):
   - Ministerio de Economía tiene 5, AMC 2 y Librería Internacional 2.
   - Los de MINEC y AMC se crearon con milisegundos de diferencia (dos pedidos a la vez) y cada uno tiene 5 bloques.
   - `ensureClientInfoProject` usa `findFirst` sin orden, así que cuál se muestra no está garantizado.
   - Es una limpieza de datos con su script en simulacro. No lo toqué.
6. **Que Caroline y Valentina abran el primer ciclo de Honda y kölbi en Nexus**: hoy SmartLoop no tiene uso real.
7. **El job de la lectura de los números necesita un tope de reintentos** o una espera que crezca. Hoy, un fallo que se
   repite igual reintenta cada hora hasta el día 4 del mes siguiente.
8. Revisar por qué Cicadex dice «HubSpot registró la cancelación para el **29 ene 2029**» (le sale a Heiver): parece una
   fecha mal cargada en HubSpot.
9. Juan Carlos tiene «Revisa 176 reuniones que la IA asignó en 8 proyectos»: es mucho para revisar una por una.

## Pruebas automáticas

- `tsc --noEmit` en 0.
- La suite unit pasa entera: 757 archivos, 12.444 casos.
  - Corrida completa con la PC cargada por otras sesiones, 27 pruebas de escaneo pasaron los 5 segundos de tope.
  - Las 22 que fallaron pasan todas corridas sin paralelismo (322 casos).
