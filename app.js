// ═══════════════════════════════════════════════════════════════════════════════
// LOCAL FALL DETECTOR — TensorFlow.js + MoveNet (runs fully in browser)
// No API key needed. Analyzes pose landmarks frame-by-frame.
// Gemini API is used only as a fallback when local confidence is low.
// ═══════════════════════════════════════════════════════════════════════════════

class LocalFallDetector {
    constructor() {
        this.detector  = null;
        this.isLoaded  = false;
        this.isLoading = false;

        // MoveNet keypoint indices (COCO-17 format)
        this.KP = {
            NOSE:           0,
            LEFT_SHOULDER:  5,  RIGHT_SHOULDER: 6,
            LEFT_HIP:      11,  RIGHT_HIP:      12,
            LEFT_KNEE:     13,  RIGHT_KNEE:     14,
            LEFT_ANKLE:    15,  RIGHT_ANKLE:    16,
        };

        this.THRESHOLDS = {
            MIN_KEYPOINT_SCORE : 0.25,  // ignore low-confidence keypoints
            FALL_ASPECT_RATIO  : 1.4,   // body bbox wider than tall → lying
            FALL_HIP_HEIGHT    : 0.60,  // hip Y > 60% of frame → near ground
            FALL_VERTICAL_SPAN : 0.38,  // shoulder-to-ankle span < 38% → horizontal
            FALL_BODY_ANGLE    : 55,    // torso angle from vertical (degrees)
            FALL_FRAME_RATIO   : 0.20,  // ≥20% of frames must show fall pose
            FRAMES_TO_SAMPLE   : 24,    // frames to extract from video
            MIN_SCORE_FOR_FALL : 45,    // minimum frame score to count as fall
        };
    }

    // ── Load MoveNet model ────────────────────────────────────────────────────
    async loadModel(onStatus) {
        if (this.isLoaded)  return true;
        if (this.isLoading) return false;

        this.isLoading = true;
        try {
            if (typeof tf === 'undefined' || typeof poseDetection === 'undefined') {
                throw new Error('TensorFlow.js libraries not loaded.');
            }
            if (onStatus) onStatus('Loading pose detection model...');

            this.detector = await poseDetection.createDetector(
                poseDetection.SupportedModels.MoveNet,
                {
                    modelType: poseDetection.movenet.modelType.SINGLEPOSE_THUNDER,
                    enableSmoothing: false,
                }
            );
            this.isLoaded  = true;
            this.isLoading = false;
            console.log('MoveNet model loaded successfully');
            return true;
        } catch (err) {
            this.isLoading = false;
            console.error('Failed to load MoveNet:', err);
            return false;
        }
    }

    // ── Main entry: analyze a video element ───────────────────────────────────
    async analyze(videoElement, onStatus) {
        if (!this.isLoaded) throw new Error('Model not loaded');

        if (onStatus) onStatus('Extracting video frames...');
        const frames = await this._extractFrames(videoElement, this.THRESHOLDS.FRAMES_TO_SAMPLE, onStatus);

        if (onStatus) onStatus('Running pose estimation...');
        const poseResults = await this._estimatePoses(frames, onStatus);

        if (onStatus) onStatus('Analyzing fall patterns...');
        return this._analyzeFallPatterns(poseResults, videoElement.duration);
    }

    // ── Extract N evenly-spaced frames from video ─────────────────────────────
    async _extractFrames(video, numFrames, onStatus) {
        const canvas   = document.getElementById('analysisCanvas');
        const ctx      = canvas.getContext('2d');
        const duration = video.duration;
        const frames   = [];

        video.pause();

        for (let i = 0; i < numFrames; i++) {
            const time = (duration / (numFrames - 1)) * i;
            await this._seekTo(video, Math.min(time, duration - 0.05));

            canvas.width  = video.videoWidth  || 640;
            canvas.height = video.videoHeight || 480;
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

            const frameCanvas  = document.createElement('canvas');
            frameCanvas.width  = canvas.width;
            frameCanvas.height = canvas.height;
            frameCanvas.getContext('2d').drawImage(canvas, 0, 0);

            frames.push({ time, canvas: frameCanvas, width: canvas.width, height: canvas.height });
            if (onStatus) onStatus(`Extracting frames... (${i + 1}/${numFrames})`);
        }
        return frames;
    }

