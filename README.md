# Fall Detection Web Application

A web application that uses Google Gemini AI to analyze videos and detect human fall accidents with confidence scoring.

## Features

- **Video Upload**: Support for MP4, MOV, AVI, WebM formats
- **Duration Validation**: Automatically restricts videos to 30 seconds maximum
- **AI-Powered Analysis**: Uses Google Gemini Pro Vision for intelligent fall detection
- **Confidence Scoring**: Provides confidence percentage for analysis results
- **Responsive Design**: Works on desktop and mobile devices
- **Real-time Preview**: Video preview with duration and file size display

## Technical Stack

- **Frontend**: HTML5, CSS3, JavaScript (ES6+), jQuery
- **UI Framework**: Bootstrap 5
- **AI Integration**: Google Gemini Pro Vision API via direct REST calls
- **Styling**: Custom CSS with gradient designs

## Prerequisites

1. **Google Gemini API Key**: Get your API key from [Google AI Studio](https://makersuite.google.com/app/apikey)
2. **Web Browser**: Modern browser with JavaScript support
3. **Local Server**: Python 3.x (for running locally)

## Installation & Setup

### 1. Clone/Download the Project

```bash
# If using git
git clone <repository-url>
cd zimozi_assignment

# Or download and extract the files to your preferred directory
```

### 2. Start Local Server

```bash
# Navigate to the project directory
cd zimozi_assignment

# Start Python HTTP server
python -m http.server 8000
```

### 3. Access the Application

Open your web browser and navigate to:
```
http://localhost:8000
```

## Usage Instructions

### Step 1: Upload Video
1. Click "Select Video File" button
2. Choose a video file (MP4, MOV, AVI, WebM)
3. The app will automatically validate:
   - File type (video formats only)
   - File size (max 100MB)
   - Duration (max 30 seconds)

### Step 2: Preview Video
- After successful upload, the video preview will appear
- Duration and file size information will be displayed
- The "Analyze Video" button will become enabled

### Step 3: Configure API Key
- On first analysis, you'll be prompted to enter your Google Gemini API key
- The key will be stored for the session only
- You can get a free API key from [Google AI Studio](https://makersuite.google.com/app/apikey)

### Step 4: Analyze Video
1. Click "Analyze Video for Fall Detection"
2. The app will upload the video to Google Gemini AI
3. Wait for the analysis to complete (typically 10-30 seconds)

### Step 5: View Results
The results will display:
- **Fall Detected**: Yes/No with color coding
- **Confidence**: Percentage with color indicators
  - Green: 80-100% confidence
  - Yellow: 50-79% confidence
  - Red: 0-49% confidence
- **Explanation**: Brief AI-generated explanation

## API Integration Details

### Google Gemini Pro Vision API

The application uses the `gemini-pro-vision` model with the following configuration:

```javascript
// API Endpoint
https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent

// Request Format
{
  "contents": [{
    "parts": [
      {"text": "Analysis prompt"},
      {"inline_data": {
        "mime_type": "video/mp4",
        "data": "base64_encoded_video"
      }}
    ]
  }]
}
```

### API Response Format
```json
{
  "fallDetected": "Yes" or "No",
  "confidence": 0-100,
  "explanation": "brief explanation",
  "personPresent": "Yes" or "No"
}
```

### Prompt Engineering

The system uses a structured prompt to ensure consistent JSON output:

```
Analyze this video and determine if a human fall accident has occurred.
Please provide:
1. Whether a fall is detected (Yes/No)
2. Confidence percentage (0-100%)
3. Brief explanation

Format your response as JSON:
{
    "fallDetected": "Yes" or "No",
    "confidence": number,
    "explanation": "brief explanation"
}
```

## File Structure

```
zimozi_assignment/
├── index.html          # Main HTML file
├── styles.css          # Custom styling
├── app.js             # Main application logic
├── package.json       # Project metadata
├── .gitignore         # Git ignore file
└── README.md          # This documentation
```

## Error Handling

The application implements comprehensive error handling for various scenarios:

### File Upload Errors
- **Invalid File Type**: Shows error for non-video files
- **Large File Size**: Rejects files over 100MB
- **Duration Limit**: Rejects videos over 30 seconds
- **Corrupted Files**: Handles corrupted or unreadable video files
- **Empty Files**: Validates that files are not empty

### API Errors
- **Invalid API Key**: Clear message for authentication failures
- **Rate Limiting**: Handles API quota exceeded scenarios
- **Service Unavailable**: Graceful handling of Google AI service outages
- **Network Issues**: Automatic retry with exponential backoff
- **Request Timeout**: 60-second timeout with user notification

### Browser Compatibility
- **Modern Browser Check**: Validates required APIs are available
- **Video Support**: Ensures browser can handle video playback
- **Fallback Messages**: User-friendly error display for unsupported browsers

### Retry Logic
- **Automatic Retries**: Up to 2 attempts for network-related errors
- **Exponential Backoff**: 2s and 4s delays between retries
- **Smart Error Detection**: Only retries recoverable errors

### User Experience
- **Auto-hiding Errors**: Messages disappear after 10 seconds
- **Manual Dismiss**: Close button for immediate dismissal
- **Helpful Suggestions**: Guidance for common issues
- **Non-blocking**: Errors don't crash the application

## Security Considerations

- **API Key Storage**: API key is stored only in memory (session-based)
- **File Validation**: Client-side validation for file types and sizes
- **HTTPS Recommended**: Use HTTPS in production for API security

## Assumptions and Limitations

### Assumptions
1. User has a valid Google Gemini API key
2. Video quality is sufficient for AI analysis
3. Falls are visually detectable in the video
4. Internet connection is available for API calls

### Limitations
1. **API Rate Limits**: Gemini API has usage quotas
2. **Video Quality**: Poor lighting or camera angles may affect accuracy
3. **Processing Time**: Analysis may take 10-30 seconds
4. **Browser Support**: Requires modern browser with File API support
5. **Single Analysis**: Only one video can be analyzed at a time

## Browser Compatibility

- ✅ Chrome 90+
- ✅ Firefox 88+
- ✅ Safari 14+
- ✅ Edge 90+

## Troubleshooting

### Common Issues

**Q: "API request failed" error**
A: Check your API key and ensure you have sufficient quota

**Q: Video not uploading**
A: Ensure video format is supported and file size is under 100MB

**Q: Analysis taking too long**
A: Large videos may take longer; ensure stable internet connection

**Q: Results seem inaccurate**
A: Video quality and camera angle significantly affect AI accuracy

### Debug Mode

Open browser developer console (F12) to see:
- API request/response details
- Error messages
- File processing information

## Future Enhancements

Potential improvements for future versions:
1. **Multiple Video Support**: Batch processing capabilities
2. **History Tracking**: Save analysis results
3. **Advanced Filtering**: More sophisticated fall detection criteria
4. **Real-time Processing**: Webcam integration for live monitoring
5. **Export Features**: Download analysis reports

## Support

For issues or questions:
1. Check the troubleshooting section above
2. Verify your API key is valid and active
3. Ensure all prerequisites are met

## License

This project is licensed under the MIT License.

---

**Note**: This application is for demonstration purposes. For production use, consider implementing additional security measures, error handling, and user authentication.
