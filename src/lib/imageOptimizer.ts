export async function compressImageForUpload(
  file: File,
  maxWidth = 1600,
  quality = 0.84
): Promise<{ file: File; width: number; height: number }> {
  const img = new Image();
  const objectUrl = URL.createObjectURL(file);
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('Failed to load image'));
      img.src = objectUrl;
    });
    const scale = img.width > maxWidth ? maxWidth / img.width : 1;
    const width = Math.max(1, Math.round(img.width * scale));
    const height = Math.max(1, Math.round(img.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return { file, width: img.width, height: img.height };
    ctx.drawImage(img, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/webp', quality)
    );
    if (!blob) return { file, width, height };
    const outName = file.name.replace(/\.[^.]+$/, '') + '.webp';
    return {
      file: new File([blob], outName, { type: 'image/webp' }),
      width,
      height,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
