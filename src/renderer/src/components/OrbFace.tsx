// The Orb's face, shared by the live Orb, the onboarding OrbMark, and the tour
// speech bubble. The expression is driven entirely by CSS keyed on the
// `data-orb-state` attribute set on the parent container (.orb / .orb-mark), so
// this stays a dumb, stateless set of face parts: two eyes, a mouth, and a
// glyph slot (check mark / question mark) that states show or hide. See orb.css.
export default function OrbFace(): React.JSX.Element {
  return (
    <span className="orb-face">
      <span className="orb-eye orb-eye-l" />
      <span className="orb-eye orb-eye-r" />
      <span className="orb-mouth" />
      <span className="orb-glyph" />
    </span>
  )
}
