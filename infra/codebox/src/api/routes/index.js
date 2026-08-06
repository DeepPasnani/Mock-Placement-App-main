import { Router } from 'express';
import submissionsRouter from './submissions.js';
import languagesRouter from './languages.js';
import systemRouter from './system.js';

const router = Router();

router.use('/submissions', submissionsRouter);
router.use('/languages', languagesRouter);
router.use('/', systemRouter);

export default router;
