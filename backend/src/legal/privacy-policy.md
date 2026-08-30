# Política de Tratamiento de Datos Personales

**Versión:** 2026-08-30  
**Responsable:** AgroTech Boyacá (marketplace agrícola del departamento de Boyacá, Colombia).

Esta política se expide en cumplimiento de la Ley 1581 de 2012, el Decreto 1377 de 2013 y demás normas de habeas data. Al marcar «Acepto la Política de Tratamiento de Datos Personales» usted otorga **consentimiento previo, expreso e informado** para el tratamiento descrito aquí.

## 1. Datos que recolectamos

Según el tipo de cuenta:

- **Persona natural (productor):** número de teléfono celular.
- **Persona jurídica (asociación, cooperativa o empresa):** correo electrónico, NIT y tipo de entidad.

También se generan identificadores técnicos de sesión (tokens) necesarios para autenticarlo.

## 2. Finalidad

Los datos se usan únicamente para:

- Crear y autenticar su cuenta.
- Operar el directorio y las funciones del marketplace (contacto entre productores y compradores).
- Cumplir obligaciones legales y atender requerimientos de autoridad.
- Conservar evidencia del consentimiento (versión de esta política y fecha de aceptación).

No vendemos datos personales ni los usamos para publicidad de terceros.

## 3. Encargados y ubicación

El tratamiento se apoya en proveedores de autenticación (SMS y correo), hospedaje de la API, base de datos y caché de sesión. Los datos en reposo de teléfono, correo y NIT se cifran (AES-256). Los registros de operación no guardan esos datos en claro.

## 4. Derechos del titular (art. 8, Ley 1581)

Usted puede conocer, actualizar, rectificar y suprimir sus datos, y revocar esta autorización, salvo que exista un deber legal de conservarlos.

## 5. Cómo ejercer el habeas data

Con una cuenta activa, envíe `POST /auth/privacy/deletion-request` al API (requiere inicio de sesión). En el MVP la eliminación la ejecuta el operador de forma manual a partir de esa solicitud. También puede escribir al responsable de la plataforma identificándose y precisando el derecho que ejerce.

## 6. Conservación

Los datos se conservan mientras la cuenta exista y, después de una solicitud de supresión, el tiempo mínimo necesario para cumplir la ley o defender un reclamo.

## 7. Cambios

Si esta política cambia de forma sustancial, se publicará una nueva versión en `GET /legal/privacy-policy` y se pedirá un nuevo consentimiento cuando corresponda.
