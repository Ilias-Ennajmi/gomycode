// Fixture data for the screenshot harness (scripts/screens.mjs + scripts/fixtures/mock-supabase.mjs).
// Invented content only: no real accounts, no secrets. Shapes follow the stash schema's REST rows.

const DAY = 86_400_000;
const now = Date.now();
const ago = (days, h = 0) => new Date(now - days * DAY - h * 3_600_000).toISOString();
const ahead = (days) => new Date(now + days * DAY).toISOString().slice(0, 10);

export const USER_ID = "00000000-0000-4000-8000-0000000000a1";

const sp = (id, name, kind, color_token, sort_order, extra = {}) => ({
  id,
  name,
  kind,
  color_token,
  sort_order,
  description: null,
  due_date: null,
  icon: null,
  archived: false,
  created_at: ago(60),
  user_id: USER_ID,
  ...extra,
});

export const SPACES = [
  sp("sp-inbox", "Inbox", "inbox", "inbox", 0),
  sp("sp-mkt", "Marketing", "topic", "violet", 1, { icon: "megaphone", description: "Hooks, ads and launch ideas worth stealing." }),
  sp("sp-food", "Recipes", "topic", "amber", 2, { icon: "chef-hat" }),
  sp("sp-travel", "Lisbon trip", "project", "teal", 3, { icon: "plane", due_date: ahead(18), description: "Places to eat and see in May." }),
  sp("sp-fit", "Training", "topic", "green", 4, { icon: "dumbbell" }),
  sp("sp-brand", "Rebrand", "project", "rose", 5, { icon: "palette", due_date: ahead(9) }),
];

let n = 0;
function save({ space, platform = "instagram", creator, caption, title, key, take = [], actions = [], tags = [], dur = 38, days = 2, status = "ready", watched = null, kept = false, applied = null, archived = null, suggested = null, hue }) {
  n += 1;
  const id = `sv-${String(n).padStart(2, "0")}`;
  return {
    id,
    client_id: null,
    source_url: platform === "tiktok" ? `https://www.tiktok.com/@${creator}/video/7${n}0000000` : `https://www.instagram.com/reel/Cx${n}AbCd/`,
    platform,
    status,
    space_id: space,
    thumb_path: status === "queued" ? null : `${USER_ID}/thumbs/${id}.jpg?h=${hue ?? (n * 47) % 360}`,
    video_path: status === "ready" ? `${USER_ID}/video/${id}.mp4` : null,
    duration_s: dur,
    creator_handle: creator ? `@${creator}` : null,
    caption,
    title: null,
    error: null,
    saved_at: ago(days, n % 7),
    user_note: null,
    voice_note_path: null,
    user_id: USER_ID,
    insights:
      status === "ready"
        ? { title, key_idea: key, takeaways: take, actions, tags, suggested_space_id: suggested }
        : null,
    states: { watched_at: watched, kept, archived_at: archived, applied_at: applied, skip_count: 0 },
  };
}

