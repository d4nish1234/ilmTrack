/**
 * The Choose People screen's logic, shared by every list that picks people
 * (the timesheet export, schedule templates). Pure, so it is unit-tested
 * (tests/peoplePicker.test.ts).
 */

export interface PickablePerson {
  uid: string;
  name: string;
}

/**
 * A row's summary of who is chosen: 'Everyone', 'No one yet', 'Aisha Khan',
 * 'Aisha Khan and Omar Ali', 'All 12 people', '3 people'. `null` is
 * everyone; `total` (how many could be chosen) lets a full list read as all.
 */
export function peopleSummary(chosenNames: string[] | null, total?: number): string {
  if (chosenNames === null) return 'Everyone';
  if (chosenNames.length === 0) return 'No one yet';
  if (total !== undefined && total > 2 && chosenNames.length === total) return `All ${total} people`;
  if (chosenNames.length === 1) return chosenNames[0];
  if (chosenNames.length === 2) return `${chosenNames[0]} and ${chosenNames[1]}`;
  return `${chosenNames.length} people`;
}

/**
 * What Continue hands back: the chosen uids in list order, or null for
 * everyone when the list offers that and everyone is ticked. null means more
 * than the people listed (the export also takes in people who have left), so
 * it is only offered where that makes sense.
 */
export function pickResult(people: PickablePerson[], ticked: Set<string>, everyoneOption: boolean): string[] | null {
  const chosen = people.filter((p) => ticked.has(p.uid)).map((p) => p.uid);
  return everyoneOption && people.length > 0 && chosen.length === people.length ? null : chosen;
}

export function filterPeople(people: PickablePerson[], search: string): PickablePerson[] {
  const query = search.trim().toLowerCase();
  return query ? people.filter((p) => p.name.toLowerCase().includes(query)) : people;
}
