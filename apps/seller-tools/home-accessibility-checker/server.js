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
const Joi = require('joi');
const winston = require('winston');
const { spawn } = require('child_process');

// Import services
const ComprehensiveAnalysisService = require('./services/comprehensive-analysis-service');
const ImageService = require('./services/image-service');
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

    // Validate request body
    const validationResult = validationService.validateAnalyzeRequest(req.body);
    if (validationResult.error) {
      return res.status(400).json({
        error: 'Invalid request',
        details: validationResult.error.details
      });
    }

    const { images } = req.body;

    if (!images || images.length === 0) {
      return res.status(400).json({
        error: 'No images provided',
        message: 'Please provide images for analysis'
      });
    }

    // Use comprehensive analysis service (Rekognition + Claude)
    const finalResult = await comprehensiveAnalysisService.analyzeImages(images);

    logger.info('Analysis completed', { 
      score: finalResult.analysis.overall_score, 
      imageCount: finalResult.analysis.analyzed_images 
    });

    res.json(finalResult);

  } catch (error) {
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

    const { images } = req.body;

    if (!images || images.length === 0) {
      return res.status(400).json({
        error: 'No images provided',
        message: 'Please provide images for analysis'
      });
    }

    const finalResult = await comprehensiveAnalysisService.analyzeImages(images);

    logger.info('Root analysis completed', {
      score: finalResult.analysis.overall_score,
      imageCount: finalResult.analysis.analyzed_images
    });

    res.json(finalResult);
  } catch (error) {
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

    const { url, maxImages = 20 } = req.body;

    if (!url) {
      return res.status(400).json({
        error: 'No URL provided',
        message: 'Please provide a URL to scrape'
      });
    }

    // Validate URL format
    try {
      new URL(url);
    } catch (error) {
      return res.status(400).json({
        error: 'Invalid URL',
        message: 'Please provide a valid URL'
      });
    }

             // Call Python scraper
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
               url: url
             });

  } catch (error) {
    logger.error('Scraping error', { error: error.message, stack: error.stack });
    res.status(500).json({
      error: 'Scraping failed',
      message: 'Internal server error during image scraping'
    });
  }
});

