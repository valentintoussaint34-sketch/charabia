/* Charabia — banque d'erreurs et consolidation (moteur §4, v1.1) */
const Bank = {
  LEECH_LESSON: 3,   // 3e échec cumulé → re-montrer la leçon
  LEECH_SUSPEND: 5,  // 5e échec → suspendu (reviendra au bilan/rattrapage)
  CONSOLID_MAX: 3,   // max consolidations par session

  // entrée en banque après un échec (moteur §4.1)
  fail(l, stepId) {
    const L = Store.lang(l);
    const e = L.bank[stepId] || { successes: 0, fails_total: 0, next_due_session: 0, evictions: 0, suspended: false };
    e.fails_total += 1;
    e.successes = 0;
    e.next_due_session = L.session_counter + 1; // rejeu à la session suivante
    e.suspended = e.fails_total >= Bank.LEECH_SUSPEND;
    L.bank[stepId] = e;
  },

  // réussite d'un rejeu (moteur §4.2)
  replaySuccess(l, stepId) {
    const L = Store.lang(l);
    const e = L.bank[stepId];
    if (!e) return;
    e.successes += 1;
    if (e.successes >= 2) {
      delete L.bank[stepId];
      // sortie vers la consolidation 7 j / 21 j — un item raté mérite un suivi long
      L.consolidation[stepId] = { next: U.dueDate(7, Store.state.settings.weekend_freeze), stage: 1 };
    } else {
      // 2e rejeu deux sessions plus tard : la session EN COURS porte le n° counter+1,
      // donc « +2 sessions » = counter+3
      e.next_due_session = L.session_counter + 3;
    }
  },

  // rejeux dus pour la session en cours
  dueReplays(l) {
    const L = Store.lang(l);
    const next = L.session_counter + 1; // la session qui démarre portera ce numéro
    return Object.keys(L.bank)
      .filter(id => !L.bank[id].suspended && L.bank[id].next_due_session <= next)
      .sort((a, b) => (L.bank[b].evictions - L.bank[a].evictions) || (L.bank[a].next_due_session - L.bank[b].next_due_session));
  },

  needsLesson(l, stepId) {
    const e = Store.lang(l).bank[stepId];
    return e && e.fails_total >= Bank.LEECH_LESSON;
  },

  // consolidation : entrée échantillonnée (réussites liées au grammar_focus, moteur §4.3)
  addConsolidation(l, stepId) {
    const L = Store.lang(l);
    if (L.bank[stepId] || L.consolidation[stepId]) return;
    L.consolidation[stepId] = { next: U.dueDate(7, Store.state.settings.weekend_freeze), stage: 1 };
  },
  dueConsolidations(l) {
    const L = Store.lang(l);
    const today = U.todayKey();
    return Object.keys(L.consolidation)
      .filter(id => L.consolidation[id].next <= today)
      .slice(0, Bank.CONSOLID_MAX);
  },
  consolidationResult(l, stepId, ok) {
    const L = Store.lang(l);
    const c = L.consolidation[stepId];
    if (!c) return;
    if (!ok) { delete L.consolidation[stepId]; Bank.fail(l, stepId); return; }
    if (c.stage === 1) { c.stage = 2; c.next = U.dueDate(21, Store.state.settings.weekend_freeze); }
    else delete L.consolidation[stepId]; // définitivement sorti
  },

  // items suspendus (leeches) à réinjecter dans un rattrapage/bilan
  suspended(l) {
    const L = Store.lang(l);
    return Object.keys(L.bank).filter(id => L.bank[id].suspended);
  },
  unsuspend(l, stepId) {
    const e = Store.lang(l).bank[stepId];
    if (e) { e.suspended = false; e.fails_total = 0; e.next_due_session = Store.lang(l).session_counter + 1; }
  },

  activeCount(l) {
    return Object.keys(Store.lang(l).bank).filter(id => !Store.lang(l).bank[id].suspended).length;
  },
};
