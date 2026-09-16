import { Router } from 'express';
import { authenticate, tenantScope, requirePermission } from '../middleware/auth';
import authRoutes from './auth.routes';
import ownerRoutes from './owner.routes';
import crmRoutes from './crm.routes';
import peopleRoutes from './people.routes';
import academicsRoutes from './academics.routes';
import financeRoutes from './finance.routes';
import communicationRoutes from './communication.routes';
import portalRoutes from './portal.routes';
import reportRoutes from './report.routes';
import * as upload from '../controllers/upload.controller';
import * as comm from '../controllers/communication.controller';
import { documentUpload, videoUpload, anyFileUpload } from '../middleware/upload';
import { PLANS } from '../config/plans';
import { ok } from '../utils/http';

const router = Router();

/* --------------------------------- Public ---------------------------------- */
router.use('/auth', authRoutes);
router.get('/public/plans', (_req, res) => ok(res, { plans: Object.values(PLANS) }));
router.get('/public/branding/:slug', comm.publicBranding);
/** Signed private file access — the HMAC token itself is the authorization. */
router.get('/files/signed/:token', upload.serveSignedFile);

/* ------------------------------ Platform owner ------------------------------ */
router.use('/owner', ownerRoutes);

/* ------------------------- Tenant-scoped application ------------------------ */
// Every route below derives organizationId from the authenticated session only.
const tenant = Router();
tenant.use(authenticate, tenantScope);

tenant.use('/crm', crmRoutes);
tenant.use('/people', peopleRoutes);
tenant.use('/academics', academicsRoutes);
tenant.use('/finance', financeRoutes);
tenant.use('/comm', communicationRoutes);
tenant.use('/reports', reportRoutes);
tenant.use('/portal', portalRoutes);

/* --------------------------------- Uploads ---------------------------------- */
tenant.post('/uploads/document', requirePermission('document:create'), documentUpload.single('file'), upload.uploadDocument);
tenant.post('/uploads/video', requirePermission('video:create'), videoUpload.single('file'), upload.uploadVideoFile);
tenant.post('/uploads/file', requirePermission('material:create'), anyFileUpload.single('file'), upload.uploadFile);

router.use('/', tenant);

export default router;
