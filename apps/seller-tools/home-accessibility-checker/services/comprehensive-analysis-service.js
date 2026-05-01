/**
 * Comprehensive Analysis Service
 * Uses OpenRouter AI for complete accessibility assessment
 * Provides real AI-powered accessibility analysis pipeline
 */

const OpenRouterVisionService = require('./rekognition-service');
const OpenRouterService = require('./openrouter-service');
const winston = require('winston');

class ComprehensiveAnalysisService {
    constructor() {
        this.visionService = new OpenRouterVisionService();
        this.openrouterService = new OpenRouterService();
        
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
    }

    /**
     * Analyze images using the complete pipeline: Rekognition → Claude
     * @param {Array} images - Array of image objects with base64 data
     * @returns {Promise<Object>} Comprehensive analysis results
     */
    async analyzeImages(images) {
        try {
            this.logger.info('Starting comprehensive analysis', { imageCount: images.length });

            const analysisResults = [];
            let totalScore = 0;
            let allPositiveFeatures = [];
            let allRedFlags = [];
            let allRecommendations = [];
            let allDetectedObjects = {
                positive: [],
                negative: [],
                safety: [],
                general: []
            };

            // Step 1: Analyze each image with Rekognition
            for (const image of images) {
                try {
                    this.logger.info('Analyzing image with Rekognition', { filename: image.filename });
                    
                    const visionResult = await this.visionService.analyzeAccessibility(
                        image.base64, 
                        image.filename
                    );

                    analysisResults.push({
                        filename: image.filename,
                        vision: visionResult,
                        comprehensive: null // Will be filled in step 2
                    });

                    // Aggregate vision results
                    totalScore += visionResult.score;
                    allPositiveFeatures.push(...visionResult.analysis.accessibility_features);
                    allRedFlags.push(...visionResult.analysis.barriers);
                    allRecommendations.push(...visionResult.analysis.recommendations);

                } catch (error) {
                    this.logger.error('Vision analysis failed for image', { 
                        filename: image.filename, 
                        error: error.message 
                    });
                    
                    analysisResults.push({
                        filename: image.filename,
                        vision: { error: 'Vision analysis failed', score: 0 },
                        comprehensive: null
                    });
                }
            }

            // Step 2: Use OpenRouter for comprehensive analysis
            
            try {
                this.logger.info('Starting OpenRouter analysis');
                
                // Use the first image for comprehensive OpenRouter analysis
                const comprehensiveResult = await this.openrouterService.analyzeAccessibility(
                    images[0].base64, 
                    'comprehensive_analysis'
                );

                // Step 3: Combine and synthesize results
                const finalAnalysis = this.synthesizeResults(
                    analysisResults,
                    comprehensiveResult,
                    allPositiveFeatures,
                    allRedFlags,
                    allRecommendations,
                    images.length
                );

                this.logger.info('Comprehensive analysis completed', { 
                    finalScore: finalAnalysis.overall_score,
                    totalImages: images.length
                });

                return finalAnalysis;

            } catch (error) {
                this.logger.error('Claude analysis failed', { error: error.message });
                
                // Fallback to Rekognition-only results
                return this.createFallbackAnalysis(
                    analysisResults,
                    allDetectedObjects,
                    allPositiveFeatures,
                    allRedFlags,
                    allRecommendations,
                    totalScore,
                    images.length
                );
            }

        } catch (error) {
            this.logger.error('Comprehensive analysis failed', { error: error.message });
            throw new Error(`Analysis failed: ${error.message}`);
        }
    }

    /**
     * Create Claude prompt based on Rekognition results
     * @param {Array} analysisResults - Rekognition analysis results
     * @returns {string} Claude prompt
     */
    createClaudePrompt(analysisResults) {
        const rekognitionSummary = analysisResults.map(result => {
            if (result.rekognition.error) {
                return `Image: ${result.filename} - Analysis failed`;
            }
            return `Image: ${result.filename}
Score: ${result.rekognition.score}
Positive Features: ${result.rekognition.positiveFeatures.join(', ')}
Red Flags: ${result.rekognition.redFlags.join(', ')}
Recommendations: ${result.rekognition.recommendations.join(', ')}`;
        }).join('\n\n');

        return `Based on the following Rekognition analysis results, provide a comprehensive accessibility assessment:

${rekognitionSummary}

Please provide:
1. Overall accessibility score (0-100)
2. Key positive features found
3. Major red flags and barriers
4. Specific recommendations for improvement
5. Priority improvements (most important to address first)

Focus on universal design principles and ADA compliance.`;
    }

