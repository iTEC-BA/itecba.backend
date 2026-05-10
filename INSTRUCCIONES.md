# Integración del módulo de notificaciones en el backend

## 1. Copiar los archivos
```bash
cp notification.controller.js ../itecba-backend/src/modules/notifications/
cp notification.routes.js     ../itecba-backend/src/modules/notifications/
```

## 2. Agregar la ruta en src/index.js
```js
import notificationRoutes from './modules/notifications/notification.routes.js';
import { initWebPush }     from './modules/notifications/notification.controller.js';

// Después de initForumDB():
initWebPush();

// En las rutas:
app.use('/api/notifications', notificationRoutes);
```

## 3. Usar broadcastPush en los triggers correctos

### ─ Nuevo beneficio (benefit.controller.js) ─
```js
import { broadcastPush } from '../notifications/notification.controller.js';
// Al final de createBenefit():
await broadcastPush({
  title:  '🎁 Nuevo beneficio disponible',
  body:   `${title} — Descuento exclusivo para estudiantes iTEC`,
  url:    '/perfil',
  source: 'benefits',
  priority: 'normal',
});
```

### ─ Noticia crítica (ads.controller.js) ─
```js
import { broadcastPush } from '../notifications/notification.controller.js';
// Solo si priority === 'alta':
if (priority === 'alta') {
  await broadcastPush({
    title:  `📢 ${title}`,
    body:   body,
    url:    '/',
    source: 'news',
    priority: 'high',
  });
}
```

### ─ Canje exitoso (rewards.controller.js) ─
```js
import { pushToUser } from '../notifications/notification.controller.js';
// Al confirmar el canje:
await pushToUser(req.user.uid, {
  title:  '✅ Canje confirmado',
  body:   `Tu canje de ${rewardName} fue procesado. Retiralo en administración.`,
  url:    '/perfil',
  source: 'rewards',
  priority: 'normal',
});
```

### ─ Puntos otorgados (user.controller.js) ─
```js
import { pushToUser } from '../notifications/notification.controller.js';
await pushToUser(uid, {
  title:  `+${points} puntos 🏆`,
  body:   'Seguí participando para desbloquear más recompensas.',
  url:    '/perfil',
  source: 'points',
  priority: 'low',
});
```

### ─ Recordatorio calendario (calendar.controller.js) ─
// Ya tenés checkAndSendReminders() — reemplazá webpush.sendNotification directo
// por broadcastPush() con source: 'calendar'.

## 4. Cuándo dispara cada notificación

| Evento                          | Canal         | Trigger                                  |
|----------------------------------|---------------|------------------------------------------|
| Nuevo beneficio                  | Push broadcast| POST /api/benefits (admin)               |
| Aviso crítico                    | Push broadcast| POST /api/announcements (priority=alta)  |
| Canje exitoso                    | Push usuario  | POST /api/rewards/redeem                 |
| Puntos otorgados                 | Push usuario  | PATCH /api/users/:uid/points             |
| Recordatorio examen/evento       | Push broadcast| Cron 24h antes (checkAndSendReminders)   |
| Respuesta en foro                | Push usuario  | POST /api/forum/posts/:id/replies        |
| Confirmación tutoría             | Push usuario  | PATCH /api/tutorships/:id (status=OK)    |
| Recordatorio tutoría (2h antes)  | Push usuario  | Cron cada hora (busca tutorships en 2h)  |

## 5. Email (nodemailer triggers)
Los emails se envían desde los controllers que ya tienen nodemailer.
No agregar push Y email en el mismo evento — elegir uno según urgencia.
- Push: feedback inmediato, recordatorios
- Email: confirmaciones con detalle (canje, tutoría), seguridad (login nuevo)
