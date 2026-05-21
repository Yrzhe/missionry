import { eventUrl } from './api';
import { useAppStore } from './store';
import type { MissionEvent } from './types';

export function subscribeMissionEvents(missionId: string) {
  const source = new EventSource(eventUrl(missionId), { withCredentials: true });
  const apply = (raw: MessageEvent<string>) => {
    try {
      useAppStore.getState().applyEvent(JSON.parse(raw.data) as MissionEvent);
    } catch {
      useAppStore.getState().applyEvent({ type: raw.type, missionId });
    }
  };
  ['message', 'cost_event', 'sandbox_burn', 'work_card_allocated', 'work_card_assigned', 'work_card_queued', 'work_card_dequeued', 'work_card_started', 'work_card_completed', 'work_card_failed', 'work_card_updated', 'mission_spend_updated', 'mission_chat_message_sent'].forEach((name) => {
    source.addEventListener(name, apply as EventListener);
  });
  return () => source.close();
}