    _seekTo(video, time) {
        return new Promise((resolve) => {
            const onSeeked = () => { video.removeEventListener('seeked', onSeeked); resolve(); };
            video.addEventListener('seeked', onSeeked);
            video.currentTime = time;
            setTimeout(resolve, 1500); // safety timeout
        });
    }

    // ── Run MoveNet on each frame canvas ─────────────────────────────────────
    async _estimatePoses(frames, onStatus) {
        const results = [];
        for (let i = 0; i < frames.length; i++) {
            const { time, canvas, width, height } = frames[i];
            if (onStatus) onStatus(`Analyzing pose ${i + 1}/${frames.length}...`);
            try {
                const poses = await this.detector.estimatePoses(canvas, {
                    maxPoses: 1,
                    flipHorizontal: false,
                    scoreThreshold: this.THRESHOLDS.MIN_KEYPOINT_SCORE,
                });
                results.push({ time, poses, width, height });
            } catch (err) {
                console.warn(`Pose estimation failed at frame ${i}:`, err);
                results.push({ time, poses: [], width, height });
            }
        }
        return results;
    }

    // ── Core fall analysis logic ──────────────────────────────────────────────
    _analyzeFallPatterns(poseResults, videoDuration) {
        const frameScores  = [];
        const hipPositions = [];
        let   personFrames = 0;

        for (const { poses, width, height, time } of poseResults) {
            if (!poses || poses.length === 0) continue;
            const kps = poses[0].keypoints;
            if (!this._hasSufficientKeypoints(kps)) continue;

            personFrames++;
            const metrics = this._computeMetrics(kps, width, height);
            const score   = this._scoreFallFrame(metrics);
            frameScores.push({ time, score, metrics });

            if (metrics.hipY !== null) {
                hipPositions.push({ time, y: metrics.hipY });
            }
        }

        if (personFrames === 0) {
            return {
                fallDetected:  'No',
                confidence:    85,
                personPresent: 'No',
                explanation:   'No person detected in any frame of the video.',
                engine:        'Local ML (MoveNet)',
                frameStats:    { total: poseResults.length, withPerson: 0 },
            };
        }

        // Detect sudden downward drop in hip position
        let dropDetected = false;
        if (hipPositions.length >= 3) {
            for (let i = 1; i < hipPositions.length; i++) {
                if (hipPositions[i].y - hipPositions[i - 1].y > 0.18) {
                    dropDetected = true;
                    break;
                }
            }
        }

        const fallFrames     = frameScores.filter(f => f.score >= this.THRESHOLDS.MIN_SCORE_FOR_FALL);
        const fallFrameRatio = fallFrames.length / personFrames;
        const peakScore      = Math.max(...frameScores.map(f => f.score), 0);
        const avgFallScore   = fallFrames.length
            ? fallFrames.reduce((s, f) => s + f.score, 0) / fallFrames.length : 0;

        const fallDetected = fallFrameRatio >= this.THRESHOLDS.FALL_FRAME_RATIO || peakScore >= 75;

        let confidence;
        if (fallDetected) {
            confidence = Math.min(95, Math.round(
                40 + (fallFrameRatio * 100) * 0.4 + avgFallScore * 0.2 + (dropDetected ? 10 : 0)
            ));
        } else {
            confidence = Math.min(92, Math.round(
                50 + (1 - fallFrameRatio) * 30 + (peakScore < 30 ? 15 : 0)
            ));
        }

        return {
            fallDetected:  fallDetected ? 'Yes' : 'No',
            confidence,
            personPresent: 'Yes',
            explanation:   this._buildExplanation(fallDetected, fallFrames.length, personFrames, peakScore, dropDetected, frameScores),
            engine:        'Local ML (MoveNet)',
            frameStats: {
                total:       poseResults.length,
                withPerson:  personFrames,
                fallFrames:  fallFrames.length,
                fallRatio:   Math.round(fallFrameRatio * 100),
                peakScore,
                dropDetected,
            },
        };
    }

