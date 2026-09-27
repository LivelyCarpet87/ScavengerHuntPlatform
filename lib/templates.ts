import type { Accent, ContestRank, Task, TaskKind } from "@/lib/db/schema";

/*
 * Starter hunts for "New hunt". Each template is a complete, playable course:
 * 8–12 tasks mixing every task type and scoring mode, with hints where a task
 * is genuinely hard, plus a hunt intro and judge feedback chips. Everything is
 * editable after creation; checkpoint codes are generated per hunt.
 *
 * Task codes are assigned from 31 upwards in the order listed.
 */

export type TemplateHint = { body: string; cost: number };

export type TemplateTask = {
  title: string;
  /** Markdown, shown to players. */
  description: string;
  kind: TaskKind;
  category: string;
  points: number;
  scoring?: Task["scoring"];
  minPoints?: number;
  decaySolves?: number;
  mediaAccept?: Task["mediaAccept"];
  autoApprove?: boolean;
  /** Empty (or absent) means a judge reads every answer. */
  answers?: string[];
  answerMatch?: Task["answerMatch"];
  maxAttempts?: number;
  contestRank?: ContestRank;
  contestPlaces?: number;
  contestUnit?: string;
  hints?: TemplateHint[];
};

export type HuntTemplate = {
  id: string;
  name: string;
  /** One sentence for the template picker. */
  pitch: string;
  /** Who and where it suits, with a rough duration. */
  bestFor: string;
  tagline: string;
  /** Markdown intro and rules for the hunt page. */
  description: string;
  accent: Accent;
  maxTeamSize: number | null;
  galleryMode: "off" | "after" | "live";
  feedbackTemplates: string[];
  tasks: TemplateTask[];
};

export const FIRST_TASK_CODE = 31;

