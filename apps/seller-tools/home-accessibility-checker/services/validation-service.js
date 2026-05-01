/**
 * Validation Service
 * Handles request validation and data sanitization
 */

const Joi = require('joi');
const winston = require('winston');

class ValidationService {
  constructor() {
    this.logger = winston.createLogger({
      level: 'info',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      ),
      transports: [
        new winston.transports.Console()
      ]
    });

    this.setupSchemas();
  }

  setupSchemas() {
    // Image schema for analysis requests
    this.imageSchema = Joi.object({
      filename: Joi.string().min(1).max(255).required(),
      base64: Joi.string().min(100).max(15 * 1024 * 1024).required(), // ~10MB base64
      size: Joi.number().integer().min(1).max(10 * 1024 * 1024).optional(), // 10MB max
      mimetype: Joi.string().valid('image/jpeg', 'image/jpg', 'image/png', 'image/webp').optional()
    });

    // Analysis request schema
    this.analyzeRequestSchema = Joi.object({
      images: Joi.array().items(this.imageSchema).min(1).required(),
      options: Joi.object({
        detailed_analysis: Joi.boolean().default(true),
        include_recommendations: Joi.boolean().default(true),
        focus_areas: Joi.array().items(
          Joi.string().valid('entrance', 'bathroom', 'kitchen', 'bedroom', 'hallway', 'stairs')
        ).optional()
      }).optional()
    });

    // Upload request schema
    this.uploadRequestSchema = Joi.object({
      images: Joi.array().items(
        Joi.object({
          filename: Joi.string().min(1).max(255).required(),
          size: Joi.number().integer().min(1).max(10 * 1024 * 1024).required(),
          mimetype: Joi.string().valid('image/jpeg', 'image/jpg', 'image/png', 'image/webp').required()
        })
      ).min(1).required()
    });
  }

  validateAnalyzeRequest(data) {
    try {
      this.logger.info('Validating analyze request', { 
        imageCount: data.images?.length || 0 
      });

      const { error, value } = this.analyzeRequestSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        this.logger.warn('Analyze request validation failed', { 
          errors: error.details 
        });
        return { error, value: null };
      }

      this.logger.info('Analyze request validation passed');
      return { error: null, value };

    } catch (err) {
      this.logger.error('Validation error', { error: err.message });
      return { 
        error: { 
          details: [{ message: 'Validation service error' }] 
        }, 
        value: null 
      };
    }
  }

  validateUploadRequest(data) {
    try {
      this.logger.info('Validating upload request', { 
        imageCount: data.images?.length || 0 
      });

      const { error, value } = this.uploadRequestSchema.validate(data, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        this.logger.warn('Upload request validation failed', { 
          errors: error.details 
        });
        return { error, value: null };
      }

      this.logger.info('Upload request validation passed');
      return { error: null, value };

    } catch (err) {
      this.logger.error('Validation error', { error: err.message });
      return { 
        error: { 
          details: [{ message: 'Validation service error' }] 
        }, 
        value: null 
      };
    }
  }

  validateImageData(imageData) {
    try {
      const { error, value } = this.imageSchema.validate(imageData, {
        abortEarly: false,
        stripUnknown: true
      });

      if (error) {
        this.logger.warn('Image validation failed', { 
          filename: imageData.filename,
          errors: error.details 
        });
        return { error, value: null };
      }

      return { error: null, value };

    } catch (err) {
      this.logger.error('Image validation error', { 
        filename: imageData.filename,
        error: err.message 
      });
      return { 
        error: { 
          details: [{ message: 'Image validation service error' }] 
        }, 
        value: null 
      };
    }
  }

  sanitizeFilename(filename) {
    try {
      // Remove path traversal attempts
      const sanitized = filename
        .replace(/\.\./g, '') // Remove path traversal
        .replace(/[^a-zA-Z0-9._-]/g, '_') // Replace special chars
        .substring(0, 255); // Limit length

      if (sanitized !== filename) {
        this.logger.warn('Filename sanitized', { 
          original: filename, 
          sanitized 
        });
      }

      return sanitized;

    } catch (error) {
      this.logger.error('Filename sanitization failed', { 
        filename, 
        error: error.message 
      });
      return 'sanitized_filename';
    }
  }

  validateFileSize(size, maxSize = 10 * 1024 * 1024) {
    if (size > maxSize) {
      this.logger.warn('File size exceeds limit', { 
        size, 
        maxSize 
      });
      return false;
    }
    return true;
  }

  validateMimeType(mimetype) {
    const allowedTypes = [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp'
    ];

    const isValid = allowedTypes.includes(mimetype);
    
    if (!isValid) {
      this.logger.warn('Invalid MIME type', { mimetype });
    }

    return isValid;
  }

  validateBase64Image(base64String) {
    try {
      // Check if it's valid base64
      const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
      if (!base64Regex.test(base64String)) {
        this.logger.warn('Invalid base64 format');
        return false;
      }

      // Check size (rough estimate: base64 is ~4/3 of original size)
      const estimatedSize = (base64String.length * 3) / 4;
      if (estimatedSize > 10 * 1024 * 1024) { // 10MB
        this.logger.warn('Base64 image too large', { estimatedSize });
        return false;
      }

      return true;

    } catch (error) {
      this.logger.error('Base64 validation failed', { error: error.message });
      return false;
    }
  }

  getValidationErrors(validationResult) {
    if (!validationResult.error) {
      return [];
    }

    return validationResult.error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message,
      value: detail.context?.value
    }));
  }

  createErrorResponse(validationResult, customMessage = null) {
    const errors = this.getValidationErrors(validationResult);
    
    return {
      error: 'Validation failed',
      message: customMessage || 'Request validation failed',
      details: errors,
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = ValidationService;
