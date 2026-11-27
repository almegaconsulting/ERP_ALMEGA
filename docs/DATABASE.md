# Base de datos del MiniERP

## Estado de esta entrega

La migración `supabase/migrations/202611270001_minierp.sql` está implementada y comprobada con PostgreSQL embebido mediante PGlite. **No se ha aplicado a una base de datos remota.** Las pruebas no requieren credenciales y no contactan Supabase ni Holded.

La aplicación anterior usaba tablas genéricas como `clients`, `projects` y `invoices`. Esta versión crea tablas con prefijo `erp_`; no borra, renombra ni modifica aquellas tablas y no importa información antigua automáticamente. Antes de migrar datos reales habría que revisar sus columnas y asignar explícitamente cada fila a su empresa.

## Activación por el responsable técnico

1. Seleccionar el proyecto Supabase que se utilizará para este MiniERP y disponer de una copia de seguridad si contiene información.
2. Aplicar la migración una sola vez con el gestor de migraciones de Supabase o con el editor SQL, usando el rol propietario de la base de datos. La migración se ejecuta dentro de una transacción; un fallo revierte su contenido.
3. Configurar el acceso de Supabase en la aplicación. Las operaciones normales se ejecutan con el JWT de cada usuario; el cliente no necesita una clave de servicio con privilegios administrativos.
4. Crear la primera cuenta de usuario en Supabase Auth y entrar en la aplicación. `erp_create_company` crea la empresa y su membresía de propietario en una operación atómica.
5. Crear las cuentas adicionales en Supabase Auth. El propietario o administrador puede asociarlas a una empresa mediante su correo. La función de membresías **no envía invitaciones ni correos**.
6. Comprobar el acceso con dos usuarios de empresas distintas en el proyecto remoto antes de introducir datos reales.

La migración supone los roles estándar `anon` y `authenticated` y el esquema `auth` de Supabase. No crea ni altera esas identidades. El proyecto debe exponer `public` en su Data API; `erp_private` debe permanecer fuera de los esquemas expuestos.

## Modelo y aislamiento

| Tabla | Contenido |
|---|---|
| `erp_companies` | Empresa, denominación fiscal, país y moneda de referencia |
| `erp_company_members` | Usuario de Auth y rol dentro de una empresa |
| `erp_clients` / `erp_contacts` | Clientes y contactos comerciales |
| `erp_opportunities` | Pipeline comercial, importe y probabilidad |
| `erp_consultants` | Consultores y tarifa de coste de referencia |
| `erp_projects` | Cliente, consultor asignado y tarifas en una misma moneda |
| `erp_contracts` | Fechas, estado y preaviso comercial |
| `erp_purchase_orders` | Presupuesto autorizado antes de impuestos |
| `erp_timesheets` | Horas, jornadas, aprobación y factura vinculada |
| `erp_invoices` | Base, impuesto calculado, total y estado de cobro |
| `erp_expenses` | Gasto, proyecto, fecha y estado |
| `erp_holded_exports` | Registro de intentos de exportación e idempotencia |

Cada registro operativo lleva `company_id NOT NULL`. Las claves foráneas combinan empresa e identificador, de modo que una relación cruzada entre empresas se rechaza incluso si quien la intenta conoce ambos identificadores. `company_id` e `id` no pueden cambiar tras crear una fila.

Todas las tablas de aplicación tienen Row Level Security. La consulta de membresía utiliza una función privada con `SECURITY DEFINER`, nombres de tablas completamente cualificados y `search_path` vacío para evitar recursión y sustitución de objetos. El usuario se obtiene siempre mediante `auth.uid()`; no se acepta un identificador de usuario proporcionado por el cliente como autorización.

| Rol | Leer datos | Crear/editar/eliminar datos operativos | Cambiar empresa | Gestionar miembros | Preparar exportación Holded |
|---|---:|---:|---:|---:|---:|
| Propietario | Sí | Sí, con restricciones de documentos | Sí | Sí | Sí |
| Administrador | Sí | Sí, con restricciones de documentos | Sí | Gestores y lectores | Sí |
| Gestor | Sí | Sí, con restricciones de documentos | No | No | No |
| Lector | Sí | No | No | No | No |
| Usuario externo a la empresa / anónimo | No | No | No | No | No |

Las membresías no admiten INSERT/UPDATE/DELETE directos. Solo las funciones autorizadas las modifican. Un administrador no puede ascenderse, crear otro administrador ni cambiar al propietario. El propietario no puede eliminarse ni degradarse a través de estas operaciones. Una transferencia de propiedad requeriría una operación administrativa específica que esta versión no ofrece.

## Reglas monetarias y de documentos

