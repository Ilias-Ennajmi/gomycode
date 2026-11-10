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
// Contract 0007: `video` is the stored copy's state (stored | blocked | too_big | evicted | none),
// `embed: false` leaves a save without a platform player, `ai` is saves.ai_state, `step` is
// saves.process_step for a save still being processed, `url` / `yt` set the source link.
function save({ space, platform = "instagram", creator, caption, title, key, take = [], actions = [], tags = [], intent = null, dur = 38, days = 2, status = "ready", watched = null, kept = false, applied = null, archived = null, suggested = null, hue, video, embed = true, ai = "done", step, url, yt, saveTitle = null }) {
  n += 1;
  const id = `sv-${String(n).padStart(2, "0")}`;
  const ready = status === "ready";
  const source_url = url ?? (yt ? `https://www.youtube.com/watch?v=${yt}` : platform === "tiktok" ? `https://www.tiktok.com/@${creator}/video/7${n}0000000` : `https://www.instagram.com/reel/Cx${n}AbCd/`);
  const embed_url = !embed || platform === "web" || platform === "screenshot"
    ? null
    : platform === "youtube"
      ? `https://www.youtube-nocookie.com/embed/${yt}`
      : platform === "tiktok"
        ? `https://www.tiktok.com/player/v1/7${n}0000000`
        : `https://www.instagram.com/reel/Cx${n}AbCd/embed`;
  const video_state = video ?? (ready && (platform === "instagram" || platform === "tiktok") ? "stored" : "none");
  const stored = video_state === "stored";
  return {
    id,
    client_id: null,
    source_url,
    platform,
    status,
    space_id: space,
    thumb_path: status === "queued" ? null : `${USER_ID}/thumbs/${id}.jpg?h=${hue ?? (n * 47) % 360}`,
    video_path: stored ? `${USER_ID}/${id}.mp4` : null,
    video_bytes: stored ? 6_400_000 + n * 310_000 : null,
    video_state,
    playback: stored ? "video" : platform === "screenshot" ? "none" : embed_url ? "embed" : "link",
    embed_url,
    process_step: step ?? (status === "queued" ? "queued" : status === "processing" ? "fetching" : "ready"),
    ai_state: ready ? ai : "pending",
    duration_s: dur,
    creator_handle: creator ? `@${creator}` : null,
    caption,
    title: saveTitle,
    error: null,
    saved_at: ago(days, n % 7),
    user_note: null,
    voice_note_path: null,
    user_id: USER_ID,
    insights:
      ready && ai === "done"
        ? { title, key_idea: key, takeaways: take, actions, tags, intent, suggested_space_id: suggested }
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
  save({ space: "sp-mkt", creator: "newsroom.daily", caption: "Why newsletters beat feeds", saveTitle: "Why newsletters beat feeds", dur: 47, days: 0, status: "processing", step: "watching", hue: 210 }),
  save({ space: "sp-food", platform: "tiktok", creator: "streetbites", caption: "Old save: rfissa", title: "Rfissa", key: "Shred msemen into the broth just before serving so it stays chewy.", take: ["Fenugreek overnight", "Ras el hanout", "Lentils last"], dur: 61, days: 45, hue: 15, kept: true, watched: ago(40) }),
  save({ space: "sp-travel", creator: "wanderlou", caption: "Lisbon on a budget", title: "Lisbon budget", key: "Buy the Viva Viagem card and ride the ferries for the best views.", take: ["Zapping balance", "Cacilhas ferry", "Free museum Sundays"], dur: 39, days: 50, hue: 185 }),
  // sv-19 … : the sources and states added by contract 0007.
  save({ space: "sp-mkt", platform: "youtube", yt: "Fx7pRiceTalk", creator: "growthwithnora", caption: "How to price a product (full talk)", saveTitle: "How to price a product (full talk)", title: "Pricing a product", key: "Price on the value to the buyer, then test three tiers instead of one number.", take: ["Anchor with a high tier", "Name tiers after the buyer, not the size", "Raise prices on new buyers first"], tags: ["pricing", "hooks"], intent: "learn", dur: 612, days: 2, hue: 232 }),
  save({ space: "sp-brand", platform: "web", url: "https://www.fieldnotes.example/essays/a-brand-is-a-promise", creator: null, caption: "A brand is a promise you keep in small places", saveTitle: "A brand is a promise you keep in small places", title: "A brand is a promise", key: "A brand is built in the small, repeated moments, long before anyone sees the logo.", take: ["Write the promise in one sentence", "List the ten places it shows up", "Fix the smallest broken one first"], tags: ["branding"], intent: "learn", dur: null, days: 3, hue: 48 }),
  save({ space: "sp-inbox", platform: "tiktok", creator: "quickbites", caption: "", dur: null, days: 0, status: "queued", hue: 330 }),
  save({ space: "sp-inbox", platform: "tiktok", creator: "deskstretch", caption: "3 stretches for people who sit all day", saveTitle: "3 stretches for people who sit all day", dur: 34, days: 0, hue: 150, ai: "no_key", video: "none" }),
  save({ space: "sp-food", creator: "souk.kitchen", caption: "Chermoula in five minutes", saveTitle: "Chermoula in five minutes", title: "Chermoula", key: "Blend herbs, cumin, paprika, garlic and lemon; it keeps a week under oil.", take: ["Equal parts parsley and coriander", "Toast the cumin", "Cover with oil"], tags: ["dinner"], intent: "try", dur: 29, days: 5, hue: 80, video: "blocked", embed: false }),
  save({ space: "sp-fit", platform: "youtube", yt: "Sh0rtPlank01", url: "https://www.youtube.com/shorts/Sh0rtPlank01", creator: "coachamine", caption: "Plank form in 30 seconds", saveTitle: "Plank form in 30 seconds", title: "Plank form", key: "Squeeze glutes and pull elbows to toes; a 20-second hard plank beats two lazy minutes.", take: ["Ribs down", "Glutes tight", "Stop when form breaks"], tags: ["core"], intent: "try", dur: 31, days: 6, hue: 110 }),
];

// The row of smart groups needs a few tags, intents and creators that repeat.
const TAGS = {
  hooks: ["sv-01", "sv-05", "sv-09", "sv-13"],
  lisbon: ["sv-03", "sv-08", "sv-15", "sv-18"],
  dinner: ["sv-02", "sv-07", "sv-14", "sv-17"],
};
const INTENTS = { visit: ["sv-03", "sv-08", "sv-15", "sv-18"], try: ["sv-02", "sv-04", "sv-07", "sv-14"], learn: ["sv-01", "sv-05", "sv-09"] };
for (const s of SAVES) {
  if (!s.insights) continue;
  for (const [tag, list] of Object.entries(TAGS)) if (list.includes(s.id) && !s.insights.tags.includes(tag)) s.insights.tags = [...s.insights.tags, tag];
  for (const [intent, list] of Object.entries(INTENTS)) if (list.includes(s.id)) s.insights.intent = intent;
}
// One save whose stored copy was cleared by retention: it plays through the platform's player.
{
  const evicted = SAVES.find((s) => s.id === "sv-06");
  Object.assign(evicted, { video_path: null, video_bytes: null, video_state: "evicted", playback: "embed" });
}

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
    id: "syn-2",
    space_id: null,
    tag: "hooks",
    topic: "What makes a hook work",
    points: [
      "Every one of these opens on the result, never on a greeting.",
      "The first sentence fits in three seconds of speech.",
      "A question at the end doubles the comments.",
    ],
    disagreements: [],
    suggested_action: "Write five first lines for the next video and keep the shortest.",
    source_save_ids: ["sv-01", "sv-05", "sv-09", "sv-13", "sv-19"],
    created_at: ago(0, 5),
  },
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
  ...cluster(3, [["sv-04", -0.45, 0.5], ["sv-10", -0.3, 0.58], ["sv-06", -0.36, 0.64], ["sv-11", -0.58, 0.56], ["sv-12", -0.55, 0.35]]),
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