    /**
     * Synthesize results from Vision AI and Comprehensive AI
     * @param {Array} analysisResults - Vision analysis results
     * @param {Object} comprehensiveResult - Comprehensive AI analysis
     * @param {Array} allAccessibilityFeatures - All accessibility features
     * @param {Array} allBarriers - All barriers
     * @param {Array} allRecommendations - All recommendations
     * @param {number} imageCount - Number of images analyzed
     * @returns {Object} Final analysis
     */
    synthesizeResults(analysisResults, comprehensiveResult, allAccessibilityFeatures, allBarriers, allRecommendations, imageCount) {
        const averageScore = Math.round(analysisResults.reduce((sum, result) => sum + (result.vision?.score || 0), 0) / imageCount);
        
        // Combine Vision AI and Comprehensive AI insights
        const combinedAccessibilityFeatures = [...new Set([...allAccessibilityFeatures, ...(comprehensiveResult.analysis?.accessibility_features || [])])];
        const combinedBarriers = [...new Set([...allBarriers, ...(comprehensiveResult.analysis?.barriers || [])])];
        const combinedRecommendations = [...new Set([...allRecommendations, ...(comprehensiveResult.analysis?.recommendations || [])])];

        return {
            success: true,
            analysis: {
                overall_score: Math.max(averageScore, comprehensiveResult.score || averageScore),
                analyzed_images: imageCount,
                accessibility_features: combinedAccessibilityFeatures,
                barriers: combinedBarriers,
                recommendations: combinedRecommendations,
                detailed_results: analysisResults,
                analysis_methods: {
                    vision_ai: true,
                    comprehensive_ai: true,
                    combined: true
                },
                confidence: 0.95,
                accessibility_rating: this.getRatingFromScore(Math.max(averageScore, comprehensiveResult.score || averageScore))
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Create fallback analysis when Claude fails
     * @param {Array} analysisResults - Rekognition results
     * @param {Object} allDetectedObjects - Detected objects
     * @param {Array} allPositiveFeatures - Positive features
     * @param {Array} allRedFlags - Red flags
     * @param {Array} allRecommendations - Recommendations
     * @param {number} totalScore - Total score
     * @param {number} imageCount - Image count
     * @returns {Object} Fallback analysis
     */
    createFallbackAnalysis(analysisResults, allDetectedObjects, allPositiveFeatures, allRedFlags, allRecommendations, totalScore, imageCount) {
        const averageScore = Math.round(totalScore / imageCount);

        return {
            success: true,
            analysis: {
                overall_score: averageScore,
                analyzed_images: imageCount,
                positive_features: [...new Set(allPositiveFeatures)],
                barriers: [...new Set(allRedFlags)],
                recommendations: [...new Set(allRecommendations)],
                detailed_results: analysisResults,
                detected_objects: allDetectedObjects,
                analysis_methods: {
                    rekognition: true,
                    claude: false,
                    combined: false
                },
                confidence: this.calculateOverallConfidence(analysisResults),
                accessibility_rating: this.getRatingFromScore(averageScore)
            },
            timestamp: new Date().toISOString()
        };
    }

    /**
     * Calculate overall confidence from analysis results
     * @param {Array} analysisResults - Analysis results
     * @returns {number} Overall confidence
     */
    calculateOverallConfidence(analysisResults) {
        const validResults = analysisResults.filter(result => !result.rekognition.error);
        if (validResults.length === 0) return 0;

        const totalConfidence = validResults.reduce((sum, result) => {
            return sum + (result.rekognition.analysis?.confidence || 0);
        }, 0);

        return Math.round(totalConfidence / validResults.length);
    }

    /**
     * Get accessibility rating from score
     * @param {number} score - Accessibility score
     * @returns {string} Rating
     */
    getRatingFromScore(score) {
        if (score >= 90) return 'Excellent';
        if (score >= 80) return 'Good';
        if (score >= 70) return 'Fair';
        if (score >= 60) return 'Poor';
        return 'Very Poor';
    }
}

module.exports = ComprehensiveAnalysisService;
