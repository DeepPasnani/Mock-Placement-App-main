import axios from 'axios';
import toast from 'react-hot-toast';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || '/api',
  timeout: 30000,
});

// Attach JWT on every request
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('pp_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Error message mapper ─────────────────────────────────────
// Translates backend error text into user-friendly messages
// so T&P coordinators never see raw server jargon.
const friendlyErrors = {
  'duplicate key value violates unique constraint': 'This record already exists (duplicate entry).',
  'violates foreign key constraint': 'Referenced record not found. Please check your selection.',
  'violates not-null constraint': 'A required field is missing. Please fill in all fields.',
  'value too long': 'Input is too long. Please shorten it.',
  'invalid input syntax': 'Invalid value format. Please check your input.',
  'password': 'Password verification failed.',
  'email': 'Email address is invalid.',
};

function humanizeError(msg) {
  if (!msg) return 'Something went wrong. Please try again.';
  const lower = msg.toLowerCase();
  for (const [pattern, friendly] of Object.entries(friendlyErrors)) {
    if (lower.includes(pattern)) return friendly;
  }
  return msg;
}

// Global error handling
api.interceptors.response.use(
  (res) => res,
  (err) => {
    const msg = humanizeError(err.response?.data?.error);
    if (err.response?.status === 401) {
      localStorage.removeItem('pp_token');
      window.location.href = '/login';
    } else if (err.response?.status !== 400) {
      toast.error(msg);
    }
    return Promise.reject(err);
  }
);

// ── Auth ──────────────────────────────────────────────────────
export const authAPI = {
  login:           (data)       => api.post('/auth/login', data).then(r => r.data),
  register:        (data)       => api.post('/auth/register', data).then(r => r.data),
  googleLogin:     (credential) => api.post('/auth/google', { credential }).then(r => r.data),
  logout:          ()           => api.post('/auth/logout').then(r => r.data),
  getMe:           ()           => api.get('/auth/me').then(r => r.data),
  changePassword:  (data)       => api.post('/auth/change-password', data).then(r => r.data),
  forgotPassword:  (data)       => api.post('/auth/forgot-password', data).then(r => r.data),  // NEW
  resetPassword:   (data)       => api.post('/auth/reset-password', data).then(r => r.data),   // NEW
};

// ── Tests ─────────────────────────────────────────────────────
export const testsAPI = {
  list:       ()         => api.get('/tests').then(r => r.data),
  get:        (id)       => api.get(`/tests/${id}`).then(r => r.data),
  create:     (data)     => api.post('/tests', data).then(r => r.data),
  update:     (id, data) => api.put(`/tests/${id}`, data).then(r => r.data),
  delete:     (id)       => api.delete(`/tests/${id}`).then(r => r.data),
  duplicate:  (id)       => api.post(`/tests/${id}/duplicate`).then(r => r.data),
};

// ── Submissions ───────────────────────────────────────────────
export const submissionsAPI = {
  start:      (testId) => api.post('/submissions/start', { testId }).then(r => r.data),
  save:       (data)   => api.post('/submissions/save', data).then(r => r.data),
  submit:     (data)   => api.post('/submissions/submit', data).then(r => r.data),
  runCode:    (data)   => api.post('/submissions/run-code', data).then(r => r.data),
  getMy:      ()       => api.get('/submissions/my').then(r => r.data),
  getForTest: (testId) => api.get(`/submissions/test/${testId}`).then(r => r.data),
  exportPdf:  (testId) => api.get(`/submissions/test/${testId}/export-pdf`, { responseType: 'blob' }).then(r => r.data),
  get:        (id)     => api.get(`/submissions/${id}`).then(r => r.data),
  delete:     (id)     => api.delete(`/submissions/${id}`).then(r => r.data),
};

// ── Users ─────────────────────────────────────────────────────
export const usersAPI = {
  list:        (params) => api.get('/users', { params }).then(r => r.data),
  stats:       ()       => api.get('/users/stats').then(r => r.data),
  createAdmin: (data)   => api.post('/users/admin', data).then(r => r.data),
  bulkImport:  (data)   => api.post('/users/bulk-import', data).then(r => r.data),
  update:      (id, data) => api.patch(`/users/${id}`, data).then(r => r.data),
  delete:      (id)     => api.delete(`/users/${id}`).then(r => r.data),
  listAdmins:  ()       => api.get('/admins').then(r => r.data),
  notifyTest:  (data)   => api.post('/users/notify-test', data).then(r => r.data),   // NEW
  sendResults: (data)   => api.post('/users/send-results', data).then(r => r.data),  // NEW
};

// ── Batches ───────────────────────────────────────────────────
export const batchesAPI = {
  list:       ()       => api.get('/batches').then(r => r.data),
  create:     (data)   => api.post('/batches', data).then(r => r.data),
  delete:     (id)     => api.delete(`/batches/${id}`).then(r => r.data),
  assign:     (data)   => api.post('/batches/assign', data).then(r => r.data),
  listForTest: (id)    => api.get(`/tests/${id}/batches`).then(r => r.data),
  mapToTest:  (id, data) => api.post(`/tests/${id}/batches`, data).then(r => r.data),
};

// ── Question Bank ─────────────────────────────────────────────
export const questionBankAPI = {
  list:    (params) => api.get('/question-bank', { params }).then(r => r.data),
  create:  (data)   => api.post('/question-bank', data).then(r => r.data),
  import:  (data)   => api.post('/question-bank/import', data).then(r => r.data),
  delete:  (id)     => api.delete(`/question-bank/${id}`).then(r => r.data),
};

// ── Upload ────────────────────────────────────────────────────
export const uploadAPI = {
  image: (file) => {
    const fd = new FormData();
    fd.append('image', file);
    return api.post('/upload/image', fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    }).then(r => r.data);
  },
  deleteImage: (publicId) => api.delete(`/upload/image/${encodeURIComponent(publicId)}`).then(r => r.data),
};

export default api;
