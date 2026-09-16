import { Router } from 'express';
import * as c from '../controllers/auth.controller';
import { validate } from '../middleware/validate';
import { authenticate } from '../middleware/auth';
import { authLimiter } from '../middleware/rateLimit';
import {
  loginSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  updateProfileSchema,
} from '../validators/auth.validators';

const router = Router();

router.post('/login', authLimiter, validate({ body: loginSchema }), c.loginController);
router.post('/logout', c.logoutController);
router.post('/refresh', authLimiter, c.refreshController);
router.get('/me', authenticate, c.meController);
router.post('/change-password', authenticate, validate({ body: changePasswordSchema }), c.changePasswordController);
router.post('/forgot-password', authLimiter, validate({ body: forgotPasswordSchema }), c.forgotPasswordController);
router.post('/reset-password', authLimiter, validate({ body: resetPasswordSchema }), c.resetPasswordController);
router.patch('/profile', authenticate, validate({ body: updateProfileSchema }), c.updateProfileController);

export default router;