export const SAVES = [
  save({ space: "sp-mkt", creator: "growthwithnora", caption: "The 3-second hook formula nobody talks about", title: "3-second hooks", key: "Open with the result, then show the messy middle, then the how.", take: ["Lead with the outcome on screen in the first frame", "Cut every pause longer than half a second", "End on a question so people comment"], actions: ["Rewrite the next reel's first line as an outcome"], tags: ["hooks", "reels"], dur: 42, days: 1, hue: 265 }),
  save({ space: "sp-food", platform: "tiktok", creator: "chefyasmine", caption: "15 min harissa chickpeas", title: "Harissa chickpeas", key: "Crisp chickpeas in a hot dry pan before the harissa goes in.", take: ["Dry the chickpeas well", "Bloom harissa in oil for 30 s", "Finish with lemon and herbs"], tags: ["dinner"], dur: 31, days: 1, hue: 28 }),
  save({ space: "sp-travel", creator: "lisboa.eats", caption: "Best pastel de nata is not where you think", title: "Nata off the map", key: "Skip Belém at noon; Manteigaria in Chiado is fresher and faster.", take: ["Go before 10 am", "Eat them warm with cinnamon", "Buy a box of 6 for the hotel"], tags: ["lisbon", "food"], dur: 27, days: 3, hue: 175, watched: ago(2), kept: true }),
  save({ space: "sp-fit", platform: "tiktok", creator: "coachamine", caption: "Mobility before you lift", title: "5 min mobility", key: "Five minutes of hip openers before squats doubles your range.", take: ["90/90 hip switches", "Deep squat hold with reach", "Cossack squats, slow"], dur: 64, days: 4, hue: 120, watched: ago(3), kept: true, applied: ago(1) }),
  save({ space: "sp-mkt", creator: "brandbuilders", caption: "Why your ads look like ads", title: "Native-looking ads", key: "Shoot ads on a phone, in one take, like a friend telling a story.", take: ["No logo in the first 3 seconds", "Talk to camera, eye level", "Captions burned in, big"], tags: ["ads", "ugc"], dur: 55, days: 5, hue: 300, watched: ago(4), kept: true }),
  save({ space: "sp-brand", creator: "studio.kolo", caption: "Logo systems that flex", title: "Flexible marks", key: "Design a mark that still reads at 16 px and as a giant crop.", take: ["Test the favicon first", "Crop the mark as a pattern", "Two weights, no more"], tags: ["branding"], dur: 48, days: 6, hue: 340 }),
  save({ space: "sp-food", creator: "bakewithsami", caption: "No-knead msemen", title: "Easy msemen", key: "Rest the dough twice and fold with oil and semolina for flaky layers.", take: ["Rest 15 min, then again", "Oil hands, not the board", "Medium heat, flip twice"], dur: 72, days: 8, hue: 40 }),
  save({ space: "sp-travel", platform: "tiktok", creator: "wanderlou", caption: "Sintra in one day, the right order", title: "Sintra route", key: "Start at Pena at opening, then Regaleira, then lunch in town.", take: ["Book Pena tickets online", "Take the 434 bus up", "Regaleira well before 2 pm"], dur: 58, days: 9, hue: 190 }),
  save({ space: "sp-mkt", platform: "tiktok", creator: "copyclub", caption: "One-word subject lines", title: "Subject lines", key: "Short, odd subject lines beat clever ones for open rate.", take: ["One or two words", "Lowercase reads personal", "Test against your best"], dur: 36, days: 12, hue: 250, watched: ago(10) }),
  save({ space: "sp-fit", creator: "runwithrita", caption: "Zone 2 explained in 40 seconds", title: "Zone 2", key: "Run slow enough to talk; most of your weekly miles should feel easy.", take: ["Nasal breathing test", "80% easy, 20% hard", "Track heart rate, not pace"], dur: 40, days: 14, hue: 140 }),
  save({ space: "sp-brand", creator: "typeandtonic", caption: "Pick fonts like a designer", title: "Font pairing", key: "Pair one loud display face with one quiet, very legible body face.", take: ["Contrast in weight, not style", "Max two families", "Check numerals"], dur: 33, days: 16, hue: 10, watched: ago(12), kept: true }),
  save({ space: "sp-inbox", creator: "minimal.home", caption: "Tiny balcony garden setup", title: "Balcony herbs", key: "Grow herbs in one long planter with a self-watering base.", take: ["Mint gets its own pot", "Morning sun is enough", "Water from below"], dur: 29, days: 0, hue: 95, suggested: null }),
  save({ space: "sp-inbox", platform: "tiktok", creator: "growthwithnora", caption: "Repurpose one video into 6 posts", title: "Repurpose", key: "Cut one long video into a reel, a carousel, a quote and three stories.", take: ["Record once, long", "Pull 3 quotes", "Carousel from the outline"], dur: 51, days: 0, hue: 280, suggested: "sp-mkt" }),
  save({ space: "sp-inbox", creator: "chefyasmine", caption: "Preserved lemons at home", title: "Preserved lemons", key: "Salt, press and wait three weeks; the rind becomes the best part.", take: ["Coarse salt only", "Press until juice covers", "Turn the jar daily"], dur: 44, days: 1, hue: 55, suggested: "sp-food" }),
  save({ space: "sp-inbox", creator: "lisboa.eats", caption: "Miradouros at sunset", title: "Sunset views", key: "Senhora do Monte beats the busy viewpoints for sunset.", take: ["Arrive 40 min early", "Bring a drink", "Tram 28 nearby"], dur: 26, days: 1, hue: 20, suggested: "sp-travel" }),
  save({ space: "sp-mkt", creator: "newsroom.daily", caption: "Processing…", dur: 47, days: 0, status: "processing", hue: 210 }),
  save({ space: "sp-food", platform: "tiktok", creator: "streetbites", caption: "Old save: rfissa", title: "Rfissa", key: "Shred msemen into the broth just before serving so it stays chewy.", take: ["Fenugreek overnight", "Ras el hanout", "Lentils last"], dur: 61, days: 45, hue: 15, kept: true, watched: ago(40) }),
  save({ space: "sp-travel", creator: "wanderlou", caption: "Lisbon on a budget", title: "Lisbon budget", key: "Buy the Viva Viagem card and ride the ferries for the best views.", take: ["Zapping balance", "Cacilhas ferry", "Free museum Sundays"], dur: 39, days: 50, hue: 185 }),
];

