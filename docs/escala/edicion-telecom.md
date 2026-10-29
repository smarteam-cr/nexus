# Edición Telecomunicaciones — escala 9.2.0

Una edición nueva, con sus tres áreas enteras, en la Parte 5 de `escala_rendimiento_smarteam.md`. La pidió Elías
el 28 oct como «una escala para TELCOM». La escala pasa a la 9.2.0 (una edición nueva es una versión menor). No
cambia ningún criterio de la matriz ni el cálculo.

## Quién es TELCOM

No hay ninguna empresa, negocio, ficha, preventa ni reunión que se llame TELCOM, ni en HubSpot ni en Nexus (buscado
el 28 oct, solo lectura). La edición se escribió para la industria en general, con lo que se ve en kölbi, el cliente de
telecomunicaciones que Smarteam atiende hoy: 14 reuniones leídas por el chokepoint, de julio a octubre de 2026. En la
cartera también está BLUESAT, con la industria de HubSpot «Telecomunicaciones», y en HubSpot hay unos 60 prospectos de
la industria (Tigo, Liberty, Claro, Telecable, IFX Networks, Digicel).

Lo que dicen las reuniones de kölbi y la edición recoge:

- Vende planes pospago con o sin equipo, prepago y recargas, portabilidad, renovaciones, líneas adicionales, equipos
  (con preregistro cuando sale un modelo) y servicios del hogar (fibra); las pymes son un frente que crece.
- Los interesados llegan de campañas masivas por WhatsApp, SMS y correo a una landing, y de la línea de atención; se
  reparten entre ejecutivos de cinco regiones y mucha venta se cierra en las tiendas, fuera del CRM.
- La portabilidad exige mandar la SIM, y fuera de la zona metropolitana tarda más; la renovación se firma en línea.
- Las metas se miden en ingreso por ejecutivo; el primer contacto se pide en 30 minutos y el promedio real fue de días.
- Las bases salen del almacén de datos del operador con un día de atraso y se suben a mano por campaña; traen números
  que ya no existen y clientes tratados como interesados. La actividad se va a WhatsApp y llamadas personales.
- La posventa casi no aparece: clientes con el plan vencido hace años, la vigencia de 12 y 24 meses en una hoja de
  cálculo, los avisos de churn como idea y no como práctica.

## Para quién es y qué queda fuera

Para el operador de telecomunicaciones que le vende a personas, hogares y empresas sus servicios móviles —prepago y
pospago, con o sin equipo—, de internet y televisión para el hogar, y de conectividad y telefonía para empresas, y que
atiende después la relación: la activación o la instalación, la facturación, las averías, el cambio de plan, la
renovación y la retención. Parte de la venta la trabaja un ejecutivo —en una tienda, por teléfono o en la visita a una
empresa— y parte se cierra sola en la web, la app o la recarga.

*Perfil habitual:* mixta · relación continua. *Clave:* `telecom`. *Propios desde el 801.*

Quedan fuera, y se miden con la escala general: el fabricante de equipos o de infraestructura que le vende a los
operadores, el mayorista de capacidad o de torres, la empresa de software de comunicaciones (telefonía en la nube,
mensajería masiva) y el integrador que vende proyectos de redes. El distribuidor o la tienda que solo revende recargas
y teléfonos se mide con Ecommerce y retail o con la escala general.

## La edición más parecida y qué cambia

Se escribe sobre la forma de **Banca y servicios financieros**: el mismo perfil (mixta · relación continua), una
contratación que pasa por una verificación del cliente antes de cerrarse, un regulador que fija plazos para los
reclamos, la retención antes de la baja y el aviso antes de cada cobro. Lo que cambia en telecomunicaciones:

- **La venta termina en la activación o la instalación,** no en la firma: la SIM que se entrega, el número que se
  porta, la visita técnica que instala el servicio del hogar.
- **La portabilidad** tiene su propio recorrido, con los plazos y los rechazos que fija el regulador.
- **La cobertura** se confirma antes de vender un servicio del hogar, y **el crédito** solo antes del pospago o del
  equipo en cuotas: el prepago no pasa por ahí.
