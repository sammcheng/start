/**
 * Image Processing Service
 * Handles image optimization, conversion, and validation
 */

const sharp = require('sharp');
const fs = require('fs').promises;
const path = require('path');
const winston = require('winston');

class ImageService {
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

    this.supportedFormats = ['jpeg', 'jpg', 'png', 'webp'];
    this.maxWidth = 2048;
    this.maxHeight = 2048;
    this.quality = 85;
  }

  async optimizeImage(inputPath) {
    try {
      this.logger.info('Optimizing image', { inputPath });

      // Get image metadata
      const metadata = await sharp(inputPath).metadata();
      
      // Check if optimization is needed
      if (metadata.width <= this.maxWidth && 
          metadata.height <= this.maxHeight && 
          metadata.format === 'jpeg') {
        this.logger.info('Image already optimized', { inputPath });
        return inputPath;
      }

      // Create optimized version
      const outputPath = inputPath.replace(/\.[^/.]+$/, '_optimized.jpg');
      
      await sharp(inputPath)
        .resize(this.maxWidth, this.maxHeight, {
          fit: 'inside',
          withoutEnlargement: true
        })
        .jpeg({ 
          quality: this.quality,
          progressive: true,
          mozjpeg: true
        })
        .toFile(outputPath);

      // Get file sizes
      const originalStats = await fs.stat(inputPath);
      const optimizedStats = await fs.stat(outputPath);
      
      const compressionRatio = ((originalStats.size - optimizedStats.size) / originalStats.size * 100).toFixed(1);
      
      this.logger.info('Image optimization completed', {
        originalSize: originalStats.size,
        optimizedSize: optimizedStats.size,
        compressionRatio: `${compressionRatio}%`
      });

      return outputPath;

    } catch (error) {
      this.logger.error('Image optimization failed', { 
        inputPath, 
        error: error.message 
      });
      throw new Error(`Image optimization failed: ${error.message}`);
    }
  }

  async convertToBase64(imagePath) {
    try {
      this.logger.info('Converting image to base64', { imagePath });

      const imageBuffer = await fs.readFile(imagePath);
      const base64String = imageBuffer.toString('base64');

      this.logger.info('Base64 conversion completed', { 
        size: base64String.length 
      });

      return base64String;

    } catch (error) {
      this.logger.error('Base64 conversion failed', { 
        imagePath, 
        error: error.message 
      });
      throw new Error(`Base64 conversion failed: ${error.message}`);
    }
  }

  async validateImage(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      
      const validation = {
        isValid: true,
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: metadata.size,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        errors: []
      };

      // Check dimensions
      if (metadata.width < 100 || metadata.height < 100) {
        validation.isValid = false;
        validation.errors.push('Image too small (minimum 100x100 pixels)');
      }

      if (metadata.width > 4096 || metadata.height > 4096) {
        validation.isValid = false;
        validation.errors.push('Image too large (maximum 4096x4096 pixels)');
      }

      // Check format
      if (!this.supportedFormats.includes(metadata.format)) {
        validation.isValid = false;
        validation.errors.push(`Unsupported format: ${metadata.format}`);
      }

      // Check file size (if available)
      if (metadata.size && metadata.size > 10 * 1024 * 1024) {
        validation.isValid = false;
        validation.errors.push('File too large (maximum 10MB)');
      }

      this.logger.info('Image validation completed', validation);
      return validation;

    } catch (error) {
      this.logger.error('Image validation failed', { 
        imagePath, 
        error: error.message 
      });
      return {
        isValid: false,
        errors: [`Validation failed: ${error.message}`]
      };
    }
  }

  async createThumbnail(imagePath, size = 300) {
    try {
      this.logger.info('Creating thumbnail', { imagePath, size });

      const thumbnailPath = imagePath.replace(/\.[^/.]+$/, '_thumb.jpg');
      
      await sharp(imagePath)
        .resize(size, size, {
          fit: 'cover',
          position: 'center'
        })
        .jpeg({ quality: 80 })
        .toFile(thumbnailPath);

      this.logger.info('Thumbnail created', { thumbnailPath });
      return thumbnailPath;

    } catch (error) {
      this.logger.error('Thumbnail creation failed', { 
        imagePath, 
        error: error.message 
      });
      throw new Error(`Thumbnail creation failed: ${error.message}`);
    }
  }

  async getImageInfo(imagePath) {
    try {
      const metadata = await sharp(imagePath).metadata();
      const stats = await fs.stat(imagePath);

      return {
        width: metadata.width,
        height: metadata.height,
        format: metadata.format,
        size: stats.size,
        channels: metadata.channels,
        hasAlpha: metadata.hasAlpha,
        density: metadata.density,
        space: metadata.space,
        created: stats.birthtime,
        modified: stats.mtime
      };

    } catch (error) {
      this.logger.error('Failed to get image info', { 
        imagePath, 
        error: error.message 
      });
      throw new Error(`Failed to get image info: ${error.message}`);
    }
  }

  async cleanupTempFiles(filePaths) {
    try {
      for (const filePath of filePaths) {
        try {
          await fs.unlink(filePath);
          this.logger.info('Cleaned up temp file', { filePath });
        } catch (error) {
          this.logger.warn('Failed to cleanup temp file', { 
            filePath, 
            error: error.message 
          });
        }
      }
    } catch (error) {
      this.logger.error('Cleanup failed', { error: error.message });
    }
  }

  isSupportedFormat(filename) {
    const ext = path.extname(filename).toLowerCase().slice(1);
    return this.supportedFormats.includes(ext);
  }

  getSupportedFormats() {
    return this.supportedFormats;
  }
}

module.exports = ImageService;
