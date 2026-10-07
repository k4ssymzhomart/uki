import type { ComponentType } from "react";

/**
 * Each component group adds `src/<group>/<group>.gallery.tsx` with a default export (the section)
 * and a `title`. The web and desktop apps mount <Gallery /> on their development gallery route.
 */
type GalleryModule = { default: ComponentType; title: string; order?: number };

const modules = import.meta.glob<GalleryModule>("./*/*.gallery.tsx", { eager: true });

export function Gallery() {
  const sections = Object.values(modules).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  return (
    <main className="min-h-screen bg-canvas p-8 text-fg-primary">
      {sections.map(({ default: Section, title }) => (
        <section key={title} className="mb-16" aria-label={title}>
          <h2 className="type-mono-overline mb-6">{title}</h2>
          <Section />
        </section>
      ))}
    </main>
  );
}
