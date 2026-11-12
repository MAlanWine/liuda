import Constants, { ExecutionEnvironment } from 'expo-constants';

/**
 * Expo Go ships without react-native-maps' native module, and a static import of it crashes at module load.
 * Every Apple Maps view therefore lives in its own file (`Apple*.tsx`) that is only `require`d outside Expo Go.
 */
export const nativeMapsAvailable = Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
