#ifdef PLATFORM_WINDOWS

#include "wasapi_capture.h"
#include "pulse_capture.h" // for AudioSource struct
#include <cstring>
#include <cmath>

// Link against these Windows libraries (set in binding.gyp)
#pragma comment(lib, "ole32.lib")
#pragma comment(lib, "winmm.lib")

WASAPICapture::WASAPICapture() {
  CoInitializeEx(nullptr, COINIT_MULTITHREADED);
}

WASAPICapture::~WASAPICapture() {
  Stop();
  CoUninitialize();
}

bool WASAPICapture::Start(const std::string& stream_name, const char* source,
                          int sample_rate, int channels, int buffer_ms,
                          AudioCallback callback) {
  if (m_running) return false;

  m_sample_rate = sample_rate;
  m_channels = channels;
  m_buffer_ms = buffer_ms;
  m_callback = callback;
  m_loopback = (source != nullptr && strcmp(source, "@DEFAULT_MONITOR@") == 0);

  if (!InitializeDevice(m_loopback)) return false;

  m_running = true;
  m_thread = std::thread(&WASAPICapture::CaptureLoop, this);
  return true;
}

void WASAPICapture::Stop() {
  m_running = false;
  if (m_thread.joinable()) m_thread.join();

  if (m_captureClient) { m_captureClient->Release(); m_captureClient = nullptr; }
  if (m_audioClient) { m_audioClient->Stop(); m_audioClient->Release(); m_audioClient = nullptr; }
  if (m_mixFormat) { CoTaskMemFree(m_mixFormat); m_mixFormat = nullptr; }
  if (m_device) { m_device->Release(); m_device = nullptr; }
}

bool WASAPICapture::IsRunning() const {
  return m_running;
}

bool WASAPICapture::InitializeDevice(bool loopback) {
  IMMDeviceEnumerator* enumerator = nullptr;
  HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
    CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&enumerator);
  if (FAILED(hr)) return false;

  // Get default device
  EDataFlow dataFlow = loopback ? eRender : eCapture;
  hr = enumerator->GetDefaultAudioEndpoint(dataFlow, eConsole, &m_device);
  enumerator->Release();
  if (FAILED(hr)) return false;

  hr = m_device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, (void**)&m_audioClient);
  if (FAILED(hr)) return false;

  hr = m_audioClient->GetMixFormat(&m_mixFormat);
  if (FAILED(hr)) return false;

  // Initialize in loopback or normal capture mode
  DWORD streamFlags = loopback ? AUDCLNT_STREAMFLAGS_LOOPBACK : 0;
  REFERENCE_TIME bufferDuration = 10000000; // 1 second in 100ns units

  hr = m_audioClient->Initialize(AUDCLNT_SHAREMODE_SHARED, streamFlags,
    bufferDuration, 0, m_mixFormat, nullptr);
  if (FAILED(hr)) return false;

  hr = m_audioClient->GetService(__uuidof(IAudioCaptureClient), (void**)&m_captureClient);
  if (FAILED(hr)) return false;

  hr = m_audioClient->Start();
  if (FAILED(hr)) return false;

  return true;
}

void WASAPICapture::CaptureLoop() {
  // Accumulate samples until we have buffer_ms worth
  size_t targetFrames = (m_sample_rate * m_buffer_ms) / 1000;
  m_resampleBuffer.resize(targetFrames * m_channels);
  size_t accumulated = 0;

  while (m_running) {
    Sleep(10); // 10ms poll interval

    UINT32 packetLength = 0;
    m_captureClient->GetNextPacketSize(&packetLength);

    while (packetLength > 0) {
      BYTE* data = nullptr;
      UINT32 framesAvailable = 0;
      DWORD flags = 0;

      HRESULT hr = m_captureClient->GetBuffer(&data, &framesAvailable, &flags, nullptr, nullptr);
      if (FAILED(hr)) break;

      if (!(flags & AUDCLNT_BUFFERFLAGS_SILENT) && data) {
        // Convert captured audio to our target format (16kHz mono int16)
        // This is a simplified conversion — production should use a proper resampler
        size_t framesToCopy = std::min((size_t)framesAvailable, targetFrames - accumulated);

        if (m_mixFormat->wFormatTag == WAVE_FORMAT_IEEE_FLOAT ||
            (m_mixFormat->wFormatTag == WAVE_FORMAT_EXTENSIBLE)) {
          // Convert float32 to int16 with basic decimation
          float* floatData = (float*)data;
          int srcChannels = m_mixFormat->nChannels;
          int srcRate = m_mixFormat->nSamplesPerSec;
          double ratio = (double)srcRate / m_sample_rate;

          for (size_t i = 0; i < framesToCopy && accumulated < targetFrames; i++) {
            size_t srcIdx = (size_t)(i * ratio) * srcChannels;
            if (srcIdx >= (size_t)framesAvailable * srcChannels) break;

            // Mix to mono and convert to int16
            float sample = floatData[srcIdx];
            if (srcChannels > 1) {
              sample = (floatData[srcIdx] + floatData[srcIdx + 1]) * 0.5f;
            }

            int16_t value = (int16_t)(sample * 32767.0f);
            m_resampleBuffer[accumulated++] = value;
          }
        }
      }

      m_captureClient->ReleaseBuffer(framesAvailable);
      m_captureClient->GetNextPacketSize(&packetLength);
    }

    // When we've accumulated enough, fire callback
    if (accumulated >= targetFrames) {
      if (m_callback) {
        m_callback(m_resampleBuffer.data(), accumulated);
      }
      accumulated = 0;
    }
  }

  // Flush remaining
  if (accumulated > 0 && m_callback) {
    m_callback(m_resampleBuffer.data(), accumulated);
  }
}

