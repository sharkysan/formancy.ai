import { useField } from '@formancy/react'
import { PICKUP_POINTS } from './demo-capabilities.js'

/**
 * What the playground draws under the pickup point: the point the answer holds, by name and by
 * code, as a host shows the record a lookup points to under it (0233). Read from the field, as any
 * host component reads one; nothing until a point is chosen, which a theme draws as no room.
 */
function ChosenPoint({ path }: { path: string }) {
  const field = useField(path)
  const point = PICKUP_POINTS.find((each) => each.value === field.value)
  if (point === undefined) return null
  return (
    <>
      {point.label} · <code>{point.value}</code>
    </>
  )
}

/** The playground's addition: under the pickup point, and under nothing else. A constant. */
export const pickupPointAddition = (path: string) => (path === 'deliveryPoint' ? <ChosenPoint path={path} /> : null)