export const HUNT_TEMPLATES: HuntTemplate[] = [
  {
    id: "campus",
    name: "Campus classic",
    pitch: "Landmarks, riddles, two hidden checkpoints and a crowd-selfie contest.",
    bestFor: "Universities, schools and freshers’ weeks. About two hours on foot.",
    tagline: "Eleven controls across campus. Two hours. Comfortable shoes recommended.",
    description: [
      "Meet at the start for a short briefing before the clock starts.",
      "",
      "- Stay together: every photo needs the whole team in it unless the task says otherwise",
      "- Walk, don’t run, inside buildings, and keep clear of lectures in progress",
      "- Checkpoint codes are posted at eye level. Scan them and leave them where they are",
      "",
      "Hints cost points, but they’re cheaper than walking in circles.",
    ].join("\n"),
    accent: "overprint",
    maxTeamSize: 5,
    galleryMode: "live",
    feedbackTemplates: [
      "Great shot!",
      "We need the whole team in the photo.",
      "That’s not the right spot. Have another look.",
      "Too blurry to judge. Can you retake it?",
    ],
    tasks: [
      {
        title: "Statue squad",
        kind: "media",
        category: "Landmarks",
        points: 100,
        description:
          "Find the oldest statue on campus and copy its pose, all of you, with the statue in the shot. It has to be recognisable. Your dignity is optional.",
      },
      {
        title: "Guest lecture",
        kind: "media",
        category: "Landmarks",
        scoring: "race",
        points: 150,
        minPoints: 60,
        decaySolves: 6,
        description:
          "Stand at the front of an empty lecture hall and deliver a one-sentence lecture on any subject. Take the photo from the back row. The first teams in earn the most.",
      },
      {
        title: "Keys but no locks",
        kind: "answer",
        category: "Riddles",
        points: 60,
        answers: ["keyboard", "a keyboard", "computer keyboard"],
        answerMatch: "loose",
        maxAttempts: 5,
        description:
          "I have keys but open no locks. I have space but no room. You can enter, but you can’t go inside. What am I?",
        hints: [{ body: "You’ve probably touched one today.", cost: 10 }],
      },
      {
        title: "Carved in stone",
        kind: "answer",
        category: "Riddles",
        points: 80,
        description: "Find the foundation stone or date plaque on the oldest building on campus. What year is on it?",
        hints: [{ body: "Foundation stones sit low down, usually near a corner or beside the main door.", cost: 15 }],
      },
      {
        title: "Front door control",
        kind: "checkpoint",
        category: "Checkpoints",
        points: 50,
        description: "A control sign is posted within sight of the main entrance. Find it and scan the code.",
      },
      {
        title: "Deep in the stacks",
        kind: "checkpoint",
        category: "Checkpoints",
        scoring: "rarity",
        points: 120,
        minPoints: 40,
        decaySolves: 6,
        description: "There’s a control sign somewhere between the library shelves. Scan it without disturbing anyone.",
        hints: [{ body: "It’s near the oldest books, not the newest.", cost: 20 }],
      },
      {
        title: "Crowd selfie",
        kind: "contest",
        category: "Contests",
        contestRank: "highest",
        contestUnit: "people",
        contestPlaces: 3,
        points: 200,
        minPoints: 60,
        mediaAccept: "photo",
        description:
          "One selfie with as many people in it as you can fit. Strangers must be willing and smiling. Judges count the faces.",
      },
      {
        title: "Echo location",
        kind: "media",
        category: "Landmarks",
        mediaAccept: "video",
        points: 90,
        description:
          "Find a spot with a real echo (a stairwell, a tunnel, an empty hall) and prove it in a ten-second video.",
      },
      {
        title: "Cafeteria haiku",
        kind: "media",
        category: "Bonus",
        autoApprove: true,
        points: 40,
        description:
          "Write a haiku about the cafeteria food on a napkin. Send a photo of the napkin and type the poem in the note. Five, seven, five syllables; honesty encouraged.",
      },
      {
        title: "Words of wisdom",
        kind: "media",
        category: "People",
        scoring: "race",
        points: 100,
        minPoints: 40,
        decaySolves: 5,
        description:
          "Ask a lecturer, librarian or porter to write one piece of advice for new students, then photograph them holding it (with their permission). The first teams to find a willing sage earn the most.",
      },
      {
        title: "Top of the world",
        kind: "contest",
        category: "Contests",
        contestRank: "earliest",
        contestPlaces: 3,
        points: 150,
        minPoints: 50,
        mediaAccept: "photo",
        description:
          "Photograph the view from the highest point on campus you’re allowed to reach. The first three accepted photos earn placement points.",
      },
    ],
  },
  {
    id: "city-photo",
    name: "City photo rally",
    pitch: "Street photography challenges, a riddle and a longest-street-name showdown.",
    bestFor: "Old towns and city centres. Two to three hours on foot.",
    tagline: "The city is the map. Come back with the best camera roll in town.",
    description: [
      "Start and finish at the meeting point. The route in between is up to you.",
      "",
      "- Every photo needs at least two of you in it, unless the task says otherwise",
      "- Ask before photographing people, and take no for an answer",
      "- Cross at crossings. No photo is worth a bus",
      "",
      "The photo gallery opens when the hunt ends, so save your best shots for the finale.",
    ].join("\n"),
    accent: "contour",
    maxTeamSize: 5,
    galleryMode: "after",
    feedbackTemplates: [
      "Great shot!",
      "We need at least two of you in the photo.",
      "That doesn’t match the task. Read it again and have another go.",
      "Too dark or blurry to judge. Can you retake it?",
    ],
    tasks: [
      {
        title: "Postcard pose",
        kind: "media",
        category: "Streets",
        points: 100,
        description:
          "Find the most postcard-worthy view in town and pose in front of it like tourists who have never seen a building before.",
      },
      {
        title: "Ghost sign",
        kind: "media",
        category: "Details",
        scoring: "rarity",
        points: 150,
        minPoints: 50,
        decaySolves: 6,
        description:
          "Find a ghost sign: faded, hand-painted advertising on an old brick wall. The fewer teams who spot one, the more it’s worth.",
        hints: [{ body: "Look up at the sides of older buildings, above the shopfronts.", cost: 20 }],
      },
      {
        title: "Street serenade",
        kind: "media",
        category: "People",
        mediaAccept: "video",
        points: 80,
        description: "Film ten seconds of a street performer. Leave them a coin: it’s only fair.",
      },
      {
        title: "Door of the day",
        kind: "media",
        category: "Details",
        autoApprove: true,
        points: 60,
        description: "Photograph the most colourful front door you can find. Beige doors will be judged harshly.",
      },
      {
        title: "Mirror, mirror",
        kind: "media",
        category: "Streets",
        scoring: "race",
        points: 120,
        minPoints: 50,
        decaySolves: 5,
        description:
          "Take a team selfie reflected in something that isn’t a mirror: a puddle, a shop window, a very shiny car. The quicker you are, the more it’s worth.",
      },
      {
        title: "Ask a local",
        kind: "answer",
        category: "People",
        points: 70,
        description:
          "Ask someone who lives here for their favourite place to eat nearby. Type the name of the place and the first name of whoever told you.",
      },
      {
        title: "Wetter when it dries",
        kind: "answer",
        category: "Brain teasers",
        points: 50,
        answers: ["towel", "a towel"],
        answerMatch: "loose",
        maxAttempts: 5,
        description: "What gets wetter the more it dries?",
        hints: [{ body: "There’s one in every bathroom.", cost: 10 }],
      },
      {
        title: "Oldest shopfront",
        kind: "media",
        category: "Details",
        points: 100,
        description: "Find the oldest shop sign still in use. A date painted on it earns the judges’ respect.",
      },
      {
        title: "Halfway control",
        kind: "checkpoint",
        category: "Checkpoints",
        points: 50,
        description: "A control sign marks the halfway point of the route. Scan it to prove you made it.",
      },
      {
        title: "Longest street name",
        kind: "contest",
        category: "Contests",
        contestRank: "highest",
        contestUnit: "letters",
        contestPlaces: 3,
        points: 150,
        minPoints: 50,
        description:
          "Photograph the street sign with the longest name you can find. Judges count the letters; spaces don’t count.",
      },
      {
        title: "Tower of Babel",
        kind: "contest",
        category: "Contests",
        contestRank: "highest",
        contestUnit: "languages",
        contestPlaces: 3,
        points: 120,
        minPoints: 40,
        description:
          "One photo with signs in as many different languages as you can fit in the frame. Judges count the languages.",
      },
    ],
  },
  {
    id: "office",
    name: "Office party",
    pitch: "Indoor team building: a plant census, mug shots, a paper tower and a cup-stacking speedrun.",
    bestFor: "Offices and team away days. One hour indoors, teams of four.",
    tagline: "One hour, one building, zero spreadsheets.",
    description: [
      "Tasks appear when the hunt starts. Stick together, or split up if you’re brave.",
      "",
      "- Keep the noise down near people who are still working",
      "- Leave desks the way you found them (tidier is allowed)",
      "- Anything you borrow for a photo goes back where it came from",
      "",
      "The judges are in the kitchen. Bribes are not accepted; snacks are.",
    ].join("\n"),
    accent: "water",
    maxTeamSize: 4,
    galleryMode: "live",
    feedbackTemplates: [
      "Great shot!",
      "We need the whole team in the photo.",
      "Close, but that’s not what the task asks for.",
      "Too blurry to judge. Can you retake it?",
    ],
    tasks: [
      {
        title: "Plant census",
        kind: "answer",
        category: "Around the office",
        points: 60,
        description: "How many potted plants are on this floor? Real ones only. Plastic plants know what they did.",
      },
      {
        title: "Mug shot",
        kind: "media",
        category: "Around the office",
        points: 80,
        description: "Photograph the oldest-looking mug in the kitchen, with its owner if you can find them.",
      },
      {
        title: "Printer control",
        kind: "checkpoint",
        category: "Around the office",
        points: 40,
        description: "There’s a control sign taped near a printer. Scan it. Please don’t print anything.",
      },
      {
        title: "Office archaeology",
        kind: "media",
        category: "Around the office",
        scoring: "rarity",
        points: 120,
        minPoints: 40,
        decaySolves: 5,
        description: "Find the oldest piece of technology that’s still plugged in. Fax machines earn extra respect.",
        hints: [{ body: "Check the meeting rooms. Nobody ever clears them out.", cost: 15 }],
      },
      {
        title: "New friends",
        kind: "media",
        category: "Colleagues",
        scoring: "race",
        points: 100,
        minPoints: 40,
        decaySolves: 5,
        description:
          "Take a team photo with someone from a department none of you work in. The first teams to make a new friend earn the most.",
      },
      {
        title: "Hands but no applause",
        kind: "answer",
        category: "Brain teasers",
        points: 50,
        answers: ["clock", "a clock", "watch", "a watch"],
        answerMatch: "loose",
        maxAttempts: 5,
        description: "I have hands but can’t clap, and a face but can’t smile. What am I?",
        hints: [{ body: "There’s probably one on a wall near you.", cost: 10 }],
      },
      {
        title: "Whiteboard poet",
        kind: "media",
        category: "Colleagues",
        autoApprove: true,
        points: 50,
        description:
          "Write a four-line poem about your favourite meeting on a whiteboard. Take a photo, then wipe it clean.",
      },
      {
        title: "Paper skyscraper",
        kind: "contest",
        category: "Contests",
        contestRank: "highest",
        contestUnit: "cm",
        contestPlaces: 3,
        points: 200,
        minPoints: 60,
        description:
          "Build the tallest free-standing tower you can from paper and tape in ten minutes. Photograph it next to a tape measure or a ruler.",
      },
      {
        title: "Cup stack speedrun",
        kind: "contest",
        category: "Contests",
        contestRank: "lowest",
        contestUnit: "seconds",
        contestPlaces: 3,
        points: 150,
        minPoints: 50,
        mediaAccept: "video",
        description:
          "Stack ten paper cups into a pyramid and take it down again, on video, as fast as you can. Judges time it; the fastest team wins.",
      },
      {
        title: "Stock photo",
        kind: "media",
        category: "Colleagues",
        points: 70,
        description:
          "Recreate the classic stock photo of business people shaking hands over a laptop, as dramatically as you can manage.",
      },
    ],
  },
  {
    id: "kids-garden",
    name: "Kids’ garden hunt",
    pitch: "Short, simple tasks for young explorers: colours, minibeasts, a hidden sign and a rainbow contest.",
    bestFor: "Gardens and parks with children aged 5 to 10. About 45 minutes, one grown-up per team.",
    tagline: "Explore the garden, spot the wildlife, find the secret sign.",
    description: [
      "Every team needs a grown-up with a phone. Children find things; grown-ups take the photos.",
      "",
      "- Look at animals and plants, but don’t pick or catch them",
      "- Stay where you can see the start",
      "- Come back to the start when the time is up",
      "",
      "Most tasks count straight away, so you’ll see your points go up as you play.",
    ].join("\n"),
    accent: "forest",
    maxTeamSize: 6,
    galleryMode: "after",
    feedbackTemplates: [
      "Brilliant find!",
      "We can’t quite see it. Can you take a closer photo?",
      "Not quite. Have another look around the garden.",
    ],
    tasks: [
      {
        title: "Something red",
        kind: "media",
        category: "Colours",
        autoApprove: true,
        points: 20,
        description:
          "Find something red in the garden and take a photo of it. Flowers, berries and ladybirds all count.",
      },
      {
        title: "Leaf detectives",
        kind: "media",
        category: "Nature",
        autoApprove: true,
        points: 30,
        description: "Find three leaves with different shapes. Line them up on the ground and take a photo.",
      },
      {
        title: "Minibeast safari",
        kind: "media",
        category: "Nature",
        points: 40,
        description:
          "Photograph a minibeast: a snail, a beetle, a woodlouse or a spider. Look closely, but don’t touch.",
        hints: [{ body: "Look under stones and logs, then put them back gently.", cost: 5 }],
      },
      {
        title: "Bark but no bite",
        kind: "answer",
        category: "Riddles",
        points: 30,
        answers: ["tree", "a tree", "trees"],
        answerMatch: "loose",
        description: "I have bark but I never bite. I have leaves but I never leave. What am I?",
        hints: [{ body: "It’s much taller than your grown-up.", cost: 5 }],
      },
      {
        title: "Bird spotter",
        kind: "media",
        category: "Nature",
        scoring: "race",
        points: 60,
        minPoints: 30,
        decaySolves: 4,
        description:
          "Take a photo of a bird: in a tree, on the grass or flying past. If it’s blurry, tell us what kind of bird you think it is. The first teams to spot one earn the most.",
      },
      {
        title: "Secret sign",
        kind: "checkpoint",
        category: "Hidden sign",
        points: 30,
        description:
          "A sign with a big circle and a QR code is hiding somewhere in the garden. Find it and ask your grown-up to scan it.",
      },
      {
        title: "Rainbow hunt",
        kind: "contest",
        category: "Colours",
        contestRank: "highest",
        contestUnit: "colours",
        contestPlaces: 3,
        points: 60,
        minPoints: 20,
        description:
          "Collect things in as many different colours as you can, without picking any flowers. Lay them out for one photo. Judges count the colours.",
      },
      {
        title: "Animal impressions",
        kind: "media",
        category: "Just for fun",
        mediaAccept: "video",
        autoApprove: true,
        points: 30,
        description: "Film your best impression of a garden animal. The judges will try to guess what you are.",
      },
      {
        title: "Longest stick",
        kind: "contest",
        category: "Nature",
        contestRank: "highest",
        contestUnit: "cm",
        contestPlaces: 3,
        points: 50,
        minPoints: 20,
        description:
          "Find the longest fallen stick you can carry. Photograph it next to a grown-up’s shoe so the judges can measure it.",
      },
    ],
  },
];

export function getTemplate(id: string | null | undefined): HuntTemplate | null {
  return HUNT_TEMPLATES.find((t) => t.id === id) ?? null;
}

/** What the template picker needs (safe to pass to client components). */
export type TemplateSummary = Pick<HuntTemplate, "id" | "name" | "pitch" | "bestFor" | "accent"> & {
  taskCount: number;
  kinds: Record<TaskKind, number>;
};

export function templateSummaries(): TemplateSummary[] {
  return HUNT_TEMPLATES.map((t) => {
    const kinds: Record<TaskKind, number> = { media: 0, answer: 0, checkpoint: 0, contest: 0 };
    for (const task of t.tasks) kinds[task.kind] += 1;
    return {
      id: t.id,
      name: t.name,
      pitch: t.pitch,
      bestFor: t.bestFor,
      accent: t.accent,
      taskCount: t.tasks.length,
      kinds,
    };
  });
}
