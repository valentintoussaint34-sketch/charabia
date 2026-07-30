/* Charabia — démarrage */
(function () {
  Store.load();
  TTS.init();
  Store.persistStorage();

  // service worker (uniquement en https / localhost — inactif en file://)
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // file d'attente des writing : au lancement et au retour du réseau (moteur §8)
  const flush = async () => {
    const n = await Gemini.flushQueue();
    if (n > 0) {
      U.toast(`✨ ${n} correction${n > 1 ? 's' : ''} IA arrivée${n > 1 ? 's' : ''}`);
      // ne re-rend l'accueil que si l'utilisateur y est déjà (pas de téléportation)
      if (!Session.cur && Screens.current === 'home' && !document.getElementById('modal-root').innerHTML) Screens.home();
    }
  };
  window.addEventListener('online', flush);
  setTimeout(flush, 1500);

  // synchronisation multi-appareils au lancement (le plus récent gagne)
  if (typeof Sync !== 'undefined' && Sync.enabled()) {
    Sync.auto().then(r => {
      if (r === 'pulled') {
        U.toast('🔄 Progression synchronisée depuis ton autre appareil');
        if (!Session.cur && Screens.current === 'home') Screens.home();
      }
    }).catch(() => {});
  }
  // ...et à chaque fois qu'on quitte/masque l'app (best-effort) : la progression
  // en cours part vers l'autre appareil même sans terminer la session
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && typeof Sync !== 'undefined' && Sync.enabled()) {
      Sync.push().catch(() => {});
    }
  });

  if (!Store.state.onboarded) { Screens.home(); Screens.onboarding(); }
  else Screens.home();
})();
