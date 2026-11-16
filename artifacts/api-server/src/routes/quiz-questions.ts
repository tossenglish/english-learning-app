export type QuizQuestion = {
  id: string;
  text: string;
  choices: string[];
  answer: number;
  explanation: string;
};

export const quizQuestions: QuizQuestion[] = [
  {
    id: "q1",
    text: "3 + 4 는 얼마일까요?",
    choices: ["5", "6", "7", "8"],
    answer: 2,
    explanation: "3에 4를 더하면 7입니다.",
  },
  {
    id: "q2",
    text: "우리나라의 수도는 어디일까요?",
    choices: ["부산", "서울", "대전", "광주"],
    answer: 1,
    explanation: "대한민국의 수도는 서울입니다.",
  },
  {
    id: "q3",
    text: "물이 얼면 무엇이 될까요?",
    choices: ["수증기", "얼음", "구름", "비"],
    answer: 1,
    explanation: "물이 0℃ 이하로 내려가면 얼음이 됩니다.",
  },
];
