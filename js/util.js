/* Charabia — utilitaires */
const U = {
  el(html) {
    const t = document.createElement('template');
    t.innerHTML = html.trim();
    return t.content.firstElementChild;
  },
  esc(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  },
  shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },
  todayKey(d) {
    const x = d || new Date();
    return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
  },
  parseKey(k) {
    const [y, m, d] = k.split('-').map(Number);
    return new Date(y, m - 1, d);
  },
  addDays(key, n) {
    const d = U.parseKey(key);
    d.setDate(d.getDate() + n);
    return U.todayKey(d);
  },
  // Échéance SRS : jamais un week-end si le gel est actif (moteur §3.1) → décalée au vendredi
  dueDate(days, weekendFreeze) {
    let key = U.addDays(U.todayKey(), days);
    if (weekendFreeze) {
      const dow = U.parseKey(key).getDay(); // 0 = dim, 6 = sam
      if (dow === 6) key = U.addDays(key, -1);
      if (dow === 0) key = U.addDays(key, -2);
    }
    return key;
  },
  daysBetween(k1, k2) {
    return Math.round((U.parseKey(k2) - U.parseKey(k1)) / 86400000);
  },
  // Normalisation des réponses : minuscules, ponctuation légère ignorée ;
  // sans accents par défaut, keepAccents=true pour la comparaison stricte
  // (permet le verdict jaune « correct mais accents à revoir »)
  norm(s, keepAccents) {
    let x = String(s || '').toLowerCase();
    if (!keepAccents) x = x.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return x
      .replace(/[’‘]/g, "'")
      .replace(/[.,;:!?¿¡«»"()]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  },
  answerMatches(given, accepted, keepAccents) {
    const g = U.norm(given, keepAccents);
    if (!g) return false;
    return (accepted || []).some(a => U.norm(a, keepAccents) === g);
  },
  // Chasse à l'erreur : accepte aussi la seule portion corrigée (« estoy » pour
  // « Soy muy cansado hoy » → « Estoy muy cansado hoy »). La portion est le
  // segment qui diffère entre la phrase fautive et la correction ; si les
  // changements sont dispersés, la phrase complète reste exigée.
  diffMatches(text, accepted, given, keepAccents) {
    const g = U.norm(given, keepAccents);
    if (!g) return false;
    const src = U.norm(text, keepAccents).split(' ');
    for (const acc of (accepted || [])) {
      const dst = U.norm(acc, keepAccents).split(' ');
      let p = 0;
      while (p < src.length && p < dst.length && src[p] === dst[p]) p++;
      let s = 0;
      while (s < src.length - p && s < dst.length - p && src[src.length - 1 - s] === dst[dst.length - 1 - s]) s++;
      const mid = dst.slice(p, dst.length - s).join(' ');
      if (mid && g === mid) return true;
      // portion corrigée + un peu de contexte (« viviendo aquí ») : accepté si
      // la réponse contient la correction ET est un morceau contigu de la
      // phrase corrigée (retour de Valentin du 31/07)
      if (mid && (' ' + g + ' ').includes(' ' + mid + ' ')) {
        const dstStr = ' ' + dst.join(' ') + ' ';
        if (dstStr.includes(' ' + g + ' ')) return true;
      }
    }
    return false;
  },
  // Textes à trous : accepte aussi le segment complet (« have you been » pour
  // « How long ___ you ___ (be)… ») et la phrase entière — pas seulement les
  // mots manquants « have / been ». Retour de Valentin du 31/07/2026.
  gapMatches(text, accepted, given, keepAccents) {
    const t = String(text || '');
    const gapRe = /_{2,}/g;
    const gaps = (t.match(gapRe) || []).length;
    if (!gaps) return false;
    const g = U.norm(given, keepAccents);
    for (const acc of (accepted || [])) {
      const parts = String(acc).split('/').map(s => s.trim()).filter(Boolean);
      if (parts.length !== gaps) continue;
      // les indications entre parenthèses de l'énoncé, ex. « (be) », ne sont pas exigées
      const strip = s => U.norm(String(s).replace(/\([^)]*\)/g, ' '), keepAccents);
      let i = 0;
      const full = t.replace(gapRe, () => parts[i++] || '');
      if (g === strip(full)) return true;
      if (gaps >= 2) {
        const first = t.search(/_{2,}/);
        let last = -1, m; const re = /_{2,}/g;
        while ((m = re.exec(t))) last = m.index + m[0].length;
        let j = 0;
        const seg = t.slice(first, last).replace(/_{2,}/g, () => parts[j++] || '');
        if (g === strip(seg)) return true;
      }
    }
    return false;
  },
  // Mini-rendu markdown : gras, italique, code, tableaux, listes, citations, barré
  md(src) {
    if (!src) return '';
    const lines = String(src).split('\n');
    let out = '', i = 0;
    const inline = s => U.esc(s)
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/~~(.+?)~~/g, '<s>$1</s>')
      .replace(/\*(.+?)\*/g, '<i>$1</i>')
      .replace(/`(.+?)`/g, '<code>$1</code>');
    while (i < lines.length) {
      const l = lines[i];
      if (/^\s*\|/.test(l)) {
        const rows = [];
        while (i < lines.length && /^\s*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
        const cells = r => r.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map(c => inline(c.trim()));
        let html = '<table>';
        rows.forEach((r, idx) => {
          if (/^\s*\|[\s\-|:]+\|?\s*$/.test(r)) return; // ligne séparatrice
          const tag = idx === 0 ? 'th' : 'td';
          html += '<tr>' + cells(r).map(c => `<${tag}>${c}</${tag}>`).join('') + '</tr>';
        });
        out += html + '</table>';
        continue;
      }
      if (/^\s*[-*] /.test(l)) {
        let html = '<ul>';
        while (i < lines.length && /^\s*[-*] /.test(lines[i])) { html += '<li>' + inline(lines[i].replace(/^\s*[-*] /, '')) + '</li>'; i++; }
        out += html + '</ul>';
        continue;
      }
      if (/^\s*> ?/.test(l)) {
        let q = [];
        while (i < lines.length && /^\s*> ?/.test(lines[i])) { q.push(inline(lines[i].replace(/^\s*> ?/, ''))); i++; }
        out += '<blockquote>' + q.join('<br>') + '</blockquote>';
        continue;
      }
      if (l.trim() === '') { i++; continue; }
      let p = [];
      while (i < lines.length && lines[i].trim() !== '' && !/^\s*([-*] |\||> )/.test(lines[i])) { p.push(inline(lines[i])); i++; }
      out += '<p>' + p.join('<br>') + '</p>';
    }
    return out;
  },
  toast(msg, ms) {
    let t = document.querySelector('.toast');
    if (!t) { t = U.el('<div class="toast"></div>'); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(U._toastT);
    U._toastT = setTimeout(() => t.classList.remove('show'), ms || 2600);
  },
  online() { return navigator.onLine; },
};
