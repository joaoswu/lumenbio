/**
 * Now Playing dock
 * A bottom glass panel with album art, controls and a live Web Audio waveform
 * rendered behind everything. Slides up after the welcome screen when the user
 * has the music player enabled with at least one track.
 */
(function () {
  document.addEventListener('DOMContentLoaded', init);

  function init() {
    const cfg = (window.siteConfig && window.siteConfig.musicPlayer) || {};
    const dock = document.getElementById('np-dock');
    if (!dock) return;

    let tracks = (cfg.enabled && Array.isArray(cfg.tracks)) ? cfg.tracks : [];
    tracks = tracks
      .map(t => (typeof t === 'string' ? { url: t } : t))
      .filter(t => t && t.url);

    if (!tracks.length) { dock.remove(); return; }

    const $ = id => document.getElementById(id);
    const artImg = $('np-art-img');
    const artFallback = dock.querySelector('.np-art-fallback');
    const titleEl = $('np-title');
    const artistEl = $('np-artist');
    const playBtn = $('np-play');
    const prevBtn = $('np-prev');
    const nextBtn = $('np-next');
    const vol = $('np-vol');
    const progress = $('np-progress');
    const progressBar = $('np-progress-bar');
    const canvas = $('np-wave');
    const ctx2d = canvas.getContext('2d');

    const audio = new Audio();
    audio.preload = 'metadata';
    audio.volume = Math.min(1, Math.max(0, (cfg.volume != null ? cfg.volume : 50) / 100));
    if (vol) vol.value = Math.round(audio.volume * 100);

    let idx = 0, playing = false, actx, analyser, freq, rafId = null, artToken = 0, jmtPromise;

    const accent = () =>
      getComputedStyle(document.documentElement).getPropertyValue('--color-primary').trim() || '#c4313a';

    function filenameTitle(url) {
      try {
        const f = decodeURIComponent(url.split('/').pop().split('?')[0]);
        return f.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim() || 'Track';
      } catch (e) { return 'Track'; }
    }

    function setArt(url) {
      if (url) {
        artImg.src = url;
        artImg.style.display = 'block';
        if (artFallback) artFallback.style.display = 'none';
        artImg.onerror = () => { artImg.style.display = 'none'; if (artFallback) artFallback.style.display = ''; };
      } else {
        artImg.removeAttribute('src');
        artImg.style.display = 'none';
        if (artFallback) artFallback.style.display = '';
      }
    }

    function loadJsMediaTags() {
      if (window.jsmediatags) return Promise.resolve(window.jsmediatags);
      if (jmtPromise) return jmtPromise;
      jmtPromise = new Promise((resolve) => {
        const s = document.createElement('script');
        s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jsmediatags/3.9.5/jsmediatags.min.js';
        s.onload = () => resolve(window.jsmediatags);
        s.onerror = () => resolve(null);
        document.head.appendChild(s);
      });
      return jmtPromise;
    }

    function resolveArt(track) {
      const token = ++artToken;
      if (track.art) { setArt(track.art); return; }
      const profile = (window.siteConfig.profile && window.siteConfig.profile.profileImage) || '';
      setArt(profile); // show fallback immediately
      // Progressive enhancement: pull embedded album art from the file's ID3 tags.
      loadJsMediaTags().then(jmt => {
        if (!jmt || token !== artToken) return;
        try {
          jmt.read(track.url, {
            onSuccess: (tag) => {
              if (token !== artToken) return;
              const pic = tag.tags && tag.tags.picture;
              if (!pic) return;
              const blob = new Blob([new Uint8Array(pic.data)], { type: pic.format });
              setArt(URL.createObjectURL(blob));
            },
            onError: () => {}
          });
        } catch (e) { /* ignore */ }
      }).catch(() => {});
    }

    function loadTrack(i, autoplay) {
      idx = (i + tracks.length) % tracks.length;
      const t = tracks[idx];
      audio.src = t.url;
      titleEl.textContent = t.title || filenameTitle(t.url);
      artistEl.textContent = t.artist || '';
      progressBar.style.width = '0%';
      resolveArt(t);
      if (autoplay) play();
    }

    function ensureGraph() {
      if (actx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        actx = new AC();
        const src = actx.createMediaElementSource(audio);
        analyser = actx.createAnalyser();
        analyser.fftSize = 128;
        analyser.smoothingTimeConstant = 0.82;
        freq = new Uint8Array(analyser.frequencyBinCount);
        src.connect(analyser);
        analyser.connect(actx.destination);
      } catch (e) { /* cross-origin source: playback still works, no waveform */ }
    }

    function resizeCanvas() {
      const r = dock.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = Math.max(1, Math.floor(r.width * dpr));
      canvas.height = Math.max(1, Math.floor(r.height * dpr));
    }

    function draw() {
      rafId = requestAnimationFrame(draw);
      if (!analyser) return;
      analyser.getByteFrequencyData(freq);
      const w = canvas.width, h = canvas.height;
      ctx2d.clearRect(0, 0, w, h);
      const bars = freq.length;
      const bw = w / bars;
      ctx2d.fillStyle = accent();
      ctx2d.globalAlpha = 0.22;
      for (let i = 0; i < bars; i++) {
        const bh = (freq[i] / 255) * h * 0.92;
        ctx2d.fillRect(i * bw + bw * 0.12, h - bh, bw * 0.76, bh);
      }
      ctx2d.globalAlpha = 1;
    }

    function updateBtn() { playBtn.innerHTML = playing ? '<i class="fas fa-pause"></i>' : '<i class="fas fa-play"></i>'; }
    function play() {
      ensureGraph();
      if (actx && actx.state === 'suspended') actx.resume();
      audio.play().then(() => { playing = true; updateBtn(); if (!rafId) draw(); }).catch(() => {});
    }
    function pause() { audio.pause(); playing = false; updateBtn(); }

    playBtn.addEventListener('click', () => (playing ? pause() : play()));
    prevBtn.addEventListener('click', () => loadTrack(idx - 1, true));
    nextBtn.addEventListener('click', () => loadTrack(idx + 1, true));
    audio.addEventListener('ended', () => loadTrack(idx + 1, true));
    audio.addEventListener('timeupdate', () => {
      if (audio.duration) progressBar.style.width = (audio.currentTime / audio.duration * 100) + '%';
    });
    if (vol) vol.addEventListener('input', () => { audio.volume = vol.value / 100; });
    progress.addEventListener('click', (e) => {
      const r = progress.getBoundingClientRect();
      if (audio.duration) audio.currentTime = ((e.clientX - r.left) / r.width) * audio.duration;
    });
    window.addEventListener('resize', resizeCanvas);

    function reveal() {
      document.body.classList.add('has-np');
      dock.classList.add('show');
      resizeCanvas();
      if (cfg.autoplay) play();
    }

    if (document.querySelector('.welcome-screen')) {
      document.addEventListener('welcomeScreenDismissed', reveal, { once: true });
    } else {
      setTimeout(reveal, 500);
    }

    loadTrack(0, false);
  }
})();
