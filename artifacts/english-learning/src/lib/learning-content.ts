import type {
  LearningContentInput,
  LearningContentLevel,
} from '@workspace/api-client-react';

export type LearnContent = LearningContentInput;
export const LEARNING_CONTENT_UPDATED_EVENT = 'learning-content-updated';

export const defaultLearningContent: Record<LearningContentLevel, LearnContent> = {
  Beginner: {
    word: 'serendipity',
    pronunciation: '/ˌserənˈdipitē/',
    partOfSpeech: 'noun',
    shortMeaning: '뜻밖의 행운',
    meaningDetail: '준비하지 않았지만 우연히 좋은 것을 만나는 순간이에요.',
    englishDefinition: 'a happy discovery by chance',
    exampleSentence: 'I stumbled upon a little café.',
    exampleKorean: '작은 카페를 우연히 발견했어.',
    quizOptions: ['계획된 만남', '뜻밖의 행운', '오래된 기억', '작은 실수'],
    correctMeaning: '뜻밖의 행운',
    tip: '카페에서 우연히 좋은 장소를 발견했을 때, “I stumbled upon...”으로 문장을 시작해보세요.',
  },
  Intermediate: {
    word: 'serendipity',
    pronunciation: '/ˌserənˈdipitē/',
    partOfSpeech: 'noun',
    shortMeaning: '뜻밖의 행운',
    meaningDetail: '준비하지 않았지만 우연히 좋은 것을 만나는 순간이에요.',
    englishDefinition: 'a happy discovery by chance',
    exampleSentence: 'I stumbled upon a little café.',
    exampleKorean: '작은 카페를 우연히 발견했어.',
    quizOptions: ['계획된 만남', '뜻밖의 행운', '오래된 기억', '작은 실수'],
    correctMeaning: '뜻밖의 행운',
    tip: '카페에서 우연히 좋은 장소를 발견했을 때, “I stumbled upon...”으로 문장을 시작해보세요.',
  },
  Advanced: {
    word: 'serendipity',
    pronunciation: '/ˌserənˈdipitē/',
    partOfSpeech: 'noun',
    shortMeaning: '뜻밖의 행운',
    meaningDetail: '준비하지 않았지만 우연히 좋은 것을 만나는 순간이에요.',
    englishDefinition: 'a happy discovery by chance',
    exampleSentence: 'I stumbled upon a little café.',
    exampleKorean: '작은 카페를 우연히 발견했어.',
    quizOptions: ['계획된 만남', '뜻밖의 행운', '오래된 기억', '작은 실수'],
    correctMeaning: '뜻밖의 행운',
    tip: '카페에서 우연히 좋은 장소를 발견했을 때, “I stumbled upon...”으로 문장을 시작해보세요.',
  },
};

export function getDefaultLearningContent(level: LearningContentLevel): LearnContent {
  return defaultLearningContent[level];
}