const ids = SAVES.map((s) => s.id);
export const QUEUE_IDS = ["sv-01", "sv-02", "sv-06", "sv-07", "sv-08"];

export function dailyQueue(day) {
  return { day, save_ids: QUEUE_IDS, done_ids: ["sv-01", "sv-02"], minutes: 6, user_id: USER_ID, built_at: new Date().toISOString() };
}

export const CARDS = [
  { id: "cd-1", save_id: "sv-03", prompt: "Where is the fresher pastel de nata in Lisbon, and when should you go?", answer: "Manteigaria in Chiado, before 10 am.", ease: 2.5, interval_days: 1, repetitions: 1, due_at: ago(0, 2), saves: { states: { kept: true } } },
  { id: "cd-2", save_id: "sv-04", prompt: "What do you do for five minutes before squats?", answer: "Hip openers: 90/90 switches, deep squat hold, cossack squats.", ease: 2.5, interval_days: 3, repetitions: 2, due_at: ago(0, 1), saves: { states: { kept: true } } },
  { id: "cd-3", save_id: "sv-05", prompt: "How should an ad look so it doesn't look like an ad?", answer: "Phone-shot, one take, talking to camera, captions burned in.", ease: 2.5, interval_days: 1, repetitions: 0, due_at: ago(1), saves: { states: { kept: true } } },
];

export const REVIEWS = [0, 1, 2, 4, 5, 6].map((d, i) => ({
  card_id: CARDS[i % CARDS.length].id,
  answered_at: ago(d, 3),
  grade: 4,
  voice_answer_text: null,
  feedback: null,
}));

export const SYNTHESES = [
  {
    id: "syn-1",
    space_id: "sp-mkt",
    topic: "Hooks that hold",
    points: [
      "The first frame shows the result, not the creator.",
      "Native, phone-shot ads beat polished ones on watch time.",
      "Captions are burned in and big enough to read on mute.",
    ],
    disagreements: [{ point: "One creator says lowercase subject lines feel spammy.", save_ids: ["sv-09"] }],
    suggested_action: "Reshoot next week's ad as a single phone take.",
    source_save_ids: ["sv-01", "sv-05", "sv-09", "sv-13", "sv-16"],
    created_at: ago(1),
  },
];

export const REMINDERS = [{ id: "rm-1", save_id: "sv-10", fire_at: ago(0, 3), kind: "time", fired: true }];

export const SETTINGS = {
  user_id: USER_ID,
  queue_minutes: 6,
  queue_time: "08:00",
  quiet_hours: { start: "22:00", end: "08:00" },
  timezone: "Africa/Casablanca",
  triage_daily_limit: 20,
  monthly_budget_usd: 5,
};

