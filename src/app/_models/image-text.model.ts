/** Extensions the ad-hoc image OCR endpoint accepts. */
export const IMAGE_SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'webp', 'bmp', 'gif', 'tiff'];

/** A marked region in the image's native pixel coordinates (top-left origin) -- omit entirely
 * to OCR the whole image. */
export interface ImageRegion {
    x: number;
    y: number;
    width: number;
    height: number;
}
