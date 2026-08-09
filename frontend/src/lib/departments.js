// Only these departments may use the placement platform.
// Keep in sync with backend/src/config/departments.js.
export const ALLOWED_DEPARTMENTS = [
  'Computer Engineering',
  'Computer Science and Design',
  'Aeronautical Engineering',
  'Information Technology',
  'Civil Engineering',
  'Electronics and Communication Engineering',
  'Electrical Engineering',
  'Mechanical Engineering',
];

// Single source of truth for class/batch labels. Import this
// everywhere batches are offered so Login, CompleteProfile and the
// docs never drift apart.
export const CLASSES = ['Batch 1', 'Batch 2', 'Batch 3', 'Batch 4'];
