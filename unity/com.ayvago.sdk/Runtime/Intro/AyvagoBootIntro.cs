// AyvagoBootIntro.cs — Ayvago Games boot intro, ported 1:1 from the HTML piece.
// Owner-supplied brand asset (docs/assets/LICENSES.md). The choreography (timings, geometry,
// easing, colours) is the brand owner's: do not change it.
// Package changes from the original: namespace Ayvago; nextScene "" loads the next build index;
// ?nointro skips straight on; the test hooks see screen "intro"; the skip works with both the
// Input System package and the legacy Input Manager.
// In the package the sprites are Runtime/Resources/AyvagoBoot/boot_*.png.
// New empty scene "Boot" -> empty GameObject -> add this component -> make Boot the first scene
// in Build Settings (the game's first scene right after it). The whole UI (canvas, images,
// layout) is built at runtime; nothing to wire.

using System.Collections;
using UnityEngine;
using UnityEngine.UI;
using UnityEngine.SceneManagement;
#if ENABLE_INPUT_SYSTEM && AYVAGO_INPUT_SYSTEM
using UnityEngine.InputSystem;
#endif

namespace Ayvago
{
    [DisallowMultipleComponent]
    public class AyvagoBootIntro : MonoBehaviour
    {
        [Header("Flow")]
        public string nextScene = "";             // "": the next scene in Build Settings
        public bool allowSkipOnTap = true;
        public float speed = 1f;                  // 1 = authored 5.3s

        [Header("Brand")]
        public Color ground = new Color32(0x20, 0x1e, 0x1d, 0xff);   // mürekkep
        public Color accent = new Color32(0xec, 0x30, 0x13, 0xff);   // kırmızı
        public Color paper  = new Color32(0xf3, 0xf2, 0xf2, 0xff);

        // authored scene lengths (Tohum / İsim / Kilit / Bekleme)
        const float S1 = 1.5f, S2 = 1.5f, S3 = 1.4f, S4 = 0.9f;

        // lockup geometry at the 1920x1080 reference resolution
        const float FS = 168f;                    // wordmark size
        const float MARK = FS * 0.86f;            // mark diameter
        const float LETTERS_W = 1148f, LETTERS_H = 336f;
        const float ROW_W = LETTERS_W + 5f + MARK;
        const float GAMES_W = 364f, GAMES_H = 66f, RULE_W = 332f;
        const float BIG = 2.15f;

        RectTransform lockup, markSlot, markInner, letters, lettersMask, rule, games;
        Image ringImg;
        RectTransform[] seeds = new RectTransform[5];
        float t;
        bool done;

        void Awake()
        {
            Application.targetFrameRate = 60;
            if (AyvagoSDK.Config.nointro) { done = true; return; }   // ?nointro: Start goes straight on
            AyvagoTestHooks.Publish(AyvagoScreen.Intro);
            Build();
        }

        void Start()
        {
            if (done) Next();
        }

