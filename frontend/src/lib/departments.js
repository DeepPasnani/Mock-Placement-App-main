// Only these departments may use the placement platform.
// Keep in sync with backend/src/config/departments.js.
export const ALLOWED_DEPARTMENTS = [
  'Computer Engineering',
  'Computer Science and Design',
];

// Single source of truth for class/label assignments. Import this
// everywhere classes are offered so Login, CompleteProfile and the
// docs never drift apart.
export const CLASSES = ['CE 1', 'CE 2', 'CE 3', 'CE 4'];