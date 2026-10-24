import { z } from 'zod/v4';
import { generateShortDomains, normalizeDomainSuffix, shortSearchSchema } from './shortnames.js';

export const prepareDomainSearchSchema = z.object({
  project: z.string().trim().min(1).describe('What the project does and what users gain; reuse context already supplied.'),
  audience: z.string().trim().min(1).optional(),
  language: z.string().trim().min(1).optional(),
  namingStyles: z.array(z.enum([
    'descriptive', 'suggestive', 'metaphorical', 'playful', 'invented', 'domain_phrase', 'mixed',
  ])).optional(),
  tlds: z.array(z.string().trim().min(1)).optional(),
  tldPreference: z.enum(['required', 'preferred']).optional(),
  priority: z.enum(['balanced', 'shortest', 'clarity', 'brand', 'price']).optional(),
  budget: z.object({
    purchase: z.number().nonnegative().optional(),
    renewal: z.number().nonnegative().optional(),
    currency: z.string().trim().min(1),
  }).optional(),
  allowPremium: z.boolean().optional(),
  allowAftermarket: z.boolean().optional(),
  favorites: z.array(z.string()).default([]),
  rejected: z.array(z.string()).default([]),
  shortSearch: shortSearchSchema.optional(),
});
export type PrepareDomainSearchInput = z.input<typeof prepareDomainSearchSchema>;
type UseCase = 'shortener' | 'second_brain' | 'teaching' | 'ai_news' | 'general';
type Question = { field: string; importance: 'primary' | 'optional'; prompt: string; choices?: string[] };
type Direction = { theme: string; benefit: string; roots: string[] };

function classify(project: string): UseCase {
  if (/short[ -]?url|url[ -]?short|link[ -]?short|short links?|korte links?|linkforkort/i.test(project)) return 'shortener';
  if (/second[ -]brain|anden hjerne|personal knowledge|knowledge (base|management)|bookmark|bogm[æa]rke/i.test(project)) return 'second_brain';
  if (/(\bai\b|artificial intelligence|kunstig intelligens)/i.test(project) && /news|nyhed|editorial|publication/i.test(project)) return 'ai_news';
  if (/teach|learn|tutor|classroom|education|undervis|l[æa]ring|lektie/i.test(project)) return 'teaching';
  return 'general';
}

const directions: Record<UseCase, Direction[]> = {
  shortener: [
    { theme: 'Movement', benefit: 'Get someone to the destination quickly', roots: ['hop', 'go', 'zip', 'pass'] },
    { theme: 'Connection', benefit: 'Make something easy to share', roots: ['link', 'join', 'bridge', 'hand'] },
    { theme: 'Compression', benefit: 'Keep the address compact', roots: ['bit', 'dot', 'pin', 'tiny'] },
    { theme: 'Useful sound', benefit: 'A short label someone can say and retype', roots: ['pronounceable patterns', 'familiar abbreviations', 'domain phrases'] },
  ],
  second_brain: [
    { theme: 'Capture', benefit: 'Keep something before it disappears', roots: ['pocket', 'basket', 'net', 'catch'] },
    { theme: 'Recall', benefit: 'Bring an idea back when needed', roots: ['echo', 'trace', 'imprint', 'remember'] },
    { theme: 'Connection', benefit: 'See relationships between ideas', roots: ['thread', 'weave', 'constellation'] },
    { theme: 'Rediscovery', benefit: 'Find the useful thought at the right moment', roots: ['compass', 'lantern', 'trail'] },
    { theme: 'Cultivation', benefit: 'Develop ideas over time', roots: ['seed', 'grove', 'garden'] },
    { theme: 'Personal space', benefit: 'A place that feels like your own', roots: ['desk', 'room', 'shelf'] },
  ],
  teaching: [
    { theme: 'Clarity', benefit: 'Make a difficult idea understandable', roots: ['light', 'clear', 'lens', 'aha'] },
    { theme: 'Progress', benefit: 'Help learners move forward', roots: ['step', 'path', 'rise', 'grow'] },
    { theme: 'Curiosity', benefit: 'Make discovery inviting', roots: ['spark', 'wonder', 'quest'] },
    { theme: 'Practice', benefit: 'Build understanding through doing', roots: ['try', 'craft', 'repeat'] },
    { theme: 'Guidance', benefit: 'Give teachers or learners the right support', roots: ['guide', 'compass', 'scaffold'] },
  ],
  ai_news: [
    { theme: 'Daily orientation', benefit: 'Understand what changed', roots: ['brief', 'today', 'dagens', 'overblik'] },
    { theme: 'Observation', benefit: 'See developments clearly', roots: ['lens', 'outlook', 'udsyn', 'kikkert'] },
    { theme: 'Signal', benefit: 'Find developments that matter', roots: ['signal', 'pulse', 'pejling', 'puls'] },
    { theme: 'Editorial identity', benefit: 'A publication with a recognizable voice', roots: ['dispatch', 'journal', 'post', 'indsigt'] },
  ],
  general: [
    { theme: 'User outcome', benefit: 'Name the improvement users experience', roots: ['the task completed', 'time saved', 'new ability'] },
    { theme: 'Action', benefit: 'Express what people do with the product', roots: ['the central verb', 'the useful interaction'] },
    { theme: 'Metaphor', benefit: 'Borrow a meaningful familiar association', roots: ['objects', 'places', 'movement', 'nature'] },
    { theme: 'Distinctive sound', benefit: 'Give the product a memorable identity', roots: ['pronounceable coinages', 'compact compounds'] },
  ],
};

