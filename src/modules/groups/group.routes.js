import { Router } from 'express';
import { body }   from 'express-validator';
import { validate }                  from '../../middlewares/validate.js';
import { verifyToken, requireAdmin } from '../../middlewares/authMiddleware.js';
import {
  getApprovedGroups,
  getPendingGroups,
  getReportedGroups,
  createGroup,
  approveGroup,
  updateGroupLink,
  reportGroup,
  deleteGroup,
} from './group.controller.js';

const router = Router();

const groupValidators = [
  body('materia').trim().notEmpty().withMessage('Materia requerida'),
  body('carrera').trim().notEmpty().withMessage('Carrera requerida'),
  body('nivel').trim().notEmpty().withMessage('Nivel requerido'),
  body('comision').trim().notEmpty().withMessage('Comision requerida'),
  body('link').trim().isURL().withMessage('Link debe ser una URL valida'),
  body('tipo').optional().isIn(['Oficial', 'Alumnos']),
];

router.get('/',                getApprovedGroups);
router.post('/', verifyToken,  groupValidators, validate, createGroup);

router.get('/pending',         verifyToken, requireAdmin, getPendingGroups);
router.get('/reported',        verifyToken, requireAdmin, getReportedGroups);

router.put('/:id/approve',     verifyToken, requireAdmin, approveGroup);
router.put('/:id/link',        verifyToken, requireAdmin,
  [body('link').trim().isURL().withMessage('Link invalido')], validate,
  updateGroupLink
);
router.post('/:id/report',     verifyToken, reportGroup);
router.delete('/:id',          verifyToken, requireAdmin, deleteGroup);

export default router;
