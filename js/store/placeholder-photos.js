// Fallback photography used only when a real product/brand image doesn't exist
// yet, so pages look complete before real photos are uploaded via the admin
// panel. Deterministic per seed (same product/brand always shows the same
// placeholder) so it doesn't flicker between different photos on re-render.
// One real shot per carried brand — matches the homepage hero rotation
// (css/style.css, .hero__photo--1 through --9).
const PLACEHOLDER_PHOTOS = [
  's33.jpeg', 's15.jpeg', 's16.jpeg', 's19.jpeg', 's24.jpeg',
  's25.jpeg', 's27.jpeg', 's34.jpeg', 's37.jpeg',
];

export const placeholderPhotoFor = (seed) => {
  const text = String(seed ?? '');
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) >>> 0;
  }
  return PLACEHOLDER_PHOTOS[hash % PLACEHOLDER_PHOTOS.length];
};
