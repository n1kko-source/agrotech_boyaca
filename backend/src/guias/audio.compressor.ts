import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ServiceUnavailableException } from '@nestjs/common';
import {
  AUDIO_OPUS_BITRATE,
  AUDIO_OPUS_EXT,
  AUDIO_OPUS_MIME,
  AUDIO_OPUS_SAMPLE_RATE,
} from './guias.constants';

export const AUDIO_COMPRESSOR = Symbol('AUDIO_COMPRESSOR');

export type CompressedAudio = {
  buffer: Buffer;
  mimeType: string;
  extension: string;
};

export interface AudioCompressor {
  compress(input: Buffer): Promise<CompressedAudio>;
}

/** Tests / environments without ffmpeg. Does not change bytes. */
export class PassthroughAudioCompressor implements AudioCompressor {
  compress(input: Buffer): Promise<CompressedAudio> {
    return Promise.resolve({
      buffer: input,
      mimeType: AUDIO_OPUS_MIME,
      extension: AUDIO_OPUS_EXT,
    });
  }
}

export class FfmpegAudioCompressor implements AudioCompressor {
  async compress(input: Buffer): Promise<CompressedAudio> {
    const dir = await mkdtemp(join(tmpdir(), 'agrotech-audio-'));
    const src = join(dir, 'in');
    const dest = join(dir, `out.${AUDIO_OPUS_EXT}`);
    try {
      await writeFile(src, input);
      await runFfmpeg([
        '-y',
        '-i',
        src,
        '-vn',
        '-ac',
        '1',
        '-ar',
        String(AUDIO_OPUS_SAMPLE_RATE),
        '-c:a',
        'libopus',
        '-b:a',
        AUDIO_OPUS_BITRATE,
        '-f',
        'ogg',
        dest,
      ]);
      const buffer = await readFile(dest);
      if (buffer.length === 0) {
        throw new ServiceUnavailableException('Audio compression failed');
      }
      return {
        buffer,
        mimeType: AUDIO_OPUS_MIME,
        extension: AUDIO_OPUS_EXT,
      };
    } catch (err) {
      if (err instanceof ServiceUnavailableException) {
        throw err;
      }
      throw new ServiceUnavailableException('Audio compression unavailable');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}

export function ffmpegAvailable(): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn('ffmpeg', ['-version'], { windowsHide: true });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      resolve(false);
    }, 2000);
    const done = (ok: boolean) => {
      clearTimeout(timer);
      resolve(ok);
    };
    child.on('error', () => done(false));
    child.on('close', (code) => done(code === 0));
  });
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('ffmpeg', args, {
      windowsHide: true,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error('ffmpeg timeout'));
    }, 60_000);
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`ffmpeg exit ${code ?? 'null'}`));
    });
  });
}
