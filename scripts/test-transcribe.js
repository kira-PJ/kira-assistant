const { TranscribeStreamingClient, StartStreamTranscriptionCommand } = require('@aws-sdk/client-transcribe-streaming');

async function test() {
  const client = new TranscribeStreamingClient({ region: 'us-east-1' });

  // Generate 1 second of 440Hz sine wave as test audio
  const sampleRate = 16000;
  const samples = sampleRate * 1;
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i++) {
    const val = Math.sin(2 * Math.PI * 440 * i / sampleRate) * 10000;
    buf.writeInt16LE(Math.round(val), i * 2);
  }

  async function* audioStream() {
    yield { AudioEvent: { AudioChunk: buf } };
    yield { AudioEvent: { AudioChunk: Buffer.alloc(0) } };
  }

  try {
    const cmd = new StartStreamTranscriptionCommand({
      LanguageCode: 'en-US',
      MediaEncoding: 'pcm',
      MediaSampleRateHertz: 16000,
      AudioStream: audioStream(),
    });
    const resp = await client.send(cmd);
    console.log('SUCCESS: Transcribe Streaming connected!');

    for await (const event of resp.TranscriptResultStream) {
      if (event.TranscriptEvent) {
        const results = event.TranscriptEvent.Transcript?.Results ?? [];
        for (const r of results) {
          if (!r.IsPartial) {
            const text = r.Alternatives?.[0]?.Transcript;
            console.log('Final:', text || '(silence)');
          }
        }
      }
    }
    console.log('Stream completed OK - Transcribe is working!');
  } catch (err) {
    console.error('FAILED:', err.message);
    if (err.message.includes('credentials')) {
      console.error('→ Check your AWS credentials: aws configure');
    }
    if (err.message.includes('AccessDeniedException')) {
      console.error('→ Your IAM user needs transcribe:StartStreamTranscription permission');
    }
  }
  client.destroy();
}

test();
