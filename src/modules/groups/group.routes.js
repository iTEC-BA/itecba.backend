import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { validate }                  from '../../middlewares/validate.js';
import { verifyToken, requireAdmin } from '../../middlewares/authMiddleware.js';
import {
  getApprovedGroups,
  getGroupStats,
  getPendingGroups,
  getReportedGroups,
  createGroup,
  approveGroup,
  updateGroupLink,
  reportGroup,
  deleteGroup,
} from './group.controller.js';

const router = Router();

/** Carreras y niveles válidos (espejo del controller para validación temprana) */
const VALID_CARRERAS = [
  'sistemas', 'industrial', 'civil', 'electronica',
  'electrica', 'mecanica', 'quimica', 'naval',
  'textil', 'homogeneas', 'ingreso',
];
const VALID_NIVELES = ['0', '1', '2', '3', '4', '5', '6'];
const VALID_REASONS = ['link-invalido', 'link-incorrecto', 'grupo-lleno', 'otro'];

// ── Validadores para la búsqueda pública ─────────────────────────────────────
const searchValidators = [
  query('carrera')
    .optional()
    .trim()
    .isIn(VALID_CARRERAS)
    .withMessage('Especialidad inválida'),
  query('nivel')
    .optional()
    .trim()
    .isIn(VALID_NIVELES)
    .withMessage('Nivel inválido'),
  query('materia')
    .optional()
    .trim()
    .isLength({ max: 120 })
    .withMessage('Materia demasiado larga'),
  query('comision')
    .optional()
    .trim()
    .matches(/^[A-Za-z0-9]{0,10}$/)
    .withMessage('Comisión inválida (solo alfanumérico, máx 10 chars)'),
  query('page')
    .optional()
    .isInt({ min: 1, max: 9999 })
    .toInt()
    .withMessage('Página inválida'),
];

// ── Validadores para agregar un grupo ────────────────────────────────────────
const groupValidators = [
  body('materia')  .trim().notEmpty().withMessage('Materia requerida').isLength({ max: 120 }),
  body('carrera')  .trim().isIn(VALID_CARRERAS).withMessage('Carrera inválida'),
  body('nivel')    .trim().isIn(VALID_NIVELES).withMessage('Nivel inválido'),
  body('comision') .trim().notEmpty().withMessage('Comision requerida').isLength({ max: 30 }),
  body('link')     .trim().isURL({ require_protocol: true }).withMessage('Link debe ser una URL válida (https://...)'),
  body('tipo')     .optional().isIn(['Oficial', 'Alumnos']).withMessage('Tipo inválido'),
];

// ── Rutas públicas ────────────────────────────────────────────────────────────
router.get('/',
  searchValidators,
  validate,
  getApprovedGroups
);

// ── Rutas de admin ────────────────────────────────────────────────────────────
router.get('/stats',    verifyToken, requireAdmin, getGroupStats);
router.get('/pending',  verifyToken, requireAdmin, getPendingGroups);
router.get('/reported', verifyToken, requireAdmin, getReportedGroups);

// ── Agregar grupo (autenticado) ───────────────────────────────────────────────
router.post('/',
  verifyToken,
  groupValidators,
  validate,
  createGroup
);

// ── Acciones sobre grupos específicos ─────────────────────────────────────────
router.put('/:id/approve',
  verifyToken, requireAdmin,
  [param('id').isMongoId().withMessage('ID inválido')],
  validate,
  approveGroup
);

router.put('/:id/link',
  verifyToken, requireAdmin,
  [
    param('id').isMongoId().withMessage('ID inválido'),
    body('link').trim().isURL({ require_protocol: true }).withMessage('Link inválido'),
  ],
  validate,
  updateGroupLink
);

router.post('/:id/report',
  verifyToken,
  [
    param('id').isMongoId().withMessage('ID inválido'),
    body('reason').optional().isIn(VALID_REASONS).withMessage('Motivo inválido'),
    body('reporterEmail').optional().isEmail().normalizeEmail().withMessage('Email inválido'),
  ],
  validate,
  reportGroup
);

router.delete('/:id',
  verifyToken, requireAdmin,
  [param('id').isMongoId().withMessage('ID inválido')],
  validate,
  deleteGroup
);

export default router;