- **El plazo de permanencia** (la vigencia de 12 o 24 meses) marca cuándo se renueva y cuánto cuesta irse antes.
- **Las bases de campaña** salen de los sistemas del operador —facturación, consumo, recargas— y son enormes: lo que
  importa es que lleguen solas, depuradas y con el consentimiento de cada canal.
- **La atención** tiene averías, también las masivas, que no tiene la banca; el autoservicio pesa más (recargar,
  consultar saldo y consumo, pagar la factura, cambiar de plan).
- **La retención** es la del churn: quien pide la baja o la portabilidad a otro operador, quien deja de recargar y
  quien tiene el plan vencido.

Las dimensiones de producción toman nombres de la industria: en Ventas, Planes y ofertas (1.5), Calificación y
priorización (1.6), Seguimiento de la contratación (1.7) y Ventas ganadas y perdidas (1.8); en Servicio, Proactividad
y retención (3.7) y Autoservicio (3.8), como en Banca. Las de Marketing y 3.5–3.6 conservan el nombre general.

## Su bloque de números

Los criterios propios van del **801 al 899** (la octava edición: Ecommerce 101, Banca 201, Educación 301, Inmobiliaria
401, Turismo 501, Automotriz 601, Maquinaria 701). Son 50; con los 224 reescritos, las 120 celdas dicen al menos un
criterio con palabras de la industria (`npx tsx scripts/medir-personalizacion-escala.ts`).

| Dimensión | Qué pide lo propio |
|:--|:--|
| 1.1 Procesos | El proceso escrito de la portabilidad: datos, SIM, plazos y rechazos del regulador (F801). |
| 1.2 Tecnología | La contratación que el cliente deja a medias queda guardada (F801); un aviso en cada cambio de estado, hasta la activación o la instalación (F802); los ejecutivos escriben solo desde canales oficiales (F803); contratar en línea de punta a punta, también trayendo el número (E801). |
| 1.3 Datos | Los servicios activos y el fin del plazo de permanencia en la ficha del cliente (F801); cuánto deja cada cliente según su plan y su canal (E801). |
| 1.4 Equipo | El acuerdo medido con crédito, logística de equipos y SIM, instalaciones y portabilidad (E801). |
| 1.5 Planes y ofertas | Lo que el cliente contrata, por escrito antes de firmar: plan, precio, cuotas del equipo, permanencia y costo de salir antes (F801); cuántas ventas se facturan distinto de lo ofrecido (E801). |
| 1.6 Calificación y priorización | Las bases que llegan sin depurar (D801); la deuda con el operador y el crédito antes del pospago o del equipo en cuotas (F801); si vende servicios del hogar, la cobertura antes de venderlos (F802); a quién ofrecerle pasar a pospago, subir de plan, renovar o sumar una línea (E801); la cobertura y el crédito se revisan solos (E802); la IA ofrece en la web y la app lo que le conviene a cada cliente (O801). |
| 1.7 Seguimiento de la contratación | El interesado en una portabilidad que nadie contacta (D801); cada portabilidad seguida hasta que el número queda activo (F801); la venta concretada solo con el servicio activo o instalado (F802); cuántas ventas se caen entre la firma y la activación (E801). |
| 1.8 Ventas ganadas y perdidas | Lo que rechazó el operador separado de lo que dejó el cliente (F801); con qué operador se quedó o a cuál se fue (E801). |
| 2.1 Procesos | El calendario de las fechas del negocio: lanzamientos de equipos, temporadas, promociones de recarga, portabilidad (F801). |
| 2.2 Tecnología | Bases enviadas desde una hoja o desde otra herramienta, fuera del CRM (I801); cada envío queda registrado en el CRM, con su campaña y su base, también el de otra herramienta (F801); el preregistro de un equipo, en el CRM y con avisos solos (E801). |
| 2.5 Marca | Cada plan, equipo y servicio del hogar con su página, su precio y cómo contratarlo (F801); los canales oficiales y lo que el operador nunca pide (F802). |
| 2.6 Segmentación | La campaña que le ofrece a un cliente lo que ya tiene (I801); la base cruzada con sus servicios activos antes de enviar (F801). |
| 2.7 Canales | Quien pide no recibir más o está en la lista de exclusión deja de recibir desde el siguiente envío (F801); el costo de cada venta por canal, también en la tienda (E801). |
| 2.8 Medición | Las campañas sin fecha de cierre se revisan por escrito cada mes (F801). |
| 3.1 Procesos | El plazo del regulador para cada reclamo (F801); la guía de la avería masiva (E801). |
| 3.2 Tecnología | Cada avería con un número con el que el cliente consulta en qué va (F801); las alarmas de la red abren la avería masiva solas (E801). |
| 3.3 Datos | Los reclamos dentro del plazo del regulador (F801); las averías que se repiten por cliente y por zona (E801). |
| 3.4 Equipo | El acuerdo medido con red, instalaciones y facturación (E801). |
| 3.5 Consistencia | Los criterios escritos para acreditar días sin servicio, ajustar un cobro o cambiar un equipo en garantía (F801). |
| 3.6 Priorización | El nivel de servicio que contrató una empresa se cumple en sus averías (F801). |
| 3.7 Proactividad y retención | Una razón para quedarse antes de la baja (F801); el aviso antes del fin del plazo de permanencia (F802); el aviso de la avería masiva a los afectados (F803); el aviso antes de suspender por falta de pago (F804). |
| 3.8 Autoservicio | Para reportar una avería hay que llamar (I801); recargar, ver el consumo, pagar y descargar la factura solo (F801); reportar una avería sin esperar a una persona (F802); diagnosticarla desde la app (E801). |