        void Build()
        {
            var canvasGo = new GameObject("AyvagoBootCanvas",
                typeof(Canvas), typeof(CanvasScaler), typeof(GraphicRaycaster));
            canvasGo.transform.SetParent(transform, false);
            var canvas = canvasGo.GetComponent<Canvas>();
            canvas.renderMode = RenderMode.ScreenSpaceOverlay;
            canvas.sortingOrder = 32000;
            var scaler = canvasGo.GetComponent<CanvasScaler>();
            scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
            scaler.referenceResolution = new Vector2(1920f, 1080f);
            scaler.matchWidthOrHeight = 0.5f;

            // ground
            var bg = NewImage("Ground", canvasGo.transform, null, ground);
            Stretch(bg.rectTransform);

            lockup = NewRect("Lockup", canvasGo.transform, new Vector2(0f, 0f), new Vector2(ROW_W, 600f));

            // AYVAG, revealed by a widening mask (the HTML wipe)
            lettersMask = NewRect("LettersMask", lockup, new Vector2(-ROW_W * 0.5f + LETTERS_W * 0.5f, 52f),
                                  new Vector2(LETTERS_W, LETTERS_H));
            lettersMask.gameObject.AddComponent<RectMask2D>();
            lettersMask.pivot = new Vector2(0f, 0.5f);
            lettersMask.anchoredPosition = new Vector2(-ROW_W * 0.5f, 52f);

            var lettersImg = NewImage("Letters", lettersMask, Load("boot_ayvag"), paper);
            letters = lettersImg.rectTransform;
            letters.pivot = new Vector2(0f, 0.5f);
            letters.anchorMin = letters.anchorMax = new Vector2(0f, 0.5f);
            letters.anchoredPosition = Vector2.zero;
            letters.sizeDelta = new Vector2(LETTERS_W, LETTERS_H);

            // mark: outer slot holds the final position, inner does the travel + scale
            markSlot = NewRect("MarkSlot", lockup, new Vector2(ROW_W * 0.5f - MARK * 0.5f, 52f - 6f),
                               new Vector2(MARK, MARK));
            markInner = NewRect("MarkInner", markSlot, Vector2.zero, new Vector2(MARK, MARK));

            ringImg = NewImage("Ring", markInner, Load("boot_ring"), paper);
            Stretch(ringImg.rectTransform);
            ringImg.type = Image.Type.Filled;
            ringImg.fillMethod = Image.FillMethod.Radial360;
            ringImg.fillOrigin = (int)Image.Origin360.Top;
            ringImg.fillClockwise = true;
            ringImg.fillAmount = 0f;

            var seedSprite = Load("boot_seed");
            for (int i = 0; i < 5; i++)
            {
                var pivot = NewRect("SeedPivot" + i, markInner, Vector2.zero, new Vector2(MARK, MARK));
                pivot.localRotation = Quaternion.Euler(0f, 0f, -72f * i);
                var s = NewImage("Seed" + i, pivot, seedSprite, accent);
                seeds[i] = s.rectTransform;
                seeds[i].sizeDelta = new Vector2(MARK * 0.13f, MARK * 0.21f);
                seeds[i].anchoredPosition = new Vector2(0f, MARK * 0.19f);
                seeds[i].localScale = Vector3.zero;
            }

            // rule + GAMES
            rule = NewImage("Rule", lockup, null, accent).rectTransform;
            rule.pivot = new Vector2(0f, 0.5f);
            rule.anchoredPosition = new Vector2(-361f, -104f);
            rule.sizeDelta = new Vector2(RULE_W, 3f);
            rule.localScale = new Vector3(0f, 1f, 1f);

            var gamesImg = NewImage("Games", lockup, Load("boot_games"), paper);
            games = gamesImg.rectTransform;
            games.anchoredPosition = new Vector2(179f, -104f);
            games.sizeDelta = new Vector2(GAMES_W, GAMES_H);
            SetAlpha(gamesImg, 0f);
        }

        void Update()
        {
            if (done) return;

            if (allowSkipOnTap && SkipPressed())
            { Finish(); return; }

            t += Time.unscaledDeltaTime * Mathf.Max(0.1f, speed);
            Render(t);
            if (t >= S1 + S2 + S3 + S4) Finish();
        }

