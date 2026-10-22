// Exam content + proctoring rules. Rules screen and exam logic both read from here.

export const RULES = {
  focusGraceS: 3,       // seconds outside the exam window before UFM
  quitGraceS: 5,        // seconds to return after a quit attempt before UFM
  maxAudioWarnings: 3,  // the 3rd background-audio warning is UFM
  maxFaceWarnings: 3,   // the 3rd camera warning (no face 5 s / 2+ faces 2 s) is UFM
  snapshotEveryS: 10,   // camera + screen capture interval
}

export const EXAM = {
  title: 'Computer Science Fundamentals',
  durationMin: 30,
  // ponytail: answers live in the client for now; move grading to a server before real use
  questions: [
    {
      id: 'q1',
      text: 'What is the time complexity of binary search on a sorted array of n elements?',
      options: ['O(n)', 'O(log n)', 'O(n log n)', 'O(1)'],
      answer: 1,
    },
    {
      id: 'q2',
      text: 'Which data structure follows the First-In-First-Out (FIFO) principle?',
      options: ['Stack', 'Queue', 'Binary tree', 'Hash map'],
      answer: 1,
    },
    {
      id: 'q3',
      text: 'In Electron, which process has direct access to Node.js and operating-system APIs?',
      options: ['Renderer process', 'Main process', 'GPU process', 'Utility process'],
      answer: 1,
    },
    {
      id: 'q4',
      text: 'Which HTTP status code means the requested resource was not found?',
      options: ['200', '301', '404', '500'],
      answer: 2,
    },
    {
      id: 'q5',
      text: 'What does SQL stand for?',
      options: ['Structured Query Language', 'Simple Question Language', 'Sequential Query Logic', 'Server Query Layer'],
      answer: 0,
    },
  ],
}
