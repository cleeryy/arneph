/**
 * Layout du segment `/editor` : purement structurel.
 *
 * Chaque page porte son propre header et son propre `<main>` (la liste dans
 * `page.tsx`, le détail dans `EditorDetailShell`). Un header rendu ici
 * s'empilerait avec celui du détail et imbriquerait deux `<main>`.
 */
export default function EditorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
