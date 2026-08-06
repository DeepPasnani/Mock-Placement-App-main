import { Router } from 'express';
import { getLanguageById, getActiveLanguages, getAllLanguages } from '../../languages/index.js';

const router = Router();

router.get('/', (req, res) => {
  const languages = getActiveLanguages().map(lang => ({
    id: lang.id,
    name: lang.name,
  }));
  res.json(languages);
});

router.get('/all', (req, res) => {
  const languages = getAllLanguages().map(lang => ({
    id: lang.id,
    name: lang.name,
    is_archived: lang.is_archived,
  }));
  res.json(languages);
});

router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) {
    return res.status(400).json({
      error: 'Bad Request',
      message: 'Invalid language ID',
    });
  }
  const language = getLanguageById(id);
  if (!language) {
    return res.status(404).json({
      error: 'Not Found',
      message: `Language with ID ${id} not found`,
    });
  }
  res.json({
    id: language.id,
    name: language.name,
    is_archived: language.is_archived,
    source_file: language.source_file,
    compile_cmd: language.compile_cmd,
    run_cmd: language.run_cmd,
  });
});

export default router;
