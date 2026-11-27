// The Ayvago bridge of the Unity WebGL template (com.ayvago.sdk). It owns the platform adapter
// (ayvago-adapter.js, the official GHA protocol), loads the Unity build and passes messages:
//   page → Unity   unityInstance.SendMessage('AyvagoSDK', 'OnPlatform…', json)   (AyvagoSDK.cs)
//   Unity → page   Ayvago.jslib → window.AyvagoBridge.call(method, json)
// and exposes the test hooks (window.__ayvago, docs/unity/AYVAGO_UNITY_SDK.md §8).
// Unity preprocesses this file when it builds: no triple braces and no lines starting with "#".
(function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var adapter = null; // the PlatformAdapter once the handshake finished
  var unity = null; // the Unity instance once it runs
  var toUnityQueue = []; // messages for Unity before it runs
  var callQueue = []; // calls from Unity before the handshake finished
  var progress = 0;
  var state = null; // the last state the game published (AyvagoTestHooks.Publish)
  var gameId = '';
  var adIds = 0;

  function urlLang() {
    var v = params.get('lang');
    return v === 'tr' || v === 'en' ? v : '';
  }

  function urlOrient() {
    var v = params.get('orient');
    return v === 'portrait' || v === 'landscape' ? v : '';
  }

  function normalizeLang(l) {
    return String(l || 'en').toLowerCase().indexOf('tr') === 0 ? 'tr' : 'en';
  }

  // the device rule shared with the studio (src/core/registry.ts isPhone) and ayvago.com
  function isPhone() {
    try {
      return matchMedia('(hover: none) and (pointer: coarse)').matches && Math.min(screen.width, screen.height) < 600;
    } catch (e) {
      return false;
    }
  }

  // a touch screen (the same test as Phaser's device.input.touch in the studio's games)
  function isTouch() {
    return 'ontouchstart' in document.documentElement || (navigator.maxTouchPoints || 0) >= 1;
  }

  function gameIdOf(id, productName) {
    if (/^[a-z0-9]{3,32}$/.test(id || '')) return id;
    var m = location.pathname.match(/\/games\/([a-z0-9-]+)\/?/);
    if (m) return m[1].replace(/-/g, '');
    return String(productName || 'game').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32) || 'game';
  }

  function locale() {
    return normalizeLang(urlLang() || (adapter ? adapter.locale : navigator.language));
  }

  function toUnity(method, data) {
    var json = JSON.stringify(data || {});
    if (!unity) {
      toUnityQueue.push([method, json]);
      return;
    }
    try {
      unity.SendMessage('AyvagoSDK', method, json);
    } catch (e) {
      console.warn('[ayvago] SendMessage ' + method + ' failed', e);
    }
  }

  function configForUnity() {
    var c = adapter && adapter.config;
    var best = c && 'best' in c ? c.best : undefined;
    return {
      handshake: !!adapter,
      embedded: !!c,
      locale: locale(),
      langForced: !!urlLang(),
      adsEnabled: !!(c && c.adsEnabled),
      hasBest: best !== undefined,
      best: typeof best === 'number' ? best : -1,
      character: (c && c.character) || '',
      theme: (c && c.theme) || '',
      colorMode: (c && c.colorMode) || '',
      touch: isTouch(),
      phone: isPhone(),
      orient: urlOrient(),
      nointro: params.has('nointro'),
      keyhelp: params.has('keyhelp'),
      webdriver: !!navigator.webdriver,
      gameId: gameId,
    };
  }

  function json(arg) {
    if (!arg) return {};
    try {
      return JSON.parse(arg);
    } catch (e) {
      return {};
    }
  }

  function run(method, arg) {
    var a = json(arg);
    switch (method) {
      case 'sessionStart':
        adapter.gameplayStart();
        break;
      case 'gameplayStop':
        adapter.gameplayStop();
        break;
      case 'score':
        adapter.submitScore(a.score);
        break;
      case 'end': {
        var result = { won: !!a.won, difficulty: a.difficulty === 'easy' ? 'easy' : 'normal' };
        if (typeof a.score === 'number') result.score = a.score;
        if (a.continues === 1) result.continues = 1;
        adapter.endGame(result);
        break;
      }
      case 'celebrate':
        adapter.celebrate();
        break;
      case 'mute':
        adapter.reportMute(!!a.muted);
        break;
      case 'leaderboard':
        adapter.openLeaderboard();
        break;
      case 'rewarded':
        adapter.requestRewarded(String(a.placement || '')).then(function (ok) {
          toUnity('OnAdResult', { id: a.id, rewarded: !!ok });
        });
        break;
      case 'interstitial':
        adapter.requestInterstitial(String(a.placement || '')).then(function () {
          toUnity('OnAdResult', { id: a.id, rewarded: false });
        });
        break;
      default:
        console.warn('[ayvago] unknown call ' + method);
    }
  }

  function setProgress(p) {
    progress = Math.max(progress, Math.min(1, Math.max(0, p || 0)));
    var fill = document.querySelector('#ayvago-loader .ayvago-fill');
    if (fill) fill.style.width = Math.round(progress * 100) + '%';
    if (adapter) adapter.loadingProgress(progress);
  }

  function showError(message) {
    var el = document.querySelector('#ayvago-loader .ayvago-error');
    if (el) el.textContent = message;
    console.error('[ayvago] ' + message);
  }

  function onHandshake(a) {
    adapter = a;
    document.documentElement.lang = locale();
    a.onPause(function () {
      toUnity('OnPlatformPause', { reason: 'platform' });
    });
    a.onResume(function () {
      toUnity('OnPlatformResume');
    });
    a.onMute(function (muted) {
      toUnity('OnPlatformMute', { muted: !!muted });
    });
    a.onLocaleChange(function (l) {
      document.documentElement.lang = locale();
      toUnity('OnPlatformLocale', { locale: normalizeLang(l) });
    });
    a.onThemeChange(function (t) {
      toUnity('OnPlatformTheme', { theme: t.theme, colorMode: t.colorMode });
    });
    // GHA_LOADING: the progress so far (the build may have loaded during the handshake)
    a.loadingProgress(progress);
    toUnity('OnPlatformConfig', configForUnity());
    var calls = callQueue;
    callQueue = [];
    calls.forEach(function (c) {
      run(c[0], c[1]);
    });
  }

  window.AyvagoBridge = {
    /** Called by the template's index.html. */
    boot: function (opts) {
      gameId = gameIdOf(opts.gameId, opts.productName);
      document.documentElement.lang = locale();
      window.AyvagoAdapter.createPlatformAdapter({ gameId: gameId }).then(onHandshake, function (e) {
        showError('Platform adapter failed: ' + e);
      });
      document.addEventListener('visibilitychange', function () {
        if (document.hidden) toUnity('OnPlatformPause', { reason: 'hidden' });
      });
      var canvas = document.getElementById('unity-canvas');
      // keys reach the game inside the platform's iframe once it was clicked or tapped
      canvas.addEventListener('pointerdown', function () {
        window.focus();
      });
      var config = opts.config;
      config.devicePixelRatio = Math.min(window.devicePixelRatio || 1, opts.maxDevicePixelRatio || 2);
      config.showBanner = function (message, type) {
        if (type === 'error') showError(message);
        else console.warn('[unity] ' + message);
      };
      var script = document.createElement('script');
      script.src = opts.loaderUrl;
      script.onerror = function () {
        showError('Could not load ' + opts.loaderUrl);
      };
      script.onload = function () {
        window
          .createUnityInstance(canvas, config, setProgress)
          .then(function (instance) {
            unity = instance;
            setProgress(1);
            var queued = toUnityQueue;
            toUnityQueue = [];
            queued.forEach(function (m) {
              toUnity(m[0], JSON.parse(m[1]));
            });
            var loader = document.getElementById('ayvago-loader');
            if (loader) loader.className = 'ayvago-done';
          })
          .catch(function (e) {
            showError(String((e && e.message) || e));
          });
      };
      document.body.appendChild(script);
    },

    /** Ayvago.jslib AyvagoConfigJson: what AyvagoConfig.cs reads. */
    configForUnity: configForUnity,

    /** Ayvago.jslib AyvagoCall: a platform call from C#. Held until the handshake finished. */
    call: function (method, arg) {
      if (adapter) run(method, arg);
      else callQueue.push([method, arg]);
    },

    /** Ayvago.jslib AyvagoPublishState: the game's test-hook state. */
    publish: function (s) {
      state = json(s);
    },
  };

  // The test hooks (docs/unity/AYVAGO_UNITY_SDK.md §8): smoke tests, the platform harness and the
  // store-art capture drive the game through these.
  window.__ayvago = {
    engine: 'unity',
    /** Unity runs and the game has published a state. */
    get ready() {
      return !!unity && state !== null;
    },
    /** The last state the game published: { screen, score, level, orientation, locale, ... }. */
    state: function () {
      return state;
    },
    /** Sends a command to the game: play, pause, resume, retry, menu, end [score], continue, stage <name>, sound, difficulty <easy|normal>, locale <en|tr>. */
    command: function (name, arg) {
      if (!unity) return false;
      toUnity('OnTestCommand', { name: String(name), arg: arg === undefined || arg === null ? '' : String(arg) });
      return true;
    },
    get orientation() {
      return state ? state.orientation : null;
    },
    get locale() {
      return state ? state.locale : locale();
    },
    get embedded() {
      return !!(adapter && adapter.config);
    },
    get progress() {
      return progress;
    },
    get gameId() {
      return gameId;
    },
  };
})();
