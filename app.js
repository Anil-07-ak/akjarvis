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
        strictMode: true,
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
        recordedFeatures: null
    };

    // DOM Elements
    const elements = {
        bgCanvas: document.getElementById('bgCanvas'),
        arcCanvas: document.getElementById('arcCanvas'),
        audioVisualizer: document.getElementById('audioVisualizer'),
        recordCanvas: document.getElementById('recordCanvas'),
        
        hudClock: document.getElementById('hudClock'),
        sysStatusText: document.getElementById('sysStatusText'),
        secLevelText: document.getElementById('secLevelText'),
        authUserText: document.getElementById('authUserText'),
        
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
        strictModeStatus: document.getElementById('strictModeStatus'),
        
        jarvisStateTag: document.getElementById('jarvisStateTag'),
        jarvisSubtitles: document.getElementById('jarvisSubtitles'),
        transcriptionText: document.getElementById('transcriptionText'),
        micStatusText: document.getElementById('micStatusText'),
        btnMicListen: document.getElementById('btnMicListen'),
        
        btnEnrollVoice: document.getElementById('btnEnrollVoice'),
        btnToggleSecurity: document.getElementById('btnToggleSecurity'),
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
            if (!enrolledProfile || !liveFeatures) {
                return { verified: true, matchPercent: 100, reason: "NO_ENROLLED_PROFILE" };
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
            const pitchSim = Math.max(0, 1 - (pitchDiff / 200));

            const centroidDiff = Math.abs(liveFeatures.centroid - enrolledProfile.centroid);
            const centroidSim = Math.max(0, 1 - (centroidDiff / 2500));

            let finalScore = (vecSim * 0.50) + (pitchSim * 0.30) + (centroidSim * 0.20);
            finalScore = Math.min(0.99, finalScore + 0.15);
            const matchPercent = Math.round(finalScore * 100);

            const threshold = state.strictMode ? 65 : 45;
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
            if (saved) {
                state.enrolledVoiceprint = JSON.parse(saved);
                updateVoiceprintUI(true);
                logSecurity(`Voice Profile Loaded: ${state.enrolledVoiceprint.userName}`, 'auth');
            } else {
                updateVoiceprintUI(false);
            }
        } catch (e) {
            console.warn('Could not load voiceprint:', e);
        }
    }

    function updateVoiceprintUI(isEnrolled) {
        if (isEnrolled && state.enrolledVoiceprint) {
            elements.authUserText.innerHTML = `<i class="fa-solid fa-user-check text-green"></i> ${state.enrolledVoiceprint.userName.toUpperCase()}`;
            elements.bioPrimaryStatus.textContent = `OPERATOR: ${state.enrolledVoiceprint.userName.toUpperCase()}`;
            elements.bioPrimaryStatus.className = "bio-title text-green";
            elements.bioMatchPercent.textContent = `Voice lock active (${state.enrolledVoiceprint.pitch}Hz pitch signature).`;
            elements.bioStatusCard.className = "bio-status-card authorized";
            elements.bioLockIcon.className = "fa-solid fa-user-check text-green";
            elements.secLevelText.innerHTML = `<i class="fa-solid fa-shield-halved text-green"></i> BIOMETRIC LOCKED`;
        } else {
            elements.authUserText.innerHTML = `<i class="fa-solid fa-fingerprint text-gold"></i> UNENROLLED`;
            elements.bioPrimaryStatus.textContent = `SPEAKER UNVERIFIED`;
            elements.bioPrimaryStatus.className = "bio-title text-gold";
            elements.bioMatchPercent.textContent = `Click 'ENROLL VOICE' to lock JARVIS to your voice profile.`;
            elements.bioStatusCard.className = "bio-status-card";
            elements.bioLockIcon.className = "fa-solid fa-user-lock text-gold";
            elements.secLevelText.innerHTML = `<i class="fa-solid fa-shield-halved text-gold"></i> VOICE LOCK OPEN`;
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
                elements.micStatusText.textContent = 'LISTENING... SPEAK NOW';
                setJarvisState('LISTENING');
                soundFX.beep();
            };

            this.recognition.onend = () => {
                state.isListening = false;
                elements.btnMicListen.classList.remove('listening');
                elements.micStatusText.textContent = 'CLICK MIC OR SAY "HEY JARVIS"';
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

            const result = voiceBio.verifySpeaker(liveFeatures, state.enrolledVoiceprint);

            if (state.enrolledVoiceprint && state.strictMode) {
                if (!result.verified) {
                    logSecurity(`UNAUTHORIZED SPEAKER DETECTED! Match: ${result.matchPercent}%. Command rejected.`, 'warn');
                    soundFX.denied();
                    triggerSecurityAlert(`UNAUTHORIZED SPEAKER DETECTED`, `BIOMETRIC MISMATCH (${result.matchPercent}% Match). Voice spectrum does not match enrolled operator '${state.enrolledVoiceprint.userName}'. Command aborted.`);
                    speakResponse(`Access denied. Speaker voice profile does not match authorized operator.`);
                    return;
                } else {
                    logSecurity(`BIOMETRIC VERIFIED: ${result.matchPercent}% Match for operator ${state.enrolledVoiceprint.userName}.`, 'auth');
                    soundFX.granted();
                }
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
            speakResponse("I am J.A.R.V.I.S. Just A Rather Very Intelligent System, engineered to assist you and follow your voice commands exclusively.");
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

    // High-Detail 3D Holographic Arc Reactor Core Canvas
    function initArcReactorCanvas() {
        const canvas = elements.arcCanvas;
        const ctx = canvas.getContext('2d');
        let rAngle1 = 0;
        let rAngle2 = 0;
        let rAngle3 = 0;

        // Particle vortex swirling around Arc core
        const coreParticles = Array.from({ length: 60 }, () => ({
            angle: Math.random() * Math.PI * 2,
            distance: Math.random() * 110 + 30,
            speed: (Math.random() * 0.02 + 0.008) * (Math.random() > 0.5 ? 1 : -1),
            size: Math.random() * 2 + 1
        }));

        function render() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            const cx = canvas.width / 2;
            const cy = canvas.height / 2;

            const primaryColor = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#00f0ff';
            const secondaryColor = getComputedStyle(document.body).getPropertyValue('--secondary').trim() || '#ffaa00';

            rAngle1 += 0.012;
            rAngle2 -= 0.018;
            rAngle3 += 0.008;

            // 1. Outer Tech Ring with Tick Marks
            ctx.save();
            ctx.translate(cx, cy);
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 2;
            ctx.shadowBlur = 15;
            ctx.shadowColor = primaryColor;

            ctx.beginPath();
            ctx.arc(0, 0, 160, 0, Math.PI * 2);
            ctx.stroke();

            // Ticks at 15-degree intervals
            for (let a = 0; a < 360; a += 15) {
                const rad = (a * Math.PI) / 180;
                const innerR = (a % 45 === 0) ? 146 : 153;
                const x1 = Math.cos(rad) * innerR;
                const y1 = Math.sin(rad) * innerR;
                const x2 = Math.cos(rad) * 160;
                const y2 = Math.sin(rad) * 160;

                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            ctx.restore();

            // 2. Rotating Segmented Inner Tech Ring 1
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rAngle1);
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 8;
            ctx.shadowBlur = 20;
            ctx.shadowColor = primaryColor;

            for (let i = 0; i < 6; i++) {
                ctx.beginPath();
                ctx.arc(0, 0, 125, (i * Math.PI / 3), (i * Math.PI / 3) + 0.6);
                ctx.stroke();
            }
            ctx.restore();

            // 3. Counter-Rotating Segmented Tech Ring 2 (Gold/Cyan accent)
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rAngle2);
            ctx.strokeStyle = secondaryColor;
            ctx.lineWidth = 4;
            ctx.shadowBlur = 12;
            ctx.shadowColor = secondaryColor;

            for (let i = 0; i < 12; i++) {
                ctx.beginPath();
                ctx.arc(0, 0, 95, (i * Math.PI / 6), (i * Math.PI / 6) + 0.3);
                ctx.stroke();
            }
            ctx.restore();

            // 4. Rotating Energy Blades
            ctx.save();
            ctx.translate(cx, cy);
            ctx.rotate(rAngle3);
            ctx.strokeStyle = primaryColor;
            ctx.lineWidth = 3;

            for (let i = 0; i < 10; i++) {
                const rad = (i * Math.PI) / 5;
                ctx.beginPath();
                ctx.moveTo(Math.cos(rad) * 45, Math.sin(rad) * 45);
                ctx.lineTo(Math.cos(rad) * 80, Math.sin(rad) * 80);
                ctx.stroke();
            }
            ctx.restore();

            // 5. Particle Swarm around Core
            coreParticles.forEach(p => {
                p.angle += p.speed;
                const px = cx + Math.cos(p.angle) * p.distance;
                const py = cy + Math.sin(p.angle) * p.distance;

                ctx.fillStyle = primaryColor;
                ctx.shadowBlur = 10;
                ctx.shadowColor = primaryColor;
                ctx.beginPath();
                ctx.arc(px, py, p.size, 0, Math.PI * 2);
                ctx.fill();
            });

            // 6. Central Glowing Arc Reactor Core Pulse
            const audioPulse = (state.isListening && state.analyserNode) ? 14 : 0;
            const coreRadius = 48 + Math.sin(Date.now() * 0.006) * 6 + audioPulse;

            const coreGrad = ctx.createRadialGradient(cx, cy, 4, cx, cy, coreRadius);
            coreGrad.addColorStop(0, '#ffffff');
            coreGrad.addColorStop(0.3, primaryColor);
            coreGrad.addColorStop(0.85, 'rgba(0, 240, 255, 0.4)');
            coreGrad.addColorStop(1, 'transparent');

            ctx.fillStyle = coreGrad;
            ctx.shadowBlur = 35;
            ctx.shadowColor = primaryColor;
            ctx.beginPath();
            ctx.arc(cx, cy, coreRadius, 0, Math.PI * 2);
            ctx.fill();

            requestAnimationFrame(render);
        }
        render();
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

        elements.arcCanvas.addEventListener('click', () => {
            speechEngine.toggleListening();
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

        elements.btnToggleSecurity.addEventListener('click', () => {
            state.strictMode = !state.strictMode;
            elements.strictModeStatus.textContent = state.strictMode ? "ENABLED" : "DISABLED";
            elements.strictModeStatus.className = state.strictMode ? "badge badge-active" : "badge badge-inactive";
            logSecurity(`Strict Speaker Biometrics ${state.strictMode ? 'ACTIVATED' : 'DEACTIVATED'}`, 'sys');
            soundFX.click();
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
            setJarvisState('STANDBY');
            soundFX.click();
        });
    }

    function initJARVIS() {
        console.log("Initializing J.A.R.V.I.S. Ultra-Premium Core Engine...");

        initBgCanvas();
        initArcReactorCanvas();
        initAudioVisualizerCanvas();
        initEventListeners();
        initEnrollmentWizard();
        loadSavedVoiceprint();
        startTelemetryLoop();

        logSecurity("J.A.R.V.I.S. Kernel v4.2 initialized.", "sys");
        logSecurity("3D Arc Reactor canvas and particle swarm online.", "sys");
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initJARVIS);
    } else {
        initJARVIS();
    }

})();
