const ALLOWED_MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type PhotoMediaType = (typeof ALLOWED_MEDIA)[number];

export function normalizePhotoMediaType(fileType: string): PhotoMediaType {
  return ALLOWED_MEDIA.includes(fileType as PhotoMediaType)
    ? (fileType as PhotoMediaType)
    : 'image/jpeg';
}

/** Resize and JPEG-encode a photo to stay under API body limits. */
export function resizeAndEncode(file: File, maxPx = 1600, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error('Could not process image.'));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', quality).split(',')[1]);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image file.'));
    };
    img.src = url;
  });
}
