/* Charabia — contenu, composeur de session et exécution des exercices */

/* ---------- accès au contenu ---------- */
const Content = {
  modules(l) { return (CHARABIA_CONTENT[l] || []).slice().sort((a, b) => a.order - b.order); },
  module(l, id) { return Content.modules(l).find(m => m.id === id); },
  vocab(l, cardId) {
    for (const m of Content.modules(l)) {
      const v = (m.vocab || []).find(v => v.id === cardId);
      if (v) return v;
    }
    return null;
  },
  stepId(modId, si, stepIdx) { return `${modId}-s${si + 1}-step${String(stepIdx + 1).padStart(2, '0')}`; },
  // résout 'en-01-s2-step07' (+ '-q2' éventuel) → {module, si, step, qIdx}
  resolve(l, stepId) {
    const m = stepId.match(/^(.*)-s(\d+)-step(\d+)(?:-q(\d+))?$/);
    if (!m) return null;
    const mod = Content.module(l, m[1]);
    if (!mod) return null;
    const sess = mod.sessions[Number(m[2]) - 1];
    const step = sess && sess.steps[Number(m[3]) - 1];
    if (!step) return null;
    return { module: mod, si: Number(m[2]) - 1, step, qIdx: m[4] ? Number(m[4]) - 1 : null };
  },
  // la leçon la plus proche avant un step (pour la règle anti-boucle)
  lessonFor(l, stepId) {
    const r = Content.resolve(l, stepId);
    if (!r) return null;
    const steps = r.module.sessions[r.si].steps;
    const idx = steps.indexOf(r.step);
    for (let i = idx; i >= 0; i--) if (steps[i].type === 'lesson') return steps[i];
    for (const s of r.module.sessions) for (const st of s.steps) if (st.type === 'lesson') return st;
    return null;
  },
  currentModule(l) {
    const L = Store.lang(l);
    const mods = Content.modules(l);
    for (const m of mods) {
      const st = L.modules[m.id];
      if (!st || st.status !== 'done') return m;
    }
    return null; // bloc terminé
  },
  blockDone(l) { return Content.currentModule(l) === null; },
};

/* ---------- composition de session (moteur §4.4, §5) ---------- */
const Composer = {
  revisionItems(l) {
    const items = [];
    SRS.dueCards(l).slice(0, SRS.MAX_DUE_PER_SESSION).forEach(id => items.push({ kind: 'card', id }));
    SRS.acquiredSample(l).forEach(id => items.push({ kind: 'card', id, maintenance: true }));
    const replays = Bank.dueReplays(l);
    replays.slice(0, 15).forEach(id => items.push({ kind: 'replay', id }));
    // évincés : restent dus et prioritaires à la prochaine session (moteur §4.4)
    replays.slice(15).forEach(id => { const e = Store.lang(l).bank[id]; if (e) e.evictions++; });
    Bank.dueConsolidations(l).forEach(id => items.push({ kind: 'consol', id }));
    return items;
  },
  moduleItems(l) {
    const mod = Content.currentModule(l);
    if (!mod) return { items: [], mod: null };
    const L = Store.lang(l);
    const st = L.modules[mod.id] || (L.modules[mod.id] = { status: 'in_progress', session: 0, step: 0 });
    const si = st.session;
    const sess = mod.sessions[si];
    if (!sess) return { items: [], mod };
    const isBilan = !!sess.is_assessment;
    // bilan raté : d'abord la session de rattrapage, une seule fois (moteur §6.1)
    if (isBilan && st.retry_items && st.retry_items.length && !st.retry_done) {
      const items = [];
      st.retry_items.forEach(id => {
        const les = Content.lessonFor(l, id);
        if (les && !items.some(i => i.lessonRef === les)) items.push({ kind: 'lesson', lessonRef: les, moduleId: mod.id });
        items.push({ kind: 'retry', id });
      });
      Bank.suspended(l).forEach(id => items.push({ kind: 'retry', id, leech: true }));
      return { items, mod, rattrapage: true };
    }
    // rattrapage fait mais re-passage au plus tôt le lendemain → révisions seules aujourd'hui
    if (isBilan && st.retry_after && U.todayKey() < st.retry_after) {
      return { items: [], mod, waiting: true };
    }
    const items = [];
    // un bilan se (re)passe toujours en entier, jamais repris au milieu
    for (let i = isBilan ? 0 : st.step; i < sess.steps.length; i++) {
      items.push({ kind: 'step', moduleId: mod.id, si, stepIdx: i, bilan: isBilan });
    }
    return { items, mod, bilan: isBilan, si };
  },
  compose(l, mode) { // mode: 'full' | 'express' | 'blockbilan'
    if (mode === 'blockbilan') return { items: Composer.blockBilanItems(l), mode };
    const rev = Composer.revisionItems(l);
    if (mode === 'express') return { items: rev, mode };
    const m = Composer.moduleItems(l);
    // dédoublonnage : un item déjà rejoué en phase de révision ne se rejoue pas dans le rattrapage
    const revIds = new Set(rev.filter(i => i.kind === 'replay' || i.kind === 'consol').map(i => i.id));
    const mItems = m.items.filter(i => i.kind !== 'retry' || !revIds.has(i.id));
    // un oral reporté (« je ne pouvais pas parler ») max par session, avant le module
    const later = (Store.lang(l).speaking_later || []).slice(0, 1).map(id => ({ kind: 'speaklater', id }));
    return { items: rev.concat(later, mItems), mode, mod: m.mod, bilan: m.bilan, rattrapage: m.rattrapage, waiting: m.waiting, si: m.si };
  },
  // bilan de bloc : ~20 items tirés des 6 modules, priorité aux anciens de la banque (moteur §6.3)
  blockBilanItems(l) {
    const L = Store.lang(l);
    const pool = [];
    Content.modules(l).forEach(mod => mod.sessions.forEach((s, si) => s.steps.forEach((st, i) => {
      const base = Content.stepId(mod.id, si, i);
      if (['qcm', 'gap_fill', 'error_hunt', 'translation', 'matching'].includes(st.type)) {
        pool.push({ id: base, hadError: !!(L.bank[base] || L.consolidation[base]) });
      } else if ((st.type === 'reading' || st.type === 'listening') && st.questions) {
        st.questions.forEach((q, qi) => {
          const id = base + '-q' + (qi + 1);
          pool.push({ id, hadError: !!(L.bank[id] || L.consolidation[id]) });
        });
      }
    })));
    const withErr = U.shuffle(pool.filter(p => p.hadError)).slice(0, 10);
    const rest = U.shuffle(pool.filter(p => !p.hadError)).slice(0, 20 - withErr.length);
    const items = withErr.concat(rest).map(p => ({ kind: 'retry', id: p.id, blockbilan: true }));
    // + un writing et un speaking tirés des modules (moteur §6.3), hors score automatique
    const prods = { writing: [], speaking: [] };
    Content.modules(l).forEach(mod => mod.sessions.forEach((s, si) => s.steps.forEach((st, i) => {
      if (prods[st.type]) prods[st.type].push(Content.stepId(mod.id, si, i));
    })));
    if (prods.writing.length) items.push({ kind: 'retry', id: U.shuffle(prods.writing)[0], blockbilan: true });
    if (prods.speaking.length) items.push({ kind: 'retry', id: U.shuffle(prods.speaking)[0], blockbilan: true });
    return items;
  },
};

