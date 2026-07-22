// Web Audio Synthesizer for Ambient Study Sounds (100% Offline & Pure Web API)
class SoundSynthesizer {
  private ctx: AudioContext | null = null;
  private currentGain: GainNode | null = null;
  private noiseNode: AudioNode | null = null;
  private currentType: string | null = null;

  private initCtx() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playAmbient(type: 'rain' | 'waves' | 'brown' | 'pink') {
    this.stop();
    this.initCtx();
    if (!this.ctx) return;

    this.currentType = type;
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);

    let lastOut = 0.0;
    for (let i = 0; i < bufferSize; i++) {
      const white = Math.random() * 2 - 1;
      if (type === 'brown' || type === 'rain') {
        // Brown noise filter (soft rain sound)
        data[i] = (lastOut + 0.02 * white) / 1.02;
        lastOut = data[i];
        data[i] *= 3.5;
      } else if (type === 'pink' || type === 'waves') {
        // Pink noise approximation (ocean wave rhythm)
        data[i] = white * 0.5;
      } else {
        data[i] = white * 0.2;
      }
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;
    noise.loop = true;

    const gain = this.ctx.createGain();
    gain.gain.value = 0.15;

    // Filter for pleasant smooth sound
    const filter = this.ctx.createBiquadFilter();
    filter.type = type === 'rain' ? 'lowpass' : 'bandpass';
    filter.frequency.value = type === 'rain' ? 800 : 500;

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);

    noise.start();
    this.noiseNode = noise;
    this.currentGain = gain;
  }

  playTimerCompletionBell() {
    this.initCtx();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(523.25, this.ctx.currentTime); // C5 note
    osc.frequency.exponentialRampToValueAtTime(1046.50, this.ctx.currentTime + 0.8); // C6

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 1.2);
  }

  stop() {
    if (this.noiseNode) {
      try {
        (this.noiseNode as AudioBufferSourceNode).stop();
      } catch {
        // Ignore if already stopped
      }
      this.noiseNode = null;
    }
    this.currentType = null;
  }

  isPlaying(type: string) {
    return this.currentType === type;
  }
}

export const soundService = new SoundSynthesizer();
