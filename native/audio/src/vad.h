#pragma once

#include <cstdint>
#include <cstddef>

/**
 * Simple energy-based Voice Activity Detection (VAD)
 * 
 * Uses short-term energy + zero-crossing rate to determine
 * if a frame contains speech. Lightweight enough for real-time.
 */
class VAD {
public:
  VAD();
  void Init(int sample_rate, int channels);
  
  /**
   * Process a frame of audio
   * @param data PCM int16 samples
   * @param frames Number of samples
   * @return true if voice activity detected
   */
  bool Process(const int16_t* data, size_t frames);
  
  /** Current speech state */
  bool IsSpeaking() const { return m_speaking; }
  
  /** Set energy threshold (default: 500) */
  void SetThreshold(float threshold) { m_threshold = threshold; }

private:
  float ComputeEnergy(const int16_t* data, size_t frames);
  float ComputeZeroCrossing(const int16_t* data, size_t frames);

  int m_sample_rate = 16000;
  int m_channels = 1;
  float m_threshold = 500.0f;
  float m_zcr_threshold = 0.1f;
  bool m_speaking = false;
  int m_speech_frames = 0;
  int m_silence_frames = 0;
  int m_hangover = 8; // frames to wait before declaring silence
};
