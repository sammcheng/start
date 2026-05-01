# Express.js Accessibility Checker Backend

A fast, simple Express.js backend for home accessibility analysis using OpenAI's GPT-4 Vision API. Perfect for hackathons and rapid prototyping!

## 🚀 Quick Start

### Prerequisites
- Node.js 18+ 
- OpenAI API key
- npm or yarn

### Installation

```bash
# Clone and navigate to express backend
cd express-backend

# Install dependencies
npm install

# Copy environment file
cp env.example .env

# Edit .env with your OpenAI API key
OPENAI_API_KEY=your_openai_api_key_here

# Start development server
npm run dev
```

### Production Deployment

#### Railway (Recommended)
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login to Railway
railway login

# Deploy
railway up
```

#### Render
```bash
# Connect your GitHub repo to Render
# Set environment variables in Render dashboard
# Deploy automatically on git push
```

## 📡 API Endpoints

### Health Check
```http
GET /health
```

### Upload Images
```http
POST /api/upload
Content-Type: multipart/form-data

# Form data:
images: [file1, file2, ...] (max 5 files, 10MB each)
```

### Analyze Images
```http
POST /api/analyze
Content-Type: application/json

{
  "images": [
    {
      "filename": "house1.jpg",
      "base64": "data:image/jpeg;base64,/9j/4AAQ...",
      "size": 1024000,
      "mimetype": "image/jpeg"
    }
  ]
}
```

### Upload and Analyze (One Request)
```http
POST /api/upload-and-analyze
Content-Type: multipart/form-data

# Form data:
images: [file1, file2, ...] (max 5 files, 10MB each)
```

## 📊 Response Format

```json
{
  "success": true,
  "analysis": {
    "overall_score": 85,
    "analyzed_images": 2,
    "positive_features": [
      "Wide doorway (36 inches)",
      "Good lighting in hallway",
      "Accessible bathroom layout"
    ],
    "barriers": [
      "Step at entrance without ramp",
      "Narrow hallway (28 inches)"
    ],
    "recommendations": [
      "Install ramp at entrance",
      "Widen hallway to 36 inches",
      "Add grab bars in bathroom"
    ],
    "detailed_results": [
      {
        "filename": "house1.jpg",
        "score": 85,
        "positive_features": [...],
        "barriers": [...],
        "recommendations": [...],
        "accessibility_rating": "Good"
      }
    ]
  },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

## 🛠️ Development

### Scripts
```bash
npm start          # Start production server
npm run dev        # Start development server with nodemon
npm test           # Run tests
npm run lint       # Run ESLint
npm run format     # Format code with Prettier
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3000 | Server port |
| `NODE_ENV` | development | Environment |
| `OPENAI_API_KEY` | - | OpenAI API key (required) |
| `ALLOWED_ORIGINS` | * | CORS allowed origins |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Rate limit per window |
| `MAX_FILE_SIZE` | 10485760 | Max file size (10MB) |
| `MAX_FILES` | 5 | Max files per request |

## 🔧 Features

### ✅ **Fast Implementation**
- Single Express.js server
- No AWS dependencies
- OpenAI GPT-4 Vision API
- Simple file upload handling

### ✅ **Image Processing**
- Automatic image optimization
- Base64 conversion
- Format validation
- Size limits and compression

### ✅ **Security**
- Helmet.js security headers
- CORS configuration
- Rate limiting
- Input validation
- File type validation

### ✅ **Error Handling**
- Comprehensive error logging
- Graceful error responses
- Request validation
- File cleanup

### ✅ **Performance**
- Image optimization with Sharp
- Concurrent processing
- Memory-efficient base64 handling
- Temporary file cleanup

## 🚀 Deployment Options

### Railway (Easiest)
1. Connect GitHub repo to Railway
2. Set `OPENAI_API_KEY` environment variable
3. Deploy automatically

### Render
1. Connect GitHub repo to Render
2. Set environment variables in dashboard
3. Deploy automatically

### Vercel
```bash
# Install Vercel CLI
npm install -g vercel

# Deploy
vercel --prod
```

### Heroku
```bash
# Install Heroku CLI
# Create Procfile: web: npm start
# Deploy
git push heroku main
```

## 📈 Performance

### Benchmarks
- **Image Processing**: ~2-3 seconds per image
- **OpenAI Analysis**: ~5-10 seconds per image
- **Total Response Time**: ~10-15 seconds for 2 images
- **Concurrent Requests**: 100 requests per 15 minutes

### Optimization Tips
- Use image optimization (automatic)
- Implement caching for repeated analyses
- Use CDN for static assets
- Monitor API usage and costs

## 🔍 Monitoring

### Health Check
```bash
curl https://your-api.com/health
```

### Logs
- Structured JSON logging
- Request/response logging
- Error tracking
- Performance metrics

## 🧪 Testing

### Manual Testing
```bash
# Test upload
curl -X POST -F "images=@test-image.jpg" http://localhost:3000/api/upload

# Test analysis
curl -X POST -H "Content-Type: application/json" \
  -d '{"images":[{"filename":"test.jpg","base64":"..."}]}' \
  http://localhost:3000/api/analyze
```

### Automated Testing
```bash
npm test
```

## 🆚 vs AWS Lambda Backend

| Feature | Express.js | AWS Lambda |
|---------|------------|------------|
| **Setup Time** | 5 minutes | 30+ minutes |
| **Debugging** | Easy | Complex |
| **Cost** | $5-20/month | Pay per request |
| **Scaling** | Manual | Automatic |
| **Dependencies** | Simple | Complex |
| **Local Development** | Easy | Requires AWS setup |
| **API Complexity** | Single endpoint | Multiple functions |

## 🎯 Hackathon Advantages

### ✅ **Speed**
- Deploy in 5 minutes
- No AWS account needed
- Simple debugging
- Easy to modify

### ✅ **Cost**
- Free tier available
- Predictable pricing
- No AWS complexity

### ✅ **Flexibility**
- Easy to add features
- Simple to understand
- Quick iterations
- No vendor lock-in

## 🔧 Troubleshooting

### Common Issues

**OpenAI API Key Error**
```bash
# Check your .env file
OPENAI_API_KEY=sk-your-key-here
```

**File Upload Issues**
```bash
# Check file size and format
# Max 10MB, formats: jpg, png, webp
```

**Rate Limiting**
```bash
# Adjust rate limits in .env
RATE_LIMIT_MAX_REQUESTS=200
```

### Debug Mode
```bash
# Enable debug logging
LOG_LEVEL=debug npm run dev
```

## 📚 Next Steps

1. **Add Database**: Store analysis results
2. **Implement Caching**: Redis for repeated analyses
3. **Add Authentication**: User management
4. **Batch Processing**: Multiple image optimization
5. **WebSocket Support**: Real-time updates
6. **Admin Dashboard**: Analysis management

## 🤝 Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Add tests
5. Submit pull request

## 📄 License

MIT License - see LICENSE file for details.

---

**Perfect for hackathons!** 🚀 Get your accessibility checker running in minutes, not hours.
