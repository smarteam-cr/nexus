# La North Star de Nexus

El objetivo de Nexus, los resultados que necesita Elías y los hilos abiertos. Lo decide Elías. Lo cuida el socio de
producto (skill `socio`): lo lee antes de cada conversación sobre qué sigue, lo contrasta con los datos y lo actualiza
cuando Elías decide algo. El roadmap (`docs/roadmap.md`) dice **qué** se construye; este archivo dice **para qué**.

**Última revisión del objetivo:** 2026-11-07 (validado con Elías) · **Próxima:** 2026-12-05, o antes si un dato
contradice un supuesto de abajo.

## El objetivo

Nexus es el sistema de trabajo de Smarteam y va a seguir creciendo: ya lleva Finanzas y Marketing. Su enfoque es que
Smarteam **venda por resultados** (casos de uso), **los entregue con Customer Success** y **sepa cuánto le cuesta cada
uno**; cada persona entra y ve qué le toca hoy.

**La prioridad de ahora** (Elías, 7 nov): que funcionen bien las **actividades, los casos de uso, las exploraciones, las
propuestas, la escala y los artefactos básicos**, para probarlos con el equipo, recibir feedback y mejorarlos. Lo que no
sirve a eso espera.

Para qué lo quieres, en tus palabras de las reuniones:

- **Que Customer Success atienda más cuentas sin contratar más gente** (Dos Pinos con Marco, 6 nov).
- **Que la propuesta se arme con casos de uso, cada uno con sus actividades**, y que esas actividades sean el plan que
  ejecuta Customer Success, con su tiempo interno (seguimiento CS + RevOps y concurso interno, 4 y 6 nov).
- **Que ninguna propuesta salga sin la exploración registrada en Nexus** y que la escala le diga al cliente dónde
  está (rol y esquema de comisiones, 5 nov).

## Los resultados que necesitas

Cada resultado con el número que lo mide. La meta la pone Elías; sin meta, el socio no puede decir si vamos bien.

| # | Resultado | Cómo se mide | Hoy (7 nov) | Meta |
|---|---|---|---|---|
| R1 | El equipo usa Nexus | Por persona, en el panel «Para ti › Uso de Nexus» (`validar-uso` en consola) | 6 de 14 del equipo operativo entran 3+ días por semana; 11 entraron esta semana | Sin número: **entender cómo lo usa cada persona** («somos pocos») |
| R2 | Lo que propone Nexus sirve | Lo propuesto que alguien usó (`uso-de-nexus`) | 2,5 % (87 de 3.444 en 30 días), decidido por 9 personas | **Proponer menos**, sin prioridad todavía (ver H6) |
| R3 | Se vende con exploración | Propuestas con exploración registrada | Sin medir | Pendiente: es parte de la prioridad de ahora |
| R4 | Customer Success rinde más | Cuentas por CSE, con las horas de las actividades | Sin medir (espera Actividades) | Pendiente |
| R5 | La IA no se dispara | Gasto de IA al mes (panel de gasto) | ≈ US$ 175 (US$ 83 en 14 días) | **Tope de US$ 300 al mes** |

## Los hilos abiertos

Un hilo es una apuesta o una pregunta en curso. Cada uno sirve a un resultado. Cuando se cierra, pasa a la bitácora.

