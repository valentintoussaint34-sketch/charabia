/* Charabia — confettis (réservés aux vraies victoires : bilan réussi, fin de bloc, paliers de streak) */
const Confetti = {
  fire(big) {
    const canvas = document.getElementById('confetti');
    const ctx = canvas.getContext('2d');
    canvas.width = innerWidth; canvas.height = innerHeight;
    const colors = ['#3b5bdb', '#e8590c', '#2f9e44', '#f08c00', '#e03131', '#7048e8'];
    const N = big ? 220 : 120;
    const parts = [];
    for (let i = 0; i < N; i++) {
      parts.push({
        x: innerWidth / 2 + (Math.random() - 0.5) * 120,
        y: innerHeight * 0.35,
        vx: (Math.random() - 0.5) * 14,
        vy: -6 - Math.random() * 9,
        w: 6 + Math.random() * 6, h: 4 + Math.random() * 5,
        c: colors[i % colors.length],
        r: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.3,
      });
    }
    let frames = 0;
    const anim = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      parts.forEach(p => {
        p.x += p.vx; p.y += p.vy; p.vy += 0.28; p.vx *= 0.99; p.r += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frames++;
      if (frames < 170) requestAnimationFrame(anim);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    };
    requestAnimationFrame(anim);
  },
};
