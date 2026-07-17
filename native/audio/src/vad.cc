#include "vad.h"
#include <cmath>

VAD::VAD() {}

void VAD::Init(int sample_rate, int channels) {
  m_sample_rate = sample_rate;
  m_channels = channels;
  m_speaking = false;
  m_speech_frames = 0;
  m_silence_frames = 0;
}

bool VAD::Process(const int16_t* data, size_t frames) {
  float energy = ComputeEnergy(data, frames);
  float zcr = ComputeZeroCrossing(data, frames);

  // Decision: speech if energy above threshold OR
  // moderate energy with low zero-crossing (voiced speech)
  bool frame_active = (energy > m_threshold) || 
                      (energy > m_threshold * 0.5f && zcr < m_zcr_threshold);

  if (frame_active) {
    m_speech_frames++;
    m_silence_frames = 0;
    
    // Require at least 2 active frames to declare speech
    if (m_speech_frames >= 2) {
      m_speaking = true;
    }
  } else {
    m_silence_frames++;
    m_speech_frames = 0;
    
    // Hangover: wait N silent frames before stopping
    if (m_silence_frames >= m_hangover) {
      m_speaking = false;
    }
  }

  return m_speaking;
}

float VAD::ComputeEnergy(const int16_t* data, size_t frames) {
  if (frames == 0) return 0.0f;
  
  double sum = 0.0;
  for (size_t i = 0; i < frames; i++) {
    double sample = static_cast<double>(data[i]);
    sum += sample * sample;
  }
  
  return static_cast<float>(std::sqrt(sum / frames));
}

float VAD::ComputeZeroCrossing(const int16_t* data, size_t frames) {
  if (frames < 2) return 0.0f;
  
  int crossings = 0;
  for (size_t i = 1; i < frames; i++) {
    if ((data[i] >= 0 && data[i - 1] < 0) || (data[i] < 0 && data[i - 1] >= 0)) {
      crossings++;
    }
  }
  
  return static_cast<float>(crossings) / static_cast<float>(frames);
}
