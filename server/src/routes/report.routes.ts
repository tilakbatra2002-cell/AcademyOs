import { Router } from 'express';
import * as c from '../controllers/report.controller';
import { validate } from '../middleware/validate';
import { requirePermission } from '../middleware/auth';
import { reportQuerySchema } from '../validators/communication.validators';
import { importStudentsSchema, importLeadsSchema } from '../validators/people.validators';
import { csvUpload } from '../middleware/upload';

const router = Router();

router.get('/revenue', requirePermission('report:read'), validate({ query: reportQuerySchema }), c.revenue);
router.get('/admissions', requirePermission('report:read'), validate({ query: reportQuerySchema }), c.admissions);
router.get('/attendance', requirePermission('report:read'), validate({ query: reportQuerySchema }), c.attendance);
router.get('/performance', requirePermission('report:read'), validate({ query: reportQuerySchema }), c.performance);
router.get('/teachers', requirePermission('report:read'), validate({ query: reportQuerySchema }), c.teachers);
router.get('/students', requirePermission('report:read'), validate({ query: reportQuerySchema }), c.students);

/* -------------------------------- Import/export ------------------------------ */
router.get('/export/:entity', requirePermission('export:run'), c.exportCsv);
router.get('/import/template/:entity', requirePermission('import:run'), c.importTemplate);
router.post('/import/parse', requirePermission('import:run'), csvUpload.single('file'), c.parseUploadedCsv);
router.post('/import/students', requirePermission('import:run'), validate({ body: importStudentsSchema }), c.importStudents);
router.post('/import/leads', requirePermission('import:run'), validate({ body: importLeadsSchema }), c.importLeads);

export default router;