export const TRANSCRIPTS = [
  { ...TRANSCRIPT, full_text: TRANSCRIPT.segments.map((s) => s.text).join(" ") },
  {
    save_id: "sv-20",
    segments: [],
    full_text: [
      "Most teams treat a brand as a logo and a colour. Customers treat it as a prediction: what will happen the next time I deal with these people?",
      "That prediction is made in small places. The receipt email. The way a refund is handled. The sentence on the error page. None of them is designed by the brand team, and all of them are the brand.",
      "So write the promise down in one sentence that a new colleague could act on. Then list the ten places where a customer meets you, and ask of each one: does this keep the promise, or break it?",
      "Fix the smallest broken one first. It is rarely the homepage. It is usually something nobody owns.",
      "A logo can be changed in a week. A promise that is kept in ten small places takes a year to build, and that is exactly why it is worth more.",
    ].join("\n\n"),
  },
];

export const HIGHLIGHTS = [
  { id: "hl-1", save_id: "sv-01", user_id: USER_ID, text: "Show the result first, the finished thing, right in the first frame.", start_s: 3.2, end_s: 7.8, card_id: null, source: "user", created_at: ago(0, 2) },
  { id: "hl-2", save_id: "sv-01", user_id: USER_ID, text: "End with a question so people actually comment.", start_s: 18.4, end_s: 23, card_id: "cd-9", source: "ai", created_at: ago(1) },
  { id: "hl-3", save_id: "sv-20", user_id: USER_ID, text: "Fix the smallest broken one first. It is rarely the homepage. It is usually something nobody owns.", start_s: null, end_s: null, card_id: null, source: "user", created_at: ago(2) },
];

