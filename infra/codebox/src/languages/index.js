import python from './python.js';
import javascript from './javascript.js';
import cpp from './cpp.js';
import c from './c.js';
import java from './java.js';
import go from './go.js';
import ruby from './ruby.js';
import rust from './rust.js';
import kotlin from './kotlin.js';
import sql from './sql.js';

const languagesById = new Map();
const languagesList = [python, javascript, cpp, c, java, go, ruby, rust, kotlin, sql];

languagesList.forEach(lang => {
  languagesById.set(lang.id, lang);
});

export function getLanguageById(id) {
  return languagesById.get(id) || null;
}

export function getActiveLanguages() {
  return languagesList.filter(lang => !lang.is_archived);
}

export function getAllLanguages() {
  return languagesList;
}

export function isValidLanguageId(id) {
  return languagesById.has(id);
}

export const STATUSES = {
  1: { id: 1, description: 'In Queue' },
  2: { id: 2, description: 'Processing' },
  3: { id: 3, description: 'Accepted' },
  4: { id: 4, description: 'Wrong Answer' },
  5: { id: 5, description: 'Time Limit Exceeded' },
  6: { id: 6, description: 'Compilation Error' },
  7: { id: 7, description: 'Runtime Error (SIGSEGV)' },
  8: { id: 8, description: 'Runtime Error (SIGXFSZ)' },
  9: { id: 9, description: 'Runtime Error (SIGFPE)' },
  10: { id: 10, description: 'Runtime Error (SIGABRT)' },
  11: { id: 11, description: 'Runtime Error (NZEC)' },
  12: { id: 12, description: 'Runtime Error (Other)' },
  13: { id: 13, description: 'Internal Error' },
  14: { id: 14, description: 'Exec Format Error' },
};

export function getStatusById(id) {
  return STATUSES[id] || null;
}

export function getAllStatuses() {
  return Object.values(STATUSES);
}

export default {
  getLanguageById,
  getActiveLanguages,
  getAllLanguages,
  isValidLanguageId,
  getStatusById,
  getAllStatuses,
  STATUSES,
};
