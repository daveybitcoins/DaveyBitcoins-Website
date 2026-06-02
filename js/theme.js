(function () {
    var THEME_KEY = "site-theme";
    var LEGACY_KEYS = ["risk-theme", "ema-theme", "theme"];
    var VALID = { dark: true, light: true };

    function getStoredTheme() {
        var theme = localStorage.getItem(THEME_KEY);
        if (VALID[theme]) return theme;
        for (var i = 0; i < LEGACY_KEYS.length; i++) {
            theme = localStorage.getItem(LEGACY_KEYS[i]);
            if (VALID[theme]) return theme;
        }
        return "dark";
    }

    function persistTheme(theme) {
        localStorage.setItem(THEME_KEY, theme);
        LEGACY_KEYS.forEach(function (key) {
            localStorage.setItem(key, theme);
        });
    }

    function updateIcon(theme) {
        document.querySelectorAll("#theme-icon, .theme-icon").forEach(function (icon) {
            icon.textContent = theme === "light" ? "\u2600" : "\u263D";
        });
    }

    function applyTheme(theme) {
        if (!VALID[theme]) theme = "dark";
        document.documentElement.setAttribute("data-theme", theme);
        persistTheme(theme);
        updateIcon(theme);
        return theme;
    }

    function init(options) {
        options = options || {};
        var theme = applyTheme(getStoredTheme());
        document.querySelectorAll("#theme-toggle, .theme-toggle").forEach(function (btn) {
            if (btn.dataset.themeBound === "true") return;
            btn.dataset.themeBound = "true";
            btn.addEventListener("click", function () {
                var current = document.documentElement.getAttribute("data-theme") || getStoredTheme();
                var next = current === "light" ? "dark" : "light";
                applyTheme(next);
                if (typeof options.onChange === "function") options.onChange(next);
            });
        });
        return theme;
    }

    window.DaveyTheme = {
        key: THEME_KEY,
        get: getStoredTheme,
        apply: applyTheme,
        init: init
    };

    document.documentElement.setAttribute("data-theme", getStoredTheme());
})();
