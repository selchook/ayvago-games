// Compile-only stubs of the UnityEngine API the Ayvago package uses, so `npm run check:unity`
// can type-check it with mcs where Unity is not installed. Signatures follow the real API
// (Unity 2022.3 / Unity 6); bodies are empty. Never shipped: only the check compiles them.
// Add a member here only with its real signature.
using System;

namespace UnityEngine
{
    public class Object
    {
        public string name { get { throw null; } set { } }
        public HideFlags hideFlags { get { throw null; } set { } }
        public static void Destroy(Object obj) { }
        public static void DontDestroyOnLoad(Object target) { }
        public static implicit operator bool(Object exists) { throw null; }
        public static bool operator ==(Object x, Object y) { throw null; }
        public static bool operator !=(Object x, Object y) { throw null; }
        public override bool Equals(object other) { throw null; }
        public override int GetHashCode() { throw null; }
    }

    public class Component : Object
    {
        public Transform transform { get { throw null; } }
        public GameObject gameObject { get { throw null; } }
        public T GetComponent<T>() { throw null; }
    }

    public class Behaviour : Component
    {
        public bool enabled { get { throw null; } set { } }
    }

    public class MonoBehaviour : Behaviour
    {
    }

    public sealed class GameObject : Object
    {
        public GameObject(string name) { }
        public GameObject(string name, params Type[] components) { }
        public Transform transform { get { throw null; } }
        public T AddComponent<T>() where T : Component { throw null; }
        public T GetComponent<T>() { throw null; }
        public void SetActive(bool value) { }
    }

    public class Transform : Component, System.Collections.IEnumerable
    {
        public Transform parent { get { throw null; } set { } }
        public Quaternion localRotation { get { throw null; } set { } }
        public Vector3 localScale { get { throw null; } set { } }
        public void SetParent(Transform parent, bool worldPositionStays) { }
        public void SetAsLastSibling() { }
        public System.Collections.IEnumerator GetEnumerator() { throw null; }
    }

    public sealed class RectTransform : Transform
    {
        public Rect rect { get { throw null; } }
        public Vector2 anchorMin { get { throw null; } set { } }
        public Vector2 anchorMax { get { throw null; } set { } }
        public Vector2 anchoredPosition { get { throw null; } set { } }
        public Vector2 sizeDelta { get { throw null; } set { } }
        public Vector2 pivot { get { throw null; } set { } }
        public Vector2 offsetMin { get { throw null; } set { } }
        public Vector2 offsetMax { get { throw null; } set { } }
    }

    [Flags]
    public enum HideFlags
    {
        None = 0,
        HideInHierarchy = 1,
        HideInInspector = 2,
        DontSaveInEditor = 4,
        NotEditable = 8,
        DontSaveInBuild = 16,
        DontUnloadUnusedAsset = 32,
        DontSave = 52,
        HideAndDontSave = 61,
    }

    public struct Vector2
    {
        public float x;
        public float y;
        public Vector2(float x, float y) { this.x = x; this.y = y; }
        public static Vector2 zero { get { throw null; } }
        public static Vector2 one { get { throw null; } }
        public float magnitude { get { throw null; } }
        public Vector2 normalized { get { throw null; } }
        public static float Dot(Vector2 lhs, Vector2 rhs) { throw null; }
        public static Vector2 Lerp(Vector2 a, Vector2 b, float t) { throw null; }
        public static Vector2 operator +(Vector2 a, Vector2 b) { throw null; }
        public static Vector2 operator -(Vector2 a, Vector2 b) { throw null; }
        public static Vector2 operator -(Vector2 a) { throw null; }
        public static Vector2 operator *(Vector2 a, float d) { throw null; }
        public static Vector2 operator *(float d, Vector2 a) { throw null; }
        public static Vector2 operator /(Vector2 a, float d) { throw null; }
        public static bool operator ==(Vector2 lhs, Vector2 rhs) { throw null; }
        public static bool operator !=(Vector2 lhs, Vector2 rhs) { throw null; }
        public override bool Equals(object other) { throw null; }
        public override int GetHashCode() { throw null; }
    }

