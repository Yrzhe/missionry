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

// High-frequency "noise" events (cost ticks / sandbox burn) update the activity feed
// locally but must NOT trigger a workroom refetch — refetching the workroom kicks the
// backend's background reconcile/reaper which emits more cost/burn events, creating an
// SSE -> invalidate -> refetch -> emit feedback loop that exhausts browser connections
// (ERR_INSUFFICIENT_RESOURCES / white screen).
const NOISE_EVENTS = new Set(['cost_event', 'sandbox_burn', 'mission_spend_updated']);

// Coalesce invalidations: at most one invalidate per key every COALESCE_MS.
const COALESCE_MS = 4_000;
const pendingInvalidations = new Map<string, ReturnType<typeof setTimeout>>();
function coalesceInvalidate(key: string, run: () => void) {
  if (pendingInvalidations.has(key)) return;
  pendingInvalidations.set(key, setTimeout(() => {
    pendingInvalidations.delete(key);
    run();
  }, COALESCE_MS));
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
      const resolvedType = event.type || type;
      // Always update the local activity feed cache (cheap, no network).
      upsertEvent(resolvedMissionId, { ...event, type: resolvedType, missionId: resolvedMissionId });
      // Noise events (cost/burn) only feed the activity list — never refetch the workroom,
      // or we re-trigger the backend's emit-on-read background work and loop forever.
      if (NOISE_EVENTS.has(resolvedType)) return;
      // Meaningful events: coalesce the actual refetches so a burst can't storm.
      coalesceInvalidate(`mission:${resolvedMissionId}`, () => invalidateMission(resolvedMissionId));
      if (resolvedType.startsWith('work_card_') || resolvedType === 'mission_environment_updated') {
        coalesceInvalidate('agents', () => void queryClient.invalidateQueries({ queryKey: ['agents'] }));
      }
      if (resolvedType.startsWith('agent_request_') || resolvedType === 'agent_joined' || resolvedType === 'agent_recruited') {
        coalesceInvalidate(`agentReq:${resolvedMissionId}`, () => void queryClient.invalidateQueries({ queryKey: queryKeys.missionAgentRequests(resolvedMissionId) }));
        coalesceInvalidate('agents', () => void queryClient.invalidateQueries({ queryKey: queryKeys.agents }));
      }
      if (shouldRefreshChat(event)) {
        coalesceInvalidate(`chat:${resolvedMissionId}`, () => void queryClient.invalidateQueries({ queryKey: queryKeys.missionChat(resolvedMissionId) }));
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
