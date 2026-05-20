import { useParams } from 'react-router-dom';
import { MagicPathSurface } from '../Surface';

export const AgentProfileControlCenter = () => {
  const { id, instanceId } = useParams();
  return <MagicPathSurface page="agent" missionId={id} instanceId={instanceId} />;
};
