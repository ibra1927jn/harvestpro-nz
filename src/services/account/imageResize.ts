/**
 * Reduce una imagen en el cliente (canvas) antes de subirla como foto de perfil:
 * lado mayor ≤ maxPx, salida JPEG. Una foto de móvil de 4 MB queda en ~40 KB.
 * Aparte del servicio para poder sustituirlo en tests (jsdom no tiene canvas).
 */

export const AVATAR_MAX_PX = 512;
const JPEG_QUALITY = 0.85;

type Drawable = ImageBitmap | HTMLImageElement;

/** Decodifica la imagen (createImageBitmap respeta la orientación EXIF; <img> como reserva) */
async function decode(file: Blob): Promise<Drawable> {
    if (typeof createImageBitmap === 'function') {
        try {
            return await createImageBitmap(file, { imageOrientation: 'from-image' });
        } catch {
            // Formato no soportado por createImageBitmap: se intenta con <img>
        }
    }
    const url = URL.createObjectURL(file);
    try {
        return await new Promise<HTMLImageElement>((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = () => reject(new Error('Could not decode image'));
            img.src = url;
        });
    } finally {
        // El <img> ya está decodificado cuando se resuelve; liberar la URL después del dibujo
        setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

function sizeOf(d: Drawable): { width: number; height: number } {
    if ('naturalWidth' in d) return { width: d.naturalWidth, height: d.naturalHeight };
    return { width: d.width, height: d.height };
}

/** Imagen reducida a JPEG (lado mayor ≤ maxPx). Lanza si no se puede decodificar o codificar. */
export async function resizeImageToJpeg(file: Blob, maxPx: number = AVATAR_MAX_PX): Promise<Blob> {
    const source = await decode(file);
    const { width, height } = sizeOf(source);
    if (width <= 0 || height <= 0) throw new Error('Empty image');
    const scale = Math.min(1, maxPx / Math.max(width, height));
    const w = Math.max(1, Math.round(width * scale));
    const h = Math.max(1, Math.round(height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    // Fondo blanco: los PNG con transparencia no salen negros al pasar a JPEG
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.drawImage(source, 0, 0, w, h);
    if ('close' in source) source.close();

    return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
            blob => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
            'image/jpeg',
            JPEG_QUALITY,
        );
    });
}
