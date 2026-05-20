import { useParams } from 'react-router-dom';
import { MagicPathSurface } from '../Surface';

export const Workroom = () => {
  const { id } = useParams();
  return <MagicPathSurface page="workroom" missionId={id} />;
};