void WASAPICapture::ConvertToInt16(const BYTE* input, int16_t* output,
                                    UINT32 frames, const WAVEFORMATEX* format) {
  if (format->wBitsPerSample == 32) {
    // Float32 → int16
    const float* src = (const float*)input;
    for (UINT32 i = 0; i < frames; i++) {
      float sample = src[i * format->nChannels]; // Take first channel
      output[i] = (int16_t)(fmaxf(-1.0f, fminf(1.0f, sample)) * 32767.0f);
    }
  } else if (format->wBitsPerSample == 16) {
    // Already int16
    const int16_t* src = (const int16_t*)input;
    for (UINT32 i = 0; i < frames; i++) {
      output[i] = src[i * format->nChannels];
    }
  }
}

std::vector<AudioSource> WASAPICapture::ListSources() {
  std::vector<AudioSource> sources;

  IMMDeviceEnumerator* enumerator = nullptr;
  HRESULT hr = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr,
    CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), (void**)&enumerator);
  if (FAILED(hr)) return sources;

  // List capture devices (microphones)
  IMMDeviceCollection* collection = nullptr;
  hr = enumerator->EnumAudioEndpoints(eCapture, DEVICE_STATE_ACTIVE, &collection);
  if (SUCCEEDED(hr)) {
    UINT count = 0;
    collection->GetCount(&count);

    for (UINT i = 0; i < count; i++) {
      IMMDevice* device = nullptr;
      collection->Item(i, &device);
      if (!device) continue;

      IPropertyStore* props = nullptr;
      device->OpenPropertyStore(STGM_READ, &props);
      if (props) {
        PROPVARIANT name;
        PropVariantInit(&name);
        props->GetValue(PKEY_Device_FriendlyName, &name);

        if (name.vt == VT_LPWSTR) {
          char buf[256];
          WideCharToMultiByte(CP_UTF8, 0, name.pwszVal, -1, buf, sizeof(buf), nullptr, nullptr);
          AudioSource src;
          src.name = buf;
          src.description = "Microphone";
          src.is_monitor = false;
          sources.push_back(src);
        }

        PropVariantClear(&name);
        props->Release();
      }
      device->Release();
    }
    collection->Release();
  }

  // List render devices (for loopback)
  hr = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &collection);
  if (SUCCEEDED(hr)) {
    UINT count = 0;
    collection->GetCount(&count);

    for (UINT i = 0; i < count; i++) {
      IMMDevice* device = nullptr;
      collection->Item(i, &device);
      if (!device) continue;

      IPropertyStore* props = nullptr;
      device->OpenPropertyStore(STGM_READ, &props);
      if (props) {
        PROPVARIANT name;
        PropVariantInit(&name);
        props->GetValue(PKEY_Device_FriendlyName, &name);

        if (name.vt == VT_LPWSTR) {
          char buf[256];
          WideCharToMultiByte(CP_UTF8, 0, name.pwszVal, -1, buf, sizeof(buf), nullptr, nullptr);
          AudioSource src;
          src.name = std::string(buf) + " (Loopback)";
          src.description = "System audio loopback";
          src.is_monitor = true;
          sources.push_back(src);
        }

        PropVariantClear(&name);
        props->Release();
      }
      device->Release();
    }
    collection->Release();
  }

  enumerator->Release();
  return sources;
}

#endif // PLATFORM_WINDOWS