Cambios contra el primer borrador de esta lista:

- **Las bases llegan solas desde los sistemas del operador** no quedó como propio de Funcional: lo pide el 2.2.E8 de
  la matriz (la integración con otro sistema), que en la edición lo dice con ese ejemplo.
- **Retener a quien da señales de irse** no quedó como propio: lo pide el 3.7.E7 de la matriz, que la edición reescribe
  con las señales de la industria (deja de recargar, baja su consumo, reclama más).
- **La 1.6 aplica también a la venta sin ejecutivo**, como en Banca: la web también revisa cobertura y crédito. Por eso
  suma la revisión automática (E802) y la oferta de la IA en la web y la app (O801).
- **Una razón para quedarse antes de la portabilidad** (3.7.F801) va donde la regulación permite contactar a quien la
  pidió: en algunos países el operador que pierde la línea no puede usar ese pedido para retener.
- **Verificar la identidad antes de entregar una SIM o cambiar el titular** no quedó como propio: lo pide el 3.1.F8 de la
  matriz, con su marca de riesgo, que la edición reescribe con esos ejemplos. Un propio sin esa marca lo habría pedido
  dos veces y habría frenado el nivel donde la general solo avisa. Banca tiene ese mismo patrón (3.1.F202); no se tocó.
- **El aviso de cada cambio de estado de la avería** tampoco: lo pide el 3.2.F10 de la matriz, reescrito; lo propio es
  el número de avería con el que el cliente consulta en qué va.
- **Lo del hogar es condicionado** («si el operador vende servicios del hogar…»): un operador solo móvil no lo cuenta.
- La revisión (auditoría de los 224 reescritos contra la matriz y `/revisar`) corrigió 36 reescritos que pedían de más
  o de menos: listas fijas que pasaron a ejemplo, como en la 9.1.1 de Maquinaria, y alcances que se habían achicado.
- Ningún criterio de la matriz sale de la edición (no hay «No aplican»).

## Preguntas abiertas

1. **¿El proveedor de conectividad solo para empresas entra?** (IFX Networks, InterNexa, Gtd). Se siguió con la
   opción más conservadora: la edición es para el operador que le vende a personas y hogares, con su unidad de
   empresas; el que solo le vende conectividad a empresas se mide con la escala general hasta que Elías decida.
2. **kölbi está en «Retail Especializado»** en «Industria (Smarteam)» de HubSpot (y Claro y CONTINEX también), así
   que hoy se mide con Ecommerce y retail. Pasarla a «Telecomunicaciones» es su decisión: su próxima medición con esta
   edición sería una línea base nueva.
3. **¿TELCOM es una empresa concreta?** Si es un prospecto que todavía no está en HubSpot, al crearlo hay que ponerle
   la industria «Telecomunicaciones» para que el test y la ficha le sugieran la edición.