// Helper function to call Python scraper
async function scrapeImagesWithPython(url, maxImages) {
  return new Promise((resolve, reject) => {
    const pythonPath = process.env.PYTHON_PATH || 'python3';
    const scraperPath = path.join(__dirname, '..', 'zillow_image_scraper.py');
    const mockScraperPath = path.join(__dirname, '..', 'mock_scraper.py');
    
    logger.info('Calling Python scraper', { 
      pythonPath, 
      scraperPath, 
      url, 
      maxImages 
    });

    const pythonProcess = spawn(pythonPath, [scraperPath, url, '--download'], {
      cwd: path.join(__dirname, '..'),
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let stdout = '';
    let stderr = '';

    pythonProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    pythonProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

             pythonProcess.on('close', (code) => {
               if (code === 0) {
                 try {
                   // Parse the output to extract image URLs and property details
                   const { imageUrls, propertyDetails } = parseScraperOutput(stdout);
                   const processedImages = imageUrls.map((url, index) => ({
                     filename: `scraped_image_${index + 1}.jpg`,
                     url: url,
                     index: index
                   }));
                   
                   logger.info('Python scraper completed successfully', { 
                     imageCount: processedImages.length,
                     propertyDetails: propertyDetails,
                     stdout: stdout.substring(0, 500) // Log first 500 chars of output
                   });
                   resolve({ images: processedImages, propertyDetails });
                 } catch (error) {
                   logger.error('Error parsing scraper output', { error: error.message, stdout: stdout });
                   reject(new Error('Failed to parse scraper output'));
                 }
               } else {
                 logger.error('Python scraper failed, trying mock scraper', { 
                   code, 
                   stderr: stderr.trim() 
                 });
                 
                 // Try mock scraper as fallback
                 const mockProcess = spawn(pythonPath, [mockScraperPath, url, '--download'], {
                   cwd: path.join(__dirname, '..'),
                   stdio: ['pipe', 'pipe', 'pipe']
                 });
                 
                 let mockStdout = '';
                 let mockStderr = '';
                 
                 mockProcess.stdout.on('data', (data) => {
                   mockStdout += data.toString();
                 });
                 
                 mockProcess.stderr.on('data', (data) => {
                   mockStderr += data.toString();
                 });
                 
                 mockProcess.on('close', (mockCode) => {
                   if (mockCode === 0) {
                     try {
                       const { imageUrls, propertyDetails } = parseScraperOutput(mockStdout);
                       const processedImages = imageUrls.map((url, index) => ({
                         filename: `scraped_image_${index + 1}.jpg`,
                         url: url,
                         index: index
                       }));
                       
                       logger.info('Mock scraper completed successfully', { 
                         imageCount: processedImages.length,
                         propertyDetails: propertyDetails
                       });
                       resolve({ images: processedImages, propertyDetails });
                     } catch (error) {
                       logger.error('Error parsing mock scraper output', { error: error.message });
                       reject(new Error('Failed to parse mock scraper output'));
                     }
                   } else {
                     logger.error('Mock scraper also failed', { 
                       code: mockCode, 
                       stderr: mockStderr.trim() 
                     });
                     reject(new Error(`Both scrapers failed. Original: ${stderr.trim()}, Mock: ${mockStderr.trim()}`));
                   }
                 });
                 
                 mockProcess.on('error', (error) => {
                   logger.error('Mock scraper process error', { error: error.message });
                   reject(new Error(`Mock scraper process error: ${error.message}`));
                 });
               }
             });

    pythonProcess.on('error', (error) => {
      logger.error('Python scraper process error', { error: error.message });
      reject(new Error(`Failed to start Python scraper: ${error.message}`));
    });

    // Set timeout
    setTimeout(() => {
      pythonProcess.kill();
      reject(new Error('Python scraper timeout'));
    }, 60000); // 60 second timeout
  });
}

// Helper function to parse scraper output
function parseScraperOutput(output) {
  const imageUrls = [];
  const propertyDetails = {};
  const lines = output.split('\n');
  
  let inPropertyDetails = false;
  
  for (const line of lines) {
    // Look for lines that contain image URLs
    if (line.includes('https://photos.zillowstatic.com/')) {
      const urlMatch = line.match(/https:\/\/photos\.zillowstatic\.com\/[^\s]+/);
      if (urlMatch) {
        imageUrls.push(urlMatch[0]);
      }
    }
    
    // Look for property details section
    if (line.includes('Property Details:')) {
      inPropertyDetails = true;
      continue;
    }
    
    if (inPropertyDetails && line.includes(':')) {
      const colonIndex = line.indexOf(':');
      if (colonIndex > 0) {
        const key = line.substring(0, colonIndex).trim();
        const value = line.substring(colonIndex + 1).trim();
        
        if (key && value) {
          switch (key.toLowerCase()) {
            case 'address':
              propertyDetails.address = value;
              break;
            case 'city':
              propertyDetails.city = value;
              break;
            case 'state':
              propertyDetails.state = value;
              break;
            case 'zip':
              propertyDetails.zipCode = value;
              break;
            case 'type':
              propertyDetails.propertyType = value;
              break;
            case 'bedrooms':
              propertyDetails.bedrooms = value;
              break;
            case 'bathrooms':
              propertyDetails.bathrooms = value;
              break;
            case 'square feet':
              propertyDetails.squareFeet = value;
              break;
            case 'year built':
              propertyDetails.yearBuilt = value;
              break;
            case 'lot size':
              propertyDetails.lotSize = value;
              break;
            case 'price':
              propertyDetails.price = value;
              break;
          }
        }
      }
    }
  }
  
  // If no property details were found, provide defaults
  if (Object.keys(propertyDetails).length === 0) {
    propertyDetails.address = 'Property from URL';
    propertyDetails.city = 'Unknown';
    propertyDetails.state = 'Unknown';
    propertyDetails.zipCode = '00000';
    propertyDetails.propertyType = 'Property';
    propertyDetails.bedrooms = 'N/A';
    propertyDetails.bathrooms = 'N/A';
    propertyDetails.squareFeet = 'N/A';
    propertyDetails.yearBuilt = 'N/A';
    propertyDetails.lotSize = 'N/A';
    propertyDetails.price = 'N/A';
  }
  
  return { imageUrls, propertyDetails };
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
