/**
 * WCAG 2.1 relative luminance and contrast, computed rather than quoted. A test that compared
 * the ratios written in the brand document against the ratios written in the brand document
 * would be testing the document; these are derived from the values this package ships.
 */

const channel = (c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)

const luminance = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => Number.parseInt(hex.slice(i, i + 2), 16) / 255)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

export const contrast = (a, b) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return (hi + 0.05) / (lo + 0.05)
}

/** Mirrors tokens.css exactly; a test fails if the two ever disagree. */
export const tokens = {
  dark: {
    '--cp-ground': '#0D0C0B',
    '--cp-surface': '#131211',
    '--cp-surface-2': '#1B1917',
    '--cp-border': '#211F1D',
    '--cp-border-strong': '#39352F',
    '--cp-text': '#E6E3DF',
    '--cp-text-2': '#A39C93',
    '--cp-text-3': '#8B857C',
    '--cp-seal': '#A03328',
    '--cp-seal-text': '#C9564A',
    '--cp-on-seal': '#F2EFEA',
    '--cp-verified': '#6E7F63',
    '--cp-verified-text': '#8FA383',
    '--cp-radius': '0',
    '--cp-shadow': 'none',
  },
  paper: {
    '--cp-ground': '#E6E3DF',
    '--cp-surface': '#F2EFEA',
    '--cp-surface-2': '#DBD7D1',
    '--cp-border': '#CFCAC2',
    '--cp-border-strong': '#A9A29A',
    '--cp-text': '#0D0C0B',
    '--cp-text-2': '#5C564E',
    '--cp-text-3': '#6A645E',
    '--cp-seal': '#A03328',
    '--cp-seal-text': '#A03328',
    '--cp-on-seal': '#F2EFEA',
    '--cp-verified': '#4E5D46',
    '--cp-verified-text': '#4E5D46',
  },
}
