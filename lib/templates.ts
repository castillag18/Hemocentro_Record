import sanitizeHtml from "sanitize-html";
export { interpolate, buildTemplateVars, type TemplateVars } from "./interpolate";

export function sanitizeEmailHtml(html: string) {
  return sanitizeHtml(html, {
    allowedTags: sanitizeHtml.defaults.allowedTags.concat([
      "img",
      "h1",
      "h2",
      "span",
      "div",
    ]),
    allowedAttributes: {
      ...sanitizeHtml.defaults.allowedAttributes,
      a: ["href", "name", "target", "rel", "style"],
      img: ["src", "alt", "width", "height", "style"],
      "*": ["style", "class", "align"],
    },
    allowedSchemes: ["http", "https", "mailto"],
  });
}
