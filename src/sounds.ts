// Simple 8-bit Sound Synthesizer using Web Audio API

const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();

type OscillatorType = 'square' | 'sawtooth' | 'sine' | 'triangle';

function playTone(freq: number, type: OscillatorType, duration: number, delay: number = 0) {
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }

    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime + delay);

    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime + delay);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + delay + duration);

    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.start(audioCtx.currentTime + delay);
    osc.stop(audioCtx.currentTime + delay + duration);
}

export const sounds = {
    click: () => {
        playTone(600, 'square', 0.05);
        playTone(300, 'square', 0.05, 0.05);
    },
    success: () => {
        playTone(440, 'square', 0.1);
        playTone(554, 'square', 0.1, 0.1); // C#
        playTone(659, 'square', 0.2, 0.2); // E
    },
    error: () => {
        playTone(150, 'sawtooth', 0.2);
        playTone(100, 'sawtooth', 0.2, 0.1);
    },
    listen: () => {
        playTone(880, 'sine', 0.1);
        playTone(1760, 'sine', 0.2, 0.1);
    },
    processing: () => {
        playTone(220, 'triangle', 0.05);
        playTone(240, 'triangle', 0.05, 0.05);
    }
};
