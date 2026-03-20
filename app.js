class FallDetectionApp {
    constructor() {
        this.apiKey = ''; // Will be set by user
        this.selectedFile = null;
        this.maxFileSize = 100 * 1024 * 1024; // 100MB
        this.maxDuration = 30; // 30 seconds
        this.apiTimeout = 60000; // 60 seconds
        this.retryAttempts = 2;
        this.currentRetry = 0;
        
        try {
            this.initializeEventListeners();
            this.validateBrowserSupport();
        } catch (error) {
            console.error('Initialization error:', error);
            this.showError('Failed to initialize application. Please refresh the page.');
        }
    }

    initializeEventListeners() {
        try {
            if (!$('#videoUpload').length) {
                throw new Error('Video upload element not found');
            }
            if (!$('#analyzeBtn').length) {
                throw new Error('Analyze button element not found');
            }
            
            $('#videoUpload').on('change', (e) => {
                try {
                    this.handleFileSelect(e);
                } catch (error) {
                    console.error('File selection error:', error);
                    this.showError('Error selecting file. Please try again.');
                    this.resetFileInput();
                }
            });
            
            $('#analyzeBtn').on('click', () => {
                try {
                    this.analyzeVideo();
                } catch (error) {
                    console.error('Analysis trigger error:', error);
                    this.showError('Error starting analysis. Please try again.');
                }
            });
            
            $('#previewPlayer').on('error', (e) => {
                console.error('Video preview error:', e);
                this.showError('Error loading video preview. The file may be corrupted.');
                this.hideVideoPreview();
                this.resetFileInput();
            });
            
        } catch (error) {
            console.error('Event listener initialization error:', error);
            throw error;
        }
    }

    handleFileSelect(event) {
        try {
            const file = event.target.files[0];
            if (!file) {
                this.hideVideoPreview();
                return;
            }

            if (!(file instanceof File)) {
                throw new Error('Invalid file object');
            }

            if (!file.name || typeof file.name !== 'string') {
                throw new Error('Invalid file name');
            }

            if (!this.isVideoFile(file)) {
                throw new Error('Please select a valid video file (MP4, MOV, AVI, WebM).');
            }

            if (file.size > this.maxFileSize) {
                throw new Error(`File size must be less than ${this.maxFileSize / (1024 * 1024)}MB.`);
            }
            
            if (file.size === 0) {
                throw new Error('File is empty. Please select a valid video file.');
            }

            this.selectedFile = file;
            this.showVideoPreview(file);
            this.hideError();
            
        } catch (error) {
            console.error('File selection error:', error);
            this.showError(error.message || 'Error selecting file. Please try again.');
            this.resetFileInput();
        }
    }

    isVideoFile(file) {
        const validTypes = ['video/mp4', 'video/mov', 'video/avi', 'video/webm', 'video/quicktime'];
        return validTypes.includes(file.type) || file.name.match(/\.(mp4|mov|avi|webm)$/i);
    }

    showVideoPreview(file) {
        try {
            const video = document.getElementById('previewPlayer');
            if (!video) {
                throw new Error('Video preview element not found');
            }
            
            if (video.src && video.src.startsWith('blob:')) {
                URL.revokeObjectURL(video.src);
            }
            
            const url = URL.createObjectURL(file);
            video.src = url;
            
            const videoErrorHandler = (e) => {
                console.error('Video loading error:', e);
                this.showError('Error loading video. The file may be corrupted or in an unsupported format.');
                this.hideVideoPreview();
                this.resetFileInput();
                URL.revokeObjectURL(url);
            };
            
            video.onerror = videoErrorHandler;
            
            video.onloadedmetadata = () => {
                try {
                    if (!video.duration || isNaN(video.duration)) {
                        throw new Error('Unable to determine video duration.');
                    }
                    
                    const duration = video.duration;
                    const fileSize = (file.size / (1024 * 1024)).toFixed(2);
                    
                    if (duration > this.maxDuration) {
                        throw new Error(`Video duration must be ${this.maxDuration} seconds or less. Current duration: ${duration.toFixed(1)}s`);
                    }
                    
                    if (duration < 1) {
                        throw new Error('Video duration is too short. Please select a video at least 1 second long.');
                    }

                    $('#videoDuration').text(`Duration: ${duration.toFixed(1)}s`);
                    $('#videoSize').text(`Size: ${fileSize}MB`);
                    $('#videoPreview').show();
                    $('#analyzeBtn').prop('disabled', false);
                    
                } catch (error) {
                    console.error('Video metadata error:', error);
                    this.showError(error.message || 'Error processing video metadata.');
                    this.hideVideoPreview();
                    this.resetFileInput();
                    URL.revokeObjectURL(url);
                }
            };
            
            setTimeout(() => {
                if (video.readyState === 0) {
                    videoErrorHandler(new Error('Video loading timeout'));
                }
            }, 10000);
            
        } catch (error) {
            console.error('Video preview error:', error);
            this.showError(error.message || 'Error creating video preview.');
            this.hideVideoPreview();
            this.resetFileInput();
        }
    }

    hideVideoPreview() {
        try {
            $('#videoPreview').hide();
            $('#analyzeBtn').prop('disabled', true);
            
            const video = document.getElementById('previewPlayer');
            if (video && video.src && video.src.startsWith('blob:')) {
                URL.revokeObjectURL(video.src);
                video.src = '';
            }
            
            this.selectedFile = null;
        } catch (error) {
            console.error('Error hiding video preview:', error);
        }
    }

    async analyzeVideo() {
        try {
            if (!this.selectedFile) {
                throw new Error('Please select a video file first.');
            }

            if (!this.apiKey) {
                const apiKey = prompt('Please enter your Google Gemini API Key:');
                if (!apiKey || apiKey.trim() === '') {
                    throw new Error('API Key is required for analysis.');
                }
                if (!apiKey.match(/^[a-zA-Z0-9_-]+$/)) {
                    throw new Error('Invalid API Key format. Please check your key and try again.');
                }
                this.apiKey = apiKey.trim();
            }

            this.showLoading(true);
            this.hideError();
            this.hideResults();
            this.currentRetry = 0;

            await this.performAnalysis();
            
        } catch (error) {
            console.error('Analysis error:', error);
            this.showError(error.message || 'Failed to analyze video. Please try again.');
        } finally {
            this.showLoading(false);
        }
    }
    
    async performAnalysis() {
        try {
            // Use File API instead of base64 to avoid token quota issues
            const analysis = await this.callGeminiAPI();
            this.displayResults(analysis);
        } catch (error) {
            console.error('Analysis attempt failed:', error);
            
            if (this.currentRetry < this.retryAttempts && this.isRetryableError(error)) {
                this.currentRetry++;
                console.log(`Retrying analysis (attempt ${this.currentRetry}/${this.retryAttempts})`);
                await this.delay(5000 * this.currentRetry); // 5s, 10s backoff
                return this.performAnalysis();
            }
            
            throw error;
        }
    }

    // ─── Step 1: Upload video using multipart upload (browser CORS compatible) ─
    async uploadVideoFile(file) {
        this.updateLoadingMessage('Uploading video to Google...');

        const mimeType = file.type || 'video/mp4';
        const boundary = '-------' + Date.now().toString(16);
        const metadataJson = JSON.stringify({ file: { display_name: file.name } });

        // Read file as ArrayBuffer for binary part
        const fileBuffer = await file.arrayBuffer();

        // Build multipart body manually so binary data isn't corrupted
        const encoder = new TextEncoder();
        const metadataPart = encoder.encode(
            `--${boundary}\r\n` +
            `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
            `${metadataJson}\r\n`
        );
        const filePart = encoder.encode(
            `--${boundary}\r\n` +
            `Content-Type: ${mimeType}\r\n\r\n`
        );
        const closingBoundary = encoder.encode(`\r\n--${boundary}--`);

        // Combine all parts into one Uint8Array
        const body = new Uint8Array(
            metadataPart.byteLength +
            filePart.byteLength +
            fileBuffer.byteLength +
            closingBoundary.byteLength
        );
        let offset = 0;
        body.set(metadataPart, offset);                offset += metadataPart.byteLength;
        body.set(filePart, offset);                    offset += filePart.byteLength;
        body.set(new Uint8Array(fileBuffer), offset);  offset += fileBuffer.byteLength;
        body.set(closingBoundary, offset);

        const response = await fetch(
            `https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=multipart&key=${this.apiKey}`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': `multipart/related; boundary=${boundary}`,
                },
                body: body
            }
        );

        if (!response.ok) {
            const errText = await response.text();
            console.error('Upload failed:', errText);
            if (response.status === 401) throw new Error('Invalid API key. Please check your Gemini API key.');
            if (response.status === 403) throw new Error('API access forbidden. Check your API key permissions.');
            if (response.status === 429) throw new Error('API rate limit exceeded. Please wait a minute and try again.');
            throw new Error(`Failed to upload video: ${errText}`);
        }

        const uploadData = await response.json();
        const fileName = uploadData?.file?.name;
        if (!fileName) throw new Error('No file name returned after upload. Please try again.');

        // Wait for Google to finish processing the video
        return await this.waitForFileProcessing(fileName);
    }

    // ─── Step 2: Poll until file state is ACTIVE ──────────────────────────────
    async waitForFileProcessing(fileName) {
        this.updateLoadingMessage('Processing video on Google servers...');
        const maxAttempts = 30;

        for (let i = 0; i < maxAttempts; i++) {
            await this.delay(2000);

            const res = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/${fileName}?key=${this.apiKey}`
            );

            if (!res.ok) {
                console.warn('File status check failed, retrying...');
                continue;
            }

            const data = await res.json();

            if (data.state === 'ACTIVE') {
                console.log('File ready for analysis:', data.uri);
                return data.uri;
            }

            if (data.state === 'FAILED') {
                throw new Error('Video processing failed on Google servers. Please try a different video.');
            }

            this.updateLoadingMessage(`Processing video... (${i + 1}/${maxAttempts})`);
        }

        throw new Error('Video processing timed out. Please try a shorter or smaller video.');
    }

    // ─── Step 3: Analyze using file_data reference (no base64) ───────────────
    async callGeminiAPI() {
        try {
            if (!this.apiKey || typeof this.apiKey !== 'string') {
                throw new Error('API key is required');
            }

            // Upload video first via File API
            this.updateLoadingMessage('Uploading video to Google...');
            const fileUri = await this.uploadVideoFile(this.selectedFile);

            const prompt = `Analyze this video and determine if a human fall accident has occurred. 
            Please provide:
            1. Whether a fall is detected (Yes/No)
            2. Confidence percentage (0-100%)
            3. Brief explanation
            4. Whether a person is present (Yes/No)
            
            Format your response as JSON only, no markdown:
            {
                "fallDetected": "Yes" or "No",
                "confidence": number,
                "explanation": "brief explanation",
                "personPresent": "Yes" or "No"
            }`;

            const requestBody = {
                contents: [{
                    parts: [
                        { text: prompt },
                        {
                            file_data: {
                                mime_type: this.selectedFile.type || 'video/mp4',
                                file_uri: fileUri
                            }
                        }
                    ]
                }]
            };

            this.updateLoadingMessage('Analyzing video for falls...');

            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), this.apiTimeout);

            const response = await fetch(
                `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${this.apiKey}`,
                {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(requestBody),
                    signal: controller.signal
                }
            );

            clearTimeout(timeoutId);

            if (!response.ok) {
                const errorText = await response.text();
                let errorMessage = `API request failed: ${errorText}`;

                if (response.status === 400) {
                    errorMessage = 'Invalid request. The video file may be corrupted or in an unsupported format.';
                } else if (response.status === 401) {
                    errorMessage = 'Invalid API key. Please check your Gemini API key and try again.';
                } else if (response.status === 403) {
                    errorMessage = 'API access forbidden. Your API key may not have access to the Gemini API.';
                } else if (response.status === 429) {
                    errorMessage = 'API rate limit exceeded. Please wait a minute and try again.';
                } else if (response.status >= 500) {
                    errorMessage = 'Google AI service is currently unavailable. Please try again later.';
                }

                console.error('API Error Response:', errorText);
                throw new Error(errorMessage);
            }

            const data = await response.json();

            if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
                throw new Error('Invalid API response structure');
            }

            const text = data.candidates[0].content.parts[0].text;

            if (!text || typeof text !== 'string') {
                throw new Error('Empty or invalid response from AI model');
            }

            // Strip markdown code fences if present then parse JSON
            try {
                const clean = text.replace(/```json|```/g, '').trim();
                const parsed = JSON.parse(clean);
                this.validateAnalysisResult(parsed);
                return parsed;
            } catch (parseError) {
                console.warn('JSON parsing failed, using fallback:', parseError);
                return this.parseTextResponse(text);
            }

        } catch (error) {
            if (error.name === 'AbortError') {
                throw new Error('Request timeout. The analysis is taking too long. Please try again.');
            }
            throw error;
        }
    }

    parseTextResponse(text) {
        try {
            if (!text || typeof text !== 'string') {
                throw new Error('Invalid text response');
            }
            
            const fallMatch = text.match(/fall\s*detected\s*:\s*(yes|no)/i);
            const confidenceMatch = text.match(/confidence\s*:\s*(\d+)%?/i);
            const personMatch = text.match(/person\s*present\s*:\s*(yes|no)/i);
            
            const fallDetected = fallMatch ? 
                fallMatch[1].charAt(0).toUpperCase() + fallMatch[1].slice(1) : 'Unknown';
            const confidence = confidenceMatch ? parseInt(confidenceMatch[1]) : 0;
            const personPresent = personMatch ? 
                personMatch[1].charAt(0).toUpperCase() + personMatch[1].slice(1) : 'Unknown';
            const explanation = text.length > 200 ? 
                text.substring(0, 200) + '...' : text;
            
            return {
                fallDetected,
                confidence: Math.min(100, Math.max(0, confidence)),
                explanation,
                personPresent
            };
        } catch (error) {
            console.error('Text parsing error:', error);
            return {
                fallDetected: 'Unknown',
                confidence: 0,
                explanation: 'Unable to parse AI response. Please try again.',
                personPresent: 'Unknown'
            };
        }
    }

    displayResults(analysis) {
        try {
            if (!analysis || typeof analysis !== 'object') {
                throw new Error('Invalid analysis data');
            }
            
            const fallDetected = analysis.fallDetected || 'Unknown';
            const confidence = analysis.confidence || 0;
            const explanation = analysis.explanation || 'No explanation provided.';
            const personPresent = analysis.personPresent || 'Unknown';

            const validFallDetected = ['Yes', 'No', 'Unknown'].includes(fallDetected) ? fallDetected : 'Unknown';
            const validConfidence = Math.min(100, Math.max(0, parseInt(confidence) || 0));
            const validExplanation = String(explanation).substring(0, 500);
            const validPersonPresent = ['Yes', 'No', 'Unknown'].includes(personPresent) ? personPresent : 'Unknown';

            $('#fallResult')
                .text(validFallDetected)
                .removeClass('bg-success bg-danger bg-warning')
                .addClass(validFallDetected === 'Yes' ? 'bg-danger' : 
                         validFallDetected === 'No' ? 'bg-success' : 'bg-warning');

            $('#confidenceResult')
                .text(`${validConfidence}%`)
                .removeClass('bg-success bg-danger bg-warning')
                .addClass(validConfidence >= 80 ? 'bg-success' : 
                         validConfidence >= 50 ? 'bg-warning' : 'bg-danger');

            $('#explanationResult').text(validExplanation);
            
            if ($('#personPresentResult').length) {
                $('#personPresentResult')
                    .text(validPersonPresent)
                    .removeClass('bg-success bg-danger bg-warning')
                    .addClass(validPersonPresent === 'Yes' ? 'bg-info' : 'bg-secondary');
            }
            
            $('#resultsSection').show();
            
        } catch (error) {
            console.error('Error displaying results:', error);
            this.showError('Error displaying analysis results. Please try again.');
        }
    }

    hideResults() {
        $('#resultsSection').hide();
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

    // Updates the loading message during multi-step process
    updateLoadingMessage(message) {
        try {
            $('#loadingMessage').text(message);
            console.log('Status:', message);
        } catch (e) {
            console.log('Status:', message);
        }
    }

    showError(message) {
        try {
            if (!message || typeof message !== 'string') {
                message = 'An unknown error occurred.';
            }
            
            $('#errorMessage').text(message);
            $('#errorAlert').show();
            
            setTimeout(() => {
                this.hideError();
            }, 10000);
            
        } catch (error) {
            console.error('Error showing error message:', error);
            alert(message || 'An error occurred');
        }
    }

    hideError() {
        $('#errorAlert').hide();
    }
    
    resetFileInput() {
        try {
            $('#videoUpload').val('');
            this.hideVideoPreview();
        } catch (error) {
            console.error('Error resetting file input:', error);
        }
    }
    
    validateBrowserSupport() {
        try {
            if (!window.File || !window.FileReader || !window.URL) {
                throw new Error('Your browser does not support required file APIs. Please update your browser.');
            }
            
            if (!window.fetch) {
                throw new Error('Your browser does not support the Fetch API. Please update your browser.');
            }
            
            const video = document.createElement('video');
            if (!video.canPlayType) {
                throw new Error('Your browser does not support video playback.');
            }
            
            console.log('Browser compatibility check passed');
            
        } catch (error) {
            console.error('Browser compatibility error:', error);
            throw error;
        }
    }
    
    validateAnalysisResult(result) {
        if (!result || typeof result !== 'object') {
            throw new Error('Invalid analysis result format');
        }
        
        if (result.fallDetected && !['Yes', 'No'].includes(result.fallDetected)) {
            console.warn('Invalid fallDetected value:', result.fallDetected);
        }
        
        if (result.confidence !== undefined) {
            const confidence = parseInt(result.confidence);
            if (isNaN(confidence) || confidence < 0 || confidence > 100) {
                console.warn('Invalid confidence value:', result.confidence);
            }
        }
    }
    
    isRetryableError(error) {
        const retryableErrors = [
            'network error',
            'timeout',
            'rate limit',
            'service unavailable',
            'connection'
        ];
        
        const errorMessage = error.message.toLowerCase();
        return retryableErrors.some(retryableError => 
            errorMessage.includes(retryableError)
        );
    }
    
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Initialize the app when DOM is ready
$(document).ready(() => {
    try {
        if (typeof $ === 'undefined') {
            throw new Error('jQuery is not loaded. Please check your internet connection.');
        }
        
        const requiredElements = ['videoUpload', 'analyzeBtn', 'previewPlayer', 'resultsSection', 'errorAlert'];
        const missingElements = requiredElements.filter(id => $(`#${id}`).length === 0);
        
        if (missingElements.length > 0) {
            throw new Error(`Required elements not found: ${missingElements.join(', ')}`);
        }
        
        window.fallDetectionApp = new FallDetectionApp();
        console.log('Fall Detection App initialized successfully');
        
    } catch (error) {
        console.error('Application initialization failed:', error);
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'alert alert-danger';
        errorDiv.style.cssText = 'position: fixed; top: 20px; right: 20px; z-index: 9999; max-width: 400px;';
        errorDiv.innerHTML = `
            <strong>Application Error:</strong> ${error.message}<br>
            <small>Please refresh the page and try again.</small>
        `;
        document.body.appendChild(errorDiv);
        
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 10000);
    }
});
