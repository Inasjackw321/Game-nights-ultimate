// Seasons: each calendar month (UTC) is a season. Ranked games earn season
// points; when a month ends, the top three win gold, silver and bronze trophies.

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Every season gets a reef-flavoured nickname, cycling through the year.
const NICKNAMES = [
  'Frost Reef', 'Kelp Bloom', 'Spring Tide', 'Coral Dawn', 'Bright Shallows', 'High Sun',
  'Warm Current', 'Lantern Deep', 'Harvest Moon', 'Spooky Trench', 'Pearl Rush', 'Snow Drift',
];

export const TROPHY_PLACES = 3;
export const PLACE_NAMES = { 1: 'Gold', 2: 'Silver', 3: 'Bronze' };

export function seasonOf(ts) {
  const d = new Date(ts);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function seasonBounds(id) {
  const [y, m] = id.split('-').map(Number);
  return { start: Date.UTC(y, m - 1, 1), end: Date.UTC(y, m, 1) };
}

export function seasonInfo(id) {
  const [y, m] = id.split('-').map(Number);
  const { start, end } = seasonBounds(id);
  return { id, name: `${MONTHS[m - 1]} ${y}`, nickname: NICKNAMES[m - 1], start, end };
}

export function previousSeason(id) {
  return seasonOf(seasonBounds(id).start - 1);
}

// Bigger games are worth more, and every ranked game earns something:
// winning a 6-player game = 12, last place = 2.
export function seasonPoints(place, players) {
  return 2 * Math.max(1, players - place + 1);
}

// Competition ranking (ties share a place) for rows sorted by points desc.
export function withPlaces(rows) {
  rows.forEach((r, i) => { r.place = i > 0 && r.points === rows[i - 1].points ? rows[i - 1].place : i + 1; });
  return rows;
}
