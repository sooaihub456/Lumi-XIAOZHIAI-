# Lumi bilingual ASR patch (English + Chinese)

This patch adds a **Bilingual auto-detect** option to Lumi without changing the current hosted Xiaozhi protocol. On Android, Lumi automatically suppresses the custom ASR extension for the known public hosted endpoints.

## Important

The public `xiaozhi.me` / hosted Xiaozhi service chooses the speech-recognition language on the server. The public WebSocket protocol does not expose a standard per-turn bilingual-language setting, so an Android-only patch cannot force the hosted service to recognize both languages.

The new setting is intended for a **compatible/self-hosted Xiaozhi backend** whose ASR is configured for automatic language detection.

## Recommended self-hosted configuration

Current `xinnan-tech/xiaozhi-esp32-server` supports SenseVoice/FunASR automatic language detection. In `main/xiaozhi-server/data/.config.yaml` (or the equivalent manager-controlled model configuration), make sure the active ASR is FunASR and its language is `auto`:

```yaml
selected_module:
  ASR: FunASR

ASR:
  FunASR:
    type: fun_local
    model_dir: models/SenseVoiceSmall
    output_dir: tmp/
    language: auto
```

SenseVoice supports language tags including `zh` and `en`, so the same ASR can recognize Mandarin/Chinese and English without changing the language selector between turns.

## Lumi settings

1. Open **Settings > Xiaozhi connection**.
2. Point **Xiaozhi WebSocket URL** to your self-hosted server, for example `wss://your-domain/xiaozhi/v1/`.
3. Set **Speech recognition mode** to **Bilingual auto-detect (English + Chinese)**.
4. Leave **Preferred recognition languages** as `zh,en`.
5. Reconnect.

When enabled, Lumi also sends the optional hints:

- HTTP header: `X-Mori-ASR-Mode: auto`
- HTTP header: `X-Mori-ASR-Languages: zh,en`
- `hello.mori.asr.mode = "auto"`
- `hello.mori.asr.languages = ["zh", "en"]`

These are deliberately optional/non-standard extensions. A normal Xiaozhi server may ignore them. The actual bilingual behavior comes from configuring the server ASR to automatic language detection.

## Test phrases

After reconnecting, test all four:

- `Hello Lumi, how are you?`
- `你好 Lumi，今天怎么样？`
- `Lumi, can you tell me 今天的天气怎么样？`
- `我想 ask you something about artificial intelligence.`

The user transcript should preserve the correct English and Chinese words before the LLM response is generated.
