# Backup Operativo

La app ya tiene un script de backup local:

```bash
npm run backup
```

Genera una carpeta nueva en:

```txt
C:\Users\alan_\Desktop\Backups Squash Reservas
```

Cada backup incluye:

- `code/repo-head.zip`
  - snapshot del código versionado actual
- `data/*.json`
  - export lógico de las tablas principales de Supabase
- `kv/*.json`
  - estados operativos guardados en KV
- `storage/avatars`
  - copia de las fotos de perfil activas
- `meta/*`
  - commit, branch, resumen de tablas, resumen de KV y manifiestos

## Qué cubre

- código del proyecto
- perfiles
- reservas
- horarios y canchas
- torneos
- mensajes
- partidos casuales
- disponibilidad para partidos
- auditoría
- estados del vivo
- listas de espera
- fotos de perfil

## Qué no reemplaza

Este backup es útil para restauración operativa y respaldo local, pero no reemplaza:

- backups nativos de Postgres a nivel base
- snapshots administrados de Supabase
- una política formal de secretos/credenciales

## Recomendación práctica

- correrlo antes de cambios grandes
- correrlo al menos una vez por semana
- conservar varias carpetas históricas
- copiar periódicamente la carpeta de backups a otro disco o nube privada
