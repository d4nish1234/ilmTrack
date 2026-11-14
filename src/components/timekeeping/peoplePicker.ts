/**
 * Opens the shared Choose People screen and gets its answer back. Routes
 * can't return a value to the screen that pushed them, so the request (with
 * the callback for the answer) waits here while the picker is open. Memory
 * only; nothing is saved.
 */
import { router } from 'expo-router';
import type { PickablePerson } from '../../utils/peoplePicker';

export interface PeoplePickerRequest {
  people: PickablePerson[];
  /** Who starts ticked; null is everyone. */
  chosen: string[] | null;
  /** Whether ticking everyone means "everyone" (null), not just these people. */
  everyoneOption: boolean;
  /** Called on Continue; never on back, which discards the changes. */
  onDone: (chosen: string[] | null) => void;
}

let pending: PeoplePickerRequest | null = null;

export function openPeoplePicker(request: PeoplePickerRequest): void {
  pending = request;
  router.push('/(teacher)/organization/choose-people');
}

/** The open picker's request; null if the screen was reached some other way. */
export function peoplePickerRequest(): PeoplePickerRequest | null {
  return pending;
}
