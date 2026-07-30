/* Charabia — état persistant (localStorage + export/import, moteur §9) */
const Store = {
  KEY: 'charabia-state-v1',
  state: null,

  defaults() {
    return {
      version: 1,
      onboarded: false,
      settings: {
        session_min: 50,
        tts_rate_factor: 1.0,
        weekend_freeze: true,
        gemini_key: '',
        gh_token: '',
        gist_id: '',
        last_sync: null,
        last_export: null,
      },
      langs: { en: Store.langDefaults(), es: Store.langDefaults() },
    };
  },
  langDefaults() {
    return {
      session_counter: 0,
      srs: {},            // cardId -> {box, due, lapses, was_learned, hesit_streak}
      bank: {},           // stepId -> {successes, fails_total, next_due_session, evictions, suspended}
      consolidation: {},  // stepId -> {next, stage}
      modules: {},        // moduleId -> {status, session, step, bilan_score, retry_after, retry_items}
      sessions_log: [],   // {n, date, min, score}
      writing_queue: [],  // {id, prompt, text, status, result}
      speaking_later: [], // exercices d'oral reportés (« je ne peux pas parler ici »)
      last_session_date: null,
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(Store.KEY);
      Store.state = raw ? JSON.parse(raw) : Store.defaults();
    } catch (e) { Store.state = Store.defaults(); }
    // fusion douce si de nouveaux champs apparaissent
    const d = Store.defaults();
    Store.state.settings = Object.assign({}, d.settings, Store.state.settings);
    ['en', 'es'].forEach(l => {
      Store.state.langs[l] = Object.assign({}, Store.langDefaults(), Store.state.langs[l]);
    });
    return Store.state;
  },
  save() {
    Store.state.updated_at = Date.now(); // horodatage pour la synchronisation multi-appareils
    try { localStorage.setItem(Store.KEY, JSON.stringify(Store.state)); }
    catch (e) { U.toast('⚠️ Sauvegarde locale impossible — exporte tes données !'); }
  },
  lang(l) { return Store.state.langs[l]; },

  async persistStorage() {
    try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) {}
  },

  exportData() {
    const copy = JSON.parse(JSON.stringify(Store.state));
    delete copy.settings.gemini_key; // jamais dans l'export (moteur §9)
    delete copy.settings.gh_token;   // le jeton GitHub non plus
    const blob = new Blob([JSON.stringify(copy, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'charabia-sauvegarde-' + U.todayKey() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
    Store.state.settings.last_export = U.todayKey();
    Store.save();
  },
  importData(file, done) {
    const r = new FileReader();
    r.onload = () => {
      try {
        const data = JSON.parse(r.result);
        if (!data.langs || !data.langs.en) throw new Error('format');
        // les clés et jetons ne sont jamais dans l'export : on garde ceux de l'appareil
        const keep = {
          gemini_key: Store.state.settings.gemini_key,
          gh_token: Store.state.settings.gh_token,
          gist_id: Store.state.settings.gist_id,
        };
        localStorage.setItem(Store.KEY, JSON.stringify(data));
        Store.load(); // relit la sauvegarde importée + fusion des défauts
        Object.assign(Store.state.settings, keep);
        Store.save();
        done(true);
      } catch (e) { done(false); }
    };
    r.readAsText(file);
  },

  // Streak : 1 session finie dans la journée (peu importe la langue) ; week-ends gelés (moteur §7)
  streak() {
    const days = new Set();
    ['en', 'es'].forEach(l => Store.lang(l).sessions_log.forEach(s => days.add(s.date)));
    if (days.size === 0) return 0;
    const freeze = Store.state.settings.weekend_freeze;
    let count = 0;
    let cur = U.todayKey();
    // aujourd'hui compte s'il est fait, sinon on part d'hier
    if (!days.has(cur)) cur = U.addDays(cur, -1);
    while (true) {
      const dow = U.parseKey(cur).getDay();
      if (freeze && (dow === 0 || dow === 6)) {
        // week-end gelé : une absence ne casse rien, mais une session faite compte quand même
        if (days.has(cur)) count++;
        cur = U.addDays(cur, -1); continue;
      }
      if (days.has(cur)) { count++; cur = U.addDays(cur, -1); }
      else break;
    }
    return count;
  },

  daysSinceLastSession(l) {
    const d = Store.lang(l).last_session_date;
    if (!d) return null;
    return U.daysBetween(d, U.todayKey());
  },
  daysSinceExport() {
    const d = Store.state.settings.last_export;
    if (!d) return null;
    return U.daysBetween(d, U.todayKey());
  },
};
