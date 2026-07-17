#ifdef PLATFORM_MACOS

#include "coreaudio_capture.h"
#include "pulse_capture.h" // for AudioSource struct
#include <cstring>

CoreAudioCapture::CoreAudioCapture() {}

CoreAudioCapture::~CoreAudioCapture() {
  Stop();
}

bool CoreAudioCapture::Start(const std::string& stream_name, const char* source,
                             int sample_rate, int channels, int buffer_ms,
                             AudioCallback callback) {
  if (m_running) return false;

  m_sample_rate = sample_rate;
  m_channels = channels;
  m_callback = callback;

  // Set up Audio Unit (RemoteIO / HAL)
  AudioComponentDescription desc = {};
  desc.componentType = kAudioUnitType_Output;
  desc.componentSubType = kAudioUnitSubType_HALOutput;
  desc.componentManufacturer = kAudioUnitManufacturer_Apple;

  AudioComponent component = AudioComponentFindNext(nullptr, &desc);
  if (!component) return false;

  OSStatus status = AudioComponentInstanceNew(component, &m_audioUnit);
  if (status != noErr) return false;

  // Enable input
  UInt32 enableInput = 1;
  status = AudioUnitSetProperty(m_audioUnit,
    kAudioOutputUnitProperty_EnableIO,
    kAudioUnitScope_Input,
    1, // input bus
    &enableInput, sizeof(enableInput));
  if (status != noErr) return false;

  // Disable output
  UInt32 disableOutput = 0;
  status = AudioUnitSetProperty(m_audioUnit,
    kAudioOutputUnitProperty_EnableIO,
    kAudioUnitScope_Output,
    0, // output bus
    &disableOutput, sizeof(disableOutput));
  if (status != noErr) return false;

  // Set the audio device
  if (source) {
    // If source specified, find and set the device
    // For system audio, expect "BlackHole" or "Soundflower" device
    AudioObjectPropertyAddress prop = {
      kAudioHardwarePropertyDevices,
      kAudioObjectPropertyScopeGlobal,
      kAudioObjectPropertyElementMain
    };

    UInt32 dataSize = 0;
    AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &prop, 0, nullptr, &dataSize);
    int deviceCount = dataSize / sizeof(AudioDeviceID);
    std::vector<AudioDeviceID> devices(deviceCount);
    AudioObjectGetPropertyData(kAudioObjectSystemObject, &prop, 0, nullptr, &dataSize, devices.data());

    for (auto deviceId : devices) {
      CFStringRef name = nullptr;
      UInt32 nameSize = sizeof(name);
      AudioObjectPropertyAddress nameProp = {
        kAudioDevicePropertyDeviceNameCFString,
        kAudioObjectPropertyScopeGlobal,
        kAudioObjectPropertyElementMain
      };
      AudioObjectGetPropertyData(deviceId, &nameProp, 0, nullptr, &nameSize, &name);

      if (name) {
        char buf[256];
        CFStringGetCString(name, buf, sizeof(buf), kCFStringEncodingUTF8);
        CFRelease(name);

        if (strstr(buf, source) != nullptr) {
          AudioUnitSetProperty(m_audioUnit,
            kAudioOutputUnitProperty_CurrentDevice,
            kAudioUnitScope_Global, 0,
            &deviceId, sizeof(deviceId));
          break;
        }
      }
    }
  }

  // Set stream format: 16kHz mono PCM int16
  AudioStreamBasicDescription format = {};
  format.mSampleRate = sample_rate;
  format.mFormatID = kAudioFormatLinearPCM;
  format.mFormatFlags = kAudioFormatFlagIsSignedInteger | kAudioFormatFlagIsPacked;
  format.mBitsPerChannel = 16;
  format.mChannelsPerFrame = channels;
  format.mFramesPerPacket = 1;
  format.mBytesPerFrame = channels * 2;
  format.mBytesPerPacket = channels * 2;

  status = AudioUnitSetProperty(m_audioUnit,
    kAudioUnitProperty_StreamFormat,
    kAudioUnitScope_Output,
    1, // input bus output scope
    &format, sizeof(format));
  if (status != noErr) return false;

  // Set callback
  AURenderCallbackStruct callbackStruct = {};
  callbackStruct.inputProc = CoreAudioCapture::InputCallback;
  callbackStruct.inputProcRefCon = this;

  status = AudioUnitSetProperty(m_audioUnit,
    kAudioOutputUnitProperty_SetInputCallback,
    kAudioUnitScope_Global, 0,
    &callbackStruct, sizeof(callbackStruct));
  if (status != noErr) return false;

  // Initialize and start
  status = AudioUnitInitialize(m_audioUnit);
  if (status != noErr) return false;

  status = AudioOutputUnitStart(m_audioUnit);
  if (status != noErr) return false;

  m_running = true;
  return true;
}

