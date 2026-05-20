import { useParams } from 'react-router-dom';
import { MagicPathSurface } from '../Surface';

export const DirectAgentThread = () => {
  const { threadId } = useParams();
  return <MagicPathSurface page="chat" threadId={threadId} />;
};
