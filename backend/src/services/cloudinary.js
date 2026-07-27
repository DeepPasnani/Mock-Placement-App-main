// NOTE: kept as "cloudinary.js" for backward compatibility with existing
// require('../services/cloudinary') imports, but this no longer talks to
// Cloudinary or any third-party file host. Uploaded images are buffered in
// memory here and then persisted as bytea rows in Postgres by
// controllers/upload.js — see the `images` table in db/migrate.js.
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed'));
  },
});

module.exports = { upload };
