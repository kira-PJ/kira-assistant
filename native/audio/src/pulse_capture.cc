#include "pulse_capture.h"
#include <cstring>

#ifdef PLATFORM_LINUX

PulseCapture::PulseCapture() {}

PulseCapture::~PulseCapture() {
  Stop();
}

bool PulseCapture::Start(const std::string& stream_name, const char* source,
                         int sample_rate, int channels, int buffer_ms,
                         AudioCallback callback) {
  if (m_running) return false;

  m_sample_rate = sample_rate;
  m_channels = channels;
  m_buffer_ms = buffer_ms;
  m_callback = callback;

  // Calculate buffer size: samples = rate * channels * (ms / 1000)
  size_t buffer_frames = (sample_rate * channels * buffer_ms) / 1000;
  m_buffer.resize(buffer_frames);

  // PulseAudio sample spec
  pa_sample_spec spec;
  spec.format = PA_SAMPLE_S16LE;
  spec.rate = sample_rate;
  spec.channels = channels;

  // Buffer attributes for low latency
  pa_buffer_attr buf_attr;
  memset(&buf_attr, 0, sizeof(buf_attr));
  buf_attr.maxlength = (uint32_t)-1;
  buf_attr.fragsize = buffer_frames * sizeof(int16_t);

  int error = 0;
  m_stream = pa_simple_new(
    nullptr,              // Default server
    "GhostAssistant",    // Application name
    PA_STREAM_RECORD,    // Direction
    source,              // Source (nullptr = default mic, @DEFAULT_MONITOR@ = system)
    stream_name.c_str(), // Stream name
    &spec,               // Sample format
    nullptr,             // Default channel map
    &buf_attr,           // Buffer attributes
    &error               // Error code
  );

  if (!m_stream) {
    return false;
  }

  m_running = true;
  m_thread = std::thread(&PulseCapture::CaptureLoop, this);
  return true;
}

void PulseCapture::Stop() {
  m_running = false;
  if (m_thread.joinable()) {
    m_thread.join();
  }
  if (m_stream) {
    pa_simple_free(m_stream);
    m_stream = nullptr;
  }
}

bool PulseCapture::IsRunning() const {
  return m_running;
}

void PulseCapture::CaptureLoop() {
  size_t bytes_to_read = m_buffer.size() * sizeof(int16_t);
  
  while (m_running) {
    int error = 0;
    int ret = pa_simple_read(m_stream, m_buffer.data(), bytes_to_read, &error);
    
    if (ret < 0) {
      // Read error, try to continue
      continue;
    }

    if (m_callback) {
      m_callback(m_buffer.data(), m_buffer.size());
    }
  }
}

std::vector<AudioSource> PulseCapture::ListSources() {
  std::vector<AudioSource> sources;
  
  // Use PulseAudio mainloop to enumerate sources
  pa_mainloop* mainloop = pa_mainloop_new();
  pa_context* context = pa_context_new(pa_mainloop_get_api(mainloop), "GhostEnum");
  
  if (pa_context_connect(context, nullptr, PA_CONTEXT_NOFLAGS, nullptr) < 0) {
    pa_context_unref(context);
    pa_mainloop_free(mainloop);
    return sources;
  }

  // Wait for context to be ready
  pa_context_state_t state;
  while (true) {
    pa_mainloop_iterate(mainloop, 1, nullptr);
    state = pa_context_get_state(context);
    if (state == PA_CONTEXT_READY) break;
    if (!PA_CONTEXT_IS_GOOD(state)) {
      pa_context_unref(context);
      pa_mainloop_free(mainloop);
      return sources;
    }
  }

  // Get source list
  struct EnumData {
    std::vector<AudioSource>* sources;
    bool done;
  };
  EnumData data = { &sources, false };

  pa_context_get_source_info_list(context,
    [](pa_context*, const pa_source_info* info, int eol, void* userdata) {
      auto* d = static_cast<EnumData*>(userdata);
      if (eol > 0) {
        d->done = true;
        return;
      }
      if (info) {
        AudioSource src;
        src.name = info->name ? info->name : "";
        src.description = info->description ? info->description : "";
        src.is_monitor = (info->monitor_of_sink != PA_INVALID_INDEX);
        d->sources->push_back(src);
      }
    },
    &data
  );

  while (!data.done) {
    pa_mainloop_iterate(mainloop, 1, nullptr);
  }

  pa_context_disconnect(context);
  pa_context_unref(context);
  pa_mainloop_free(mainloop);

  return sources;
}

#else

// Stub implementations for non-Linux
PulseCapture::PulseCapture() {}
PulseCapture::~PulseCapture() { Stop(); }
bool PulseCapture::Start(const std::string&, const char*, int, int, int, AudioCallback) { return false; }
void PulseCapture::Stop() { m_running = false; }
bool PulseCapture::IsRunning() const { return false; }
std::vector<AudioSource> PulseCapture::ListSources() { return {}; }
void PulseCapture::CaptureLoop() {}

#endif
