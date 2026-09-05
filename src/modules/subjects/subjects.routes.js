import { Router } from 'express';
import { body, query, param } from 'express-validator';
import { validate } from '../../middlewares/validate.js';
import { verifyToken, requireAdmin } from '../../middlewares/authMiddleware.js';
import {
  getSubjects,
  searchSubjects,
  getCarreras,
  getCorrelativas,
  createSubject,
  updateSubject,
  deleteSubject,
} from './subjects.controller.js';

const router = Router();

const subjectValidators = [
  body('carrera').trim().notEmpty().withMessage('carrera requerida'),
  body('nivel').isInt({ min: 0, max: 6 }).withMessage('nivel debe ser un entero entre 0 y 6'),
  body('materia').trim().notEmpty().withMessage('materia requerida'),
  body('codigo').optional({ nullable: true }).trim(),
  body('sigla').optional({ nullable: true }).trim(),
  body('subjectKey').optional({ nullable: true }).trim(),
];

// ── Públicas ─────────────────────────────────────────────────────────────
router.get('/', getSubjects);
router.get('/carreras', getCarreras);
router.get(
  '/search',
  [query('q').trim().notEmpty().withMessage('Parámetro q requerido')],
  validate,
  searchSubjects
);
router.get(
  '/:subjectKey/correlativas',
  [param('subjectKey').trim().notEmpty()],
  validate,
  getCorrelativas
);

// ── Admin ────────────────────────────────────────────────────────────────
router.post('/', verifyToken, requireAdmin, subjectValidators, validate, createSubject);
router.put('/:id', verifyToken, requireAdmin, subjectValidators, validate, updateSubject);
router.delete('/:id', verifyToken, requireAdmin, deleteSubject);

export default router;
