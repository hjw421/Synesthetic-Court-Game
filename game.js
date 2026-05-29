/**
 * Synesthetic Court: Echo & Canvas
 * Core Game Engine and Generative Art Visualizer
 */

// --- Global Constants & Configurations ---
const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 720;
const PENTATONIC_SCALE = [
    261.63, // C4
    293.66, // D4
    329.63, // E4
    392.00, // G4
    440.00, // A4
    523.25, // C5
    587.33, // D5
    659.25, // E5
    783.99, // G5
    880.00  // A5
];

// --- Audio Manager (Web Audio API Synthesizer) ---
class SoundGenerator {
    constructor() {
        this.ctx = null;
        this.isMuted = false;
        
        // Audio Nodes
        this.masterVolume = null;
        this.ambientVolume = null;
        this.reverbNode = null;
        this.synthPadOsc1 = null;
        this.synthPadOsc2 = null;
        this.synthPadFilter = null;
    }

    init() {
        if (this.ctx) return;
        
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        this.ctx = new AudioContextClass();
        
        // Master volume and dynamics compressor to prevent clipping
        const compressor = this.ctx.createDynamicsCompressor();
        compressor.threshold.setValueAtTime(-24, this.ctx.currentTime);
        compressor.knee.setValueAtTime(30, this.ctx.currentTime);
        compressor.ratio.setValueAtTime(12, this.ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
        compressor.release.setValueAtTime(0.25, this.ctx.currentTime);
        
        this.masterVolume = this.ctx.createGain();
        this.masterVolume.gain.setValueAtTime(this.isMuted ? 0 : 0.8, this.ctx.currentTime);
        
        compressor.connect(this.masterVolume);
        this.masterVolume.connect(this.ctx.destination);
        
        // Create Reverb / Delay effect chain
        this.delayNode = this.ctx.createDelay();
        this.delayNode.delayTime.setValueAtTime(0.35, this.ctx.currentTime);
        
        this.delayFeedback = this.ctx.createGain();
        this.delayFeedback.gain.setValueAtTime(0.4, this.ctx.currentTime);
        
        this.delayNode.connect(this.delayFeedback);
        this.delayFeedback.connect(this.delayNode);
        
        this.delayVolume = this.ctx.createGain();
        this.delayVolume.gain.setValueAtTime(0.3, this.ctx.currentTime);
        this.delayNode.connect(this.delayVolume);
        
        this.delayVolume.connect(compressor);
        
        // Create Ambient Pad
        this.initAmbientPad(compressor);
    }

    initAmbientPad(destination) {
        this.ambientVolume = this.ctx.createGain();
        this.ambientVolume.gain.setValueAtTime(0.0, this.ctx.currentTime); // Start silent, build with rally
        
        this.synthPadFilter = this.ctx.createBiquadFilter();
        this.synthPadFilter.type = 'lowpass';
        this.synthPadFilter.frequency.setValueAtTime(150, this.ctx.currentTime);
        this.synthPadFilter.Q.setValueAtTime(2, this.ctx.currentTime);
        
        // Osc 1: Low C drone (sawtooth)
        this.synthPadOsc1 = this.ctx.createOscillator();
        this.synthPadOsc1.type = 'sawtooth';
        this.synthPadOsc1.frequency.setValueAtTime(65.41, this.ctx.currentTime); // C2
        
        // Osc 2: G2 fifth drone (detuned triangle)
        this.synthPadOsc2 = this.ctx.createOscillator();
        this.synthPadOsc2.type = 'triangle';
        this.synthPadOsc2.frequency.setValueAtTime(98.00, this.ctx.currentTime); // G2
        this.synthPadOsc2.detune.setValueAtTime(8, this.ctx.currentTime); // Detuned for warmth
        
        // LFO to modulate filter frequency
        const lfo = this.ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.2, this.ctx.currentTime); // Very slow LFO
        
        const lfoGain = this.ctx.createGain();
        lfoGain.gain.setValueAtTime(40, this.ctx.currentTime);
        
        lfo.connect(lfoGain);
        lfoGain.connect(this.synthPadFilter.frequency);
        
        this.synthPadOsc1.connect(this.synthPadFilter);
        this.synthPadOsc2.connect(this.synthPadFilter);
        this.synthPadFilter.connect(this.ambientVolume);
        this.ambientVolume.connect(destination);
        
        // Start oscillators
        this.synthPadOsc1.start();
        this.synthPadOsc2.start();
        lfo.start();
    }

    toggleMute() {
        this.isMuted = !this.isMuted;
        if (this.masterVolume) {
            const targetGain = this.isMuted ? 0 : 0.8;
            this.masterVolume.gain.setTargetAtTime(targetGain, this.ctx.currentTime, 0.1);
        }
        return this.isMuted;
    }

