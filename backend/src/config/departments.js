// Only these departments are eligible to use this placement platform.
// Every new/existing student account, test, drive and batch is restricted to
// this list.
const ALLOWED_DEPARTMENTS = [
  'Computer Engineering',
  'Computer Science and Design',
];

const ALLOWED_SET = new Set(ALLOWED_DEPARTMENTS);

// Normalise common hand-typed ''/'' spellings to the canonical names above.
const ALIASES = {
  'ce': 'Computer Engineering',
  'cse': 'Computer Engineering',
  'computer': 'Computer Engineering',
  'computerengineering': 'Computer Engineering',
  'computer engineering': 'Computer Engineering',
  'csd': 'Computer Science and Design',
  'csdesign': 'Computer Science and Design',
  'c s d': 'Computer Science and Design',
  'cs design': 'Computer Science and Design',
  'computerscienceanddesign': 'Computer Science and Design',
  'computer science and design': 'Computer Science and Design',
};

function normalizeDepartment(value) {
  if (value === undefined || value === null) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  const key = raw.toLowerCase();
  const compact = key.replace(/\s+/g, '');
  if (ALIASES[compact]) return ALIASES[compact];
  if (ALIASES[key]) return ALIASES[key];
  return ALLOWED_DEPARTMENTS.find(d => d.toLowerCase() === key) || null;
}

function isAllowedDepartment(value) {
  return Boolean(normalizeDepartment(value));
}

module.exports = {
  ALLOWED_DEPARTMENTS,
  ALLOWED_SET,
  normalizeDepartment,
  isAllowedDepartment,
};