/* Charabia — synchronisation PC ↔ téléphone via GitHub Gist (gratuit, privé)
   Stratégie : le plus récent gagne. Pull au lancement, push après chaque session. */
const Sync = {
  FILE: 'charabia-sync.json',

  hasToken() { return !!(Store.state.settings.gh_token || '').trim(); },
  enabled() { return Sync.hasToken() && U.online(); },
  headers() {
    return {
      'Authorization': 'Bearer ' + Store.state.settings.gh_token.trim(),
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
    };
  },
  // jamais de clés dans le gist
  payload() {
    const copy = JSON.parse(JSON.stringify(Store.state));
    delete copy.settings.gemini_key;
    delete copy.settings.gh_token;
    return copy;
  },

  async findGist() {
    if (Store.state.settings.gist_id) return Store.state.settings.gist_id;
    const res = await fetch('https://api.github.com/gists?per_page=100', { headers: Sync.headers() });
    if (!res.ok) throw new Error('http' + res.status);
    const list = await res.json();
    const g = list.find(x => x.files && x.files[Sync.FILE]);
    if (g) { Store.state.settings.gist_id = g.id; Store.save(); return g.id; }
    return null;
  },

  async push() {
    if (!Sync.enabled()) return;
    const id = Store.state.settings.gist_id;
    const body = JSON.stringify({
      description: 'Charabia — progression synchronisée (privé)',
      public: false,
      files: { [Sync.FILE]: { content: JSON.stringify(Sync.payload()) } },
    });
    const res = await fetch('https://api.github.com/gists' + (id ? '/' + id : ''), {
      method: id ? 'PATCH' : 'POST', headers: Sync.headers(), body,
    });
    if (!res.ok) throw new Error('http' + res.status);
    const g = await res.json();
    Store.state.settings.gist_id = g.id;
    Store.state.settings.last_sync = Date.now();
    Store.save();
  },

  // pull-ou-push selon qui est le plus récent
  async auto() {
    if (!Sync.enabled()) return 'off';
    const id = await Sync.findGist();
    if (!id) { await Sync.push(); return 'pushed'; }
    const res = await fetch('https://api.github.com/gists/' + id, { headers: Sync.headers() });
    if (!res.ok) throw new Error('http' + res.status);
    const gist = await res.json();
    let remote = null;
    try { remote = JSON.parse(gist.files[Sync.FILE].content); } catch (e) {}
    const localT = Store.state.updated_at || 0;
    const remoteT = (remote && remote.updated_at) || 0;
    if (remote && remoteT > localT) {
      // l'autre appareil est plus récent : on adopte son état, en gardant les clés locales
      const keep = {
        gemini_key: Store.state.settings.gemini_key,
        gh_token: Store.state.settings.gh_token,
        gist_id: id,
        last_sync: Date.now(),
      };
      localStorage.setItem(Store.KEY, JSON.stringify(remote));
      Store.load();
      Object.assign(Store.state.settings, keep);
      Store.save();
      return 'pulled';
    }
    if (localT > remoteT) { await Sync.push(); return 'pushed'; }
    Store.state.settings.last_sync = Date.now();
    Store.save();
    return 'same';
  },

  lastSyncLabel() {
    const t = Store.state.settings.last_sync;
    if (!t) return 'jamais';
    const min = Math.round((Date.now() - t) / 60000);
    if (min < 1) return 'à l\'instant';
    if (min < 60) return 'il y a ' + min + ' min';
    const h = Math.round(min / 60);
    return h < 24 ? 'il y a ' + h + ' h' : 'il y a ' + Math.round(h / 24) + ' j';
  },
};
