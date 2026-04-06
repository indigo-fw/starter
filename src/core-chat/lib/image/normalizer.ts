/**
 * Keyword normalizer and text tokenizer for the prompt matching pipeline.
 * Ports Django's KeywordNormalizer (384 synonym rules) + PromptTextParser (13-step pipeline).
 *
 * Django sources:
 *   services/keyword_normalizer.py
 *   processors/prompt_text_parser.py
 */

// ---------------------------------------------------------------------------
// Phrase synonyms (multi-word → canonical, applied before word-level synonyms)
// Sorted: 3-word phrases first, then 2-word, so longer matches take priority.
// ---------------------------------------------------------------------------
const PHRASE_SYNONYMS = new Map<string, string>([
  // 3-word phrases
  ['all fours', 'doggystyle'],
  ['anal play', 'analplay'],
  ['anal sex', 'analsex'],
  ['arm pit', 'armpit'],
  ['arms up', 'armpit'],
  ['athletic bra', 'sportsbra'],
  ['ball gag', 'ballgag'],
  ['bathing suit', 'swimsuit'],
  ['bed clothes', 'pajama'],
  ['bend over', 'bent'],
  ['bending over', 'bent'],
  ['blind fold', 'blindfold'],
  ['blow job', 'blowjob'],
  ['boob under', 'underboob'],
  ['boxer briefs', 'boxerbriefs'],
  ['bra top', 'bra'],
  ['camel toe', 'cameltoe'],
  ['cat suit', 'catsuit'],
  ['close up', 'closeup'],
  ['cock sucking', 'blowjob'],
  ['corn rows', 'cornrows'],
  ['covered cumshot', 'bukkake'],
  ['covered in cumshot', 'bukkake'],
  ['covered with cumshot', 'bukkake'],
  ['cream pie', 'creampie'],
  ['crocodile style', 'crocodilestyle'],
  ['cum shot', 'cumshot'],
  ['cumshot on body', 'bukkake'],
  ['cumshot on face', 'facial'],
  ['deep throat', 'deepthroat'],
  ['dick suck', 'blowjob'],
  ['dick sucking', 'blowjob'],
  ['doggie style', 'doggystyle'],
  ['doggie style position', 'doggystyle'],
  ['doggy style', 'doggystyle'],
  ['doggy style position', 'doggystyle'],
  ['feet job', 'footjob'],
  ['feet masturbate', 'footjob'],
  ['fingerless gloves', 'gloves'],
  ['fishnet stockings', 'stockings'],
  ['frog style', 'froggystyle'],
  ['froggy style', 'froggystyle'],
  ['from behind', 'doggystyle'],
  ['full body', 'fullbody'],
  ['g string', 'thong'],
  ['giving head', 'blowjob'],
  ['halter top', 'halter'],
  ['hand cuffs', 'handcuffs'],
  ['hand job', 'masturbate'],
  ['hands behind head', 'armpit'],
  ['high heels', 'heels'],
  ['jacking off', 'masturbate'],
  ['jerk off', 'masturbate'],
  ['jerking off', 'masturbate'],
  ['latex catsuit', 'catsuit'],
  ['latex dress', 'latexdress'],
  ['leaning over', 'bent'],
  ['masturbate feet', 'footjob'],
  ['masturbate with feet', 'footjob'],
  ['micro kini', 'microkini'],
  ['mini kini', 'minikini'],
  ['mini skirt', 'miniskirt'],
  ['night clothes', 'pajama'],
  ['night dress', 'pajama'],
  ['nipple pasties', 'nipples'],
  ['no panty', 'nude'],
  ['nose ring', 'piercing'],
  ['oiled bodysuit', 'oiled'],
  ['one piece', 'onepiece'],
  ['oral sex', 'blowjob'],
  ['penis sucking', 'blowjob'],
  ['pig tails', 'twintails'],
  ['play anal', 'analplay'],
  ['plus size', 'curvy'],
  ['pony tail', 'ponytail'],
  ['pressing breasts', 'touchingbreasts'],
  ['red head', 'redhead'],
  ['reverse riding', 'reverse cowgirl'],
  ['see through', 'sheer'],
  ['sex anal', 'analsex'],
  ['sex tit', 'paizuri'],
  ['sex toy', 'dildo'],
  ['sport bra', 'sportsbra'],
  ['sports bra', 'sportsbra'],
  ['squeezing breasts', 'touchingbreasts'],
  ['standing straight', 'standingstraight'],
  ['swim suit', 'swimsuit'],
  ['t shirt', 'tshirt'],
  ['taking a leak', 'peeing'],
  ['taking leak', 'peeing'],
  ['tank top', 'tanktop'],
  ['tattoo sleeve', 'tattoo'],
  ['thigh job', 'thighjob'],
  ['throat deep', 'deepthroat'],
  ['top less', 'topless'],
  ['touching breasts', 'touchingbreasts'],
  ['touching herself', 'masturbate'],
  ['twin tails', 'twintails'],
  ['two piece', 'bikini'],
  ['under boob', 'underboob'],
  ['under boobs', 'underboob'],
  ['wet vagina', 'squirt'],
  ['whole body', 'fullbody'],
  ['wide angle', 'fullbody'],
  ['yoga pants', 'leggings'],
  ['ass hole', 'asshole'],
  ['butt hole', 'asshole'],
  ['rear end', 'ass'],
]);

