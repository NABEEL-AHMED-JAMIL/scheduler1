import { HttpClient } from '@angular/common/http';
import { Signal, signal } from '@angular/core';
import { API_BASE, API_SUCCESS, ApiResponse } from '../../core/api/api.config';
import { ComboboxOption } from './combobox';
import { parseTopicPartition } from './topic';

/** A topic as setting.json/topics returns it: the picker's six columns. */
export interface TopicOption {
  sourceTaskTypeId: number;
  serviceName: string;
  queueTopicPartition?: string | null;
  status?: string;
  kafkaConnectionProfileId?: number | null;
  tenantId?: number | null;
}

export const TOPIC_SEARCH_CAP = 50;

export function topicRow(t: TopicOption): ComboboxOption {
  return {
    value: String(t.sourceTaskTypeId),
    label: t.serviceName,
    hint: parseTopicPartition(t.queueTopicPartition ?? '').topic,
  };
}

/**
 * What a remote topic box needs, for a screen that has one: rows for what was typed, and the
 * label of the value the box already holds. Every screen with a topic picker used to receive
 * every topic up front; at ten thousand that was the slowest thing about opening it. Now a
 * box asks for the first fifty matching what is typed (setting.json/topics?q=), and resolves
 * the one it opened with by id (?ids=) so it never shows a bare number.
 *
 * A late answer to an earlier keystroke is dropped: only the newest search fills the list.
 */
export function createTopicSearch(http: HttpClient) {
  const options = signal<ComboboxOption[]>([]);
  const searching = signal(false);
  const selectedLabel = signal('');
  let latest = 0;

  function search(q: string): void {
    const ticket = ++latest;
    searching.set(true);
    http.get<ApiResponse<TopicOption[]>>(`${API_BASE}/setting.json/topics`,
      { params: { q, limit: TOPIC_SEARCH_CAP } }).subscribe({
      next: r => {
        if (ticket !== latest) return;
        searching.set(false);
        options.set(r.status === API_SUCCESS ? (r.data ?? []).map(topicRow) : []);
      },
      error: () => { if (ticket === latest) { searching.set(false); options.set([]); } },
    });
  }

  /** Names the value the box holds; '' or a non-id (the "No topic" row) needs no lookup. */
  function resolve(id: string | number | null | undefined): void {
    const numeric = id != null && id !== '' && /^\d+$/.test(String(id)) ? Number(id) : null;
    if (numeric == null) { selectedLabel.set(''); return; }
    if (options().some(o => o.value === String(numeric))) {
      selectedLabel.set(options().find(o => o.value === String(numeric))!.label);
      return;
    }
    http.get<ApiResponse<TopicOption[]>>(`${API_BASE}/setting.json/topics`, { params: { ids: numeric } }).subscribe({
      next: r => {
        const row = r.status === API_SUCCESS ? (r.data ?? [])[0] : undefined;
        selectedLabel.set(row ? row.serviceName : '');
      },
      error: () => selectedLabel.set(''),
    });
  }

  return {
    options: options as Signal<ComboboxOption[]>,
    searching: searching as Signal<boolean>,
    selectedLabel: selectedLabel as Signal<string>,
    search,
    resolve,
  };
}