    updateAmbientIntensity(rallyCount) {
        if (!this.ctx || this.isMuted) return;
        
        // Increase ambient volume and filter cutoff as rally progresses
        const intensity = Math.min(rallyCount / 25, 1.0); // Max intensity at 25 rally
        const targetVolume = 0.08 + intensity * 0.18; // Base volume to peak volume
        const targetFilterFreq = 180 + intensity * 600; // Open up the filter filter as energy builds
        
        this.ambientVolume.gain.setTargetAtTime(targetVolume, this.ctx.currentTime, 1.5);
        this.synthPadFilter.frequency.setTargetAtTime(targetFilterFreq, this.ctx.currentTime, 1.5);
    }

    stopAmbient() {
        if (!this.ctx) return;
        this.ambientVolume.gain.setTargetAtTime(0, this.ctx.currentTime, 0.5);
    }

    playHitSound(heightPercent) {
        if (!this.ctx || this.isMuted) return;
        
        // Map Y coordinate height to scale index (higher hit = higher note)
        const scaleIndex = Math.floor((1 - heightPercent) * PENTATONIC_SCALE.length);
        const freq = PENTATONIC_SCALE[Math.max(0, Math.min(scaleIndex, PENTATONIC_SCALE.length - 1))];
        
        const osc = this.ctx.createOscillator();
        const gainNode = this.ctx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(this.ctx.destination); // Direct bypass compressor for immediate snap
        gainNode.connect(this.delayNode); // Also send to delay line
        
        // Bright FM/pluck style note
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
        
        // Exponential decay envelope
        gainNode.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 0.65);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 0.7);
    }

    playSuccessSound() {
        if (!this.ctx || this.isMuted) return;
        
        // Short beautiful upward chime
        const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
        notes.forEach((freq, idx) => {
            const time = this.ctx.currentTime + idx * 0.07;
            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();
            
            osc.connect(gain);
            gain.connect(this.ctx.destination);
            
            osc.type = 'sine';
            osc.frequency.setValueAtTime(freq, time);
            
            gain.gain.setValueAtTime(0.15, time);
            gain.gain.exponentialRampToValueAtTime(0.0001, time + 0.3);
            
            osc.start(time);
            osc.stop(time + 0.35);
        });
    }

    playGameOverSound() {
        if (!this.ctx || this.isMuted) return;
        
        // Elegant melancholy descending slide
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        
        osc.connect(gain);
        gain.connect(this.ctx.destination);
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(329.63, this.ctx.currentTime); // E4
        osc.frequency.exponentialRampToValueAtTime(110.00, this.ctx.currentTime + 0.9); // Down to A2
        
        gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + 1.0);
        
        osc.start();
        osc.stop(this.ctx.currentTime + 1.05);
    }
}

const sounds = new SoundGenerator();

// --- Particle Object Pooling (Memory Optimization) ---
class Particle {
    constructor() {
        this.x = 0;
        this.y = 0;
        this.vx = 0;
        this.vy = 0;
        this.size = 0;
        this.color = '';
        this.alpha = 1;
        this.decay = 0.01;
        this.gravity = 0;
        this.friction = 0.98;
        this.isAlive = false;
        this.isSplash = false; // Persistent paint splash tag
    }

    init(x, y, vx, vy, size, color, decay, gravity = 0, isSplash = false) {
        this.x = x;
        this.y = y;
        this.vx = vx;
        this.vy = vy;
        this.size = size;
        this.color = color;
        this.alpha = 1;
        this.decay = decay;
        this.gravity = gravity;
        this.friction = isSplash ? 0.94 : 0.98; // Splash decelerates faster
        this.isAlive = true;
        this.isSplash = isSplash;
    }

    update() {
        if (!this.isAlive) return;
        
        this.vx *= this.friction;
        this.vy *= this.friction;
        this.vy += this.gravity;
        this.x += this.vx;
        this.y += this.vy;
        
        this.alpha -= this.decay;
        if (this.alpha <= 0) {
            this.isAlive = false;
        }
    }
}

class ParticlePool {
    constructor(maxSize = 800) {
        this.pool = [];
        for (let i = 0; i < maxSize; i++) {
            this.pool.push(new Particle());
        }
    }

    spawn(x, y, vx, vy, size, color, decay, gravity = 0, isSplash = false) {
        const particle = this.pool.find(p => !p.isAlive);
        if (particle) {
            particle.init(x, y, vx, vy, size, color, decay, gravity, isSplash);
            return particle;
        }
        return null;
    }

    update() {
        for (let i = 0; i < this.pool.length; i++) {
            if (this.pool[i].isAlive) {
                this.pool[i].update();
            }
        }
    }
}