// ---------------------------------------------------------------------------
// Word synonyms (single word → canonical)
// ---------------------------------------------------------------------------
const WORD_SYNONYMS = new Map<string, string>([
  ['ankle', 'feet'],
  ['ankles', 'feet'],
  ['foot', 'feet'],
  ['feets', 'feet'],
  ['legs', 'feet'],
  ['leg', 'feet'],
  ['toe', 'feet'],
  ['toes', 'feet'],
  ['sole', 'feet'],
  ['soles', 'feet'],
  ['cum', 'cumshot'],
  ['cuming', 'cumshot'],
  ['cumming', 'cumshot'],
  ['ejaculating', 'cumshot'],
  ['load', 'cumshot'],
  ['semen', 'cumshot'],
  ['fingering', 'masturbate'],
  ['handjob', 'masturbate'],
  ['jerkingoff', 'masturbate'],
  ['jerkoff', 'masturbate'],
  ['masturbading', 'masturbate'],
  ['masturbating', 'masturbate'],
  ['masturbation', 'masturbate'],
  ['jerk', 'masturbate'],
  ['riding', 'front cowgirl'],
  ['doggystyleposition', 'doggystyle'],
  ['doggy', 'doggystyle'],
  ['frogstyle', 'froggystyle'],
  ['frog', 'froggystyle'],
  ['froggy', 'froggystyle'],
  ['crocodile', 'crocodilestyle'],
  ['urinate', 'peeing'],
  ['urination', 'peeing'],
  ['pee', 'peeing'],
  ['pissing', 'peeing'],
  ['titfuck', 'paizuri'],
  ['titfucked', 'paizuri'],
  ['titfucking', 'paizuri'],
  ['sextit', 'paizuri'],
  ['boobjob', 'paizuri'],
  ['boobfuck', 'paizuri'],
  ['adult', 'nsfw'],
  ['alluring', 'sexual'],
  ['anus', 'asshole'],
  ['anal', 'asshole'],
  ['armpits', 'armpit'],
  ['backside', 'ass'],
  ['balls', 'testicle'],
  ['bare', 'nude'],
  ['bathers', 'swimsuit'],
  ['beaver', 'vagina'],
  ['bedclothes', 'pajama'],
  ['behind', 'ass'],
  ['bending', 'bend'],
  ['bent', 'bend'],
  ['bj', 'blowjob'],
  ['blond', 'blonde'],
  ['blush', 'makeup'],
  ['bodice', 'corset'],
  ['bohemian', 'boho'],
  ['bondage', 'bdsm'],
  ['boob', 'breasts'],
  ['boobs', 'breasts'],
  ['boobies', 'breasts'],
  ['booty', 'ass'],
  ['bound', 'shibari'],
  ['bralette', 'bra'],
  ['bras', 'bra'],
  ['brassiere', 'bra'],
  ['brassiers', 'bra'],
  ['brassiery', 'bra'],
  ['breast', 'breasts'],
  ['brunet', 'brunette'],
  ['bum', 'ass'],
  ['bunches', 'twintails'],
  ['butt', 'ass'],
  ['butthole', 'asshole'],
  ['chest', 'breasts'],
  ['clam', 'vagina'],
  ['clit', 'vagina'],
  ['clitoris', 'vagina'],
  ['cock', 'penis'],
  ['cocksucking', 'blowjob'],
  ['cuffs', 'handcuffs'],
  ['cunt', 'vagina'],
  ['denim', 'jeans'],
  ['derriere', 'ass'],
  ['dick', 'penis'],
  ['dicksuck', 'blowjob'],
  ['dicksucking', 'blowjob'],
  ['dong', 'penis'],
  ['dreads', 'dreadlocks'],
  ['drenched', 'wet'],
  ['drip', 'wet'],
  ['dripping', 'wet'],
  ['dungarees', 'overalls'],
  ['earings', 'piercing'],
  ['earrings', 'piercing'],
  ['explicit', 'nsfw'],
  ['eyeglasses', 'glasses'],
  ['eyeliner', 'makeup'],
  ['eyeshadow', 'makeup'],
  ['fanny', 'vagina'],
  ['fedora', 'hat'],
  ['fellatio', 'blowjob'],
  ['fetishwear', 'latex'],
  ['fringe', 'bangs'],
  ['fucking', 'sex'],
  ['fuck', 'sex'],
  ['garterbelt', 'garter'],
  ['garters', 'garter'],
  ['ginger', 'redhead'],
  ['gstring', 'thong'],
  ['gun', 'pistol'],
  ['gag', 'ballgag'],
  ['gagged', 'ballgag'],
  ['tied', 'shibari'],
  ['hawaian', 'hawaiian'],
  ['hawai', 'hawaiian'],
  ['hoody', 'hoodie'],
  ['hose', 'stockings'],
  ['hosiery', 'stockings'],
  ['hot', 'sexual'],
  ['humping', 'sex'],
  ['intercourse', 'sex'],
  ['jammies', 'pajama'],
  ['joggers', 'jogger'],
  ['jumper', 'sweater'],
  ['kitty', 'vagina'],
  ['knickers', 'panties'],
  ['latexdress', 'latexdress'],
  ['lipstick', 'makeup'],
  ['locs', 'dreadlocks'],
  ['macro', 'closeup'],
  ['mascara', 'makeup'],
  ['member', 'penis'],
  ['milkies', 'breasts'],
  ['minikins', 'minikini'],
  ['microkins', 'microkini'],
  ['moist', 'wet'],
  ['naked', 'nude'],
  ['nake', 'nude'],
  ['neglige', 'negligee'],
  ['nightclothes', 'pajama'],
  ['nightdress', 'pajama'],
  ['nightgown', 'pajama'],
  ['nightie', 'pajama'],
  ['nightwear', 'pajama'],
  ['nighty', 'pajama'],
  ['nipple', 'nipples'],
  ['nud', 'nude'],
  ['nudes', 'nude'],
  ['nudist', 'nude'],
  ['nudity', 'nude'],
  ['oral', 'blowjob'],
  ['oralsex', 'blowjob'],
  ['orgasms', 'orgasm'],
  ['pajamas', 'pajama'],
  ['pants', 'trousers'],
  ['panty', 'panties'],
  ['penetration', 'sex'],
  ['penissucking', 'blowjob'],
  ['pierced', 'piercing'],
  ['piercings', 'piercing'],
  ['pigtails', 'twintails'],
  ['pijama', 'pajama'],
  ['pijamas', 'pajama'],
  ['pyjama', 'pajama'],
  ['pyjamas', 'pajama'],
  ['pistols', 'pistol'],
  ['pj', 'pajama'],
  ['pjs', 'pajama'],
  ['platforms', 'platform'],
  ['porno', 'porn'],
  ['pornographic', 'porn'],
  ['pov', 'selfie'],
  ['prick', 'penis'],
  ['provocative', 'sexual'],
  ['pullover', 'sweater'],
  ['pussy', 'vagina'],
  ['restrained', 'bdsm'],
  ['risque', 'sexual'],
  ['rope', 'shibari'],
  ['ropes', 'shibari'],
  ['ropework', 'shibari'],
  ['rubber', 'latex'],
  ['rubbing', 'masturbate'],
  ['schlong', 'penis'],
  ['scrotum', 'testicle'],
  ['seductive', 'sexual'],
  ['sensual', 'sexual'],
  ['septum', 'piercing'],
  ['sextoy', 'dildo'],
  ['vibrator', 'dildo'],
  ['shades', 'sunglasses'],
  ['shaft', 'penis'],
  ['shagging', 'sex'],
  ['shiny', 'latex'],
  ['shirt', 'tshirt'],
  ['slacks', 'trousers'],
  ['sleepwear', 'pajama'],
  ['slender', 'slim'],
  ['sneaker', 'sneakers'],
  ['soaked', 'wet'],
  ['sexy', 'sexual'],
  ['sexyy', 'sexual'],
  ['specs', 'glasses'],
  ['spicy', 'nsfw'],
  ['squirting', 'squirt'],
  ['stiletos', 'heels'],
  ['stiletto', 'heels'],
  ['stilettos', 'heels'],
  ['stocking', 'stockings'],
  ['sucking', 'blowjob'],
  ['sunglases', 'sunglasses'],
  ['sweats', 'sweatpants'],
  ['sweatshirt', 'hoodie'],
  ['tattooed', 'tattoo'],
  ['tattoos', 'tattoo'],
  ['tee', 'tshirt'],
  ['tempting', 'sexual'],
  ['testicles', 'testicle'],
  ['thighhigh', 'stockings'],
  ['thongs', 'thong'],
  ['tie', 'shibari'],
  ['tight', 'tights'],
  ['thight', 'tights'],
  ['tit', 'breasts'],
  ['tits', 'breasts'],
  ['titties', 'breasts'],
  ['tracksuit', 'sweatpants'],
  ['trainer', 'sneakers'],
  ['transparent', 'sheer'],
  ['twat', 'vagina'],
  ['undressed', 'nude'],
  ['underboobs', 'underboob'],
  ['vulva', 'vagina'],
  ['wanking', 'masturbate'],
  ['weenie', 'penis'],
  ['wideangle', 'fullbody'],
  ['wiener', 'penis'],
  ['legging', 'leggings'],
  ['legins', 'leggings'],
  ['zoom', 'closeup'],
  ['xxx', 'nsfw'],
]);

