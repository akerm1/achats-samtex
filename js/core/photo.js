/* ------------------------------------------------------------------ */
/* Photos — compression côté navigateur (canvas, JPEG)                 */
/* ------------------------------------------------------------------ */

const MAX_SIDE = 900
const QUALITY = 0.72

export function isImageFile(file) {
  return Boolean(file) && /^image\//.test(file.type || '')
}

/**
 * Redimensionne et compresse une image avant stockage.
 * @returns {Promise<string>} data URL JPEG.
 */
export function compressPhoto(file, maxSide = MAX_SIDE, quality = QUALITY) {
  return new Promise((resolve, reject) => {
    if (!isImageFile(file)) {
      reject(new Error("Ce fichier n'est pas une image"))
      return
    }
    const reader = new FileReader()
    reader.onerror = () => reject(new Error("Impossible de lire l'image"))
    reader.onload = () => {
      const image = new Image()
      image.onerror = () => reject(new Error("Format d'image non pris en charge"))
      image.onload = () => {
        try {
          const scale = Math.min(1, maxSide / Math.max(image.width, image.height))
          const width = Math.max(1, Math.round(image.width * scale))
          const height = Math.max(1, Math.round(image.height * scale))
          const canvas = document.createElement('canvas')
          canvas.width = width
          canvas.height = height
          const context = canvas.getContext('2d')
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, width, height)
          context.drawImage(image, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', quality))
        } catch {
          reject(new Error("Impossible de compresser l'image"))
        }
      }
      image.src = String(reader.result)
    }
    reader.readAsDataURL(file)
  })
}

/** Taille approximative d'une data URL, formatée. */
export function readableSize(dataUrl) {
  const bytes = ((dataUrl || '').length * 3) / 4
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`
  return `${Math.max(1, Math.round(bytes / 1024))} Ko`
}

export async function fileToDataUrl(file) {
  if (!isImageFile(file)) return ''
  try {
    return await compressPhoto(file)
  } catch {
    return ''
  }
}