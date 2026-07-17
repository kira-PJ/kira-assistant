#pragma once

#ifdef PLATFORM_MACOS

#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <functional>
#include <cstdint>
#include <AudioToolbox/AudioToolbox.h>
#include <CoreAudio/CoreAudio.h>

struct AudioSource;
using AudioCallback = std::function<void(const int16_t* data, size_t frames)>;

/**
 * CoreAudioCapture - macOS audio capture via CoreAudio
 *
 * Uses an aggregate audio device combining the default input (mic)
 * with a loopback of the default output (system audio via BlackHole/Soundflower).
 *
 * Requirements:
 * - BlackHole (https://existential.audio/blackhole/) or
 *   Soundflower installed for system audio loopback
 * - User must set up a Multi-Output Device in Audio MIDI Setup
 */
class CoreAudioCapture {
public:
  CoreAudioCapture();
  ~CoreAudioCapture();

  bool Start(const std::string& stream_name, const char* source,
             int sample_rate, int channels, int buffer_ms,
             AudioCallback callback);
  void Stop();
  bool IsRunning() const;

  static std::vector<AudioSource> ListSources();

private:
  static OSStatus InputCallback(void* inRefCon,
                                AudioUnitRenderActionFlags* ioActionFlags,
                                const AudioTimeStamp* inTimeStamp,
                                UInt32 inBusNumber,
                                UInt32 inNumberFrames,
                                AudioBufferList* ioData);

  AudioComponentInstance m_audioUnit = nullptr;
  std::atomic<bool> m_running{false};
  AudioCallback m_callback;
  int m_sample_rate = 16000;
  int m_channels = 1;
  std::vector<int16_t> m_buffer;
};

#endif // PLATFORM_MACOS
