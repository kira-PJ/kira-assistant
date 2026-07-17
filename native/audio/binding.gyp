{
  "targets": [
    {
      "target_name": "ghost_audio",
      "sources": [
        "src/ghost_audio.cc",
        "src/vad.cc"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")"
      ],
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='linux'", {
          "sources": ["src/pulse_capture.cc"],
          "libraries": ["-lpulse", "-lpulse-simple"],
          "defines": ["PLATFORM_LINUX"]
        }],
        ["OS=='mac'", {
          "sources": ["src/coreaudio_capture.cc"],
          "libraries": [
            "-framework CoreAudio",
            "-framework AudioToolbox",
            "-framework CoreFoundation"
          ],
          "defines": ["PLATFORM_MACOS"],
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_CXX_LIBRARY": "libc++",
            "MACOSX_DEPLOYMENT_TARGET": "12.0"
          }
        }],
        ["OS=='win'", {
          "sources": ["src/wasapi_capture.cc"],
          "libraries": ["-lole32", "-lwinmm", "-lpropsys"],
          "defines": ["PLATFORM_WINDOWS"]
        }]
      ]
    }
  ]
}