const examples: Record<UseCase, string[]> = {
  second_brain: ['SecondBrainNotes', 'RecallNest', 'Lantern', 'BrainCrumb', 'Veluno', 'husk.at'],
  teaching: ['LessonPlanner', 'LearningTrail', 'Spark', 'LessonLlama', 'Talivo', 'learn.to'],
  ai_news: ['AINyheder', 'DagensAI', 'Udsyn', 'Robotposten', 'Nuvio', 'ai.nu'],
  shortener: ['ShortLinks', 'QuickHop', 'Pin', 'Linklet', 'Zivo', 'go.to'],
  general: ['A literal product description', 'A benefit-led compound', 'A relevant metaphor', 'A playful combination', 'A pronounceable new word', 'A phrase across the dot'],
};

export function prepareDomainSearch(raw: PrepareDomainSearchInput) {
  const input = prepareDomainSearchSchema.parse(raw);
  const useCase = classify(input.project);
  const styles = [...new Set(input.namingStyles ?? [])];
  const tlds = [...new Set((input.tlds ?? input.shortSearch?.tlds ?? []).map(normalizeDomainSuffix))];
  if (input.shortSearch && input.tldPreference === 'required' && tlds.length &&
      input.shortSearch.tlds.some(tld => !tlds.includes(normalizeDomainSuffix(tld)))) {
    throw new Error('The shortSearch suffixes must respect the explicitly required tlds. Update the suffixes or mark the preference as preferred.');
  }
  const questions: Question[] = [];
  const exampleNames = examples[useCase];
  if (!styles.length) questions.push({
    field: 'namingStyles', importance: 'primary',
    prompt: 'Which naming direction should I explore? Choose one or a mixture; examples illustrate style and have untested availability.',
    choices: [
      `Descriptive — ${exampleNames[0]}`, `Suggestive — ${exampleNames[1]}`,
      `Metaphorical — ${exampleNames[2]}`, `Playful — ${exampleNames[3]}`,
      `Invented — ${exampleNames[4]}`, `Domain phrase — ${exampleNames[5]}`, 'Show me a mixed first pass',
    ],
  });
  if (!input.audience && useCase === 'teaching') questions.push({
    field: 'audience', importance: 'primary',
    prompt: 'Who uses the teaching app, and for which task: teachers planning lessons, learners studying, or tutors teaching?',
  });
  if (useCase === 'general' && /^(xyz|an? app|a project|project|something)[.!?]*$/i.test(input.project)) questions.push({
    field: 'project', importance: 'primary', prompt: 'What will the product help people do, and who is it for?',
  });
  if (!input.language) questions.push({
    field: 'language', importance: 'optional', prompt: 'Which language and market should the name work for?',
  });
  if (!tlds.length) questions.push({
    field: 'tlds', importance: 'optional', prompt: 'Do you require a particular ending, prefer some endings, or want fitting alternatives?',
  });
  if (!input.budget) questions.push({
    field: 'budget', importance: 'optional', prompt: 'Any initial purchase or renewal budget? Otherwise I can show the quoted prices alongside the names.',
  });
  if ((useCase === 'shortener' || input.priority === 'shortest') &&
      (input.allowPremium === undefined || input.allowAftermarket === undefined)) questions.push({
    field: 'acquisition', importance: 'optional',
    prompt: 'For very short names, should I focus on ordinary registrations or also consider premium-priced and resale names?',
  });
  const priority = input.priority ?? (useCase === 'shortener' || input.shortSearch ? 'shortest' : 'balanced');
  const proposedDefaults = input.priority ? [] : [{
    field: 'priority', value: priority, basis: priority === 'shortest' ? 'Working objective for a short-domain search; confirm attractiveness and price tradeoffs.' : 'Working objective until a stronger preference is supplied.',
  }];
  return {
    nextAction: questions.some(question => question.importance === 'primary') ? 'ask_preferences' : 'generate_candidates',
    brief: { ...input, namingStyles: styles, tlds, priority, shortSearch: undefined },
    proposedDefaults,
    questions,
    conversationGuidance: 'Reuse answers already present in the conversation. Ask the primary questions together in a short turn; include optional questions only when they materially change this search. A mixed first pass is a valid preference.',
    useCase,
    directions: directions[useCase],
    generationGuidance: [
      'Treat directions and roots as seeds, not a word list. Write names native speakers of the requested language would use; examples and roots are unchecked.',
      'Cover at least four directions for a mixed style and three within a single style. No more than a quarter of a wave may share a root, prefix or suffix.',
      'Vary constructions: descriptive, benefit compound, borrowed word, altered word, blend, coinage, phrase across the dot. Keep a direction and a one-line reason with each name.',
      'Screen before checking: drop names that are hard to spell when heard, read two ways, are long for what they carry, misfit the audience, or imitate a known brand.',
      'Size the wave by source speed: 25-50 names in one check_domains call for fast endings such as .com; the best 15-20 for .dk, .nl, .be and WHOIS-only endings, with maxWaitMs about 1200 per name. DNS screening returns likely_taken for names in use there; treat it as taken.',
      'Apply required endings strictly. For preferred endings, check alternatives only for strong labels that are taken there, and mark them as alternatives. Keep unstated budgets open.',
      'After each check, move the next wave towards constructions and endings that came back open, and towards the user\'s favorites. Do not recheck names except finalists with fresh=true.',
      'Present a recommendation, then three to seven names with why each fits, status, source and check time, and price with currency and period. Only available means registrable.',
    ],
    feedback: { favorites: input.favorites, rejected: input.rejected },
    priceHandling: 'Use only user-supplied budget constraints. Compare currencies and quoted periods explicitly; keep unknown prices or renewal periods visible.',
    ...(priority === 'shortest' ? { shortNameGuidance: [
      'Compare complete ASCII hostname length including the suffix and dot, alongside pronunciation, readability, and renewal price.',
      'Choose acceptable suffixes and C/V/L/D patterns, then request shortSearch pages. Pattern pages are unverified and preserve a defined search scope.',
      'Describe a result as shortest found within the explored scope unless all smaller eligible names in the agreed scope were checked.',
    ] } : {}),
    ...(input.shortSearch ? { shortSearch: generateShortDomains(input.shortSearch) } : {}),
  };
}
