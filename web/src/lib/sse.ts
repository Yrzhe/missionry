import { fetchEventSource } from '@microsoft/fetch-event-source';
import { eventUrl } from './api';
import { invalidateMission, queryClient, queryKeys } from './query';
import type { MissionEvent } from './types';

const eventTypes = new Set([
  'cost_event',
  'sandbox_burn',
  'work_card_allocated',
  'work_card_assigned',
  'work_card_queued',
  'work_card_dequeued',
  'work_card_started',
  'work_card_completed',
  'work_card_failed',
  'work_card_updated',
  'mission_deleted',
  'mission_environment_updated',
  'mission_spend_updated',
  'agent_request_created',
  'agent_request_approved',
  'agent_request_declined',
  'agent_joined',
  'agent_recruited',
  'mission_chat_message_sent',
  'message',
]);

function eventTime(event: MissionEvent) {
  return Date.parse(event.occurredAt ?? event.createdAt ?? event.updatedAt ?? '') || 0;
}

function eventIdentity(event: MissionEvent) {
  return event.auditEventId ?? `${event.type}:${event.payload?.subjectId ?? event.payload?.message?.id ?? event.payload?.chatMessage?.id ?? eventTime(event)}`;
}

function upsertEvent(missionId: string, event: MissionEvent) {
  queryClient.setQueryData<{ items: MissionEvent[] }>(queryKeys.missionEvents(missionId), (existing) => {
    const items = existing?.items ?? [];
    const byId = new Map(items.map((item) => [eventIdentity(item), item]));
    byId.set(eventIdentity(event), event);
    return { items: Array.from(byId.values()).sort((a, b) => eventTime(b) - eventTime(a)).slice(0, 100) };
  });
}

function shouldRefreshChat(event: MissionEvent) {
  return event.type === 'mission_chat_message_sent'
    || event.type === 'agent_joined'
    || event.type.startsWith('agent_request_')
    || Boolean(event.payload?.message ?? event.payload?.chatMessage);
}

export function subscribeMissionEvents(missionId: string) {
  const controller = new AbortController();
  void fetchEventSource(eventUrl(missionId), {
    credentials: 'include',
    openWhenHidden: true,
    signal: controller.signal,
    onmessage(message) {
      const type = message.event || 'message';
      if (!eventTypes.has(type)) return;
      let event: MissionEvent;
      try {
        event = JSON.parse(message.data) as MissionEvent;
      } catch {
        event = { type, missionId };
      }
      const resolvedMissionId = event.missionId ?? missionId;
      upsertEvent(resolvedMissionId, { ...event, type: event.type || type, missionId: resolvedMissionId });
      invalidateMission(resolvedMissionId);
      if (event.type.startsWith('work_card_') || event.type === 'mission_environment_updated') {
        void queryClient.invalidateQueries({ queryKey: ['agents'] });
      }
      if (event.type.startsWith('agent_request_') || event.type === 'agent_joined' || event.type === 'agent_recruited') {
        void queryClient.invalidateQueries({ queryKey: queryKeys.missionAgentRequests(resolvedMissionId) });
        void queryClient.invalidateQueries({ queryKey: queryKeys.agents });
      }
      if (shouldRefreshChat(event)) {
        void queryClient.invalidateQueries({ queryKey: queryKeys.missionChat(resolvedMissionId) });
      }
    },
    onerror(error) {
      if (controller.signal.aborted) return;
      console.warn('mission_sse_error', error);
      return 2_000;
    },
  }).catch((error) => {
    if (!controller.signal.aborted) console.warn('mission_sse_closed', error);
  });
  return () => controller.abort();
}