| Hilo | Sirve a | Lo último | Lo que sigue |
|---|---|---|---|
| H2 · **La prioridad de ahora:** actividades, casos de uso, exploraciones, propuestas, escala y artefactos básicos | R3, R4 | 7 nov: producción va 74 cambios atrás de `main` (corre lo del 6 nov). Lo nuevo de exploración, artefactos y actividades espera 8 SQL y el deploy. Frentes según Elías: **(a)** revisar la preventa (exploración guiada) · **(b)** la escala · **(c)** la página de la escala y la de resultados que ve el cliente · **(d)** construir la creación de propuestas con casos de uso | 1) ✓ SQL aplicados y desplegado el 7 nov (d7ba0561) · 2) **(a) construida entera y en producción (7 nov, 04eae2d8):** los 5 puntos de Elías (Nexus propone y el vendedor valida; objetivo sugerido de la exploración y de cada sesión; el desafío se valida y va a la ficha como propuesta que confirma CS; la sesión pasada en 3 bloques; sin duplicar el Resumen). **Falta:** que Elías la pruebe con Centauro y juzgue si la lectura de una reunión real acierta («¿se cumplió?» y lo que queda para la próxima) · 3) Elías revisa (b) y (c) en producción · 4) Definir (d) en una línea antes de construir |
| H1 · Entender el uso por persona, sin gastar IA | R1 | Elías miró el panel «Para ti › Uso de Nexus» (7 nov): sobreingeniería, difícil de entender. Pide solo la lista de personas por equipo con barras por mes, trimestre, semestre y año: los días que entró y cuánto usó la IA (agentes) | En producción desde el 7 nov (d7ba0561). Se cierra si a Elías le sirve así |
| H8 · Que probar el trabajo de una sesión sea un paso, no un problema | Todos (es la velocidad para probar, recibir feedback y mejorar) | 7 nov: Elías vio la versión vieja del panel dos veces. El servidor corría el código de `main` y no el de la rama de la sesión, y después la copia no compilaba porque compartía dependencias con `main`. Le pasó «varias veces ya» | Una forma única de levantar la rama de una sesión en el 3004 (su carpeta, con dependencias propias), comprobada antes de decir «listo» |
| H7 · Un resumen en cada panel y gráficos estándar en Nexus | R1 | Elías (7 nov): cada panel con una pestaña de resumen con gráficos de las demás, y una forma estándar y más moderna de hacer gráficos; el diseño actual no lo convence | Esperar al rediseño de Nexus: no gastar tokens en diseño ahora |
| H6 · Que las notificaciones salgan de lo asignado | R2 | Elías (7 nov): los clientes y los proyectos (actividades) asignados a cada persona deberían generar las notificaciones, cruzando las transcripciones y la agenda | No es prioridad; se diseña después de H2 |
| H3 · Separar las cuentas de un mismo grupo (Cemaco CR, GT y EC) | R1 | Marco no logra que Nexus las separe y prepara sus reuniones fuera (5 nov) | Decidir si se separan por ficha o por el nombre de la sesión |
| H4 · El feedback sin revisar | R1 | 7 reportes sin revisar; el más viejo es del 11 oct (7 nov) | Revisarlos o cerrarlos con motivo |
| H5 · El agente dentro de Nexus (el chat general) | R1 | Costeado el 7 nov: ≈ US$ 160/mes con 3 personas | Decidir después de H1: solo si el uso lo justifica |

## Supuestos que hay que cuestionar

Lo que el plan da por cierto y los datos todavía no confirman. El socio los trae cuando aparece evidencia a favor o en
contra.

- **Que más funciones traen más uso.** Lo propuesto se usa un 2 % y el chat lo usan entre 3 y 7 personas.
- **Que el equipo prefiere Nexus a su propio Claude.** Marco prepara reuniones con su propio asistente porque «no
  tiene tiempo para configurar Nexus» (5 nov) y llevó una propuesta de Nexus a Claude para hacer un video (29 oct).
- **Que mostrarle Nexus al cliente ayuda.** Marco: mientras más se muestra Nexus en la reunión, más puede confundir
  (6 nov).

## Bitácora del objetivo

Una línea por cambio del objetivo, de un resultado o por un hilo cerrado. Nunca se borra.

- **2026-11-07** · Primer borrador, armado con el roadmap, las prioridades del 31 oct y 8 reuniones tuyas.
- **2026-11-07** · Elías validó el enfoque: «Nexus es más que eso. Lleva la parte financiera, de marketing, y va a
  evolucionar. Por ahora sí creo una prioridad que las actividades, casos de uso, exploraciones, propuestas, escala, y
  artefactos básicos funcionen bien. Para probar, obtener feedback y mejorar.» Metas: uso «entender cómo se está usando
  por persona; somos pocos»; propuestas «proponer menos, pero no es prioridad»; IA, tope de US$ 300 al mes.
- **2026-11-07** · Regla nueva para el socio, de Elías al ver el panel de uso: «tiene sobre ingeniería… es importante
  entender el objetivo antes de programar». Antes de construir, la pregunta en una línea y solo lo que la responde.
- **2026-11-07** · Elías, sobre ver la versión vieja al probar: «ha pasado varias veces ya… creo que es organización
  tuya» y «es importante para el North Star». Abre H8: probar el trabajo de una sesión no puede costar idas y vueltas.
- **2026-11-07** · Elías probó la exploración guiada en producción con Centauro (frente H2a): «hay que ponerse desde la
  perspectiva del vendedor… lo siento complicado y con sobreingeniería… la idea es que el usuario no rellene forms,
  valide o modifique sugerencias». Pide el objetivo sugerido para la exploración y para cada sesión, que el desafío
  principal viva en la empresa (Información del cliente) y que no se duplique con el Resumen. El clic en la sesión se
  arregla ya; el rediseño se define con él antes de construir.
- **2026-11-07** · Elías preguntó por ese feedback: había entendido que se implementaba entero y solo había salido el
  clic. «Si algo como eso se pasó y no me lo dijo más claro, creo que hay algo que mejorar en North Star.» Regla nueva
  para el socio: lo pedido que queda a medias se dice explícito al cerrar (qué salió, qué no y por qué) y queda escrito
  en el hilo, en «Lo que sigue», hasta que se haga o Elías lo descarte.
- **2026-11-07** · Elías aprobó el rediseño de la exploración («Sí, constrúyela») y pidió juntarlo y desplegarlo. Quedó
  entero en producción el mismo día; falta su prueba con Centauro.
