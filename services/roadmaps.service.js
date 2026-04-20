import { getQuestionsForTopic, normalizeTopicName } from './question-bank.service.js';

export const ROADMAP_LIBRARY = [
  {
    id: 'dsa-foundation-30',
    slug: 'dsa-foundation-30',
    title: 'DSA Foundation Roadmap',
    description: 'Best for users jinko basics se structured DSA journey start karni hai.',
    durationDays: 30,
    level: 'Beginner',
    mode: 'Predefined',
    startTopics: ['Arrays', 'Strings', 'Recursion', 'Linked List'],
    milestones: [
      'Array basics to pattern building',
      'Binary Search + Two Pointers + Sliding Window',
      'Linked List, Stack, Queue, Recursion',
      'Tree, Heap, Graph basics + revision'
    ],
    tree: [
      {
        name: 'Arrays',
        children: ['Basics', 'Traversal', 'Prefix Sum', 'Two Pointers', 'Sliding Window']
      },
      {
        name: 'Strings',
        children: ['Basics', 'Frequency Count', 'Two Pointers', 'Hashing']
      },
      {
        name: 'Binary Search',
        children: ['1D Search', 'Answer Search', 'Bounds', 'Rotated Array']
      },
      {
        name: 'Linked List',
        children: ['Singly List', 'Fast Slow Pointers', 'Reverse', 'Cycle']
      },
      {
        name: 'Recursion',
        children: ['Base Case', 'Backtracking Intro', 'Subset Pattern']
      },
      {
        name: 'Tree',
        children: ['Traversals', 'BFS', 'DFS', 'BST Basics']
      },
      {
        name: 'Graph',
        children: ['Graph Basics', 'BFS', 'DFS', 'Topological Sort']
      }
    ]
  },
  {
    id: 'dsa-interview-15',
    slug: 'dsa-interview-15',
    title: '15 Day Interview Sprint',
    description: 'Fast-paced roadmap for revision, interview readiness and pattern repetition.',
    durationDays: 15,
    level: 'Intermediate',
    mode: 'Predefined',
    startTopics: ['Arrays', 'Binary Search', 'Sliding Window'],
    milestones: [
      'High-frequency array + string patterns',
      'Binary Search and heaps',
      'Linked List + Trees',
      'Greedy + Graph overview + mock review'
    ],
    tree: [
      {
        name: 'Arrays',
        children: ['Easy Patterns', 'Kadane', 'Intervals']
      },
      {
        name: 'Strings',
        children: ['Hashing', 'Sliding Window', 'Palindrome']
      },
      {
        name: 'Trees',
        children: ['Traversal', 'BFS', 'DFS', 'BST Basics']
      },
      {
        name: 'Graphs',
        children: ['BFS', 'DFS', 'Topological Sort']
      },
      {
        name: 'Dynamic Programming',
        children: ['1D DP', 'Knapsack Intro', 'LCS Pattern']
      }
    ]
  },
  {
    id: 'custom-ai-planner',
    slug: 'custom-ai-planner',
    title: 'Custom AI Planner',
    description: 'User apni current skill, known topics aur target days ke hisab se custom course banayega.',
    durationDays: 21,
    level: 'Flexible',
    mode: 'Custom',
    startTopics: ['Choose Yourself'],
    milestones: [
      'Assess known concepts',
      'Build a custom sequence',
      'Inject AI-backed suggestions',
      'Adapt difficulty from mistakes'
    ],
    tree: [
      {
        name: 'Assessment',
        children: ['Known Topics', 'Weak Topics', 'Target Role']
      },
      {
        name: 'Planner',
        children: ['Duration', 'Start Topic', 'Pattern Balance']
      },
      {
        name: 'AI Suggestions',
        children: ['Topic Order', 'LC Recommendations', 'Revision Loops']
      }
    ]
  }
];

export const TOPIC_LIBRARY = [
  { name: 'Array', count: 2141 },
  { name: 'String', count: 867 },
  { name: 'Hash Table', count: 808 },
  { name: 'Math', count: 666 },
  { name: 'Dynamic Programming', count: 652 },
  { name: 'Sorting', count: 512 },
  { name: 'Greedy', count: 460 },
  { name: 'Depth-First Search', count: 337 },
  { name: 'Binary Search', count: 333 },
  { name: 'Database', count: 310 },
  { name: 'Bit Manipulation', count: 281 },
  { name: 'Matrix', count: 273 },
  { name: 'Tree', count: 261 },
  { name: 'Breadth-First Search', count: 255 },
  { name: 'Two Pointers', count: 251 },
  { name: 'Prefix Sum', count: 242 },
  { name: 'Heap', count: 214 },
  { name: 'Simulation', count: 207 },
  { name: 'Counting', count: 203 },
  { name: 'Graph Theory', count: 181 },
  { name: 'Binary Tree', count: 179 },
  { name: 'Stack', count: 179 },
  { name: 'Sliding Window', count: 164 },
  { name: 'Design', count: 136 },
  { name: 'Backtracking', count: 113 },
  { name: 'Union Find', count: 99 },
  { name: 'Number Theory', count: 94 },
  { name: 'Linked List', count: 82 },
  { name: 'Ordered Set', count: 76 },
  { name: 'Segment Tree', count: 75 },
  { name: 'Monotonic Stack', count: 73 },
  { name: 'Recursion', count: 51 }
];

export function getRoadmapBySlug(slug) {
  return ROADMAP_LIBRARY.find((item) => item.slug === slug) || null;
}

export function buildStarterTasks({ roadmap, targetDays, startTopic, currentLevel = 'Beginner', knownTopics = [] }) {
  const normalizedKnownTopics = (knownTopics || []).map((item) => normalizeTopicName(item));

  const flattened = roadmap.tree.flatMap((group) => {
    const normalizedGroup = normalizeTopicName(group.name);
    const practiceQuestions = getQuestionsForTopic(normalizedGroup, currentLevel, 6);

    return group.children.map((child, index) => ({
      topic: normalizedGroup,
      subtopic: child,
      taskTitle: `${normalizedGroup} • ${child}`,
      taskType: index % 2 === 0 ? 'practice' : 'revision',
      problemRef: practiceQuestions[index % practiceQuestions.length]?.url || `https://leetcode.com/problemset/?topicSlugs=${encodeURIComponent(normalizedGroup.toLowerCase().replace(/\s+/g, '-'))}`,
      difficulty: practiceQuestions[index % practiceQuestions.length]?.difficulty || 'easy'
    }));
  });

  const withoutKnown = flattened.filter((item) => !normalizedKnownTopics.includes(item.topic));
  const basePool = withoutKnown.length ? withoutKnown : flattened;
  const preferred = basePool.filter((item) => item.topic.toLowerCase() === normalizeTopicName(startTopic).toLowerCase());
  const others = basePool.filter((item) => item.topic.toLowerCase() !== normalizeTopicName(startTopic).toLowerCase());
  const ordered = [...preferred, ...others];

  return ordered
    .slice(0, Math.max(7, Math.min(targetDays, ordered.length)))
    .map((item, index) => ({
      dayNumber: index + 1,
      topicName: item.topic,
      subtopicName: item.subtopic,
      taskTitle: item.taskTitle,
      taskType: item.taskType,
      problemRef: item.problemRef,
      status: 'pending',
      difficulty: item.difficulty
    }));
}
