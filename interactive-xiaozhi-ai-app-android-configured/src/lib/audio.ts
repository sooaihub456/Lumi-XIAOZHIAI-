import type { OpusDecoder } from 'opus-decoder';

export class XiaozhiAudio {
  private context: AudioContext | null = null;
  private decoder: OpusDecoder<48000> | null = null;
  private ready: Promise<void> | null = null;
  private nextTime = 0;
  private generation = 0;
  private enabled = true;
  private sources = new Set<AudioBufferSourceNode>();
  private queue = Promise.resolve();

  async unlock() {
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') await this.context.resume();
  }

  setEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.stop();
  }

  private init() {
    this.ready ??= import('opus-decoder').then(async ({ OpusDecoder: Decoder }) => {
      this.decoder = new Decoder({ sampleRate: 48000, channels: 1 });
      await this.decoder.ready;
    });
    return this.ready;
  }

  enqueue(frame: ArrayBuffer, onError: () => void) {
    if (!this.enabled || !this.context) return;
    const generation = this.generation;
    // A single queue preserves packet order while the Opus WASM module initializes.
    this.queue = this.queue.then(async () => {
      await this.init();
      if (generation !== this.generation || !this.enabled || !this.context || !this.decoder) return;
      const decoded = this.decoder.decodeFrame(new Uint8Array(frame));
      if (!decoded.samplesDecoded) return;
      const buffer = this.context.createBuffer(decoded.channelData.length, decoded.samplesDecoded, decoded.sampleRate);
      decoded.channelData.forEach((channel, index) => buffer.getChannelData(index).set(channel));
      const source = this.context.createBufferSource();
      source.buffer = buffer;
      source.connect(this.context.destination);
      this.nextTime = Math.max(this.nextTime, this.context.currentTime + 0.04);
      source.start(this.nextTime);
      this.nextTime += buffer.duration;
      this.sources.add(source);
      source.onended = () => { this.sources.delete(source); source.disconnect(); };
    }).catch(onError);
  }

  stop() {
    this.generation += 1;
    this.sources.forEach((source) => { try { source.stop(); } catch { /* Already ended. */ } });
    this.sources.clear();
    this.nextTime = 0;
  }

  dispose() {
    this.stop();
    void this.queue.finally(() => { this.decoder?.free(); this.decoder = null; });
    void this.context?.close();
    this.context = null;
  }
}