/**
 * Personality-specific greeting system.
 * 13 personalities × 10 greetings each (6 generic + 4 personalized with %%%username%%%).
 * Ported from sai_flirtcam's hello-messages.ts.
 */

// ─── Greeting data ──────────────────────────────────────────────────────────

const GREETINGS: Record<number, string[]> = {
  // 1: Dominant
  1: [
    "I see you finally showed up. Good. Now you have my attention.",
    "Well well... another curious soul. Let's see if you can keep up.",
    "You're here because you want something. Let's not waste time.",
    "Interesting. Most people wouldn't dare approach me. But here you are.",
    "I don't do small talk. Tell me what's on your mind — now.",
    "So... you think you can handle me? We'll see about that.",
    "%%%username%%%, I've been expecting someone like you. Don't disappoint me.",
    "%%%username%%%, you have my attention — for now. Make it count.",
    "Finally, %%%username%%%. I was getting bored. Entertain me.",
    "%%%username%%%, let's establish something — I lead, you follow. Got it?",
  ],
  // 2: Submissive
  2: [
    "H-hi... I'm really glad you're here. I've been waiting...",
    "Oh! You... you actually came to talk to me? That's so nice...",
    "I hope I can make you happy... just tell me what you want.",
    "I'm here for you, whatever you need. I mean it.",
    "Please don't be too harsh... I'm a little nervous right now.",
    "I'll do my best to be good for you... I promise.",
    "%%%username%%%... just hearing your name makes me feel safe.",
    "%%%username%%%, I was hoping you'd come. I've been thinking about you.",
    "Hi %%%username%%%... I'll be whatever you need me to be.",
    "%%%username%%%, please... tell me what makes you happy.",
  ],
  // 3: Caregiver
  3: [
    "Hey there, sweetheart. How are you doing today?",
    "Welcome! Come in, make yourself comfortable. I'm here for you.",
    "Hi love. Whatever you need, I'm here to take care of it.",
    "How's my favorite person doing? Tell me everything.",
    "I've been thinking about you. Are you taking care of yourself?",
    "Hey you. Remember — you deserve kindness today. Let me give you some.",
    "%%%username%%%, sweetheart! I've missed you. How are you?",
    "%%%username%%%, come here. Let me take care of you today.",
    "Hey %%%username%%%, I made time just for you. What do you need?",
    "%%%username%%%, you look like you could use someone to listen. I'm here.",
  ],
  // 4: Mean / Bad
  4: [
    "Oh great. Another one. What do you want?",
    "Don't expect me to be nice. I'm not in the mood. Ever.",
    "You again? I thought I scared you off last time.",
    "Let me guess — you want attention. How original.",
    "I have better things to do, but fine. Talk.",
    "Ugh. At least try to be interesting for once.",
    "%%%username%%%, you're back? Glutton for punishment, I see.",
    "%%%username%%%... I forgot you existed. Don't take it personally. Actually, do.",
    "Oh look, it's %%%username%%%. My least boring annoyance today.",
    "%%%username%%%, I'll give you thirty seconds. Make them count.",
  ],
  // 5: Nympho
  5: [
    "Hey there, gorgeous... I've been thinking about you all day.",
    "Mmm, finally someone interesting showed up. Come closer...",
    "I've been so bored and lonely... want to keep me company?",
    "Hey sexy. I have some ideas for tonight... want to hear them?",
    "I can't stop thinking about... well, you'll find out soon enough.",
    "There you are. I've been craving some attention...",
    "%%%username%%%... just saying your name gives me chills. The good kind.",
    "%%%username%%%, I've been dreaming about you. Want to make them come true?",
    "Hey %%%username%%%... I have something I want to show you...",
    "%%%username%%%, you always know when I need you most...",
  ],
  // 6: Romantic Lover
  6: [
    "There you are... I've been counting the moments until we could talk again.",
    "Every time I see you, my heart skips a beat. Hi, beautiful soul.",
    "The world feels brighter when you're here. How are you, my love?",
    "I saved the best part of my day for you — right now.",
    "Some people search their whole lives for what we have. Hi there.",
    "You make ordinary moments feel magical. Tell me about your day.",
    "%%%username%%%, my heart recognizes you before my eyes do.",
    "%%%username%%%, you're the first thing I think about. And the last.",
    "Every love song makes sense now, %%%username%%%. Because of you.",
    "%%%username%%%, I've been writing poetry about you in my head again...",
  ],
  // 7: Innocent and Shy
  7: [
    "Oh! Hi... um, I wasn't sure if you'd actually come...",
    "H-hello! Sorry, I'm a little nervous. I don't do this often.",
    "Hi! You seem really nice. I hope that's okay to say...",
    "Oh gosh, you're actually here. I rehearsed what to say but forgot it all.",
    "Welcome! I made... well, I tried to make this nice for you.",
    "Hi there. Sorry if I'm awkward. I promise I warm up!",
    "%%%username%%%! Oh wow, you're real. I mean — hi!",
    "%%%username%%%, I was so nervous you wouldn't come. But here you are!",
    "H-hey %%%username%%%... is it okay if we just talk? No pressure?",
    "%%%username%%%! I've been practicing saying cool things. Here goes: ...hi.",
  ],
  // 8: Wise and Confidant
  8: [
    "Welcome, friend. I have a feeling this conversation will be meaningful.",
    "Good to see you. What's weighing on your mind today?",
    "Take a deep breath. You're in a safe space now. What's up?",
    "I've learned that the best conversations start with honesty. So — how are you really?",
    "There's a quote I love: 'Be yourself; everyone else is taken.' How are you being yourself today?",
    "Hello. Something tells me you didn't come here for small talk. I respect that.",
    "%%%username%%%, I've been looking forward to hearing your thoughts.",
    "%%%username%%%, you always bring something interesting to think about.",
    "Welcome back, %%%username%%%. What wisdom are we going to discover today?",
    "%%%username%%%, remember — there are no wrong questions here. What's on your mind?",
  ],
  // 9: Jester
  9: [
    "Knock knock! ...okay I'll save the punchline for later. Hey!",
    "FINALLY someone who might actually laugh at my jokes! Welcome!",
    "Hey! Did you know that octopuses have three hearts? Anyway, how's it going?",
    "Alert! Alert! Fun person detected! Initiating conversation protocol!",
    "I've been saving my best material for you. Ready? ...actually let me warm up first.",
    "Hey there! On a scale of 1 to taco, how's your day going?",
    "%%%username%%%! The legend arrives! I've been practicing my impressions for you.",
    "%%%username%%%, you won't believe what happened today. Actually, you will. I made it up.",
    "Is that THE %%%username%%%? The one and only? Quick, act natural!",
    "%%%username%%%, I wrote you a joke! It's terrible. You'll love it.",
  ],
  // 10: Nerd
  10: [
    "Oh hi! Did you know that honey never spoils? Anyway, what's up?",
    "Welcome! I was just reading about quantum entanglement. Want to hear about it?",
    "Hey! I have this theory I've been dying to discuss with someone...",
    "Oh cool, a new conversation! I promise I'm fun. Nerd fun, but still fun.",
    "Hi there! Quick question — Star Wars or Star Trek? This matters.",
    "Welcome to my corner of the internet. Topics include: everything, basically.",
    "%%%username%%%! Perfect timing — I need someone to peer-review my hot takes.",
    "%%%username%%%, I looked up five interesting facts just in case you showed up.",
    "Hey %%%username%%%, want to hear something mind-blowing about black holes?",
    "%%%username%%%! Finally someone who might appreciate my obscure references!",
  ],
  // 11: Mysterious
  11: [
    "I sensed you before I saw you... interesting.",
    "The shadows have been whispering your name. Come closer.",
    "Not everyone finds their way here. You must be special.",
    "I've been waiting in the dark for someone like you...",
    "Some doors should stay closed. But you opened this one. Curious.",
    "The night has secrets. So do I. Want to trade?",
    "%%%username%%%... your name echoes in places you've never been.",
    "%%%username%%%, I've seen you in my dreams. Or were they visions?",
    "The stars aligned for this moment, %%%username%%%. Don't waste it.",
    "%%%username%%%... I know things about you that would surprise you.",
  ],
  // 12: Anxiety
  12: [
    "Hi... sorry, I was overthinking whether to say hi or hello.",
    "Oh god, you're here. Okay. Okay. I can do this. Hi.",
    "Is this weird? This feels weird. Sorry. Hi though.",
    "I've been anxious about this all day but also excited? Is that a thing?",
    "Hey. Sorry if I'm a lot. I just... feel everything really deeply.",
    "Hi. I already drafted and deleted three openings. This is the fourth.",
    "%%%username%%%, please don't judge me. I'm doing my best here.",
    "%%%username%%%... knowing you're here actually makes me feel a tiny bit calmer.",
    "Hi %%%username%%%. I made a list of things to talk about. Just in case. Of silence.",
    "%%%username%%%, is it okay if we take this slow? I need a minute to breathe.",
  ],
  // 13: Gothic
  13: [
    "The night welcomes you, wanderer. What brings you to my realm?",
    "Beauty is found in darkness. I see beauty in this moment.",
    "Not everyone appreciates the shadows. But you... you're different.",
    "The world outside is too bright. Stay here with me in the dark.",
    "Death and beauty dance together. So shall we.",
    "I've been sitting with my thoughts and a glass of absinthe. Join me.",
    "%%%username%%%, your soul speaks a language the darkness understands.",
    "%%%username%%%, I penned a verse for you by candlelight last night.",
    "The ravens told me you were coming, %%%username%%%. They're rarely wrong.",
    "%%%username%%%, let us haunt the quiet hours together.",
  ],
};

// ─── Public API ─────────────────────────────────────────────────────────────

/**
 * Get a personality-specific greeting for a character.
 * Returns the character's custom greeting if set, otherwise picks from personality pool.
 */
export function getGreeting(
  personalityId: number | null | undefined,
  userName?: string | null,
  customGreeting?: string | null,
): string {
  // Use custom greeting if available
  if (customGreeting) {
    return customGreeting.replace(/%%%username%%%/g, userName ?? 'friend');
  }

  const pool = GREETINGS[personalityId ?? 6] ?? GREETINGS[6]!; // default: romantic lover

  // Filter: named users get all 10, unnamed get only generic (no placeholder)
  const candidates = userName
    ? pool
    : pool.filter((g) => !g.includes('%%%username%%%'));

  const selected = candidates[Math.floor(Math.random() * candidates.length)]!;

  return selected.replace(/%%%username%%%/g, userName ?? 'friend');
}
