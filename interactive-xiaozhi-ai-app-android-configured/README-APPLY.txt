LUMI BILINGUAL ASR PATCH (ENGLISH + CHINESE)
============================================

WHAT THIS PATCH DOES
- Adds Settings > Speech recognition mode.
- Adds "Bilingual auto-detect (English + Chinese)".
- Carries the bilingual mode through the React app, Capacitor bridge,
  Android native WebSocket client, reconnect flow, and optional Node bridge.
- Keeps known public hosted Xiaozhi endpoints on the standard protocol.
- Adds a self-hosted Xiaozhi FunASR/SenseVoice config example using language: auto.

IMPORTANT LIMITATION
The hosted xiaozhi.me service controls ASR language on its server. This client
patch cannot force the hosted service to recognize two languages at once.
For actual bilingual recognition, point Lumi to a compatible/self-hosted
Xiaozhi backend and configure its ASR for automatic language detection.

OPTION A - APPLY WITH GIT (recommended)
1. Make a backup of your Lumi project.
2. Copy lumi-bilingual-asr.patch into the project root (the folder containing package.json).
3. Open a terminal in that folder.
4. Check the patch:
     git apply --check lumi-bilingual-asr.patch
5. Apply it:
     git apply lumi-bilingual-asr.patch
6. Run your normal Android preparation/build process.

OPTION B - MANUAL OVERWRITE
Copy the files inside patched-files/ over the matching files in your project,
preserving their folder structure.

SELF-HOSTED XIAOZHI
Use server/xiaozhi-bilingual-asr.config.example.yaml as a guide. The important
part is:

  selected_module:
    ASR: FunASR

  ASR:
    FunASR:
      type: fun_local
      model_dir: models/SenseVoiceSmall
      output_dir: tmp/
      language: auto

Then in Lumi Settings:
- Xiaozhi WebSocket URL: your self-hosted wss://.../xiaozhi/v1/
- Speech recognition mode: Bilingual auto-detect (English + Chinese)
- Preferred recognition languages: zh,en

TEST PHRASES
- Hello Lumi, how are you?
- 你好 Lumi，今天怎么样？
- Lumi, can you tell me 今天的天气怎么样？
- 我想 ask you something about artificial intelligence.

VALIDATION PERFORMED
- Patch applies cleanly to the uploaded Lumi-XIAOZHIAI--main project.
- Changed TS/TSX files pass TypeScript syntax transpilation.
- server/xiaozhi-bridge.mjs passes node --check.
- Full Vite/Android build was not run because the dependency set/Android build
  environment was not fully available in this execution environment.
