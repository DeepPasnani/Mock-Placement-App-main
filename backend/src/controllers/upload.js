const fs = require('fs');
const path = require('path');

const UPLOADS_DIR = path.join(__dirname, '..', '..', 'uploads', 'images');

async function uploadImage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });

  res.json({
    url: '/uploads/images/' + req.file.filename,
    filename: req.file.filename,
  });
}

async function deleteImage(req, res) {
  const { publicId } = req.params;
  const filePath = path.join(UPLOADS_DIR, path.basename(publicId));

  try {
    await fs.promises.unlink(filePath);
  } catch {
    // file might not exist, that's okay
  }

  res.json({ message: 'Image deleted' });
}

module.exports = { uploadImage, deleteImage };
