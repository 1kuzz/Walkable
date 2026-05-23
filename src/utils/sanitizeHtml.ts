const ALLOWED_TAGS = new Set(['b', 'strong', 'i', 'em', 'u', 's', 'strike', 'br', 'p', 'span', 'ul', 'ol', 'li']);

function cleanNode(node: Node): void {
  for (const child of Array.from(node.childNodes)) {
    if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element;
      const tag = el.tagName.toLowerCase();

      if (!ALLOWED_TAGS.has(tag)) {
        // Lift children up then remove the unsafe element
        while (el.firstChild) node.insertBefore(el.firstChild, el);
        node.removeChild(el);
      } else {
        // Strip all attributes to prevent onclick, style expressions, etc.
        while (el.attributes.length > 0) {
          el.removeAttribute(el.attributes[0].name);
        }
        cleanNode(el);
      }
    } else if (child.nodeType !== Node.TEXT_NODE) {
      node.removeChild(child);
    }
  }
}

/**
 * Strip all HTML except safe inline formatting tags.
 * No external dependencies — uses a hidden <template> element (scripts never execute).
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return '';
  const tpl = document.createElement('template');
  tpl.innerHTML = dirty;
  cleanNode(tpl.content);
  // Serialize back via a scratch div (template.innerHTML is read-only in some envs)
  const div = document.createElement('div');
  div.appendChild(tpl.content.cloneNode(true));
  return div.innerHTML;
}