    public struct Vector3
    {
        public float x;
        public float y;
        public float z;
        public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }
        public static Vector3 zero { get { throw null; } }
        public static Vector3 one { get { throw null; } }
        public static Vector3 operator *(Vector3 a, float d) { throw null; }
        public static Vector3 operator *(float d, Vector3 a) { throw null; }
    }

    public struct Vector4
    {
        public float x;
        public float y;
        public float z;
        public float w;
        public Vector4(float x, float y, float z, float w) { this.x = x; this.y = y; this.z = z; this.w = w; }
        public static Vector4 zero { get { throw null; } }
    }

    public struct Quaternion
    {
        public static Quaternion Euler(float x, float y, float z) { throw null; }
    }

    public struct Rect
    {
        public Rect(float x, float y, float width, float height) { }
        public float width { get { throw null; } set { } }
        public float height { get { throw null; } set { } }
        public Vector2 size { get { throw null; } set { } }
    }

    public struct Color
    {
        public float r;
        public float g;
        public float b;
        public float a;
        public Color(float r, float g, float b, float a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public Color(float r, float g, float b) { this.r = r; this.g = g; this.b = b; this.a = 1f; }
        public static Color white { get { throw null; } }
        public static Color black { get { throw null; } }
        public static Color clear { get { throw null; } }
        public static Color magenta { get { throw null; } }
        public static Color Lerp(Color a, Color b, float t) { throw null; }
        public static implicit operator Color(Color32 c) { throw null; }
    }

    public struct Color32
    {
        public byte r;
        public byte g;
        public byte b;
        public byte a;
        public Color32(byte r, byte g, byte b, byte a) { this.r = r; this.g = g; this.b = b; this.a = a; }
        public static implicit operator Color32(Color c) { throw null; }
        public static implicit operator Color(Color32 c) { throw null; }
    }

    public static class ColorUtility
    {
        public static bool TryParseHtmlString(string htmlString, out Color color) { throw null; }
        public static string ToHtmlStringRGBA(Color color) { throw null; }
    }

    public struct Mathf
    {
        public static float Abs(float f) { throw null; }
        public static float Ceil(float f) { throw null; }
        public static float Clamp01(float value) { throw null; }
        public static float Lerp(float a, float b, float t) { throw null; }
        public static float Max(float a, float b) { throw null; }
        public static int Max(int a, int b) { throw null; }
        public static float Min(float a, float b) { throw null; }
        public static int Min(int a, int b) { throw null; }
        public static float Pow(float f, float p) { throw null; }
        public static float Round(float f) { throw null; }
        public static int RoundToInt(float f) { throw null; }
    }

    public class Debug
    {
        public static void Log(object message) { }
        public static void LogWarning(object message) { }
        public static void LogError(object message) { }
        public static void LogException(Exception exception) { }
    }

    public static class JsonUtility
    {
        public static string ToJson(object obj) { throw null; }
        public static string ToJson(object obj, bool prettyPrint) { throw null; }
        public static T FromJson<T>(string json) { throw null; }
    }

    public class PlayerPrefs
    {
        public static bool HasKey(string key) { throw null; }
        public static string GetString(string key, string defaultValue) { throw null; }
        public static void SetString(string key, string value) { }
        public static int GetInt(string key, int defaultValue) { throw null; }
        public static void SetInt(string key, int value) { }
        public static void DeleteKey(string key) { }
        public static void Save() { }
    }

    public class Time
    {
        public static float timeScale { get { throw null; } set { } }
        public static float deltaTime { get { throw null; } }
        public static float unscaledDeltaTime { get { throw null; } }
        public static double realtimeSinceStartupAsDouble { get { throw null; } }
    }

    public sealed class AudioListener : Behaviour
    {
        public static float volume { get { throw null; } set { } }
        public static bool pause { get { throw null; } set { } }
    }

    public enum SystemLanguage
    {
        English = 10,
        Turkish = 37,
        Unknown = 42,
    }

    public class Application
    {
        public static SystemLanguage systemLanguage { get { throw null; } }
        public static bool isMobilePlatform { get { throw null; } }
        public static string productName { get { throw null; } }
        public static string dataPath { get { throw null; } }
        public static int targetFrameRate { get { throw null; } set { } }
    }

    public sealed class Screen
    {
        public static int width { get { throw null; } }
        public static int height { get { throw null; } }
        public static float dpi { get { throw null; } }
    }

    public enum RuntimeInitializeLoadType
    {
        AfterSceneLoad = 0,
        BeforeSceneLoad = 1,
        AfterAssembliesLoaded = 2,
        BeforeSplashScreen = 3,
        SubsystemRegistration = 4,
    }

    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
    public class RuntimeInitializeOnLoadMethodAttribute : Attribute
    {
        public RuntimeInitializeOnLoadMethodAttribute() { }
        public RuntimeInitializeOnLoadMethodAttribute(RuntimeInitializeLoadType loadType) { }
    }

    [AttributeUsage(AttributeTargets.Class, Inherited = false)]
    public sealed class DisallowMultipleComponent : Attribute
    {
    }

    public sealed class AddComponentMenu : Attribute
    {
        public AddComponentMenu(string menuName) { }
    }

    [AttributeUsage(AttributeTargets.Field, Inherited = true, AllowMultiple = true)]
    public class PropertyAttribute : Attribute
    {
    }

    public class HeaderAttribute : PropertyAttribute
    {
        public HeaderAttribute(string header) { }
    }

    public enum TextureFormat
    {
        RGBA32 = 4,
    }

    public enum FilterMode
    {
        Point = 0,
        Bilinear = 1,
        Trilinear = 2,
    }

    public enum TextureWrapMode
    {
        Repeat = 0,
        Clamp = 1,
    }

    public class Texture : Object
    {
        public FilterMode filterMode { get { throw null; } set { } }
        public TextureWrapMode wrapMode { get { throw null; } set { } }
    }

    public sealed class Texture2D : Texture
    {
        public Texture2D(int width, int height, TextureFormat textureFormat, bool mipChain) { }
        public void SetPixels32(Color32[] colors) { }
        public void Apply(bool updateMipmaps, bool makeNoLongerReadable) { }
    }

    public enum SpriteMeshType
    {
        FullRect = 0,
        Tight = 1,
    }

    public sealed class Sprite : Object
    {
        public Rect rect { get { throw null; } }
        public static Sprite Create(Texture2D texture, Rect rect, Vector2 pivot, float pixelsPerUnit, uint extrude, SpriteMeshType meshType, Vector4 border) { throw null; }
    }

    public sealed class Font : Object
    {
    }

    public enum FontStyle
    {
        Normal = 0,
        Bold = 1,
        Italic = 2,
        BoldAndItalic = 3,
    }

    public enum TextAnchor
    {
        UpperLeft = 0,
        UpperCenter = 1,
        UpperRight = 2,
        MiddleLeft = 3,
        MiddleCenter = 4,
        MiddleRight = 5,
        LowerLeft = 6,
        LowerCenter = 7,
        LowerRight = 8,
    }

    public enum HorizontalWrapMode
    {
        Wrap = 0,
        Overflow = 1,
    }

    public enum VerticalWrapMode
    {
        Truncate = 0,
        Overflow = 1,
    }

    public sealed class Resources
    {
        public static T Load<T>(string path) where T : Object { throw null; }
        public static T GetBuiltinResource<T>(string path) where T : Object { throw null; }
    }

    public enum RenderMode
    {
        ScreenSpaceOverlay = 0,
        ScreenSpaceCamera = 1,
        WorldSpace = 2,
    }

    public sealed class Canvas : Behaviour
    {
        public RenderMode renderMode { get { throw null; } set { } }
        public int sortingOrder { get { throw null; } set { } }
        public static void ForceUpdateCanvases() { }
    }

    public sealed class CanvasGroup : Behaviour
    {
        public float alpha { get { throw null; } set { } }
        public bool interactable { get { throw null; } set { } }
        public bool blocksRaycasts { get { throw null; } set { } }
    }

    public sealed class CanvasRenderer : Component
    {
    }

    public enum ColorSpace
    {
        Uninitialized = -1,
        Gamma = 0,
        Linear = 1,
    }

    public sealed class Input
    {
        public static bool GetMouseButtonDown(int button) { throw null; }
        public static int touchCount { get { throw null; } }
        public static bool anyKeyDown { get { throw null; } }
    }

    public class GUIStyle
    {
    }

    public sealed class GUILayoutOption
    {
    }

    public class GUILayout
    {
        public static bool Button(string text, params GUILayoutOption[] options) { throw null; }
        public static GUILayoutOption Width(float width) { throw null; }
        public static GUILayoutOption Height(float height) { throw null; }
    }

    public class ScriptableObject : Object
    {
    }
}

namespace UnityEngine.SceneManagement
{
    public struct Scene
    {
        public int buildIndex { get { throw null; } }
    }

    public class SceneManager
    {
        public static int sceneCountInBuildSettings { get { throw null; } }
        public static Scene GetActiveScene() { throw null; }
        public static void LoadScene(string sceneName) { }
        public static void LoadScene(int sceneBuildIndex) { }
    }
}

namespace UnityEngine.Rendering
{
    public enum GraphicsDeviceType
    {
        OpenGLES3 = 11,
    }
}