        // one clock, the same choreography as the HTML scenes
        void Render(float time)
        {
            // --- Tohum: ring draws, seeds pop, mark alone at frame centre
            float ring = EaseInOut(Seg(time, 0.09f, 0.69f));
            ringImg.fillAmount = ring;
            for (int i = 0; i < 5; i++)
            {
                float s = EaseOutBack(Seg(time, 0.63f + i * 0.1125f, 1.05f + i * 0.1125f));
                seeds[i].localScale = new Vector3(s, s, 1f);
                seeds[i].anchoredPosition = new Vector2(0f, Mathf.Lerp(MARK * 0.06f, MARK * 0.19f, s));
            }

            // --- İsim: mark travels into the O slot, letters wipe in
            float j = EaseInOut(Seg(time, S1 + 0.06f, S1 + 0.87f));
            float pop = EaseOutBack(Seg(time, 0.03f, 0.6f));
            markInner.localScale = Vector3.one * Mathf.Lerp(BIG * Mathf.Lerp(0.86f, 1f, pop), 1f, j);
            Vector2 slot = markSlot.anchoredPosition;
            markInner.anchoredPosition = Vector2.Lerp(new Vector2(-slot.x, -slot.y), Vector2.zero, j);

            float wipe = EaseOut(Seg(time, S1 + 0.6f, S1 + 1.35f));
            lettersMask.sizeDelta = new Vector2(LETTERS_W * wipe, LETTERS_H);

            // --- Kilit: rule draws, GAMES tracks in
            float r = EaseInOut(Seg(time, S1 + S2 + 0.06f, S1 + S2 + 0.7f));
            rule.localScale = new Vector3(r, 1f, 1f);
            var gi = games.GetComponent<Image>();
            float g = EaseOut(Seg(time, S1 + S2 + 0.48f, S1 + S2 + 1.15f));
            SetAlpha(gi, g);
            games.anchoredPosition = new Vector2(179f + (1f - g) * 26f, -104f);

            // --- slow push, all the way through Bekleme
            float drift = Mathf.Lerp(1f, 1.05f, EaseInOut(Seg(time, S1 + S2, S1 + S2 + S3 + S4)));
            lockup.localScale = new Vector3(drift, drift, 1f);
        }

        void Finish()
        {
            done = true;
            Next();
        }

        void Next()
        {
            if (!string.IsNullOrEmpty(nextScene)) SceneManager.LoadScene(nextScene);
            else if (SceneManager.GetActiveScene().buildIndex + 1 < SceneManager.sceneCountInBuildSettings)
                SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex + 1);
            else Destroy(gameObject);
        }

        // a tap, a click or any key, under whichever input backend the project uses
        static bool SkipPressed()
        {
#if ENABLE_INPUT_SYSTEM && AYVAGO_INPUT_SYSTEM
            var k = Keyboard.current;
            var m = Mouse.current;
            var ts = Touchscreen.current;
            if (k != null && k.anyKey.wasPressedThisFrame) return true;
            if (m != null && m.leftButton.wasPressedThisFrame) return true;
            if (ts != null && ts.primaryTouch.press.wasPressedThisFrame) return true;
#endif
#if ENABLE_LEGACY_INPUT_MANAGER
            if (Input.GetMouseButtonDown(0) || Input.touchCount > 0 || Input.anyKeyDown) return true;
#endif
            return false;
        }

        // ---- helpers ----
        static float Seg(float t, float a, float b) => Mathf.Clamp01((t - a) / (b - a));
        static float EaseOut(float p) => 1f - Mathf.Pow(1f - p, 3f);
        static float EaseInOut(float p) => p < 0.5f ? 4f * p * p * p : 1f - Mathf.Pow(-2f * p + 2f, 3f) / 2f;
        static float EaseOutBack(float p)
        {
            const float c1 = 1.70158f, c3 = c1 + 1f;
            return 1f + c3 * Mathf.Pow(p - 1f, 3f) + c1 * Mathf.Pow(p - 1f, 2f);
        }

        static Sprite Load(string n)
        {
            var s = Resources.Load<Sprite>("AyvagoBoot/" + n);
            if (s == null) Debug.LogWarning("[AyvagoBoot] eksik sprite: Resources/AyvagoBoot/" + n);
            return s;
        }

        static void SetAlpha(Image img, float a)
        {
            var c = img.color; c.a = a; img.color = c;
        }

        static RectTransform NewRect(string name, Transform parent, Vector2 pos, Vector2 size)
        {
            var go = new GameObject(name, typeof(RectTransform));
            go.transform.SetParent(parent, false);
            var rt = (RectTransform)go.transform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.pivot = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = pos;
            rt.sizeDelta = size;
            return rt;
        }

        static Image NewImage(string name, Transform parent, Sprite sprite, Color color)
        {
            var go = new GameObject(name, typeof(RectTransform), typeof(CanvasRenderer), typeof(Image));
            go.transform.SetParent(parent, false);
            var img = go.GetComponent<Image>();
            img.sprite = sprite;
            img.color = color;
            img.raycastTarget = false;
            return img;
        }

        static void Stretch(RectTransform rt)
        {
            rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
            rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        }
    }
}
