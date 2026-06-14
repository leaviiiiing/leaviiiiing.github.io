const IMAGE_TAG_PATTERN = /<img(?<attributes>[^>]*?)\s*\/?>/g;

export function wrapRenderedImages(html: string): string {
  return html.replace(IMAGE_TAG_PATTERN, (_, attributes = "") => {
    return `<image-zoom><img${attributes}></image-zoom>`;
  });
}
