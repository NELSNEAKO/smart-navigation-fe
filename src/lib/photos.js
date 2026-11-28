// Photos of buildings and rooms. Uploaded photos live in the backend (MongoDB);
// the browser shrinks them first so uploads are fast and storage stays small.
import { photoSrc } from './api'

const MAX_SIDE = 1280
const QUALITY = 0.8

/** Shrink an image file to at most 1280 px on its long side, as a JPEG Blob. */
export async function shrinkImage(file) {
  if (!file.type.startsWith('image/')) throw new Error(`${file.name} is not an image`)
  // createImageBitmap applies the phone's EXIF rotation, so portrait photos stay upright.
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null)
  if (!bitmap) throw new Error(`${file.name} could not be read. Try a JPEG or PNG photo.`)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#fff' // transparent PNGs get a white background in JPEG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close?.()
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', QUALITY))
  if (!blob) throw new Error(`${file.name} could not be converted`)
  return blob
}

/** All photo addresses of a building or room (uploaded ones, plus an old pasted link). */
export function photosOf(item) {
  const list = (item?.photoIds || []).map(photoSrc)
  if (item?.photoUrl) list.push(item.photoUrl)
  return list
}

/** The cover photo (first one) or null. */
export const coverOf = (item) => photosOf(item)[0] || null
