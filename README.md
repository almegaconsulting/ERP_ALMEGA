# Almega MiniERP

Aplicación de gestión para un equipo pequeño de consultoría. Integra en el proyecto Next.js existente los módulos de clientes, contactos, oportunidades, consultores, proyectos, contratos, órdenes de compra, partes, facturas y gastos.

## Qué funciona en esta versión

- Interfaz en español, navegación por módulos, tablas con búsqueda, filtros, ordenación y exportación CSV; formularios de alta, edición y eliminación con validaciones.
- Selector de empresa y creación de empresas vacías. Cada empresa tiene su país y moneda principal. Los registros y permisos están separados por empresa.
- Panel de actividad y facturación con importes agrupados por moneda, sin sumar divisas distintas.
- Flujo de partes aprobados → factura en borrador → emitida → cobrada. La anulación libera los partes; una factura no puede reutilizar trabajo ya facturado.
- Órdenes de compra con control del presupuesto comprometido por base imponible. Los borradores reservan presupuesto y las facturas anuladas lo liberan.
- Roles de propietario, administrador, gestor y lector. La base de datos aplica las reglas de acceso, además de las comprobaciones del servidor y la interfaz.
- Holded API v2: configuración privada por empresa, consulta de contactos e impuestos, vinculación de clientes y preparación validada del contenido de factura.

## Dos modos de funcionamiento

### Espacio de prueba

Sin las dos variables públicas de Supabase, la aplicación arranca con ejemplos **ficticios** y una banda permanente que identifica el modo de prueba. Los cambios se guardan solo en `localStorage` de ese navegador, incluidos los ejemplos de dos empresas. No hay usuarios compartidos, sincronización entre dispositivos ni llamadas de escritura a Holded. Se pueden restablecer los ejemplos desde Configuración.

Este modo sirve para revisar la interfaz y los flujos. No debe utilizarse como almacén de datos reales. Las empresas que se creen desde el formulario comienzan vacías, también en la prueba.

### Espacio compartido

Al configurar Supabase, la aplicación exige inicio de sesión y utiliza la base de datos. Una conexión fallida **no** provoca una vuelta silenciosa al modo de prueba. No se importan los ejemplos del navegador a la base de datos ni se modifican las tablas del prototipo anterior.

La migración se ha ejecutado y probado en PostgreSQL/PGlite local. Su aplicación a un proyecto Supabase remoto y la validación de Auth/PostgREST siguen pendientes de acceso al proyecto real. La revisión de acceso debe completarse antes de usar datos de negocio.

## Arranque local

Requisitos: Node.js 22 o 24 y npm.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Abrir `http://localhost:3000`. Con el archivo de ejemplo sin credenciales se abre el espacio de prueba.

```bash
npm run typecheck
npm test
npm run build
npm start
```

`npm run verify` ejecuta tipos, pruebas y compilación de producción. Las pruebas no necesitan credenciales ni realizan escrituras en servicios externos.

## Activación del espacio compartido

1. Elegir el proyecto Supabase de Almega y realizar una copia de seguridad antes de cualquier migración de un entorno con datos. Esta migración crea tablas con prefijo `erp_`; no migra ni elimina las tablas antiguas.
2. Aplicar `supabase/migrations/202611270001_minierp.sql` como propietario de la base de datos, siguiendo [DATABASE.md](docs/DATABASE.md).
3. Crear las cuentas autorizadas en Supabase Auth. Esta versión permite entrar con correo y contraseña; no incluye autorregistro, recuperación de contraseña ni envío de invitaciones desde MiniERP.
4. Configurar `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` en el entorno de despliegue. Se usa la clave pública con el JWT del usuario y RLS; la aplicación no necesita una clave `service_role`.
5. Mantener `NEXT_PUBLIC_DEMO_MODE=false` y volver a compilar/desplegar, porque Next.js incorpora las variables públicas en la compilación.
6. Iniciar sesión, crear la primera empresa y dar acceso desde Configuración a las cuentas ya registradas. La primera empresa se crea vacía y su creador es propietario.
7. Comprobar con dos cuentas reales el acceso, los permisos y el ciclo de partes/facturas antes de incorporar los datos de negocio.

