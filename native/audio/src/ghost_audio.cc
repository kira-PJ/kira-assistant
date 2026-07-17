/**
 * Ghost Audio - Native N-API addon for system audio capture
 * 
 * Supports:
 * - Linux: PulseAudio/PipeWire (via libpulse API)
 * - macOS: CoreAudio (planned)
 * - Windows: WASAPI (planned)
 * 
 * Provides dual-stream capture (microphone + system audio)
 * with Voice Activity Detection (VAD).
 */

#include <napi.h>
#include "pulse_capture.h"
#include "vad.h"

#ifdef PLATFORM_LINUX

static PulseCapture* g_mic_capture = nullptr;
static PulseCapture* g_sys_capture = nullptr;
static Napi::ThreadSafeFunction g_mic_callback;
static Napi::ThreadSafeFunction g_sys_callback;
static VAD g_vad;

/**
 * Start capturing audio from both mic and system
 * Options: { sampleRate: 16000, channels: 1, bufferMs: 5000 }
 */
Napi::Value StartCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected options object and callback").ThrowAsJavaScriptException();
    return env.Null();
  }

  Napi::Object opts = info[0].As<Napi::Object>();
  
  int sample_rate = 16000;
  int channels = 1;
  int buffer_ms = 5000;

  if (opts.Has("sampleRate")) sample_rate = opts.Get("sampleRate").As<Napi::Number>().Int32Value();
  if (opts.Has("channels")) channels = opts.Get("channels").As<Napi::Number>().Int32Value();
  if (opts.Has("bufferMs")) buffer_ms = opts.Get("bufferMs").As<Napi::Number>().Int32Value();

  // Mic callback
  g_mic_callback = Napi::ThreadSafeFunction::New(
    env, info[1].As<Napi::Function>(), "MicCallback", 0, 1
  );

  // System audio callback (if provided as 3rd arg)
  if (info.Length() >= 3 && info[2].IsFunction()) {
    g_sys_callback = Napi::ThreadSafeFunction::New(
      env, info[2].As<Napi::Function>(), "SysCallback", 0, 1
    );
  }

  // Initialize VAD
  g_vad.Init(sample_rate, channels);

  // Start mic capture
  g_mic_capture = new PulseCapture();
  bool mic_ok = g_mic_capture->Start("ghost-mic", nullptr, sample_rate, channels, buffer_ms,
    [](const int16_t* data, size_t frames) {
      // Check VAD
      bool active = g_vad.Process(data, frames);
      
      // Forward to JS
      auto callback = [data, frames, active](Napi::Env env, Napi::Function jsCallback) {
        auto buffer = Napi::Buffer<int16_t>::Copy(env, data, frames);
        jsCallback.Call({
          buffer,
          Napi::Boolean::New(env, active),
          Napi::String::New(env, "mic")
        });
      };
      g_mic_callback.BlockingCall(callback);
    }
  );

  // Start system audio capture (monitor source)
  g_sys_capture = new PulseCapture();
  bool sys_ok = g_sys_capture->Start("ghost-system", "@DEFAULT_MONITOR@", sample_rate, channels, buffer_ms,
    [](const int16_t* data, size_t frames) {
      bool active = g_vad.Process(data, frames);
      
      auto callback = [data, frames, active](Napi::Env env, Napi::Function jsCallback) {
        auto buffer = Napi::Buffer<int16_t>::Copy(env, data, frames);
        jsCallback.Call({
          buffer,
          Napi::Boolean::New(env, active),
          Napi::String::New(env, "system")
        });
      };
      
      if (g_sys_callback) {
        g_sys_callback.BlockingCall(callback);
      } else {
        g_mic_callback.BlockingCall(callback);
      }
    }
  );

  Napi::Object result = Napi::Object::New(env);
  result.Set("micActive", Napi::Boolean::New(env, mic_ok));
  result.Set("systemActive", Napi::Boolean::New(env, sys_ok));
  return result;
}

/**
 * Stop all audio capture
 */
Napi::Value StopCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (g_mic_capture) {
    g_mic_capture->Stop();
    delete g_mic_capture;
    g_mic_capture = nullptr;
  }
  if (g_sys_capture) {
    g_sys_capture->Stop();
    delete g_sys_capture;
    g_sys_capture = nullptr;
  }
  if (g_mic_callback) {
    g_mic_callback.Release();
  }
  if (g_sys_callback) {
    g_sys_callback.Release();
  }

  return Napi::Boolean::New(env, true);
}

/**
 * List available audio sources
 */
Napi::Value ListSources(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  
  auto sources = PulseCapture::ListSources();
  Napi::Array result = Napi::Array::New(env, sources.size());
  
  for (size_t i = 0; i < sources.size(); i++) {
    Napi::Object src = Napi::Object::New(env);
    src.Set("name", Napi::String::New(env, sources[i].name));
    src.Set("description", Napi::String::New(env, sources[i].description));
    src.Set("isMonitor", Napi::Boolean::New(env, sources[i].is_monitor));
    result.Set(i, src);
  }
  
  return result;
}

/**
 * Check if audio is currently being captured
 */
Napi::Value IsCapturing(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();
  bool capturing = (g_mic_capture != nullptr && g_mic_capture->IsRunning()) ||
                   (g_sys_capture != nullptr && g_sys_capture->IsRunning());
  return Napi::Boolean::New(env, capturing);
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startCapture", Napi::Function::New(env, StartCapture));
  exports.Set("stopCapture", Napi::Function::New(env, StopCapture));
  exports.Set("listSources", Napi::Function::New(env, ListSources));
  exports.Set("isCapturing", Napi::Function::New(env, IsCapturing));
  return exports;
}

NODE_API_MODULE(ghost_audio, Init)

#else
// Stub for non-Linux platforms (to be implemented)
Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("startCapture", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
    return info.Env().Null();
  }));
  exports.Set("stopCapture", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
    return Napi::Boolean::New(info.Env(), false);
  }));
  exports.Set("listSources", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
    return Napi::Array::New(info.Env());
  }));
  exports.Set("isCapturing", Napi::Function::New(env, [](const Napi::CallbackInfo& info) -> Napi::Value {
    return Napi::Boolean::New(info.Env(), false);
  }));
  return exports;
}

NODE_API_MODULE(ghost_audio, Init)
#endif