export const PLACES = [
  { id: "pl-1", save_id: "sv-03", name: "Manteigaria Chiado", lat: 38.7107, lng: -9.1428, address: "Rua do Loreto 2, Lisboa" },
  { id: "pl-2", save_id: "sv-08", name: "Palácio da Pena", lat: 38.7876, lng: -9.3906, address: "Sintra" },
  { id: "pl-3", save_id: "sv-15", name: "Miradouro da Senhora do Monte", lat: 38.7193, lng: -9.1326, address: "Lisboa" },
];

const cluster = (c, list) => list.map(([id, x, y]) => ({ save_id: id, x, y, cluster: c }));
export const GALAXY_POINTS = [
  ...cluster(0, [["sv-01", -0.55, -0.42], ["sv-05", -0.62, -0.3], ["sv-09", -0.45, -0.52], ["sv-13", -0.5, -0.25], ["sv-16", -0.68, -0.45]]),
  ...cluster(1, [["sv-02", 0.42, -0.5], ["sv-07", 0.55, -0.38], ["sv-14", 0.35, -0.36], ["sv-17", 0.5, -0.6]]),
  ...cluster(2, [["sv-03", 0.3, 0.45], ["sv-08", 0.45, 0.55], ["sv-15", 0.22, 0.6], ["sv-18", 0.4, 0.35]]),
  ...cluster(3, [["sv-04", -0.45, 0.5], ["sv-10", -0.3, 0.58], ["sv-06", -0.1, 0.05], ["sv-11", 0.02, -0.08], ["sv-12", -0.55, 0.35]]),
];
export const GALAXY_CLUSTERS = [
  { cluster: 0, label: "Hooks and ads", cx: -0.56, cy: -0.39, size: 5 },
  { cluster: 1, label: "Moroccan cooking", cx: 0.45, cy: -0.46, size: 4 },
  { cluster: 2, label: "Lisbon", cx: 0.34, cy: 0.49, size: 4 },
  { cluster: 3, label: "Moving better", cx: -0.4, cy: 0.45, size: 3 },
];

export const TRANSCRIPT = {
  save_id: "sv-01",
  segments: [
    { start: 0, end: 3.2, text: "Stop opening your reels with hi guys." },
    { start: 3.2, end: 7.8, text: "Show the result first, the finished thing, right in the first frame." },
    { start: 7.8, end: 13.1, text: "Then show the messy middle, because that's what people relate to." },
    { start: 13.1, end: 18.4, text: "And only then the how, in three quick steps." },
    { start: 18.4, end: 23, text: "End with a question so people actually comment." },
  ],
};

export const WRAPPED = {
  month: null,
  saved: 42,
  watched: 27,
  applied: 6,
  kept: 14,
  recalled: 19,
  top_spaces: [
    { id: "sp-mkt", name: "Marketing", color: "violet", count: 14 },
    { id: "sp-food", name: "Recipes", color: "amber", count: 11 },
    { id: "sp-travel", name: "Lisbon trip", color: "teal", count: 8 },
  ],
  top_creators: [
    { handle: "@growthwithnora", count: 6 },
    { handle: "@chefyasmine", count: 5 },
    { handle: "@lisboa.eats", count: 4 },
  ],
};

export const COLLECTION = {
  name: "Lisbon trip",
  color: "teal",
  kind: "project",
  description: "Places to eat and see in May.",
  saves: SAVES.filter((s) => s.space_id === "sp-travel" && s.insights).map((s, i) => ({
    title: s.insights.title,
    key_idea: s.insights.key_idea,
    takeaways: s.insights.takeaways,
    creator: s.creator_handle,
    platform: s.platform,
    source_url: s.source_url,
    thumb_path: s.thumb_path,
    applied: i === 0,
  })),
};

export const RELATED = ids.slice(4, 9).map((save_id) => ({ save_id, score: 0.8 }));