- Los importes se almacenan como enteros en la unidad mínima de la moneda. EUR, USD, GBP, CHF, INR, PLN, SGD y CAD usan dos decimales; JPY y CLP no usan decimales.
- Las monedas admitidas se validan en la base de datos. No se convierten monedas automáticamente ni se deben sumar monedas distintas en un mismo total.
- La factura, su PO y su proyecto deben utilizar la misma moneda y pertenecer al mismo proyecto. Los gastos usan la moneda de su proyecto.
- `tax_minor` y `total_minor` son columnas generadas por PostgreSQL. El cliente no puede sustituir su cálculo. El impuesto se redondea a la unidad mínima con redondeo comercial; la tasa admite dos decimales.
- El total de factura y los importes individuales están limitados a `1_000_000_000_000` unidades mínimas, dentro de la precisión entera segura de JavaScript.
- Los números de factura y PO son únicos dentro de cada empresa, sin distinguir mayúsculas y espacios exteriores.
- Las facturas se crean en `draft`. Pueden pasar a `issued` y después a `paid`; `draft` e `issued` pueden pasar a `cancelled`. Una factura cobrada o anulada no vuelve a borrador.
- Los datos económicos de una factura emitida son inmutables. Solo se pueden borrar borradores sin partes vinculados ni intento de exportación.
- Los borradores también reservan presupuesto de PO. El consumo usa la base imponible, no el importe con impuestos. La fila de la PO se bloquea al reservar presupuesto para serializar operaciones concurrentes.
- Al crear o modificar partes, facturas, PO y gastos se bloquea también su proyecto con `FOR SHARE NOWAIT`. Esto impide que un cambio simultáneo de cliente, consultor o fechas pase la validación sin ver el nuevo registro. Si el proyecto está ocupado, la operación devuelve un conflicto temporal (`55P03`) para que el usuario vuelva a intentarlo. El bloqueo sin espera evita ciclos con la facturación, que bloquea primero el proyecto y después los partes.
- Fechas incoherentes, importes negativos, horas fuera de 0,25–24, jornadas fuera de 0–3 y partes duplicados por proyecto/consultor/día se rechazan en PostgreSQL.

País, impuesto y preaviso son datos de gestión introducidos por el usuario. Este esquema no determina por sí solo obligaciones fiscales, retenciones, reglas de facturación electrónica ni validez jurídica de contratos.

## Facturación de partes

`erp_invoice_timesheets(p_company_id, p_project_id, p_purchase_order_id, p_month, p_invoice_number, p_tax_rate, p_issue_date, p_due_date)`:

1. Comprueba que el usuario sea propietario, administrador o gestor de la empresa.
2. Bloquea el proyecto y recoge únicamente los partes aprobados, no facturados, del mes `AAAA-MM`, bloqueando también esas filas.
3. Calcula `round(sum(days) * sell_rate_minor)` y comprueba número, fechas, tasa, presupuesto y relaciones.
4. Crea una factura en borrador y marca los partes como `invoiced`, vinculándolos a ella, dentro de la misma transacción.

Un fallo de presupuesto o un número duplicado revierte la factura y deja los partes disponibles. Una segunda ejecución no vuelve a utilizar los mismos partes. Anular una factura libera sus partes a `approved` y borra su vínculo dentro de la misma transacción; la factura anulada permanece en el historial. Para corregir la base o el proyecto de una factura derivada de partes se anula y se genera otra, conservando el registro anterior.

## Contrato de RPC

| Función | Resultado |
|---|---|
| `erp_create_company(p_name, p_legal_name, p_tax_id, p_country_code, p_currency_code, p_locale)` | Una fila `erp_companies` |
| `erp_members(p_company_id)` | Filas `user_id`, `company_id`, `role`, `email` |
| `erp_add_member(p_company_id, p_email, p_role)` | Miembro creado o actualizado; solo cuenta existente |
| `erp_remove_member(p_company_id, p_user_id)` | Sin resultado; protege al propietario y administradores |
| `erp_invoice_timesheets(...)` | Una fila `erp_invoices` con importes calculados |
| `erp_holded_claim(p_company_id, p_invoice_id, p_request_hash)` | JSON `{ claimed: boolean, export: <registro> }` |
| `erp_holded_finish(p_company_id, p_invoice_id, p_request_hash, p_status, p_holded_id, p_error_code)` | Una fila `erp_holded_exports` |

La huella de exportación es SHA-256 hexadecimal de 64 caracteres. El primer claim crea `pending`. Cualquier claim posterior, incluso con otra huella, devuelve `claimed: false` y el registro original. Solo un intento pendiente con la misma huella puede cerrarse en `succeeded`, `reconcile_required` o `failed`. Ningún estado se reintenta ni se elimina automáticamente. El éxito guarda el identificador de Holded en la factura. La presencia de un intento bloquea cambios económicos y anulaciones locales hasta reconciliación administrativa.

**Estas funciones no realizan llamadas HTTP a Holded.** El control de si se puede emitir o crear un borrador remoto pertenece a la integración de servidor, no a una bandera enviada desde el navegador.

## Pruebas ejecutadas

```sh
node --test tests/database.test.mjs
```

La suite ejecuta la migración real en PGlite y cambia de rol y usuario para comprobar 18 escenarios: anonimato, usuarios ajenos, aislamiento bidireccional, solo lectura, gestión de miembros, referencias cruzadas, inmutabilidad, asignación y unicidad de partes, importes y fechas, facturación única, reversión atómica, presupuesto de PO, estados de facturas e idempotencia Holded. También verifica las restricciones de edición del proyecto y, mediante la extensión `pageinspect` incluida en PGlite, que las escrituras de sus registros dependientes adquieren realmente un bloqueo `SHARE`, más fuerte que el bloqueo de clave que obtiene una FK por sí sola. Esta extensión se usa solo en pruebas y no es necesaria en producción.

El pequeño esquema de Auth del test reproduce únicamente `auth.users` y `auth.uid()`. Las tablas, funciones, restricciones, permisos, transacciones y políticas RLS bajo prueba son las mismas de la migración. No se ha probado todavía la integración con el servicio Auth/PostgREST remoto ni la concurrencia de varias conexiones en un proyecto Supabase real.

## Referencias de implementación

- [Supabase: Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
- [Supabase: funciones de base de datos y permisos](https://supabase.com/docs/guides/database/functions)
- [PostgreSQL: modos de bloqueo de filas y conflictos](https://www.postgresql.org/docs/current/explicit-locking.html#LOCKING-ROWS)
