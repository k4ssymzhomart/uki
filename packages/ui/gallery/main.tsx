import { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { Gallery } from "../src/gallery.tsx";
import "./styles.css";

// Development-only shell around <Gallery />: a Light/Dark switch so every section can be checked in both themes.
type Theme = "light" | "dark";

function readTheme(): Theme {
  return new URLSearchParams(window.location.search).get("theme") === "dark" ? "dark" : "light";
}

function GalleryApp() {
  const [theme, setTheme] = useState<Theme>(readTheme);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    const url = new URL(window.location.href);
    url.searchParams.set("theme", theme);
    window.history.replaceState(null, "", url);
  }, [theme]);

  return (
    <>
      <div className="fixed top-4 right-4 z-50 flex gap-1 rounded-pill bg-surface p-1 shadow-float">
        {(["light", "dark"] as const).map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={theme === option}
            onClick={() => setTheme(option)}
            className="cursor-pointer rounded-pill px-3 py-1 type-ui-label text-fg-primary aria-pressed:bg-brand aria-pressed:text-fg-on-brand"
          >
            {option}
          </button>
        ))}
      </div>
      <Gallery />
    </>
  );
}

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <GalleryApp />
    </StrictMode>,
  );
}
