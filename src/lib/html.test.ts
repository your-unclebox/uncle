import { describe, expect, it } from "vitest";

import { htmlToText, textToHtml } from "./html";

describe("textToHtml / htmlToText", () => {
  it("paragraf & baris baru, round-trip", () => {
    const text = 'Paragraf satu\nbaris dua\n\nParagraf <b>dua</b> & "kutip"';
    const html = textToHtml(text);
    expect(html).toBe(
      "<p>Paragraf satu<br>baris dua</p><p>Paragraf &lt;b&gt;dua&lt;/b&gt; &amp; &quot;kutip&quot;</p>",
    );
    expect(htmlToText(html)).toBe(text);
  });

  it("menetralkan script (stored XSS)", () => {
    expect(textToHtml("<script>alert(1)</script>")).not.toContain("<script>");
  });

  it("teks kosong → string kosong", () => {
    expect(textToHtml("  \n\n ")).toBe("");
    expect(htmlToText(null)).toBe("");
  });
});
