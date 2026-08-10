/* Charabia — écrans hors session */
const Screens = {
  root() { return document.getElementById('root'); },

  ICONS: {
    stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>',
    gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>',
  },

  // navigation basse permanente (style food app), sauf pendant les sessions
  nav(active) {
    const items = [
      ['home', 'Accueil', 'Screens.home()'],
      ['stats', 'Stats', 'Screens.stats()'],
      ['book', 'Anti-sèche', 'Screens.cheatsheet()'],
      ['gear', 'Réglages', 'Screens.settings()'],
    ];
    return `<nav class="bottomnav">${items.map(([ic, label, fn]) =>
      `<button class="${active === ic ? 'on' : ''}" aria-label="${label}" onclick="${fn}">${Screens.ICONS[ic]}<span>${label}</span></button>`).join('')}</nav>`;
  },

  modal(html) {
    document.getElementById('modal-root').innerHTML =
      `<div class="modal-bg" onclick="if(event.target===this)Screens.closeModal()"><div class="modal">${html}</div></div>`;
  },
  closeModal() { document.getElementById('modal-root').innerHTML = ''; },

  /* ---------- accueil ---------- */
  home() {
    TTS.stop();
    Screens.current = 'home';
    const s = Store.state;
    const streak = Store.streak();
    const corrected = Gemini.correctedUnseen();
    const exportDays = Store.daysSinceExport();
    const html = `
      <div class="greet">
        <div>
          <h1>${Screens.greeting()}</h1>
          <div class="sub">Prêt pour ta session du jour ?</div>
        </div>
        <span class="right"><span class="flame">🔥 ${streak}</span><img class="avatar" src="icons/logo.png" alt=""></span>
      </div>
      ${corrected.length ? `<div class="notice" onclick="Screens.showCorrections()" style="cursor:pointer">✨ <b>${corrected.length} correction${corrected.length > 1 ? 's' : ''} IA arrivée${corrected.length > 1 ? 's' : ''}</b> — touche pour lire</div>` : ''}
      ${Screens.langCard('en')}
      ${Screens.langCard('es')}
      ${(exportDays === null || exportDays > 7) ? `<div class="savebar">💾 ${exportDays === null ? 'Aucune sauvegarde exportée' : 'Dernière sauvegarde : il y a ' + exportDays + ' j'} <u onclick="Store.exportData(); Screens.home()">Exporter</u></div>` : ''}
      ${Screens.nav('home')}`;
    Screens.root().innerHTML = html;
    window.scrollTo(0, 0);
  },

  // salutation qui change selon l'heure, en alternant tes deux langues cibles
  greeting() {
    const h = new Date().getHours();
    const pairs = h < 12 ? ['Good morning', '¡Buenos días'] : h < 18 ? ['Good afternoon', '¡Buenas tardes'] : ['Good evening', '¡Buenas noches'];
    const pick = pairs[Math.floor(Math.random() * 2)];
    return pick.startsWith('¡') ? `${pick}, Valentín! 👋` : `${pick}, Valentin 👋`;
  },

  langCard(l) {
    const L = Store.lang(l);
    const mod = Content.currentModule(l);
    const due = SRS.dueCards(l).length;
    const replays = Bank.dueReplays(l).length;
    const consol = Bank.dueConsolidations(l).length;
    const counts = SRS.counts(l);
    const name = l === 'en' ? '🇬🇧 Anglais' : '🇪🇸 Espagnol';
    const chip = l === 'en' ? 'B1 → B2' : 'A2 → B1';
    const away = Store.daysSinceLastSession(l);
    const avalanche = away !== null && away > 3 && due > 40;
    let modline, mainBtn, pct = 0;
    if (mod) {
      const st = L.modules[mod.id] || { session: 0 };
      const sess = mod.sessions[st.session];
      const isBilan = sess && sess.is_assessment;
      const rattrapage = isBilan && st.retry_items && st.retry_items.length && !st.retry_done;
      const waiting = isBilan && !rattrapage && st.retry_after && U.todayKey() < st.retry_after;
      modline = `Module ${mod.order} · ${U.esc(mod.title_fr || mod.title)} — ${rattrapage ? '🎯 Rattrapage' : waiting ? '🕐 Bilan demain' : (isBilan ? '🏁 Bilan' : 'Session ' + (st.session + 1) + '/4')}`;
      pct = Math.round(100 * ((Content.modules(l).filter(m => (L.modules[m.id] || {}).status === 'done').length) / Content.modules(l).length));
      const btnLabel = rattrapage ? '🎯 Session de rattrapage' : waiting ? 'Réviser en attendant' : (isBilan ? '🏁 Passer le bilan' : 'Commencer ma session');
      mainBtn = `<button class="btn ${l}" onclick="Session.start('${l}','full')">${btnLabel}</button>`;
    } else if (!L.block1_bilan || !L.block1_bilan.passed) {
      const bb = L.block1_bilan;
      const bbWait = bb && bb.retry_after && U.todayKey() < bb.retry_after;
      modline = bbWait ? 'Bilan de bloc raté — re-passage demain' : 'Bloc 1 terminé — bilan de bloc à passer !';
      pct = 100;
      mainBtn = bbWait
        ? `<button class="btn ${l}" onclick="Session.start('${l}','express')">⚡ Réviser en attendant</button>`
        : `<button class="btn ${l}" onclick="Session.start('${l}','blockbilan')">🏆 Bilan du bloc 1</button>`;
    } else {
      modline = 'Bloc 1 validé 🎉 — le bloc 2 arrive bientôt';
      pct = 100;
      mainBtn = `<button class="btn ${l}" onclick="Session.start('${l}','express')">⚡ Entretenir mes acquis</button>`;
    }
    const flag = l === 'en' ? '🇬🇧' : '🇪🇸';
    const langName = l === 'en' ? 'Anglais' : 'Espagnol';
    return `
      <div class="langcard">
        <div class="cardhero ${l}">
          <span class="bigflag">${flag}</span>
          <div class="herotxt"><span class="lang">${langName}</span><div class="modline">${modline}</div></div>
          <span class="chip ${l}">${chip}</span>
        </div>
        <div class="pbar"><i style="width:${pct}%; background:var(--${l})"></i></div>
        <div class="duebox">
          <div class="due"><b>${due}</b><span>cartes dues</span></div>
          <div class="due"><b>${replays}</b><span>erreurs à rejouer</span></div>
          <div class="due"><b>${consol}</b><span>consolidations</span></div>
        </div>
        ${avalanche ? `<div class="notice" style="cursor:pointer" onclick="Session.start('${l}','express')">😅 ${away} jours d'absence et ${due} cartes en attente — touche ici pour une révision express !</div>` : ''}
        <div class="btnrow">
          ${mainBtn}
          <button class="btn ghost small" onclick="Session.start('${l}','express')" title="Révision express" aria-label="Révision express">⚡</button>
        </div>
        <div class="cardfoot">
          <span class="hint">${counts.learning} mots en cours · ${counts.acquired} acquis</span>
          <button class="linkbtn ${l}" onclick="Screens.moduleList('${l}')">Voir les modules →</button>
        </div>
      </div>`;
  },

  moduleList(l) {
    const L = Store.lang(l);
    const rows = Content.modules(l).map(m => {
      const st = L.modules[m.id];
      const status = st ? st.status : null;
      const cur = Content.currentModule(l);
      const label = status === 'done' ? `<span class="st" style="color:var(--ok)">✓ ${st.bilan_score ? Math.round(st.bilan_score * 100) + ' %' : 'validé'}</span>`
        : (cur && cur.id === m.id) ? '<span class="st" style="color:var(--' + l + ')">● en cours</span>'
        : '<span class="st">🔒</span>';
      const testout = (!status || status !== 'done') && (!cur || cur.id !== m.id || !st || st.session === 0)
        ? `<button class="btn ghost small" onclick="Screens.closeModal(); Session.startTestOut('${l}','${m.id}')">Tester pour passer</button>` : '';
      return `<div class="modrow ${(!status && (!cur || cur.id !== m.id)) ? 'locked' : ''}">
        <span>${m.order}. ${U.esc(m.title_fr || m.title)}</span><span style="display:flex;gap:6px;align-items:center">${testout}${label}</span></div>`;
    }).join('');
    Screens.modal(`<h2>${l === 'en' ? '🇬🇧 Anglais' : '🇪🇸 Espagnol'} — Bloc 1</h2>
      <p>« Tester pour passer » : tente directement le bilan d'un module ; à 90 % ou plus, il est validé sans le faire (moteur §6.2).</p>
      <div class="modlist">${rows}</div>
      <button class="btn ghost mt" onclick="Screens.closeModal()">Fermer</button>`);
  },

  showCorrections() {
    const items = Gemini.correctedUnseen();
    const html = items.map(({ lang, w }) => {
      const r = w.result || {};
      return `<div class="card-panel mb">
        <div class="consigne">${lang === 'en' ? '🇬🇧' : '🇪🇸'} ${U.esc(w.prompt || '')}</div>
        <div class="ai-note"><span class="score">${U.esc(String(r.score ?? '–'))}/10</span><span>${U.esc(r.summary || '')}</span></div>
        ${(r.errors || []).map(e => `<div class="fix"><b>${U.esc(e.wrong)}</b> → <i>${U.esc(e.right)}</i>. ${U.esc(e.why)}</div>`).join('')}
      </div>`;
    }).join('');
    items.forEach(({ w }) => w.seen = true);
    Store.save();
    Screens.modal(`<h2>✨ Tes corrections</h2>${html}<button class="btn mt" onclick="Screens.closeModal(); Screens.home()">OK</button>`);
  },

  /* ---------- résultats ---------- */
  results(r) {
    Screens.current = 'results';
    const pct = r.score !== null ? Math.round(r.score * 100) : null;
    const c = r.session;
    let headline = 'Belle session !', sub = '';
    if (r.bilanResult) {
      if (r.bilanResult.type === 'module') {
        headline = r.bilanResult.passed ? '🎉 Module validé !' : 'Presque !';
        sub = r.bilanResult.passed ? 'Le module suivant est débloqué.' : 'Une session de rattrapage t\'attend, puis tu repasseras le bilan demain — c\'est le meilleur moment pour ancrer.';
      } else {
        headline = r.bilanResult.passed ? '🏆 Bloc 1 validé !' : 'Le bloc résiste encore';
        sub = r.bilanResult.passed ? 'Énorme ! Le bloc 2 arrive bientôt.' : 'Rattrapage ciblé puis re-passage demain.';
      }
    }
    const ringColor = pct === null ? 'var(--line)' : (pct >= 80 ? 'var(--ok)' : pct >= 60 ? 'var(--warn)' : 'var(--ko)');
    Screens.root().innerHTML = `
      <div class="bigscore">
        <div class="ring" style="background:conic-gradient(${ringColor} 0 ${pct ?? 0}%, var(--line) ${pct ?? 0}% 100%)"><i>${pct !== null ? pct + ' %' : '✓'}</i></div>
        <h2>${headline}</h2>
        <div class="sub">${r.mins} min · ${r.lang === 'en' ? 'Anglais' : 'Espagnol'}${sub ? '<br>' + sub : ''}</div>
      </div>
      <div class="stats">
        ${c.cardsReviewed ? `<div class="stat"><span>🃏 Cartes révisées</span><b>${c.cardsReviewed} · dont ${c.cardsOk} sues</b></div>` : ''}
        ${c.newCards ? `<div class="stat"><span>🆕 Nouveaux mots</span><b>${c.newCards}</b></div>` : ''}
        ${c.bankOut ? `<div class="stat"><span>🔓 Erreurs sorties de la banque</span><b>${c.bankOut}</b></div>` : ''}
        ${c.bankIn ? `<div class="stat"><span>📌 À rejouer à la prochaine session</span><b>${c.bankIn}</b></div>` : ''}
        <div class="stat"><span>🔥 Streak</span><b>${r.streak} jour${r.streak > 1 ? 's' : ''}</b></div>
      </div>
      <button class="btn" onclick="Screens.home()">Terminer</button>`;
    window.scrollTo(0, 0);
  },

  /* ---------- statistiques ---------- */
  stats() {
    Screens.current = 'stats';
    const weeks = 12;
    const today = U.todayKey();
    const byDay = {};
    ['en', 'es'].forEach(l => Store.lang(l).sessions_log.forEach(s => {
      byDay[s.date] = (byDay[s.date] || 0) + (s.min || 0);
    }));
    // heatmap : colonnes = semaines, lignes = lun→dim ((getDay()+6)%7 : lundi = 0, corrige le dimanche)
    const start = U.parseKey(today);
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - (weeks - 1) * 7); // lundi il y a 11 semaines
    let heat = '';
    for (let w = 0; w < weeks; w++) {
      let col = '<div class="heatweek">';
      for (let d = 0; d < 7; d++) {
        const dt = new Date(start); dt.setDate(start.getDate() + w * 7 + d);
        const k = U.todayKey(dt);
        const m = byDay[k] || 0;
        const lvl = m === 0 ? '' : m < 30 ? 'l1' : m < 70 ? 'l2' : 'l3';
        col += `<div class="heatcell ${lvl}" title="${k} : ${m} min"></div>`;
      }
      heat += col + '</div>';
    }
    // barres : minutes des 8 dernières semaines
    const weekMins = [];
    for (let w = 7; w >= 0; w--) {
      const monday = U.parseKey(today);
      monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7) - w * 7);
      let tot = 0;
      for (let d = 0; d < 7; d++) {
        const dt = new Date(monday); dt.setDate(monday.getDate() + d);
        tot += byDay[U.todayKey(dt)] || 0;
      }
      weekMins.push(tot);
    }
    const maxW = Math.max(...weekMins, 60);
    const langStats = l => {
      const L = Store.lang(l);
      const c = SRS.counts(l);
      const done = Content.modules(l).filter(m => (L.modules[m.id] || {}).status === 'done').length;
      const tot = L.sessions_log.reduce((n, s) => n + (s.min || 0), 0);
      return `<div class="sect">${l === 'en' ? '🇬🇧 Anglais' : '🇪🇸 Espagnol'}</div>
        <div class="stat"><span>Modules validés</span><b>${done} / ${Content.modules(l).length}</b></div>
        <div class="stat"><span>Mots en apprentissage / acquis</span><b>${c.learning} / ${c.acquired}</b></div>
        <div class="stat"><span>Erreurs actives en banque</span><b>${Bank.activeCount(l)}</b></div>
        <div class="stat"><span>Temps total</span><b>${Math.floor(tot / 60)} h ${String(tot % 60).padStart(2, '0')}</b></div>`;
    };
    Screens.root().innerHTML = `
      <div class="pagetitle"><h1>📊 Statistiques</h1></div>
      <div class="sect">Assiduité — 12 dernières semaines</div>
      <div class="card-panel"><div class="heatmap">${heat}</div><div class="hint">du plus clair (peu) au plus foncé (70 min et +)</div></div>
      <div class="sect">Minutes par semaine</div>
      <div class="card-panel">
        <div class="bars">${weekMins.map(m => `<div class="bar"><i style="height:${Math.round(100 * m / maxW)}%"></i></div>`).join('')}</div>
        <div class="barlabels">${weekMins.map((m, i) => `<span>${i === 7 ? 'cette sem.' : ''}</span>`).join('')}</div>
      </div>
      ${langStats('en')}${langStats('es')}
      <div class="stat mt"><span>🔥 Streak actuel</span><b>${Store.streak()} jours</b></div>
      ${Screens.nav('stats')}`;
    window.scrollTo(0, 0);
  },

  /* ---------- anti-sèche ---------- */
  cheatsheet() {
    Screens.current = 'cheatsheet';
    const items = [];
    ['en', 'es'].forEach(l => {
      const L = Store.lang(l);
      Content.modules(l).forEach(mod => {
        const st = L.modules[mod.id];
        const cur = Content.currentModule(l);
        const visible = (st && st.status === 'done') || (cur && cur.id === mod.id);
        if (!visible) return;
        mod.sessions.forEach(s => s.steps.forEach(step => {
          if (step.type === 'lesson') items.push({ lang: l, mod, step });
        }));
      });
    });
    const render = filter => items
      .filter(it => !filter || (it.step.title + ' ' + (it.step.body_md || '')).toLowerCase().includes(filter.toLowerCase()))
      .map(it => `<details class="cheat-item"><summary>${it.lang === 'en' ? '🇬🇧' : '🇪🇸'} ${U.esc(it.step.title)} <span style="color:var(--muted);font-weight:400;font-size:12px">· module ${it.mod.order}</span></summary>
        <div class="lesson-body">${U.md(it.step.body_md)}</div></details>`).join('') || '<p class="hint">Aucune leçon ne correspond.</p>';
    Screens.root().innerHTML = `
      <div class="pagetitle"><h1>📖 Anti-sèche</h1></div>
      <input class="search" id="cs" placeholder="🔍 Chercher une règle… (ex. present perfect)">
      <div id="cslist">${render('')}</div>
      ${Screens.nav('book')}`;
    document.getElementById('cs').addEventListener('input', e => {
      document.getElementById('cslist').innerHTML = render(e.target.value);
    });
    window.scrollTo(0, 0);
  },

  /* ---------- réglages ---------- */
  settings() {
    Screens.current = 'settings';
    const s = Store.state.settings;
    const pending = Gemini.pendingCount();
    const failed = Gemini.failedCount();
    Screens.root().innerHTML = `
      <div class="pagetitle"><h1>⚙️ Réglages</h1></div>
      <div class="sect">Sessions</div>
      <div class="set">Durée cible
        <select id="dur">${[30, 45, 50, 60].map(d => `<option value="${d}" ${s.session_min === d ? 'selected' : ''}>${d} min</option>`).join('')}</select></div>
      <div class="set"><span>Week-ends gelés<br><span class="sub">streak et révisions en pause sam./dim.</span></span>
        <button class="toggle ${s.weekend_freeze ? 'on' : ''}" id="wk"></button></div>
      <div class="sect">Audio</div>
      <div class="set">Vitesse des voix
        <select id="rate">${[0.8, 0.9, 1.0, 1.1].map(r => `<option value="${r}" ${s.tts_rate_factor === r ? 'selected' : ''}>×${r}</option>`).join('')}</select></div>
      <div class="set"><span>Voix installées<br><span class="sub">si ✗ : réglages Android → Synthèse vocale → installer les voix hors ligne</span></span>
        <b>${TTS.hasVoice('en') ? 'EN ✓' : 'EN ✗'} · ${TTS.hasVoice('es') ? 'ES ✓' : 'ES ✗'}</b></div>
      <div class="sect">Intelligence artificielle</div>
      <div class="set"><span>Clé API Gemini<br><span class="sub">gratuite sur aistudio.google.com → « Get API key »</span></span>
        <input type="password" id="key" placeholder="AIza…" value="${U.esc(s.gemini_key)}"></div>
      <div class="set">Tester la connexion <button class="btn ghost small" id="test">Tester</button></div>
      ${pending ? `<div class="set">Corrections en attente <b>${pending} texte${pending > 1 ? 's' : ''}</b></div>` : ''}
      ${failed ? `<div class="set">Corrections échouées <button class="btn ghost small" id="retryf">Réessayer (${failed})</button></div>` : ''}
      <div class="sect">Synchronisation PC ↔ téléphone</div>
      <div class="set"><span>Jeton GitHub<br><span class="sub">github.com → Settings → Developer settings → Fine-grained tokens, permission « Gists » lecture/écriture — je peux te guider</span></span>
        <input type="password" id="ghtok" placeholder="github_pat_…" value="${U.esc(s.gh_token)}"></div>
      ${s.gh_token ? `<div class="set">Dernière synchro <b>${Sync.lastSyncLabel()}</b></div>
      <div class="set">Synchroniser maintenant <button class="btn ghost small" id="syncnow">🔄 Go</button></div>` : ''}
      <div class="sect">Données</div>
      <div class="set">Exporter ma sauvegarde <button class="btn ghost small" onclick="Store.exportData(); U.toast('Sauvegarde téléchargée 💾')">Exporter</button></div>
      <div class="set">Importer une sauvegarde <input type="file" id="imp" accept=".json" style="max-width:170px"></div>
      <div class="set"><span>Rappel quotidien<br><span class="sub">le plus fiable : une alarme Android à ton heure d'étude</span></span>⏰</div>
      <p class="hint mt">Charabia · version du ${U.esc(document.lastModified)} · tes données restent sur ton appareil.</p>
      ${Screens.nav('gear')}`;
    document.getElementById('dur').onchange = e => { s.session_min = Number(e.target.value); Store.save(); };
    document.getElementById('rate').onchange = e => { s.tts_rate_factor = Number(e.target.value); Store.save(); };
    document.getElementById('wk').onclick = e => { s.weekend_freeze = !s.weekend_freeze; e.target.classList.toggle('on'); Store.save(); };
    document.getElementById('key').onchange = e => { s.gemini_key = e.target.value.trim(); Store.save(); U.toast(s.gemini_key ? 'Clé enregistrée ✓' : 'Clé effacée'); };
    document.getElementById('test').onclick = async e => {
      if (!Gemini.hasKey()) return U.toast('Colle d\'abord ta clé API');
      e.target.textContent = '…';
      try { await Gemini.call('Réponds uniquement : OK', false); U.toast('✨ Connexion IA opérationnelle !'); }
      catch (err) {
        const m = String(err.message || err.name || err);
        const detail = m === 'quota' ? 'Quota atteint — réessaie plus tard'
          : m === 'http400' || m === 'http403' ? 'Clé refusée (' + m + ') — re-copie-la depuis aistudio.google.com (une clé neuve peut mettre quelques minutes à s\'activer)'
          : m === 'http404' ? 'Modèle introuvable (' + m + ') — dis-le à Claude'
          : m.includes('abort') || m === 'AbortError' ? 'Délai dépassé — vérifie ta connexion'
          : 'Échec (' + m + ') — vérifie la clé';
        U.toast(detail, 5000);
      }
      e.target.textContent = 'Tester';
    };
    document.getElementById('ghtok').onchange = e => {
      s.gh_token = e.target.value.trim(); Store.save();
      U.toast(s.gh_token ? 'Jeton enregistré ✓' : 'Jeton effacé');
      Screens.settings();
    };
    const sy = document.getElementById('syncnow');
    if (sy) sy.onclick = async () => {
      sy.textContent = '…';
      try { const r = await Sync.auto(); U.toast(r === 'pulled' ? '🔄 Progression récupérée depuis l\'autre appareil' : '🔄 Synchronisé'); }
      catch (e) { U.toast('Échec de synchro — vérifie le jeton'); }
      Screens.settings();
    };
    const rf = document.getElementById('retryf');
    if (rf) rf.onclick = async () => { rf.textContent = '…'; const n = await Gemini.retryFailed(); U.toast(n ? `✨ ${n} correction(s) récupérée(s)` : 'Toujours indisponible — réessaie plus tard'); Screens.settings(); };
    document.getElementById('imp').onchange = e => {
      if (!e.target.files[0]) return;
      Store.importData(e.target.files[0], ok => {
        U.toast(ok ? 'Sauvegarde restaurée ✓' : 'Fichier invalide');
        if (ok) Screens.home();
      });
    };
    window.scrollTo(0, 0);
  },

  /* ---------- onboarding ---------- */
  onboarding() {
    Screens.modal(`
      <div class="center"><img src="icons/icon-192.png" style="width:84px;border-radius:20px" alt=""></div>
      <h2 class="center">Bienvenue dans Charabia 🦜</h2>
      <p>Ton coach d'anglais et d'espagnol : 45-60 min par langue et par jour, avec un moteur de mémorisation qui fait revenir ce que tu rates.</p>
      <p><b>3 réglages pour bien démarrer :</b></p>
      <p>1️⃣ <b>Installe l'app</b> : menu du navigateur → « Ajouter à l'écran d'accueil ».<br>
      2️⃣ <b>Les voix hors ligne</b> : réglages Android → Synthèse vocale → télécharge les voix anglaise et espagnole.<br>
      3️⃣ <b>La correction IA</b> (optionnel) : crée une clé gratuite sur aistudio.google.com et colle-la dans ⚙️ Réglages.</p>
      <button class="btn" onclick="Store.state.onboarded = true; Store.save(); Screens.closeModal(); Screens.home()">C'est parti !</button>`);
  },
};

