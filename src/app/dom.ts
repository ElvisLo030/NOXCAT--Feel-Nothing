export function requireElement<T extends Element>(root: ParentNode, selector: string): T {
  const element = root.querySelector<T>(selector);
  if (!element) throw new Error(`Required element not found: ${selector}`);
  return element;
}

/** Assign untrusted/user/model text without parsing markup. */
export function setSafeText(element: Element, value: string): void {
  element.textContent = value;
}

export function formatSeconds(milliseconds: number): string {
  return `${(milliseconds / 1000).toFixed(1)} 秒`;
}
