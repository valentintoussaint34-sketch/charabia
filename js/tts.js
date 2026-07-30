/* Charabia — synthèse vocale (découpage phrase par phrase, moteur §8) */
const TTS = {
  voices: [],
  ready: false,

  init() {
    const load = () => { TTS.voices = speechSynthesis.getVoices(); TTS.ready = TTS.voices.length > 0; };
    load();
    if (speechSynthesis.onvoiceschanged !== undefined) speechSynthesis.onvoiceschanged = load;
  },

  pick(langCode) { // 'en-GB' / 'es-ES'
    const exact = TTS.voices.filter(v => v.lang.replace('_', '-') === langCode);
    if (exact.length) return exact[0];
    const base = langCode.split('-')[0];
    const same = TTS.voices.filter(v => v.lang.startsWith(base));
    return same[0] || null;
  },

  hasVoice(base) { return TTS.voices.some(v => v.lang.startsWith(base)); },

  // texte de listening → phrases (les longs textes se font couper par Android)
  sentences(text) {
    return String(text)
      .replace(/\*\*/g, '').replace(/\n[—-]\s*/g, '\n')
      .split(/\n+|(?<=[.!?…])\s+/)
      .map(s => s.replace(/^[—-]\s*/, '').trim())
      .filter(s => s.length > 1);
  },

  stop() { try { speechSynthesis.cancel(); } catch (e) {} },

  speak(text, langCode, rate, onEnd) {
    TTS.stop();
    const parts = TTS.sentences(text);
    const voice = TTS.pick(langCode);
    let i = 0;
    const factor = Store.state.settings.tts_rate_factor || 1;
    const next = () => {
      if (i >= parts.length) { if (onEnd) onEnd(); return; }
      const u = new SpeechSynthesisUtterance(parts[i]);
      if (voice) u.voice = voice;
      u.lang = langCode;
      u.rate = Math.max(0.5, Math.min(1.5, (rate || 0.9) * factor));
      u.onend = () => { i++; setTimeout(next, 250); };
      u.onerror = () => { i++; setTimeout(next, 100); };
      speechSynthesis.speak(u);
    };
    next();
  },
};
