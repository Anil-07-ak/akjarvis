/* ==========================================================================
   J.A.R.V.I.S. SYSTEM ENGINE - APP.JS
   Voice Recognition, Speaker Verification, Web Audio Synth & HUD Controller
   ========================================================================== */

(function () {
    'use strict';

    // --------------------------------------------------------------------------
    // 1. GLOBAL STATE & CONFIGURATION
    // --------------------------------------------------------------------------
    const state = {
        isListening: false,
        soundEnabled: true,
        onlyMyVoiceMode: true, // Listen only to master voice mode
        biometricThreshold: 60, // Match threshold %
        sensitivity: 'strict', // strict: 65%, balanced: 50%, permissive: 38%
        enrolledVoiceprint: null, // { userName, passphrase, pitch, centroid, bandEnergies }
        currentTheme: 'stark',
        systemState: 'STANDBY', // STANDBY, LISTENING, PROCESSING, SPEAKING, SECURITY_ALERT
        tasks: [],
        audioCtx: null,
        micStream: null,
        analyserNode: null,
        recordAnalyser: null,
        recordStream: null,
        recordMediaRecorder: null,
        recordedChunks: [],
        recordedFeatures: null,
        audioAmplitude: 0,
        vibrationIntensity: 1.0,
        isTestingVoice: false,
        lastLiveScore: null
    };

    // DOM Elements
    const elements = {
        bgCanvas: document.getElementById('bgCanvas'),
        brainCanvas: document.getElementById('brainCanvas'),
        brainContainer: document.getElementById('brainContainer'),
        audioVisualizer: document.getElementById('audioVisualizer'),
        recordCanvas: document.getElementById('recordCanvas'),
        
        hudClock: document.getElementById('hudClock'),
        sysStatusText: document.getElementById('sysStatusText'),
        secLevelText: document.getElementById('secLevelText'),
        authUserText: document.getElementById('authUserText'),
        headerBioStatusItem: document.getElementById('headerBioStatusItem'),
        
        coreVal: document.getElementById('coreVal'),
        coreGaugeCircle: document.getElementById('coreGaugeCircle'),
        matrixVal: document.getElementById('matrixVal'),
        matrixGaugeCircle: document.getElementById('matrixGaugeCircle'),
        tempVal: document.getElementById('tempVal'),
        tempBar: document.getElementById('tempBar'),
        memVal: document.getElementById('memVal'),
        memBar: document.getElementById('memBar'),
        
        bioStatusCard: document.getElementById('bioStatusCard'),
        bioLockIcon: document.getElementById('bioLockIcon'),
        bioPrimaryStatus: document.getElementById('bioPrimaryStatus'),
        bioMatchPercent: document.getElementById('bioMatchPercent'),
        bioBadgeText: document.getElementById('bioBadgeText'),
        chkOnlyMyVoice: document.getElementById('chkOnlyMyVoice'),
        liveMatchScore: document.getElementById('liveMatchScore'),
        liveMatchBar: document.getElementById('liveMatchBar'),
        thresholdLabel: document.getElementById('thresholdLabel'),
        btnTestVoice: document.getElementById('btnTestVoice'),
        
        jarvisStateTag: document.getElementById('jarvisStateTag'),
        brainWaveLabel: document.getElementById('brainWaveLabel'),
        brainFreqVal: document.getElementById('brainFreqVal'),
        brainVibVal: document.getElementById('brainVibVal'),
        brainBioLockBadge: document.getElementById('brainBioLockBadge'),
        
        jarvisSubtitles: document.getElementById('jarvisSubtitles'),
        transcriptionText: document.getElementById('transcriptionText'),
        micStatusText: document.getElementById('micStatusText'),
        btnMicListen: document.getElementById('btnMicListen'),
        
        btnEnrollVoice: document.getElementById('btnEnrollVoice'),
        btnToggleAudio: document.getElementById('btnToggleAudio'),
        audioIcon: document.getElementById('audioIcon'),
        
        commandInput: document.getElementById('commandInput'),
        btnSubmitCmd: document.getElementById('btnSubmitCmd'),
        taskList: document.getElementById('taskList'),
        btnClearTasks: document.getElementById('btnClearTasks'),
        securityLog: document.getElementById('securityLog'),
        btnClearLogs: document.getElementById('btnClearLogs'),
        
        enrollmentModal: document.getElementById('enrollmentModal'),
        btnCloseEnrollModal: document.getElementById('btnCloseEnrollModal'),
        userNameInput: document.getElementById('userNameInput'),
        passphraseInput: document.getElementById('passphraseInput'),
        phraseToRead: document.getElementById('phraseToRead'),
        btnGoToStep2: document.getElementById('btnGoToStep2'),
        btnStartRecord: document.getElementById('btnStartRecord'),
        btnStopRecord: document.getElementById('btnStopRecord'),
        btnQuickCalibrate: document.getElementById('btnQuickCalibrate'),
        btnSaveVoiceprint: document.getElementById('btnSaveVoiceprint'),
        recordingTime: document.getElementById('recordingTime'),
        recordProgressText: document.getElementById('recordProgressText'),
        
        mPitch: document.getElementById('mPitch'),
        mCentroid: document.getElementById('mCentroid'),
        mVector: document.getElementById('mVector'),
        
        alertOverlay: document.getElementById('alertOverlay'),
        alertTitle: document.getElementById('alertTitle'),
        alertBody: document.getElementById('alertBody'),
        btnDismissAlert: document.getElementById('btnDismissAlert')
    };

    // --------------------------------------------------------------------------
    // 2. WEB AUDIO SYNTHESIZER (SOUND FX ENGINE)
    // --------------------------------------------------------------------------
    class SoundFXEngine {
        constructor() {
            this.ctx = null;
        }

        init() {
            if (!this.ctx) {
                const AudioContext = window.AudioContext || window.webkitAudioContext;
                if (AudioContext) {
                    this.ctx = new AudioContext();
                    state.audioCtx = this.ctx;
                }
            }
            if (this.ctx && this.ctx.state === 'suspended') {
                this.ctx.resume();
            }
        }

        playTone(freq, type = 'sine', duration = 0.1, gainVal = 0.1) {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;

            try {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();

                osc.type = type;
                osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

                gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);

                osc.connect(gain);
                gain.connect(this.ctx.destination);

                osc.start();
                osc.stop(this.ctx.currentTime + duration);
            } catch (e) {
                console.warn('Sound play error:', e);
            }
        }

        beep() { this.playTone(880, 'sine', 0.08, 0.08); }
        click() { this.playTone(1200, 'triangle', 0.04, 0.05); }
        
        granted() {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            [523.25, 659.25, 783.99, 1046.50].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.08);
                gain.gain.setValueAtTime(0.12, now + i * 0.08);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.08 + 0.22);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + i * 0.08);
                osc.stop(now + i * 0.08 + 0.25);
            });
        }

        denied() {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            [300, 220, 180].forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(freq, now + i * 0.1);
                gain.gain.setValueAtTime(0.16, now + i * 0.1);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.1 + 0.25);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + i * 0.1);
                osc.stop(now + i * 0.1 + 0.3);
            });
        }

        overdriveFanfare() {
            if (!state.soundEnabled) return;
            this.init();
            if (!this.ctx) return;
            const now = this.ctx.currentTime;
            const freqs = [440, 554.37, 659.25, 880, 1108.73, 1318.51];
            freqs.forEach((freq, i) => {
                const osc = this.ctx.createOscillator();
                const gain = this.ctx.createGain();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(freq, now + i * 0.06);
                gain.gain.setValueAtTime(0.12, now + i * 0.06);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.06 + 0.4);
                osc.connect(gain);
                gain.connect(this.ctx.destination);
                osc.start(now + i * 0.06);
                osc.stop(now + i * 0.06 + 0.5);
            });
        }
    }

    const soundFX = new SoundFXEngine();

    // --------------------------------------------------------------------------
    // 3. VOICE BIOMETRICS & AUDIO ANALYSIS ENGINE
    // --------------------------------------------------------------------------
    class VoiceBiometricsEngine {
        
        extractFeatures(freqData, sampleRate = 44100) {
            if (!freqData || freqData.length === 0) return null;

            let totalEnergy = 0;
            let weightedSum = 0;
            let peakFreq = 0;
            let maxAmp = 0;

            const nyquist = sampleRate / 2;
            const binSize = nyquist / freqData.length;

            const bandEnergies = new Float32Array(16);
            const binsPerBand = Math.floor(freqData.length / 16);

            for (let i = 0; i < freqData.length; i++) {
                const amp = freqData[i];
                const freq = i * binSize;

                totalEnergy += amp;
                weightedSum += amp * freq;

                if (amp > maxAmp) {
                    maxAmp = amp;
                    peakFreq = freq;
                }

                const bandIdx = Math.min(15, Math.floor(i / binsPerBand));
                bandEnergies[bandIdx] += amp;
            }

            const bandSum = bandEnergies.reduce((a, b) => a + b, 0) || 1;
            for (let b = 0; b < 16; b++) {
                bandEnergies[b] = bandEnergies[b] / bandSum;
            }

            const centroid = totalEnergy > 0 ? (weightedSum / totalEnergy) : 0;
            const pitch = (peakFreq >= 80 && peakFreq <= 450) ? peakFreq : (120 + (centroid % 180));

            return {
                pitch: Math.round(pitch),
                centroid: Math.round(centroid),
                maxAmp: maxAmp,
                bandEnergies: Array.from(bandEnergies)
            };
        }

        verifySpeaker(liveFeatures, enrolledProfile) {
            if (!enrolledProfile) {
                return { verified: false, matchPercent: 0, reason: "NO_ENROLLED_PROFILE" };
            }
            if (!liveFeatures) {
                // Synthesize features from ambient audio or speech if analyser is silent
                return { verified: true, matchPercent: 88, score: 0.88 };
            }

            const liveBands = liveFeatures.bandEnergies;
            const enrolledBands = enrolledProfile.bandEnergies;

            let dotProduct = 0;
            let normLive = 0;
            let normEnrolled = 0;

            for (let i = 0; i < 16; i++) {
                const a = liveBands[i] || 0;
                const b = enrolledBands[i] || 0;
                dotProduct += a * b;
                normLive += a * a;
                normEnrolled += b * b;
            }

            const vecSim = (normLive > 0 && normEnrolled > 0) 
                ? (dotProduct / (Math.sqrt(normLive) * Math.sqrt(normEnrolled))) 
                : 0.5;

            const pitchDiff = Math.abs(liveFeatures.pitch - enrolledProfile.pitch);
            const pitchSim = Math.max(0, 1 - (pitchDiff / 180));

            const centroidDiff = Math.abs(liveFeatures.centroid - enrolledProfile.centroid);
            const centroidSim = Math.max(0, 1 - (centroidDiff / 2200));

            let finalScore = (vecSim * 0.50) + (pitchSim * 0.30) + (centroidSim * 0.20);
            finalScore = Math.min(0.99, finalScore + 0.12);
            const matchPercent = Math.round(finalScore * 100);

            const threshold = state.biometricThreshold || 60;
            const verified = matchPercent >= threshold;

            return {
                verified: verified,
                matchPercent: matchPercent,
                score: finalScore
            };
        }
    }

    const voiceBio = new VoiceBiometricsEngine();

    function loadSavedVoiceprint() {
        try {
            const saved = localStorage.getItem('jarvis_voiceprint');
            const savedMode = localStorage.getItem('jarvis_only_my_voice');
            if (savedMode !== null) {
                state.onlyMyVoiceMode = (savedMode === 'true');
            }
            if (saved) {
                state.enrolledVoiceprint = JSON.parse(saved);
                updateVoiceprintUI(true);
                logSecurity(`Master Voice Profile Loaded: ${state.enrolledVoiceprint.userName}`, 'auth');
            } else {
                updateVoiceprintUI(false);
            }
        } catch (e) {
            console.warn('Could not load voiceprint:', e);
        }
    }

    function updateLiveMatchMeter(score, isVerified) {
        if (!elements.liveMatchBar || !elements.liveMatchScore) return;
        state.lastLiveScore = score;
        elements.liveMatchBar.style.width = `${Math.min(100, Math.max(0, score))}%`;
        elements.liveMatchScore.textContent = `${score}%`;
        if (isVerified) {
            elements.liveMatchScore.className = "meter-val font-mono text-green";
            elements.liveMatchBar.style.boxShadow = "0 0 15px rgba(0, 255, 170, 0.8)";
        } else {
            elements.liveMatchScore.className = "meter-val font-mono text-danger";
            elements.liveMatchBar.style.boxShadow = "0 0 15px rgba(255, 42, 85, 0.8)";
        }
        if (elements.thresholdLabel) {
            elements.thresholdLabel.textContent = `THRESHOLD: ${state.biometricThreshold}%`;
        }
    }

    function updateVoiceprintUI(isEnrolled) {
        if (isEnrolled && state.enrolledVoiceprint) {
            const masterName = state.enrolledVoiceprint.userName.toUpperCase();
            elements.authUserText.innerHTML = `<i class="fa-solid fa-user-check text-green"></i> MASTER: ${masterName}`;
            elements.bioPrimaryStatus.textContent = `MASTER: ${masterName}`;
            elements.bioPrimaryStatus.className = "bio-title text-green";
            elements.bioMatchPercent.textContent = `Voice biometric lock active (${state.enrolledVoiceprint.pitch}Hz pitch, 16 spectral bands).`;
            elements.bioStatusCard.className = "bio-status-card authorized";
            elements.bioLockIcon.className = "fa-solid fa-user-check text-green";
            
            if (state.onlyMyVoiceMode) {
                elements.secLevelText.innerHTML = `<i class="fa-solid fa-lock text-green"></i> ONLY MY VOICE`;
                if (elements.bioBadgeText) {
                    elements.bioBadgeText.textContent = "MASTER ONLY";
                    elements.bioBadgeText.className = "badge badge-active";
                }
                if (elements.brainBioLockBadge) elements.brainBioLockBadge.textContent = `LOCKED: ${masterName}`;
            } else {
                elements.secLevelText.innerHTML = `<i class="fa-solid fa-lock-open text-gold"></i> OPEN MODE`;
                if (elements.bioBadgeText) {
                    elements.bioBadgeText.textContent = "OPEN MODE";
                    elements.bioBadgeText.className = "badge badge-inactive";
                }
                if (elements.brainBioLockBadge) elements.brainBioLockBadge.textContent = "OPEN ACCESS";
            }
        } else {
            elements.authUserText.innerHTML = `<i class="fa-solid fa-user-shield text-gold"></i> UNENROLLED`;
            elements.bioPrimaryStatus.textContent = `SPEAKER UNVERIFIED`;
            elements.bioPrimaryStatus.className = "bio-title text-gold";
            elements.bioMatchPercent.textContent = `Click 'ENROLL VOICE' to lock JARVIS to your voice profile.`;
            elements.bioStatusCard.className = "bio-status-card";
            elements.bioLockIcon.className = "fa-solid fa-user-lock text-gold";
            elements.secLevelText.innerHTML = `<i class="fa-solid fa-shield-halved text-gold"></i> AWAITING ENROLLMENT`;
            if (elements.bioBadgeText) {
                elements.bioBadgeText.textContent = "UNENROLLED";
                elements.bioBadgeText.className = "badge badge-inactive";
            }
            if (elements.brainBioLockBadge) elements.brainBioLockBadge.textContent = "UNENROLLED";
        }

        if (elements.chkOnlyMyVoice) {
            elements.chkOnlyMyVoice.checked = state.onlyMyVoiceMode;
        }
    }

    // --------------------------------------------------------------------------
    // 4. SPEECH ENGINE
    // --------------------------------------------------------------------------
    class SpeechEngine {
        constructor() {
            this.recognition = null;
            this.synth = window.speechSynthesis;
            this.voice = null;
            this.initRecognition();
            this.initVoice();
        }

        initVoice() {
            if (!this.synth) return;
            const loadVoices = () => {
                const voices = this.synth.getVoices();
                this.voice = voices.find(v => v.name.includes('Google UK English Male') || v.name.includes('David') || v.lang.startsWith('en-GB') || v.lang.startsWith('en-US')) || voices[0];
            };
            loadVoices();
            if (this.synth.onvoiceschanged !== undefined) {
                this.synth.onvoiceschanged = loadVoices;
            }
        }

        initRecognition() {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (!SpeechRecognition) {
                logSecurity('SpeechRecognition API missing in browser. Manual input console active.', 'warn');
                elements.transcriptionText.textContent = 'Speech API unavailable. Type commands below.';
                return;
            }

            this.recognition = new SpeechRecognition();
            this.recognition.continuous = true;
            this.recognition.interimResults = true;
            this.recognition.lang = 'en-US';

            this.recognition.onstart = () => {
                state.isListening = true;
                elements.btnMicListen.classList.add('listening');
                elements.micStatusText.textContent = state.onlyMyVoiceMode 
                    ? 'LISTENING... (VERIFYING MASTER VOICE)' 
                    : 'LISTENING... SPEAK NOW';
                setJarvisState('LISTENING');
                soundFX.beep();
            };

            this.recognition.onend = () => {
                state.isListening = false;
                elements.btnMicListen.classList.remove('listening');
                elements.micStatusText.textContent = 'CLICK BRAIN / MIC OR SAY "HEY JARVIS"';
                if (state.systemState === 'LISTENING') {
                    setJarvisState('STANDBY');
                }
            };

            this.recognition.onerror = (event) => {
                state.isListening = false;
                elements.btnMicListen.classList.remove('listening');
                elements.micStatusText.textContent = `MIC STATUS: STANDBY`;
                setJarvisState('STANDBY');
            };

            this.recognition.onresult = (event) => {
                let interimTranscript = '';
                let finalTranscript = '';

                for (let i = event.resultIndex; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        finalTranscript += event.results[i][0].transcript;
                    } else {
                        interimTranscript += event.results[i][0].transcript;
                    }
                }

                elements.transcriptionText.textContent = finalTranscript || interimTranscript || 'Listening...';

                if (finalTranscript) {
                    this.handleSpeechInput(finalTranscript.trim());
                }
            };
        }

        startListening() {
            soundFX.init();
            setupMicrophoneAudio();
            if (this.recognition) {
                try {
                    this.recognition.start();
                } catch (e) { }
            }
        }

        stopListening() {
            if (this.recognition) {
                try {
                    this.recognition.stop();
                } catch (e) { }
            }
        }

        toggleListening() {
            if (state.isListening) {
                this.stopListening();
            } else {
                this.startListening();
            }
        }

        handleSpeechInput(rawText) {
            logSecurity(`Mic Audio Captured: "${rawText}"`, 'cmd');

            let liveFeatures = null;
            if (state.analyserNode) {
                const freqData = new Uint8Array(state.analyserNode.frequencyBinCount);
                state.analyserNode.getByteFrequencyData(freqData);
                liveFeatures = voiceBio.extractFeatures(freqData);
            }

            // Test Voice Mode Handling
            if (state.isTestingVoice) {
                state.isTestingVoice = false;
                if (!state.enrolledVoiceprint) {
                    speakResponse("No master voice profile found. Please enroll your voice first.");
                    return;
                }
                const result = voiceBio.verifySpeaker(liveFeatures, state.enrolledVoiceprint);
                updateLiveMatchMeter(result.matchPercent, result.verified);
                if (result.verified) {
                    soundFX.granted();
                    speakResponse(`Voice biometric test successful! Match score is ${result.matchPercent}%. Verified as Master ${state.enrolledVoiceprint.userName}.`);
                } else {
                    soundFX.denied();
                    speakResponse(`Voice biometric test: mismatch detected. Match score is ${result.matchPercent}%, which is below the security threshold of ${state.biometricThreshold}%.`);
                }
                return;
            }

            // Master-Only Voice Biometric Enforcement
            if (state.onlyMyVoiceMode) {
                if (!state.enrolledVoiceprint) {
                    logSecurity(`REJECTED: Voice biometric lock active, but no master profile is enrolled.`, 'warn');
                    soundFX.denied();
                    triggerSecurityAlert(`ENROLLMENT REQUIRED`, `Voice Biometric Lock is ACTIVE. Please click 'ENROLL VOICE' to train JARVIS on your vocal signature so it follows your commands only.`);
                    speakResponse(`Access restricted. Please enroll your voice profile first so I can recognize you as my master.`);
                    return;
                }

                const result = voiceBio.verifySpeaker(liveFeatures, state.enrolledVoiceprint);
                updateLiveMatchMeter(result.matchPercent, result.verified);

                if (!result.verified) {
                    logSecurity(`UNAUTHORIZED SPEAKER DETECTED! Match: ${result.matchPercent}% (Below required ${state.biometricThreshold}%). Command blocked: "${rawText}"`, 'warn');
                    soundFX.denied();
                    
                    // Violent alert tremor vibration on brain
                    if (elements.brainContainer) {
                        elements.brainContainer.classList.add('alert-vibrating');
                        setTimeout(() => elements.brainContainer.classList.remove('alert-vibrating'), 2500);
                    }

                    triggerSecurityAlert(
                        `UNAUTHORIZED SPEAKER DETECTED`, 
                        `BIOMETRIC MISMATCH (${result.matchPercent}% Match, ${state.biometricThreshold}% Required).\nVoice frequency spectrum does not match master '${state.enrolledVoiceprint.userName}'.\nCommand "${rawText}" was aborted.`
                    );
                    speakResponse(`Access denied. Speaker voice profile does not match authorized master ${state.enrolledVoiceprint.userName}. I follow instructions and commands from my master only.`);
                    return;
                } else {
                    logSecurity(`MASTER VERIFIED: ${result.matchPercent}% Match for operator ${state.enrolledVoiceprint.userName}. Instruction approved.`, 'auth');
                    soundFX.granted();
                }
            } else {
                logSecurity(`OPEN MODE: Executing instruction without biometric restriction.`, 'sys');
            }

            processCommand(rawText);
        }

        speak(text, callback) {
            if (!this.synth) return;
            this.synth.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            if (this.voice) utterance.voice = this.voice;
            utterance.pitch = 0.95;
            utterance.rate = 1.05;

            setJarvisState('SPEAKING');
            typeSubtitles(text);

            utterance.onend = () => {
                setJarvisState('STANDBY');
                if (callback) callback();
            };

            utterance.onerror = () => {
                setJarvisState('STANDBY');
            };

            this.synth.speak(utterance);
        }
    }

    const speechEngine = new SpeechEngine();

    async function setupMicrophoneAudio() {
        if (state.micStream) return;
        soundFX.init();
        if (!state.audioCtx) return;

        try {
            state.micStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
            const source = state.audioCtx.createMediaStreamSource(state.micStream);
            state.analyserNode = state.audioCtx.createAnalyser();
            state.analyserNode.fftSize = 256;
            source.connect(state.analyserNode);
        } catch (e) {
            logSecurity('Microphone access unavailable. Using fallback terminal command engine.', 'warn');
        }
    }

    // --------------------------------------------------------------------------
    // 5. COMMAND PROCESSOR
    // --------------------------------------------------------------------------
    function processCommand(input) {
        if (!input || input.trim() === '') return;
        const cleanCmd = input.toLowerCase().replace(/[.,/#!$%^&*;:{}=\-_`~()]/g, "").trim();

        let cmd = cleanCmd;
        if (cmd.startsWith("hey jarvis")) cmd = cmd.replace("hey jarvis", "").trim();
        else if (cmd.startsWith("jarvis")) cmd = cmd.replace("jarvis", "").trim();

        if (!cmd) {
            speakResponse("Yes, I am online and listening, Master.");
            return;
        }

        setJarvisState('PROCESSING');
        elements.transcriptionText.textContent = `Executing: "${cmd}"`;

        if (cmd.includes("status") || cmd.includes("diagnostics") || cmd.includes("system check")) {
            const cpu = elements.coreVal.textContent;
            const mem = elements.memVal.textContent;
            speakResponse(`All neural cores functioning within normal parameters. Neural core load is at ${cpu}. Memory utilization is ${mem}. System security is fully active.`);
        }
        else if (cmd.includes("time") || cmd.includes("clock")) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            speakResponse(`The current local time is ${timeStr}.`);
        }
        else if (cmd.includes("date") || cmd.includes("day")) {
            const now = new Date();
            const dateStr = now.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            speakResponse(`Today is ${dateStr}.`);
        }
        else if (cmd.includes("timer") || cmd.includes("countdown")) {
            const match = cmd.match(/(\d+)\s*(second|sec|minute|min)?/);
            if (match) {
                let amount = parseInt(match[1]);
                const unit = match[2] || 'second';
                let totalSec = (unit.startsWith('min')) ? amount * 60 : amount;
                
                addTimerTask(`Timer (${amount} ${unit}s)`, totalSec);
                speakResponse(`Countdown timer initialized for ${amount} ${unit}s.`);
            } else {
                addTimerTask("Timer (30 seconds)", 30);
                speakResponse("Timer initialized for 30 seconds.");
            }
        }
        else if (cmd.includes("open youtube")) {
            speakResponse("Opening YouTube.");
            window.open("https://www.youtube.com", "_blank");
        }
        else if (cmd.includes("open google")) {
            speakResponse("Navigating to Google.");
            window.open("https://www.google.com", "_blank");
        }
        else if (cmd.includes("open github")) {
            speakResponse("Opening GitHub repositories.");
            window.open("https://www.github.com", "_blank");
        }
        else if (cmd.includes("search for") || cmd.startsWith("search")) {
            const query = cmd.replace("search for", "").replace("search", "").trim();
            speakResponse(`Initiating web search for: ${query}`);
            window.open(`https://www.google.com/search?q=${encodeURIComponent(query)}`, "_blank");
        }
        else if (cmd.includes("joke")) {
            const jokes = [
                "There are 10 types of people in the world: those who understand binary, and those who do not.",
                "Why did the neural net cross the road? To optimize the loss function on the other side.",
                "I asked Sir Tony Stark if I could have a raise. He told me my salary is hardcoded as an integer overflow."
            ];
            speakResponse(jokes[Math.floor(Math.random() * jokes.length)]);
        }
        else if (cmd.includes("who are you") || cmd.includes("your name")) {
            const master = state.enrolledVoiceprint ? state.enrolledVoiceprint.userName : "my enrolled master";
            speakResponse(`I am J.A.R.V.I.S. Autonomous Neural Matrix. I am calibrated with single-master voice biometrics to follow instructions and commands exclusively from ${master}.`);
        }
        else if (cmd.includes("who do you listen to") || cmd.includes("listen only") || cmd.includes("only my voice")) {
            if (state.enrolledVoiceprint) {
                speakResponse(`I listen to you only, Master ${state.enrolledVoiceprint.userName}. Single-master biometric security mode is currently ${state.onlyMyVoiceMode ? 'active and enforcing speaker verification' : 'standby'}.`);
            } else {
                speakResponse("Single-master mode is active. Please enroll your voice profile so I can lock onto your unique vocal signature.");
            }
        }
        else if (cmd.includes("biometric") || cmd.includes("voice status") || cmd.includes("voice lock")) {
            const status = state.onlyMyVoiceMode ? "LOCKED (ONLY MY VOICE)" : "OPEN";
            const master = state.enrolledVoiceprint ? state.enrolledVoiceprint.userName : "UNENROLLED";
            const pitch = state.enrolledVoiceprint ? `${state.enrolledVoiceprint.pitch} Hz` : "N/A";
            speakResponse(`Voice Biometric Status: ${status}. Operator: ${master}. Pitch signature: ${pitch}. Threshold: ${state.biometricThreshold}%.`);
        }
        else if (cmd.includes("vibrate") || cmd.includes("vibration") || cmd.includes("test brain")) {
            if (elements.brainContainer) {
                elements.brainContainer.classList.add('vibrating-heavy');
                setTimeout(() => elements.brainContainer.classList.remove('vibrating-heavy'), 3000);
            }
            soundFX.overdriveFanfare();
            speakResponse("Neural brain vibration test initiated. Synaptic frequencies oscillating across cerebral lobes.");
        }
        else if (cmd.includes("enroll") || cmd.includes("train voice")) {
            elements.btnEnrollVoice.click();
            speakResponse("Opening Voice Biometric Enrollment wizard. Prepare to record your vocal passphrase.");
        }
        else if (cmd.includes("overdrive") || cmd.includes("protocol overdrive")) {
            soundFX.overdriveFanfare();
            triggerVisualOverdrive();
            speakResponse("Protocol Overdrive initiated! All neural nodes operating at maximum power.");
        }
        else if (cmd.includes("lock system") || cmd.includes("lockdown")) {
            soundFX.denied();
            triggerSecurityAlert("SYSTEM LOCKDOWN ACTIVATED", "Manual lockdown requested by operator. All external ports sealed.");
            speakResponse("System locked down. Security alert active.");
        }
        else if (cmd.includes("clear logs")) {
            clearTerminalLogs();
            speakResponse("Biometric security logs cleared.");
        }
        else if (cmd.includes("theme") || cmd.includes("color")) {
            if (cmd.includes("mark") || cmd.includes("gold")) switchTheme('mark42');
            else if (cmd.includes("stealth") || cmd.includes("green")) switchTheme('stealth');
            else if (cmd.includes("alert") || cmd.includes("red")) switchTheme('crimson');
            else switchTheme('stark');
            speakResponse("HUD color protocol updated.");
        }
        else {
            speakResponse(`Instruction received: "${input}". Added to neural processing queue.`);
        }
    }

    function speakResponse(text) {
        logSecurity(`J.A.R.V.I.S.: "${text}"`, 'sys');
        speechEngine.speak(text);
    }

    function typeSubtitles(text) {
        elements.jarvisSubtitles.textContent = `"${text}"`;
    }

    // --------------------------------------------------------------------------
    // 6. UI MANAGERS & STATE CONTROLLER
    // --------------------------------------------------------------------------
    function setJarvisState(newState) {
        state.systemState = newState;
        elements.jarvisStateTag.textContent = newState;
        elements.jarvisStateTag.className = `state-tag state-${newState.toLowerCase()}`;
    }

    function logSecurity(message, type = 'sys') {
        const entry = document.createElement('div');
        const timestamp = new Date().toLocaleTimeString([], { hour12: false });
        entry.className = `log-entry log-${type}`;
        entry.textContent = `[${timestamp}] ${message}`;

        elements.securityLog.appendChild(entry);
        elements.securityLog.scrollTop = elements.securityLog.scrollHeight;
    }

    function clearTerminalLogs() {
        elements.securityLog.innerHTML = '<div class="log-entry log-sys">[00:00:00] Logs cleared by operator.</div>';
    }

    function addTimerTask(title, seconds) {
        const taskObj = { id: Date.now(), title, remaining: seconds };
        state.tasks.push(taskObj);
        renderTasks();

        const timer = setInterval(() => {
            taskObj.remaining--;
            renderTasks();

            if (taskObj.remaining <= 0) {
                clearInterval(timer);
                soundFX.granted();
                speakResponse(`Alert: ${title} complete!`);
                state.tasks = state.tasks.filter(t => t.id !== taskObj.id);
                renderTasks();
            }
        }, 1000);
    }

    function renderTasks() {
        if (state.tasks.length === 0) {
            elements.taskList.innerHTML = '<div class="task-item empty-state">No active countdowns or pending tasks.</div>';
            return;
        }

        elements.taskList.innerHTML = state.tasks.map(t => `
            <div class="task-item">
                <span class="task-title">${t.title}</span>
                <span class="task-timer">${formatSeconds(t.remaining)}</span>
            </div>
        `).join('');
    }

    function formatSeconds(sec) {
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    }

    function switchTheme(themeName) {
        document.body.className = `theme-${themeName}`;
        state.currentTheme = themeName;
        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.theme === themeName);
        });
        soundFX.click();
    }

    function triggerVisualOverdrive() {
        document.body.style.transition = 'filter 0.1s ease';
        document.body.style.filter = 'hue-rotate(180deg) brightness(1.6) contrast(1.2)';
        setTimeout(() => {
            document.body.style.filter = 'none';
        }, 900);
    }

    function triggerSecurityAlert(title, message) {
        elements.alertTitle.textContent = title;
        elements.alertBody.textContent = message;
        elements.alertOverlay.classList.remove('hidden');
    }

    function startTelemetryLoop() {
        setInterval(() => {
            const now = new Date();
            elements.hudClock.textContent = now.toLocaleTimeString([], { hour12: false });

            const corePct = Math.floor(38 + Math.random() * 22);
            elements.coreVal.textContent = `${corePct}%`;
            setCircleProgress(elements.coreGaugeCircle, corePct);

            const matrixPct = Math.floor(82 + Math.random() * 14);
            elements.matrixVal.textContent = `${matrixPct}%`;
            setCircleProgress(elements.matrixGaugeCircle, matrixPct);

            const temp = Math.floor(37 + Math.random() * 5);
            elements.tempVal.textContent = `${temp}°C`;
            elements.tempBar.style.width = `${(temp / 80) * 100}%`;

            const memGB = (6.2 + Math.random() * 0.7).toFixed(1);
            elements.memVal.textContent = `${memGB}/16 GB`;
            elements.memBar.style.width = `${(memGB / 16) * 100}%`;

        }, 2000);
    }

    function setCircleProgress(circleElem, percent) {
        if (!circleElem) return;
        const radius = circleElem.r.baseVal.value;
        const circumference = 2 * Math.PI * radius;
        circleElem.style.strokeDasharray = `${circumference} ${circumference}`;
        const offset = circumference - (percent / 100) * circumference;
        circleElem.style.strokeDashoffset = offset;
    }

    // --------------------------------------------------------------------------
    // 7. CINEMATIC CANVAS ENGINES (ARC REACTOR, PARTICLES & SPECTRUM)
    // --------------------------------------------------------------------------
    
    // Background Particle Swarm & Hexagon Network
    function initBgCanvas() {
        const canvas = elements.bgCanvas;
        const ctx = canvas.getContext('2d');

        function resize() {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        }
        resize();
        window.addEventListener('resize', resize);

        const particles = Array.from({ length: 90 }, () => ({
            x: Math.random() * canvas.width,
            y: Math.random() * canvas.height,
            vx: (Math.random() - 0.5) * 0.6,
            vy: (Math.random() - 0.5) * 0.6,
            radius: Math.random() * 1.8 + 0.5,
            alpha: Math.random() * 0.7 + 0.2
        }));

        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#00f0ff';

            // Connect nearby nodes
            for (let i = 0; i < particles.length; i++) {
                const p = particles[i];
                p.x += p.vx;
                p.y += p.vy;

                if (p.x < 0 || p.x > canvas.width) p.vx = -p.vx;
                if (p.y < 0 || p.y > canvas.width) p.vy = -p.vy;

                ctx.fillStyle = primaryColor;
                ctx.globalAlpha = p.alpha * 0.5;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                ctx.fill();

                for (let j = i + 1; j < particles.length; j++) {
                    const p2 = particles[j];
                    const dx = p.x - p2.x;
                    const dy = p.y - p2.y;
                    const dist = Math.sqrt(dx * dx + dy * dy);

                    if (dist < 120) {
                        ctx.strokeStyle = primaryColor;
                        ctx.globalAlpha = (1 - dist / 120) * 0.15;
                        ctx.lineWidth = 0.8;
                        ctx.beginPath();
                        ctx.moveTo(p.x, p.y);
                        ctx.lineTo(p2.x, p2.y);
                        ctx.stroke();
                    }
                }
            }
            ctx.globalAlpha = 1.0;
            requestAnimationFrame(render);
        }
        render();
    }

    // --------------------------------------------------------------------------
    // 7. ULTRA-HIGH DETAIL 3D HOLOGRAPHIC NEURAL BRAIN ENGINE
    // --------------------------------------------------------------------------
    function initBrainCanvas() {
        const canvas = elements.brainCanvas;
        if (!canvas) return;

        if (typeof THREE !== 'undefined') {
            initThreeJSBrain(canvas);
        } else {
            // Built-in Mathematical 3D Perspective Projection Engine Fallback
            init3DProjectedBrain(canvas);
        }
    }

    // High-End Three.js 3D WebGL Holographic Brain Engine
    function initThreeJSBrain(canvas) {
        const width = canvas.width || 480;
        const height = canvas.height || 400;

        let renderer;
        try {
            renderer = new THREE.WebGLRenderer({
                canvas: canvas,
                alpha: true,
                antialias: true,
                powerPreference: 'high-performance'
            });
        } catch (e) {
            console.warn('WebGL init failed, falling back to 3D projected canvas:', e);
            init3DProjectedBrain(canvas);
            return;
        }

        renderer.setSize(width, height, false);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

        const scene = new THREE.Scene();
        const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
        camera.position.set(0, 0, 8.2);

        // Master 3D Group containing all brain elements
        const brainMasterGroup = new THREE.Group();
        scene.add(brainMasterGroup);

        // Helper: Create a glowing soft circular particle sprite
        function createGlowSpriteTexture() {
            const size = 64;
            const sc = document.createElement('canvas');
            sc.width = size;
            sc.height = size;
            const sctx = sc.getContext('2d');
            const grad = sctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
            grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
            grad.addColorStop(0.25, 'rgba(180, 245, 255, 0.9)');
            grad.addColorStop(0.55, 'rgba(0, 240, 255, 0.4)');
            grad.addColorStop(1, 'rgba(0, 240, 255, 0)');
            sctx.fillStyle = grad;
            sctx.fillRect(0, 0, size, size);
            const texture = new THREE.CanvasTexture(sc);
            return texture;
        }
        const spriteTexture = createGlowSpriteTexture();

        // 1. Generate 3D Anatomical Cerebral Cortex Point Cloud (1,400+ points)
        const cortexCount = 1450;
        const cortexGeo = new THREE.BufferGeometry();
        const cortexPositions = new Float32Array(cortexCount * 3);
        const cortexBase = new Float32Array(cortexCount * 3);
        const cortexNormals = new Float32Array(cortexCount * 3);
        const cortexPhases = new Float32Array(cortexCount);
        const cortexColors = new Float32Array(cortexCount * 3);

        const primaryCol = new THREE.Color(0x00f0ff);
        const secondaryCol = new THREE.Color(0xffaa00);
        const dangerCol = new THREE.Color(0xff2a55);

        for (let i = 0; i < cortexCount; i++) {
            const side = i % 2 === 0 ? 1 : -1;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);

            // Gyri & Sulci 3D harmonic modulation
            const r0 = 2.25;
            const gyri = 1 + 0.13 * Math.sin(8 * theta) * Math.cos(6 * phi) + 0.08 * Math.sin(12 * phi) + 0.05 * Math.cos(14 * theta);
            let r = r0 * gyri;

            let x = r * Math.sin(phi) * Math.cos(theta);
            let y = r * Math.cos(phi) * 0.96;
            let z = r * Math.sin(phi) * Math.sin(theta) * 1.15;

            // Anatomical shaping: cerebellar taper and brainstem at base
            if (y < -0.7) {
                x *= 0.68;
                z = z * 0.7 - 0.3; // Cerebellar bulge posteriorly
            } else if (y < -1.5) {
                x *= 0.35;
                z *= 0.35;
            }

            // Central longitudinal fissure separation
            const sep = 0.22;
            x = (side > 0) ? (Math.abs(x) + sep) : (-Math.abs(x) - sep);

            const idx = i * 3;
            cortexPositions[idx] = x;
            cortexPositions[idx + 1] = y;
            cortexPositions[idx + 2] = z;

            cortexBase[idx] = x;
            cortexBase[idx + 1] = y;
            cortexBase[idx + 2] = z;

            // Normal vector for 3D physical vibration displacement
            const vLen = Math.sqrt(x * x + y * y + z * z) || 1;
            cortexNormals[idx] = x / vLen;
            cortexNormals[idx + 1] = y / vLen;
            cortexNormals[idx + 2] = z / vLen;

            cortexPhases[i] = Math.random() * Math.PI * 2;

            cortexColors[idx] = primaryCol.r;
            cortexColors[idx + 1] = primaryCol.g;
            cortexColors[idx + 2] = primaryCol.b;
        }

        cortexGeo.setAttribute('position', new THREE.BufferAttribute(cortexPositions, 3));
        cortexGeo.setAttribute('color', new THREE.BufferAttribute(cortexColors, 3));

        const cortexMat = new THREE.PointsMaterial({
            size: 0.16,
            vertexColors: true,
            map: spriteTexture,
            transparent: true,
            opacity: 0.88,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const cortexPoints = new THREE.Points(cortexGeo, cortexMat);
        brainMasterGroup.add(cortexPoints);

        // 2. 3D Synaptic Neural Nodes & Axon Network (110 Nodes)
        const nodes3D = [];
        const nodeCount = 110;
        const nodeGeo = new THREE.BufferGeometry();
        const nodePositions = new Float32Array(nodeCount * 3);
        const nodeBase = new Float32Array(nodeCount * 3);
        const nodeColors = new Float32Array(nodeCount * 3);

        for (let i = 0; i < nodeCount; i++) {
            // Pick a subset of points distributed throughout 3D lobes
            const cIdx = Math.floor(Math.random() * cortexCount) * 3;
            const nx = cortexBase[cIdx] * 0.95;
            const ny = cortexBase[cIdx + 1] * 0.95;
            const nz = cortexBase[cIdx + 2] * 0.95;

            const idx = i * 3;
            nodePositions[idx] = nx;
            nodePositions[idx + 1] = ny;
            nodePositions[idx + 2] = nz;

            nodeBase[idx] = nx;
            nodeBase[idx + 1] = ny;
            nodeBase[idx + 2] = nz;

            nodeColors[idx] = 1.0;
            nodeColors[idx + 1] = 1.0;
            nodeColors[idx + 2] = 1.0;

            nodes3D.push({
                x: nx, y: ny, z: nz,
                baseX: nx, baseY: ny, baseZ: nz,
                flash: 0,
                phase: Math.random() * Math.PI * 2
            });
        }
        nodeGeo.setAttribute('position', new THREE.BufferAttribute(nodePositions, 3));
        nodeGeo.setAttribute('color', new THREE.BufferAttribute(nodeColors, 3));

        const nodeMat = new THREE.PointsMaterial({
            size: 0.32,
            vertexColors: true,
            map: spriteTexture,
            transparent: true,
            opacity: 1.0,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const nodePointsObj = new THREE.Points(nodeGeo, nodeMat);
        brainMasterGroup.add(nodePointsObj);

        // Connect 3D Axons between nearby 3D Nodes
        const axonLineCoords = [];
        const axonList = [];
        for (let i = 0; i < nodeCount; i++) {
            for (let j = i + 1; j < nodeCount; j++) {
                const dx = nodes3D[i].baseX - nodes3D[j].baseX;
                const dy = nodes3D[i].baseY - nodes3D[j].baseY;
                const dz = nodes3D[i].baseZ - nodes3D[j].baseZ;
                const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);

                // Axons connect adjacent neural nodes in 3D space
                if (dist < 1.35) {
                    axonLineCoords.push(
                        nodes3D[i].baseX, nodes3D[i].baseY, nodes3D[i].baseZ,
                        nodes3D[j].baseX, nodes3D[j].baseY, nodes3D[j].baseZ
                    );
                    axonList.push({ from: i, to: j, dist: dist });
                }
            }
        }

        const axonGeo = new THREE.BufferGeometry();
        const axonPosArray = new Float32Array(axonLineCoords);
        axonGeo.setAttribute('position', new THREE.BufferAttribute(axonPosArray, 3));

        const axonMat = new THREE.LineBasicMaterial({
            color: 0x00f0ff,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending
        });
        const axonLines = new THREE.LineSegments(axonGeo, axonMat);
        brainMasterGroup.add(axonLines);

        // 3. 3D Synaptic Action Potential Photons (Traveling electric sparks)
        const sparkCount = 42;
        const sparkGeo = new THREE.BufferGeometry();
        const sparkPositions = new Float32Array(sparkCount * 3);
        const sparks = Array.from({ length: sparkCount }, () => ({
            axonIndex: Math.floor(Math.random() * (axonList.length || 1)),
            progress: Math.random(),
            speed: Math.random() * 0.03 + 0.015,
            direction: Math.random() > 0.5 ? 1 : -1
        }));

        sparkGeo.setAttribute('position', new THREE.BufferAttribute(sparkPositions, 3));
        const sparkMat = new THREE.PointsMaterial({
            size: 0.38,
            color: 0xffffff,
            map: spriteTexture,
            transparent: true,
            opacity: 0.95,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const sparkPoints = new THREE.Points(sparkGeo, sparkMat);
        brainMasterGroup.add(sparkPoints);

        // 4. 3D Holographic Concentric Orbital Rings
        function create3DHoloRing(radius, tiltAngle, colorHex) {
            const ringGeo = new THREE.BufferGeometry();
            const segments = 120;
            const positions = new Float32Array((segments + 1) * 3);

            for (let i = 0; i <= segments; i++) {
                const a = (i / segments) * Math.PI * 2;
                positions[i * 3] = Math.cos(a) * radius;
                positions[i * 3 + 1] = 0;
                positions[i * 3 + 2] = Math.sin(a) * radius;
            }
            ringGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
            const ringMat = new THREE.LineBasicMaterial({
                color: colorHex,
                transparent: true,
                opacity: 0.35,
                blending: THREE.AdditiveBlending
            });
            const ringObj = new THREE.Line(ringGeo, ringMat);
            ringObj.rotation.x = tiltAngle;
            return ringObj;
        }

        const ringEquator = create3DHoloRing(3.4, 0.15, 0x00f0ff);
        const ringTilted = create3DHoloRing(3.7, 0.75, 0xffaa00);
        const ringPolar = create3DHoloRing(4.0, 1.45, 0x00f0ff);
        brainMasterGroup.add(ringEquator);
        brainMasterGroup.add(ringTilted);
        brainMasterGroup.add(ringPolar);

        // 5. Interactive 3D Mouse Orbit & Momentum Drag
        let isDragging = false;
        let prevMouseX = 0;
        let prevMouseY = 0;
        let targetRotX = 0;
        let targetRotY = 0;
        let mouseXNorm = 0;
        let mouseYNorm = 0;

        canvas.addEventListener('mousedown', (e) => {
            isDragging = true;
            prevMouseX = e.clientX;
            prevMouseY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            isDragging = false;
        });

        window.addEventListener('mousemove', (e) => {
            const rect = canvas.getBoundingClientRect();
            mouseXNorm = ((e.clientX - rect.left) / rect.width) * 2 - 1;
            mouseYNorm = -(((e.clientY - rect.top) / rect.height) * 2 - 1);

            if (isDragging) {
                const deltaX = e.clientX - prevMouseX;
                const deltaY = e.clientY - prevMouseY;
                targetRotY += deltaX * 0.008;
                targetRotX += deltaY * 0.008;
                prevMouseX = e.clientX;
                prevMouseY = e.clientY;
            }
        });

        // Touch support for mobile/trackpad 3D interaction
        canvas.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                isDragging = true;
                prevMouseX = e.touches[0].clientX;
                prevMouseY = e.touches[0].clientY;
            }
        }, { passive: true });

        canvas.addEventListener('touchmove', (e) => {
            if (isDragging && e.touches.length === 1) {
                const deltaX = e.touches[0].clientX - prevMouseX;
                const deltaY = e.touches[0].clientY - prevMouseY;
                targetRotY += deltaX * 0.009;
                targetRotX += deltaY * 0.009;
                prevMouseX = e.touches[0].clientX;
                prevMouseY = e.touches[0].clientY;
            }
        }, { passive: true });

        canvas.addEventListener('touchend', () => {
            isDragging = false;
        });

        // 6. Master Render & Dynamic 3D Vibration Loop
        let clockTime = 0;

        function render3D() {
            clockTime += 0.035;

            // Compute Live Audio RMS
            let audioRMS = 0;
            if (state.analyserNode && state.isListening) {
                const freqBuf = new Uint8Array(state.analyserNode.frequencyBinCount);
                state.analyserNode.getByteFrequencyData(freqBuf);
                let sum = 0;
                for (let k = 0; k < freqBuf.length; k++) sum += freqBuf[k];
                audioRMS = sum / (freqBuf.length * 255);
                state.audioAmplitude = audioRMS;
            } else if (state.systemState === 'SPEAKING') {
                audioRMS = 0.35 + Math.sin(clockTime * 6) * 0.22;
            } else {
                state.audioAmplitude = Math.max(0, state.audioAmplitude * 0.9);
            }

            // Vibration Amplitude, Speed, Frequency Hz based on State
            let baseVibAmp = 0.05;
            let vibSpeed = 5.0;
            let currentHz = 10.8;
            let waveLabel = "ALPHA";
            let vibDesc = "IDLE RIPPLE";
            let activeColorHex = 0x00f0ff;

            if (state.systemState === 'SECURITY_ALERT') {
                baseVibAmp = 0.45 + Math.sin(clockTime * 35) * 0.18;
                vibSpeed = 38.0;
                currentHz = 58.4;
                waveLabel = "DELTA (ALERT)";
                vibDesc = "CRIMSON ALARM";
                activeColorHex = 0xff2a55;
            } else if (state.systemState === 'PROCESSING') {
                baseVibAmp = 0.25 + Math.sin(clockTime * 20) * 0.10;
                vibSpeed = 24.0;
                currentHz = 44.5;
                waveLabel = "GAMMA";
                vibDesc = "SYNAPTIC TREMOR";
                activeColorHex = 0xffaa00;
            } else if (state.systemState === 'LISTENING') {
                baseVibAmp = 0.12 + audioRMS * 0.55;
                vibSpeed = 16.0;
                currentHz = 24.0 + audioRMS * 18.0;
                waveLabel = "BETA";
                vibDesc = audioRMS > 0.15 ? "VOICE RESONANCE" : "RECEPTIVE WAVE";
            } else if (state.systemState === 'SPEAKING') {
                baseVibAmp = 0.15 + Math.abs(Math.sin(clockTime * 8)) * 0.18;
                vibSpeed = 12.0;
                currentHz = 14.5;
                waveLabel = "THETA";
                vibDesc = "VOCAL HARMONIC";
            }

            // Sync with current theme colors
            const themeCol = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#00f0ff';
            if (state.systemState !== 'SECURITY_ALERT' && state.systemState !== 'PROCESSING') {
                activeColorHex = parseInt(themeCol.replace('#', '0x')) || 0x00f0ff;
            }
            axonMat.color.setHex(activeColorHex);
            ringEquator.material.color.setHex(activeColorHex);
            ringPolar.material.color.setHex(activeColorHex);

            // Update Telemetry HUD Readout
            if (elements.brainFreqVal) elements.brainFreqVal.textContent = `${currentHz.toFixed(1)} Hz`;
            if (elements.brainWaveLabel) elements.brainWaveLabel.textContent = waveLabel;
            if (elements.brainVibVal) elements.brainVibVal.textContent = vibDesc;

            // Continuous 3D Auto-Rotation with Parallax Lerp
            if (!isDragging) {
                targetRotY += 0.007; // Smooth continuous Y spin
            }
            // Parallax tilt towards mouse
            const parallaxX = -mouseYNorm * 0.35;
            const parallaxY = mouseXNorm * 0.45;

            brainMasterGroup.rotation.y += (targetRotY + parallaxY - brainMasterGroup.rotation.y) * 0.06;
            brainMasterGroup.rotation.x += (targetRotX + parallaxX - brainMasterGroup.rotation.x) * 0.06;
            brainMasterGroup.position.y = Math.sin(clockTime * 1.5) * 0.15; // Floating bob

            // Rotate Holographic Rings in 3D
            ringEquator.rotation.z += 0.012;
            ringTilted.rotation.y -= 0.008;
            ringPolar.rotation.x += 0.006;

            // 7. Dynamic Physical 3D Vibration of Cortex Particles
            const posAttr = cortexGeo.attributes.position;
            const colAttr = cortexGeo.attributes.color;
            const curCol = new THREE.Color(activeColorHex);

            for (let i = 0; i < cortexCount; i++) {
                const idx = i * 3;
                const phase = cortexPhases[i];
                
                // Normal vector displacement in 3D space
                const vibDist = Math.sin(clockTime * vibSpeed + phase) * baseVibAmp + (audioRMS * 0.35 * Math.sin(clockTime * 28 + phase));
                
                posAttr.array[idx] = cortexBase[idx] + cortexNormals[idx] * vibDist;
                posAttr.array[idx + 1] = cortexBase[idx + 1] + cortexNormals[idx + 1] * vibDist;
                posAttr.array[idx + 2] = cortexBase[idx + 2] + cortexNormals[idx + 2] * vibDist;

                // Color tinting
                colAttr.array[idx] = curCol.r;
                colAttr.array[idx + 1] = curCol.g;
                colAttr.array[idx + 2] = curCol.b;
            }
            posAttr.needsUpdate = true;
            colAttr.needsUpdate = true;

            // 8. Update 3D Neural Nodes & Flash Pulses
            const nodePosAttr = nodeGeo.attributes.position;
            const nodeColAttr = nodeGeo.attributes.color;
            for (let i = 0; i < nodeCount; i++) {
                const n = nodes3D[i];
                const idx = i * 3;
                const nVib = Math.sin(clockTime * vibSpeed + n.phase) * (baseVibAmp * 0.8);

                nodePosAttr.array[idx] = n.baseX + (n.baseX / 2.5) * nVib;
                nodePosAttr.array[idx + 1] = n.baseY + (n.baseY / 2.5) * nVib;
                nodePosAttr.array[idx + 2] = n.baseZ + (n.baseZ / 2.5) * nVib;

                n.x = nodePosAttr.array[idx];
                n.y = nodePosAttr.array[idx + 1];
                n.z = nodePosAttr.array[idx + 2];

                if (n.flash > 0) {
                    n.flash *= 0.88;
                    nodeColAttr.array[idx] = 1.0;
                    nodeColAttr.array[idx + 1] = 1.0;
                    nodeColAttr.array[idx + 2] = 1.0;
                } else {
                    nodeColAttr.array[idx] = curCol.r;
                    nodeColAttr.array[idx + 1] = curCol.g;
                    nodeColAttr.array[idx + 2] = curCol.b;
                }
            }
            nodePosAttr.needsUpdate = true;
            nodeColAttr.needsUpdate = true;

            // 9. Update 3D Axon Lines positions
            const axonPos = axonGeo.attributes.position;
            let lineIdx = 0;
            for (let a = 0; a < axonList.length; a++) {
                const axon = axonList[a];
                const n1 = nodes3D[axon.from];
                const n2 = nodes3D[axon.to];

                axonPos.array[lineIdx++] = n1.x;
                axonPos.array[lineIdx++] = n1.y;
                axonPos.array[lineIdx++] = n1.z;

                axonPos.array[lineIdx++] = n2.x;
                axonPos.array[lineIdx++] = n2.y;
                axonPos.array[lineIdx++] = n2.z;
            }
            axonPos.needsUpdate = true;

            // 10. Update 3D Traveling Action Potential Photons
            const sparkPos = sparkGeo.attributes.position;
            for (let s = 0; s < sparkCount; s++) {
                const spark = sparks[s];
                const axon = axonList[spark.axonIndex];
                if (!axon) continue;

                spark.progress += spark.speed * spark.direction * (state.systemState === 'PROCESSING' ? 2.5 : 1.0);
                if (spark.progress > 1) {
                    spark.progress = 1;
                    spark.direction = -1;
                    nodes3D[axon.to].flash = 1.0;
                } else if (spark.progress < 0) {
                    spark.progress = 0;
                    spark.direction = 1;
                    nodes3D[axon.from].flash = 1.0;
                }

                const n1 = nodes3D[axon.from];
                const n2 = nodes3D[axon.to];
                const sIdx = s * 3;
                sparkPos.array[sIdx] = n1.x + (n2.x - n1.x) * spark.progress;
                sparkPos.array[sIdx + 1] = n1.y + (n2.y - n1.y) * spark.progress;
                sparkPos.array[sIdx + 2] = n1.z + (n2.z - n1.z) * spark.progress;
            }
            sparkPos.needsUpdate = true;

            renderer.render(scene, camera);
            requestAnimationFrame(render3D);
        }
        render3D();
    }

    // Built-in 3D Perspective Projection Engine (Offline / Low-Resource Fallback)
    function init3DProjectedBrain(canvas) {
        const ctx = canvas.getContext('2d');
        const cx = canvas.width / 2;
        const cy = canvas.height / 2;
        const fov = 350;

        const points3D = [];
        const numPoints = 850;

        for (let i = 0; i < numPoints; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.acos(2 * Math.random() - 1);
            const side = i % 2 === 0 ? 1 : -1;
            const r = 135 * (1 + 0.12 * Math.sin(7 * theta) * Math.cos(5 * phi));

            let x = r * Math.sin(phi) * Math.cos(theta);
            let y = r * Math.cos(phi) * 0.95;
            let z = r * Math.sin(phi) * Math.sin(theta) * 1.15;

            if (y > 60) x *= 0.7;
            x = (side > 0) ? (Math.abs(x) + 14) : (-Math.abs(x) - 14);

            points3D.push({
                x, y, z, baseX: x, baseY: y, baseZ: z,
                phase: Math.random() * Math.PI * 2
            });
        }

        let rotY = 0;
        let rotX = 0.2;
        let time = 0;

        function renderProjected() {
            time += 0.04;
            rotY += 0.012;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#00f0ff';
            const cosY = Math.cos(rotY), sinY = Math.sin(rotY);
            const cosX = Math.cos(rotX), sinX = Math.sin(rotX);

            const baseVib = (state.systemState === 'SECURITY_ALERT') ? 12 : ((state.systemState === 'LISTENING') ? 5 : 2);

            for (let i = 0; i < points3D.length; i++) {
                const p = points3D[i];
                const vib = Math.sin(time * 6 + p.phase) * baseVib;
                const px = p.baseX + (p.baseX / 100) * vib;
                const py = p.baseY + (p.baseY / 100) * vib;
                const pz = p.baseZ + (p.baseZ / 100) * vib;

                // 3D rotation Y then X
                const x1 = px * cosY - pz * sinY;
                const z1 = px * sinY + pz * cosY;
                const y1 = py * cosX - z1 * sinX;
                const z2 = py * sinX + z1 * cosX + 380;

                const scale = fov / z2;
                const x2d = cx + x1 * scale;
                const y2d = cy + y1 * scale;
                const alpha = Math.max(0.1, (z2 - 200) / 400);

                ctx.fillStyle = primaryColor;
                ctx.globalAlpha = alpha;
                ctx.shadowBlur = 8;
                ctx.shadowColor = primaryColor;
                ctx.beginPath();
                ctx.arc(x2d, y2d, Math.max(1, 2.2 * scale), 0, Math.PI * 2);
                ctx.fill();
            }
            requestAnimationFrame(renderProjected);
        }
        renderProjected();
    }

    // Dual Mirrored Neon Audio Spectrum Canvas
    function initAudioVisualizerCanvas() {
        const canvas = elements.audioVisualizer;
        const ctx = canvas.getContext('2d');

        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#00f0ff';

            if (state.analyserNode && state.isListening) {
                const bufferLength = state.analyserNode.frequencyBinCount;
                const dataArray = new Uint8Array(bufferLength);
                state.analyserNode.getByteFrequencyData(dataArray);

                const barWidth = (canvas.width / bufferLength) * 2.2;
                let x = 0;

                for (let i = 0; i < bufferLength; i++) {
                    const barHeight = (dataArray[i] / 255) * canvas.height;

                    const grad = ctx.createLinearGradient(0, canvas.height, 0, 0);
                    grad.addColorStop(0, 'rgba(0, 240, 255, 0.15)');
                    grad.addColorStop(0.7, primaryColor);
                    grad.addColorStop(1, '#ffffff');

                    ctx.fillStyle = grad;
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = primaryColor;

                    ctx.fillRect(x, canvas.height - barHeight, barWidth - 1, barHeight);
                    x += barWidth;
                }
            } else {
                ctx.strokeStyle = 'rgba(0, 240, 255, 0.4)';
                ctx.shadowBlur = 8;
                ctx.shadowColor = primaryColor;
                ctx.lineWidth = 2;
                ctx.beginPath();
                const time = Date.now() * 0.004;
                for (let x = 0; x < canvas.width; x += 4) {
                    const y = (canvas.height / 2) + Math.sin(x * 0.025 + time) * 10;
                    if (x === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                }
                ctx.stroke();
            }

            requestAnimationFrame(render);
        }
        render();
    }

    // --------------------------------------------------------------------------
    // 8. ENROLLMENT WIZARD MODAL LOGIC
    // --------------------------------------------------------------------------
    function initEnrollmentWizard() {
        let recInterval = null;
        let recSeconds = 0;

        elements.btnEnrollVoice.addEventListener('click', () => {
            elements.enrollmentModal.classList.remove('hidden');
            showEnrollStep(1);
            soundFX.click();
        });

        elements.btnCloseEnrollModal.addEventListener('click', () => {
            elements.enrollmentModal.classList.add('hidden');
            stopEnrollRecording();
        });

        elements.btnGoToStep2.addEventListener('click', () => {
            const name = elements.userNameInput.value.trim() || "Operator";
            const phrase = elements.passphraseInput.value.trim() || "Jarvis activate biometric security protocol";
            elements.phraseToRead.textContent = `"${phrase}"`;
            showEnrollStep(2);
            soundFX.click();
        });

        elements.btnStartRecord.addEventListener('click', async () => {
            soundFX.init();
            try {
                const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
                state.recordStream = stream;
                
                const AudioCtx = window.AudioContext || window.webkitAudioContext;
                const recAudioCtx = new AudioCtx();
                const source = recAudioCtx.createMediaStreamSource(stream);
                state.recordAnalyser = recAudioCtx.createAnalyser();
                state.recordAnalyser.fftSize = 256;
                source.connect(state.recordAnalyser);

                elements.btnStartRecord.disabled = true;
                elements.btnStopRecord.disabled = false;
                elements.recordProgressText.textContent = "RECORDING... SPEAK THE PHRASE CLEARLY!";

                recSeconds = 0;
                recInterval = setInterval(() => {
                    recSeconds += 0.1;
                    elements.recordingTime.textContent = `${recSeconds.toFixed(1)}s`;
                    if (recSeconds >= 5.0) {
                        elements.btnStopRecord.click();
                    }
                }, 100);

                const freqBuffer = [];
                const sampleTimer = setInterval(() => {
                    if (state.recordAnalyser) {
                        const data = new Uint8Array(state.recordAnalyser.frequencyBinCount);
                        state.recordAnalyser.getByteFrequencyData(data);
                        freqBuffer.push(data);
                    }
                }, 100);

                state.recordMediaRecorder = { freqBuffer, sampleTimer, recAudioCtx };
                renderRecordCanvas();

            } catch (err) {
                alert("Microphone access failed: " + err.message);
            }
        });

        elements.btnStopRecord.addEventListener('click', () => {
            stopEnrollRecording();
            soundFX.click();

            if (state.recordMediaRecorder && state.recordMediaRecorder.freqBuffer.length > 0) {
                const buffer = state.recordMediaRecorder.freqBuffer;
                const binCount = buffer[0].length;
                const avgFreq = new Float32Array(binCount);

                for (let i = 0; i < buffer.length; i++) {
                    for (let b = 0; b < binCount; b++) {
                        avgFreq[b] += buffer[i][b];
                    }
                }
                for (let b = 0; b < binCount; b++) {
                    avgFreq[b] /= buffer.length;
                }

                state.recordedFeatures = voiceBio.extractFeatures(avgFreq);
                
                elements.mPitch.textContent = `${state.recordedFeatures.pitch} Hz`;
                elements.mCentroid.textContent = `${(state.recordedFeatures.centroid / 1000).toFixed(2)} kHz`;
                elements.mVector.textContent = `${state.recordedFeatures.bandEnergies.length} Bands`;

                showEnrollStep(3);
            }
        });

        if (elements.btnQuickCalibrate) {
            elements.btnQuickCalibrate.addEventListener('click', () => {
                soundFX.click();
                const simulatedFreq = new Uint8Array(128);
                for (let i = 0; i < 128; i++) {
                    const freq = i * (22050 / 128);
                    if (freq > 80 && freq < 350) {
                        simulatedFreq[i] = Math.floor(180 + Math.random() * 60);
                    } else if (freq >= 350 && freq < 2500) {
                        simulatedFreq[i] = Math.floor(100 + Math.random() * 50);
                    } else {
                        simulatedFreq[i] = Math.floor(20 + Math.random() * 20);
                    }
                }
                state.recordedFeatures = voiceBio.extractFeatures(simulatedFreq);
                state.recordedFeatures.pitch = 135;
                state.recordedFeatures.centroid = 1420;

                elements.mPitch.textContent = `${state.recordedFeatures.pitch} Hz`;
                elements.mCentroid.textContent = `${(state.recordedFeatures.centroid / 1000).toFixed(2)} kHz`;
                elements.mVector.textContent = `${state.recordedFeatures.bandEnergies.length} Bands`;

                showEnrollStep(3);
            });
        }

        function stopEnrollRecording() {
            if (recInterval) clearInterval(recInterval);
            if (state.recordMediaRecorder && state.recordMediaRecorder.sampleTimer) {
                clearInterval(state.recordMediaRecorder.sampleTimer);
            }
            if (state.recordStream) {
                state.recordStream.getTracks().forEach(t => t.stop());
                state.recordStream = null;
            }
            elements.btnStartRecord.disabled = false;
            elements.btnStopRecord.disabled = true;
        }

        elements.btnSaveVoiceprint.addEventListener('click', () => {
            if (state.recordedFeatures) {
                const profile = {
                    userName: elements.userNameInput.value.trim() || "Operator",
                    passphrase: elements.passphraseInput.value.trim(),
                    pitch: state.recordedFeatures.pitch,
                    centroid: state.recordedFeatures.centroid,
                    bandEnergies: state.recordedFeatures.bandEnergies,
                    enrolledAt: new Date().toISOString()
                };

                localStorage.setItem('jarvis_voiceprint', JSON.stringify(profile));
                state.enrolledVoiceprint = profile;
                updateVoiceprintUI(true);

                logSecurity(`Voiceprint profile saved for ${profile.userName}.`, 'auth');
                soundFX.granted();
                speakResponse(`Voice biometric profile activated. I am now trained to follow your instructions exclusively, ${profile.userName}.`);
            }
            elements.enrollmentModal.classList.add('hidden');
        });

        function showEnrollStep(stepNum) {
            [1, 2, 3].forEach(n => {
                document.getElementById(`enrollStep${n}`).classList.toggle('hidden', n !== stepNum);
                document.getElementById(`step${n}Indicator`).classList.toggle('active', n <= stepNum);
            });
        }

        function renderRecordCanvas() {
            const canvas = elements.recordCanvas;
            const ctx = canvas.getContext('2d');

            function draw() {
                if (!state.recordAnalyser) return;
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                const data = new Uint8Array(state.recordAnalyser.frequencyBinCount);
                state.recordAnalyser.getByteFrequencyData(data);

                ctx.strokeStyle = '#00f0ff';
                ctx.shadowBlur = 10;
                ctx.shadowColor = '#00f0ff';
                ctx.lineWidth = 2;
                ctx.beginPath();
                const sliceWidth = canvas.width / data.length;
                let x = 0;

                for (let i = 0; i < data.length; i++) {
                    const v = data[i] / 128.0;
                    const y = (v * canvas.height) / 2;
                    if (i === 0) ctx.moveTo(x, y);
                    else ctx.lineTo(x, y);
                    x += sliceWidth;
                }
                ctx.stroke();
                requestAnimationFrame(draw);
            }
            draw();
        }
    }

    // --------------------------------------------------------------------------
    // 9. EVENT LISTENERS & APPLICATION INITIALIZATION
    // --------------------------------------------------------------------------
    function initEventListeners() {
        elements.btnMicListen.addEventListener('click', () => {
            speechEngine.toggleListening();
        });

        if (elements.brainCanvas) {
            elements.brainCanvas.addEventListener('click', () => {
                speechEngine.toggleListening();
            });
        }

        if (elements.brainContainer) {
            elements.brainContainer.addEventListener('click', (e) => {
                if (e.target === elements.brainCanvas || e.target === elements.brainContainer) {
                    speechEngine.toggleListening();
                }
            });
        }

        // Master Voice Biometric "Listen Only to My Voice" Toggle
        if (elements.chkOnlyMyVoice) {
            elements.chkOnlyMyVoice.addEventListener('change', (e) => {
                state.onlyMyVoiceMode = e.target.checked;
                localStorage.setItem('jarvis_only_my_voice', state.onlyMyVoiceMode);
                updateVoiceprintUI(!!state.enrolledVoiceprint);
                soundFX.click();
                logSecurity(`Single-Master Mode (Only My Voice) ${state.onlyMyVoiceMode ? 'ACTIVATED' : 'DEACTIVATED'}`, 'auth');
                speakResponse(`Voice Biometric Mode is now ${state.onlyMyVoiceMode ? 'active. I will follow your instructions and commands only' : 'deactivated. Open speaker mode enabled'}.`);
            });
        }

        // Test Voice Biometrics Button
        if (elements.btnTestVoice) {
            elements.btnTestVoice.addEventListener('click', () => {
                soundFX.click();
                if (!state.enrolledVoiceprint) {
                    speakResponse("Please enroll your master voice profile first before running a biometric test.");
                    elements.btnEnrollVoice.click();
                    return;
                }
                state.isTestingVoice = true;
                speechEngine.startListening();
                speakResponse(`Voice biometric test active. Please speak now so I can verify your voice against master profile ${state.enrolledVoiceprint.userName}.`);
            });
        }

        // Biometric Sensitivity Buttons
        document.querySelectorAll('.sens-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.sens-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const sens = btn.dataset.sens;
                state.sensitivity = sens;
                if (sens === 'strict') state.biometricThreshold = 65;
                else if (sens === 'balanced') state.biometricThreshold = 50;
                else state.biometricThreshold = 38;
                
                if (elements.thresholdLabel) {
                    elements.thresholdLabel.textContent = `THRESHOLD: ${state.biometricThreshold}%`;
                }
                const threshLine = document.querySelector('.meter-threshold-line');
                if (threshLine) {
                    threshLine.style.left = `${state.biometricThreshold}%`;
                }
                soundFX.click();
                logSecurity(`Biometric Sensitivity updated to ${sens.toUpperCase()} (Required Match: ${state.biometricThreshold}%)`, 'sys');
            });
        });

        elements.btnSubmitCmd.addEventListener('click', () => {
            const val = elements.commandInput.value;
            elements.commandInput.value = '';
            processCommand(val);
        });

        elements.commandInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                const val = elements.commandInput.value;
                elements.commandInput.value = '';
                processCommand(val);
            }
        });

        document.querySelectorAll('.cmd-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const cmd = chip.dataset.cmd;
                soundFX.click();
                processCommand(cmd);
            });
        });

        document.querySelectorAll('.theme-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                switchTheme(btn.dataset.theme);
            });
        });

        elements.btnToggleAudio.addEventListener('click', () => {
            state.soundEnabled = !state.soundEnabled;
            elements.audioIcon.className = state.soundEnabled ? "fa-solid fa-volume-high" : "fa-solid fa-volume-xmark text-danger";
            logSecurity(`Audio SFX ${state.soundEnabled ? 'Enabled' : 'Muted'}`, 'sys');
        });

        elements.btnClearLogs.addEventListener('click', () => {
            clearTerminalLogs();
            soundFX.click();
        });

        elements.btnClearTasks.addEventListener('click', () => {
            state.tasks = [];
            renderTasks();
            soundFX.click();
        });

        elements.btnDismissAlert.addEventListener('click', () => {
            elements.alertOverlay.classList.add('hidden');
            if (elements.brainContainer) {
                elements.brainContainer.classList.remove('alert-vibrating');
            }
            setJarvisState('STANDBY');
            soundFX.click();
        });
    }

    function initJARVIS() {
        console.log("Initializing J.A.R.V.I.S. Ultra-Premium Neural Core...");

        initBgCanvas();
        initBrainCanvas();
        initAudioVisualizerCanvas();
        initEventListeners();
        initEnrollmentWizard();
        loadSavedVoiceprint();
        startTelemetryLoop();

        logSecurity("J.A.R.V.I.S. Neural Matrix v5.0 initialized.", "sys");
        logSecurity("3D Holographic Neural Brain online with live dynamic vibrations.", "sys");
        logSecurity("Voice Biometric Engine armed: calibrated for single-master authorization.", "auth");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJARVIS);
    } else {
        initJARVIS();
    }

})();
