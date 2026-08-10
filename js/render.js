/* Charabia — rendu des étapes de session */
const Render = {
  root() { return document.getElementById('root'); },
  _rec: null,

  // barre d'accents espagnols (clavier français oblige)
  accentBar(inputEl) {
    if (!Session.cur || Session.cur.lang !== 'es') return;
    const chars = ['á', 'é', 'í', 'ó', 'ú', 'ñ', 'ü', '¿', '¡'];
    const bar = U.el('<div class="accents">' + chars.map(c => `<button type="button" tabindex="-1">${c}</button>`).join('') + '</div>');
    bar.querySelectorAll('button').forEach(b => {
      b.onmousedown = e => e.preventDefault(); // garde le focus dans le champ
      b.onclick = () => {
        const s = inputEl.selectionStart ?? inputEl.value.length;
        const e2 = inputEl.selectionEnd ?? s;
        inputEl.setRangeText(b.textContent, s, e2, 'end');
        inputEl.focus();
      };
    });
    inputEl.parentNode.insertBefore(bar, inputEl);
  },

  // libère le micro si un enregistrement traîne (quit ou changement d'écran)
  releaseMic() {
    if (Render._rec) {
      try { if (Render._rec.recorder.state === 'recording') Render._rec.recorder.stop(); } catch (e) {}
      try { Render._rec.stream.getTracks().forEach(t => t.stop()); } catch (e) {}
      Render._rec = null;
    }
  },

  shell(inner, phaseLabel) {
    TTS.stop();
    Render.releaseMic();
    const p = Session.progress();
    Render.root().innerHTML = `
      <div class="sess-top">
        <button class="quit" onclick="Render.confirmQuit()">✕</button>
        <div class="pbar"><i style="width:${p.pct}%"></i></div>
        <span class="count">${p.label}</span>
      </div>
      ${phaseLabel ? `<div class="phase-tag">${phaseLabel}</div>` : ''}
      <div id="stage"></div>`;
    window.scrollTo(0, 0);
    return document.getElementById('stage');
  },
  confirmQuit() {
    Screens.modal(`<h2>Quitter la session ?</h2>
      <p>Ta progression est déjà sauvegardée — tu reprendras exactement ici.</p>
      <button class="btn" onclick="Screens.closeModal(); Session.quit()">Quitter</button>
      <button class="btn ghost mt" onclick="Screens.closeModal()">Continuer la session</button>`);
  },

  item(item) {
    const l = Session.cur.lang;
    if (item.kind === 'card') return Render.flashcard(item.id, item.maintenance ? '🔁 Entretien d\'un mot acquis' : null);
    if (item.kind === 'lesson') return Render.lesson(item.lessonRef, null, '📖 Rappel de leçon');
    if (item.kind === 'replay' || item.kind === 'consol' || item.kind === 'retry') {
      const r = Content.resolve(l, item.id);
      if (!r) { Session.advance(); return; }
      const banners = {
        replay: '🔁 Tu l\'avais raté — 2 réussites d\'affilée pour en sortir (' + (Store.lang(l).bank[item.id] || Store.lang(l).bank[item.id.replace(/-q\d+$/, '')] || { successes: 0 }).successes + '/2)',
        consol: '📌 Vérification d\'ancrage (tu l\'avais réussi)',
        retry: item.leech ? '🔄 Exercice mis de côté — on retente avec la leçon en tête' : '🎯 Rattrapage',
      };
      if (item.kind === 'replay' && Bank.needsLesson(l, item.id)) {
        const les = Content.lessonFor(l, item.id);
        if (les && !item._lessonShown) {
          item._lessonShown = true;
          return Render.lesson(les, () => Render.item(item), '📖 On revoit la règle d\'abord');
        }
      }
      return Render.exercise(r, item, item.id, banners[item.kind]);
    }
    if (item.kind === 'speaklater') {
      const r = Content.resolve(l, item.id);
      if (!r || r.step.type !== 'speaking') {
        const L = Store.lang(l);
        const i = (L.speaking_later || []).indexOf(item.id);
        if (i >= 0) { L.speaking_later.splice(i, 1); Store.save(); }
        Session.advance(); return;
      }
      return Render.speaking(r.step, item, item.id, '🎙️ Oral reporté');
    }
    if (item.kind === 'step') {
      const mod = Content.module(l, item.moduleId);
      const step = mod.sessions[item.si].steps[item.stepIdx];
      const stepId = Content.stepId(mod.id, item.si, item.stepIdx);
      const phase = { revision: 'Révision', lesson: 'Leçon', comprehension: 'Compréhension', production: 'Production' }[step.phase] || '';
      if (step.type === 'flashcard_review') return Render.newCards(step, item);
      if (step.type === 'lesson') return Render.lesson(step, () => { Session.stepDone(item); Session.advance(); }, phase);
      return Render.exercise({ module: mod, si: item.si, step }, item, stepId, null, phase);
    }
    Session.advance();
  },

  /* ---------- flashcards ---------- */
  flashcard(cardId, banner) {
    const l = Session.cur.lang;
    const v = Content.vocab(l, cardId);
    if (!v) { Session.advance(); return; }
    const card = SRS.ensureCard(l, cardId);
    const prod = SRS.direction(card) === 'production';
    const front = prod ? v.back : v.front;
    const back = prod ? v.front : v.back;
    const label = prod ? '🇫🇷 Traduis' : (l === 'en' ? '🇬🇧' : '🇪🇸') + ' Ce mot veut dire…';
    const stage = Render.shell('', '🃏 Révision');
    stage.innerHTML = `
      ${banner ? `<div class="replay-tag">${banner}</div>` : ''}
      <div class="card-panel flash" id="flash">
        <span class="front-label">${label}</span>
        <span class="word">${U.esc(front)}</span>
        <div id="back" style="display:none; text-align:center">
          <div class="divider mb"></div>
          <div class="answer">${U.esc(back)}</div>
          <div class="ex mt">“${U.esc(v.example || '')}”</div>
        </div>
      </div>
      <button class="btn" id="reveal">Voir la réponse</button>
      <div class="grade" id="grade" style="display:none">
        <button class="g-ko">✗ Raté</button>
        <button class="g-mid">〰 J'ai hésité</button>
        <button class="g-ok">✓ Je savais</button>
      </div>`;
    stage.querySelector('#reveal').onclick = () => {
      stage.querySelector('#back').style.display = 'block';
      stage.querySelector('#reveal').style.display = 'none';
      stage.querySelector('#grade').style.display = 'flex';
      // dans les deux sens, on prononce le mot en langue cible (v.front) au moment de la révélation
      TTS.speak(v.front.replace(/\(.*?\)/g, ''), l === 'en' ? 'en-GB' : 'es-ES', 0.95);
    };
    const done = res => {
      TTS.stop();
      SRS.grade(l, cardId, res);
      Session.cur.cardsReviewed++;
      if (res === 'ok') Session.cur.cardsOk++;
      Store.save();
      Session.advance();
    };
    stage.querySelector('.g-ko').onclick = () => done('ko');
    stage.querySelector('.g-mid').onclick = () => done('mid');
    stage.querySelector('.g-ok').onclick = () => done('ok');
  },

  newCards(step, item) {
    const l = Session.cur.lang;
    const ids = (step.new_cards || []).filter(id => Content.vocab(l, id));
    if (!item._queue) {
      SRS.introduce(l, ids);
      Session.cur.newCards += ids.length;
      item._queue = ids.slice();
      Store.save();
    }
    if (!item._queue.length) { Session.stepDone(item); Session.advance(); return; }
    const cardId = item._queue.shift();
    const v = Content.vocab(l, cardId);
    const stage = Render.shell('', '🆕 Nouveaux mots — ' + (ids.length - item._queue.length) + '/' + ids.length);
    stage.innerHTML = `
      <div class="card-panel flash">
        <span class="front-label">Nouveau mot</span>
        <span class="word">${U.esc(v.front)}</span>
        <div class="divider"></div>
        <div class="answer">${U.esc(v.back)}</div>
        <div class="ex">“${U.esc(v.example || '')}”</div>
      </div>
      <button class="btn" id="lst">🔊 Écouter</button>
      <button class="btn ghost mt" id="nx">J'ai lu → suivant</button>`;
    stage.querySelector('#lst').onclick = () => TTS.speak(v.front.replace(/\(.*?\)/g, '') + '. ' + (v.example || ''), l === 'en' ? 'en-GB' : 'es-ES', 0.95);
    stage.querySelector('#nx').onclick = () => { TTS.stop(); Render.newCards(step, item); };
  },

  /* ---------- leçon ---------- */
  lesson(step, onDone, phaseLabel) {
    const stage = Render.shell('', phaseLabel || 'Leçon');
    stage.innerHTML = `
      <div class="card-panel">
        <h2 class="mb">${U.esc(step.title || 'Leçon')}</h2>
        <div class="lesson-body">${U.md(step.body_md)}</div>
      </div>
      <button class="btn" id="ok">Continuer</button>`;
    stage.querySelector('#ok').onclick = onDone || (() => Session.advance());
  },

  /* ---------- exercices ---------- */
  exercise(resolved, item, stepId, banner, phaseLabel) {
    const step = resolved.step;
    if (resolved.qIdx !== null && resolved.qIdx !== undefined && (step.type === 'reading' || step.type === 'listening')) {
      return Render.passage(resolved, item, stepId.replace(/-q\d+$/, ''), banner, phaseLabel, resolved.qIdx);
    }
    switch (step.type) {
      case 'qcm': return Render.qcm(step, item, stepId, banner, phaseLabel);
      case 'gap_fill':
      case 'error_hunt':
      case 'translation': return Render.textInput(step, item, stepId, banner, phaseLabel);
      case 'matching': return Render.matching(step, item, stepId, banner, phaseLabel);
      case 'reading':
      case 'listening': return Render.passage(resolved, item, stepId, banner, phaseLabel, null);
      case 'writing': return Render.writing(step, item, stepId, phaseLabel);
      case 'speaking': return Render.speaking(step, item, stepId, phaseLabel);
      case 'lesson': return Render.lesson(step, () => { Session.stepDone(item); Session.advance(); }, phaseLabel);
      default: Session.stepDone(item); Session.advance();
    }
  },

  feedbackBox(ok, title, why) {
    // ok : true (vert) | 'warn' (jaune : correct mais accents à revoir) | false (rouge)
    const cls = ok === 'warn' ? 'warn' : ok ? 'ok' : 'ko';
    const head = ok === 'warn' ? '〰 ' + (title || 'Correct — mais les accents !')
      : ok ? '✓ ' + (title || 'Exact !') : '✗ ' + (title || 'Pas tout à fait');
    return `<div class="feedback ${cls}"><b class="t">${head}</b><span>${why || ''}</span></div>`;
  },
  continueBtn(stage, item, stepId, ok, autocorrect) {
    const b = U.el('<button class="btn">Continuer</button>');
    b.onclick = () => {
      Session.record(item, stepId, ok, autocorrect);
      Session.stepDone(item);
      Session.advance();
    };
    stage.appendChild(b);
    b.scrollIntoView({ behavior: 'smooth', block: 'end' });
  },

  qcm(step, item, stepId, banner, phaseLabel) {
    const stage = Render.shell('', phaseLabel || 'Exercice');
    // choix mélangés à chaque affichage : au rejeu, on doit retrouver la réponse, pas sa position
    const order = U.shuffle(step.choices.map((c, i) => i));
    stage.innerHTML = `
      ${banner ? `<div class="replay-tag">${banner}</div>` : ''}
      <div class="card-panel">
        <div class="consigne">Choisis la bonne réponse :</div>
        <div class="phrase">${U.md(step.question).replace(/^<p>|<\/p>$/g, '')}</div>
        <div class="qcm" id="opts">${order.map(i => `<button class="opt" data-i="${i}">${U.esc(step.choices[i])}</button>`).join('')}</div>
        <div id="fb"></div>
      </div>`;
    stage.querySelectorAll('.opt').forEach(btn => {
      btn.onclick = () => {
        const i = Number(btn.dataset.i);
        const ok = i === step.answer;
        stage.querySelectorAll('.opt').forEach(b => {
          b.disabled = true;
          if (Number(b.dataset.i) === step.answer) b.classList.add('good');
          else if (b === btn && !ok) b.classList.add('bad');
        });
        stage.querySelector('#fb').innerHTML = Render.feedbackBox(ok, null, U.esc(step.explanation || ''));
        Render.continueBtn(stage, item, stepId, ok, true);
      };
    });
  },

  textInput(step, item, stepId, banner, phaseLabel) {
    const stage = Render.shell('', phaseLabel || 'Exercice');
    const consignes = { gap_fill: 'Complète :', error_hunt: 'Corrige l\'erreur :', translation: 'Traduis :' };
    const phrase = step.text || step.prompt || '';
    stage.innerHTML = `
      ${banner ? `<div class="replay-tag">${banner}</div>` : ''}
      <div class="card-panel">
        <div class="consigne">${consignes[step.type] || ''}</div>
        <div class="phrase" ${step.type === 'error_hunt' ? 'style="font-style:italic"' : ''}>${U.esc(phrase)}</div>
        <input class="txtin" id="ans" autocomplete="off" autocapitalize="off" placeholder="Ta réponse…">
        <button class="btn" id="go">Valider</button>
        <div id="fb"></div>
      </div>`;
    const input = stage.querySelector('#ans');
    Render.accentBar(input);
    input.focus();
    const submit = async () => {
      const given = input.value;
      if (!given.trim()) return;
      input.disabled = true;
      stage.querySelector('#go').style.display = 'none';
      const model = (step.accepted && step.accepted[0]) || '';
      // comparaison stricte (accents compris) puis souple : parfait = vert,
      // bon à l'accent près = compté bon mais affiché en jaune (demande de Valentin)
      const exact = U.answerMatches(given, step.accepted, true)
        || (step.type === 'gap_fill' && U.gapMatches(step.text, step.accepted, given, true))
        || (step.type === 'error_hunt' && U.diffMatches(step.text, step.accepted, given, true));
      let ok = exact || U.answerMatches(given, step.accepted);
      if (!ok && step.type === 'gap_fill') ok = U.gapMatches(step.text, step.accepted, given);
      if (!ok && step.type === 'error_hunt') ok = U.diffMatches(step.text, step.accepted, given);
      if (ok) {
        const note = exact ? U.esc(step.explanation || '')
          : `La bonne écriture : <b>${U.esc(model)}</b><br>` + U.esc(step.explanation || '');
        stage.querySelector('#fb').innerHTML = Render.feedbackBox(exact ? true : 'warn', null, note);
        Render.continueBtn(stage, item, stepId, true, true);
        return;
      }
      if (step.ai_check && Gemini.available()) {
        stage.querySelector('#fb').innerHTML = '<div class="hint">✨ Vérification par l\'IA…</div>';
        try {
          const v = await Gemini.checkAnswer(Session.cur.lang, step, given);
          const verdict = v.correct ? (v.accents_only ? 'warn' : true) : false;
          stage.querySelector('#fb').innerHTML = Render.feedbackBox(verdict, null,
            U.esc(v.explanation || '') + (model ? `<br><b>Réponse type :</b> ${U.esc(model)}` : ''));
          Render.continueBtn(stage, item, stepId, !!v.correct, true);
          return;
        } catch (e) { /* repli hors ligne ci-dessous */ }
      }
      if (step.ai_check) {
        // repli : auto-jugement avec la réponse modèle (moteur §8)
        stage.querySelector('#fb').innerHTML = `
          <div class="feedback neutral"><b class="t">Réponse type :</b>
          <span>${U.esc(model || step.explanation || '')}</span><br>
          <span>${U.esc(step.explanation || '')}</span></div>
          <div class="grade">
            <button class="g-ko" id="selfko">✗ J'avais faux</button>
            <button class="g-ok" id="selfok">✓ J'avais bon</button>
          </div>`;
        stage.querySelector('#selfok').onclick = () => { Session.record(item, stepId, true, true); Session.stepDone(item); Session.advance(); };
        stage.querySelector('#selfko').onclick = () => { Session.record(item, stepId, false, true); Session.stepDone(item); Session.advance(); };
        return;
      }
      stage.querySelector('#fb').innerHTML = Render.feedbackBox(false, null,
        `<b>Réponse :</b> ${U.esc(model)}<br>` + U.esc(step.explanation || ''));
      Render.continueBtn(stage, item, stepId, false, true);
    };
    stage.querySelector('#go').onclick = submit;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
  },

  matching(step, item, stepId, banner, phaseLabel) {
    const stage = Render.shell('', phaseLabel || 'Exercice');
    const pairs = step.pairs || [];
    // apparié par INDICE de paire (robuste aux libellés identiques)
    const lefts = U.shuffle(pairs.map((p, i) => i));
    const rights = U.shuffle(pairs.map((p, i) => i));
    stage.innerHTML = `
      ${banner ? `<div class="replay-tag">${banner}</div>` : ''}
      <div class="card-panel">
        <div class="consigne">${U.esc(step.instruction || 'Associe les paires :')}</div>
        <div class="match-cols">
          <div class="match-col" id="mcl">${lefts.map(i => `<button data-i="${i}">${U.esc(pairs[i].left)}</button>`).join('')}</div>
          <div class="match-col" id="mcr">${rights.map(i => `<button data-i="${i}">${U.esc(pairs[i].right)}</button>`).join('')}</div>
        </div>
        <div id="fb"></div>
      </div>`;
    let sel = null, mistakes = 0, matched = 0;
    stage.querySelector('#mcl').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (b.classList.contains('done')) return;
        stage.querySelectorAll('#mcl button').forEach(x => x.classList.remove('sel'));
        b.classList.add('sel'); sel = b;
      };
    });
    stage.querySelector('#mcr').querySelectorAll('button').forEach(b => {
      b.onclick = () => {
        if (!sel || b.classList.contains('done')) return;
        if (sel.dataset.i === b.dataset.i) {
          sel.classList.remove('sel'); sel.classList.add('done'); b.classList.add('done');
          sel.disabled = true; b.disabled = true; sel = null; matched++;
          if (matched === pairs.length) {
            const ok = mistakes === 0;
            stage.querySelector('#fb').innerHTML = Render.feedbackBox(ok, ok ? 'Sans faute !' : `Terminé, avec ${mistakes} erreur${mistakes > 1 ? 's' : ''}`, U.esc(step.explanation || ''));
            Render.continueBtn(stage, item, stepId, ok, true);
          }
        } else {
          mistakes++;
          b.classList.add('err');
          setTimeout(() => b.classList.remove('err'), 500);
        }
      };
    });
  },

  /* reading & listening : support + sous-questions en série */
  passage(resolved, item, baseId, banner, phaseLabel, onlyQ) {
    const step = resolved.step;
    const l = Session.cur.lang;
    const isListening = step.type === 'listening';
    if (item._q === undefined) item._q = (onlyQ !== null && onlyQ !== undefined) ? onlyQ : 0;
    const questions = step.questions || [];
    const stage = Render.shell('', phaseLabel || (isListening ? '🎧 Écoute' : '📚 Lecture'));
    let supportHtml;
    if (isListening) {
      supportHtml = `
        <div class="player card-panel">
          <button class="playbtn" id="play">▶</button>
          <div class="speed" id="speed">
            ${[0.8, 0.9, 1.0].map(r => `<button data-r="${r}" class="${(item._rate || step.rate || 0.9) === r ? 'on' : ''}">${r}×</button>`).join('')}
          </div>
          <div class="hint">Écoute puis réponds — réécoutes illimitées.<br>${step.hide_text ? 'La transcription s\'affichera à la fin.' : ''}</div>
        </div>`;
    } else {
      supportHtml = `<div class="card-panel"><div class="reading-text">${U.md(step.text_md)}</div></div>`;
    }
    const q = questions[item._q];
    const qId = baseId + '-q' + (item._q + 1);
    stage.innerHTML = `
      ${banner ? `<div class="replay-tag">${banner}</div>` : ''}
      ${supportHtml}
      ${q ? `<div class="card-panel">
        <div class="consigne">Question ${item._q + 1}/${questions.length}</div>
        <div class="phrase">${U.esc(q.question)}</div>
        <div id="qzone"></div><div id="fb"></div>
      </div>` : ''}`;
    if (isListening) {
      const btn = stage.querySelector('#play');
      let state = 'idle'; // idle | playing | paused
      const setBtn = st => {
        state = st;
        btn.textContent = st === 'playing' ? '❚❚' : '▶';
        btn.classList.toggle('playing', st === 'playing');
      };
      btn.onclick = () => {
        if (state === 'playing') { TTS.pause(); setBtn('paused'); return; }
        if (state === 'paused') { TTS.resume(); setBtn('playing'); return; }
        setBtn('playing');
        TTS.speak(step.text_md, l === 'en' ? (step.voice || 'en-GB') : (step.voice || 'es-ES'), item._rate || step.rate || 0.9, () => setBtn('idle'));
      };
      stage.querySelectorAll('#speed button').forEach(b => b.onclick = () => {
        item._rate = Number(b.dataset.r);
        TTS.stop(); setBtn('idle'); // nouveau débit → on relance du début au prochain ▶
        stage.querySelectorAll('#speed button').forEach(x => x.classList.remove('on'));
        b.classList.add('on');
      });
    }
    if (!q) { // toutes les questions faites
      if (isListening && step.hide_text) {
        const stage2 = stage;
        stage2.insertAdjacentHTML('beforeend', `<div class="card-panel"><div class="consigne">Transcription :</div><div class="reading-text">${U.md(step.text_md)}</div></div>`);
        const b = U.el('<button class="btn">Continuer</button>');
        b.onclick = () => { TTS.stop(); Session.stepDone(item); Session.advance(); };
        stage2.appendChild(b);
      } else { Session.stepDone(item); Session.advance(); }
      return;
    }
    const zone = stage.querySelector('#qzone');
    const nextQ = () => {
      TTS.stop();
      if (onlyQ !== null && onlyQ !== undefined) { Session.advance(); return; } // rejeu d'une seule question
      item._q++;
      Render.passage(resolved, item, baseId, banner, phaseLabel, null);
    };
    if (q.type === 'qcm') {
      // même règle que les QCM de leçon : choix mélangés à chaque affichage
      const qOrder = U.shuffle(q.choices.map((c, i) => i));
      zone.innerHTML = `<div class="qcm">${qOrder.map(i => `<button class="opt" data-i="${i}">${U.esc(q.choices[i])}</button>`).join('')}</div>`;
      zone.querySelectorAll('.opt').forEach(btn => btn.onclick = () => {
        const ok = Number(btn.dataset.i) === q.answer;
        zone.querySelectorAll('.opt').forEach(b => { b.disabled = true; if (Number(b.dataset.i) === q.answer) b.classList.add('good'); else if (b === btn && !ok) b.classList.add('bad'); });
        stage.querySelector('#fb').innerHTML = Render.feedbackBox(ok, null, U.esc(q.explanation || ''));
        const c = U.el('<button class="btn">Continuer</button>');
        c.onclick = () => { Session.record(item, qId, ok, true); nextQ(); };
        stage.querySelector('#fb').appendChild(c);
      });
    } else { // open
      zone.innerHTML = `<input class="txtin" id="qans" autocomplete="off" autocapitalize="off" placeholder="Ta réponse…"><button class="btn" id="qgo">Valider</button>`;
      const input = zone.querySelector('#qans');
      Render.accentBar(input);
      const submit = async () => {
        if (!input.value.trim()) return;
        input.disabled = true; zone.querySelector('#qgo').style.display = 'none';
        const exact = U.answerMatches(input.value, q.accepted, true) || U.containsMatches(input.value, q.accepted, true);
        let ok = exact || U.answerMatches(input.value, q.accepted) || U.containsMatches(input.value, q.accepted);
        const model = (q.accepted && q.accepted[0]) || q.explanation || '';
        if (!ok && q.ai_check && Gemini.available()) {
          stage.querySelector('#fb').innerHTML = '<div class="hint">✨ Vérification par l\'IA…</div>';
          try {
            const v = await Gemini.checkAnswer(l, { question: q.question, accepted: q.accepted, explanation: q.explanation }, input.value);
            ok = !!v.correct;
            const verdict = v.correct ? (v.accents_only ? 'warn' : true) : false;
            stage.querySelector('#fb').innerHTML = Render.feedbackBox(verdict, null, U.esc(v.explanation || ''));
            const c = U.el('<button class="btn">Continuer</button>');
            c.onclick = () => { Session.record(item, qId, ok, true); nextQ(); };
            stage.querySelector('#fb').appendChild(c);
            return;
          } catch (e) { /* repli */ }
        }
        if (!ok && (q.ai_check || !(q.accepted || []).length)) {
          stage.querySelector('#fb').innerHTML = `
            <div class="feedback neutral"><b class="t">Réponse type :</b><span>${U.esc(model)}</span></div>
            <div class="grade">
              <button class="g-ko" id="sko">✗ J'avais faux</button>
              <button class="g-ok" id="sok">✓ J'avais bon</button>
            </div>`;
          stage.querySelector('#sok').onclick = () => { Session.record(item, qId, true, true); nextQ(); };
          stage.querySelector('#sko').onclick = () => { Session.record(item, qId, false, true); nextQ(); };
          return;
        }
        const verdict = ok ? (exact ? true : 'warn') : false;
        stage.querySelector('#fb').innerHTML = Render.feedbackBox(verdict, null,
          (ok ? (exact ? '' : `La bonne écriture : <b>${U.esc(model)}</b><br>`) : `<b>Réponse :</b> ${U.esc(model)}<br>`) + U.esc(q.explanation || ''));
        const c = U.el('<button class="btn">Continuer</button>');
        c.onclick = () => { Session.record(item, qId, ok, true); nextQ(); };
        stage.querySelector('#fb').appendChild(c);
      };
      zone.querySelector('#qgo').onclick = submit;
      input.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      input.focus();
    }
  },

  writing(step, item, stepId, phaseLabel) {
    const l = Session.cur.lang;
    const stage = Render.shell('', phaseLabel || '✍️ Production');
    const targets = (step.target_vocab || []).map(id => (Content.vocab(l, id) || {}).front).filter(Boolean);
    stage.innerHTML = `
      <div class="card-panel">
        <div class="phrase">${U.esc(step.prompt)}</div>
        ${step.constraints ? `<div class="consigne">${U.esc(step.constraints)}</div>` : ''}
        ${targets.length ? `<div class="consigne">💡 Vocabulaire à placer : <b>${targets.map(U.esc).join(' · ')}</b></div>` : ''}
        <textarea class="txtin" id="txt" placeholder="Écris ici…"></textarea>
        <button class="btn" id="go">${Gemini.available() ? '✨ Envoyer à la correction' : 'Terminer (correction plus tard)'}</button>
        <div id="fb"></div>
      </div>`;
    Render.accentBar(stage.querySelector('#txt'));
    stage.querySelector('#go').onclick = async () => {
      const text = stage.querySelector('#txt').value.trim();
      if (text.length < 20) { U.toast('Écris encore un peu avant de valider 😉'); return; }
      stage.querySelector('#txt').disabled = true;
      stage.querySelector('#go').style.display = 'none';
      const fb = stage.querySelector('#fb');
      if (Gemini.available()) {
        fb.innerHTML = '<div class="hint">✨ Correction en cours…</div>';
        try {
          const r = await Gemini.correctWriting(l, step, text, targets);
          fb.innerHTML = `
            <div class="ai-note"><span class="score">${U.esc(String(r.score))}/10</span><span>${U.esc(r.summary || '')}</span></div>
            ${(r.errors || []).map(e => `<div class="fix"><b>${U.esc(e.wrong)}</b> → <i>${U.esc(e.right)}</i>. ${U.esc(e.why)}</div>`).join('')}
            ${r.rewrite ? `<div class="feedback neutral"><b class="t">Version corrigée :</b><span>${U.esc(r.rewrite)}</span></div>` : ''}`;
          Render.continueBtn(stage, item, stepId, true, false);
          return;
        } catch (e) {
          fb.innerHTML = '';
          U.toast(e.message === 'quota' ? 'Quota IA atteint — texte mis en file d\'attente' : 'IA indisponible — texte mis en file d\'attente');
        }
      }
      // hors ligne / sans clé : file d'attente + checklist (moteur §8)
      Store.lang(l).writing_queue.push({ id: stepId, prompt: step.prompt, constraints: step.constraints, target_words: targets, text, status: 'pending', date: U.todayKey() });
      Store.save();
      fb.innerHTML = `<div class="feedback neutral"><b class="t">📮 Texte en file d'attente</b>
        <span>Il sera corrigé par l'IA à ta prochaine connexion. En attendant, vérifie toi-même :</span></div>
        <div class="checklist">
          ${['Mes accords et conjugaisons de base', 'Ai-je utilisé le vocabulaire demandé ?', 'Ai-je respecté la consigne ?'].map(c => `<label><input type="checkbox"> ${c}</label>`).join('')}
        </div>`;
      Render.continueBtn(stage, item, stepId, true, false);
    };
  },

  speaking(step, item, stepId, phaseLabel) {
    const stage = Render.shell('', phaseLabel || '🎙️ Expression orale');
    stage.innerHTML = `
      <div class="card-panel">
        <div class="phrase">${U.esc(step.prompt)}</div>
        <div class="consigne">Parle ${step.duration_sec ? Math.round(step.duration_sec) + ' secondes' : '1 à 2 minutes'}, enregistre-toi, puis réécoute.</div>
        <button class="recbtn" id="rec">● Commencer l'enregistrement</button>
        <button class="btn ghost" id="skipspk">🔇 Je ne peux pas parler ici → une autre fois</button>
        <div id="audiozone"></div>
        <div class="checklist" id="check" style="display:none">
          ${(step.checklist || ['Ai-je parlé sans lire ?', 'Mes temps sont-ils justes ?']).map(c => `<label><input type="checkbox"> ${U.esc(c)}</label>`).join('')}
        </div>
        <div id="fb"></div>
      </div>`;
    // fin d'un oral : sort de la file des reportés s'il y était
    const completeSpeak = () => {
      const L = Store.lang(Session.cur.lang);
      const i = (L.speaking_later || []).indexOf(stepId);
      if (i >= 0) { L.speaking_later.splice(i, 1); }
      Session.record(item, stepId, true, false);
      Session.stepDone(item);
      Session.advance();
    };
    // « je ne peux pas parler ici » : reporté sans pénalité (transports, lieu bruyant)
    stage.querySelector('#skipspk').onclick = () => {
      const L = Store.lang(Session.cur.lang);
      if (!L.speaking_later.includes(stepId)) L.speaking_later.push(stepId);
      Store.save();
      U.toast('🎙️ Reporté — il reviendra dans une prochaine session');
      Session.stepDone(item);
      Session.advance();
    };
    let recorder = null, chunks = [];
    const btn = stage.querySelector('#rec');
    btn.onclick = async () => {
      if (recorder && recorder.state === 'recording') { recorder.stop(); return; }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        recorder = new MediaRecorder(stream);
        Render._rec = { recorder, stream }; // pour libérer le micro si on quitte en cours
        chunks = [];
        recorder.ondataavailable = e => chunks.push(e.data);
        recorder.onstop = () => {
          stream.getTracks().forEach(t => t.stop());
          Render._rec = null;
          const url = URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }));
          const az = stage.querySelector('#audiozone');
          if (!az) return; // écran quitté pendant l'enregistrement
          az.innerHTML = `<audio controls src="${url}"></audio>`;
          stage.querySelector('#check').style.display = 'block';
          btn.textContent = '● Ré-enregistrer';
          btn.classList.remove('rec');
          if (!stage.querySelector('#done')) {
            const d = U.el('<button class="btn" id="done">Terminé</button>');
            d.onclick = completeSpeak;
            stage.querySelector('.card-panel').appendChild(d);
          }
        };
        recorder.start();
        btn.textContent = '■ Arrêter l\'enregistrement';
        btn.classList.add('rec');
      } catch (e) {
        stage.querySelector('#fb').innerHTML = `<div class="feedback neutral"><b class="t">Micro indisponible</b>
          <span>Pas grave : réponds à voix haute, puis continue.</span></div>`;
        btn.disabled = true;
        if (!stage.querySelector('#nomic')) {
          const d = U.el('<button class="btn" id="nomic">J\'ai répondu à voix haute → continuer</button>');
          d.onclick = completeSpeak;
          stage.querySelector('.card-panel').appendChild(d);
        }
      }
    };
  },
};
