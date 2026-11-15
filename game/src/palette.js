// The look plan, in one place. A void station: dark deck metal, deep space blue,
// one cyan accent for the attacking team and one magenta accent for the defending
// team, violet for the void tech. The same names are the CSS custom properties
// in index.html.
export const PALETTE = {
  canvas: '#07080d',
  surface: '#12141f',
  hairline: '#232839',
  ink: '#e8f6ff',
  muted: '#8b93a7',
  accent: '#22d3ee',
  sand: '#3a4358',
  sandDark: '#1a1d29',
  dusk: '#0b0d18',
  teal: '#f472b6',
  rust: '#7c3aed',
  violet: '#8b5cf6',
  cyan: '#22d3ee',
  magenta: '#f472b6',
  grid: '#1e2436',
};

export function shade(name) {
  return PALETTE[name];
}
