export function createCard(data, options = {}) {
  switch (data.type) {
    case 'image':
      return createImageCard(data, options);

    case 'gif':
      return createGifCard(data, options);

    case 'youtube':
      return createYouTubeCard(data, options);

    case 'music':
      return createMusicCard(data, options);

    case 'video':
      return createDirectVideoCard(data, options);

    default:
      return null;
  }
}