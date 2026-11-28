// Compile-only stubs of the Input System package (com.unity.inputsystem) API the Ayvago package
// uses (the intro's skip). Real signatures, empty bodies; never shipped (see UnityEngine.cs).
namespace UnityEngine.InputSystem.Controls
{
    public class ButtonControl
    {
        public bool wasPressedThisFrame { get { throw null; } }
    }

    public class AnyKeyControl : ButtonControl
    {
    }

    public class TouchPressControl : ButtonControl
    {
    }

    public class TouchControl
    {
        public TouchPressControl press { get { throw null; } }
    }
}

namespace UnityEngine.InputSystem
{
    using UnityEngine.InputSystem.Controls;

    public class Keyboard
    {
        public static Keyboard current { get { throw null; } }
        public AnyKeyControl anyKey { get { throw null; } }
    }

    public class Mouse
    {
        public static Mouse current { get { throw null; } }
        public ButtonControl leftButton { get { throw null; } }
    }

    public class Touchscreen
    {
        public static Touchscreen current { get { throw null; } }
        public TouchControl primaryTouch { get { throw null; } }
    }
}
