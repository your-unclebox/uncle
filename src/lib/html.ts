// Konten event diedit sebagai teks biasa (editor rich text belum dipasang).
// Disimpan sebagai HTML ter-escape per paragraf → aman dari stored XSS
// (DRD Security §5) tanpa library sanitasi.
const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char] ?? char);
}

export function textToHtml(text: string): string {
  return text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function htmlToText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br>/g, "\n")
    .replace(/<\/p><p>/g, "\n\n")
    .replace(/<\/?p>/g, "")
    .replace(
      /&lt;|&gt;|&quot;|&#39;|&amp;/g,
      (entity) =>
        ({ "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&amp;": "&" })[entity] ?? entity,
    );
}
