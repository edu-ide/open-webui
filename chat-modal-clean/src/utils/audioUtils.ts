/**
 * Audio utility functions for React implementation
 */

/**
 * Convert a Blob to a File object
 * @param blob - The blob to convert
 * @param fileName - The name for the file
 * @returns File object
 */
export function blobToFile(blob: Blob, fileName: string): File {
  const file = new File([blob], fileName, { 
    type: blob.type,
    lastModified: Date.now()
  });
  return file;
}

/**
 * Create an audio URL from a blob
 * @param blob - The audio blob
 * @returns Object URL for the audio
 */
export function createAudioUrl(blob: Blob): string {
  return URL.createObjectURL(blob);
}

/**
 * Revoke an audio URL to free memory
 * @param url - The URL to revoke
 */
export function revokeAudioUrl(url: string): void {
  URL.revokeObjectURL(url);
}