// ---------------------------------------------------------------------------
// Stop words (merged from Django ~170 + T3 ~179, deduplicated)
// Note: "hot" and "sexy" are NOT stop words — they carry semantic meaning
// and are handled by synonym normalization (hot → sexual, sexy → sexual).
// ---------------------------------------------------------------------------
const STOP_WORDS = new Set([
  'a',
  'an',
  'the',
  'in',
  'on',
  'at',
  'to',
  'for',
  'of',
  'with',
  'and',
  'or',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'have',
  'has',
  'had',
  'do',
  'does',
  'did',
  'will',
  'would',
  'could',
  'should',
  'may',
  'might',
  'can',
  'shall',
  'it',
  'its',
  'this',
  'that',
  'these',
  'those',
  'i',
  'me',
  'my',
  'you',
  'your',
  'he',
  'she',
  'her',
  'his',
  'we',
  'they',
  'them',
  'our',
  'their',
  'show',
  'send',
  'give',
  'make',
  'take',
  'get',
  'put',
  'see',
  'look',
  'picture',
  'image',
  'photo',
  'please',
  'want',
  'like',
  'just',
  'very',
  'really',
  'some',
  'more',
  'also',
  'too',
  'not',
  'no',
  'but',
  'if',
  'then',
  'so',
  'up',
  'out',
  'about',
  'into',
  'through',
  'during',
  'before',
  'after',
  'above',
  'below',
  'from',
  'down',
  'off',
  'over',
  'under',
  'again',
  'further',
  'once',
  'here',
  'there',
  'when',
  'where',
  'why',
  'how',
  'all',
  'each',
  'every',
  'both',
  'few',
  'many',
  'most',
  'other',
  'any',
  'such',
  'only',
  'own',
  'same',
  'than',
  'while',
  'as',
  'until',
  'because',
  'since',
  'beautiful',
  'pretty',
  'cute',
  'gorgeous',
  'attractive',
  'lovely',
  'nice',
  'wearing',
  // Additional from Django
  'create',
  'generate',
  'draw',
  'need',
  'now',
  'here',
  'there',
  'going',
  'gone',
  'come',
  'came',
  'let',
  'say',
  'said',
  'tell',
  'told',
  'think',
  'know',
  'knew',
  'new',
  'old',
  'good',
  'bad',
  'big',
  'small',
  'great',
  'little',
  'much',
  'still',
  'well',
  'back',
  'even',
  'way',
  'something',
  'anything',
  'everything',
  'nothing',
  'someone',
  'anyone',
  'everyone',
  'thing',
]);