    _computeMetrics(kps, width, height) {
        const get = (idx) => {
            const kp = kps[idx];
            return (kp && kp.score >= this.THRESHOLDS.MIN_KEYPOINT_SCORE)
                ? { x: kp.x / width, y: kp.y / height } : null;
        };

        const shoulder = _midPoint(get(this.KP.LEFT_SHOULDER), get(this.KP.RIGHT_SHOULDER));
        const hip      = _midPoint(get(this.KP.LEFT_HIP),      get(this.KP.RIGHT_HIP));
        const ankle    = _midPoint(get(this.KP.LEFT_ANKLE),     get(this.KP.RIGHT_ANKLE));

        const validKps = kps.filter(k => k.score >= this.THRESHOLDS.MIN_KEYPOINT_SCORE);
        const xs = validKps.map(k => k.x / width);
        const ys = validKps.map(k => k.y / height);
        const bboxW = Math.max(...xs) - Math.min(...xs);
        const bboxH = Math.max(...ys) - Math.min(...ys);

        const verticalSpan = (shoulder && ankle) ? Math.abs(ankle.y - shoulder.y) : null;

        let bodyAngle = null;
        if (shoulder && hip) {
            const dx = hip.x - shoulder.x;
            const dy = hip.y - shoulder.y;
            bodyAngle = Math.abs(90 - Math.abs(Math.atan2(dy, dx) * 180 / Math.PI));
        }

        return {
            hipY:         hip      ? hip.y      : null,
            shoulderY:    shoulder ? shoulder.y : null,
            ankleY:       ankle    ? ankle.y    : null,
            verticalSpan,
            bodyAngle,
            aspectRatio:  bboxH > 0.01 ? bboxW / bboxH : 0,
            bboxH,
        };
    }

    _scoreFallFrame(m) {
        let score = 0;
        if (m.aspectRatio > this.THRESHOLDS.FALL_ASPECT_RATIO)
            score += Math.min(40, (m.aspectRatio - 1) * 20);
        if (m.hipY !== null && m.hipY > this.THRESHOLDS.FALL_HIP_HEIGHT)
            score += Math.min(30, (m.hipY - 0.5) * 60);
        if (m.verticalSpan !== null && m.verticalSpan < this.THRESHOLDS.FALL_VERTICAL_SPAN)
            score += Math.min(25, (0.5 - m.verticalSpan) * 50);
        if (m.bodyAngle !== null && m.bodyAngle > this.THRESHOLDS.FALL_BODY_ANGLE)
            score += Math.min(20, (m.bodyAngle - 45) * 0.5);
        return Math.min(100, Math.round(score));
    }

    _hasSufficientKeypoints(kps) {
        const required = [this.KP.LEFT_SHOULDER, this.KP.RIGHT_SHOULDER, this.KP.LEFT_HIP, this.KP.RIGHT_HIP];
        return required.filter(idx => kps[idx] && kps[idx].score >= this.THRESHOLDS.MIN_KEYPOINT_SCORE).length >= 2;
    }

    _buildExplanation(fallDetected, fallFrameCount, personFrames, peakScore, dropDetected, frameScores) {
        if (fallDetected) {
            const parts = [`Fall detected across ${fallFrameCount} of ${personFrames} analyzed frames.`];
            if (dropDetected)   parts.push('A sudden downward movement was detected.');
            if (peakScore > 70) parts.push('Body posture indicates a horizontal position consistent with a fall.');
            const worst = frameScores.reduce((a, b) => a.score > b.score ? a : b, frameScores[0]);
            if (worst) parts.push(`Peak indicator at ${worst.time.toFixed(1)}s.`);
            return parts.join(' ');
        }
        const reasons = [];
        const maxAspect = Math.max(...frameScores.map(f => f.metrics.aspectRatio || 0));
        if (maxAspect < 1.2) reasons.push('body remained upright throughout');
        if (!dropDetected)   reasons.push('no sudden downward movement detected');
        return `No fall detected. The person appears to be standing or moving normally${reasons.length ? ' — ' + reasons.join(', ') : ''}. Analysis covered ${personFrames} frames.`;
    }
}

// ── Utilities ─────────────────────────────────────────────────────────────────
function _midPoint(a, b) {
    if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    return a || b || null;
}

function _delay(ms) { return new Promise(r => setTimeout(r, ms)); }

