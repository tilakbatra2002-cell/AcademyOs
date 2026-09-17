import { Router } from 'express';
import * as c from '../controllers/communication.controller';
import { validate } from '../middleware/validate';
import { requirePermission } from '../middleware/auth';
import { idParamSchema } from '../utils/query';
import {
  createAnnouncementSchema, updateAnnouncementSchema, announcementQuerySchema,
  sendMessageSchema, communicationQuerySchema, notificationQuerySchema,
  createEventSchema, updateEventSchema, calendarQuerySchema,
  documentQuerySchema, searchQuerySchema, orgSettingsSchema,
} from '../validators/communication.validators';

const router = Router();

/* ------------------------------- Announcements ------------------------------- */
router.get('/announcements', requirePermission('announcement:read'), validate({ query: announcementQuerySchema }), c.listAnnouncements);
router.get('/announcements/:id', requirePermission('announcement:read'), validate({ params: idParamSchema }), c.getAnnouncement);
router.post('/announcements', requirePermission('announcement:create'), validate({ body: createAnnouncementSchema }), c.createAnnouncement);
router.patch('/announcements/:id', requirePermission('announcement:update'), validate({ params: idParamSchema, body: updateAnnouncementSchema }), c.updateAnnouncement);
router.delete('/announcements/:id', requirePermission('announcement:delete'), validate({ params: idParamSchema }), c.deleteAnnouncement);
router.post('/announcements/:id/read', requirePermission('announcement:read'), validate({ params: idParamSchema }), c.readAnnouncement);

/* ------------------------------- Communication ------------------------------- */
router.get('/messages', requirePermission('communication:read'), validate({ query: communicationQuerySchema }), c.listCommunications);
router.post('/messages', requirePermission('communication:create'), validate({ body: sendMessageSchema }), c.sendMessage);
router.get('/messages/provider-status', requirePermission('communication:read'), c.providerStatus);

/* ------------------------------- Notifications ------------------------------- */
router.get('/notifications', requirePermission('notification:read'), validate({ query: notificationQuerySchema }), c.listNotifications);
router.post('/notifications/read', requirePermission('notification:update'), c.readNotifications);
router.delete('/notifications/:id', requirePermission('notification:update'), validate({ params: idParamSchema }), c.deleteNotification);

/* ---------------------------------- Calendar --------------------------------- */
router.get('/calendar', requirePermission('calendar:read'), validate({ query: calendarQuerySchema }), c.calendar);
router.post('/calendar/events', requirePermission('calendar:create'), validate({ body: createEventSchema }), c.createEvent);
router.patch('/calendar/events/:id', requirePermission('calendar:update'), validate({ params: idParamSchema, body: updateEventSchema }), c.updateEvent);
router.delete('/calendar/events/:id', requirePermission('calendar:delete'), validate({ params: idParamSchema }), c.deleteEvent);

/* --------------------------------- Documents --------------------------------- */
router.get('/documents', requirePermission('document:read'), validate({ query: documentQuerySchema }), c.listDocuments);
router.get('/documents/:id/download', requirePermission('document:read'), validate({ params: idParamSchema }), c.documentDownload);
router.delete('/documents/:id', requirePermission('document:delete'), validate({ params: idParamSchema }), c.deleteDocument);

/* -------------------------------- Global search ------------------------------ */
router.get('/search', requirePermission('search:global'), validate({ query: searchQuerySchema }), c.globalSearch);

/* ------------------------------- Org settings -------------------------------- */
router.get('/settings', requirePermission('org:settings:read'), c.getSettings);
router.patch('/settings', requirePermission('org:settings:update'), validate({ body: orgSettingsSchema }), c.updateSettings);

export default router;
