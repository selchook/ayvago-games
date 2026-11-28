// Compile-only stubs of the UnityEditor API the Ayvago package's Editor assembly uses. Real
// signatures (Unity 2022.3 / Unity 6), empty bodies; never shipped (see UnityEngine.cs).
using System;
using System.Reflection;
using UnityEngine;
using UnityEngine.Rendering;

namespace UnityEditor
{
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = true)]
    public sealed class MenuItem : Attribute
    {
        public MenuItem(string itemName) { }
        public MenuItem(string itemName, bool isValidateFunction) { }
        public MenuItem(string itemName, bool isValidateFunction, int priority) { }
    }

    public sealed class EditorPrefs
    {
        public static string GetString(string key, string defaultValue) { throw null; }
        public static void SetString(string key, string value) { }
    }

    public class EditorUtility
    {
        public static bool DisplayDialog(string title, string message, string ok) { throw null; }
        public static bool DisplayDialog(string title, string message, string ok, string cancel) { throw null; }
        public static string OpenFolderPanel(string title, string folder, string defaultName) { throw null; }
    }

    public sealed class AssetDatabase
    {
        public static void Refresh() { }
    }

    public sealed class EditorApplication
    {
        public delegate void CallbackFunction();
        public static CallbackFunction delayCall;
    }

    public enum MessageType
    {
        None = 0,
        Info = 1,
        Warning = 2,
        Error = 3,
    }

    public class EditorWindow : ScriptableObject
    {
        public Vector2 minSize { get { throw null; } set { } }
        public static T GetWindow<T>(bool utility, string title) where T : EditorWindow { throw null; }
        public void Show() { }
        public void Close() { }
    }

    public sealed class EditorStyles
    {
        public static GUIStyle boldLabel { get { throw null; } }
    }

    public class EditorGUILayout
    {
        public static string TextField(string text, params GUILayoutOption[] options) { throw null; }
        public static string TextField(string label, string text, params GUILayoutOption[] options) { throw null; }
        public static void LabelField(string label, GUIStyle style, params GUILayoutOption[] options) { }
        public static void HelpBox(string message, MessageType type) { }
        public static Rect BeginHorizontal(params GUILayoutOption[] options) { throw null; }
        public static void EndHorizontal() { }
        public static void Space() { }
    }

    public enum BuildTarget
    {
        WebGL = 20,
    }

    [Flags]
    public enum BuildOptions
    {
        None = 0,
        Development = 1,
    }

    public struct BuildPlayerOptions
    {
        public string[] scenes { get { throw null; } set { } }
        public string locationPathName { get { throw null; } set { } }
        public BuildTarget target { get { throw null; } set { } }
        public BuildOptions options { get { throw null; } set { } }
    }

    public class BuildPipeline
    {
        public static UnityEditor.Build.Reporting.BuildReport BuildPlayer(BuildPlayerOptions buildPlayerOptions) { throw null; }
    }

    public class EditorBuildSettingsScene
    {
        public bool enabled { get { throw null; } set { } }
        public string path { get { throw null; } set { } }
    }

    public class EditorBuildSettings
    {
        public static EditorBuildSettingsScene[] scenes { get { throw null; } set { } }
    }

    public enum WebGLCompressionFormat
    {
        Brotli = 0,
        Gzip = 1,
        Disabled = 2,
    }

    public enum WebGLExceptionSupport
    {
        None = 0,
        ExplicitlyThrownExceptionsOnly = 1,
        FullWithoutStacktrace = 2,
        FullWithStacktrace = 3,
    }

    public enum ManagedStrippingLevel
    {
        Disabled = 0,
        Low = 1,
        Medium = 2,
        High = 3,
        Minimal = 4,
    }

    public sealed partial class PlayerSettings : UnityEngine.Object
    {
        public static ColorSpace colorSpace { get { throw null; } set { } }
        public static bool runInBackground { get { throw null; } set { } }
        public static bool stripEngineCode { get { throw null; } set { } }
        public static void SetUseDefaultGraphicsAPIs(BuildTarget platform, bool automatic) { }
        public static void SetGraphicsAPIs(BuildTarget platform, GraphicsDeviceType[] apis) { }
        public static void SetManagedStrippingLevel(UnityEditor.Build.NamedBuildTarget buildTarget, ManagedStrippingLevel level) { }
        public static void SetIl2CppCodeGeneration(UnityEditor.Build.NamedBuildTarget buildTarget, UnityEditor.Build.Il2CppCodeGeneration codeGeneration) { }
        public static void SetTemplateCustomValue(string name, string value) { }
        public static string GetTemplateCustomValue(string name) { throw null; }

        public sealed class WebGL
        {
            public static string template { get { throw null; } set { } }
            public static WebGLCompressionFormat compressionFormat { get { throw null; } set { } }
            public static bool decompressionFallback { get { throw null; } set { } }
            public static bool dataCaching { get { throw null; } set { } }
            public static bool threadsSupport { get { throw null; } set { } }
            public static WebGLExceptionSupport exceptionSupport { get { throw null; } set { } }
            public static int maximumMemorySize { get { throw null; } set { } }
        }
    }
}

namespace UnityEditor.Build
{
    public struct NamedBuildTarget
    {
        public static readonly NamedBuildTarget WebGL;
    }

    public enum Il2CppCodeGeneration
    {
        OptimizeSpeed = 0,
        OptimizeSize = 1,
    }
}

namespace UnityEditor.Build.Reporting
{
    public enum BuildResult
    {
        Unknown = 0,
        Succeeded = 1,
        Failed = 2,
        Cancelled = 3,
    }

    public struct BuildSummary
    {
        public BuildResult result { get { throw null; } }
        public int totalErrors { get { throw null; } }
        public ulong totalSize { get { throw null; } }
    }

    public sealed class BuildReport : UnityEngine.Object
    {
        public BuildSummary summary { get { throw null; } }
    }
}

namespace UnityEditor.PackageManager
{
    public sealed class PackageInfo
    {
        public string resolvedPath { get { throw null; } }
        public static PackageInfo FindForAssembly(Assembly assembly) { throw null; }
    }
}