function _parseJSON(raw) {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const match   = cleaned.match(/\{[\s\S]*\}/);
    if (match) return JSON.parse(match[0]);
    throw new Error('No JSON found in response');
}

// ═══════════════════════════════════════════════════════════════════════════════
// GEMINI API — fallback when local confidence is low
// ═══════════════════════════════════════════════════════════════════════════════

class GeminiAnalyzer {
    constructor(apiKey) {
        this.apiKey    = apiKey;
        this.apiTimeout = 60000;
    }

    async analyze(file, localContext, onStatus) {
        if (onStatus) onStatus('Uploading video to Gemini...');
        const fileUri = await this._uploadFile(file, onStatus);

        if (onStatus) onStatus('Running AI fall analysis (Gemini)...');
        const prompt = `Analyze this video for human fall detection.
Context from local pose analysis: ${localContext}

Respond ONLY with JSON (no markdown):
{
  "fallDetected": "Yes" or "No",
  "confidence": number (0-100),
  "explanation": "brief explanation",
  "personPresent": "Yes" or "No"
}`;

        const controller = new AbortController();
        const tid = setTimeout(() => controller.abort(), this.apiTimeout);

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{
                        parts: [
                            { text: prompt },
                            { file_data: { mime_type: file.type || 'video/mp4', file_uri: fileUri } }
                        ]
                    }]
                }),
                signal: controller.signal
            }
        );
        clearTimeout(tid);

        if (resp.status === 429) throw new Error('Gemini rate limit exceeded. Please wait a moment and try again.');
        if (resp.status === 401) throw new Error('Invalid Gemini API key. Please check your key and try again.');
        if (resp.status === 403) throw new Error('Gemini API access forbidden. Check your API key permissions.');
        if (!resp.ok) { const t = await resp.text(); throw new Error(`Gemini error (${resp.status}): ${t}`); }

        const data = await resp.json();
        if (!data.candidates?.[0]?.content) throw new Error('Invalid response from Gemini.');

        const text   = data.candidates[0].content.parts[0].text;
        const parsed = _parseJSON(text);
        parsed.engine = 'Gemini AI';
        return parsed;
    }

    async _uploadFile(file, onStatus) {
        const mimeType     = file.type || 'video/mp4';
        const boundary     = '-------' + Date.now().toString(16);
        const metadataJson = JSON.stringify({ file: { display_name: file.name } });
        const fileBuffer   = await file.arrayBuffer();
        const encoder      = new TextEncoder();

        const metaPart = encoder.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadataJson}\r\n`);
        const filePart = encoder.encode(`--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`);
        const closing  = encoder.encode(`\r\n--${boundary}--`);

        const body = new Uint8Array(metaPart.byteLength + filePart.byteLength + fileBuffer.byteLength + closing.byteLength);
        let off = 0;
        body.set(metaPart,                   off); off += metaPart.byteLength;
        body.set(filePart,                   off); off += filePart.byteLength;
        body.set(new Uint8Array(fileBuffer), off); off += fileBuffer.byteLength;
        body.set(closing,                    off);

        const resp = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${this.apiKey}`,
            { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body }
        );
        if (!resp.ok) { const t = await resp.text(); throw new Error(`Upload failed: ${t}`); }

        const { file: f } = await resp.json();
        if (!f?.name) throw new Error('No file name returned from upload.');
        return await this._waitForFile(f.name, onStatus);
    }

    async _waitForFile(fileName, onStatus) {
        for (let i = 0; i < 30; i++) {
            await _delay(2000);
            if (onStatus) onStatus(`Processing video on Google... (${i + 1}/30)`);
            const res  = await fetch(`https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${this.apiKey}`);
            if (!res.ok) continue;
            const data = await res.json();
            if (data.state === 'ACTIVE') return data.uri;
            if (data.state === 'FAILED') throw new Error('Video processing failed on Google servers.');
        }
        throw new Error('Video processing timed out.');
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN APP
// ═══════════════════════════════════════════════════════════════════════════════

class FallDetectionApp {
    constructor() {
        this.geminiApiKey  = '';
        this.gemini        = null;
        this.selectedFile  = null;
        this.localDetector = new LocalFallDetector();
        this.maxFileSize   = 100 * 1024 * 1024; // 100MB
        this.maxDuration   = 30;                // seconds
        this.modelReady    = false;

        // Confidence below this → escalate to Gemini
        this.AI_ESCALATION_THRESHOLD = 55;

        try {
            this.initializeEventListeners();
            this.validateBrowserSupport();
            this._preloadModel();
        } catch (err) {
            console.error('Init error:', err);
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    }

    async _preloadModel() {
        this.updateModelStatus('loading');
        const ok = await this.localDetector.loadModel();
        this.modelReady = ok;
        this.updateModelStatus(ok ? 'ready' : 'failed');
        if (!ok) console.warn('MoveNet failed to load — will rely on Gemini fallback.');
    }

    updateModelStatus(state) {
        const el  = $('#modelStatus');
        if (!el.length) return;
        const map = {
            loading: ['bg-warning text-dark', 'bi-hourglass-split', 'Loading ML model...'],
            ready:   ['bg-success text-white', 'bi-cpu',            'Local ML Ready'],
            failed:  ['bg-secondary text-white', 'bi-cloud',        'API Mode Only'],
        };
        const [cls, icon, text] = map[state] || map.failed;
        el.attr('class', `badge ${cls}`).html(`<i class="bi ${icon} me-1"></i>${text}`);
    }

    initializeEventListeners() {
        if (!$('#videoUpload').length) throw new Error('videoUpload element not found');
        if (!$('#analyzeBtn').length)  throw new Error('analyzeBtn element not found');

        $('#videoUpload').on('change', (e) => {
            try   { this.handleFileSelect(e); }
            catch (err) { this.showError(err.message || 'Error selecting file.'); this.resetFileInput(); }
        });

        $('#analyzeBtn').on('click', () => {
            try   { this.analyzeVideo(); }
            catch (err) { this.showError(err.message || 'Error starting analysis.'); }
        });

        $('#previewPlayer').on('error', () => {
            this.showError('Error loading video preview. The file may be corrupted.');
            this.hideVideoPreview(); this.resetFileInput();
        });
    }

    handleFileSelect(event) {
        const file = event.target.files[0];
        if (!file) { this.hideVideoPreview(); return; }
        if (!(file instanceof File))      throw new Error('Invalid file object.');
        if (!this.isVideoFile(file))      throw new Error('Please select a valid video file (MP4, MOV, AVI, WebM).');
        if (file.size > this.maxFileSize) throw new Error(`File too large. Max ${this.maxFileSize / (1024 * 1024)}MB.`);
        if (file.size === 0)              throw new Error('File is empty.');
        this.selectedFile = file;
        this.showVideoPreview(file);
        this.hideError();
    }

    isVideoFile(file) {
        const validTypes = ['video/mp4','video/mov','video/avi','video/webm','video/quicktime'];
        return validTypes.includes(file.type) || /\.(mp4|mov|avi|webm)$/i.test(file.name);
    }

    showVideoPreview(file) {
        const video = document.getElementById('previewPlayer');
        if (!video) throw new Error('previewPlayer element not found');
        if (video.src?.startsWith('blob:')) URL.revokeObjectURL(video.src);

        const url = URL.createObjectURL(file);
        video.src = url;

        video.onerror = () => {
            this.showError('Error loading video. File may be corrupted.');
            this.hideVideoPreview(); this.resetFileInput(); URL.revokeObjectURL(url);
        };

        video.onloadedmetadata = () => {
            try {
                if (!video.duration || isNaN(video.duration)) throw new Error('Cannot determine video duration.');
                if (video.duration > this.maxDuration) throw new Error(`Video must be ${this.maxDuration}s or less (current: ${video.duration.toFixed(1)}s).`);
                if (video.duration < 1)                throw new Error('Video too short (minimum 1 second).');

                $('#videoDuration').text(`Duration: ${video.duration.toFixed(1)}s`);
                $('#videoSize').text(`Size: ${(file.size / (1024 * 1024)).toFixed(2)}MB`);
                $('#videoPreview').show();
                $('#analyzeBtn').prop('disabled', false);
            } catch (err) {
                this.showError(err.message);
                this.hideVideoPreview(); this.resetFileInput(); URL.revokeObjectURL(url);
            }
        };

        setTimeout(() => {
            if (video.readyState === 0) {
                this.showError('Video loading timeout. Try a different file.');
                this.hideVideoPreview(); this.resetFileInput();
            }
        }, 10000);
    }

    hideVideoPreview() {
        $('#videoPreview').hide();
        $('#analyzeBtn').prop('disabled', true);
        const v = document.getElementById('previewPlayer');
        if (v?.src?.startsWith('blob:')) { URL.revokeObjectURL(v.src); v.src = ''; }
        this.selectedFile = null;
    }

    async analyzeVideo() {
        try {
            if (!this.selectedFile) throw new Error('Please select a video file first.');
            this.showLoading(true);
            this.hideError();
            this.hideResults();
            await this._runAnalysis();
        } catch (err) {
            console.error('Analysis error:', err);
            this.showError(err.message || 'Failed to analyze video. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }

    // ── Analysis pipeline: Local ML first → Gemini if confidence is low ───────
    async _runAnalysis() {
        const video = document.getElementById('previewPlayer');
        let localResult = null;

        // ── Step 1: Local ML ──────────────────────────────────────────────────
        if (this.modelReady) {
            try {
                if (!this.localDetector.isLoaded) {
                    this.updateLoadingMessage('Loading ML model...');
                    await this.localDetector.loadModel((msg) => this.updateLoadingMessage(msg));
                }

                localResult = await this.localDetector.analyze(
                    video,
                    (msg) => this.updateLoadingMessage(msg)
                );
                console.log('Local result:', localResult);

                // High confidence → done, show result
                if (localResult.confidence >= this.AI_ESCALATION_THRESHOLD) {
                    this.displayResults(localResult);
                    return;
                }

                // Low confidence → try Gemini
                this.updateLoadingMessage(`Local confidence low (${localResult.confidence}%) — enhancing with Gemini...`);
            } catch (localErr) {
                console.warn('Local detection failed:', localErr);
                this.updateLoadingMessage('Local ML failed — switching to Gemini...');
            }
        } else {
            this.updateLoadingMessage('ML model unavailable — using Gemini...');
        }

        // ── Step 2: Gemini fallback ───────────────────────────────────────────
        const geminiResult = await this._tryGemini(localResult);
        if (geminiResult) {
            this.displayResults(geminiResult);
            return;
        }

        // ── Step 3: If Gemini skipped/unavailable, show local result anyway ───
        if (localResult) {
            localResult.explanation += ' (Note: AI enhancement was unavailable — confidence may be lower than optimal.)';
            this.displayResults(localResult);
            return;
        }

        throw new Error('All analysis methods failed. Please check your setup and try again.');
    }

    // ── Collect Gemini key if needed, run analysis ─────────────────────────────
    async _tryGemini(localResult) {
        if (!this.geminiApiKey) {
            const wantAI = confirm(
                `Local ML confidence is ${localResult ? localResult.confidence + '%' : 'unavailable'}.\n\n` +
                `Would you like to enhance accuracy using the Gemini API?\n\n` +
                `Press OK to enter your API key, or Cancel to use the local result.`
            );
            if (!wantAI) return null;

            const key = prompt('Enter your Google Gemini API Key:');
            if (!key?.trim()) return null;
            if (!/^[a-zA-Z0-9_-]+$/.test(key.trim())) {
                this.showError('Invalid Gemini API key format.');
                return null;
            }
            this.geminiApiKey = key.trim();
        }

        if (!this.gemini) {
            this.gemini = new GeminiAnalyzer(this.geminiApiKey);
        }

        try {
            const localContext = localResult
                ? `fallDetected=${localResult.fallDetected}, confidence=${localResult.confidence}%, frameStats=${JSON.stringify(localResult.frameStats)}`
                : 'No local analysis available.';

            return await this.gemini.analyze(
                this.selectedFile,
                localContext,
                (msg) => this.updateLoadingMessage(msg)
            );
        } catch (err) {
            console.error('Gemini failed:', err);
            this.showError(`Gemini error: ${err.message}`);
            return null;
        }
    }

    displayResults(result) {
        const fd  = ['Yes','No','Unknown'].includes(result.fallDetected)  ? result.fallDetected  : 'Unknown';
        const pp  = ['Yes','No','Unknown'].includes(result.personPresent) ? result.personPresent : 'Unknown';
        const con = Math.min(100, Math.max(0, parseInt(result.confidence) || 0));
        const exp = String(result.explanation || 'No explanation provided.').substring(0, 600);

        $('#fallResult')
            .text(fd)
            .removeClass('bg-success bg-danger bg-warning')
            .addClass(fd === 'Yes' ? 'bg-danger' : fd === 'No' ? 'bg-success' : 'bg-warning');

        $('#confidenceResult')
            .text(`${con}%`)
            .removeClass('bg-success bg-danger bg-warning')
            .addClass(con >= 75 ? 'bg-success' : con >= 50 ? 'bg-warning' : 'bg-danger');

        $('#explanationResult').text(exp);

        if ($('#personPresentResult').length) {
            $('#personPresentResult')
                .text(pp)
                .removeClass('bg-info bg-secondary')
                .addClass(pp === 'Yes' ? 'bg-info' : 'bg-secondary');
        }

        if ($('#engineResult').length) {
            $('#engineResult').text(result.engine || 'Unknown');
        }

        if (result.frameStats && $('#frameStatsSection').length) {
            const s = result.frameStats;
            $('#frameStatsSection').show();
            $('#statFrames').text(`${s.withPerson} / ${s.total}`);
            $('#statFallFrames').text(`${s.fallFrames || 0} (${s.fallRatio || 0}%)`);
            $('#statDrop').text(s.dropDetected ? 'Yes ⚠️' : 'No');
        }

        $('#resultsSection').show();
    }

    hideResults() {
        $('#resultsSection').hide();
        $('#frameStatsSection').hide();
    }

    showLoading(show) {
        if (show) {
            $('#loadingSpinner').removeClass('d-none');
            $('#analyzeIcon').addClass('d-none');
            $('#loadingStatus').removeClass('d-none');
            $('#analyzeBtn').prop('disabled', true);
        } else {
            $('#loadingSpinner').addClass('d-none');
            $('#analyzeIcon').removeClass('d-none');
            $('#loadingStatus').addClass('d-none');
            $('#loadingMessage').text('Preparing...');
            $('#analyzeBtn').prop('disabled', !this.selectedFile);
        }
    }

    updateLoadingMessage(msg) {
        $('#loadingMessage').text(msg);
        console.log('Status:', msg);
    }

    showError(message) {
        const msg = (message && typeof message === 'string') ? message : 'An unknown error occurred.';
        $('#errorMessage').text(msg);
        $('#errorAlert').show();
        setTimeout(() => this.hideError(), 12000);
    }

    hideError() { $('#errorAlert').hide(); }

    resetFileInput() {
        try { $('#videoUpload').val(''); this.hideVideoPreview(); } catch (_) {}
    }

    validateBrowserSupport() {
        if (!window.File || !window.FileReader || !window.URL) throw new Error('Browser does not support required file APIs.');
        if (!window.fetch) throw new Error('Browser does not support Fetch API.');
        if (!document.createElement('video').canPlayType)     throw new Error('Browser does not support video playback.');
        console.log('Browser compatibility check passed');
    }
}

// ── Init ──────────────────────────────────────────────────────────────────────
$(document).ready(() => {
    try {
        if (typeof $ === 'undefined') throw new Error('jQuery not loaded.');
        const required = ['videoUpload','analyzeBtn','previewPlayer','resultsSection','errorAlert'];
        const missing  = required.filter(id => $(`#${id}`).length === 0);
        if (missing.length) throw new Error(`Missing elements: ${missing.join(', ')}`);

        window.fallDetectionApp = new FallDetectionApp();
        console.log('Fall Detection App initialized');
    } catch (err) {
        console.error('App init failed:', err);
        const div = document.createElement('div');
        div.className = 'alert alert-danger';
        div.style.cssText = 'position:fixed;top:20px;right:20px;z-index:9999;max-width:400px;';
        div.innerHTML = `<strong>Application Error:</strong> ${err.message}<br><small>Please refresh the page.</small>`;
        document.body.appendChild(div);
        setTimeout(() => div.parentNode?.removeChild(div), 10000);
    }
});
