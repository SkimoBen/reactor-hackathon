// AudioWorklet that turns the microphone into the format Gemini Live
// transcription expects: 16-bit little-endian PCM, 16 kHz, mono, in ~100 ms
// chunks. The AudioContext runs at the device's native rate (Firefox refuses
// to connect a mic to a context at a different rate), so this processor
// downsamples itself by averaging each window of input samples.
//
// Posts { pcm: ArrayBuffer, level: number } per chunk; level is the chunk's
// RMS (0..1) for a mic meter.
class PcmRecorder extends AudioWorkletProcessor {
  constructor(options) {
    super();
    const targetRate = options.processorOptions?.targetRate ?? 16000;
    this.ratio = sampleRate / targetRate;
    // Kept separately because posting a chunk transfers its buffer, which
    // detaches it: afterwards `this.chunk.length` reads 0.
    this.size = Math.round(targetRate / 10);
    this.chunk = new Int16Array(this.size);
    this.length = 0;
    this.sum = 0;
    this.count = 0;
    this.phase = 0;
    this.energy = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channels = input.length;
    const frames = input[0].length;
    for (let i = 0; i < frames; i++) {
      let sample = 0;
      for (let c = 0; c < channels; c++) sample += input[c][i];
      this.sum += sample / channels;
      this.count++;
      this.phase += 1;
      if (this.phase < this.ratio) continue;
      this.phase -= this.ratio;

      const value = Math.max(-1, Math.min(1, this.sum / this.count));
      this.sum = 0;
      this.count = 0;
      this.energy += value * value;
      this.chunk[this.length++] = value < 0 ? value * 0x8000 : value * 0x7fff;
      if (this.length === this.size) {
        const level = Math.sqrt(this.energy / this.length);
        this.port.postMessage({ pcm: this.chunk.buffer, level }, [
          this.chunk.buffer,
        ]);
        this.chunk = new Int16Array(this.size);
        this.length = 0;
        this.energy = 0;
      }
    }
    return true;
  }
}

registerProcessor("pcm-recorder", PcmRecorder);
