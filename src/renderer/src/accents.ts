// The 12 default accent options (Part 3 / Appendix A). Users may also
// enter a custom hex, but Phase 1's temporary create affordance offers
// just these swatches.
export interface Accent {
  name: string
  hex: string
}

export const ACCENTS: Accent[] = [
  { name: 'Amber', hex: '#BA7517' },
  { name: 'Coral', hex: '#D85A30' },
  { name: 'Pink', hex: '#D4537E' },
  { name: 'Purple', hex: '#7F77DD' },
  { name: 'Indigo', hex: '#534AB7' },
  { name: 'Blue', hex: '#378ADD' },
  { name: 'Teal', hex: '#1D9E75' },
  { name: 'Green', hex: '#639922' },
  { name: 'Lime', hex: '#97C459' },
  { name: 'Yellow', hex: '#EF9F27' },
  { name: 'Gray', hex: '#888780' },
  { name: 'Red', hex: '#E24B4A' }
]
