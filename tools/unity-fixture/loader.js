// The Unity fixture's stand-in for Unity's Build/<name>.loader.js (tools/unity-fixture, staged by
// scripts/unity-fixture.mjs). Like the real loader it defines createUnityInstance(canvas, config,
// onProgress): it downloads the data and code files (reporting progress), loads the framework
// script and resolves to an instance with SendMessage. The "framework" is a tiny canvas game
// (framework.js) that calls the real Ayvago.jslib the way the C# SDK does. Never shipped.
(function () {
  'use strict';

  function download(url, onProgress) {
    return fetch(url).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + url);
      var total = Number(res.headers.get('content-length')) || 0;
      if (!res.body || !total) return res.arrayBuffer();
      var reader = res.body.getReader();
      var got = 0;
      function pump() {
        return reader.read().then(function (r) {
          if (r.done) return got;
          got += r.value.length;
          onProgress(Math.min(1, got / total));
          return pump();
        });
      }
      return pump();
    });
  }

  function script(url) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = function () {
        reject(new Error('could not load ' + url));
      };
      document.body.appendChild(s);
    });
  }

  window.createUnityInstance = function (canvas, config, onProgress) {
    var report = typeof onProgress === 'function' ? onProgress : function () {};
    report(0);
    return download(config.dataUrl, function (p) {
      report(0.05 + 0.6 * p);
    })
      .then(function () {
        return download(config.codeUrl, function (p) {
          report(0.65 + 0.2 * p);
        });
      })
      .then(function () {
        return script(config.frameworkUrl);
      })
      .then(function () {
        var Module = { canvas: canvas, config: config };
        window.unityFramework(Module);
        report(1);
        return {
          Module: Module,
          SendMessage: function (gameObject, method, value) {
            Module.SendMessage(gameObject, method, value);
          },
          SetFullscreen: function () {},
          Quit: function () {
            return Promise.resolve();
          },
        };
      });
  };
})();
