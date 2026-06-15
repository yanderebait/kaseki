import { fileUrl } from './viewerUtils'

// Native image rendering. Zoom scales the image width; the scrollable wrap
// provides pan.
export default function ImageRenderer({
  id,
  zoom,
  vault = false
}: {
  id: number
  zoom: number
  vault?: boolean
}): React.JSX.Element {
  return (
    <div className="viewer-image-wrap">
      <img
        className="viewer-image"
        src={fileUrl(id, vault)}
        alt=""
        style={{ width: `${zoom * 100}%` }}
      />
    </div>
  )
}