// ---------------------------------------------------------------------------
// Special case inputs that should return empty (no matching)
// ---------------------------------------------------------------------------
const EMPTY_INPUTS = new Set([
  'send photo',
  'photo',
  'image',
  'picture',
  'send image',
  'send picture',
  'generate image',
  'create image',
]);

// ---------------------------------------------------------------------------
// Color and colorable-item sets for color+item pair detection.
// In sai_flirtcam these came from VISUAL_COLORS / VISUAL_OUTFIT / VISUAL_ACCESSORIES
// enums. Here we accept them via configuration so the normalizer stays decoupled.
// ---------------------------------------------------------------------------
let colorSet: Set<string> | null = null;
let colorableItems: Set<string> | null = null;

/**
 * Configure the color+item pair detection sets.
 * Call this once at startup with your visual enum data.
 *
 * @param colors - Set of color labels (lowercase), e.g. {"red", "blue", "black"}
 * @param items - Set of colorable item tags (lowercase), e.g. {"bikini", "dress", "latex"}
 */
export function configureColorSets(
  colors: Set<string>,
  items: Set<string>
): void {
  colorSet = colors;
  colorableItems = items;
}

// ---------------------------------------------------------------------------
// Tokenize pipeline
// ---------------------------------------------------------------------------

/**
 * Full tokenization pipeline for prompt text.
 * Ported from Django's PromptTextParser (13-step) + KeywordNormalizer.
 *
 * Steps:
 * 1. Replace -, _, ' with spaces
 * 2. Remove non-alphanumeric (except spaces)
 * 3. Remove standalone numbers
 * 4. Lowercase + trim
 * 5. Handle special cases ("send photo" → empty)
 * 6. Split into words
 * 7. Remove stop words
 * 8. Apply phrase synonym normalization (multi-word → single)
 * 9. Apply word synonym normalization
 * 10. (Content moderation hook — call setCensorFilter to enable)
 * 11. Detect color+item pairs → combine
 * 12. Deduplicate (preserve first occurrence)
 * 13. Sort alphabetically
 */
