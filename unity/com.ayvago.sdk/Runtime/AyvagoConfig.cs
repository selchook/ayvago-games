using System;

namespace Ayvago
{
    /// <summary>
    /// What the page (the Ayvago WebGL template, TemplateData/ayvago-bridge.js) knows about this
    /// run. Read once at boot and again when the platform handshake finishes
    /// (<see cref="AyvagoSDK.ConfigReady"/>). JsonUtility cannot read null, so the platform's
    /// <c>best</c> (a number, null or absent) arrives as <see cref="hasBest"/> + <see cref="best"/>.
    /// </summary>
    [Serializable]
    public class AyvagoConfig
    {
        /// <summary>The handshake finished: the page knows whether it runs inside Ayvago.</summary>
        public bool handshake;
        /// <summary>Inside the ayvago.com iframe (GHA_START answered). False: standalone.</summary>
        public bool embedded;
        /// <summary>"en" or "tr": the platform locale, <c>?lang=</c>, or the browser language.</summary>
        public string locale = "en";
        /// <summary><c>?lang=tr|en</c> forced the language (tests, store art).</summary>
        public bool langForced;
        /// <summary>False: show no ad buttons at all.</summary>
        public bool adsEnabled;
        /// <summary>The platform sent <c>best</c> (protocol 2.4). False: keep the local best.</summary>
        public bool hasBest;
        /// <summary>The platform's best when <see cref="hasBest"/>; below 0 means <c>null</c> (no score yet).</summary>
        public double best = -1;
        /// <summary>adventurer, explorer, rookie, soldier or zombie; empty: the game's default.</summary>
        public string character = "";
        /// <summary>minimal, cartoon, arcade or retro (empty standalone).</summary>
        public string theme = "";
        /// <summary>light or dark (empty standalone).</summary>
        public string colorMode = "";
        /// <summary>A touch screen: show the touch controls (tablets in landscape included).</summary>
        public bool touch;
        /// <summary>A phone: no hover, a coarse pointer and a screen under 600 px on its short side.</summary>
        public bool phone;
        /// <summary><c>?orient=portrait|landscape</c>, or empty.</summary>
        public string orient = "";
        /// <summary><c>?nointro</c>: skip the brand intro (tests, store art).</summary>
        public bool nointro;
        /// <summary><c>?keyhelp</c>: always show the key help, even on touch screens and to automated browsers.</summary>
        public bool keyhelp;
        /// <summary><c>navigator.webdriver</c>: an automated browser (smoke tests, store art).</summary>
        public bool webdriver;
        /// <summary>The platform id (the slug without hyphens).</summary>
        public string gameId = "";

        public AyvagoConfig Clone()
        {
            return (AyvagoConfig)MemberwiseClone();
        }
    }
}
