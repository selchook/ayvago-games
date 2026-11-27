// The Unity fixture's stand-in for Unity's Build/<name>.framework.js (staged by
// scripts/unity-fixture.mjs, which puts the package's real Ayvago.jslib where the marker below
// is, behind a small Emscripten shim). The game is a tiny canvas game that does what a Unity game
// built on com.ayvago.sdk does, through the same jslib functions and SendMessage entry points:
// AyvagoSDK (config, handshake, pause, mute, locale, ads with the game held), AyvagoRun (one
// GHA_SESSION_START and one GHA_END per run, the continue, the best, minDurationMs), AyvagoAudio
// (one sound switch), AyvagoDifficulty and AyvagoTestHooks (state + commands). Never shipped.
window.unityFramework = function (Module) {
  'use strict';

  // ---- the Emscripten surface a .jslib sees (strings stand in for heap pointers)
  var LibraryManager = { library: {} };
  var mergeInto = function (target, lib) {
    for (var k in lib) target[k] = lib[k];
  };
  var heap = {};
  var nextPtr = 8;
  var _malloc = function () {
    var p = nextPtr;
    nextPtr += 8;
    return p;
  };
  var _free = function (p) {
    delete heap[p];
  };
  var lengthBytesUTF8 = function (s) {
    return new TextEncoder().encode(s).length;
  };
  var stringToUTF8 = function (s, p) {
    heap[p] = s;
  };
  var UTF8ToString = function (p) {
    return typeof p === 'string' ? p : heap[p];
  };

  /*__AYVAGO_JSLIB__*/

  var lib = LibraryManager.library;
  // C# marshalling: a returned string is read from the heap and freed; arguments go in as strings
  function configJson() {
    var p = lib.AyvagoConfigJson();
    var s = UTF8ToString(p);
    _free(p);
    return s;
  }
  function call(method, arg) {
    lib.AyvagoCall(method, arg || '');
  }

  // ---- AyvagoSDK / AyvagoPrefs
  var cfg = JSON.parse(configJson());
  var ready = false;
  var MIN_DURATION_MS = 1000; // game.json platform.scoring.minDurationMs
  var OFFERS_CONTINUE = true;
  var OFFERS_DIFFICULTY = true;
  var key = function (k) {
    return 'ayvago.' + k + '.' + (cfg.gameId || 'unityfixture');
  };
  var prefs = {
    get: function (k, d) {
      var v = localStorage.getItem(key(k));
      return v === null ? d : v;
    },
    set: function (k, v) {
      localStorage.setItem(key(k), String(v));
    },
    del: function (k) {
      localStorage.removeItem(key(k));
    },
  };
  var timeScale = 1;
  var audioPaused = false;
  var adShowing = false;
  var pendingAds = {};
  var nextAd = 1;

  var muted = prefs.get('muted', 'false') === 'true';
  var difficulty = prefs.get('difficulty', 'normal') === 'easy' ? 'easy' : 'normal';
  var lang = 'en';
  var orientation = cfg.orient || (cfg.phone ? 'portrait' : 'landscape');
  var best = null; // null: none
  (function () {
    var b = prefs.get('best', null);
    if (b !== null && isFinite(Number(b))) best = Number(b);
  })();

  function pickLang() {
    if (cfg.langForced || cfg.embedded) return cfg.locale === 'tr' ? 'tr' : 'en';
    var saved = prefs.get('lang', '');
    return saved === 'tr' || saved === 'en' ? saved : cfg.locale === 'tr' ? 'tr' : 'en';
  }
  lang = pickLang();

  function handshake() {
    if (ready) return;
    ready = true;
    lang = pickLang();
    // protocol 2.4: the platform's best replaces the local one; null clears it
    if (cfg.hasBest) {
      if (cfg.best >= 0) {
        best = cfg.best;
        prefs.set('best', best);
      } else {
        best = null;
        prefs.del('best');
      }
    }
    call('mute', JSON.stringify({ muted: muted }));
    publish();
  }

  function setMuted(m, fromPlatform) {
    muted = m;
    prefs.set('muted', m);
    if (!fromPlatform && ready) call('mute', JSON.stringify({ muted: m }));
    publish();
  }

  function ad(format, placement, done) {
    if (!(cfg.adsEnabled && cfg.embedded) || adShowing) return done(false);
    var id = nextAd++;
    pendingAds[id] = done;
    adShowing = true;
    timeScale = 0;
    audioPaused = true;
    publish();
    call(format, JSON.stringify({ id: id, placement: placement }));
  }

  // ---- AyvagoRun
  var run = { active: false, continues: 0, startedAt: 0, started: 0 };
  function begin() {
    if (run.active) abandon();
    run.active = true;
    run.continues = 0;
    run.started++;
    run.startedAt = performance.now();
    call('sessionStart', '');
  }
  function abandon() {
    if (!run.active) return;
    run.active = false;
    call('gameplayStop', '');
  }
  function end(score, won) {
    if (!run.active) return null;
    run.active = false;
    var practice = OFFERS_DIFFICULTY && difficulty === 'easy';
    if (!won && performance.now() - run.startedAt < MIN_DURATION_MS) {
      call('gameplayStop', '');
      return { sent: false, tooShort: true };
    }
    score = Math.max(0, Math.round(score));
    var newBest = !practice && (best === null ? score > 0 : score > best);
    if (newBest) {
      best = score;
      prefs.set('best', best);
    }
    var msg = { score: score, won: !!won, difficulty: practice ? 'easy' : 'normal' };
    if (run.continues) msg.continues = 1;
    call('end', JSON.stringify(msg));
    if (newBest) call('celebrate', '');
    return { sent: true, newBest: newBest };
  }
  function canContinue() {
    return run.active && OFFERS_CONTINUE && run.continues === 0 && cfg.adsEnabled && cfg.embedded && !adShowing;
  }

  // ---- the game
  var canvas = Module.canvas;
  var ctx = canvas.getContext('2d');
  var W = orientation === 'landscape' ? 1280 : 720;
  var H = orientation === 'landscape' ? 720 : 1280;
  var T = {
    en: { title: 'UNITY FIXTURE', play: 'PLAY', best: 'BEST', paused: 'PAUSED', resume: 'RESUME', retry: 'RETRY', menu: 'MENU', over: 'GAME OVER', newBest: 'NEW BEST!', cont: 'CONTINUE', easy: 'EASY', normal: 'NORMAL', score: 'SCORE', sound: 'SOUND' },
    tr: { title: 'UNITY DENEME', play: 'OYNA', best: 'EN İYİ', paused: 'DURAKLATILDI', resume: 'DEVAM', retry: 'TEKRAR', menu: 'MENÜ', over: 'OYUN BİTTİ', newBest: 'YENİ REKOR!', cont: 'DEVAM ET', easy: 'KOLAY', normal: 'NORMAL', score: 'SKOR', sound: 'SES' },
  };
  var t = function (k) {
    return T[lang][k];
  };

  var screen = cfg.nointro ? 'menu' : 'intro';
  var introT = 0;
  var g = null; // the round
  var result = null; // { score, newBest, offer }
  var buttons = [];
  var keys = {};
  var stageName = '';

  function newRound() {
    g = { x: W / 2, y: H / 2, vx: 0, vy: 0, score: 0, lives: OFFERS_DIFFICULTY && difficulty === 'easy' ? 5 : 3, coins: [], foes: [], time: 0, hurt: 0 };
    for (var i = 0; i < 6; i++) g.coins.push(spot());
    g.foes.push({ x: 80, y: 80, vx: 260, vy: 190 });
  }
  function spot() {
    return { x: 60 + Math.random() * (W - 120), y: 140 + Math.random() * (H - 220) };
  }

  function go(s) {
    screen = s;
    publish();
  }
  function startRound() {
    newRound();
    result = null;
    begin();
    go('play');
  }
  function finishRound() {
    // the result screen: the continue offer holds GHA_END back until the player decides
    var offer = canContinue();
    result = { score: g.score, newBest: false, offer: offer, sent: false };
    if (!offer) sendEnd();
    go('result');
  }
  function sendEnd() {
    if (result.sent) return;
    result.sent = true;
    result.offer = false;
    var r = end(result.score, false);
    result.newBest = !!(r && r.newBest);
  }
  function acceptContinue() {
    if (!result || !result.offer) return;
    ad('rewarded', 'continue', function (ok) {
      if (ok && run.active) {
        run.continues = 1;
        result = null;
        g.lives = 1;
        g.hurt = 1.5;
        go('play');
      } else {
        sendEnd();
        publish();
      }
    });
  }
  function retry() {
    if (screen === 'pause') abandon();
    if (screen === 'result') sendEnd();
    var replay = screen === 'result' && run.started % 3 === 0;
    if (replay) ad('interstitial', 'replay', startRound);
    else startRound();
  }
  function toMenu() {
    if (screen === 'pause') {
      abandon();
      go('menu');
      return;
    }
    if (screen === 'result') {
      sendEnd();
      ad('interstitial', 'menu', function () {
        go('menu');
      });
    }
  }
  function pause() {
    if (screen === 'play') go('pause');
  }

  // ---- SendMessage('AyvagoSDK', ...)
  var handlers = {
    OnPlatformConfig: function (a) {
      cfg = a;
      if (a.handshake) handshake();
    },
    OnPlatformPause: function () {
      pause();
    },
    OnPlatformResume: function () {},
    OnPlatformMute: function (a) {
      setMuted(!!a.muted, true);
    },
    OnPlatformLocale: function (a) {
      lang = a.locale === 'tr' ? 'tr' : 'en';
      publish();
    },
    OnPlatformTheme: function () {},
    OnAdResult: function (a) {
      var done = pendingAds[a.id];
      if (!done) return;
      delete pendingAds[a.id];
      adShowing = false;
      timeScale = 1;
      audioPaused = false;
      publish();
      done(!!a.rewarded);
    },
    OnTestCommand: function (a) {
      command(a.name, a.arg || '');
    },
  };
  Module.SendMessage = function (object, method, value) {
    if (object !== 'AyvagoSDK') return console.warn('SendMessage: object ' + object + ' not found!');
    var h = handlers[method];
    if (!h) return console.warn('SendMessage: method ' + method + ' not found');
    h(value ? JSON.parse(value) : {});
  };

  // ---- AyvagoTestHooks
  function command(name, arg) {
    switch (name) {
      case 'sound':
        setMuted(!muted, false);
        break;
      case 'difficulty':
        difficulty = arg === 'easy' ? 'easy' : 'normal';
        prefs.set('difficulty', difficulty);
        publish();
        break;
      case 'locale':
        lang = arg === 'tr' ? 'tr' : 'en';
        prefs.set('lang', lang);
        publish();
        break;
      case 'play':
        if (screen === 'menu' || screen === 'intro') startRound();
        break;
      case 'pause':
        pause();
        break;
      case 'resume':
        if (screen === 'pause') go('play');
        break;
      case 'retry':
        if (screen === 'pause' || screen === 'result') retry();
        break;
      case 'menu':
        toMenu();
        break;
      case 'end':
        if (screen === 'pause') screen = 'play';
        if (screen === 'play') {
          g.score += Number(arg) || 0;
          finishRound();
        }
        break;
      case 'continue':
        acceptContinue();
        break;
      case 'stage':
        stageName = arg;
        if (g && arg === 'busy') for (var i = 0; i < 12; i++) g.coins.push(spot());
        break;
    }
  }
  var lastState = '';
  function publish() {
    var s = {
      engine: 'unity', sdk: '0.1.0', screen: screen, score: g && screen !== 'menu' ? g.score : 0, level: 0, extra: stageName,
      orientation: orientation, locale: lang, embedded: !!cfg.embedded, difficulty: OFFERS_DIFFICULTY && difficulty === 'easy' ? 'easy' : 'normal',
      offersDifficulty: OFFERS_DIFFICULTY, offersContinue: OFFERS_CONTINUE, continueOffered: !!(result && result.offer && screen === 'result'),
      runActive: run.active, continues: run.continues, hasBest: best !== null, best: best === null ? 0 : best,
      muted: muted, silenced: muted || audioPaused, adShowing: adShowing, timeScale: timeScale,
    };
    var json = JSON.stringify(s);
    if (json === lastState) return;
    lastState = json;
    lib.AyvagoPublishState(json);
  }

  // ---- input
  function toDesign(e) {
    var r = canvas.getBoundingClientRect();
    var k = Math.min(r.width / W, r.height / H);
    var ox = (r.width - W * k) / 2, oy = (r.height - H * k) / 2;
    return { x: (e.clientX - r.left - ox) / k, y: (e.clientY - r.top - oy) / k };
  }
  canvas.addEventListener('pointerdown', function (e) {
    if (screen === 'intro') return go('menu');
    var p = toDesign(e);
    for (var i = buttons.length - 1; i >= 0; i--) {
      var b = buttons[i];
      if (p.x >= b.x - b.w / 2 && p.x <= b.x + b.w / 2 && p.y >= b.y - b.h / 2 && p.y <= b.y + b.h / 2) return b.fn();
    }
    if (screen === 'play' && g) {
      g.tx = p.x;
      g.ty = p.y;
    }
  });
  window.addEventListener('keydown', function (e) {
    keys[e.code] = true;
    if (screen === 'intro') return go('menu');
    if (e.code === 'Escape' || e.code === 'KeyP') {
      if (screen === 'play') pause();
      else if (screen === 'pause') go('play');
    }
    if (e.code === 'Enter' || e.code === 'Space') {
      if (screen === 'menu') startRound();
      else if (screen === 'result') retry();
    }
  });
  window.addEventListener('keyup', function (e) {
    keys[e.code] = false;
  });

  // ---- loop
  function update(dt) {
    if (screen === 'intro') {
      introT += dt;
      if (introT > 2) go('menu');
      return;
    }
    if (screen !== 'play' || !g) return;
    g.time += dt;
    var ax = (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0);
    var ay = (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0);
    if (g.tx !== undefined) {
      var dx = g.tx - g.x, dy = g.ty - g.y, d = Math.hypot(dx, dy);
      if (d > 8) { ax = dx / d; ay = dy / d; } else g.tx = undefined;
    }
    g.x = Math.max(30, Math.min(W - 30, g.x + ax * 420 * dt));
    g.y = Math.max(110, Math.min(H - 30, g.y + ay * 420 * dt));
    g.hurt = Math.max(0, g.hurt - dt);
    g.coins.forEach(function (c, i) {
      if (Math.hypot(c.x - g.x, c.y - g.y) < 44) {
        g.score += 10;
        g.coins[i] = spot();
      }
    });
    g.foes.forEach(function (f) {
      f.x += f.vx * dt;
      f.y += f.vy * dt;
      if (f.x < 30 || f.x > W - 30) f.vx *= -1;
      if (f.y < 110 || f.y > H - 30) f.vy *= -1;
      if (!g.hurt && Math.hypot(f.x - g.x, f.y - g.y) < 50) {
        g.lives--;
        g.hurt = 1.5;
      }
    });
    if (g.time > 4 && g.foes.length < 3 && Math.random() < dt * 0.2) g.foes.push({ x: W - 80, y: 140, vx: -230, vy: 210 });
    if (g.lives <= 0) finishRound();
    else publish();
  }

  function button(label, x, y, w, h, fn, color) {
    buttons.push({ x: x, y: y, w: w, h: h, fn: fn });
    ctx.fillStyle = color || '#ec3013';
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, h / 2);
    ctx.fill();
    text(label, x, y + 2, 34, '#fff');
  }
  function text(s, x, y, size, color) {
    ctx.fillStyle = color;
    ctx.font = '700 ' + size + 'px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  function chip(s, x, y) {
    ctx.font = '700 26px system-ui, sans-serif';
    var w = ctx.measureText(s).width + 36;
    ctx.fillStyle = 'rgba(20,24,44,0.55)';
    ctx.beginPath();
    ctx.roundRect(x, y - 22, w, 44, 22);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fff';
    ctx.fillText(s, x + 18, y + 1);
  }

  function draw() {
    var r = canvas.getBoundingClientRect();
    var dpr = Module.config.devicePixelRatio || 1;
    var cw = Math.max(1, Math.round(r.width * dpr)), ch = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== cw || canvas.height !== ch) {
      canvas.width = cw;
      canvas.height = ch;
    }
    var k = Math.min(cw / W, ch / H);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#05060c';
    ctx.fillRect(0, 0, cw, ch);
    ctx.setTransform(k, 0, 0, k, (cw - W * k) / 2, (ch - H * k) / 2);
    var sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#1b2a6b');
    sky.addColorStop(1, '#3a8f6a');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);
    buttons = [];
    if (screen === 'intro') {
      ctx.fillStyle = '#201e1d';
      ctx.fillRect(0, 0, W, H);
      text('AYVAGO', W / 2, H / 2, 120, '#f3f2f2');
      return;
    }
    if (g && screen !== 'menu') {
      g.coins.forEach(function (c) {
        ctx.fillStyle = '#ffd23f';
        ctx.beginPath();
        ctx.arc(c.x, c.y, 18, 0, Math.PI * 2);
        ctx.fill();
      });
      g.foes.forEach(function (f) {
        ctx.fillStyle = '#ff3b3b';
        ctx.beginPath();
        ctx.arc(f.x, f.y, 26, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.fillStyle = g.hurt > 0 && Math.floor(g.hurt * 10) % 2 ? '#9ad7ff' : '#3ee6ff';
      ctx.fillRect(g.x - 26, g.y - 26, 52, 52);
      chip(t('score') + ' ' + g.score, 16, 50);
      chip('♥ ' + g.lives, W - 230, 50);
      button('II', W - 52, 50, 72, 72, pause, 'rgba(20,24,44,0.7)');
    }
    if (screen === 'menu') {
      text(t('title'), W / 2, H * 0.28, 84, '#fff');
      text(t('best') + ': ' + (best === null ? 0 : best), W / 2, H * 0.4, 36, '#ffd23f');
      button(t('play'), W / 2, H * 0.55, 320, 110, startRound);
      button(difficulty === 'easy' ? t('easy') : t('normal'), W / 2, H * 0.55 + 120, 240, 70, function () {
        command('difficulty', difficulty === 'easy' ? 'normal' : 'easy');
      }, '#5a4bd6');
      button(muted ? '🔇' : '🔊', 60, H - 60, 80, 80, function () {
        setMuted(!muted, false);
      }, 'rgba(20,24,44,0.7)');
    }
    if (screen === 'pause' || screen === 'result') {
      ctx.fillStyle = 'rgba(5,8,20,0.6)';
      ctx.fillRect(0, 0, W, H);
    }
    if (screen === 'pause') {
      text(t('paused'), W / 2, H * 0.28, 64, '#fff');
      button(t('resume'), W / 2, H * 0.45, 320, 90, function () {
        go('play');
      });
      button(t('retry'), W / 2, H * 0.58, 320, 90, retry, '#5a4bd6');
      button(t('menu'), W / 2, H * 0.71, 320, 90, toMenu, '#5a4bd6');
    }
    if (screen === 'result' && result) {
      text(t('over'), W / 2, H * 0.22, 72, '#fff');
      text(t('score') + ': ' + result.score, W / 2, H * 0.34, 44, '#fff');
      text(t('best') + ': ' + (best === null ? 0 : best), W / 2, H * 0.42, 34, '#ffd23f');
      if (result.newBest) text(t('newBest'), W / 2, H * 0.49, 40, '#5dff7a');
      if (result.offer) button(t('cont'), W / 2, H * 0.58, 360, 90, acceptContinue, '#2fa84f');
      button(t('retry'), W / 2, H * 0.7, 320, 90, retry);
      button(t('menu'), W / 2, H * 0.82, 320, 90, toMenu, '#5a4bd6');
    }
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.05, (now - last) / 1000) * timeScale;
    last = now;
    update(dt);
    draw();
    requestAnimationFrame(frame);
  }
  if (cfg.handshake) handshake();
  publish();
  requestAnimationFrame(frame);
};
