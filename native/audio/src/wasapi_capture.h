#pragma once

#ifdef PLATFORM_WINDOWS

#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <functional>
#include <cstdint>

#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>

struct AudioSource;
using AudioCallback = std::function<void(const int16_t* data, size_t frames)>;

/**
 * WASAPICapture - Windows audio capture via WASAPI loopback
 *
 * Uses WASAPI in loopback mode to capture system audio output,
 * and standard WASAPI for microphone input.
 *
 * No additional software required — WASAPI loopback is built into Windows.
 */
class WASAPICapture {
public:
  WASAPICapture();
  ~WASAPICapture();

  /**
   * Start audio capture
   * @param source nullptr for default mic, "loopback" for system audio
   */
  bool Start(const std::string& stream_name, const char* source,
             int sample_rate, int channels, int buffer_ms,
             AudioCallback callback);
  void Stop();
  bool IsRunning() const;

  static std::vector<AudioSource> ListSources();

private:
  void CaptureLoop();
  bool InitializeDevice(bool loopback);
  void ConvertToInt16(const BYTE* input, int16_t* output,
                      UINT32 frames, const WAVEFORMATEX* format);

  IMMDevice* m_device = nullptr;
  IAudioClient* m_audioClient = nullptr;
  IAudioCaptureClient* m_captureClient = nullptr;
  WAVEFORMATEX* m_mixFormat = nullptr;

  std::thread m_thread;
  std::atomic<bool> m_running{false};
  AudioCallback m_callback;
  int m_sample_rate = 16000;
  int m_channels = 1;
  int m_buffer_ms = 5000;
  bool m_loopback = false;
  std::vector<int16_t> m_resampleBuffer;
};

#endif // PLATFORM_WINDOWS