// --- Main Game & Art Engine ---
class SynestheticGame {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        this.ctx = this.canvas.getContext('2d');
        
        // Permanent background painting canvas buffer
        this.artCanvas = document.createElement('canvas');
        this.artCanvas.width = LOGICAL_WIDTH;
        this.artCanvas.height = LOGICAL_HEIGHT;
        this.artCtx = this.artCanvas.getContext('2d');
        
        // Particle System
        this.particles = new ParticlePool();
        
        // Scale Factor for dynamic canvas resizing
        this.scale = 1;
        
        // Match States
        this.rallyCount = 0;
        this.bestRally = parseInt(localStorage.getItem('best_resonance')) || 0;
        this.gameState = 'start'; // 'start', 'playing', 'gameover'
        
        // Physics Objects
        this.ball = {
            x: LOGICAL_WIDTH / 2,
            y: LOGICAL_HEIGHT / 2,
            vx: 0,
            vy: 0,
            radius: 12,
            baseSpeed: 7,
            currentSpeed: 7,
            trail: []
        };
        
        this.countdownValue = 0;
        this.countdownStart = null;
        this.paused = false;
        this.selectedDifficulty = 'beginner';
        
        this.paddleWidth = 15;
        this.paddleHeight = 120;
        
        this.player = {
            x: LOGICAL_WIDTH - 60,
            y: LOGICAL_HEIGHT / 2 - 60,
            targetY: LOGICAL_HEIGHT / 2 - 60,
            vy: 0,
            color: '#00f2fe'
        };
        
        this.ai = {
            x: 60,
            y: LOGICAL_HEIGHT / 2 - 60,
            targetY: LOGICAL_HEIGHT / 2 - 60,
            vy: 0,
            color: '#ff007f',
            maxSpeed: 8,
            errorMargin: 40,
            kP: 0.05, // Proportional constant for tracking
            kD: 0.1   // Derivative constant for tracking
        };
        
        // Interactive environmental grid
        this.gridOffset = 0;
        this.screenShake = 0;
        
        // Bind UI Elements
        this.bindEvents();
        this.resize();
        
        // Initial Draw
        this.clearArtCanvas();
        this.draw();
        