/* test-out : lance directement le bilan d'un module (moteur §6.2) */
Session.startTestOut = function (l, moduleId) {
  const mod = Content.module(l, moduleId);
  const si = mod.sessions.findIndex(s => s.is_assessment);
  if (si < 0) return;
  document.documentElement.style.setProperty('--accent', l === 'en' ? 'var(--en)' : 'var(--es)');
  document.documentElement.style.setProperty('--accent-soft', l === 'en' ? 'var(--en-soft)' : 'var(--es-soft)');
  const items = mod.sessions[si].steps.map((st, i) => ({ kind: 'testout', moduleId, si, stepIdx: i }))
    .filter(it => mod.sessions[si].steps[it.stepIdx].type !== 'flashcard_review');
  Session.cur = {
    lang: l, mode: 'testout', plan: { items, mode: 'testout', testoutMod: mod, si }, idx: 0, t0: Date.now(),
    results: [], consolAdded: 99, cardsReviewed: 0, cardsOk: 0, newCards: 0, bankOut: 0, bankIn: 0,
  };
  Session.next();
};
/* les items testout se rendent comme des steps mais sans toucher banque/SRS (moteur §4.1) */
const _origItem = Render.item;
Render.item = function (item) {
  if (item.kind === 'testout') {
    const mod = Content.module(Session.cur.lang, item.moduleId);
    const step = mod.sessions[item.si].steps[item.stepIdx];
    const stepId = Content.stepId(mod.id, item.si, item.stepIdx);
    return Render.exercise({ module: mod, si: item.si, step }, item, stepId, null, '🚀 Tester pour passer');
  }
  return _origItem(item);
};
const _origRecord = Session.record;
Session.record = function (item, stepId, ok, autocorrect) {
  if (item.kind === 'testout') { Session.cur.results.push({ id: stepId, ok, autocorrect, item }); return; }
  return _origRecord(item, stepId, ok, autocorrect);
};
const _origStepDone = Session.stepDone;
Session.stepDone = function (item) { if (item.kind === 'testout') return; return _origStepDone(item); };
const _origFinish = Session.finish;
Session.finish = function () {
  const c = Session.cur;
  if (c && c.plan.mode === 'testout') {
    const l = c.lang, mod = c.plan.testoutMod;
    const auto = c.results.filter(r => r.autocorrect);
    const score = auto.length ? auto.filter(r => r.ok).length / auto.length : 0;
    const L = Store.lang(l);
    if (score >= 0.9) {
      L.modules[mod.id] = { status: 'done', bilan_score: score, session: mod.sessions.length, step: 0, testout: true };
      SRS.grantB3(l, (mod.vocab || []).map(v => v.id));
      Confetti.fire(false);
      Store.save();
      Screens.results({ lang: l, mins: Math.max(1, Math.round((Date.now() - c.t0) / 60000)), score, session: c, bilanResult: { type: 'module', passed: true, score }, streak: Store.streak() });
    } else {
      Store.save();
      Screens.results({ lang: l, mins: Math.max(1, Math.round((Date.now() - c.t0) / 60000)), score, session: c, bilanResult: null, streak: Store.streak() });
      U.toast(`${Math.round(score * 100)} % — il faut 90 % pour sauter le module. Il t'attend !`);
    }
    Session.cur = null;
    document.documentElement.style.setProperty('--accent', 'var(--en)');
    document.documentElement.style.setProperty('--accent-soft', 'var(--en-soft)');
    return;
  }
  return _origFinish();
};