Las variables públicas incompletas dejan el modo de prueba activo; verificar el indicador de modo tras desplegar. `NEXT_PUBLIC_DEMO_MODE=true` fuerza expresamente la prueba local, aunque existan variables de Supabase.

## Holded

Configurar `HOLDED_API_KEYS_JSON` únicamente en el servidor como un mapa de identificador de empresa → token de Holded API v2. Nunca colocar tokens de Holded en variables `NEXT_PUBLIC_`, en el repositorio ni en formularios del navegador.

La preparación comprueba el contacto remoto y el identificador del impuesto de la cuenta. La creación remota de facturas permanece desactivada: la documentación de Holded indica que una factura puede aprobarse automáticamente según la configuración de la cuenta. Esta versión no puede verificar que se conservará como borrador. El endpoint de envío devuelve `409 DRAFT_MODE_UNVERIFIED` y no escribe en Holded.

Véase [HOLDED.md](docs/HOLDED.md) para configuración, rutas, garantías y límites. No se ha realizado una prueba con una cuenta real de Holded.

## Modelo y límites

- Diez monedas admitidas: EUR, USD, GBP, CHF, INR, PLN, SGD, CAD, JPY y CLP. Los importes se almacenan en unidades mínimas enteras; JPY y CLP no admiten fracciones.
- No hay conversión de divisas automática. Factura, PO y gasto utilizan la moneda del proyecto. Los cuadros de mando separan las monedas.
- País, porcentaje de impuesto y preaviso son datos de gestión. Esta versión no determina obligaciones fiscales, retenciones, requisitos laborales ni facturación electrónica de cada país.
- Cada proyecto admite un consultor asignado opcional. Un parte corresponde a un consultor, proyecto y día; la generación de facturas utiliza las jornadas aprobadas y la tarifa diaria de venta del proyecto.
- La carga inicial admite hasta 20.000 registros por módulo y empresa. Si se supera el límite, devuelve un error explícito; no presenta totales parciales como si fueran completos. La paginación en el servidor queda pendiente para volúmenes mayores.
- La edición simultánea de campos de gestión sigue el último guardado. Las reglas económicas y de facturación se vuelven a comprobar en PostgreSQL; los conflictos de bloqueo se comunican para que el usuario repita la operación.
- No hay adjuntos, automatización de correos, importación histórica ni informes con IA en esta entrega.
- No hay traslado automático de los datos del prototipo anterior. Las rutas antiguas de cuentas, contactos, oportunidades y proyectos redirigen a los módulos nuevos; el endpoint anónimo de reordenación antiguo está retirado.

## Estructura

| Ruta | Función |
|---|---|
| `app/components/erp/` | Interfaz de usuario y flujos de trabajo |
| `lib/erp/` | Contratos, validaciones, cálculo monetario, datos ficticios y estado |
| `app/api/erp/` | API con autenticación y permisos por empresa |
| `supabase/migrations/` | Esquema, RLS, restricciones y operaciones atómicas |
| `lib/holded/`, `app/api/holded/` | Integración de servidor con Holded |
| `tests/` | Pruebas monetarias, permisos SQL e integración Holded simulada |

## Verificación

Las pruebas SQL ejecutan la migración real en PGlite con un pequeño sustituto de `auth.users` y `auth.uid()`. Comprueban aislamiento, roles, relaciones, estados, presupuesto, facturación atómica e idempotencia. No sustituyen una prueba remota de Auth/PostgREST ni una prueba de concurrencia con varias conexiones.

Las pruebas de Holded simulan HTTP y Supabase para verificar autorización, aislamiento, preparación y ausencia de escrituras. Las pruebas de dominio cubren precisión decimal, redondeo, monedas, referencias, estados, borrado de campos opcionales y seguridad del CSV.

Para revisar la aplicación en navegador: crear un cliente y un proyecto; registrar y aprobar un parte; generar la factura del mes; comprobar que el mismo parte no vuelve a facturarse; anular la factura y verificar la liberación; cambiar de empresa y recargar para comprobar aislamiento y persistencia de la prueba local.
