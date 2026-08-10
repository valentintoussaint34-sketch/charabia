/* Charabia — appels Gemini (correction IA, moteur §8) */
const Gemini = {
  // essayés dans l'ordre ; l'alias -latest suit les nouvelles versions de Google
  MODELS: ['gemini-flash-latest', 'gemini-2.5-flash'],
  MODEL: 'gemini-flash-latest',

  hasKey() { return !!(Store.state.settings.gemini_key || '').trim(); },
  available() { return Gemini.hasKey() && U.online(); },

  // essaie chaque modèle de la liste ; bascule sur le suivant si l'un disparaît (http404)
  async call(prompt, wantJson) {
    let lastErr = null;
    for (const model of Gemini.MODELS) {
      try { return await Gemini.callModel(model, prompt, wantJson); }
      catch (e) { lastErr = e; if (String(e.message) !== 'http404') throw e; }
    }
    throw lastErr;
  },

  async callModel(model, prompt, wantJson) {
    const key = Store.state.settings.gemini_key.trim();
    // clé passée en en-tête, jamais dans l'URL (les URL traînent dans les logs réseau)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
    const body = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: wantJson ? { responseMimeType: 'application/json' } : {},
    };
    // timeout : sans lui, un réseau mobile qui pend fige l'écran d'exercice
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } finally { clearTimeout(timer); }
    if (res.status === 429) throw new Error('quota');
    if (!res.ok) throw new Error('http' + res.status);
    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    return wantJson ? JSON.parse(text) : text;
  },

  langName(l) { return l === 'en' ? 'anglais' : 'espagnol'; },

  // Vérification d'une réponse libre courte (translation / question ouverte, moteur §8)
  async checkAnswer(l, exercise, given) {
    const prompt =
`Tu es correcteur de ${Gemini.langName(l)} pour un apprenant francophone (niveau ${l === 'en' ? 'B1' : 'A2'}).
Exercice : ${exercise.prompt || exercise.question || ''}
${exercise.text ? 'Phrase à corriger : ' + exercise.text : ''}
Réponse attendue (exemples corrects) : ${(exercise.accepted || []).join(' / ') || exercise.explanation || 'voir consigne'}
Réponse de l'apprenant : "${given}"
La réponse de l'apprenant est-elle correcte (sens ET grammaire, variantes naturelles acceptées, fautes réelles refusées) ?
RÈGLE SPÉCIALE ACCENTS : si la SEULE différence avec une réponse correcte est l'accentuation ou les signes diacritiques (á, é, í, ó, ú, ñ, ü…), la réponse EST correcte : mets "correct": true ET "accents_only": true, et rappelle la bonne écriture dans l'explication. Toute autre faute (orthographe, mot, conjugaison) → "correct": false.
Réponds en JSON strict : {"correct": true|false, "accents_only": true|false, "explanation": "explication brève en français (pourquoi, avec la forme correcte)"}`;
    return await Gemini.call(prompt, true);
  },

  // Correction d'une production écrite (moteur §8 : reçoit constraints et target_vocab)
  async correctWriting(l, exercise, text, targetWords) {
    const prompt =
`Tu es professeur de ${Gemini.langName(l)} pour un apprenant francophone (niveau ${l === 'en' ? 'B1, contexte professionnel/marketing' : 'A2, vie quotidienne'}).
Consigne de l'exercice : ${exercise.prompt}
${exercise.constraints ? 'Contraintes : ' + exercise.constraints : ''}
${targetWords && targetWords.length ? 'Vocabulaire à utiliser : ' + targetWords.join(', ') : ''}
Texte de l'apprenant :
"""${text}"""
Corrige ce texte. Sois exigeant mais encourageant. Vérifie aussi le respect des contraintes et l'usage du vocabulaire imposé.
Réponds en JSON strict :
{"score": note sur 10 (nombre),
 "summary": "une phrase de bilan en français",
 "errors": [{"wrong": "extrait fautif", "right": "correction", "why": "explication en français"}],
 "rewrite": "le texte réécrit corrigé"}`;
    return await Gemini.call(prompt, true);
  },

  // File d'attente hors ligne : flush au lancement / au retour du réseau (moteur §8)
  async flushQueue() {
    if (!Gemini.available()) return 0;
    let done = 0;
    for (const l of ['en', 'es']) {
      const q = Store.lang(l).writing_queue.filter(w => w.status === 'pending');
      for (const w of q) {
        try {
          w.result = await Gemini.correctWriting(l, { prompt: w.prompt, constraints: w.constraints }, w.text, w.target_words);
          w.status = 'corrected';
          done++;
        } catch (e) {
          if (String(e.message) === 'quota') { if (done) Store.save(); return done; }
          // erreur passagère : on garde le texte en attente, abandon signalé après 5 échecs
          w.attempts = (w.attempts || 0) + 1;
          if (w.attempts >= 5) w.status = 'failed';
        }
      }
    }
    if (done) Store.save();
    return done;
  },

  pendingCount() {
    return ['en', 'es'].reduce((n, l) => n + Store.lang(l).writing_queue.filter(w => w.status === 'pending').length, 0);
  },
  failedCount() {
    return ['en', 'es'].reduce((n, l) => n + Store.lang(l).writing_queue.filter(w => w.status === 'failed').length, 0);
  },
  retryFailed() {
    ['en', 'es'].forEach(l => Store.lang(l).writing_queue.forEach(w => {
      if (w.status === 'failed') { w.status = 'pending'; w.attempts = 0; }
    }));
    Store.save();
    return Gemini.flushQueue();
  },
  correctedUnseen() {
    const out = [];
    ['en', 'es'].forEach(l => Store.lang(l).writing_queue.forEach(w => { if (w.status === 'corrected' && !w.seen) out.push({ lang: l, w }); }));
    return out;
  },
};
