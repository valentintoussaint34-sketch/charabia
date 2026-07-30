/* Charabia — répétition espacée (moteur §3, v1.1) */
const SRS = {
  INTERVALS: { 1: 1, 2: 3, 3: 7, 4: 16, 5: 35 }, // boîte -> jours
  MAX_DUE_PER_SESSION: 50,
  ACQUIRED_SAMPLE: 2,

  ensureCard(l, id) {
    const s = Store.lang(l).srs;
    if (!s[id]) s[id] = { box: 0, due: U.todayKey(), lapses: 0, was_learned: false, hesit_streak: 0 };
    return s[id];
  },

  // cartes dues aujourd'hui (hors acquises), plus anciennes d'abord, plafonnées
  dueCards(l) {
    const today = U.todayKey();
    const s = Store.lang(l).srs;
    return Object.keys(s)
      .filter(id => s[id].box >= 1 && s[id].box <= 5 && s[id].due <= today)
      .sort((a, b) => s[a].due < s[b].due ? -1 : 1);
  },

  // échantillon d'entretien des acquises (moteur §3.1)
  acquiredSample(l) {
    const s = Store.lang(l).srs;
    const acq = Object.keys(s).filter(id => s[id].box === 6)
      .sort((a, b) => (s[a].due < s[b].due ? -1 : 1));
    return acq.slice(0, SRS.ACQUIRED_SAMPLE);
  },

  // introduction de nouvelles cartes par la session de module
  introduce(l, ids) {
    const wf = Store.state.settings.weekend_freeze;
    ids.forEach(id => {
      const c = SRS.ensureCard(l, id);
      if (c.box === 0) { c.box = 1; c.due = U.dueDate(1, wf); }
    });
  },

  // sens de travail : production à partir de B3 (moteur §3.3)
  direction(card) { return card.box >= 3 ? 'production' : 'recognition'; },

  grade(l, id, result) { // 'ok' | 'mid' | 'ko'
    const wf = Store.state.settings.weekend_freeze;
    const c = SRS.ensureCard(l, id);
    if (result === 'ok') {
      c.hesit_streak = 0;
      if (c.box === 6) { c.due = U.dueDate(35, wf); return; } // entretien
      let next = c.box + 1;
      if (c.was_learned && c.box >= 1 && c.box <= 4) next = Math.min(c.box + 2, 6); // ré-apprentissage accéléré
      c.box = Math.min(next, 6);
      if (c.box === 6) { c.due = U.dueDate(35, wf); }
      else if (c.box === 3) { c.due = U.dueDate(3, wf); } // falaise de production : 1re échéance raccourcie
      else { c.due = U.dueDate(SRS.INTERVALS[c.box], wf); }
    } else if (result === 'mid') {
      c.hesit_streak = (c.hesit_streak || 0) + 1;
      if (c.hesit_streak >= 2 && c.box > 1) { c.box -= 1; c.hesit_streak = 0; }
      const half = Math.max(1, Math.round((SRS.INTERVALS[Math.min(c.box, 5)] || 1) / 2));
      c.due = U.dueDate(half, wf);
    } else {
      if (c.box >= 3 || c.box === 6) c.was_learned = true;
      c.lapses = (c.lapses || 0) + 1;
      c.hesit_streak = 0;
      c.box = c.box === 6 ? 3 : 1; // échec en entretien → B3, sinon B1
      c.due = U.dueDate(c.box === 3 ? 3 : 1, wf);
    }
  },

  // « tester pour passer » : les cartes du module entrent directement en B3 (moteur §6.2)
  grantB3(l, ids) {
    const wf = Store.state.settings.weekend_freeze;
    ids.forEach(id => {
      const c = SRS.ensureCard(l, id);
      c.box = 3; c.due = U.dueDate(3, wf);
    });
  },

  counts(l) {
    const s = Store.lang(l).srs;
    let learning = 0, acquired = 0;
    Object.values(s).forEach(c => { if (c.box === 6) acquired++; else if (c.box >= 1) learning++; });
    return { learning, acquired };
  },
};