        // Kick off dynamic animation loop
        requestAnimationFrame((t) => this.loop(t));
    }

    bindEvents() {
        window.addEventListener('resize', () => this.resize());
        
        // Button - Start
        document.getElementById('btn-start').addEventListener('click', () => {
            sounds.init();
            this.startGame();
        });
        
        // Button - Retry
        document.getElementById('btn-retry').addEventListener('click', () => {
            sounds.init();
            this.startGame();
        });
        
        // Button - Sound Toggle
        const soundBtn = document.getElementById('btn-sound-toggle');
        const soundStatus = document.getElementById('sound-status-text');
        soundBtn.addEventListener('click', () => {
            sounds.init();
            const isMuted = sounds.toggleMute();
            soundStatus.textContent = isMuted ? 'SOUND OFF' : 'SOUND ON';
            soundBtn.classList.toggle('muted', isMuted);
        });
        
        // Button - Fullscreen Toggle
        document.getElementById('btn-fullscreen').addEventListener('click', () => {
            this.toggleFullscreen();
        });
        
        // Button - Clear Canvas
        document.getElementById('btn-clear-canvas').addEventListener('click', () => {
            this.clearArtCanvas();
        });
        
        // Button - Export PNG
        document.getElementById('btn-save-artwork').addEventListener('click', () => {
            this.exportArtwork();
        });
        
        // Pointer Coordinates Tracker
        const tracker = (e) => {
            if (this.gameState !== 'playing') return;
            
            const rect = this.canvas.getBoundingClientRect();
            let clientY;
            if (e.touches && e.touches.length > 0) {
                clientY = e.touches[0].clientY;
            } else {
                clientY = e.clientY;
            }
            
            // Map pointer screen pixel position relative to the logical height space
            const relativeY = (clientY - rect.top) / rect.height;
            this.player.targetY = relativeY * LOGICAL_HEIGHT - this.paddleHeight / 2;
        };
        
        window.addEventListener('mousemove', tracker);
        window.addEventListener('touchmove', tracker, { passive: true });
        
        // Button - Pause Toggle
        const pauseBtn = document.getElementById('btn-pause-toggle');
        const pauseStatus = document.getElementById('pause-status-text');
        pauseBtn.addEventListener('click', () => {
            if (this.gameState !== 'playing' && this.gameState !== 'countdown') return;
            this.paused = !this.paused;
            pauseStatus.textContent = this.paused ? 'RESUME RALLY' : 'PAUSE RALLY';
            pauseBtn.classList.toggle('muted', this.paused);
        });

        // Button - Stop Rally
        document.getElementById('btn-stop-rally').addEventListener('click', () => {
            this.gameState = 'start';
            this.paused = false;
            this.rallyCount = 0;
            this.updateHUD();
            
            pauseStatus.textContent = 'PAUSE RALLY';
            pauseBtn.classList.remove('muted');
            
            document.getElementById('screen-gameover').classList.remove('active');
            document.getElementById('screen-start').classList.add('active');
            
            this.ball.x = LOGICAL_WIDTH / 2;
            this.ball.y = LOGICAL_HEIGHT / 2;
            this.ball.vx = 0;
            this.ball.vy = 0;
            this.ball.trail = [];
            
            sounds.stopAmbient();
            this.triggerHUDMessage('RALLY STOPPED', 'magenta');
        });

        // Difficulty Selection Buttons
        const diffBtns = document.querySelectorAll('.diff-btn');
        const speedMap = {
            beginner: 5,
            advanced: 7,
            hard: 10
        };

        diffBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const diff = e.target.getAttribute('data-diff');
                this.selectedDifficulty = diff;
                
                diffBtns.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                
                const targetSpeed = speedMap[diff];
                this.ball.baseSpeed = targetSpeed;
                
                if (this.gameState !== 'playing') {
                    this.ball.currentSpeed = targetSpeed;
                }
                
                sounds.playHitSound(0.5);
                this.triggerHUDMessage(`DIFFICULTY: ${diff.toUpperCase()}`, 'cyan');
            });
        });
    }

    resize() {
        const parent = this.canvas.parentElement;
        const width = parent.clientWidth;
        // Keep 16:9 ratio in responsive screens
        const height = width * (9 / 16);
        
        this.canvas.width = width;
        this.canvas.height = height;
        
        // Compute ratio mapping from screen canvas pixels to internal 1280x720 coordinates
        this.scale = width / LOGICAL_WIDTH;
    }

    clearArtCanvas() {
        this.artCtx.fillStyle = '#060608';
        this.artCtx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
        
        // Draw elegant minimalist court grid onto the background canvas buffer
        this.artCtx.strokeStyle = 'rgba(255, 255, 255, 0.015)';
        this.artCtx.lineWidth = 1;
        const gridGap = 40;
        for (let x = 0; x < LOGICAL_WIDTH; x += gridGap) {
            this.artCtx.beginPath();
            this.artCtx.moveTo(x, 0);
            this.artCtx.lineTo(x, LOGICAL_HEIGHT);
            this.artCtx.stroke();
        }
        for (let y = 0; y < LOGICAL_HEIGHT; y += gridGap) {
            this.artCtx.beginPath();
            this.artCtx.moveTo(0, y);
            this.artCtx.lineTo(LOGICAL_WIDTH, y);
            this.artCtx.stroke();
        }
        
        // Draw court center net line
        this.artCtx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        this.artCtx.lineWidth = 2;
        this.artCtx.setLineDash([8, 12]);
        this.artCtx.beginPath();
        this.artCtx.moveTo(LOGICAL_WIDTH / 2, 0);
        this.artCtx.lineTo(LOGICAL_WIDTH / 2, LOGICAL_HEIGHT);
        this.artCtx.stroke();
        this.artCtx.setLineDash([]); // Reset
    }

    startGame() {
        document.getElementById('screen-start').classList.remove('active');
        document.getElementById('screen-gameover').classList.remove('active');
        
        // Reset player positions
        this.player.y = LOGICAL_HEIGHT / 2 - this.paddleHeight / 2;
        this.player.targetY = this.player.y;
        this.player.vy = 0;
        this.ai.y = LOGICAL_HEIGHT / 2 - this.paddleHeight / 2;
        
        // Start automatic countdown
        this.startRallyCountdown();
    }

    startRallyCountdown() {
        this.gameState = 'countdown';
        this.countdownValue = 3;
        this.countdownStart = Date.now();
        
        // Save score if it's the best record
        if (this.rallyCount > this.bestRally) {
            this.bestRally = this.rallyCount;
            localStorage.setItem('best_resonance', this.bestRally);
            sounds.playSuccessSound();
            this.triggerHUDMessage('NEW RECORD HARMONY!', 'gold');
        } else if (this.rallyCount > 0) {
            sounds.playGameOverSound();
            this.triggerHUDMessage('CONNECTION LOST', 'magenta');
        }
        
        // Reset current score
        this.rallyCount = 0;
        this.updateHUD();
        
        // Reset ball position to center
        this.ball.x = LOGICAL_WIDTH / 2;
        this.ball.y = LOGICAL_HEIGHT / 2;
        this.ball.vx = 0;
        this.ball.vy = 0;
        this.ball.trail = [];
        
        sounds.stopAmbient();
    }

    gameOver() {
        this.gameState = 'gameover';
        sounds.stopAmbient();
        sounds.playGameOverSound();
        
        if (this.rallyCount > this.bestRally) {
            this.bestRally = this.rallyCount;
            localStorage.setItem('best_resonance', this.bestRally);
            sounds.playSuccessSound();
            this.triggerHUDMessage('NEW RECORD HARMONY!', 'gold');
        }
        
        this.updateHUD();
        
        document.getElementById('final-rally-info').textContent = `연속 공명 랠리: ${this.rallyCount}`;
        document.getElementById('screen-gameover').classList.add('active');
    }

    updateHUD() {
        document.getElementById('score-val').textContent = this.rallyCount;
        document.getElementById('best-score-val').textContent = this.bestRally;
        
        // Compute energy bar width based on multiplier progress
        const resonancePercent = Math.min((this.rallyCount / 20) * 100, 100);
        document.getElementById('energy-bar').style.width = `${resonancePercent}%`;
    }

    triggerHUDMessage(text, colorType) {
        // Find or create notification label container
        let banner = document.getElementById('game-banner');
        if (!banner) {
            banner = document.createElement('div');
            banner.id = 'game-banner';
            this.canvas.parentElement.appendChild(banner);
        }
        
        banner.textContent = text;
        banner.className = `banner-active color-${colorType}`;
        
        setTimeout(() => {
            banner.className = '';
        }, 1500);
    }

    toggleFullscreen() {
        const container = this.canvas.parentElement;
        if (!document.fullscreenElement) {
            container.requestFullscreen().catch(err => {
                console.error(`Fullscreen Error: ${err.message}`);
            });
        } else {
            document.exitFullscreen();
        }
    }

    updatePhysics() {
        if (this.paused) return;
        
        if (this.gameState === 'countdown') {
            // Smoothly interpolate player paddle towards target input coordinates so they can warm up
            const prevPlayerY = this.player.y;
            this.player.y += (this.player.targetY - this.player.y) * 0.22;
            this.player.y = Math.max(0, Math.min(LOGICAL_HEIGHT - this.paddleHeight, this.player.y));
            this.player.vy = this.player.y - prevPlayerY;

            // AI paddle moves smoothly back to the center
            const aiCenterY = LOGICAL_HEIGHT / 2 - this.paddleHeight / 2;
            this.ai.y += (aiCenterY - this.ai.y) * 0.1;
            
            // Decay screen shake
            this.screenShake *= 0.88;

            const elapsed = Date.now() - this.countdownStart;
            if (elapsed < 1000) {
                if (this.countdownValue !== 3) {
                    this.countdownValue = 3;
                    sounds.playHitSound(0.5);
                    this.triggerHUDMessage('READY...', 'cyan');
                }
            } else if (elapsed < 2000) {
                if (this.countdownValue === 3) {
                    this.countdownValue = 2;
                    sounds.playHitSound(0.4);
                    this.triggerHUDMessage('2...', 'gold');
                }
            } else if (elapsed < 3000) {
                if (this.countdownValue === 2) {
                    this.countdownValue = 1;
                    sounds.playHitSound(0.3);
                    this.triggerHUDMessage('1...', 'magenta');
                }
            } else {
                // Launch the ball!
                this.countdownValue = 0;
                this.countdownStart = null;
                this.gameState = 'playing';
                
                // Spawn ball targeting human
                this.ball.x = LOGICAL_WIDTH / 2;
                this.ball.y = LOGICAL_HEIGHT / 2;
                this.ball.currentSpeed = this.ball.baseSpeed;
                const angle = (Math.random() * 0.4 - 0.2);
                this.ball.vx = Math.cos(angle) * this.ball.currentSpeed;
                this.ball.vy = Math.sin(angle) * this.ball.currentSpeed;
                this.ball.trail = [];
                
                sounds.updateAmbientIntensity(0);
                this.triggerHUDMessage('GO!', 'cyan');
            }
            return;
        }

        if (this.gameState !== 'playing') return;
        
        // Smoothly interpolate player paddle towards target input coordinates
        const prevPlayerY = this.player.y;
        this.player.y += (this.player.targetY - this.player.y) * 0.22;
        this.player.y = Math.max(0, Math.min(LOGICAL_HEIGHT - this.paddleHeight, this.player.y));
        this.player.vy = this.player.y - prevPlayerY; // Record speed for spin
        
        // AI tracking logic: Smooth tracking with scaling error dampening based on rally count
        const centerOfPaddle = this.ai.y + this.paddleHeight / 2;
        const targetDifference = this.ball.y - centerOfPaddle;
        
        // Adaptive AI skill: As rally count increases, AI tracking gets sharper and faster
        const skillFactor = Math.min(this.rallyCount / 30, 1.0); // Reach 100% capacity at 30 rally
        const aiTrackingSpeed = 3.5 + skillFactor * 5.5; // Starts at 3.5 speed, escalates to 9.0 speed
        
        // Smooth damping movement
        if (Math.abs(targetDifference) > 10) {
            this.ai.y += Math.sign(targetDifference) * Math.min(Math.abs(targetDifference) * 0.12, aiTrackingSpeed);
        }
        this.ai.y = Math.max(0, Math.min(LOGICAL_HEIGHT - this.paddleHeight, this.ai.y));
        
        // Record trail points of the ball
        this.ball.trail.push({ x: this.ball.x, y: this.ball.y });
        if (this.ball.trail.length > 25) {
            this.ball.trail.shift();
        }
        
        // Translate Ball physics position coordinates
        this.ball.x += this.ball.vx;
        this.ball.y += this.ball.vy;
        
        // Boundary collision: TOP & BOTTOM
        if (this.ball.y - this.ball.radius <= 0) {
            this.ball.y = this.ball.radius;
            this.ball.vy = -this.ball.vy;
            this.bounceImpact(this.ball.x, this.ball.y, 'wall');
        } else if (this.ball.y + this.ball.radius >= LOGICAL_HEIGHT) {
            this.ball.y = LOGICAL_HEIGHT - this.ball.radius;
            this.ball.vy = -this.ball.vy;
            this.bounceImpact(this.ball.x, this.ball.y, 'wall');
        }
        
        // Paddle collision check: PLAYER PADDLE (Right side)
        if (this.ball.vx > 0 && 
            this.ball.x + this.ball.radius >= this.player.x && 
            this.ball.x - this.ball.radius <= this.player.x + this.paddleWidth) {
            
            // Check overlaps along Y axis
            if (this.ball.y >= this.player.y && this.ball.y <= this.player.y + this.paddleHeight) {
                // Precise bounce collision point
                this.ball.x = this.player.x - this.ball.radius;
                
                // Reflection logic based on where ball hits paddle (adds variety)
                const relativeHit = (this.ball.y - (this.player.y + this.paddleHeight / 2)) / (this.paddleHeight / 2);
                
                // Increase speed per bounce (adds intensity)
                this.rallyCount++;
                this.ball.currentSpeed = this.ball.baseSpeed + Math.min(this.rallyCount * 0.2, 6);
                
                const angle = relativeHit * 0.75; // Angle limit ~43deg
                this.ball.vx = -Math.cos(angle) * this.ball.currentSpeed;
                
                // Friction Spin physics: impart paddle velocity to ball Y velocity
                this.ball.vy = Math.sin(angle) * this.ball.currentSpeed + this.player.vy * 0.18;
                
                this.bounceImpact(this.ball.x, this.ball.y, 'player');
                sounds.playHitSound(this.ball.y / LOGICAL_HEIGHT);
                sounds.updateAmbientIntensity(this.rallyCount);
                this.updateHUD();
                
                if (this.rallyCount >= 10) {
                    this.screenShake = Math.min(this.rallyCount * 2.5, 45);
                } else if (this.rallyCount >= 5) {
                    this.screenShake = Math.min(this.rallyCount * 1.6, 25);
                } else {
                    this.screenShake = Math.min(this.rallyCount * 0.8, 12);
                }
            }
        }
        
        // Paddle collision check: AI PADDLE (Left side)
        if (this.ball.vx < 0 && 
            this.ball.x - this.ball.radius <= this.ai.x + this.paddleWidth && 
            this.ball.x + this.ball.radius >= this.ai.x) {
            
            // Check overlaps along Y axis
            if (this.ball.y >= this.ai.y && this.ball.y <= this.ai.y + this.paddleHeight) {
                this.ball.x = this.ai.x + this.paddleWidth + this.ball.radius;
                
                const relativeHit = (this.ball.y - (this.ai.y + this.paddleHeight / 2)) / (this.paddleHeight / 2);
                
                this.rallyCount++;
                this.ball.currentSpeed = this.ball.baseSpeed + Math.min(this.rallyCount * 0.2, 6);
                
                const angle = relativeHit * 0.75;
                this.ball.vx = Math.cos(angle) * this.ball.currentSpeed;
                this.ball.vy = Math.sin(angle) * this.ball.currentSpeed;
                
                this.bounceImpact(this.ball.x, this.ball.y, 'ai');
                sounds.playHitSound(this.ball.y / LOGICAL_HEIGHT);
                sounds.updateAmbientIntensity(this.rallyCount);
                this.updateHUD();
                
                if (this.rallyCount >= 10) {
                    this.screenShake = Math.min(this.rallyCount * 2.5, 45);
                } else if (this.rallyCount >= 5) {
                    this.screenShake = Math.min(this.rallyCount * 1.6, 25);
                } else {
                    this.screenShake = Math.min(this.rallyCount * 0.8, 12);
                }
            }
        }
        
        // Miss state boundary check
        if (this.ball.x > LOGICAL_WIDTH) {
            // Player missed
            this.startRallyCountdown();
        } else if (this.ball.x < 0) {
            // AI missed (rare, but happens when rally count is high and player uses strong spin)
            this.triggerHUDMessage('AI TRANSCENDED!', 'magenta');
            this.ball.vx = -this.ball.vx;
            this.rallyCount += 2;
            this.updateHUD();
        }
    }

    bounceImpact(x, y, targetType) {
        let pColor;
        let count = 25;
        
        if (targetType === 'player') {
            pColor = 'rgba(0, 242, 254, '; // Cyan splash
        } else if (targetType === 'ai') {
            pColor = 'rgba(255, 0, 127, '; // Magenta splash
        } else {
            pColor = 'rgba(255, 179, 0, '; // Gold splash (wall)
            count = 15;
        }
        
        // Spawn active floating screen particles
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 8;
            const size = 2 + Math.random() * 6;
            const decay = 0.015 + Math.random() * 0.02;
            
            this.particles.spawn(
                x, y, 
                Math.cos(angle) * speed, 
                Math.sin(angle) * speed, 
                size, 
                pColor + '1)', 
                decay
            );
        }
        
        // Draw permanent generative artistic splash onto background canvas buffer (Action Painting)
        this.artCtx.save();
        this.artCtx.shadowBlur = 15;
        this.artCtx.shadowColor = pColor + '0.6)';
        
        // Generative splashing: circular cluster painting splatters
        const splashCount = 6 + Math.floor(Math.random() * 8);
        for (let i = 0; i < splashCount; i++) {
            const splashDist = Math.random() * 40;
            const splashAngle = Math.random() * Math.PI * 2;
            const splashX = x + Math.cos(splashAngle) * splashDist;
            const splashY = y + Math.sin(splashAngle) * splashDist;
            const splashRadius = (0.5 + Math.random() * 5.5) * Math.max(1, this.rallyCount * 0.1);
            
            this.artCtx.fillStyle = pColor + `${0.12 + Math.random() * 0.25})`;
            this.artCtx.beginPath();
            this.artCtx.arc(splashX, splashY, splashRadius, 0, Math.PI * 2);
            this.artCtx.fill();
        }
        
        // Also draw delicate connect lines between splashes
        if (Math.random() > 0.4) {
            this.artCtx.strokeStyle = pColor + '0.07)';
            this.artCtx.lineWidth = 0.5 + Math.random() * 1.5;
            this.artCtx.beginPath();
            this.artCtx.moveTo(x, y);
            this.artCtx.lineTo(x + (Math.random() * 120 - 60), y + (Math.random() * 120 - 60));
            this.artCtx.stroke();
        }
        
        this.artCtx.restore();
    }

    draw() {
        this.ctx.save();
        
        // Handle screen shake mapping
        if (this.screenShake > 0.1) {
            const shakeX = (Math.random() * 2 - 1) * this.screenShake;
            const shakeY = (Math.random() * 2 - 1) * this.screenShake;
            this.ctx.translate(shakeX, shakeY);
            this.screenShake *= 0.88; // Damping
        }
        
        // Apply global scale factor matching current viewport dimension
        this.ctx.scale(this.scale, this.scale);
        
        // Draw the background offscreen generative art buffer onto display canvas
        this.ctx.drawImage(this.artCanvas, 0, 0);
        
        // Update and draw active particle pool objects
        this.particles.update();
        this.ctx.save();
        for (let i = 0; i < this.particles.pool.length; i++) {
            const p = this.particles.pool[i];
            if (p.isAlive) {
                this.ctx.fillStyle = p.color;
                this.ctx.globalAlpha = p.alpha;
                this.ctx.beginPath();
                this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
        this.ctx.restore();
        
        // Draw Ball Trail (flowing gradient)
        if (this.ball.trail.length > 1) {
            this.ctx.save();
            for (let i = 0; i < this.ball.trail.length - 1; i++) {
                const pt1 = this.ball.trail[i];
                const pt2 = this.ball.trail[i + 1];
                const alpha = i / this.ball.trail.length;
                
                this.ctx.strokeStyle = `rgba(0, 242, 254, ${alpha * 0.45})`;
                this.ctx.lineWidth = (i / this.ball.trail.length) * this.ball.radius * 1.5;
                this.ctx.lineCap = 'round';
                
                this.ctx.beginPath();
                this.ctx.moveTo(pt1.x, pt1.y);
                this.ctx.lineTo(pt2.x, pt2.y);
                this.ctx.stroke();
            }
            this.ctx.restore();
        }
        
        // Draw Ball Node
        if (this.gameState === 'playing') {
            this.ctx.save();
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = '#00f2fe';
            this.ctx.fillStyle = '#ffffff';
            this.ctx.beginPath();
            this.ctx.arc(this.ball.x, this.ball.y, this.ball.radius, 0, Math.PI * 2);
            this.ctx.fill();
            this.ctx.restore();
        }
        
        // Draw Countdown overlay text on canvas
        if (this.gameState === 'countdown' && this.countdownValue > 0) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
            this.ctx.font = '100px Outfit, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.shadowBlur = 25;
            this.ctx.shadowColor = '#00f2fe';
            this.ctx.fillText(this.countdownValue, LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
            this.ctx.restore();
        }
        
        // Draw Paddles with glowing neon borders
        this.ctx.save();
        this.ctx.shadowBlur = 15;
        
        // Human player (cyan)
        this.ctx.shadowColor = this.player.color;
        this.ctx.fillStyle = '#ffffff';
        this.ctx.beginPath();
        this.ctx.roundRect(this.player.x, this.player.y, this.paddleWidth, this.paddleHeight, 8);
        this.ctx.fill();
        this.ctx.strokeStyle = this.player.color;
        this.ctx.lineWidth = 1.5;
        this.ctx.stroke();
        
        // AI Opponent (magenta)
        this.ctx.shadowColor = this.ai.color;
        this.ctx.beginPath();
        this.ctx.roundRect(this.ai.x, this.ai.y, this.paddleWidth, this.paddleHeight, 8);
        this.ctx.fill();
        this.ctx.strokeStyle = this.ai.color;
        this.ctx.stroke();
        
        // Draw Paused overlay on canvas
        if (this.paused) {
            this.ctx.save();
            this.ctx.fillStyle = 'rgba(6, 6, 8, 0.5)';
            this.ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
            
            this.ctx.fillStyle = '#ffffff';
            this.ctx.font = '80px Outfit, sans-serif';
            this.ctx.textAlign = 'center';
            this.ctx.textBaseline = 'middle';
            this.ctx.shadowBlur = 20;
            this.ctx.shadowColor = 'rgba(255, 255, 255, 0.5)';
            this.ctx.fillText('PAUSED', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2);
            
            this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
            this.ctx.font = '24px Inter, sans-serif';
            this.ctx.fillText('CLICK "RESUME RALLY" TO CONTINUE', LOGICAL_WIDTH / 2, LOGICAL_HEIGHT / 2 + 70);
            
            this.ctx.restore();
        }
        
        this.ctx.restore();
        
        this.ctx.restore();
    }

    loop(timestamp) {
        this.updatePhysics();
        this.draw();
        
        // Maintain continuous rendering cycle
        requestAnimationFrame((t) => this.loop(t));
    }

    exportArtwork() {
        // Merge background painting art buffer with a final branding text overlay to save as image file
        const exportCanvas = document.createElement('canvas');
        exportCanvas.width = LOGICAL_WIDTH;
        exportCanvas.height = LOGICAL_HEIGHT;
        const eCtx = exportCanvas.getContext('2d');
        
        // Draw primary generative painting buffer
        eCtx.drawImage(this.artCanvas, 0, 0);
        
        // Draw branding typography overlay onto the exported art image
        eCtx.save();
        eCtx.fillStyle = 'rgba(255, 255, 255, 0.4)';
        eCtx.font = '20px Outfit, sans-serif';
        eCtx.letterSpacing = '5px';
        eCtx.fillText('SYNESTHETIC COURT: ECHO & CANVAS', 40, LOGICAL_HEIGHT - 60);
        
        eCtx.fillStyle = 'rgba(255, 255, 255, 0.15)';
        eCtx.font = '14px Inter, sans-serif';
        eCtx.letterSpacing = '1px';
        eCtx.fillText(`CO-CREATION HARMONY RECORD: ${this.rallyCount} RALLIES`, 40, LOGICAL_HEIGHT - 35);
        
        eCtx.restore();
        
        // Trigger file download
        const url = exportCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `synesthetic-court-artwork-${Date.now()}.png`;
        link.href = url;
        link.click();
    }
}

// Ensure game instances boot up safely after full window loading
window.addEventListener('load', () => {
    window.gameInstance = new SynestheticGame();
});
