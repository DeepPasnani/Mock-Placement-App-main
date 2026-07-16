const { cloudinary } = require('../services/cloudinary');

const generatePlaceholderUrl = (filename) => {
  const placeholderImages = [
    'https://placehold.co/600x400/1a1a1a/ffffff?text=Test+Image',
    'https://placehold.co/600x400/262626/ffffff?text=Placement+Test',
    'https://placehold.co/600x400/333333/ffffff?text=Question+Image',
  ];
  return placeholderImages[Math.floor(Math.random() * placeholderImages.length)];
};

// POST /api/upload/image
async function uploadImage(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No image file provided' });
  
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
    res.json({
      url: req.file.path,
      publicId: req.file.filename,
      width: req.file.width,
      height: req.file.height,
    });
  } else {
    res.json({
      url: generatePlaceholderUrl(req.file.originalname),
      publicId: 'placeholder_' + Date.now(),
    });
  }
}

// DELETE /api/upload/image/:publicId
async function deleteImage(req, res) {
  const { publicId } = req.params;
  
  if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY) {
    await cloudinary.uploader.destroy(publicId);
  }
  
  res.json({ message: 'Image deleted' });
}

module.exports = { uploadImage, deleteImage };