/* ---------- exécution ---------- */
const Session = {
  cur: null,

  start(l, mode) {
    const plan = Composer.compose(l, mode);
    if (!plan.items.length) { U.toast(mode === 'express' ? 'Rien à réviser pour le moment 🎉' : 'Rien à faire aujourd\'hui !'); return; }
    document.documentElement.style.setProperty('--accent', l === 'en' ? 'var(--en)' : 'var(--es)');
    document.documentElement.style.setProperty('--accent-soft', l === 'en' ? 'var(--en-soft)' : 'var(--es-soft)');
    Session.cur = {
      lang: l, mode, plan, idx: 0, t0: Date.now(),
      results: [], // {id, ok, phase, autocorrect, firstTry}
      consolAdded: 0, cardsReviewed: 0, cardsOk: 0, newCards: 0, bankOut: 0, bankIn: 0,
    };
    Session.next();
  },

  quit() {
    TTS.stop();
    if (typeof Render !== 'undefined') Render.releaseMic();
    Session.cur = null;
    document.documentElement.style.setProperty('--accent', 'var(--en)');
    Screens.home();
  },

  next() {
    const c = Session.cur;
    if (!c) return Screens.home();
    if (c.idx >= c.plan.items.length) return Session.finish();
    const item = c.plan.items[c.idx];
    Render.item(item);
  },
  advance() {
    const c = Session.cur;
    c.idx++;
    // garde-fou durée (moteur §5) : au-delà de la cible +10 min, on propose de couper
    // au prochain point d'étape — la session est comptée, la suite attendra demain.
    // Jamais pendant un bilan/rattrapage : ceux-là se finissent d'une traite.
    if (!c.overtimeAsked && c.mode === 'full' && !c.plan.bilan && !c.plan.rattrapage
        && c.idx < c.plan.items.length && c.plan.items.slice(c.idx).some(i => i.kind === 'step')) {
      const elapsed = Math.round((Date.now() - c.t0) / 60000);
      if (elapsed >= (Store.state.settings.session_min || 50) + 10) {
        c.overtimeAsked = true;
        Screens.modal(`<h2>Déjà ${elapsed} minutes 💪</h2>
          <p>Tu peux t'arrêter ici : la session d'aujourd'hui est comptée, et le module reprendra exactement là demain — sans pénalité.</p>
          <button class="btn" onclick="Screens.closeModal(); Session.finish()">🛑 S'arrêter pour aujourd'hui</button>
          <button class="btn ghost mt" onclick="Screens.closeModal(); Session.next()">Continuer sur ma lancée</button>`);
        return;
      }
    }
    Session.next();
  },

  progress() {
    const c = Session.cur;
    return { pct: Math.round(100 * c.idx / c.plan.items.length), label: `${c.idx + 1} / ${c.plan.items.length}` };
  },

  /* résultat d'un exercice (hors flashcards) */
  record(item, stepId, ok, autocorrect) {
    const c = Session.cur, l = c.lang;
    c.results.push({ id: stepId, ok, autocorrect, item });
    if (item.kind === 'retry' && item.leech) {
      // leech : testé AVANT la branche banque (l'item suspendu y figure encore)
      if (ok) Bank.unsuspend(l, stepId); else Bank.fail(l, stepId);
    } else if (item.kind === 'replay' || (item.kind === 'retry' && Store.lang(l).bank[stepId])) {
      if (ok) { Bank.replaySuccess(l, stepId); if (!Store.lang(l).bank[stepId]) c.bankOut++; }
      else Bank.fail(l, stepId);
    } else if (item.kind === 'consol') {
      Bank.consolidationResult(l, stepId, ok);
    } else if (!item.blockbilan) {
      if (!ok) { Bank.fail(l, stepId); c.bankIn++; }
      else if (item.kind === 'step' && !item.bilan) {
        // consolidation échantillonnée à l'entrée : réussites de la phase leçon (grammar_focus)
        const r = Content.resolve(l, stepId.replace(/-q\d+$/, ''));
        if (r && r.step.phase === 'lesson' && c.consolAdded < Bank.CONSOLID_MAX) {
          Bank.addConsolidation(l, stepId); c.consolAdded++;
        }
      }
    }
    Store.save();
  },

  /* fin d'un step de module → avancer le curseur sauvegardé */
  stepDone(item) {
    if (item.kind !== 'step') return;
    const L = Store.lang(Session.cur.lang);
    const st = L.modules[item.moduleId];
    if (st && st.session === item.si) st.step = item.stepIdx + 1;
    Store.save();
  },

  finish() {
    TTS.stop();
    const c = Session.cur, l = c.lang;
    const L = Store.lang(l);
    const mins = Math.max(1, Math.round((Date.now() - c.t0) / 60000));
    const auto = c.results.filter(r => r.autocorrect);
    const score = auto.length ? auto.filter(r => r.ok).length / auto.length : null;

    L.session_counter++;
    L.sessions_log.push({ n: L.session_counter, date: U.todayKey(), min: mins, score });
    L.last_session_date = U.todayKey();

    let bilanResult = null;
    if (c.plan.mode === 'blockbilan') {
      const passed = score !== null && score >= 0.8;
      L.block1_bilan = { score, passed, date: U.todayKey() };
      if (!passed) L.block1_bilan.retry_after = U.addDays(U.todayKey(), 1);
      bilanResult = { type: 'block', passed, score };
      if (passed) Confetti.fire(true);
    } else if (c.plan.bilan && c.plan.mod) {
      const mod = c.plan.mod;
      const st = L.modules[mod.id];
      const pass = mod.sessions[c.plan.si].pass_score || 0.8;
      // score du bilan : uniquement les items autocorrectifs DU bilan (moteur §6.1)
      const bAuto = c.results.filter(r => r.autocorrect && r.item.kind === 'step' && r.item.bilan);
      const bScore = bAuto.length ? bAuto.filter(r => r.ok).length / bAuto.length : null;
      if (bScore !== null && bScore >= pass) {
        st.status = 'done'; st.bilan_score = bScore;
        delete st.retry_after; delete st.retry_items; delete st.retry_done;
        bilanResult = { type: 'module', passed: true, score: bScore };
        Confetti.fire(false);
      } else if (bScore !== null) {
        st.retry_after = U.addDays(U.todayKey(), 1);
        st.retry_items = bAuto.filter(r => !r.ok).map(r => r.id);
        st.retry_done = false;
        st.step = 0; // le bilan se refera en entier
        bilanResult = { type: 'module', passed: false, score: bScore };
      } else {
        st.step = 0; // aucun item de bilan joué (reprise incohérente) : on refera le bilan en entier
      }
    } else if (c.plan.mod && !c.plan.rattrapage && !c.plan.waiting) {
      // session de module normale terminée → session suivante
      const st = L.modules[c.plan.mod.id];
      const sess = st && c.plan.mod.sessions[st.session];
      if (st && sess && st.step >= sess.steps.length) { st.session++; st.step = 0; }
    } else if (c.plan.rattrapage && c.plan.mod) {
      // rattrapage fait : le bilan se re-tente dès demain (moteur §6.1)
      const st = L.modules[c.plan.mod.id];
      if (st) st.retry_done = true;
    }

    const streak = Store.streak();
    if ([7, 14, 30, 60, 100].includes(streak)) Confetti.fire(true);
    Store.save();
    if (typeof Sync !== 'undefined') Sync.push().catch(() => {}); // sync multi-appareils, silencieux
    Screens.results({ lang: l, mins, score, session: c, bilanResult, streak });
    Session.cur = null;
    document.documentElement.style.setProperty('--accent', 'var(--en)');
    document.documentElement.style.setProperty('--accent-soft', 'var(--en-soft)');
  },
};
