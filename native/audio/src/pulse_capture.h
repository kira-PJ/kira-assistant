#pragma once

#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <functional>
#include <cstdint>

#ifdef PLATFORM_LINUX
#include <pulse/pulseaudio.h>
#include <pulse/simple.h>
#endif

struct AudioSource {
  std::string name;
  std::string description;
  bool is_monitor;
};

using AudioCallback = std::function<void(const int16_t* data, size_t frames)>;

class PulseCapture {
public:
  PulseCapture();
  ~PulseCapture();

  /**
   * Start capturing audio
   * @param stream_name Name for the PulseAudio stream
   * @param source PulseAudio source name (nullptr for default mic, "@DEFAULT_MONITOR@" for system audio)
   * @param sample_rate Sample rate in Hz (default: 16000)
   * @param channels Number of channels (default: 1 mono)
   * @param buffer_ms Buffer duration in ms before calling back
   * @param callback Function called with PCM data
   */
  bool Start(const std::string& stream_name, const char* source,
             int sample_rate, int channels, int buffer_ms,
             AudioCallback callback);
  
  void Stop();
  bool IsRunning() const;

  static std::vector<AudioSource> ListSources();

private:
  void CaptureLoop();

#ifdef PLATFORM_LINUX
  pa_simple* m_stream = nullptr;
#endif
  std::thread m_thread;
  std::atomic<bool> m_running{false};
  AudioCallback m_callback;
  int m_sample_rate = 16000;
  int m_channels = 1;
  int m_buffer_ms = 5000;
  std::vector<int16_t> m_buffer;
};
