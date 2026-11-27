# Integración de MiniERP con Holded

Estado de esta versión: **consultas y preparación disponibles; creación externa desactivada**. El código usa la API v2 documentada actualmente por Holded. No se ha probado contra una cuenta real ni se han creado, aprobado, enviado o cobrado facturas durante el desarrollo.

## Alcance y motivo del bloqueo

La documentación oficial de [creación de facturas](https://www.holded.com/developers/api-reference/invoices/create-an-invoice) indica que una factura nueva puede aprobarse automáticamente según la configuración de la cuenta. El cuerpo documentado no ofrece un parámetro que garantice crear exclusivamente un borrador. La referencia de [información de cuenta](https://www.holded.com/es-us/desarrolladores/referencia-api/cuenta/obtener-informacion-de-la-cuenta) no documenta un campo que permita comprobar ese ajuste.

Por tanto, esta versión permite consultar contactos e impuestos y preparar una propuesta revisable. `submit` devuelve `409 DRAFT_MODE_UNVERIFIED` incluso para un administrador. No llama al endpoint de creación, no reclama el registro de exportación y no cambia el estado local de la factura. No existe un interruptor de entorno para saltarse este bloqueo.

| Función | Comportamiento actual |
| --- | --- |
| Consultar configuración | Comprueba si la empresa tiene una clave en el servidor; no confirma conectividad. |
| Consultar contactos | GET real, paginado y limitado a clientes en la cuenta correspondiente. |
| Consultar impuestos | GET real de los impuestos de esa cuenta. |
| Preparar factura | Lee los datos locales, comprueba el contacto remoto y genera una propuesta con hash. |
| Crear, aprobar, enviar, cobrar | Desactivado. No hay operaciones de escritura hacia Holded. |

## Configuración del servidor

La aplicación necesita la migración `erp_*`, un usuario autenticado en Supabase y una membresía `owner` o `admin` en la empresa elegida.

Variables requeridas:

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL del proyecto Supabase. |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clave pública del cliente Supabase. Las consultas se ejecutan con el JWT del usuario y RLS. |
| `HOLDED_API_KEYS_JSON` | Mapa privado de UUID de empresa a su clave Holded. Solo se lee en las rutas del servidor. |

Ejemplo con valores ficticios para el entorno del servidor:

```dotenv
HOLDED_API_KEYS_JSON='{"11111111-1111-4111-8111-111111111111":"CLAVE_DE_ESTA_EMPRESA"}'
```

El UUID debe ser el de `erp_companies.id`. Cada empresa se resuelve de forma exacta: no hay clave global de respaldo ni se reutiliza la de otra empresa. No guardar este valor en código, repositorio, navegador, almacenamiento local ni variables `NEXT_PUBLIC_*`. No hace falta una clave Supabase `service_role`.

Para las consultas implementadas, la clave Holded debe permitir `contacts:contacts.read` y `accounting:taxes.read`. La [autenticación oficial](https://www.holded.com/es/desarrolladores/autenticacion) utiliza `Authorization: Bearer …`. No se solicita permiso de escritura de facturas para esta versión.

Después de configurar el servidor:

1. Iniciar sesión y elegir la empresa con un rol autorizado.
2. Consultar los contactos de Holded. Una respuesta satisfactoria verifica esa consulta concreta; el estado “clave configurada” por sí solo no prueba acceso remoto.
3. Vincular el cliente local mediante su `holded_contact_id`, obtenido de la consulta real.
4. Preparar una factura local en estado `draft`, elegir un impuesto de la lista real y revisar la propuesta.

No hay importación automática ni modificación de clientes al consultar los contactos.

## Contrato HTTP del MiniERP

Todas las rutas requieren `Authorization: Bearer <JWT de Supabase>`. La autorización se comprueba antes de leer la clave Holded o de hacer consultas al proveedor. Responden con `Cache-Control: no-store`.

| Método y ruta | Entrada | Resultado |
| --- | --- | --- |
| `GET /api/holded/status` | Query `company_id` | `{ configured, connectionVerified: false, apiVersion: "v2", outboundEnabled: false, draftPreparation: true, blocker }` |
| `GET /api/holded/contacts` | Query `company_id`, `cursor` opcional | `{ items: [{ id, name, email, tax_id, country_code }], cursor, has_more }` |
| `GET /api/holded/taxes` | Query `company_id` | `{ items: [{ id, name, rate, scope, active }] }` |
| `POST /api/holded/invoices/[id]/prepare` | JSON `{ company_id, tax_id, exchange_rate? }` | `{ payload, requestHash, summary, notes, holdedContact, canSubmit: false, blocker, sentToHolded: false }` |
| `POST /api/holded/invoices/[id]/submit` | JSON `{ company_id }` | HTTP 409, `{ error, code: "DRAFT_MODE_UNVERIFIED", sentToHolded: false }` |

`summary` incluye `invoiceId`, `invoiceNumber`, `clientName`, `currency`, `subtotalMinor`, `taxMinor`, `totalMinor` y `taxName`. `holdedContact` contiene la identidad mínima del contacto remoto para revisión. La propuesta no implica que exista un documento en Holded.

Los errores incluyen un mensaje público y un código estable. Las respuestas no contienen claves, cabeceras de autorización, cuerpos de error del proveedor ni datos bancarios de los contactos. Los fallos de autenticación local producen 401; una membresía insuficiente produce 403. Configuración o datos todavía no disponibles producen 503. Los errores de validación de factura producen 422.

## Reglas de la preparación

La factura y su cliente deben pertenecer a la empresa seleccionada. El cliente se obtiene a través del proyecto de la factura, con filtros de empresa en cada consulta. Solo se admite una factura local en borrador, sin `holded_id` y sin un intento previo en `erp_holded_exports`. Se verifica mediante GET que el contacto vinculado exista en la cuenta Holded correspondiente.

El ERP almacena los importes en unidades menores enteras. El adaptador comprueba base, impuesto y total antes de convertir la base al precio de la línea. Usa cero decimales para JPY/CLP y dos para las otras monedas admitidas. El impuesto se calcula con porcentaje de hasta dos decimales y redondeo por unidad menor. La propuesta actual representa un único servicio, una unidad y un impuesto explícito. No modela varias líneas con fiscalidad distinta, descuentos, retenciones ni impuestos compuestos.

El usuario selecciona el identificador real de un impuesto activo y su porcentaje debe coincidir con el de la factura. Incluso un 0 % requiere un impuesto explícito: el código no deduce por sí solo una exención. El ámbito y la adecuación fiscal se revisan antes de activar una exportación. La documentación de [impuestos](https://www.holded.com/es/desarrolladores/referencia-api/impuestos/listado-de-impuestos-iva) especifica que se emplea `id` en el array `taxes`; no se inventan claves a partir del porcentaje.

Si la moneda de la factura difiere de la moneda base del ERP, la propuesta exige `exchange_rate` positivo y lo asigna a `currency_change`. La moneda base real de la cuenta Holded y el sentido del cambio aún requieren comprobación. Esta versión no obtiene cotizaciones ni aplica conversiones silenciosas.

La propuesta conserva la referencia MiniERP en las notas internas y omite `number`. No reserva ni adelanta contadores de numeración de Holded. La fecha de vencimiento no puede preceder a la emisión y ambas se validan como fechas de calendario.

## Repetición de solicitudes y registro persistente

Preparar una factura solo realiza lecturas. Repetir la misma preparación produce el mismo hash SHA-256 del contenido y no crea duplicados externos. Un cambio en los datos propuestos cambia el hash.

La migración deja preparado `erp_holded_exports`, con `UNIQUE(company_id, invoice_id)`, hash de petición, identificador remoto, código de error y estados `pending`, `succeeded`, `reconcile_required`, `failed`. Las RPC `erp_holded_claim` y `erp_holded_finish` implementan reclamación y transición condicional; no se usan mientras la creación permanezca bloqueada. La preparación rechaza cualquier registro existente, incluido `failed`, para evitar presentar un reintento como una operación nueva.

Para habilitar escrituras en una siguiente versión será necesario verificar la garantía de borrador y la correspondencia de cuenta/moneda, además de probar el circuito completo. Una futura petición POST deberá reclamar el registro persistente antes de llamar a Holded. Un timeout o resultado ambiguo después de intentar crear deberá quedar en `reconcile_required`, sin reintento automático. En las referencias consultadas no se ha confirmado una clave de idempotencia de creación ni una búsqueda garantizada por referencia externa; no se implementa recuperación basada en suposiciones. La mera comprobación previa de que “no existe” no elimina una carrera entre solicitudes.

## Pruebas y límites de verificación

```bash
node --import tsx --test tests/holded.test.ts
```

Las 16 pruebas cubren HTTP simulado, autenticación y roles mediante las rutas reales, separación por empresa, sanitización de errores, paginación, IDs de contacto, impuestos, fechas, unidades menores, moneda, hash estable, timeouts sin reintento y bloqueo de envío. La prueba de preparación comprueba los filtros de empresa, las dos lecturas remotas y la ausencia de escrituras. Ninguna prueba usa credenciales reales ni contacta con Holded.

La conectividad, los permisos reales de la clave, el catálogo fiscal de la cuenta y el modo borrador quedan pendientes de comprobar en un entorno autorizado. Esto no afecta al uso local del MiniERP, pero impide presentar la facturación externa como operativa.

## Referencias oficiales consultadas

Consulta de documentación: 27 de noviembre de 2026.

- [Autenticación API v2](https://www.holded.com/es/desarrolladores/autenticacion).
- [Listado de contactos](https://www.holded.com/es/desarrolladores/referencia-api/contactos/listado-de-contactos-mis-contactos-clientes-proveedores-cont).
- [Contacto por identificador](https://www.holded.com/es/desarrolladores/referencia-api/contactos/abrir-o-ver-un-contacto).
- [Listado de impuestos](https://www.holded.com/es/desarrolladores/referencia-api/impuestos/listado-de-impuestos-iva).
- [Crear una factura: parámetros](https://www.holded.com/es/desarrolladores/referencia-api/facturas/crear-una-factura).
- [Crear una factura: comportamiento de aprobación automática](https://www.holded.com/developers/api-reference/invoices/create-an-invoice).
- [Información de la cuenta](https://www.holded.com/es-us/desarrolladores/referencia-api/cuenta/obtener-informacion-de-la-cuenta).
