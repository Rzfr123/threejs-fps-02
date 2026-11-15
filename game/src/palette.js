// The look plan, in one place. A desert dusk yard: warm sand, deep dusk blue, one amber
// accent for the attacking team and one teal accent for the defending team. The same
// names are the CSS custom properties in index.html.
export const PALETTE = {
  canvas: '#1b1e26',
  surface: '#2a2e38',
  hairline: '#3a3f4c',
  ink: '#efe9dc',
  muted: '#9aa0ab',
  accent: '#f0a830',
  sand: '#c9a86a',
  sandDark: '#8a6f45',
  dusk: '#232838',
  teal: '#3fb8a6',
  rust: '#c65f3d',
};

export function shade(name) {
  return PALETTE[name];
}
