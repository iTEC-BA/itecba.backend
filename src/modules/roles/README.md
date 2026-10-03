# Módulo de roles y permisos

Este módulo administra el catálogo de roles de la aplicación y las
funcionalidades que cada rol puede utilizar. La asignación del rol a una
persona continúa viviendo en Firestore (`users/{uid}.role`), mientras que la
definición del rol se persiste en MongoDB mediante el modelo `Role`.

## Modelo

Cada documento contiene:

- `key`: identificador único usado por el usuario y por las reglas de acceso.
- `name`: nombre visible del rol.
- `description`: explicación para el panel administrativo.
- `permissions`: claves de funcionalidades, por ejemplo
  `publications.manage`.
- `isSystem`: impide eliminar los roles base de la plataforma.

Los roles base son `admin`, `moderator`, `student`, `ingresante`, `afiliado` y
`profesor`. Se crean automáticamente cuando se consulta el catálogo. El rol
`moderator` se sincroniza con el conjunto completo de permisos administrativos
para conservar acceso operativo a todos los módulos protegidos por el guard
legacy y por permisos explícitos.

## Autenticación y autorización

`verifyToken` valida el ID token de Firebase, obtiene el rol del documento
Firestore y carga sus permisos desde MongoDB. El resultado queda disponible
en `req.user`:

```js
{ uid, email, role, permissions }
```

Las rutas protegidas deben usar `requirePermission("clave.del.permiso")`.
Este middleware responde con `403` si el usuario autenticado no posee la
capacidad requerida. `requireAdmin` se conserva para módulos antiguos que aún
usan la autorización histórica.

El caché de autorización dura cinco minutos y se invalida cuando se actualiza
un rol o se asigna un rol a un usuario.

## Endpoints

| Método | Ruta | Permiso | Uso |
| --- | --- | --- | --- |
| `GET` | `/api/roles/me` | token válido | Devuelve el rol y permisos del usuario actual. |
| `GET` | `/api/roles` | `roles.manage` o `users.manage` | Lista el catálogo y asegura los roles base para administrar roles o asignarlos a usuarios. |
| `POST` | `/api/roles` | `roles.manage` | Crea un rol personalizado. |
| `PUT` | `/api/roles/:id` | `roles.manage` | Edita nombre, descripción y permisos. |
| `DELETE` | `/api/roles/:id` | `roles.manage` | Elimina únicamente roles no sistémicos. |
| `PATCH` | `/api/users/:uid/role` | administración de usuarios | Asigna un rol existente a un usuario. |

Las claves de roles y permisos se validan con un formato seguro y acotado
(`a-z`, números, punto, guion y guion bajo). Las claves de los roles no se
pueden cambiar y el rol `admin` siempre conserva `roles.manage`.

## Integración frontend

El frontend consulta `/api/roles/me` desde `useAuthorization` y expone
`can("permission.key")`. Esta función controla la visibilidad de acciones,
pero no reemplaza la validación del backend.

La pantalla administrativa está disponible en `/admin/roles`, usa el
servicio `admin.service.ts` y permite crear, editar permisos y eliminar roles
personalizados. El acceso visual se oculta sin `roles.manage`; la protección
real está en `AdminRoute`, Firebase y `requirePermission`.