export const ASKS = [
  {
    id: "ask-1",
    user_id: USER_ID,
    question: "Where should I eat in Lisbon?",
    status: "ready",
    answer: "Two of your saves point the same way: go to Manteigaria in Chiado before 10 am for pastel de nata, and skip Belém at noon. For the evening, Senhora do Monte is the viewpoint to bring a drink to.",
    cited_save_ids: ["sv-03", "sv-15"],
    error: null,
    created_at: ago(1),
    updated_at: ago(1),
  },
  {
    id: "ask-2",
    user_id: USER_ID,
    question: "Ideas for a quick dinner",
    status: "ready",
    answer: "Harissa chickpeas (15 minutes) and chermoula on anything grilled.",
    cited_save_ids: ["sv-02", "sv-23"],
    error: null,
    created_at: ago(3),
    updated_at: ago(3),
  },
];

/** What the worker would answer to a new question in the fixtures. */
export const ASK_ANSWER = {
  answer:
    "Three of your saves agree: open on the result, not on a greeting. Show the finished thing in the first frame, cut every pause longer than half a second, and end on a question so people comment. One of them adds that phone-shot, single-take videos hold attention longer than polished ones.",
  cited_save_ids: ["sv-01", "sv-05", "sv-13"],
};

export const BACKUPS = [0, 7, 14].map((d, i) => ({
  id: `bk-${i + 1}`,
  user_id: USER_ID,
  path: `${USER_ID}/backups/${new Date(now - (d + 2) * DAY).toISOString().slice(0, 10)}.json`,
  bytes: 1_420_000 - i * 90_000,
  saves: SAVES.length - i * 3,
  created_at: ago(d + 2),
}));

export const PIPELINE = { worker: true, ai: true, is_owner: true, owners_set: true, video_bytes: 312 * 1048576, video_cap_bytes: 800 * 1048576 };

/** A recovery code the fixture function hands out (invented, not a real one). */
export const RECOVERY_CODE = "4F7QK-2M9XA-0TB3R-H8ZNC";

export const RELATED = ids.slice(4, 9).map((save_id) => ({ save_id, score: 0.8 }));
