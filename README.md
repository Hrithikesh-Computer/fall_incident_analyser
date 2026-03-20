
# Fall Detection Web Application

A web application that detects human fall accidents in videos using **local AI (TensorFlow.js MoveNet)** running entirely in the browser. Google Gemini API is used optionally as a fallback when local confidence is low.

## Features

* **Local ML Analysis** : Pose estimation via TensorFlow.js MoveNet — no API key required for primary analysis
* **Gemini AI Fallback** : Automatically escalates to Gemini API when local confidence is below 55%
* **Frame-by-Frame Analysis** : Samples 24 frames, scores each for fall indicators (body angle, aspect ratio, hip height, vertical span, drop detection)
* **Confidence Scoring** : Color-coded confidence percentage with per-frame breakdown
* **Video Upload** : Supports MP4, MOV, AVI, WebM up to 100MB / 30 seconds
* **Real-time Status** : Live loading messages showing each analysis step
* **Responsive Design** : Works on desktop and mobile browsers

## Technical Stack

* **Frontend** : HTML5, CSS3, JavaScript (ES6+), jQuery
* **UI Framework** : Bootstrap 5 + Bootstrap Icons
* **Local ML** : TensorFlow.js 4.17 + MoveNet SINGLEPOSE_THUNDER (pose-detection 2.1.3)
* **AI Fallback** : Google Gemini 2.0 Flash via REST API (File API upload)

## How It Works

### Analysis Pipeline

```
1. LocalFallDetector (TF.js MoveNet)
   └─ Extracts 24 frames from video
   └─ Runs pose estimation on each frame
   └─ Scores each frame for fall indicators
   └─ confidence ≥ 55%? → show result ✓
   └─ confidence < 55%? → escalate to Gemini

2. GeminiAnalyzer (fallback only)
   └─ Uploads video via Gemini File API (multipart)
   └─ Waits for Google to process video
   └─ Sends local analysis context + video to gemini-2.0-flash
   └─ Returns enhanced result

3. If Gemini is skipped or fails
   └─ Shows local result with a warning note
```

### Fall Detection Metrics (Local ML)

| Metric         | Description                    | Threshold                     |
| -------------- | ------------------------------ | ----------------------------- |
| Aspect Ratio   | Body bounding box width/height | > 1.4 → lying down           |
| Hip Height     | Normalized Y position of hips  | > 60% of frame → near ground |
| Vertical Span  | Shoulder-to-ankle distance     | < 38% of frame → horizontal  |
| Body Angle     | Torso angle from vertical      | > 55° → tilted/fallen       |
| Drop Detection | Sudden downward hip movement   | > 18% frame height per step   |

## Prerequisites

1. **Web Browser** : Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+
2. **Gemini API Key**  *(optional)* : Only needed when local confidence is low. Get one free at [Google AI Studio](https://aistudio.google.com/app/apikey)

## Installation & Setup

### 1. Clone or Download

```bash
git clone <repository-url>
cd fall-detection-app
```

### 2. Start Local Server

```bash
# Python 3
python -m http.server 8000

# Or Node.js
npx serve .
```

### 3. Open in Browser

```
http://localhost:8000
```

> **Note** : A local server is required because TensorFlow.js loads model weights from a CDN, which browsers block when opening files directly via `file://`.

## Usage

### Step 1: Upload Video

* Click **Select Video File** and choose an MP4, MOV, AVI, or WebM file
* The app validates format, size (max 100MB), and duration (max 30s)
* A video preview appears with duration and file size badges

### Step 2: Wait for Model

* The **Local ML Ready** badge (top-right of card) confirms MoveNet has loaded
* Model loads automatically in the background when the page opens (~3–5 seconds)

### Step 3: Analyze

* Click **Analyze Video for Fall Detection**
* Watch the live status messages as the app works through each step:
  * `Extracting frames (1/24)...`
  * `Analyzing pose 3/24...`
  * `Analyzing fall patterns...`

### Step 4: View Results

| Field                      | Description                                                     |
| -------------------------- | --------------------------------------------------------------- |
| **Fall Detected**    | Yes (red) / No (green) / Unknown (yellow)                       |
| **Confidence**       | Green ≥ 75%, Yellow ≥ 50%, Red < 50%                          |
| **Person Present**   | Whether a person was detected in the video                      |
| **Engine**           | Which engine produced the result (Local ML or Gemini AI)        |
| **Explanation**      | Human-readable summary of what was detected                     |
| **Frames w/ Person** | How many of the 24 sampled frames contained a detectable person |
| **Fall Pose Frames** | Frames where fall indicators were triggered                     |
| **Drop Detected**    | Whether a sudden downward movement was found                    |

### Gemini Fallback Prompt

When local confidence is low, the app will ask:

1. Whether you want to use Gemini for enhanced accuracy
2. For your Gemini API key (stored in memory for the session only)

The local analysis context (fall frame ratio, peak score, drop detection) is passed to Gemini to help it produce a more informed response.

## File Structure

```
fall-detection-app/
├── index.html        # UI — Bootstrap layout, TF.js + app script tags
├── app.js            # Main application logic (3 classes below)
│   ├── LocalFallDetector   — TF.js MoveNet pose analysis
│   ├── GeminiAnalyzer      — Gemini File API upload + generateContent
│   └── FallDetectionApp    — Orchestrator, UI, event handlers
├── styles.css        # Custom styles
└── README.md         # This file
```

## Error Handling

### File Errors

* Invalid type, size > 100MB, duration > 30s, empty file, corrupted file — all show specific messages

### ML Errors

* TF.js CDN unavailable → falls back to Gemini automatically
* Pose estimation failure on a frame → frame is skipped, analysis continues

### Gemini API Errors

* `401` Invalid API key
* `403` Access forbidden
* `429` Rate limit exceeded
* `500+` Google service unavailable
* Upload/processing timeout (after 30 polling attempts × 2s)

## Security

* **No server required** : All local analysis runs in the browser
* **API key in memory only** : Never stored to disk or localStorage
* **Video privacy** : Video is only uploaded to Google if you explicitly choose Gemini enhancement

## Limitations

1. **Pose visibility** : MoveNet requires a reasonably clear view of the person — heavy occlusion, very low resolution, or extreme camera angles reduce accuracy
2. **Single person** : MoveNet SINGLEPOSE detects one person per frame; multi-person scenes use the most prominent pose
3. **30-second limit** : Longer videos must be trimmed before upload
4. **Gemini rate limits** : Free tier is 15 requests/minute; if exceeded, wait 60 seconds

## Browser Compatibility

| Browser     | Local ML | Gemini Fallback |
| ----------- | -------- | --------------- |
| Chrome 90+  | ✅       | ✅              |
| Firefox 88+ | ✅       | ✅              |
| Safari 14+  | ✅       | ✅              |
| Edge 90+    | ✅       | ✅              |

## Troubleshooting

**Model badge stays on "Loading ML model..."**
→ Check your internet connection; TF.js model weights load from CDN on first use (~8MB)

**Low confidence on valid fall videos**
→ Ensure the person is clearly visible and the camera angle is not top-down; accept Gemini enhancement when prompted

**"Video processing timed out" (Gemini)**
→ Google servers occasionally take longer on first upload; retry or use a shorter clip

**Analysis button stays disabled**
→ Video failed validation (duration, size, or format); check the error message

## Future Enhancements

* Multi-person detection (MoveNet MultiPose)
* Webcam / live stream support
* Batch video processing
* Downloadable analysis report (PDF)
* Alert/notification system for detected falls

## License

MIT License
