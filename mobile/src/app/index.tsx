import { Redirect } from 'expo-router';
import { Loading } from '../components/ui';
import { useEntry } from '../state/entry';
export default function EntryScreen() {
  const { ready, started } = useEntry();
  if (!ready) return <Loading />;
  return <Redirect href={started ? '/discover' : '/welcome'} />;
}
