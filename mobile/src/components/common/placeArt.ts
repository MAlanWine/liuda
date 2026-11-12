import type { ImageSourcePropType } from 'react-native';
import type { PlaceArt } from '../../api/types';

/** Bundled illustration per `PostSummary.art`. */
export const placeArtImages: Record<PlaceArt, ImageSourcePropType> = {
  bench: require('../../../assets/place-art/bench.jpg'),
  stairs: require('../../../assets/place-art/stairs.jpg'),
  corner: require('../../../assets/place-art/corner.jpg'),
};

/** Image source for a post's art, or `undefined` when it has none. */
export function placeArtSource(art: PlaceArt | null | undefined): ImageSourcePropType | undefined {
  return art ? placeArtImages[art] : undefined;
}
