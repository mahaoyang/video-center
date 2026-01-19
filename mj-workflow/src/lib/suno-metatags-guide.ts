/**
 * Clean, local-only Suno metatags guide (no runtime web dependency).
 *
 * Source inspiration: https://sunometatagcreator.com/metatags-guide (UI is noisy).
 * We keep a concise, model-friendly distilled guide here.
 */

export const SUNO_METATAGS_GUIDE = `
Suno "Lyrics" metatags guide (clean summary)

1) Format
- Use square-bracket tags, one per line when possible.
- Song structure tags (common):
  [Intro], [Verse 1], [Verse 2], [Pre-Chorus], [Chorus], [Post-Chorus], [Bridge], [Breakdown], [Drop], [Outro]
- Optional performance / production control tags (use only what matters):
  [Genre: ...]
  [Mood: ...]
  [Tempo: ... BPM]
  [Key: ...]
  [Time Signature: 4/4]
  [Instrumentation: ...]
  [Vocal: ...] (e.g., female alto / male baritone / duet / choir / rap / spoken word / no vocals)
  [Language: ...] (e.g., Chinese / English)
  [Energy: ...] (e.g., low / medium / high)
  [Dynamics: ...] (e.g., build-up, intimate -> explosive)
  [Production: ...] (e.g., lo-fi tape, modern glossy, live room, wide reverb)

2) Two variants (always produce both)
- Instrumental version: ONLY tags (no lyric lines).
- Lyrics version: tags + actual lyric lines under each section.

3) Best practices
- Keep tags concise; avoid overly long paragraphs inside tags.
- Make sections coherent and tell one story arc (Intro -> Verse -> Chorus -> Bridge -> Outro).
- Chorus should be the hook: short, memorable, repeats.
- If the user provides constraints (theme, language, perspective, censorship, length), obey them.
- If images are provided, infer mood/genre/instrumentation and reflect them in tags and style prompt.

4) Output requirements for this app
- Return EXACTLY two blocks, in order:
  CONTROL_PROMPT:
  <metatag-based lyrics/control prompt; include BOTH instrumental+lyrics variants inside>
  STYLE_PROMPT:
  <short comma-separated "Style of Music" prompt for Suno>
`.trim();

