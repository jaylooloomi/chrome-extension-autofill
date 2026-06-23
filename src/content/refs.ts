// Registry mapping opaque field refs (e.g. "field_3") to real DOM nodes.
// The LLM only ever sees refs — never the live DOM — so a model response can
// be resolved back to nodes here without exposing the page to the network.

const registry = new Map<string, Element>();
let counter = 0;

/** Register an element and return a fresh ref id. */
export function register(el: Element): string {
  const ref = `field_${counter++}`;
  registry.set(ref, el);
  return ref;
}

export function resolve(ref: string): Element | undefined {
  return registry.get(ref);
}

/** Clear the registry before each new scan. */
export function reset(): void {
  registry.clear();
  counter = 0;
}

export function size(): number {
  return registry.size;
}
