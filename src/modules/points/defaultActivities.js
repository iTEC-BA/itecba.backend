// src/modules/points/defaultActivities.js
// Actividades que se cargan la primera vez que el servidor arranca con la
// colección vacía. Los admins pueden modificarlos después desde el panel.
export const DEFAULT_ACTIVITIES = [
  {
    key:              "forum_post",
    name:             "Publicar en el foro",
    description:      "El usuario crea un post nuevo (no una respuesta) en el foro anónimo.",
    points:           5,
    cooldownMinutes:  60,
    dailyCap:         3,
    isActive:         true,
  },
  {
    key:              "forum_reply",
    name:             "Responder en el foro",
    description:      "El usuario responde un post en el foro anónimo.",
    points:           3,
    cooldownMinutes:  30,
    dailyCap:         5,
    isActive:         true,
  },
  {
    key:              "resource_upload",
    name:             "Subir un recurso",
    description:      "El usuario sube un material de estudio al módulo de recursos.",
    points:           10,
    cooldownMinutes:  0,
    dailyCap:         2,
    isActive:         true,
  },
  {
    key:              "group_propose",
    name:             "Proponer un grupo",
    description:      "El usuario propone un nuevo grupo de estudio (queda pendiente de aprobación).",
    points:           8,
    cooldownMinutes:  0,
    dailyCap:         2,
    isActive:         true,
  },
  {
    key:              "profile_complete",
    name:             "Completar el perfil",
    description:      "El usuario completa los campos del perfil (legajo, carrera, etc.).",
    points:           15,
    cooldownMinutes:  0,
    dailyCap:         1,
    isActive:         true,
  },
  {
    key:              "daily_login",
    name:             "Login diario",
    description:      "El usuario inicia sesión. Solo otorga puntos una vez por día.",
    points:           2,
    cooldownMinutes:  1440, // 24 h
    dailyCap:         1,
    isActive:         true,
  },
  {
    key:              "trueketec_post",
    name:             "Publicar en TruekeTEC",
    description:      "El usuario crea una solicitud de intercambio de comisiones.",
    points:           5,
    cooldownMinutes:  0,
    dailyCap:         3,
    isActive:         true,
  },
];