void CoreAudioCapture::Stop() {
  if (!m_running) return;
  m_running = false;

  if (m_audioUnit) {
    AudioOutputUnitStop(m_audioUnit);
    AudioUnitUninitialize(m_audioUnit);
    AudioComponentInstanceDispose(m_audioUnit);
    m_audioUnit = nullptr;
  }
}

bool CoreAudioCapture::IsRunning() const {
  return m_running;
}

OSStatus CoreAudioCapture::InputCallback(void* inRefCon,
                                          AudioUnitRenderActionFlags* ioActionFlags,
                                          const AudioTimeStamp* inTimeStamp,
                                          UInt32 inBusNumber,
                                          UInt32 inNumberFrames,
                                          AudioBufferList* ioData) {
  auto* self = static_cast<CoreAudioCapture*>(inRefCon);
  if (!self->m_running) return noErr;

  // Render the audio
  AudioBufferList bufferList;
  bufferList.mNumberBuffers = 1;
  bufferList.mBuffers[0].mNumberChannels = self->m_channels;
  bufferList.mBuffers[0].mDataByteSize = inNumberFrames * self->m_channels * sizeof(int16_t);

  self->m_buffer.resize(inNumberFrames * self->m_channels);
  bufferList.mBuffers[0].mData = self->m_buffer.data();

  OSStatus status = AudioUnitRender(self->m_audioUnit, ioActionFlags,
                                     inTimeStamp, inBusNumber,
                                     inNumberFrames, &bufferList);
  if (status != noErr) return status;

  // Forward to callback
  if (self->m_callback) {
    self->m_callback(self->m_buffer.data(), inNumberFrames * self->m_channels);
  }

  return noErr;
}

std::vector<AudioSource> CoreAudioCapture::ListSources() {
  std::vector<AudioSource> sources;

  AudioObjectPropertyAddress prop = {
    kAudioHardwarePropertyDevices,
    kAudioObjectPropertyScopeGlobal,
    kAudioObjectPropertyElementMain
  };

  UInt32 dataSize = 0;
  AudioObjectGetPropertyDataSize(kAudioObjectSystemObject, &prop, 0, nullptr, &dataSize);
  int count = dataSize / sizeof(AudioDeviceID);
  std::vector<AudioDeviceID> devices(count);
  AudioObjectGetPropertyData(kAudioObjectSystemObject, &prop, 0, nullptr, &dataSize, devices.data());

  for (auto deviceId : devices) {
    CFStringRef name = nullptr;
    UInt32 nameSize = sizeof(name);
    AudioObjectPropertyAddress nameProp = {
      kAudioDevicePropertyDeviceNameCFString,
      kAudioObjectPropertyScopeGlobal,
      kAudioObjectPropertyElementMain
    };
    AudioObjectGetPropertyData(deviceId, &nameProp, 0, nullptr, &nameSize, &name);

    if (name) {
      char buf[256];
      CFStringGetCString(name, buf, sizeof(buf), kCFStringEncodingUTF8);
      CFRelease(name);

      // Check if device has input streams
      AudioObjectPropertyAddress inputProp = {
        kAudioDevicePropertyStreams,
        kAudioDevicePropertyScopeInput,
        kAudioObjectPropertyElementMain
      };
      UInt32 streamSize = 0;
      AudioObjectGetPropertyDataSize(deviceId, &inputProp, 0, nullptr, &streamSize);

      bool hasInput = streamSize > 0;
      bool isLoopback = (strstr(buf, "BlackHole") != nullptr ||
                         strstr(buf, "Soundflower") != nullptr ||
                         strstr(buf, "Loopback") != nullptr);

      if (hasInput) {
        AudioSource src;
        src.name = buf;
        src.description = isLoopback ? "System audio loopback" : "Input device";
        src.is_monitor = isLoopback;
        sources.push_back(src);
      }
    }
  }

  return sources;
}

#endif // PLATFORM_MACOS
