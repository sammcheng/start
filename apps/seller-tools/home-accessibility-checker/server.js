/**
 * Express.js Backend for Accessibility Checker
 * Hackathon Alternative - Much faster to implement and debug
 */

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const winston = require('winston');

// Import services
const ComprehensiveAnalysisService = require('./services/comprehensive-analysis-service');
const ImageService = require('./services/image-service');
const ListingScraperService = require('./services/listing-scraper-service');
const ValidationService = require('./services/validation-service');

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;

// Configure Winston logger
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

// Security middleware
app.use(helmet());
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || '*',
  credentials: true
}));

// Logging middleware
app.use(morgan('combined', {
  stream: { write: message => logger.info(message.trim()) }
}));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  message: {
    error: 'Too many requests from this IP, please try again later.',
    retryAfter: '15 minutes'
  },
  standardHeaders: true,
  legacyHeaders: false
});
app.use('/api/', limiter);

// Body parsing middleware
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, 'tmp', 'uploads');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = `${uuidv4()}-${file.originalname}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB limit
    files: 5 // Maximum 5 files
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = /jpeg|jpg|png|webp/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only image files (JPEG, PNG, WebP) are allowed!'));
    }
  }
});

// Initialize services
const comprehensiveAnalysisService = new ComprehensiveAnalysisService();
const imageService = new ImageService();
const listingScraperService = new ListingScraperService();
const validationService = new ValidationService();

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Upload endpoint
app.post('/api/upload', upload.array('images', 5), async (req, res) => {
  try {
    logger.info('Upload request received', { 
      fileCount: req.files?.length || 0,
      ip: req.ip 
    });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No images provided',
        message: 'Please upload at least one image'
      });
    }

    // Process and validate images
    const processedImages = [];
    for (const file of req.files) {
      try {
        // Optimize image
        const optimizedPath = await imageService.optimizeImage(file.path);
        
        // Convert to base64
        const base64Image = await imageService.convertToBase64(optimizedPath);
        
        processedImages.push({
          filename: file.originalname,
          base64: base64Image,
          size: file.size,
          mimetype: file.mimetype
        });

        // Clean up temporary files
        fs.unlinkSync(file.path);
        if (optimizedPath !== file.path) {
          fs.unlinkSync(optimizedPath);
        }
      } catch (error) {
        logger.error('Error processing image', { 
          filename: file.originalname, 
          error: error.message 
        });
        // Continue with other images
      }
    }

    if (processedImages.length === 0) {
      return res.status(400).json({
        error: 'No valid images processed',
        message: 'All uploaded images failed processing'
      });
    }

    res.json({
      success: true,
      message: 'Images uploaded successfully',
      images: processedImages.map(img => ({
        filename: img.filename,
        size: img.size,
        mimetype: img.mimetype
      })),
      count: processedImages.length
    });

  } catch (error) {
    logger.error('Upload error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Upload failed',
      message: 'Internal server error during image upload'
    });
  }
});

// Analyze endpoint
app.post('/api/analyze', async (req, res) => {
  try {
    logger.info('Analysis request received', { ip: req.ip });

    const validationResult = validationService.validateAnalyzeRequest(req.body);
    if (validationResult.error) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error.details
      });
    }

    const finalResult = await analyzeAccessibilityRequest(validationResult.value);

    logger.info('Analysis completed', { 
      score: finalResult.analysis.overall_score, 
      imageCount: finalResult.analysis.analyzed_images 
    });

    res.json(finalResult);

  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.publicError || 'Analysis failed',
        message: error.message
      });
    }

    logger.error('Analysis error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Analysis failed',
      message: 'Internal server error during analysis'
    });
  }
});

// Root endpoint for Hackmarket gateway compatibility
app.post('/', async (req, res) => {
  try {
    logger.info('Root analysis request received', { ip: req.ip });

    const validationResult = validationService.validateAnalyzeRequest(req.body);
    if (validationResult.error) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error.details
      });
    }

    const finalResult = await analyzeAccessibilityRequest(validationResult.value);

    logger.info('Root analysis completed', {
      score: finalResult.analysis.overall_score,
      imageCount: finalResult.analysis.analyzed_images
    });

    res.json(finalResult);
  } catch (error) {
    if (error.statusCode) {
      return res.status(error.statusCode).json({
        error: error.publicError || 'Analysis failed',
        message: error.message
      });
    }

    logger.error('Root analysis error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Analysis failed',
      message: 'Internal server error during analysis'
    });
  }
});

// Combined upload and analyze endpoint
app.post('/api/upload-and-analyze', upload.array('images', 5), async (req, res) => {
  try {
    logger.info('Upload and analyze request received', { 
      fileCount: req.files?.length || 0,
      ip: req.ip 
    });

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({
        error: 'No images provided',
        message: 'Please upload at least one image'
      });
    }

    // Process images
    const processedImages = [];
    for (const file of req.files) {
      try {
        const optimizedPath = await imageService.optimizeImage(file.path);
        const base64Image = await imageService.convertToBase64(optimizedPath);
        
        processedImages.push({
          filename: file.originalname,
          base64: base64Image,
          size: file.size,
          mimetype: file.mimetype
        });

        // Clean up
        fs.unlinkSync(file.path);
        if (optimizedPath !== file.path) {
          fs.unlinkSync(optimizedPath);
        }
      } catch (error) {
        logger.error('Error processing image', { 
          filename: file.originalname, 
          error: error.message 
        });
      }
    }

    if (processedImages.length === 0) {
      return res.status(400).json({
        error: 'No valid images processed',
        message: 'All uploaded images failed processing'
      });
    }

    // Use comprehensive analysis service (Rekognition + Claude)
    const finalResult = await comprehensiveAnalysisService.analyzeImages(processedImages);

    res.json(finalResult);

  } catch (error) {
    logger.error('Upload and analyze error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Processing failed',
      message: 'Internal server error during upload and analysis'
    });
  }
});

// Web scraping endpoint using Python scraper
app.post('/api/scrape', async (req, res) => {
  try {
    logger.info('Scraping request received', { 
      url: req.body.url,
      ip: req.ip 
    });

    const validationResult = validationService.validateScrapeRequest(req.body);
    if (validationResult.error) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error.details
      });
    }

    const { url, maxImages = 10 } = validationResult.value;
    const result = await scrapeImagesWithPython(url, maxImages);

    if (result.images.length === 0) {
      return res.status(404).json({
        error: 'No images found',
        message: 'No images could be scraped from the provided URL'
      });
    }

    res.json({
      success: true,
      message: `Successfully scraped ${result.images.length} images`,
      images: result.images,
      propertyDetails: result.propertyDetails || {},
      count: result.images.length,
      url
    });

  } catch (error) {
    logger.error('Scraping error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Scraping failed',
      message: 'Internal server error during image scraping'
    });
  }
});

async function analyzeAccessibilityRequest(payload) {
  const images = await resolveImagesForAnalysis(payload);
  const finalResult = await comprehensiveAnalysisService.analyzeImages(images);

  if (payload.url) {
    finalResult.source = {
      type: 'url',
      url: payload.url,
      scraped_images: images.length
    };
  } else {
    finalResult.source = {
      type: 'images',
      uploaded_images: images.length
    };
  }

  return finalResult;
}

async function resolveImagesForAnalysis(payload) {
  if (Array.isArray(payload.images) && payload.images.length > 0) {
    return payload.images;
  }

  let scrapeResult;
  try {
    scrapeResult = await scrapeImagesWithPython(payload.url, payload.maxImages || 10);
  } catch (scrapeError) {
    const error = new Error(
      scrapeError.userMessage || 'We could not fetch listing images from that URL. Try uploading photos directly instead.'
    );
    error.statusCode = scrapeError.statusCode || 502;
    error.publicError = scrapeError.publicError || 'Listing fetch failed';
    throw error;
  }

  if (!scrapeResult.images.length) {
    const error = new Error('No images could be scraped from the provided URL');
    error.statusCode = 404;
    error.publicError = 'No images found';
    throw error;
  }

  const processedImages = [];
  for (const [index, image] of scrapeResult.images.entries()) {
    try {
      processedImages.push(await imageService.fetchImageAsPayload(image.url, index));
    } catch (error) {
      logger.warn('Skipping scraped image that failed to download', {
        imageUrl: image.url,
        index,
        error: error.message
      });
    }
  }

  if (!processedImages.length) {
    const error = new Error('Scraped listing images could not be downloaded for analysis');
    error.statusCode = 502;
    error.publicError = 'Scraped images unavailable';
    throw error;
  }

  return processedImages;
}

// Helper function to call Python scraper
async function scrapeImagesWithPython(url, maxImages) {
  logger.info('Calling listing scraper', {
    url,
    maxImages
  });
  return await listingScraperService.scrape(url, maxImages);
}

// Error handling middleware
app.use((error, req, res, next) => {
  logger.error('Unhandled error', { 
    error: error.message, 
    stack: error.stack,
    url: req.url,
    method: req.method
  });

  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'File too large',
        message: 'File size must be less than 10MB'
      });
    }
    if (error.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        error: 'Too many files',
        message: 'Maximum 5 files allowed'
      });
    }
  }

  res.status(500).json({
    error: 'Internal server error',
    message: 'An unexpected error occurred'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    message: 'The requested endpoint does not exist'
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Accessibility Checker API running on port ${PORT}`);
  logger.info(`📊 Health check: http://localhost:${PORT}/health`);
  logger.info(`🔍 API endpoints:`);
  logger.info(`   POST /api/upload - Upload images`);
  logger.info(`   POST /api/analyze - Analyze images`);
  logger.info(`   POST /api/upload-and-analyze - Upload and analyze in one request`);
  logger.info(`   POST /api/scrape - Scrape images from URLs using Python scraper`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

module.exports = app;