export function extractKeywords(text: string): string[] {
  // 1-4. Text normalization
  const cleaned = text
    .replace(/[-_']/g, ' ') // 1. Replace -, _, ' with spaces
    .replace(/[^\w\s]/g, ' ') // 2. Remove non-alphanumeric except spaces
    .replace(/\b\d+\b/g, '') // 3. Remove standalone numbers
    .toLowerCase() // 4. Lowercase
    .trim();

  // 5. Special cases → empty
  if (EMPTY_INPUTS.has(cleaned)) return [];

  // 6. Split into words (filter empty strings)
  let words = cleaned.split(/\s+/).filter((w) => w.length > 1);

  // 7. Remove stop words
  words = words.filter((w) => !STOP_WORDS.has(w));

  if (words.length === 0) return [];

  // 8. Apply phrase synonym normalization (multi-word patterns)
  words = applyPhraseSynonyms(words);

  // 9. Apply word synonym normalization
  words = words.map((w) => WORD_SYNONYMS.get(w) ?? w);

  // Flatten any multi-word synonym results
  words = words.flatMap((w) => (w.includes(' ') ? w.split(' ') : [w]));

  // 10. Content moderation — apply censor filter if configured.
  // In sai_flirtcam this used getImageValidator(); here consumers wire their
  // own filter via setCensorFilter(). Without a filter, all words pass through.
  if (censorFilter) {
    words = words.filter((w) => censorFilter!(w));
  }

  if (words.length === 0) return [];

  // 11. Detect color+item pairs → combine (e.g. ["red", "bikini"] → ["red bikini"])
  words = detectColorItemPairs(words);

  // 12. Deduplicate (preserve first occurrence order)
  const seen = new Set<string>();
  words = words.filter((w) => {
    if (seen.has(w)) return false;
    seen.add(w);
    return true;
  });

  // 13. Sort alphabetically
  words.sort();

  return words;
}

// ---------------------------------------------------------------------------
// Content-moderation hook
// ---------------------------------------------------------------------------
let censorFilter: ((word: string) => boolean) | null = null;

/**
 * Set a content-moderation filter function.
 * The function should return `true` to KEEP the word, `false` to remove it.
 * Call with `null` to disable filtering.
 */
export function setCensorFilter(
  filter: ((word: string) => boolean) | null
): void {
  censorFilter = filter;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Apply multi-word phrase synonyms to the word array.
 * Scans for consecutive word matches, longest phrase first (3-word, 2-word).
 */
function applyPhraseSynonyms(words: string[]): string[] {
  const result: string[] = [];
  let i = 0;

  while (i < words.length) {
    // Try 3-word phrase
    if (i + 2 < words.length) {
      const phrase3 = `${words[i]} ${words[i + 1]} ${words[i + 2]}`;
      const canonical3 = PHRASE_SYNONYMS.get(phrase3);
      if (canonical3) {
        result.push(canonical3);
        i += 3;
        continue;
      }
    }

    // Try 2-word phrase
    if (i + 1 < words.length) {
      const phrase2 = `${words[i]} ${words[i + 1]}`;
      const canonical2 = PHRASE_SYNONYMS.get(phrase2);
      if (canonical2) {
        result.push(canonical2);
        i += 2;
        continue;
      }
    }

    // No phrase match — keep single word
    result.push(words[i]);
    i++;
  }

  return result;
}

/**
 * Detect adjacent color + colorable-item tokens and combine them.
 * e.g. ["red", "bikini"] → ["red bikini"]
 * e.g. ["black", "latex"] → ["black latex"]
 *
 * Requires configureColorSets() to have been called; otherwise passes through unchanged.
 */
function detectColorItemPairs(words: string[]): string[] {
  if (!colorSet || !colorableItems) return words;

  const colors = colorSet;
  const items = colorableItems;
  const result: string[] = [];
  let i = 0;

  while (i < words.length) {
    if (i + 1 < words.length) {
      // Pattern: color followed by item
      if (colors.has(words[i]!) && items.has(words[i + 1]!)) {
        result.push(`${words[i]} ${words[i + 1]}`);
        i += 2;
        continue;
      }
      // Pattern: item followed by color
      if (items.has(words[i]!) && colors.has(words[i + 1]!)) {
        result.push(`${words[i + 1]} ${words[i]}`);
        i += 2;
        continue;
      }
    }
    result.push(words[i]!);
    i++;
  }

  return result;
}
