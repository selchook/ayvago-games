// The C# side of the Ayvago bridge (AyvagoSDK.cs, AyvagoTestHooks.cs). Everything else lives in the
// WebGL template's TemplateData/ayvago-bridge.js (window.AyvagoBridge), which owns the platform
// adapter; these functions only pass strings across. Without the Ayvago template they do nothing.
var AyvagoLibrary = {
  // The page's config as JSON (AyvagoConfig.cs). The caller frees the returned buffer.
  AyvagoConfigJson: function () {
    var bridge = window.AyvagoBridge;
    var json = JSON.stringify(bridge ? bridge.configForUnity() : {});
    var size = lengthBytesUTF8(json) + 1;
    var buffer = _malloc(size);
    stringToUTF8(json, buffer, size);
    return buffer;
  },

  // A platform call: sessionStart, gameplayStop, score, end, celebrate, mute, leaderboard,
  // rewarded, interstitial; arg is JSON or "".
  AyvagoCall: function (method, arg) {
    var bridge = window.AyvagoBridge;
    if (bridge) bridge.call(UTF8ToString(method), UTF8ToString(arg));
  },

  // The test-hook state (AyvagoTestHooks.Publish): window.__ayvago.state() returns it parsed.
  AyvagoPublishState: function (json) {
    var bridge = window.AyvagoBridge;
    if (bridge) bridge.publish(UTF8ToString(json));
  },
};

mergeInto(LibraryManager.library, AyvagoLibrary);
